import * as admin from 'firebase-admin';
import { query } from '../db/client';
import { getFirebaseConfig } from '../config/secrets';

/**
 * Push Notification Service
 * Handles FCM initialization and sending notifications with graceful fallback and token cleanup.
 */
class PushNotificationService {
  private static instance: PushNotificationService;
  private initialized: boolean = false;
  private disabled: boolean = getFirebaseConfig().disabled;

  private constructor() {
    this.initialize();
  }

  public static getInstance(): PushNotificationService {
    if (!PushNotificationService.instance) {
      PushNotificationService.instance = new PushNotificationService();
    }
    return PushNotificationService.instance;
  }

  private async initialize() {
    // Import isTest dynamically to avoid circular dependency if possible, or just standard import
    // But better to use process.env to be safe and simple
    if (process.env.NODE_ENV === 'test' || this.disabled) {
      console.log('[PushService] Notifications disabled (Test Mode or Config).');
      this.disabled = true;
      return;
    }

    try {
      // First check if push is globally disabled in database settings
      const globalSetting = await query("SELECT value FROM settings WHERE key = 'push_enabled_global'");
      if (globalSetting.rows.length > 0 && globalSetting.rows[0].value === 'false') {
        console.log('[PushService] Push notifications disabled via admin settings (push_enabled_global = false).');
        this.disabled = true;
        return;
      }

      // 1. Try Environment Variables/Config first (Legacy/Fallback)
      const config = getFirebaseConfig();
      let serviceAccount: any = null;
      let initSource = '';

      if (config.serviceAccountJson) {
        serviceAccount = JSON.parse(config.serviceAccountJson);
        initSource = 'JSON env var';
      } else if (config.serviceAccountPath) {
        serviceAccount = config.serviceAccountPath; // administrative SDK handles path too
        initSource = `path: ${config.serviceAccountPath}`;
      }

      // 2. Try Database Settings (Override)
      const dbSettings = await query(
        "SELECT key, value FROM settings WHERE key IN ('push_service_account_json', 'push_service_account_path')"
      );

      const jsonSetting = dbSettings.rows.find(r => r.key === 'push_service_account_json')?.value;
      const pathSetting = dbSettings.rows.find(r => r.key === 'push_service_account_path')?.value;

      if (jsonSetting) {
        // We need to decrypt it. Note: pushNotifications.ts doesn't have decryption logic yet.
        // It's better to keep decryption logic in a central utility, but for now let's just 
        // rely on the fact that if it's in DB, we use it.
        // ACTUALLY: pushNotifications.ts is a service, it shouldn't depend on routes/admin/settings.
        // I should probably move encryption/decryption to a shared util.
        // For Phase 1 of this fix, I'll assume it's correctly handled if I add the logic here.
      }

      if (serviceAccount || jsonSetting || pathSetting) {
        // If already initialized, we might need to deleteApp first
        if (admin.apps.length > 0) {
          await admin.app().delete();
        }

        // Priority logic for DB
        if (jsonSetting) {
            // Decryption logic below (stolen from settings.ts for now, should be unified later)
            const decrypted = this.decrypt(jsonSetting);
            serviceAccount = JSON.parse(decrypted);
            initSource = 'Database (JSON)';
        } else if (pathSetting) {
            serviceAccount = pathSetting;
            initSource = `Database (path: ${pathSetting})`;
        }

        if (serviceAccount) {
            admin.initializeApp({
                credential: typeof serviceAccount === 'string' 
                    ? admin.credential.cert(serviceAccount)
                    : admin.credential.cert(serviceAccount),
            });
            this.initialized = true;
            console.log(`[PushService] Firebase Admin SDK initialized from ${initSource}.`);
        }
      } else {
        console.warn('[PushService] Firebase credentials missing (ENV or DB). Push notifications will be disabled.');
      }
    } catch (error) {
      console.error('[PushService] Failed to initialize Firebase Admin SDK:', error);
      this.initialized = false;
    }
  }

  /**
   * Re-initialize the service (useful when settings change)
   */
  public async reinitialize() {
    this.initialized = false;
    await this.initialize();
  }

  private decrypt(encryptedKey: string): string {
    const { getApiKeyEncryptionSecret } = require('../config/secrets');
    const ENCRYPTION_KEY = getApiKeyEncryptionSecret();
    const DERIVED_KEY = require('crypto').createHash('sha256').update(ENCRYPTION_KEY).digest();
    const parts = encryptedKey.split(':');
    if (parts.length !== 2) return '';
    const iv = Buffer.from(parts[0], 'hex');
    const encryptedText = parts[1];
    const decipher = require('crypto').createDecipheriv('aes-256-cbc', DERIVED_KEY, iv);
    let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }

  /**
   * Send notification to a list of tokens
   */
  public async sendToTokens(
    tokens: string[],
    payload: { title: string; body: string; data?: Record<string, string> }
  ): Promise<{ successCount: number; failureCount: number }> {
    if (!this.initialized || tokens.length === 0) {
      return { successCount: 0, failureCount: tokens.length };
    }

    // Batch tokens in chunks of 500 (FCM limit)
    const chunks = [];
    for (let i = 0; i < tokens.length; i += 500) {
      chunks.push(tokens.slice(i, i + 500));
    }

    let totalSuccess = 0;
    let totalFailure = 0;

    for (const chunk of chunks) {
      try {
        const message: admin.messaging.MulticastMessage = {
          tokens: chunk,
          notification: {
            title: payload.title,
            body: payload.body,
          },
          data: payload.data,
          android: {
            priority: 'high',
            notification: {
              sound: 'default',
              clickAction: 'FLUTTER_NOTIFICATION_CLICK',
            },
          },
          apns: {
            payload: {
              aps: {
                sound: 'default',
                badge: 1,
              },
            },
          },
        };

        const response = await admin.messaging().sendEachForMulticast(message);
        totalSuccess += response.successCount;
        totalFailure += response.failureCount;

        // Cleanup invalid tokens
        if (response.failureCount > 0) {
          const tokensToRemove: string[] = [];
          response.responses.forEach((res, index) => {
            if (!res.success && res.error) {
              const code = res.error.code;
              if (
                code === 'messaging/invalid-registration-token' ||
                code === 'messaging/registration-token-not-registered'
              ) {
                tokensToRemove.push(chunk[index]);
              }
            }
          });

          if (tokensToRemove.length > 0) {
            await this.cleanupTokens(tokensToRemove);
          }
        }
      } catch (error) {
        console.error('[PushService] Error sending batch:', error);
        totalFailure += chunk.length;
      }
    }

    return { successCount: totalSuccess, failureCount: totalFailure };
  }

  private async cleanupTokens(tokens: string[]) {
    try {
      await query('DELETE FROM device_tokens WHERE token = ANY($1)', [tokens]);
      console.log(`[PushService] Cleaned up ${tokens.length} invalid tokens.`);
    } catch (error) {
      console.error('[PushService] Failed to cleanup invalid tokens:', error);
    }
  }

  /**
   * Helper to check admin settings
   */
  private async isPushEnabled(key: 'push_enabled_global' | 'push_enabled_polls' | 'push_enabled_messages'): Promise<boolean> {
    try {
      const res = await query('SELECT value FROM settings WHERE key = $1', [key]);
      if (res.rows.length === 0) return true; // Default to enabled
      return res.rows[0].value === 'true';
    } catch (error) {
      console.error(`[PushService] Error checking setting ${key}:`, error);
      return true;
    }
  }

  /**
   * Send notification for a new poll
   */
  public async notifyPollPublished(pollId: string, title: string) {
    if (this.disabled) return;

    setImmediate(async () => {
      try {
        const globalEnabled = await this.isPushEnabled('push_enabled_global');
        const pollEnabled = await this.isPushEnabled('push_enabled_polls');
        if (!globalEnabled || !pollEnabled) return;

        // Fetch tokens for users who have pushes enabled (globally and for polls)
        // We also filter by users.notifications_enabled master switch
        const res = await query(`
          SELECT dt.token 
          FROM device_tokens dt
          JOIN users u ON dt.user_id = u.id
          WHERE u.notifications_enabled = true
            AND dt.enabled = true
            AND dt.polls_enabled = true
        `);

        const tokens = res.rows.map(r => r.token);
        if (tokens.length > 0) {
          console.log(`[PushService] Sending poll notification to ${tokens.length} tokens.`);
          await this.sendToTokens(tokens, {
            title: 'New poll is live',
            body: title,
            data: {
              type: 'poll_published',
              pollId,
            },
          });
        }
      } catch (error) {
        console.error('[PushService] Error in notifyPollPublished:', error);
      }
    });
  }

  /**
   * Send notification for a new message
   */
  public async notifyMessagePublished(messageId: string, title: string, body: string) {
    if (this.disabled) return;

    setImmediate(async () => {
      try {
        const globalEnabled = await this.isPushEnabled('push_enabled_global');
        const msgEnabled = await this.isPushEnabled('push_enabled_messages');
        if (!globalEnabled || !msgEnabled) return;

        const res = await query(`
          SELECT dt.token 
          FROM device_tokens dt
          JOIN users u ON dt.user_id = u.id
          WHERE u.notifications_enabled = true
            AND dt.enabled = true
            AND dt.messages_enabled = true
        `);

        const tokens = res.rows.map(r => r.token);
        if (tokens.length > 0) {
          console.log(`[PushService] Sending message notification to ${tokens.length} tokens.`);
          await this.sendToTokens(tokens, {
            title: title,
            body: body.substring(0, 120),
            data: {
              type: 'message_published',
              messageId,
            },
          });
        }
      } catch (error) {
        console.error('[PushService] Error in notifyMessagePublished:', error);
      }
    });
  }
  /**
   * Gracefully shut down the service
   */
  public async shutdown() {
    if (this.initialized && admin.apps.length > 0) {
      try {
        await admin.app().delete();
        this.initialized = false;
        console.log('[PushService] Firebase Admin SDK shut down.');
      } catch (error) {
        console.error('[PushService] Error shutting down:', error);
      }
    }
  }
}

export const pushService = PushNotificationService.getInstance();
