import { Request, Response, NextFunction } from 'express';

/**
 * Structured JSON logging middleware
 */
export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const start = Date.now();

  // Log request
  const requestLog = {
    timestamp: new Date().toISOString(),
    method: req.method,
    path: req.path,
    query: req.query,
    ip: req.ip,
    userAgent: req.get('user-agent'),
  };

  if (process.env.NODE_ENV === 'development') {
    console.log('→ Request', JSON.stringify(requestLog));
  }

  // Log response when finished
  res.on('finish', () => {
    const duration = Date.now() - start;
    const responseLog = {
      timestamp: new Date().toISOString(),
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
    };

    if (process.env.NODE_ENV === 'development') {
      console.log('← Response', JSON.stringify(responseLog));
    }
  });

  next();
}
