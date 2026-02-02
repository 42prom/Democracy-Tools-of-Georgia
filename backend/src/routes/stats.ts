import { Router, Request, Response, NextFunction } from 'express';
import { getPollResults } from '../services/analytics';
import { createError } from '../middleware/errorHandler';

const router = Router();

/**
 * GET /api/v1/stats/polls/:id
 * GET /api/v1/stats/polls/:id/results (alias)
 * Get poll results with optional grouping
 * Query params:
 *   - groupBy: 'region' | 'age_bucket' | 'gender'
 */
const getPollResultsHandler = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const groupBy = req.query.groupBy as 'region' | 'age_bucket' | 'gender' | undefined;

    // Validate groupBy parameter
    if (groupBy && !['region', 'age_bucket', 'gender'].includes(groupBy)) {
      throw createError('Invalid groupBy parameter', 400);
    }

    const results = await getPollResults(String(id), groupBy);

    res.json(results);
  } catch (error) {
    next(error);
  }
};

router.get('/polls/:id', getPollResultsHandler);
router.get('/polls/:id/results', getPollResultsHandler);

export default router;
