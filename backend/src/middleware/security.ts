import helmet from 'helmet';
import cors from 'cors';

/**
 * Security headers middleware (Helmet)
 * Configured for maximum security (Fortress Mode)
 */
export const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'"], // Strict: No unsafe-inline
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'", 'https:'],
      frameAncestors: ["'none'"], // Prevent iframe embedding
      objectSrc: ["'none'"],
      upgradeInsecureRequests: [],
    },
  },
  crossOriginEmbedderPolicy: true,
  crossOriginOpenerPolicy: { policy: "same-origin" },
  crossOriginResourcePolicy: { policy: "same-origin" },
  dnsPrefetchControl: { allow: false },
  frameguard: { action: 'deny' },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
  referrerPolicy: { policy: "strict-origin-when-cross-origin" },
});

/**
 * Permissions-Policy Middleware
 * Explicitly disables powerful browser features that the API never needs
 */
export const permissionsPolicy = (_req: any, res: any, next: any) => {
  res.setHeader(
    'Permissions-Policy',
    'accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()'
  );
  next();
};

/**
 * CORS middleware with strict origin control
 * Supports local development, Cloudflare Tunnel, and custom domains
 */
export const corsMiddleware = cors({
  origin: (origin, callback) => {
    const allowedOrigins = (process.env.CORS_ORIGIN?.split(',') || [
      'http://localhost:5173',
      'http://localhost:3000',
    ]).map(value => value.trim()).filter(Boolean);

    // Allow requests with no origin (mobile apps, Postman, curl, etc.)
    if (!origin) {
      return callback(null, true);
    }

    // Check exact match
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    // Local wildcard origins are development-only. Production and test are
    // exact-match only so a sibling/subdomain cannot gain credentialed CORS.
    if (process.env.NODE_ENV === 'development') {
      if (origin.match(/^http:\/\/(localhost|127\.0\.0\.1|10\.0\.2\.2):\d+$/)) {
        return callback(null, true);
      }
    }

    callback(new Error(`CORS blocked: ${origin}`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID', 'X-Admin-CSRF'],
  exposedHeaders: ['X-Request-ID'],
});
