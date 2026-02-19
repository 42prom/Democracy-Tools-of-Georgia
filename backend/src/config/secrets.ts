import dotenv from 'dotenv';

dotenv.config();

const isTest = process.env.NODE_ENV === 'test';
const isDev = process.env.NODE_ENV === 'development';

export const getJwtSecret = (): string => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    if (isTest || isDev) {
      return 'CHANGE_ME_IN_PRODUCTION_USE_RANDOM_64_CHAR_STRING';
    }
    throw new Error('FATAL: JWT_SECRET is not defined in environment variables.');
  }
  if (secret.length < 32 && !isTest && !isDev) {
    throw new Error('FATAL: JWT_SECRET is too short (min 32 chars required).');
  }
  return secret;
};

export const getPnHashSecret = (): string => {
  const secret = process.env.PN_HASH_SECRET;
  if (!secret) {
    if (isTest) { // Only allow missing in test, NOT dev (consistency)
       return 'test-pn-hash-secret';
    }
    throw new Error('FATAL: PN_HASH_SECRET is not defined in environment variables.');
  }
  return secret;
};

export const getApiKeyEncryptionSecret = (): string => {
  const secret = process.env.API_KEY_ENCRYPTION_SECRET;
  if (!secret) {
    if (isTest) {
      return 'test-encryption-key-32-chars-long!';
    }
    throw new Error('FATAL: API_KEY_ENCRYPTION_SECRET is not defined.');
  }
  if (secret.length < 32 && !isTest) {
     throw new Error('FATAL: API_KEY_ENCRYPTION_SECRET must be at least 32 characters.');
  }
  return secret;
};
export const getBlockchainPrivateKey = (): string => {
  const key = process.env.BLOCKCHAIN_PRIVATE_KEY;
  if (!key) {
    if (isTest || isDev) return '0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'; // Mock key
    throw new Error('FATAL: BLOCKCHAIN_PRIVATE_KEY is not defined.');
  }
  return key;
};

export const getVpnDetectionKeys = () => {
  return {
    ipQualityScore: process.env.IPQUALITYSCORE_API_KEY,
    ipHub: process.env.IPHUB_API_KEY,
    proxyCheck: process.env.PROXYCHECK_API_KEY
  };
};

export const getAdminPassword = (): string | undefined => {
  return process.env.ADMIN_PASSWORD;
};

export const getFirebaseConfig = () => {
  return {
    disabled: process.env.FIREBASE_DISABLED === 'true',
    serviceAccountJson: process.env.FIREBASE_SERVICE_ACCOUNT_JSON,
    serviceAccountPath: process.env.FIREBASE_SERVICE_ACCOUNT_PATH
  };
};

export const getDeviceHashSecret = (): string => {
  const secret = process.env.DEVICE_HASH_SECRET;
  if (!secret) {
    if (isTest || isDev) return 'dev-device-secret-123';
    throw new Error('FATAL: DEVICE_HASH_SECRET is missing.');
  }
  return secret;
};

export const getVoterHashSecret = (): string => {
  const secret = process.env.VOTER_HASH_SECRET;
  if (!secret && !isTest && !isDev) throw new Error('FATAL: VOTER_HASH_SECRET is missing.');
  return secret || 'dev-voter-secret-456';
};

export const getDatabaseUrl = (): string => {
  const url = process.env.DATABASE_URL;
  if (!url) {
    if (isTest) return 'postgres://postgres:postgres@localhost:5432/dtg_test';
    throw new Error('FATAL: DATABASE_URL is missing.');
  }
  return url;
};

export const getRedisUrl = (): string => {
  return process.env.REDIS_URL || 'redis://localhost:6379';
};
