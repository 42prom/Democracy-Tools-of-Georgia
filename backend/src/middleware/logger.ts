import { Request } from 'express';
import pino from 'pino';
import pinoHttp from 'pino-http';
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
 * Configure Pino Logger
 * - Production: JSON format (fast, machine-readable)
 * - Development: Pretty print (human-readable)
 */
const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: process.env.NODE_ENV !== 'production' 
    ? { 
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
        }
      } 
    : undefined,
  redact: {
    paths: ['req.headers.authorization', 'req.body.password', 'req.body.token'],
    remove: true,
  },
});

/**
 * Structured JSON logging middleware using Pino
 */
export const requestLogger = pinoHttp({
  logger,
  // Use existing Request ID if present
  genReqId: (req: Request) => getRequestId(req) || req.id || crypto.randomUUID(),
  
  // Custom serializers
  serializers: {
    req: (req) => ({
      id: req.id,
      method: req.method,
      url: req.url,
      ip: req.ip,
      // Minimal headers to reduce noise
      headers: {
        'user-agent': req.headers['user-agent'],
        'content-type': req.headers['content-type'],
      },
    }),
    res: (res) => ({
      statusCode: res.statusCode,
    }),
  },
  
  // Quiet mode for health checks to reduce noise
  autoLogging: {
    ignore: (req) => {
      return req.url === '/health' || req.url === '/metrics';
    },
  },
});

export { logger }; // Export base logger for manual logging usage
