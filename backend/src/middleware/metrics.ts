import { Request, Response, NextFunction } from 'express';
import client from 'prom-client';

// Create a Registry
const register = new client.Registry();

// Add default metrics (CPU, Memory, Event Loop)
client.collectDefaultMetrics({ register, prefix: 'dtg_backend_' });

// Define custom metrics
const httpRequestDurationMicroseconds = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.1, 0.5, 1, 1.5, 2, 5],
  registers: [register],
});

const httpRequestsTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register],
});

const httpErrorsTotal = new client.Counter({
  name: 'http_errors_total',
  help: 'Total number of HTTP errors',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register],
});

/**
 * Middleware to collect Prometheus metrics
 */
export function metricsMiddleware(req: Request, res: Response, next: NextFunction) {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000;
    // Normalize route to avoid high cardinality (e.g., /polls/123 -> /polls/:id)
    // req.route.path is available if the route was matched
    const route = req.route ? req.originalUrl.replace(req.url, req.route.path) : req.path;
    const status = res.statusCode.toString();
    
    httpRequestDurationMicroseconds.observe(
      { method: req.method, route, status_code: status },
      duration
    );
    
    httpRequestsTotal.inc({ method: req.method, route, status_code: status });
    
    if (res.statusCode >= 400) {
      httpErrorsTotal.inc({ method: req.method, route, status_code: status });
    }
  });

  next();
}

/**
 * Get Content-Type for Prometheus metrics
 */
export function getMetricsContentType(): string {
  return register.contentType;
}

/**
 * Get current metrics snapshot
 */
export async function getMetrics(): Promise<string> {
  return await register.metrics();
}
