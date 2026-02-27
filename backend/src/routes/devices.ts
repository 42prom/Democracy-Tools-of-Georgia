import { Router, Request, Response, NextFunction } from 'express';
import { requireCredential } from '../middleware/auth';
import { query } from '../db/client';
import { createError } from '../middleware/errorHandler';

const router = Router();


/**
 * POST /api/v1/devices/register
 * body: { token: string, platform: 'android' | 'ios' | 'web' }
 */
router.post('/register', requireCredential, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { token, platform } = req.body;
    const userId = req.credential?.sub;

    if (!token || !platform) {
      throw createError('Token and platform are required', 400);
    }

    if (!userId) {
      throw createError('Not authenticated', 401);
    }

    // Upsert token
    await query(`
      INSERT INTO device_tokens (user_id, token, platform, last_seen_at, updated_at)
      VALUES ($1, $2, $3, now(), now())
      ON CONFLICT (token) DO UPDATE SET
        user_id = EXCLUDED.user_id,
        platform = EXCLUDED.platform,
        last_seen_at = now(),
        updated_at = now(),
        enabled = true -- Re-enable if it was disabled
    `, [userId, token, platform]);

    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/v1/devices/unregister
 * body: { token: string }
 */
router.delete('/unregister', requireCredential, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { token } = req.body;
    const userId = req.credential?.sub;

    if (!token) {
      throw createError('Token is required', 400);
    }

    if (!userId) {
      throw createError('Not authenticated', 401);
    }

    await query('DELETE FROM device_tokens WHERE token = $1 AND user_id = $2', [token, userId]);

    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

export default router;
