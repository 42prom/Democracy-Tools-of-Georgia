import { pool } from '../db/client';

export type NfcProvider = 'mock' | 'on_device_georgia';
export type DocumentScannerProvider = 'manual' | 'on_device_ocr_mrz';
export type LivenessProvider = 'mock' | 'provider' | 'in_house';
export type FaceMatchProvider = 'mock' | 'provider' | 'in_house';
export type FieldStrictness = 'strict' | 'lenient';

export interface VerificationSettings {
  nfc: {
    provider: NfcProvider;
    requireNfc: boolean;
    requireGeorgianCitizen: boolean;
    requirePersonalNumber: boolean;
  };
  documentScanner: {
    provider: DocumentScannerProvider;
    requireDocumentPhotoScan: boolean;
    strictness: FieldStrictness;
  };
  liveness: {
    provider: LivenessProvider;
    minThreshold: number;
    retryLimit: number;
  };
  faceMatch: {
    provider: FaceMatchProvider;
    minThreshold: number;
  };
}

export interface VerificationSettingsPublic extends VerificationSettings {
  env: {
    allowMocks: boolean;
  };
}

const DEFAULTS: VerificationSettings = {
  nfc: {
    provider: 'mock',
    requireNfc: true,
    requireGeorgianCitizen: true,
    requirePersonalNumber: true,
  },
  documentScanner: {
    provider: 'manual',
    requireDocumentPhotoScan: true,
    strictness: 'strict',
  },
  liveness: {
    provider: 'mock',
    minThreshold: 0.7,
    retryLimit: 3,
  },
  faceMatch: {
    provider: 'mock',
    minThreshold: 0.75,
  },
};

function parseBool(value: string | null | undefined, defaultValue: boolean): boolean {
  if (value === undefined || value === null) return defaultValue;
  const normalized = value.toLowerCase().trim();
  if (normalized === 'true' || normalized === '1' || normalized === 'yes') return true;
  if (normalized === 'false' || normalized === '0' || normalized === 'no') return false;
  return defaultValue;
}

function parseNumber(value: string | null | undefined, defaultValue: number): number {
  if (value === undefined || value === null) return defaultValue;
  const n = Number(value);
  return Number.isFinite(n) ? n : defaultValue;
}

export async function getVerificationSettings(): Promise<VerificationSettings> {
  const result = await pool.query(
    `SELECT key, value FROM settings WHERE key LIKE 'verification_%'`
  );

  const settings: Record<string, string> = {};
  for (const row of result.rows as Array<{ key: string; value: string }>) {
    settings[row.key] = row.value;
  }

  const nfcProvider = (settings['verification_nfc_provider'] || DEFAULTS.nfc.provider) as NfcProvider;
  const docProvider = (settings['verification_document_provider'] || DEFAULTS.documentScanner.provider) as DocumentScannerProvider;
  const livenessProvider = (settings['verification_liveness_provider'] || DEFAULTS.liveness.provider) as LivenessProvider;
  const faceProvider = (settings['verification_facematch_provider'] || DEFAULTS.faceMatch.provider) as FaceMatchProvider;

  const strictness = (settings['verification_document_strictness'] || DEFAULTS.documentScanner.strictness) as FieldStrictness;

  return {
    nfc: {
      provider: nfcProvider,
      requireNfc: parseBool(settings['verification_nfc_require_nfc'], DEFAULTS.nfc.requireNfc),
      requireGeorgianCitizen: parseBool(
        settings['verification_nfc_require_georgian_citizen'],
        DEFAULTS.nfc.requireGeorgianCitizen
      ),
      requirePersonalNumber: parseBool(
        settings['verification_nfc_require_personal_number'],
        DEFAULTS.nfc.requirePersonalNumber
      ),
    },
    documentScanner: {
      provider: docProvider,
      requireDocumentPhotoScan: parseBool(
        settings['verification_document_require_photo_scan'],
        DEFAULTS.documentScanner.requireDocumentPhotoScan
      ),
      strictness: strictness === 'lenient' ? 'lenient' : 'strict',
    },
    liveness: {
      provider: livenessProvider,
      minThreshold: parseNumber(settings['verification_liveness_min_score'], DEFAULTS.liveness.minThreshold),
      retryLimit: Math.max(
        1,
        Math.floor(parseNumber(settings['verification_liveness_retry_limit'], DEFAULTS.liveness.retryLimit))
      ),
    },
    faceMatch: {
      provider: faceProvider,
      minThreshold: parseNumber(settings['verification_facematch_min_score'], DEFAULTS.faceMatch.minThreshold),
    },
  };
}

export async function getVerificationSettingsPublic(): Promise<VerificationSettingsPublic> {
  const settings = await getVerificationSettings();
  const allowMocks = process.env.NODE_ENV !== 'production';
  return {
    ...settings,
    env: {
      allowMocks,
    },
  };
}
