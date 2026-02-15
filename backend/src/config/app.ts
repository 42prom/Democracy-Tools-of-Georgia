
export const AppConfig = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT || '3000', 10),
  
  // Privacy
  MIN_K_ANONYMITY: parseInt(process.env.MIN_K_ANONYMITY || '30', 10),

  // Biometric Service
  BIOMETRIC: {
    URL: process.env.BIOMETRIC_SERVICE_URL || 'http://localhost:8000',
    TIMEOUT_MS: parseInt(process.env.BIOMETRIC_TIMEOUT_MS || '10000', 10),
    MAX_RETRIES: parseInt(process.env.BIOMETRIC_MAX_RETRIES || '1', 10),
  },

  // Security
  CORS_ORIGINS: process.env.CORS_ORIGIN?.split(',') || [],
  
  // Flags
  ALLOW_MOCK_LOGIN: process.env.ALLOW_MOCK_LOGIN === 'true',
  BYPASS_ADMIN_AUTH: process.env.BYPASS_ADMIN_AUTH === 'true',

  // Logging & Limits
  ENABLE_DEBUG_LOGGING: process.env.ENABLE_DEBUG_LOGGING === 'true' || process.env.NODE_ENV === 'development',
  ENABLE_PRIVACY_NOISE: process.env.ENABLE_PRIVACY_NOISE !== 'false', // Default to true unless explicitly disabled
  BODY_LIMIT: process.env.BODY_LIMIT || '10mb',
};

export const isDev = AppConfig.NODE_ENV === 'development';
export const isTest = AppConfig.NODE_ENV === 'test';
export const isProd = AppConfig.NODE_ENV === 'production';
