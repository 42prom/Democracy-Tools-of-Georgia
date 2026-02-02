import { Router, Request, Response } from 'express';
import { checkHealth } from '../db/client';
import { checkRedisHealth } from '../db/redis';

const router = Router();

/**
 * GET /health
 * Health check endpoint
 */
router.get('/health', async (_req: Request, res: Response) => {
  try {
    const dbHealthy = await checkHealth();
    const redisHealthy = await checkRedisHealth();

    const status = dbHealthy && redisHealthy ? 'ok' : 'degraded';
    const statusCode = status === 'ok' ? 200 : 503;

    res.status(statusCode).json({
      status,
      timestamp: new Date().toISOString(),
      services: {
        database: dbHealthy ? 'connected' : 'disconnected',
        redis: redisHealthy ? 'connected' : 'disconnected',
      },
    });
  } catch (error) {
    res.status(503).json({
      status: 'error',
      timestamp: new Date().toISOString(),
      services: {
        database: 'error',
        redis: 'error',
      },
    });
  }
});

export default router;
