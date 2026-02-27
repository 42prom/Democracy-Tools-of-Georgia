import { Request, Response, NextFunction } from 'express';
import { AuthRateLimiter, RateLimitResult } from '../services/authRateLimit';

export type LimitType = 'enrollment' | 'login' | 'biometric' | 'vote';

/**
 * Dynamic Rate Limiter Middleware
 *
 * This middleware CHECKS if the request should be allowed based on previous failures.
 * It does NOT increment counters - that should be done by the route handler on FAILURE.
 *
 * Best practices:
 * - Only blocks based on FAILED attempts (not all requests)
 * - Rate limit counters are reset on SUCCESS (done in route handlers)
 * - Settings are loaded dynamically from admin configuration
 *
 * Usage in route handler after this middleware:
 * - On FAILURE: await AuthRateLimiter.recordFailure(type, identifiers, 'reason')
 * - On SUCCESS: await AuthRateLimiter.resetOnSuccess(type, identifiers)
 */
export const dynamicRateLimit = (type: LimitType) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const ip = req.ip || req.socket.remoteAddress || 'unknown';
      const deviceId = req.body?.deviceId || req.headers['x-device-id'] as string;
      const pnHash = req.body?.pnHash || req.body?.personalNumber || req.body?.pnDigits;
      const userId = req.credential?.sub;
      const pollId = req.body?.pollId || req.params.pollId;

      // Check rate limits based on previous failures
      const result: RateLimitResult = await AuthRateLimiter.checkRateLimit(type, {
        ip,
        deviceId,
        pnHash,
        userId,
        pollId,
      });

      // Add rate limit info to response headers
      res.setHeader('X-RateLimit-Remaining', result.remaining.toString());
      res.setHeader('X-RateLimit-Reset', result.resetAt.toISOString());

      if (!result.allowed) {
        // Blocked due to too many failures
        res.setHeader('Retry-After', (result.retryAfter || 60).toString());

        console.warn(`[DynamicRateLimit] Blocked ${type} from IP ${ip} (${result.blockedBy})`);

        res.status(429).json({
          error: 'Too many failed attempts. Please try again later.',
          retryAfter: result.retryAfter ? `${Math.ceil(result.retryAfter / 60)} minutes` : '1 minute',
          blockedBy: result.blockedBy,
        });
        return;
      }

      // Store identifiers in request for use by route handlers
      (req as any).rateLimitIdentifiers = {
        ip,
        deviceId,
        pnHash,
        userId,
        pollId,
      };
      (req as any).rateLimitType = type;

      next();
    } catch (error) {
      console.error('[DynamicRateLimit] Middleware error:', error);
      // Fail open to avoid blocking legitimate users on system error
      next();
    }
  };
};

/**
 * Helper function for route handlers to record failures
 * Call this when an operation FAILS
 */
export async function recordRateLimitFailure(req: Request, reason?: string): Promise<void> {
  const identifiers = (req as any).rateLimitIdentifiers;
  const type = (req as any).rateLimitType;

  if (identifiers && type) {
    await AuthRateLimiter.recordFailure(type, identifiers, reason);
  }
}

/**
 * Helper function for route handlers to reset limits on success
 * Call this when an operation SUCCEEDS
 */
export async function resetRateLimitOnSuccess(req: Request): Promise<void> {
  const identifiers = (req as any).rateLimitIdentifiers;
  const type = (req as any).rateLimitType;

  if (identifiers && type) {
    await AuthRateLimiter.resetOnSuccess(type, identifiers);
  }
}
