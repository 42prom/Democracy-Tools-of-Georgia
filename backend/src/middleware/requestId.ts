import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'node:crypto';

/**
 * Request ID middleware
 * Generates a unique ID for each request and attaches it to req.id
 * Also propagates it in X-Request-ID header
 */
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Accept only a bounded UUID supplied by a trusted caller. Arbitrary values
  // would otherwise become attacker-controlled log/audit identifiers.
  const supplied = req.headers['x-request-id'];
  const requestId = typeof supplied === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(supplied)
    ? supplied
    : randomUUID();
  
  // Attach to request object
  (req as any).id = requestId;
  
  // Set response header
  res.setHeader('X-Request-ID', requestId);
  
  next();
}

/**
 * Helper to get request ID from request object
 */
export function getRequestId(req: Request): string {
  return (req as any).id || 'unknown';
}
