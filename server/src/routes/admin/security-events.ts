import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { getSecurityEventsSummary } from '../../services/analytics';

const SummarySchema = z.object({
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  eventTypes: z.array(z.string()).optional(),
});

const securityEventsRoutes: FastifyPluginAsync = async (fastify) => {
  // Admin auth hook
  fastify.addHook('onRequest', async (request, reply) => {
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return reply.code(401).send({ error: 'Admin authentication required' });
    }
  });

  // GET /api/v1/admin/security-events/summary
  fastify.get('/summary', async (request) => {
    const query = request.query as any;

    const options = {
      startDate: query.startDate ? new Date(query.startDate) : undefined,
      endDate: query.endDate ? new Date(query.endDate) : undefined,
      eventTypes: query.eventTypes
        ? Array.isArray(query.eventTypes)
          ? query.eventTypes
          : [query.eventTypes]
        : undefined,
    };

    const summary = await getSecurityEventsSummary(options);
    return summary;
  });
};

export default securityEventsRoutes;
