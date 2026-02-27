import { Request, Response, NextFunction } from 'express';
import { verifyCredential } from '../services/credentials';
import { VotingCredential } from '../types/credentials';
import { createError } from './errorHandler';
import jwt from 'jsonwebtoken';

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
  _res: Response,
  next: NextFunction
) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.log('[Auth] Missing or invalid Authorization header');
      throw createError('Missing or invalid Authorization header', 401);
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Verify and decode JWT
    try {
      const credential = verifyCredential(token);
      // Attach to request object
      req.credential = credential;
      next();
    } catch (verError: any) {
      console.error('[Auth] Verification failed:', verError.message);
      // Check if token is garbage or secret mismatch
      throw verError;
    }
  } catch (error) {
    next(createError('Invalid or expired credential', 401));
  }
}

// Extend Express Request type to include adminUser
declare global {
  namespace Express {
    interface Request {
      adminUser?: {
        id: string;
        email: string;
        role: string;
      };
    }
  }
}

/**
 * Admin authentication middleware
 * Supports both Phase 0 simple password (env var) and proper JWT auth
 */
export function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  // Debug logging
  // console.log(`[Auth] requireAdmin. Method: ${req.method}, Path: ${req.path}`);

  // 1. Check for bypass (Development only)
  if (process.env.NODE_ENV === 'development' && process.env.BYPASS_ADMIN_AUTH === 'true') {
     // console.log('⚠️  DEV MODE: Admin authentication bypassed');
     (req as any).adminUser = { id: 'dev-admin', email: 'admin@example.com', role: 'superadmin' };
     return next();
  }

  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw createError('Missing or invalid Authorization header', 401);
    }

    const token = authHeader.substring(7);

    // 2. Try JWT Verification (New Flow)
    try {
        const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-do-not-use-in-prod';
        const decoded = jwt.verify(token, JWT_SECRET) as any;
        
        if (decoded.type === 'admin') {
            req.adminUser = {
                id: decoded.sub,
                email: decoded.email,
                role: decoded.role
            };
            return next();
        }
    } catch (jwtError) {
        // JWT failed, fall through to check simple password (Phase 0 legacy)
    }

    // 3. Fallback: Check simple admin password (Phase 0 - Development ONLY)
    // Only allowed in development mode with explicit ADMIN_PASSWORD set
    if (process.env.NODE_ENV === 'development' && process.env.ADMIN_PASSWORD && token === process.env.ADMIN_PASSWORD) {
       console.warn('⚠️  DEV MODE: Using legacy admin password authentication');
       req.adminUser = { id: 'legacy-admin', email: 'admin@legacy', role: 'superadmin' };
       return next();
    }

    throw createError('Admin authentication required', 403);
  } catch (error) {
    next(createError('Admin authentication failed', 403));
  }
}
