import { Router, Request, Response } from 'express';
import { pool } from '../db/client';
import redisClient from '../db/redis';
import { HttpClientFactory } from '../utils/httpClient';
import { getMetrics } from '../middleware/metrics';

const router = Router();

interface HealthCheckResult {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  dependencies: {
    postgres: DependencyStatus;
    redis: DependencyStatus;
    'biometric-service'?: DependencyStatus;
  };
}

interface DependencyStatus {
  status: 'up' | 'down';
  latency_ms?: number;
  error?: string;
}

/**
 * Health endpoint with dependency checks
 * GET /health
 */
router.get('/', async (_req: Request, res: Response) => {
  const result: HealthCheckResult = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    dependencies: {
      postgres: await checkPostgres(),
      redis: await checkRedis(),
    },
  };

  // Always check biometric service (important for face matching flow)
  result.dependencies['biometric-service'] = await checkBiometricService();

  // Determine overall status
  const allUp = Object.values(result.dependencies).every(dep => dep.status === 'up');
  const anyDown = Object.values(result.dependencies).some(dep => dep.status === 'down');

  if (anyDown) {
    const isTest = process.env.NODE_ENV === 'test';
    const isMock = process.env.BIOMETRIC_MOCK_MODE === 'true';
    
    // In test or mock mode, biometric service being down is acceptable for a "healthy" status
    const onlyBiometricDown = result.dependencies['biometric-service']?.status === 'down' && 
                             result.dependencies.postgres.status === 'up' && 
                             result.dependencies.redis.status === 'up';

    if ((isTest || isMock) && onlyBiometricDown) {
      result.status = 'degraded';
      res.status(200);
    } else {
      result.status = 'unhealthy';
      res.status(503);
    }
  } else if (!allUp) {
    result.status = 'degraded';
    res.status(200); // Still accepting traffic
  }

  res.json(result);
});

/**
 * Check Postgres connectivity
 */
async function checkPostgres(): Promise<DependencyStatus> {
  const start = Date.now();
  try {
    await pool.query('SELECT 1');
    return {
      status: 'up',
      latency_ms: Date.now() - start,
    };
  } catch (error: any) {
    return {
      status: 'down',
      error: error.message,
    };
  }
}

/**
 * Check Redis connectivity
 */
async function checkRedis(): Promise<DependencyStatus> {
  const start = Date.now();
  try {
    await redisClient.ping();
    return {
      status: 'up',
      latency_ms: Date.now() - start,
    };
  } catch (error: any) {
    return {
      status: 'down',
      error: error.message,
    };
  }
}

/**
 * Check Biometric Service connectivity (uses fast health client)
 */
async function checkBiometricService(): Promise<DependencyStatus & { circuit_breaker?: string }> {
  const start = Date.now();
  try {
    // Use dedicated health client with short timeout (3s)
    const healthClient = HttpClientFactory.getBiometricHealthClient();
    await healthClient.get('/health');

    // Also check main client's circuit breaker state
    const mainClient = HttpClientFactory.getBiometricClient();
    const circuitState = mainClient.getCircuitState();

    return {
      status: 'up',
      latency_ms: Date.now() - start,
      circuit_breaker: circuitState,
    };
  } catch (error: any) {
    // Check main client's circuit breaker state even on failure
    const mainClient = HttpClientFactory.getBiometricClient();
    const circuitState = mainClient.getCircuitState();

    return {
      status: 'down',
      error: error.message,
      circuit_breaker: circuitState,
    };
  }
}

/**
 * Metrics endpoint for observability
 * GET /metrics
 * Returns Prometheus formatted metrics
 */
router.get('/metrics', async (_req: Request, res: Response) => {
  try {
    const stats = await getMetrics();
    res.setHeader('Content-Type', 'text/plain');
    res.send(stats);
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve metrics' });
  }
});

export default router;
