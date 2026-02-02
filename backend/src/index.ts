import dotenv from 'dotenv';
// Load environment variables immediately
dotenv.config();

import express, { Express } from 'express';
import { connectRedis, closeRedis } from './db/redis';
import { close as closeDb } from './db/client';
import { securityHeaders, corsMiddleware } from './middleware/security';
import { requestLogger } from './middleware/logger';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import healthRouter from './routes/health';
import authRouter from './routes/auth';
import pollsRouter from './routes/polls';
import adminPollsRouter from './routes/admin/polls';
import adminRegionsRouter from './routes/admin/regions';
import adminInsightsRouter from './routes/admin/insights';
import adminProfilesRouter from './routes/admin/profiles';
import adminSettingsRouter from './routes/admin/settings';
import adminExportRouter from './routes/admin/export';
import adminMessagesRouter from './routes/admin/messages';
import statsRouter from './routes/stats';
import settingsRouter from './routes/settings';
import enrollmentRouter from './routes/enrollment';

const app: Express = express();
const PORT = process.env.PORT || 3000;

// Middleware stack
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(corsMiddleware);
app.use(securityHeaders);
app.use(requestLogger);

// Routes
app.use('/', healthRouter);

// API v1 routes
app.use('/api/v1/auth', authRouter);
app.use('/api/v1/settings', settingsRouter);
app.use('/api/v1/enrollment', enrollmentRouter);
app.use('/api/v1/polls', pollsRouter);
app.use('/api/v1/admin/polls', adminPollsRouter);
app.use('/api/v1/admin/regions', adminRegionsRouter);
app.use('/api/v1/admin/insights', adminInsightsRouter);
app.use('/api/v1/admin/profiles', adminProfilesRouter);
app.use('/api/v1/admin/settings', adminSettingsRouter);
app.use('/api/v1/admin/export', adminExportRouter);
app.use('/api/v1/admin/messages', adminMessagesRouter);
app.use('/api/v1/stats', statsRouter);
app.use('/api/v1/analytics', statsRouter); // Analytics endpoint (alias for stats)

// Error handling (must be last)
app.use(notFoundHandler);
app.use(errorHandler);

/**
 * Start server
 */
async function startServer() {
  try {
    // Connect to Redis
    await connectRedis();
    console.log('✓ Redis connected');

    // Start Express server
    app.listen(PORT, () => {
      console.log(`✓ Server running on http://localhost:${PORT}`);
      console.log(`✓ Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`✓ Health check: http://localhost:${PORT}/health`);
    });
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
    await closeRedis();
    await closeDb();
    console.log('✓ Connections closed');
    process.exit(0);
  } catch (error) {
    console.error('Error during shutdown:', error);
    process.exit(1);
  }
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Start the server
startServer();

export default app;