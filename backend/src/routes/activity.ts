import { Router, Request, Response, NextFunction } from 'express';
import { requireCredential } from '../middleware/auth';
import { pool } from '../db/client';
import { createError } from '../middleware/errorHandler';

const router = Router();

/**
 * GET /api/v1/activity/me
 * Get user's activity history (participations + rewards)
 *
 * Privacy: Returns ONLY participation status and rewards.
 * Does NOT reveal vote choice/option_id.
 */
router.get(
  '/me',
  requireCredential,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.credential) {
        throw createError('Credential missing', 401);
      }

      const userId = req.credential.sub;
      const deviceKeyHash = req.credential.sub; // Same identifier in MVP

      // Join poll_participants (participation) with user_rewards (rewards) and polls (metadata)
      // LEFT JOIN on rewards because not all participations have rewards
      const result = await pool.query(
        `SELECT
            pp.poll_id,
            pp.participated_at as voted_at,
            p.title,
            p.type,
            p.end_at,
            p.status,
            r.amount as reward_amount,
            r.token_symbol as reward_token,
            r.status as reward_status
         FROM poll_participants pp
         JOIN polls p ON pp.poll_id = p.id
         LEFT JOIN user_rewards r ON r.poll_id = pp.poll_id AND r.device_key_hash = $2
         WHERE pp.user_id = $1
         ORDER BY pp.participated_at DESC`,
        [userId, deviceKeyHash]
      );

      // Map to ActivityItem shape expected by mobile
      const activities = result.rows.map(row => ({
        pollId: row.poll_id,
        title: row.title,
        type: row.type,
        votedAt: row.voted_at,
        endsAt: row.end_at,
        status: row.status,
        // Only include reward if there is one
        ...(row.reward_amount ? {
          rewardAmount: parseFloat(row.reward_amount).toString(),
          rewardToken: row.reward_token,
        } : {})
      }));

      res.json({ activities });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
