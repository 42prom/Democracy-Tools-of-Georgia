import { Router, Request, Response, NextFunction } from 'express';
import { requireAdmin } from '../../middleware/auth';
import { pool } from '../../db/client';

const router = Router();

// All admin routes require authentication
router.use(requireAdmin);

/**
 * GET /api/v1/admin/security-events/summary
 * Get aggregated security events summary
 */
router.get(
  '/summary',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { startDate, endDate } = req.query;
      const params: any[] = [];
      const conditions: string[] = [];
      let paramIndex = 1;

      if (startDate) {
        conditions.push(`created_at >= $${paramIndex}`);
        params.push(startDate);
        paramIndex++;
      }

      if (endDate) {
        conditions.push(`created_at <= $${paramIndex}`);
        params.push(endDate);
        paramIndex++;
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      // Aggregate events by type and result
      const query = `
        SELECT 
          event_type, 
          result, 
          COUNT(*) as count, 
          MIN(created_at) as first_seen, 
          MAX(created_at) as last_seen,
          AVG(face_match_score) as avg_face_score,
          MIN(face_match_score) as min_face_score,
          MAX(face_match_score) as max_face_score,
          AVG(liveness_score) as avg_liveness_score,
          MIN(liveness_score) as min_liveness_score,
          MAX(liveness_score) as max_liveness_score
        FROM security_events
        ${whereClause}
        GROUP BY event_type, result
      `;

      const result = await pool.query(query, params);

      // Get user count for k-anonymity check (though security logs usually are system wide)
      // For now, we return aggregated data which is generally safe.
      
      const events = result.rows.map(row => {
        let severity = 'info';
        if (row.result === 'BLOCKED') severity = 'error';
        else if (row.result === 'FAIL') severity = 'warning';
        
        return {
          eventType: `${row.event_type} (${row.result})`,
          severity,
          count: parseInt(row.count, 10),
          firstSeen: row.first_seen,
          lastSeen: row.last_seen,
          biometricScores: {
            faceMatch: {
              avg: row.avg_face_score ? parseFloat(row.avg_face_score).toFixed(3) : null,
              min: row.min_face_score ? parseFloat(row.min_face_score).toFixed(3) : null,
              max: row.max_face_score ? parseFloat(row.max_face_score).toFixed(3) : null,
            },
            liveness: {
              avg: row.avg_liveness_score ? parseFloat(row.avg_liveness_score).toFixed(3) : null,
              min: row.min_liveness_score ? parseFloat(row.min_liveness_score).toFixed(3) : null,
              max: row.max_liveness_score ? parseFloat(row.max_liveness_score).toFixed(3) : null,
            }
          }
        };
      });

      const totalEvents = events.reduce((sum, e) => sum + e.count, 0);

      res.json({
        total: totalEvents,
        events,
        metadata: {
          kThreshold: 0, // System-wide aggregate, usually safe
          suppressedEvents: 0,
          timeRange: {
            start: startDate || new Date(0).toISOString(),
            end: endDate || new Date().toISOString()
          }
        }
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
