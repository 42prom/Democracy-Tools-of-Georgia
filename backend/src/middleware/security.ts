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
    const allowedOrigins = process.env.CORS_ORIGIN?.split(',') || [
      'http://localhost:5173',
      'http://localhost:3000',
    ];

    // Allow requests with no origin (mobile apps, Postman, curl, etc.)
    if (!origin) {
      return callback(null, true);
    }

    // Check exact match
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    // Allow Cloudflare Tunnel domains (*.trycloudflare.com)
    if (origin.endsWith('.trycloudflare.com')) {
      return callback(null, true);
    }

    // Allow esme.ge domain (production tunnel)
    if (origin.endsWith('.esme.ge') || origin === 'https://esme.ge') {
      return callback(null, true);
    }

    // Allow any localhost port for development
    if (origin.match(/^http:\/\/localhost:\d+$/)) {
      return callback(null, true);
    }

    // Allow 10.0.2.2 (Android emulator) and 127.0.0.1
    if (origin.match(/^http:\/\/(10\.0\.2\.2|127\.0\.0\.1)(:\d+)?$/)) {
      return callback(null, true);
    }

    // In development mode, allow all origins
    if (process.env.NODE_ENV === 'development') {
      console.log(`[CORS] Allowing origin in dev mode: ${origin}`);
      return callback(null, true);
    }

    callback(new Error(`CORS blocked: ${origin}`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
  exposedHeaders: ['X-Request-ID'],
});
