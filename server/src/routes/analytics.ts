import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { getPollResults } from '../services/analytics.js';

const GetResultsSchema = z.object({
  breakdownBy: z.array(z.enum(['age_bucket', 'gender', 'region_codes'])).optional(),
});

const analyticsRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * GET /api/v1/analytics/polls/:id/results
   * Get poll results with k-anonymity enforcement
   *
   * Query params:
   * - breakdownBy: Array of dimensions to break down by (age_bucket, gender, region_codes)
   *
   * Privacy protections:
   * - Suppresses any cell < k
   * - Applies complementary suppression
   * - Prevents overlapping cohort queries
   * - Returns aggregated data only
   */
  fastify.get('/polls/:id/results', async (request, reply) => {
    const { id } = request.params as { id: string };
    const query = request.query as any;

    // Parse breakdownBy from query string
    let breakdownBy: string[] | undefined;
    if (query.breakdownBy) {
      breakdownBy = Array.isArray(query.breakdownBy)
        ? query.breakdownBy
        : [query.breakdownBy];
    }

    try {
      const results = await getPollResults(id, breakdownBy);
      return results;
    } catch (error: any) {
      if (error.message.includes('inference attack')) {
        return reply.code(403).send({
          error: error.message,
          reason: 'overlapping_query_denied',
        });
      }
      throw error;
    }
  });
};

export default analyticsRoutes;
