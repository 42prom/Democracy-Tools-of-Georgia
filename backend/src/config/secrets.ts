import dotenv from 'dotenv';
import { getSecret } from './vault';

dotenv.config();

const isTest = process.env.NODE_ENV === 'test';
const isDev = process.env.NODE_ENV === 'development';

/** Reads from Vault cache first, falls back to process.env */
const env = (key: string): string | undefined => getSecret(key) ?? process.env[key];

export const getJwtSecret = (): string => {
  const secret = env('JWT_SECRET');
  if (!secret) {
    if (isTest) return 'test-jwt-secret-do-not-use-in-prod';
    throw new Error('FATAL: JWT_SECRET is not defined in environment variables.');
  }
  if (secret.length < 32 && !isTest && !isDev) {
    throw new Error('FATAL: JWT_SECRET is too short (min 32 chars required).');
  }
  return secret;
};

export const getPnHashSecret = (): string => {
  const secret = env('PN_HASH_SECRET');
  if (!secret) {
    if (isTest) return 'test-pn-hash-secret';
    throw new Error('FATAL: PN_HASH_SECRET is not defined in environment variables.');
  }
  return secret;
};

export const getApiKeyEncryptionSecret = (): string => {
  const secret = env('API_KEY_ENCRYPTION_SECRET');
  if (!secret) {
    if (isTest) return 'test-encryption-key-32-chars-long!';
    throw new Error('FATAL: API_KEY_ENCRYPTION_SECRET is not defined.');
  }
  if (secret.length < 32 && !isTest) {
    throw new Error('FATAL: API_KEY_ENCRYPTION_SECRET must be at least 32 characters.');
  }
  return secret;
};
export const getBlockchainPrivateKey = (): string => {
  const key = env('BLOCKCHAIN_PRIVATE_KEY');
  if (!key) {
    if (isTest) return '0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    throw new Error('FATAL: BLOCKCHAIN_PRIVATE_KEY is not defined.');
  }
  return key;
};

export const getVpnDetectionKeys = () => ({
  ipQualityScore: env('IPQUALITYSCORE_API_KEY'),
  ipHub: env('IPHUB_API_KEY'),
  proxyCheck: env('PROXYCHECK_API_KEY'),
});

export const getAdminPassword = (): string | undefined => env('ADMIN_PASSWORD');

export const getFirebaseConfig = () => ({
  disabled: env('FIREBASE_DISABLED') === 'true',
  serviceAccountJson: env('FIREBASE_SERVICE_ACCOUNT_JSON'),
  serviceAccountPath: env('FIREBASE_SERVICE_ACCOUNT_PATH'),
});

export const getDeviceHashSecret = (): string => {
  const secret = env('DEVICE_HASH_SECRET');
  if (!secret) {
    if (isTest) return 'test-device-secret-123';
    throw new Error('FATAL: DEVICE_HASH_SECRET is missing.');
  }
  return secret;
};

export const getVoterHashSecret = (): string => {
  const secret = env('VOTER_HASH_SECRET');
  if (!secret) {
    if (isTest) return 'test-voter-secret-456';
    throw new Error('FATAL: VOTER_HASH_SECRET is missing.');
  }
  return secret;
};

export const getDatabaseUrl = (): string => {
  const url = env('DATABASE_URL');
  if (!url) {
    if (isTest) return 'postgres://postgres:postgres@localhost:5432/dtg_test';
    throw new Error('FATAL: DATABASE_URL is missing.');
  }
  return url;
};

export const getRedisUrl = (): string => {
  const url = env('REDIS_URL');
  if (!url) {
    if (isTest) return 'redis://localhost:6379';
    return 'redis://localhost:6379'; // Fallback for dev if needed, but safe
  }
  return url;
};
