import dotenv from 'dotenv';
// Load environment variables immediately
// NOTE: Removed override:true to allow docker-compose env vars to take precedence
dotenv.config();
console.log(`[Startup] Loaded .env.NODE_ENV="${process.env.NODE_ENV}"`);

// Force restart for debugging audience rules
import express, { Express } from 'express';
import { connectRedis, closeRedis } from './db/redis';
import { close as closeDb, checkHealth as checkDbHealth } from './db/client';
// Restart trigger: 2026-02-06-22:45
import { securityHeaders, corsMiddleware } from './middleware/security';
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

import { AppConfig, isTest } from './config/app';
const app: Express = express();
const PORT = AppConfig.PORT;

// Middleware stack
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
app.use(requestLogger);
app.use(metricsMiddleware); // Collect request metrics
// Global limit (skip for admin)
app.use((req, res, next) => {
  if (req.path.startsWith('/api/v1/admin')) {
    return next();
  }
  return apiLimiter(req, res, next);
});

// Routes
app.use('/', healthRouter);

// API v1 routes
app.use('/api/v1/auth', dynamicRateLimit('login'), authRouter); // Dynamic limit for auth
// Admin routes receive NO rate limiting to prevent lockout
app.use('/api/v1/admin', (_req, _res, next) => next()); 


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
app.use('/api/v1/stats', statsRouter);
app.use('/api/v1/tickets', ticketsRouter);
app.use('/api/v1/analytics', statsRouter); // Analytics endpoint (alias for stats)
app.use('/api/v1/rewards', rewardsRouter);
app.use('/api/v1/devices', devicesRouter);
app.use('/api/v1/profile', profileRouter);
app.use('/api/v1/wallet', walletRouter);
app.use('/api/v1/activity', activityRouter);
app.use('/api/v1/settings', settingsRouter);

// Error handling (must be last)
app.use(notFoundHandler);
app.use(errorHandler);

/**
 * Start server
 */
async function startServer() {
  try {
    // Validate environment configuration
    validateEnvironment();
    
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
      
      RewardProcessor.stop();
      PollStatusMonitor.stop();
    } catch (e) {}

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
function validateEnvironment() {
  console.log('[Startup] Validating environment configuration...');
  
  const bioServiceUrl = AppConfig.BIOMETRIC.URL;
  if (bioServiceUrl && bioServiceUrl.includes('localhost') && AppConfig.NODE_ENV === 'production') {
    console.warn('⚠️  WARNING: BIOMETRIC_SERVICE_URL uses localhost in production. Use Docker service name instead.');
  }
  
  console.log(`✓ BIOMETRIC_SERVICE_URL: ${bioServiceUrl}`);
  
  // JWT Secret validation is now handled by getJwtSecret() in secrets.ts called by auth middleware
  // We can double check here if we want, or rely on config/secrets to throw early
  try {
    const secrets = require('./config/secrets');
    secrets.getJwtSecret();
    secrets.getPnHashSecret();
    secrets.getApiKeyEncryptionSecret();
  } catch (err: any) {
    console.error(`❌ FATAL: ${err.message}`);
    process.exit(1);
  }
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Start the server if not in test mode
if (!isTest) {
  startServer();
}

export default app;