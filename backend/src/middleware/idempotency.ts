import { Request, Response, NextFunction } from 'express';
import { query } from '../db/client';

/**
 * Idempotency Middleware
 * 
 * Ensures that requests with the same 'Idempotency-Key' header are processed only once.
 * If a key exists and the request completed successfully, returns the stored response.
 * If the key is new, proceeds and caching the response hook.
 */
export const checkIdempotency = async (req: Request, res: Response, next: NextFunction) => {
  // Check both standard and X- prefixed headers
  const key = (req.headers['idempotency-key'] || req.headers['x-idempotency-key']) as string;

  // If no key provided, skip checks
  if (!key) {
    return next();
  }

  // User ID is optional but recommended for scoping keys
  const userId = req.credential?.sub || null;
  const path = req.originalUrl;

  try {
    // 1. Check if key exists
    const result = await query(
      `SELECT * FROM idempotency_keys WHERE key = $1`,
      [key]
    );

    if (result.rows.length > 0) {
      const record = result.rows[0];
      
      // Request already processed? Return stored response
      if (record.response_code) {
        console.log(`[Idempotency] Hit: ${key}`);
        return res.status(record.response_code).json(record.response_body);
      } else {
        // Request in progress? (Could implement locking/waiting here)
        // For now, fail fast to avoid race conditions
        return res.status(409).json({ error: 'Request with this Idempotency-Key is currently in progress' });
      }
    }

    // 2. Lock the key (insert generic placeholder)
    await query(
      `INSERT INTO idempotency_keys (key, user_id, path, params) VALUES ($1, $2, $3, $4)`,
      [key, userId, path, JSON.stringify(req.body)]
    );

    // 3. Hook sending response to store result
    const originalSend = res.json;
    res.json = function (body: any) {
      // Restore original method
      res.json = originalSend;

      // Store in DB (async, don't block response)
      query(
        `UPDATE idempotency_keys SET response_code = $1, response_body = $2 WHERE key = $3`,
        [res.statusCode, JSON.stringify(body), key]
      ).catch(err => console.error('[Idempotency] Failed to store response:', err));

      return originalSend.call(this, body);
    };

    next();

  } catch (err) {
    console.error('[Idempotency] Error:', err);
    // If DB fails, fallback to normal processing (fail open) vs fail closed?
    // Fail closed is safer for idempotency guarantees.
    return res.status(500).json({ error: 'Idempotency check failed' });
  }
};
