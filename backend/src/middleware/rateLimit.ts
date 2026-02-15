import rateLimit from 'express-rate-limit';

// General API rate limit (1000 reqs per 1 min)
export const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, 
  max: 1000, 
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' }
});

// Stricter limit for Auth/Admin
// Relaxed for admin usage: 1000 reqs per 1 min
export const authLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many authentication attempts, please try again later.' }
});
