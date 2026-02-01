import { config } from 'dotenv';

// Load .env file
config();

export const CONFIG = {
  port: parseInt(process.env.PORT || '3000', 10),
  host: process.env.HOST || '0.0.0.0',
  nodeEnv: process.env.NODE_ENV || 'development',

  database: {
    url: process.env.DATABASE_URL || 'postgresql://dtfg_user:dtfg_dev_password@localhost:5432/dtfg',
  },

  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  },

  jwt: {
    secret: process.env.JWT_SECRET || 'CHANGE_ME_IN_PRODUCTION',
  },

  security: {
    corsOrigin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:5173'],
  },

  privacy: {
    minKAnonymity: parseInt(process.env.MIN_K_ANONYMITY || '30', 10),
  },

  nonce: {
    ttl: parseInt(process.env.NONCE_TTL || '120', 10), // 120s default
  },

  attestation: {
    ttl: parseInt(process.env.ATTESTATION_TTL || '300', 10), // 5 minutes
    kid: process.env.ATTESTATION_KID || 'dtfg-key-1',
  },
};
