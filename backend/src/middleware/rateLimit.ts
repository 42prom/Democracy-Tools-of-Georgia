import rateLimit from 'express-rate-limit';

// General API rate limit (300 reqs per 1 min)
export const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, 
  max: 300, 
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' }
});

// Stricter limit for Auth/Admin
// Strict limit: 60 reqs per 1 min (1 per second average)
export const authLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many authentication attempts, please try again later.' }
});

// Admin credentials are high-value and must not be brute-forced. Successful
// logins do not consume the failure budget; production should additionally use
// a shared Redis-backed limiter when running more than one API replica.
export const adminLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many failed admin login attempts. Try again later.' },
});

// A separate authenticated admin budget prevents expensive control-plane
// scraping while keeping the public API limiter independent.
export const adminApiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many admin requests. Try again later.' },
});
