import { Request, Response, NextFunction } from 'express';
import { verifyCredential } from '../services/credentials';
import { VotingCredential } from '../types/credentials';
import { createError } from './errorHandler';

// Extend Express Request type to include credential
declare global {
  namespace Express {
    interface Request {
      credential?: VotingCredential;
    }
  }
}

/**
 * Middleware to verify JWT credential from Authorization header
 * Attaches decoded credential to req.credential
 */
export function requireCredential(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw createError('Missing or invalid Authorization header', 401);
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Verify and decode JWT
    const credential = verifyCredential(token);

    // Attach to request object
    req.credential = credential;

    next();
  } catch (error) {
    next(createError('Invalid or expired credential', 401));
  }
}

/**
 * Mock admin authentication (Phase 0 only)
 * Phase 1 will implement proper admin auth with MFA
 *
 * DEVELOPMENT MODE: Authentication is disabled for easier development
 * PRODUCTION MODE: Will require proper authentication
 */
export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  // Skip authentication in development mode
  if (process.env.NODE_ENV === 'development') {
    console.log('⚠️  DEV MODE: Admin authentication bypassed');
    return next();
  }

  // Production mode: Require authentication
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw createError('Missing or invalid Authorization header', 401);
    }

    const token = authHeader.substring(7);

    // Phase 0: Mock admin token validation
    // For now, accept any token that equals the mock admin password
    if (token === process.env.ADMIN_PASSWORD || token === 'phase0password') {
      next();
    } else {
      throw createError('Admin authentication required', 403);
    }
  } catch (error) {
    next(createError('Admin authentication failed', 403));
  }
}
