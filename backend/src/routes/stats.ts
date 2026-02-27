import { Router, Request, Response, NextFunction } from 'express';
import { getPollResults } from '../services/analytics';
import { createError } from '../middleware/errorHandler';
import { AppConfig } from '../config/app';

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

    // PRIVACY: Apply noise to prevent differencing attacks
    // Only apply for live polls - ended polls show exact results
    if (results.pollEnded) {
      // Poll ended - return exact results without noise
      res.json(results);
    } else {
      // Live poll - apply privacy noise
      const noisyResults = applyPrivacyNoise(results);
      res.json(noisyResults);
    }
  } catch (error) {
    next(error);
  }
};

/**
 * Applies deterministic noise to vote counts
 */

function applyPrivacyNoise(data: any): any {
  if (Array.isArray(data)) {
    return data.map(item => applyPrivacyNoise(item));
  } else if (typeof data === 'object' && data !== null) {
    const result = { ...data };
    for (const key in result) {
       if (key === 'count' || key === 'vote_count') {
          if (!AppConfig.ENABLE_PRIVACY_NOISE) {
             // Noise disabled, return exact count
             continue;
          }

          const val = Number(result[key]);
          if (!isNaN(val)) {
             // NEW RULE: After 3 voices, do not round.
             // If < 3, return 0 to protect privacy.
             // If >= 3, return exact count.
             result[key] = val < 3 ? 0 : val;
          }
       } else if (typeof result[key] === 'object') {
          result[key] = applyPrivacyNoise(result[key]);
       }
    }
    return result;
  }
  return data;
}

router.get('/polls/:id', getPollResultsHandler);
router.get('/polls/:id/results', getPollResultsHandler);

export default router;
