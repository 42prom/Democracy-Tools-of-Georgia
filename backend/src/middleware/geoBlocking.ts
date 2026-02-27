// =============================================================================
// GEO-BLOCKING MIDDLEWARE
// Checks if the request IP is blocked by country or specific IP
// =============================================================================

import { Request, Response, NextFunction } from 'express';
import { GeoBlockingService } from '../services/geoBlocking';

/**
 * Get client IP from request
 */
function getClientIP(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || req.socket.remoteAddress || 'unknown';
}

/**
 * Check if IP is private/local
 */
function isPrivateIP(ip: string): boolean {
  return (
    ip === '127.0.0.1' ||
    ip === '::1' ||
    ip === 'localhost' ||
    ip.startsWith('192.168.') ||
    ip.startsWith('10.') ||
    ip.startsWith('172.16.') ||
    ip.startsWith('172.17.') ||
    ip.startsWith('172.18.') ||
    ip.startsWith('172.19.') ||
    ip.startsWith('172.20.') ||
    ip.startsWith('172.21.') ||
    ip.startsWith('172.22.') ||
    ip.startsWith('172.23.') ||
    ip.startsWith('172.24.') ||
    ip.startsWith('172.25.') ||
    ip.startsWith('172.26.') ||
    ip.startsWith('172.27.') ||
    ip.startsWith('172.28.') ||
    ip.startsWith('172.29.') ||
    ip.startsWith('172.30.') ||
    ip.startsWith('172.31.') ||
    ip.startsWith('::ffff:127.') ||
    ip.startsWith('::ffff:192.168.') ||
    ip.startsWith('::ffff:10.')
  );
}

/**
 * Geo-blocking middleware
 */
export async function geoBlockingMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const ip = getClientIP(req);

    // Skip localhost/private IPs
    if (isPrivateIP(ip)) {
      return next();
    }

    // Check if blocked
    const userAgent = req.headers['user-agent'] || undefined;
    const result = await GeoBlockingService.checkIP(ip, req.path, userAgent);

    if (result.blocked) {
      console.log(`[GeoBlocking] Blocked: IP=${ip}, Country=${result.country_code}, Path=${req.path}`);

      return res.status(403).json({
        error: 'Access denied',
        message: result.reason || 'Your region is not allowed to access this service',
        code: 'GEO_BLOCKED'
      });
    }

    // Attach geo info to request for logging
    (req as any).geoInfo = {
      ip,
      country_code: result.country_code,
      country_name: result.country_name
    };

    next();
  } catch (err) {
    console.error('[GeoBlocking] Middleware error:', err);
    // On error, allow request (fail-open for availability)
    next();
  }
}

/**
 * Geo-blocking middleware for specific features (enrollment, voting)
 */
export function geoBlockingFor(feature: 'enrollment' | 'voting' | 'admin') {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const settings = await GeoBlockingService.getSettings();

      // Check if blocking is enabled for this feature
      const featureKey = `block_${feature}`;
      if (settings[featureKey] !== 'true') {
        return next();
      }

      // Apply geo-blocking
      return geoBlockingMiddleware(req, res, next);
    } catch (err) {
      console.error('[GeoBlocking] Feature check error:', err);
      next();
    }
  };
}
