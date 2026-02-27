import { Request, Response, NextFunction } from 'express';

export interface AppError extends Error {
  statusCode?: number;
  code?: string;
  details?: unknown;
  isOperational?: boolean;
  retryAfter?: number;
  resetAt?: Date;
}

/**
 * Global error handler middleware
 * IMPORTANT: Never expose stack traces in production
 */
export function errorHandler(
  err: AppError,
  req: Request,
  res: Response,
  _next: NextFunction
) {
  // Default to 500 server error
  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal Server Error';

  // Log error details
  console.error('Error:', {
    timestamp: new Date().toISOString(),
    method: req.method,
    path: req.path,
    statusCode,
    message,
    stack: err.stack,
  });

  // Special logging for the current investigation
  if (message && message.includes('length')) {
    const report = `\n\n[${new Date().toISOString()}] CRASH REPORT:\nMessage: ${message}\nStack: ${err.stack}\n========================\n\n`;
    console.error(report);
    try {
      require('fs').appendFileSync('DEBUG_POLL_SAFE.txt', report);
    } catch (e) {
      console.error('Failed to write crash log:', e);
    }
  }

  // Send sanitized error response
  const response: any = {
    error: {
      message,
      statusCode,
    },
  };

  if (err.code) {
    response.error.code = err.code;
  }
  if (err.details !== undefined) {
    response.error.details = err.details;
  }

  // Include rate limit information if present
  if (err.retryAfter !== undefined) {
    response.error.retryAfter = err.retryAfter;
  }
  if (err.resetAt !== undefined) {
    response.error.resetAt = err.resetAt;
  }

  // Only include stack trace in development
  if (process.env.NODE_ENV === 'development') {
    response.error.stack = err.stack;
  }

  res.status(statusCode).json(response);
}

/**
 * 404 handler for undefined routes
 */
export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({
    error: {
      message: 'Route not found',
      statusCode: 404,
      path: req.path,
    },
  });
}

/**
 * Create operational error (known error types)
 */
export function createError(message: string, statusCode: number): AppError {
  const error: AppError = new Error(message);
  error.statusCode = statusCode;
  error.isOperational = true;
  return error;
}

/**
 * Create an operational error with a stable machine-readable code.
 */
export function createErrorWithCode(
  code: string,
  message: string,
  statusCode: number,
  details?: unknown
): AppError {
  const error: AppError = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  error.details = details;
  error.isOperational = true;
  return error;
}
