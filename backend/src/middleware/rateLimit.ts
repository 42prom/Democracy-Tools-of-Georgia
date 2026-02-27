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
