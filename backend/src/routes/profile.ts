import { Router, Request, Response, NextFunction } from 'express';
import { requireCredential } from '../middleware/auth';
import { query } from '../db/client';
import { createError } from '../middleware/errorHandler';

const router = Router();


/**
 * GET /api/v1/profile/me
 * Returns user preferences
 */
router.get('/me', requireCredential, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.credential?.sub;
    if (!userId) throw createError('Not authenticated', 401);

    // Get user's notifications_enabled from users table
    const userRes = await query('SELECT notifications_enabled FROM users WHERE id = $1', [userId]);
    const notificationsEnabled = userRes.rows[0].notifications_enabled;

    // Get specific preferences from device_tokens (join or just latest)
    // For simplicity, we'll return the defaults OR the latest token's settings
    const tokenRes = await query(`
      SELECT polls_enabled, messages_enabled 
      FROM device_tokens 
      WHERE user_id = $1 
      ORDER BY updated_at DESC LIMIT 1
    `, [userId]);

    const prefs = tokenRes.rows[0] || { polls_enabled: true, messages_enabled: true };

    res.json({
      notifications_enabled: notificationsEnabled,
      polls_enabled: prefs.polls_enabled,
      messages_enabled: prefs.messages_enabled,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /api/v1/profile/me
 * Update user preferences
 */
router.patch('/me', requireCredential, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.credential?.sub;
    if (!userId) throw createError('Not authenticated', 401);

    const { notifications_enabled, polls_enabled, messages_enabled } = req.body;

    // Update users table
    if (notifications_enabled !== undefined) {
      await query('UPDATE users SET notifications_enabled = $1 WHERE id = $2', [notifications_enabled, userId]);
    }

    // Update device_tokens for ALL user's devices
    const updates = [];
    const values = [userId];
    let queryStr = 'UPDATE device_tokens SET ';

    if (polls_enabled !== undefined) {
      values.push(polls_enabled);
      updates.push(`polls_enabled = $${values.length}`);
    }
    if (messages_enabled !== undefined) {
      values.push(messages_enabled);
      updates.push(`messages_enabled = $${values.length}`);
    }

    if (updates.length > 0) {
      queryStr += updates.join(', ') + ', updated_at = now() WHERE user_id = $1';
      await query(queryStr, values);
    }

    res.json({
      ok: true,
      notifications_enabled,
      polls_enabled,
      messages_enabled
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/profile/wallet
 * Bind a wallet address to the user profile
 */
router.post('/wallet', requireCredential, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.credential?.sub;
    if (!userId) throw createError('Not authenticated', 401);

    const { walletAddress } = req.body;

    if (!walletAddress || !/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
      throw createError('Invalid wallet address format', 400);
    }

    await query('UPDATE users SET wallet_address = $1 WHERE id = $2', [walletAddress, userId]);

    res.json({
      success: true,
      walletAddress
    });
  } catch (error) {
    next(error);
  }
});

export default router;
