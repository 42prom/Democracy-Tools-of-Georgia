import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { createPoll, getPoll, estimateAudience, publishPoll } from '../../services/polls';

const CreatePollSchema = z.object({
  title: z.string(),
  description: z.string().optional(),
  type: z.enum(['election', 'referendum', 'survey']),
  options: z.array(z.string()).min(2),
  audience_rules: z.object({
    min_age: z.number().optional(),
    max_age: z.number().optional(),
    regions: z.array(z.string()).optional(),
    gender: z.enum(['M', 'F', 'all']).optional(),
  }),
});

const EstimateSchema = z.object({
  rules: z.object({
    min_age: z.number().optional(),
    max_age: z.number().optional(),
    regions: z.array(z.string()).optional(),
    gender: z.enum(['M', 'F', 'all']).optional(),
  }),
});

const adminPollsRoutes: FastifyPluginAsync = async (fastify) => {
  // Stub auth hook (Phase 0)
  fastify.addHook('onRequest', async (request, reply) => {
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return reply.code(401).send({ error: 'Admin authentication required' });
    }
    // Phase 0: Accept any token
  });

  // POST /api/v1/admin/polls
  fastify.post('/', async (request) => {
    const body = CreatePollSchema.parse(request.body);
    const poll = await createPoll(body);
    return { poll };
  });

  // GET /api/v1/admin/polls/:id
  fastify.get('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const poll = await getPoll(id);

    if (!poll) {
      return reply.code(404).send({ error: 'Poll not found' });
    }

    return poll;
  });

  // POST /api/v1/admin/polls/:id/estimate
  fastify.post('/:id/estimate', async (request) => {
    const body = EstimateSchema.parse(request.body);
    const estimate = await estimateAudience(body.rules);
    return estimate;
  });

  // POST /api/v1/admin/polls/:id/publish
  fastify.post('/:id/publish', async (request, reply) => {
    const { id } = request.params as { id: string };

    try {
      const result = await publishPoll(id);
      return result;
    } catch (error: any) {
      if (String(error?.message || '').includes('Privacy violation')) {
        return reply.code(400).send({ error: error.message });
      }
      throw error;
    }
  });
};

export default adminPollsRoutes;
