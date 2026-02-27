// Global Jest Setup for Backend
// This runs before any test file is executed.

process.env.NODE_ENV = 'test';
process.env.NULLIFIER_SECRET = 'ci-test-nullifier-secret-not-for-production';
process.env.CRYPTO_HASHER = 'hmac';

// Ed25519 keys for testing (graceful fallback if empty)
process.env.RECEIPT_PRIVATE_KEY_PEM = '';
process.env.RECEIPT_PUBLIC_KEY_PEM = '';

process.env.PN_HASH_SECRET = 'test-pn-hash-secret';
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.DATABASE_URL = 'postgresql://dtg_user:dtg_ci_password@localhost:5432/dtg_ci';
process.env.REDIS_URL = 'redis://localhost:6379';
