import { Request, Response, NextFunction } from 'express';
import { HttpClientFactory } from '../utils/httpClient';

/**
 * Simple in-memory metrics for observability
 * In production, these would be exported to Prometheus/CloudWatch/etc.
 */
class MetricsCollector {
  private requestCount = 0;
  private errorCount = 0;
  private latencySum = 0;
  private latencyCount = 0;
  private lastReset = Date.now();

  recordRequest(): void {
    this.requestCount++;
  }

  recordError(): void {
    this.errorCount++;
  }

  recordLatency(ms: number): void {
    this.latencySum += ms;
    this.latencyCount++;
  }

  getStats(): MetricsSnapshot {
    const biometricClient = HttpClientFactory.getBiometricClient();
    const biometricHealthClient = HttpClientFactory.getBiometricHealthClient();

    return {
      requests: this.requestCount,
      errors: this.errorCount,
      errorRate: this.requestCount > 0 ? (this.errorCount / this.requestCount) : 0,
      avgLatencyMs: this.latencyCount > 0 ? Math.round(this.latencySum / this.latencyCount) : 0,
      uptime: Date.now() - this.lastReset,
      biometric: {
        circuitState: biometricClient.getCircuitState(),
        healthClientState: biometricHealthClient.getCircuitState(),
      },
    };
  }

  reset(): void {
    this.requestCount = 0;
    this.errorCount = 0;
    this.latencySum = 0;
    this.latencyCount = 0;
    this.lastReset = Date.now();
  }
}

interface MetricsSnapshot {
  requests: number;
  errors: number;
  errorRate: number;
  avgLatencyMs: number;
  uptime: number;
  biometric: {
    circuitState: string;
    healthClientState: string;
  };
}

// Singleton instance
export const metrics = new MetricsCollector();

/**
 * Middleware to collect request metrics
 */
export function metricsMiddleware(_req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();
  metrics.recordRequest();

  res.on('finish', () => {
    const duration = Date.now() - start;
    metrics.recordLatency(duration);

    if (res.statusCode >= 400) {
      metrics.recordError();
    }
  });

  next();
}

/**
 * Get current metrics snapshot
 */
export function getMetrics(): MetricsSnapshot {
  return metrics.getStats();
}
