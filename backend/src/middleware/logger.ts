import { Request, Response, NextFunction } from 'express';
import { getRequestId } from './requestId';

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      id?: string;
    }
  }
}

/**
 * Structured JSON logging middleware
 * Uses request ID from requestIdMiddleware (must be mounted before this)
 */
export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const requestId = getRequestId(req);
  const start = Date.now();

  // Log request (Production: only log if error or sensitive? Or always?
  // Common practice: Log all access in JSON)
  // We'll log request Start only in dev to reduce noise, but Response always.
  
  if (process.env.NODE_ENV === 'development') {
    const requestLog = {
      level: 'info',
      type: 'request',
      requestId,
      timestamp: new Date().toISOString(),
      method: req.method,
      path: req.path,
      ip: req.ip,
    };
    console.log(JSON.stringify(requestLog));
  }

  // Log response when finished
  res.on('finish', () => {
    const duration = Date.now() - start;
    const responseLog = {
      level: res.statusCode >= 400 ? 'error' : 'info',
      type: 'response',
      requestId,
      timestamp: new Date().toISOString(),
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      durationMs: duration,
    };

    // Always log responses in JSON
    console.log(JSON.stringify(responseLog));
  });

  next();
}
