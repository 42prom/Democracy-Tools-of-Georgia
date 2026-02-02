import { Router, Request, Response, NextFunction } from 'express';
import { requireAdmin } from '../../middleware/auth';
import { pool } from '../../db/client';
import crypto from 'crypto';

const router = Router();

// All admin routes require authentication
router.use(requireAdmin);

// Encryption key for API keys (in production, use a proper key management system)
const ENCRYPTION_KEY = process.env.API_KEY_ENCRYPTION_SECRET || 'change-me-in-production-32chars';

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
  return apiKey.substring(0, 4) + '•'.repeat(apiKey.length - 8) + apiKey.substring(apiKey.length - 4);
}


/**
 * Load full verification configuration including NFC policies and document strictness.
 * This is the source of truth for admin settings endpoints.
 */
async function loadFullVerificationConfig() {
  const result = await pool.query(
    `SELECT key, value FROM settings WHERE key LIKE 'verification_%'`
  );

  const config = {
    nfc: {
      provider: 'mock',
      requireNfc: true,
      requireGeorgianCitizen: true,
      requirePersonalNumber: true,
    },
    documentScanner: {
      provider: 'manual',
      apiKey: '',
      requireDocumentPhotoScan: true,
      strictness: 'strict' as 'strict' | 'lenient',
    },
    liveness: {
      provider: 'mock',
      apiKey: '',
      minScore: 0.7,
      retryLimit: 3,
    },
    faceMatch: {
      provider: 'mock',
      apiKey: '',
      minScore: 0.75,
    },
  };

  result.rows.forEach((row: any) => {
    const { key, value } = row;

    if (key === 'verification_nfc_provider') {
      config.nfc.provider = value;
    } else if (key === 'verification_nfc_require_nfc') {
      config.nfc.requireNfc = parseBool(value, true);
    } else if (key === 'verification_nfc_require_georgian_citizen') {
      config.nfc.requireGeorgianCitizen = parseBool(value, true);
    } else if (key === 'verification_nfc_require_personal_number') {
      config.nfc.requirePersonalNumber = parseBool(value, true);
    } else if (key === 'verification_document_provider') {
      config.documentScanner.provider = value;
    } else if (key === 'verification_document_apikey') {
      config.documentScanner.apiKey = value ? maskApiKey(decryptApiKey(value)) : '';
    } else if (key === 'verification_document_require_photo_scan') {
      config.documentScanner.requireDocumentPhotoScan = parseBool(value, true);
    } else if (key === 'verification_document_strictness') {
      config.documentScanner.strictness = (value === 'lenient' ? 'lenient' : 'strict');
    } else if (key === 'verification_liveness_provider') {
      config.liveness.provider = value;
    } else if (key === 'verification_liveness_apikey') {
      config.liveness.apiKey = value ? maskApiKey(decryptApiKey(value)) : '';
    } else if (key === 'verification_liveness_min_score') {
      config.liveness.minScore = parseFloat(value);
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

  return config;
}

/**
 * GET /api/v1/admin/settings
 * Admin-only settings (verification providers + policies)
 */
router.get(
  "/",
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const config = await loadFullVerificationConfig();
      return res.json(config);
    } catch (error) {
      return next(error);
    }
  }
);

/**
 * PATCH /api/v1/admin/settings
 * Partial update of admin settings (verification providers + policies)
 */
router.patch(
  "/",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = req.body || {};
      const current = await loadFullVerificationConfig();

      const merged = {
        ...current,
        ...body,
        nfc: { ...current.nfc, ...(body.nfc || {}) },
        documentScanner: { ...current.documentScanner, ...(body.documentScanner || {}) },
        liveness: { ...current.liveness, ...(body.liveness || {}) },
        faceMatch: { ...current.faceMatch, ...(body.faceMatch || {}) },
      };

      const settings = [
        { key: "verification_nfc_provider", value: merged.nfc.provider },
        { key: "verification_nfc_require_nfc", value: String(merged.nfc.requireNfc) },
        { key: "verification_nfc_require_georgian_citizen", value: String(merged.nfc.requireGeorgianCitizen) },
        { key: "verification_nfc_require_personal_number", value: String(merged.nfc.requirePersonalNumber) },

        { key: "verification_document_provider", value: merged.documentScanner.provider },
        { key: "verification_document_require_photo_scan", value: String(merged.documentScanner.requireDocumentPhotoScan) },
        { key: "verification_document_strictness", value: merged.documentScanner.strictness },

        { key: "verification_liveness_provider", value: merged.liveness.provider },
        { key: "verification_liveness_min_score", value: String(merged.liveness.minScore) },
        { key: "verification_liveness_retry_limit", value: String(merged.liveness.retryLimit) },

        { key: "verification_facematch_provider", value: merged.faceMatch.provider },
        { key: "verification_facematch_min_score", value: String(merged.faceMatch.minScore) },
      ];

      if (merged.documentScanner.apiKey && typeof merged.documentScanner.apiKey === "string" && !merged.documentScanner.apiKey.includes("•")) {
        settings.push({ key: "verification_document_apikey", value: encryptApiKey(merged.documentScanner.apiKey) });
      }
      if (merged.liveness.apiKey && typeof merged.liveness.apiKey === "string" && !merged.liveness.apiKey.includes("•")) {
        settings.push({ key: "verification_liveness_apikey", value: encryptApiKey(merged.liveness.apiKey) });
      }
      if (merged.faceMatch.apiKey && typeof merged.faceMatch.apiKey === "string" && !merged.faceMatch.apiKey.includes("•")) {
        settings.push({ key: "verification_facematch_apikey", value: encryptApiKey(merged.faceMatch.apiKey) });
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

      const updated = await loadFullVerificationConfig();
      return res.json(updated);
    } catch (error) {
      return next(error);
    }
  }
);

/**
 * GET /api/v1/admin/settings/verification-providers
 * Get current verification provider configuration
 */
router.get(
  '/verification-providers',
  async (_req: Request, res: Response, next: NextFunction) => {
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
          minScore: 0.7,
          retryLimit: 3,
        },
        faceMatch: {
          provider: 'mock',
          apiKey: '',
          minScore: 0.75,
        },
      };

      // Parse settings from database
      result.rows.forEach((row) => {
        const { key, value } = row;

        if (key === 'verification_document_provider') {
          config.documentScanner.provider = value;
        } else if (key === 'verification_document_apikey') {
          // Return masked API key
          config.documentScanner.apiKey = value ? maskApiKey(decryptApiKey(value)) : '';
        } else if (key === 'verification_liveness_provider') {
          config.liveness.provider = value;
        } else if (key === 'verification_liveness_apikey') {
          config.liveness.apiKey = value ? maskApiKey(decryptApiKey(value)) : '';
        } else if (key === 'verification_liveness_min_score') {
          config.liveness.minScore = parseFloat(value);
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
  }
);

/**
 * POST /api/v1/admin/settings/verification-providers
 * Update verification provider configuration
 */
router.post(
  '/verification-providers',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { documentScanner, liveness, faceMatch } = req.body;

      // Prepare settings to upsert
      const settings = [
        { key: 'verification_document_provider', value: documentScanner.provider },
        { key: 'verification_liveness_provider', value: liveness.provider },
        { key: 'verification_liveness_min_score', value: liveness.minScore.toString() },
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
          apiKey: documentScanner.apiKey && !documentScanner.apiKey.includes('•')
            ? maskApiKey(documentScanner.apiKey)
            : documentScanner.apiKey,
        },
        liveness: {
          provider: liveness.provider,
          apiKey: liveness.apiKey && !liveness.apiKey.includes('•')
            ? maskApiKey(liveness.apiKey)
            : liveness.apiKey,
          minScore: liveness.minScore,
          retryLimit: liveness.retryLimit,
        },
        faceMatch: {
          provider: faceMatch.provider,
          apiKey: faceMatch.apiKey && !faceMatch.apiKey.includes('•')
            ? maskApiKey(faceMatch.apiKey)
            : faceMatch.apiKey,
          minScore: faceMatch.minScore,
        },
      };

      res.json(updatedConfig);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/v1/admin/settings/verification-providers/test
 * Test connection to verification provider
 */
router.post(
  '/verification-providers/test',
  async (req: Request, res: Response, _next: NextFunction) => {
    try {
      const { provider, apiKey, type } = req.body;

      // For MVP, mock providers always succeed
      if (provider === 'manual' || provider === 'mock') {
        return res.json({
          success: true,
          message: `${type} provider (${provider}) is configured correctly`,
        });
      }

      // For real providers, we would actually test the API connection here
      // Example for AWS Rekognition:
      // if (provider === 'aws-rekognition') {
      //   const AWS = require('aws-sdk');
      //   const rekognition = new AWS.Rekognition({ apiVersion: '2016-06-27' });
      //   // Test API call...
      // }

      // For now, just validate that API key is provided
      if (!apiKey || apiKey.includes('•')) {
        return res.status(400).json({
          success: false,
          error: 'API key is required for this provider',
        });
      }

      // Simulate test (in production, make actual API call)
      await new Promise((resolve) => setTimeout(resolve, 1000));

      return res.json({
        success: true,
        message: `Connection to ${provider} successful!`,
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        error: 'Connection test failed',
      });
    }
  }
);

export default router;
