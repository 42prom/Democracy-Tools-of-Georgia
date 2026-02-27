import dotenv from 'dotenv';
// Load environment variables immediately
// NOTE: Removed override:true to allow docker-compose env vars to take precedence
dotenv.config();
console.log(`[Startup] Loaded .env.NODE_ENV="${process.env.NODE_ENV}"`);

/**
 * DTG Backend Entry Point
 * =======================
 * 
 * This file initializes the Express application, sets up middleware,
 * mounts routes, and manages the server lifecycle (startup/shutdown).
 * 
 * Key Features:
 * - Security Middleware (Helmet, CORS, Rate Limiting)
 * - Observability (Prometheus Metrics, Pino Logger)
 * - Graceful Shutdown (DB/Redis connections)
 */

import express, { Express } from 'express';
import compression from 'compression';
import { connectRedis, closeRedis } from './db/redis';
import { close as closeDb, checkHealth as checkDbHealth } from './db/client';
import { securityHeaders, corsMiddleware, permissionsPolicy } from './middleware/security';
import { requestLogger } from './middleware/logger';
import { requestIdMiddleware } from './middleware/requestId';
import { apiLimiter } from './middleware/rateLimit';
import { dynamicRateLimit } from './middleware/dynamicRateLimit';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { metricsMiddleware } from './middleware/metrics';
import healthRouter from './routes/health';
import authRouter from './routes/auth';
import pollsRouter from './routes/polls';
import adminAuthRouter from './routes/admin/auth';
import adminPollsRouter from './routes/admin/polls';
import adminRegionsRouter from './routes/admin/regions';
import adminInsightsRouter from './routes/admin/insights';
import adminProfilesRouter from './routes/admin/profiles';
import adminSettingsRouter from './routes/admin/settings';
import adminExportRouter from './routes/admin/export';
import adminMessagesRouter from './routes/admin/messages';
import adminSecurityRouter from './routes/admin/security';
import adminTicketsRouter from './routes/admin/tickets';
import adminGeoBlockingRouter from './routes/admin/geoBlocking';
import adminShieldRouter from './routes/admin/shield';
import statsRouter from './routes/stats';
import ticketsRouter from './routes/tickets';

import enrollmentRouter from './routes/enrollment';
import rewardsRouter from './routes/rewards';
import messagesRouter from './routes/messages';
import devicesRouter from './routes/devices';
import profileRouter from './routes/profile';
import walletRouter from './routes/wallet';
import activityRouter from './routes/activity';

import settingsRouter from './routes/settings';
import verifyRouter from './routes/verify';
import { initVault } from './config/vault';
import { CryptoRegistry } from './crypto/CryptoRegistry';

import { VoteAnchorService } from './services/voteAnchor';

import { AppConfig, isTest } from './config/app';
const app: Express = express();
const PORT = AppConfig.PORT;

// Trust proxy headers (e.g. from Shield, Cloudflare)
app.set('trust proxy', true);

// Middleware stack
app.use(compression());
app.use(express.json({ limit: AppConfig.BODY_LIMIT }));
app.use(express.urlencoded({ extended: true, limit: AppConfig.BODY_LIMIT }));

// Debug middleware - log ALL requests including OPTIONS (Conditional)
if (AppConfig.ENABLE_DEBUG_LOGGING) {
  app.use((req, _res, next) => {
    const bodyStr = JSON.stringify(req.body);
    const bodySize = bodyStr ? bodyStr.length : 0;
    // Truncate huge bodies in logs
    const logBody = bodySize > 1000 ? `[${bodySize} bytes]` : bodyStr;
    console.log(`[HTTP] ${req.method} ${req.path} - Content-Type: ${req.headers['content-type']} - Body: ${logBody}`);
    
    // Detailed security reset logging (always useful in dev/test)
    if (req.path.includes('reset-security') || req.path.includes('reset-enrollment')) {
      console.log(`[DEBUG] Reset endpoint hit! Full path: ${req.originalUrl}, Method: ${req.method}, Auth header present: ${!!req.headers.authorization}`);
    }
    next();
  });
}

app.use(requestIdMiddleware); // Add UUID to request first
app.use(corsMiddleware);
app.use(securityHeaders);
app.use(permissionsPolicy); // New explicit permissions policy
app.use(requestLogger);
app.use(metricsMiddleware); // Collect request metrics

// Global Response Interceptor: Prevent double-encoding by ensuring all res.json calls send objects
// This is a safety net for any code paths that might accidentally double-encode JSON
app.use((req, res, next) => {
  const originalJson = res.json;
  res.json = function (body) {
    let sanitizedBody = body;
    let layers = 0;
    // Self-heal up to 5 layers of accidental string encoding
    while (typeof sanitizedBody === 'string' && layers < 5) {
      try {
        const parsed = JSON.parse(sanitizedBody);
        if (parsed === sanitizedBody) break;
        sanitizedBody = parsed;
        layers++;
      } catch (e) {
        break;
      }
    }
    if (layers > 0 && process.env.NODE_ENV !== 'production') {
      console.log(`[Global-Interceptor] Self-healed ${layers} layers of encoding for ${req.path}`);
    }
    return originalJson.call(this, sanitizedBody);
  };
  next();
});

// Global limit (skip for admin)
app.use((req, res, next) => {
  if (req.path.startsWith('/api/v1/admin')) {
    return next();
  }
  return apiLimiter(req, res, next);
});

// Routes
// Routes
// Note: healthRouter defines '/' (health) and '/metrics'
// So mounting at '/health' means: /health -> health, /health/metrics -> metrics
app.use('/health', healthRouter);
// Also mount root '/' to health check for convenience/root probes
app.use('/', (req, res, next) => {
  if (req.path === '/') {
    return healthRouter(req, res, next);
  }
  return next();
});

// API v1 routes
app.use('/api/v1/auth', dynamicRateLimit('login'), authRouter); // Dynamic limit for auth
// Admin routes receive NO rate limiting to prevent lockout
// Admin routes receive NO rate limiting (handled above) 

app.use('/api/v1/enrollment', dynamicRateLimit('enrollment'), enrollmentRouter); // Dynamic limit for enrollment
app.use('/api/v1/polls', pollsRouter);
app.use('/api/v1/messages', messagesRouter); // New Public messages route
app.use('/api/v1/admin/auth', adminAuthRouter);
app.use('/api/v1/admin/polls', adminPollsRouter);
app.use('/api/v1/admin/regions', adminRegionsRouter);
app.use('/api/v1/admin/insights', adminInsightsRouter);
app.use('/api/v1/admin/profiles', adminProfilesRouter);
app.use('/api/v1/admin/settings', adminSettingsRouter);
app.use('/api/v1/admin/export', adminExportRouter);
app.use('/api/v1/admin/messages', adminMessagesRouter);
app.use('/api/v1/admin/security-events', adminSecurityRouter);
app.use('/api/v1/admin/tickets', adminTicketsRouter);
app.use('/api/v1/admin/geo-blocking', adminGeoBlockingRouter);
app.use('/api/v1/admin/shield', adminShieldRouter);
app.use('/api/v1/stats', statsRouter);
app.use('/api/v1/tickets', ticketsRouter);
app.use('/api/v1/analytics', statsRouter); // Analytics endpoint (alias for stats)
app.use('/api/v1/rewards', rewardsRouter);
app.use('/api/v1/devices', devicesRouter);
app.use('/api/v1/profile', profileRouter);
app.use('/api/v1/wallet', walletRouter);
app.use('/api/v1/activity', activityRouter);

app.use('/api/v1/settings', settingsRouter);

// Public verification endpoints (no auth required — for auditors & voters)
app.use('/api/v1/public', verifyRouter);

// Error handling (must be last)
app.use(notFoundHandler);
app.use(errorHandler);

/**
 * Start server
 */
async function startServer() {
  try {
    // ── Phase 2: Initialise secrets + crypto before anything else ──
    await initVault(); // Loads secrets from Vault or .env
    await CryptoRegistry.init(); // Selects HMAC or Poseidon hasher

    // Validate environment configuration
    await validateEnvironment();
    
    // Connect to Redis
    await connectRedis();
    console.log('✓ Redis connected');

    // Check Database connection
    const dbConnected = await checkDbHealth();
    if (dbConnected) {
      console.log('✓ Database connected');
      
      // Verification check for required columns
      try {
        const columnCheck = await (await import('./db/client')).pool.query(`
          SELECT column_name FROM information_schema.columns 
          WHERE table_name = 'users' AND column_name = 'device_key_thumbprint'
        `);
        if (columnCheck.rows.length === 0) {
          console.warn('⚠️  CRITICAL: Database schema is out of sync. Missing "device_key_thumbprint" in "users" table.');
          console.warn('   Run "npm run migrate" or "npm run db:reset" to fix.');
        }
      } catch (err: any) {
        console.warn('⚠️  Warning: Could not verify database schema during startup:', err.message);
      }
    } else {
      console.error('❌ Database connection failed during startup');
      // process.exit(1); // Optional: Un-comment if you want strict failure
    }

    // === SHIELD STARTUP SYNCHRONIZATION ===
    try {
      console.log('[Startup] Syncing security policies to Shield Gateway...');
      const { GeoBlockingService } = await import('./services/geoBlocking');
      await GeoBlockingService.syncToRedis();
      
      // Also sync general security settings
      const { loadFullConfig } = await import('./routes/admin/settings');
      const config = await loadFullConfig();
      const redisClient = (await import('./db/redis')).default;
      const securityPayload = {
        block_vpn_and_proxy: String(config.security.blockVpnAndProxy),
        require_device_attestation: String(config.security.requireDeviceAttestationForVote),
        max_biometric_attempts_per_ip: String(config.security.maxBiometricAttemptsPerIP),
        biometric_window_minutes: String(config.security.biometricIPLimitWindowMinutes),
      };
      await redisClient.set('security:settings', JSON.stringify(securityPayload));
      console.log('✓ Shield Gateway synchronized');
    } catch (err) {
      console.warn('⚠️  Warning: Shield synchronization failed during startup:', err);
    }

    // Start Express server
    const server = app.listen(PORT, () => {
      console.log(`✓ Server running on http://localhost:${PORT}`);
      console.log(`✓ Environment: ${AppConfig.NODE_ENV}`);
      console.log(`✓ Health check: http://localhost:${PORT}/health`);
    });

    // Start Background Services
    const { RewardProcessor } = await import('./services/rewardProcessor');
    const { PollStatusMonitor } = await import('./services/pollMonitor');
    
    RewardProcessor.start();
    PollStatusMonitor.start();
    VoteAnchorService.start();

    // Store server instance for graceful shutdown
    (app as any).server = server;
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

/**
 * Graceful shutdown
 */
async function shutdown() {
  console.log('\nShutting down gracefully...');
  try {
    // Close Express server first to stop accepting new requests
    if ((app as any).server) {
      await new Promise<void>((resolve) => {
        (app as any).server.close(() => {
          console.log('✓ Express server closed');
          resolve();
        });
      });
    }

    await closeRedis();
    await closeDb();

    // Stop Background Services
    try {
      const { RewardProcessor } = await import('./services/rewardProcessor');
      const { PollStatusMonitor } = await import('./services/pollMonitor');
      const { pushService } = await import('./services/pushNotifications');
      
      RewardProcessor.stop();
      PollStatusMonitor.stop();
      VoteAnchorService.stop();
      await pushService.shutdown();
    } catch (e) { console.warn('[Shutdown] Non-critical error stopping services:', e); }

    console.log('✓ Connections closed');
    process.exit(0);
  } catch (error: any) {
    console.error('Error during shutdown:', error.message);
    process.exit(1);
  }
}

/**
 * Validate environment configuration
 */
async function validateEnvironment() {
  console.log('[Startup] Validating environment configuration...');
  
  const bioServiceUrl = AppConfig.BIOMETRIC.URL;
  if (bioServiceUrl && bioServiceUrl.includes('localhost') && AppConfig.NODE_ENV === 'production') {
    console.warn('⚠️  WARNING: BIOMETRIC_SERVICE_URL uses localhost in production. Use Docker service name instead.');
  }
  
  console.log(`✓ BIOMETRIC_SERVICE_URL: ${bioServiceUrl}`);
  
  // JWT Secret validation is now handled by getJwtSecret() in secrets.ts called by auth middleware
  // We can double check here if we want, or rely on config/secrets to throw early
  try {
    const { getJwtSecret, getPnHashSecret, getApiKeyEncryptionSecret } = await import('./config/secrets');
    getJwtSecret();
    getPnHashSecret();
    getApiKeyEncryptionSecret();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`❌ FATAL: ${msg}`);
    process.exit(1);
  }
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Start the server if not in test mode
if (!isTest) {
  startServer();
}

export const server = app; // Export app for testing
export default app;