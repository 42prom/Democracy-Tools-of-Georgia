import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import { CONFIG } from './config.js';
import { connectRedis, closeRedis, checkRedisHealth } from './db/redis.js';
import { checkHealth } from './db/client.js';
import { runMigrations } from './db/migrate.js';
import attestationsRoutes from './routes/attestations.js';
import votesRoutes from './routes/votes.js';
import adminPollsRoutes from './routes/admin/polls.js';
import analyticsRoutes from './routes/analytics.js';
import securityEventsRoutes from './routes/admin/security-events.js';
import adminMessagesRoutes from './routes/admin/messages.js';
import adminProfilesRoutes from './routes/admin/profiles.js';
import adminRegionsRoutes from './routes/admin/regions.js';

const fastify = Fastify({
  logger: CONFIG.nodeEnv === 'development',
});

// Security middleware
await fastify.register(helmet, {
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
    },
  },
});

await fastify.register(cors, {
  origin: CONFIG.security.corsOrigin,
  credentials: true,
});

// Health check
fastify.get('/health', async () => {
  const dbHealthy = await checkHealth();
  const redisHealthy = await checkRedisHealth();

  return {
    status: dbHealthy && redisHealthy ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
    services: {
      database: dbHealthy ? 'connected' : 'disconnected',
      redis: redisHealthy ? 'connected' : 'disconnected',
    },
  };
});

// API routes
await fastify.register(attestationsRoutes, { prefix: '/api/v1/attestations' });
await fastify.register(votesRoutes, { prefix: '/api/v1/votes' });
await fastify.register(adminPollsRoutes, { prefix: '/api/v1/admin/polls' });
await fastify.register(analyticsRoutes, { prefix: '/api/v1/analytics' });
await fastify.register(securityEventsRoutes, { prefix: '/api/v1/admin/security-events' });
await fastify.register(adminMessagesRoutes, { prefix: '/api/v1/admin/messages' });
await fastify.register(adminProfilesRoutes, { prefix: '/api/v1/admin/profiles' });
await fastify.register(adminRegionsRoutes, { prefix: '/api/v1/admin/regions' });

// Error handler
fastify.setErrorHandler((error, request, reply) => {
  console.error('Error:', error);

  const statusCode = error.statusCode || 500;
  const message = error.message || 'Internal Server Error';

  reply.code(statusCode).send({
    error: {
      message,
      statusCode,
      ...(CONFIG.nodeEnv === 'development' && { stack: error.stack }),
    },
  });
});

// Graceful shutdown
const shutdown = async () => {
  console.log('\nShutting down gracefully...');
  await closeRedis();
  await fastify.close();
  process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Start server
const start = async () => {
  try {
    // Run pending database migrations
    await runMigrations();

    await connectRedis();

    await fastify.listen({
      port: CONFIG.port,
      host: CONFIG.host,
    });

    console.log(`✓ Server running on http://${CONFIG.host}:${CONFIG.port}`);
    console.log(`✓ Environment: ${CONFIG.nodeEnv}`);
    console.log(`✓ Health check: http://${CONFIG.host}:${CONFIG.port}/health`);
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

start();
