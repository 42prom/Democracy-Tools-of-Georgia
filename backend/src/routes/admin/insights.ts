import { Router, Request, Response, NextFunction } from 'express';
import { requireAdmin } from '../../middleware/auth';
import { pool } from '../../db/client';

const router = Router();

// All admin routes require authentication
router.use(requireAdmin);

/**
 * GET /api/v1/admin/insights/distributions
 * Get aggregated user distribution data with k-anonymity enforcement
 */
router.get(
  '/distributions',
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const MIN_K_ANONYMITY = parseInt(process.env.MIN_K_ANONYMITY || '30', 10);

      // Get total user count
      const totalResult = await pool.query('SELECT COUNT(*) as count FROM users');
      const totalUsers = parseInt(totalResult.rows[0].count, 10);

      // For now, return empty distributions
      // This endpoint will be fully implemented with proper aggregation in Phase 1
      const response = {
        totalUsers: totalUsers < MIN_K_ANONYMITY ? '<k' : totalUsers,
        dimensions: [],
        metadata: {
          kThreshold: MIN_K_ANONYMITY,
          suppressedCells: 0,
          queryTimestamp: new Date().toISOString(),
        },
      };

      res.json(response);
    } catch (error) {
      next(error);
    }
  }
);

export default router;
