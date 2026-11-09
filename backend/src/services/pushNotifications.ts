import { readFile } from 'node:fs/promises';
import { GoogleAuth } from 'google-auth-library';
import { query } from '../db/client';
import { getFirebaseConfig } from '../config/secrets';
import { decryptSensitiveValue } from './secretEncryption';

interface ServiceAccountCredentials {
  client_email: string;
  private_key: string;
  project_id: string;
  [key: string]: unknown;
}

interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
}

interface FcmSendResult {
  success: boolean;
  invalidToken: boolean;
}

/**
 * Minimal FCM HTTP v1 client.
 *
 * Keeping this service on OAuth2 + the HTTP v1 endpoint avoids importing the
 * full Firebase Admin SDK (and its unrelated database/storage dependency tree).
 */
class PushNotificationService {
  private static instance: PushNotificationService;
  private initialized = false;
  private disabled = getFirebaseConfig().disabled;
  private auth: GoogleAuth | null = null;
  private projectId: string | null = null;

  private constructor() {
    void this.initialize();
  }

  public static getInstance(): PushNotificationService {
    if (!PushNotificationService.instance) {
      PushNotificationService.instance = new PushNotificationService();
    }
    return PushNotificationService.instance;
  }

  private async initialize(): Promise<void> {
    this.initialized = false;
    this.auth = null;
    this.projectId = null;
    this.disabled = getFirebaseConfig().disabled;

    if (process.env.NODE_ENV === 'test' || this.disabled) {
      this.disabled = true;
      return;
    }

    try {
      const globalSetting = await query(
        "SELECT value FROM settings WHERE key = 'push_enabled_global'"
      );
      if (globalSetting.rows[0]?.value === 'false') return;

      const credentials = await this.loadCredentials();
      if (!credentials) {
        console.warn('[PushService] FCM service-account credentials are missing.');
        return;
      }

      if (!credentials.client_email || !credentials.private_key || !credentials.project_id) {
        throw new Error('FCM service account is missing client_email, private_key, or project_id');
      }

      credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');
      this.auth = new GoogleAuth({
        credentials,
        scopes: ['https://www.googleapis.com/auth/firebase.messaging'],
      });
      this.projectId = credentials.project_id;

      // Parse and validate credentials now; token retrieval remains lazy.
      await this.auth.getClient();
      this.initialized = true;
      console.log('[PushService] FCM HTTP v1 client initialized.');
    } catch (error) {
      console.error('[PushService] Failed to initialize FCM HTTP v1 client:', error);
      this.initialized = false;
      this.auth = null;
      this.projectId = null;
    }
  }

  private async loadCredentials(): Promise<ServiceAccountCredentials | null> {
    const config = getFirebaseConfig();
    let jsonValue = config.serviceAccountJson || '';
    let pathValue = config.serviceAccountPath || '';

    const dbSettings = await query(
      "SELECT key, value FROM settings WHERE key = 'push_service_account_json'"
    );
    const encryptedJson = dbSettings.rows.find(
      (row) => row.key === 'push_service_account_json'
    )?.value;
    if (encryptedJson) {
      jsonValue = decryptSensitiveValue(encryptedJson);
      pathValue = '';
    }

    if (jsonValue) return JSON.parse(jsonValue) as ServiceAccountCredentials;
    if (pathValue) {
      return JSON.parse(await readFile(pathValue, 'utf8')) as ServiceAccountCredentials;
    }
    return null;
  }

  public async reinitialize(): Promise<void> {
    await this.initialize();
  }

  public async sendToTokens(
    tokens: string[],
    payload: PushPayload
  ): Promise<{ successCount: number; failureCount: number }> {
    const uniqueTokens = [...new Set(tokens.filter((token) => token.trim()))];
    if (!this.initialized || !this.auth || !this.projectId || uniqueTokens.length === 0) {
      return { successCount: 0, failureCount: uniqueTokens.length };
    }

    const accessToken = await this.auth.getAccessToken();
    if (!accessToken) {
      console.error('[PushService] Unable to obtain an FCM OAuth access token.');
      return { successCount: 0, failureCount: uniqueTokens.length };
    }

    let successCount = 0;
    let failureCount = 0;
    const invalidTokens: string[] = [];

    // FCM HTTP v1 sends one token per request. A small bounded batch avoids
    // unbounded parallel network work while preserving useful throughput.
    for (let offset = 0; offset < uniqueTokens.length; offset += 25) {
      const batch = uniqueTokens.slice(offset, offset + 25);
      const results = await Promise.all(
        batch.map((token) => this.sendOne(token, payload, accessToken))
      );

      results.forEach((result, index) => {
        if (result.success) successCount += 1;
        else failureCount += 1;
        if (result.invalidToken) invalidTokens.push(batch[index]);
      });
    }

    if (invalidTokens.length > 0) await this.cleanupTokens(invalidTokens);
    return { successCount, failureCount };
  }

  private async sendOne(
    token: string,
    payload: PushPayload,
    accessToken: string
  ): Promise<FcmSendResult> {
    try {
      const response = await fetch(
        `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(this.projectId!)}/messages:send`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            message: {
              token,
              notification: { title: payload.title, body: payload.body },
              data: payload.data,
              android: {
                priority: 'HIGH',
                notification: { sound: 'default', click_action: 'FLUTTER_NOTIFICATION_CLICK' },
              },
              apns: { payload: { aps: { sound: 'default', badge: 1 } } },
            },
          }),
          signal: AbortSignal.timeout(10_000),
        }
      );

      if (response.ok) return { success: true, invalidToken: false };

      const errorBody = (await response.json().catch(() => ({}))) as {
        error?: { status?: string; details?: Array<{ errorCode?: string }> };
      };
      const fcmCode = errorBody.error?.details?.find((detail) => detail.errorCode)?.errorCode;
      const invalidToken = fcmCode === 'UNREGISTERED' || fcmCode === 'INVALID_ARGUMENT';
      console.warn('[PushService] FCM rejected a message:', {
        status: response.status,
        code: fcmCode || errorBody.error?.status || 'UNKNOWN',
      });
      return { success: false, invalidToken };
    } catch (error) {
      console.error('[PushService] FCM request failed:', error);
      return { success: false, invalidToken: false };
    }
  }

  private async cleanupTokens(tokens: string[]): Promise<void> {
    try {
      await query('DELETE FROM device_tokens WHERE token = ANY($1)', [tokens]);
      console.log(`[PushService] Cleaned up ${tokens.length} invalid tokens.`);
    } catch (error) {
      console.error('[PushService] Failed to clean up invalid tokens:', error);
    }
  }

  private async isPushEnabled(
    key: 'push_enabled_global' | 'push_enabled_polls' | 'push_enabled_messages'
  ): Promise<boolean> {
    try {
      const result = await query('SELECT value FROM settings WHERE key = $1', [key]);
      return result.rows.length === 0 || result.rows[0].value === 'true';
    } catch (error) {
      console.error(`[PushService] Error checking setting ${key}:`, error);
      return false;
    }
  }

  public async notifyPollPublished(pollId: string, title: string): Promise<void> {
    if (this.disabled) return;
    setImmediate(async () => {
      try {
        if (
          !(await this.isPushEnabled('push_enabled_global')) ||
          !(await this.isPushEnabled('push_enabled_polls'))
        ) return;

        const result = await query(`
          SELECT dt.token
          FROM device_tokens dt
          JOIN users u ON dt.user_id = u.id
          WHERE u.notifications_enabled = true
            AND dt.enabled = true
            AND dt.polls_enabled = true
        `);
        await this.sendToTokens(
          result.rows.map((row) => row.token),
          { title: 'New poll is live', body: title, data: { type: 'poll_published', pollId } }
        );
      } catch (error) {
        console.error('[PushService] Poll notification failed:', error);
      }
    });
  }

  public async notifyMessagePublished(
    messageId: string,
    title: string,
    body: string
  ): Promise<void> {
    if (this.disabled) return;
    setImmediate(async () => {
      try {
        if (
          !(await this.isPushEnabled('push_enabled_global')) ||
          !(await this.isPushEnabled('push_enabled_messages'))
        ) return;

        const result = await query(`
          SELECT dt.token
          FROM device_tokens dt
          JOIN users u ON dt.user_id = u.id
          WHERE u.notifications_enabled = true
            AND dt.enabled = true
            AND dt.messages_enabled = true
        `);
        await this.sendToTokens(
          result.rows.map((row) => row.token),
          { title, body: body.substring(0, 120), data: { type: 'message_published', messageId } }
        );
      } catch (error) {
        console.error('[PushService] Message notification failed:', error);
      }
    });
  }

  public async shutdown(): Promise<void> {
    this.initialized = false;
    this.auth = null;
    this.projectId = null;
  }
}

export const pushService = PushNotificationService.getInstance();
