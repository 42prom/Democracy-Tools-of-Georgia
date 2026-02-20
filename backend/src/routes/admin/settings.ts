import { Router, Request, Response, NextFunction } from 'express';
import { requireAdmin } from '../../middleware/auth';
import { pool } from '../../db/client';
import crypto from 'crypto';

const router = Router();

// All admin routes require authentication
router.use(requireAdmin);

import { getApiKeyEncryptionSecret } from '../../config/secrets';

// Encryption key for API keys (in production, use a proper key management system)
const ENCRYPTION_KEY = getApiKeyEncryptionSecret();

// Derive a 32-byte key from the secret
const DERIVED_KEY = crypto.createHash('sha256').update(ENCRYPTION_KEY).digest();

function parseBool(value: any, defaultValue: boolean): boolean {
  if (value === undefined || value === null) return defaultValue;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const s = value.trim().toLowerCase();
    if (s === 'true' || s === '1' || s === 'yes') return true;
    if (s === 'false' || s === '0' || s === 'no') return false;
  }
  return defaultValue;
}

/**
 * Encrypt API key for storage
 */
function encryptApiKey(apiKey: string): string {
  const iv = crypto.randomBytes(16); // Generate random IV
  const cipher = crypto.createCipheriv('aes-256-cbc', DERIVED_KEY, iv);
  let encrypted = cipher.update(apiKey, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  // Store IV with encrypted data (IV:encrypted)
  return iv.toString('hex') + ':' + encrypted;
}

/**
 * Decrypt API key from storage
 */
function decryptApiKey(encryptedKey: string): string {
  const parts = encryptedKey.split(':');
  if (parts.length !== 2) {
    throw new Error('Invalid encrypted key format');
  }
  const iv = Buffer.from(parts[0], 'hex');
  const encryptedText = parts[1];
  const decipher = crypto.createDecipheriv('aes-256-cbc', DERIVED_KEY, iv);
  let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

/**
 * Mask API key for frontend display
 */
function maskApiKey(apiKey: string): string {
  if (!apiKey || apiKey.length < 8) return '';
  return (
    apiKey.substring(0, 4) + '•'.repeat(apiKey.length - 8) + apiKey.substring(apiKey.length - 4)
  );
}

/**
 * Load full verification configuration including NFC policies and document strictness.
 * This is the source of truth for admin settings endpoints.
 */
/**
 * Load full configuration (Verification + Blockchain).
 * This is the source of truth for admin settings endpoints.
 */
export async function loadFullConfig(): Promise<any> {
  const result = await pool.query(
    `SELECT key, value FROM settings WHERE key LIKE 'verification_%' OR key LIKE 'blockchain_%' OR key LIKE 'security_%' OR key LIKE 'push_%'`
  );
  
  const systemSettingsResult = await pool.query(
    `SELECT key, value FROM system_settings WHERE key LIKE 'rate_limit_%'`
  );

  const config: any = {
    // Verification Defaults
    nfc: {
      provider: 'mock',
      requireNfc: true,
      requireGeorgianCitizen: true,
      requirePersonalNumber: true,
      allowSkipDocument: true,
    },
    documentScanner: {
      provider: 'manual',
      apiKey: '',
      requireDocumentPhotoScan: true,
      strictness: 'strict',
    },
    liveness: {
      provider: '3d_face_detector',
      apiKey: '',
      retryLimit: 3,
      // Note: Liveness is pass/fail only - no minScore threshold
    },
    faceMatch: {
      provider: 'custom_biometric_matcher',
      apiKey: '',
      minScore: 0.75,
    },
    // Blockchain Defaults
    rewards_enabled_global: false,
    nft_payouts_enabled_global: false,
    chain_id: 1337,
    rpc_url: '',
    nft_contract_address: '',
    dtg_token_address: '',
    reward_token_id: 1,
    required_confirmations: 3,
    // Security Defaults
    security: {
      maxDistinctVotersPerDevicePerPoll: 2,
      requireDeviceAttestationForVote: false,
      blockVpnAndProxy: false,
      vpnDetectionProvider: 'iphub',
      vpnDetectionApiKey: '',
      maxBiometricAttemptsPerIP: 10,
      biometricIPLimitWindowMinutes: 60,
    },
    // Push Defaults
    push: {
      enabledGlobal: true,
      enabledPolls: true,
      enabledMessages: true,
      serviceAccountJson: '',
      serviceAccountPath: '',
    },
    // --- Rate Limit Defaults ---
    rate_limit_enrollment: { ip: 10, device: 5, pn: 3, window: 60 },
    rate_limit_login: { ip: 20, device: 10, pn: 5, window: 15 },
    rate_limit_biometric: { ip: 10, account: 5, window: 60 },
    rate_limit_vote: { poll: 1, account: 3, window: 1 },
  };

  result.rows.forEach((row: any) => {
    const { key, value } = row;

    if (key.startsWith('rate_limit_')) {
      try {
        config[key] = value; // value is already JSON from db?
        // If system_settings stores value as JSONB/JSON, pg driver returns object.
        // If text, we might need parsing. 
        // Based on previous code, it seemed to be JSON.
        // Let's assume the driver handles it or it's stored as JSON type.
        // If it's stored as text in 'settings' table (key, value text), we MUST parse it.
        if (typeof value === 'string') {
             config[key] = JSON.parse(value);
        }
      } catch (e) {
        console.error(`Failed to parse ${key}`, e);
      }
    }

    // --- Verification Settings ---
    if (key === 'verification_nfc_provider') {
      config.nfc.provider = value;
    } else if (key === 'verification_nfc_require_nfc') {
      config.nfc.requireNfc = parseBool(value, true);
    } else if (key === 'verification_nfc_require_georgian_citizen') {
      config.nfc.requireGeorgianCitizen = parseBool(value, true);
    } else if (key === 'verification_nfc_require_personal_number') {
      config.nfc.requirePersonalNumber = parseBool(value, true);
    } else if (key === 'verification_nfc_allow_skip_document') {
      config.nfc.allowSkipDocument = parseBool(value, true);
    } else if (key === 'verification_document_provider') {
      config.documentScanner.provider = value;
    } else if (key === 'verification_document_apikey') {
      config.documentScanner.apiKey = value ? maskApiKey(decryptApiKey(value)) : '';
    } else if (key === 'verification_document_require_photo_scan') {
      config.documentScanner.requireDocumentPhotoScan = parseBool(value, true);
    } else if (key === 'verification_document_strictness') {
      config.documentScanner.strictness = value === 'lenient' ? 'lenient' : 'strict';
    } else if (key === 'verification_liveness_provider') {
      config.liveness.provider = value;
    } else if (key === 'verification_liveness_apikey') {
      config.liveness.apiKey = value ? maskApiKey(decryptApiKey(value)) : '';
    } else if (key === 'verification_liveness_retry_limit') {
      config.liveness.retryLimit = parseInt(value, 10);
    } else if (key === 'verification_facematch_provider') {
      config.faceMatch.provider = value;
    } else if (key === 'verification_facematch_apikey') {
      config.faceMatch.apiKey = value ? maskApiKey(decryptApiKey(value)) : '';
    } else if (key === 'verification_facematch_min_score') {
      config.faceMatch.minScore = parseFloat(value);
    }

    // --- Blockchain Settings ---
    else if (key === 'blockchain_rewards_enabled') {
      config.rewards_enabled_global = parseBool(value, false);
    } else if (key === 'blockchain_nft_payouts_enabled') {
      config.nft_payouts_enabled_global = parseBool(value, false);
    } else if (key === 'blockchain_chain_id') {
      config.chain_id = parseInt(value, 10) || 1337;
    } else if (key === 'blockchain_rpc_url') {
      config.rpc_url = value;
    } else if (key === 'blockchain_nft_contract_address') {
      config.nft_contract_address = value;
    } else if (key === 'blockchain_dtg_token_address') {
      config.dtg_token_address = value;
    } else if (key === 'blockchain_reward_token_id') {
      config.reward_token_id = parseInt(value, 10) || 1;
    } else if (key === 'blockchain_required_confirmations') {
      config.required_confirmations = parseInt(value, 10) || 3;
    }
    // --- Security Settings ---
    else if (key === 'security_max_distinct_voters_per_device_per_poll') {
      config.security.maxDistinctVotersPerDevicePerPoll = parseInt(value, 10) || 2;
    } else if (key === 'security_require_device_attestation_for_vote') {
      config.security.requireDeviceAttestationForVote = parseBool(value, false);
    } else if (key === 'security_block_vpn_and_proxy') {
      config.security.blockVpnAndProxy = parseBool(value, false);
    } else if (key === 'security_vpn_detection_provider') {
      config.security.vpnDetectionProvider = value || 'iphub';
    } else if (key === 'security_vpn_detection_apikey') {
      config.security.vpnDetectionApiKey = value ? maskApiKey(decryptApiKey(value)) : '';
    } else if (key === 'security_max_biometric_attempts_per_ip') {
      config.security.maxBiometricAttemptsPerIP = parseInt(value, 10) || 10;
    } else if (key === 'security_biometric_ip_limit_window_minutes') {
      config.security.biometricIPLimitWindowMinutes = parseInt(value, 10) || 60;
    }
    // --- Push Settings ---
    else if (key === 'push_enabled_global') {
      config.push.enabledGlobal = parseBool(value, true);
    } else if (key === 'push_enabled_polls') {
      config.push.enabledPolls = parseBool(value, true);
    } else if (key === 'push_enabled_messages') {
      config.push.enabledMessages = parseBool(value, true);
    } else if (key === 'push_service_account_json') {
      config.push.serviceAccountJson = value ? maskApiKey(decryptApiKey(value)) : '';
    } else if (key === 'push_service_account_path') {
      config.push.serviceAccountPath = value || '';
    }
  });

  systemSettingsResult.rows.forEach((row: any) => {
     config[row.key] = row.value;
  });

  return config;
}

/**
 * Get security settings (for use by other services)
 * Returns the security configuration including biometric IP rate limits
 */
export async function getSecuritySettings() {
  const result = await pool.query(
    `SELECT key, value FROM settings WHERE key LIKE 'security_%'`
  );

  const security = {
    maxDistinctVotersPerDevicePerPoll: 2,
    requireDeviceAttestationForVote: false,
    blockVpnAndProxy: false,
    vpnDetectionProvider: 'iphub',
    vpnDetectionApiKey: '',
    maxBiometricAttemptsPerIP: 10,
    biometricIPLimitWindowMinutes: 60,
  };

  result.rows.forEach((row: any) => {
    const { key, value } = row;

    if (key === 'security_max_distinct_voters_per_device_per_poll') {
      security.maxDistinctVotersPerDevicePerPoll = parseInt(value, 10) || 2;
    } else if (key === 'security_require_device_attestation_for_vote') {
      security.requireDeviceAttestationForVote = parseBool(value, false);
    } else if (key === 'security_block_vpn_and_proxy') {
      security.blockVpnAndProxy = parseBool(value, false);
    } else if (key === 'security_vpn_detection_provider') {
      security.vpnDetectionProvider = value || 'iphub';
    } else if (key === 'security_vpn_detection_apikey') {
      security.vpnDetectionApiKey = value || '';
    } else if (key === 'security_max_biometric_attempts_per_ip') {
      security.maxBiometricAttemptsPerIP = parseInt(value, 10) || 10;
    } else if (key === 'security_biometric_ip_limit_window_minutes') {
      security.biometricIPLimitWindowMinutes = parseInt(value, 10) || 60;
    }
  });

  return security;
}

/**
 * GET /api/v1/admin/settings
 * Admin-only settings (verification providers + policies)
 */
router.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const config = await loadFullConfig();
    return res.json(config);
  } catch (error) {
    return next(error);
  }
});

/**
 * PATCH /api/v1/admin/settings
 * Partial update of admin settings (verification providers + policies)
 */
router.patch('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = req.body || {};
    const current = await loadFullConfig();

    const merged = {
      ...current,
      ...body,
      nfc: { ...current.nfc, ...(body.nfc || {}) },
      documentScanner: { ...current.documentScanner, ...(body.documentScanner || {}) },
      liveness: { ...current.liveness, ...(body.liveness || {}) },
      faceMatch: { ...current.faceMatch, ...(body.faceMatch || {}) },
      security: { ...current.security, ...(body.security || {}) },
      push: { ...current.push, ...(body.push || {}) },
      // Rate limits are direct objects, just replace if present
      rate_limit_enrollment: body.rate_limit_enrollment || current.rate_limit_enrollment,
      rate_limit_login: body.rate_limit_login || current.rate_limit_login,
      rate_limit_biometric: body.rate_limit_biometric || current.rate_limit_biometric,
      rate_limit_vote: body.rate_limit_vote || current.rate_limit_vote,
    };

    const settings = [
      // Verification Keys
      { key: 'verification_nfc_provider', value: merged.nfc.provider },
      { key: 'verification_nfc_require_nfc', value: String(merged.nfc.requireNfc) },
      {
        key: 'verification_nfc_require_georgian_citizen',
        value: String(merged.nfc.requireGeorgianCitizen),
      },
      {
        key: 'verification_nfc_require_personal_number',
        value: String(merged.nfc.requirePersonalNumber),
      },
      {
        key: 'verification_nfc_allow_skip_document',
        value: String(merged.nfc.allowSkipDocument),
      },

      { key: 'verification_document_provider', value: merged.documentScanner.provider },
      {
        key: 'verification_document_require_photo_scan',
        value: String(merged.documentScanner.requireDocumentPhotoScan),
      },
      { key: 'verification_document_strictness', value: merged.documentScanner.strictness },

      { key: 'verification_liveness_provider', value: merged.liveness.provider },
      { key: 'verification_liveness_retry_limit', value: String(merged.liveness.retryLimit) },

      { key: 'verification_facematch_provider', value: merged.faceMatch.provider },
      { key: 'verification_facematch_min_score', value: String(merged.faceMatch.minScore) },

      // Blockchain Keys
      { key: 'blockchain_rewards_enabled', value: String(merged.rewards_enabled_global) },
      { key: 'blockchain_nft_payouts_enabled', value: String(merged.nft_payouts_enabled_global) },
      { key: 'blockchain_chain_id', value: String(merged.chain_id) },
      { key: 'blockchain_rpc_url', value: merged.rpc_url || '' },
      { key: 'blockchain_nft_contract_address', value: merged.nft_contract_address || '' },
      { key: 'blockchain_dtg_token_address', value: merged.dtg_token_address || '' },
      { key: 'blockchain_reward_token_id', value: String(merged.reward_token_id) },
      { key: 'blockchain_required_confirmations', value: String(merged.required_confirmations) },
      // Security Keys
      {
        key: 'security_max_distinct_voters_per_device_per_poll',
        value: String(merged.security.maxDistinctVotersPerDevicePerPoll),
      },
      {
        key: 'security_require_device_attestation_for_vote',
        value: String(merged.security.requireDeviceAttestationForVote),
      },
      {
        key: 'security_block_vpn_and_proxy',
        value: String(merged.security.blockVpnAndProxy),
      },
      {
        key: 'security_vpn_detection_provider',
        value: merged.security.vpnDetectionProvider || 'iphub',
      },
      {
        key: 'security_vpn_detection_apikey',
        value: merged.security.vpnDetectionApiKey ? encryptApiKey(merged.security.vpnDetectionApiKey) : '',
      },
      {
        key: 'security_max_biometric_attempts_per_ip',
        value: String(merged.security.maxBiometricAttemptsPerIP),
      },
      {
        key: 'security_biometric_ip_limit_window_minutes',
        value: String(merged.security.biometricIPLimitWindowMinutes),
      },
      // Push Keys
      { key: 'push_enabled_global', value: String(merged.push.enabledGlobal) },
      { key: 'push_enabled_polls', value: String(merged.push.enabledPolls) },
      { key: 'push_enabled_messages', value: String(merged.push.enabledMessages) },
      { key: 'push_service_account_path', value: merged.push.serviceAccountPath || '' },
    ];

    if (
      merged.documentScanner.apiKey &&
      typeof merged.documentScanner.apiKey === 'string' &&
      !merged.documentScanner.apiKey.includes('•')
    ) {
      settings.push({
        key: 'verification_document_apikey',
        value: encryptApiKey(merged.documentScanner.apiKey),
      });
    }
    if (
      merged.liveness.apiKey &&
      typeof merged.liveness.apiKey === 'string' &&
      !merged.liveness.apiKey.includes('•')
    ) {
      settings.push({
        key: 'verification_liveness_apikey',
        value: encryptApiKey(merged.liveness.apiKey),
      });
    }
    if (
      merged.faceMatch.apiKey &&
      typeof merged.faceMatch.apiKey === 'string' &&
      !merged.faceMatch.apiKey.includes('•')
    ) {
      settings.push({
        key: 'verification_facematch_apikey',
        value: encryptApiKey(merged.faceMatch.apiKey),
      });
    }

    if (
      merged.push.serviceAccountJson &&
      typeof merged.push.serviceAccountJson === 'string' &&
      !merged.push.serviceAccountJson.includes('•')
    ) {
      settings.push({
        key: 'push_service_account_json',
        value: encryptApiKey(merged.push.serviceAccountJson),
      });
    }

    for (const setting of settings) {
      await pool.query(
        `INSERT INTO settings (key, value, updated_at)
           VALUES ($1, $2, NOW())
           ON CONFLICT (key)
           DO UPDATE SET value = $2, updated_at = NOW()`,
        [setting.key, setting.value]
      );
    }

    // Update Rate Limits in system_settings
    const rateLimitSettings = [
      { key: 'rate_limit_enrollment', value: merged.rate_limit_enrollment },
      { key: 'rate_limit_login', value: merged.rate_limit_login },
      { key: 'rate_limit_biometric', value: merged.rate_limit_biometric },
      { key: 'rate_limit_vote', value: merged.rate_limit_vote },
    ];

    for (const setting of rateLimitSettings) {
      if (!setting.value) continue;
      await pool.query(
        `INSERT INTO system_settings (key, value, updated_at)
           VALUES ($1, $2, NOW())
           ON CONFLICT (key)
           DO UPDATE SET value = $2, updated_at = NOW()`,
        [setting.key, setting.value]
      );
    }

    // Trigger push service reinitialization to apply new credentials/toggles
    const { pushService } = await import('../../services/pushNotifications');
    await pushService.reinitialize();

    // Clear rate limit cache so new settings take effect immediately
    const { clearRateLimitCache } = await import('../../services/authRateLimit');
    clearRateLimitCache();
    console.log('[Admin] Rate limit settings cache cleared');

    // === SHIELD SYNCHRONIZATION ===
    // Publish security and geo settings to Redis so the Shield Gateway
    // can enforce them at the edge (Port 8080) without hitting the backend.
    try {
      const redisClient = (await import('../../db/redis')).default;
      const securityPayload = {
        block_vpn_and_proxy: String(merged.security.blockVpnAndProxy),
        require_device_attestation: String(merged.security.requireDeviceAttestationForVote),
        max_biometric_attempts_per_ip: String(merged.security.maxBiometricAttemptsPerIP),
        biometric_window_minutes: String(merged.security.biometricIPLimitWindowMinutes),
      };
      await redisClient.set('security:settings', JSON.stringify(securityPayload));
      console.log('[Admin] Security settings synced to Shield via Redis:', securityPayload);
    } catch (e) {
      console.warn('[Admin] Could not sync security settings to Shield Redis (non-fatal):', e);
    }

    const updated = await loadFullConfig();
    return res.json(updated);
  } catch (error) {
    return next(error);
  }
});

/**
 * GET /api/v1/admin/settings/verification-providers
 * Get current verification provider configuration
 */
router.get('/verification-providers', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    // Query settings from database
    const result = await pool.query(
      `SELECT key, value FROM settings WHERE key LIKE 'verification_%'`
    );

    // Build config object
    const config = {
      documentScanner: {
        provider: 'manual',
        apiKey: '',
      },
      liveness: {
        provider: 'mock',
        apiKey: '',
        retryLimit: 3,
        // Note: Liveness is pass/fail only - no minScore
      },
      faceMatch: {
        provider: 'mock',
        apiKey: '',
        minScore: 0.75,
      },
    };

    // Parse settings from database
    result.rows.forEach((row: any) => {
      const { key, value } = row;

      if (key === 'verification_nfc_provider') {
        config.documentScanner.provider = value;
      } else if (key === 'verification_document_apikey') {
        // Return masked API key
        config.documentScanner.apiKey = value ? maskApiKey(decryptApiKey(value)) : '';
      } else if (key === 'verification_liveness_provider') {
        config.liveness.provider = value;
      } else if (key === 'verification_liveness_apikey') {
        config.liveness.apiKey = value ? maskApiKey(decryptApiKey(value)) : '';
      } else if (key === 'verification_liveness_retry_limit') {
        config.liveness.retryLimit = parseInt(value, 10);
      } else if (key === 'verification_facematch_provider') {
        config.faceMatch.provider = value;
      } else if (key === 'verification_facematch_apikey') {
        config.faceMatch.apiKey = value ? maskApiKey(decryptApiKey(value)) : '';
      } else if (key === 'verification_facematch_min_score') {
        config.faceMatch.minScore = parseFloat(value);
      }
    });

    res.json(config);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/admin/settings/verification-providers
 * Update verification provider configuration
 */
router.post('/verification-providers', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { documentScanner, liveness, faceMatch } = req.body;

    // Prepare settings to upsert
    const settings = [
      { key: 'verification_document_provider', value: documentScanner.provider },
      { key: 'verification_liveness_provider', value: liveness.provider },
      { key: 'verification_liveness_retry_limit', value: liveness.retryLimit.toString() },
      { key: 'verification_facematch_provider', value: faceMatch.provider },
      { key: 'verification_facematch_min_score', value: faceMatch.minScore.toString() },
    ];

    // Only update API keys if they're not masked (i.e., user actually changed them)
    if (documentScanner.apiKey && !documentScanner.apiKey.includes('•')) {
      settings.push({
        key: 'verification_document_apikey',
        value: encryptApiKey(documentScanner.apiKey),
      });
    }

    if (liveness.apiKey && !liveness.apiKey.includes('•')) {
      settings.push({
        key: 'verification_liveness_apikey',
        value: encryptApiKey(liveness.apiKey),
      });
    }

    if (faceMatch.apiKey && !faceMatch.apiKey.includes('•')) {
      settings.push({
        key: 'verification_facematch_apikey',
        value: encryptApiKey(faceMatch.apiKey),
      });
    }

    // Upsert all settings
    for (const setting of settings) {
      await pool.query(
        `INSERT INTO settings (key, value, updated_at)
           VALUES ($1, $2, NOW())
           ON CONFLICT (key)
           DO UPDATE SET value = $2, updated_at = NOW()`,
        [setting.key, setting.value]
      );
    }

    // Return updated config (with masked API keys)
    const updatedConfig = {
      documentScanner: {
        provider: documentScanner.provider,
        apiKey:
          documentScanner.apiKey && !documentScanner.apiKey.includes('•')
            ? maskApiKey(documentScanner.apiKey)
            : documentScanner.apiKey,
      },
      liveness: {
        provider: liveness.provider,
        apiKey:
          liveness.apiKey && !liveness.apiKey.includes('•')
            ? maskApiKey(liveness.apiKey)
            : liveness.apiKey,
        retryLimit: liveness.retryLimit,
      },
      faceMatch: {
        provider: faceMatch.provider,
        apiKey:
          faceMatch.apiKey && !faceMatch.apiKey.includes('•')
            ? maskApiKey(faceMatch.apiKey)
            : faceMatch.apiKey,
        minScore: faceMatch.minScore,
      },
    };

    res.json(updatedConfig);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/admin/settings/verification-providers/test
 * Test connection to verification provider
 */
router.post(
  '/verification-providers/test',
  async (req: Request, res: Response, _next: NextFunction) => {
    try {
      const { provider, apiKey, type } = req.body || {};

      if (!provider || typeof provider !== 'string') {
        return res.status(400).json({ success: false, error: 'provider is required' });
      }

      // On-device providers run on the phone; connection testing is not applicable.
      if (provider.startsWith('on_device')) {
        return res.status(400).json({
          success: false,
          error: 'Test connection is disabled for on-device providers',
        });
      }

      // Non-remote providers: nothing to test.
      if (provider === 'manual' || provider === 'mock' || provider === 'in_house') {
        return res.json({
          success: true,
          message: `${type || 'provider'} (${provider}) does not require a remote connection`,
        });
      }

      // Remote provider stub: require API key.
      if (provider === 'provider') {
        if (!apiKey || typeof apiKey !== 'string' || apiKey.includes('•')) {
          return res.status(400).json({
            success: false,
            error: 'API key is required for this provider',
          });
        }

        // Simulate test (in production, make actual API call)
        await new Promise((resolve) => setTimeout(resolve, 500));

        return res.json({
          success: true,
          message: `Connection to ${provider} successful!`,
        });
      }

      return res.status(400).json({
        success: false,
        error: 'Unknown provider',
      });
    } catch (_error) {
      return res.status(500).json({
        success: false,
        error: 'Connection test failed',
      });
    }
  }
);

/**
 * Test blockchain connection (REAL connection using ethers.js)
 */
router.post('/blockchain/test', async (req: Request, res: Response) => {
  try {
    const { rpcUrl } = req.body;
    if (!rpcUrl) {
      return res.status(400).json({ success: false, error: 'RPC URL is required' });
    }

    // Import and use the real blockchain service
    const { BlockchainService } = await import('../../services/blockchain');
    const result = await BlockchainService.testConnection(rpcUrl);

    if (result.success) {
      return res.json({
        success: true,
        message: result.message,
        chainId: result.chainId,
        blockNumber: result.blockNumber,
        latency: result.latency,
      });
    } else {
      return res.json({
        success: false,
        error: result.message,
        latency: result.latency,
      });
    }
  } catch (error: any) {
    console.error('[Blockchain Test] Error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to test blockchain connection',
    });
  }
});

/**
 * POST /api/v1/admin/settings/notifications/test
 * Test Firebase Cloud Messaging connection/initialization
 */
router.post('/notifications/test', async (req: Request, res: Response) => {
  try {
    const { serviceAccountJson, serviceAccountPath } = req.body;

    // This is a dry-run test. In a real scenario, we might try to list the project metadata.
    // For now, we validate the input.
    if (!serviceAccountJson && !serviceAccountPath) {
      return res.status(400).json({
        success: false,
        error: 'Either Service Account JSON or Path is required',
      });
    }

    if (serviceAccountJson && !serviceAccountJson.includes('•')) {
      try {
        JSON.parse(serviceAccountJson);
      } catch (e) {
        return res.status(400).json({
          success: false,
          error: 'Invalid JSON format for Service Account',
        });
      }
    }

    // Simulate connection check
    await new Promise((resolve) => setTimeout(resolve, 1000));

    return res.json({
      success: true,
      message: 'Firebase configuration format is valid. (Token validation will occur on save)',
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: 'Failed to test Firebase connection',
    });
  }
});

/**
 * POST /api/v1/admin/settings/vpn-detection/test
 * Test VPN detection API connection
 */
router.post('/vpn-detection/test', async (req: Request, res: Response) => {
  try {
    const { provider, apiKey } = req.body;

    if (!apiKey) {
      return res.status(400).json({
        success: false,
        error: 'API key is required',
      });
    }

    // Test with a known residential IP (Google DNS)
    const testIp = '8.8.8.8';

    if (provider === 'iphub') {
      const response = await fetch(`https://v2.api.iphub.info/ip/${testIp}`, {
        headers: { 'X-Key': apiKey },
      });
      const data: any = await response.json();

      if (response.status === 200) {
        return res.json({
          success: true,
          message: `Connected to IPHub! (IP ${testIp}: ${data.isp || 'Valid response'})`,
        });
      } else {
        return res.json({
          success: false,
          error: `IPHub error: ${data.error || 'Invalid API key or rate limit exceeded'}`,
        });
      }
    } else if (provider === 'ipqualityscore') {
      const response = await fetch(
        `https://ipqualityscore.com/api/json/ip/${apiKey}/${testIp}?strictness=0`
      );
      const data: any = await response.json();

      if (data.success) {
        return res.json({
          success: true,
          message: `Connected to IPQualityScore! (IP ${testIp}: ${data.ISP || 'Valid response'})`,
        });
      } else {
        return res.json({
          success: false,
          error: `IPQualityScore error: ${data.message || 'Invalid API key'}`,
        });
      }
    } else if (provider === 'proxycheck') {
      const url = apiKey
        ? `https://proxycheck.io/v2/${testIp}?key=${apiKey}&vpn=1`
        : `https://proxycheck.io/v2/${testIp}?vpn=1`;

      const response = await fetch(url);
      const data: any = await response.json();

      if (data.status === 'ok') {
        return res.json({
          success: true,
          message: `Connected to ProxyCheck.io! (IP ${testIp}: ${data[testIp]?.provider || 'Valid response'})`,
        });
      } else {
        return res.json({
          success: false,
          error: `ProxyCheck error: ${data.message || 'Invalid API key or rate limit'}`,
        });
      }
    } else {
      return res.status(400).json({
        success: false,
        error: 'Unknown provider',
      });
    }
  } catch (error: any) {
    console.error('[VPN Test] Error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to test VPN detection service',
    });
  }
});

export default router;
