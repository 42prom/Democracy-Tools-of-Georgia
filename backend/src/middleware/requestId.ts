import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';

/**
 * Request ID middleware
 * Generates a unique ID for each request and attaches it to req.id
 * Also propagates it in X-Request-ID header
 */
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Use existing request ID from client if present, otherwise generate new
  const requestId = (req.headers['x-request-id'] as string) || uuidv4();
  
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
