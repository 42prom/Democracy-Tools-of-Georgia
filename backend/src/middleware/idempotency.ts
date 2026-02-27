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

        // Self-healing: Handle legacy double-encoded records in database
        // Some records may have been stored with JSON.stringify() causing string values
        let body = record.response_body;
        let parseCount = 0;
        while (typeof body === 'string' && parseCount < 5) {
          try {
            const parsed = JSON.parse(body);
            if (parsed !== body) {
              body = parsed;
              parseCount++;
            } else {
              break;
            }
          } catch (e) {
            break;
          }
        }
        if (parseCount > 0) {
          console.log(`[Idempotency] Self-healed body for ${key} (${parseCount} layers of encoding fixed)`);
        }

        return res.status(record.response_code).json(body);
      } else {
        // Request in progress? (Could implement locking/waiting here)
        // For now, fail fast to avoid race conditions
        return res.status(409).json({ error: 'Request with this Idempotency-Key is currently in progress' });
      }
    }

    // 2. Lock the key (insert generic placeholder)
    // Note: Pass object directly - pg driver handles object->jsonb conversion correctly
    await query(
      `INSERT INTO idempotency_keys (key, user_id, path, params) VALUES ($1, $2, $3, $4)`,
      [key, userId, path, req.body]
    );

    // 3. Hook sending response to store result
    const originalSend = res.json;
    res.json = function (body: any) {
      // Restore original method
      res.json = originalSend;

      // Store in DB (async, don't block response)
      // CRITICAL: Pass object directly to pg, NOT JSON.stringify()
      // Using JSON.stringify() causes double-encoding: pg stores a JSON string instead of JSON object
      // This breaks Flutter clients expecting Map<String, dynamic> but receiving String
      query(
        `UPDATE idempotency_keys SET response_code = $1, response_body = $2 WHERE key = $3`,
        [res.statusCode, body, key]
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
