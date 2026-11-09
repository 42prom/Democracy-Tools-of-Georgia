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
  const isProduction = process.env.NODE_ENV === 'production';
  const exposedMessage = isProduction && statusCode >= 500 ? 'Internal Server Error' : message;

  // Log error details
  const logEntry: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    method: req.method,
    path: req.path,
    statusCode,
    message,
    code: err.code,
  };
  if (!isProduction && err.stack) {
    logEntry.stack = err.stack;
  }
  console.error('Error:', logEntry);

  // Send sanitized error response
  const response: any = {
    error: {
      message: exposedMessage,
      statusCode,
    },
  };

  if (err.code) {
    response.error.code = err.code;
  }
  if (err.details !== undefined && (!isProduction || statusCode < 500)) {
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
