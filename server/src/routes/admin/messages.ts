import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  createMessage,
  getMessage,
  listMessages,
  updateMessage,
  publishMessage,
  archiveMessage,
} from '../../services/messages.js';

const CreateMessageSchema = z.object({
  title: z.string().min(1),
  body: z.string().optional(),
  type: z.enum(['announcement', 'alert', 'reminder']),
  audience_rules: z
    .object({
      min_age: z.number().optional(),
      max_age: z.number().optional(),
      regions: z.array(z.string()).optional(),
      gender: z.enum(['M', 'F', 'all']).optional(),
    })
    .optional()
    .default({}),
  publish_at: z.string().optional(),
  expire_at: z.string().optional(),
});

const UpdateMessageSchema = z.object({
  title: z.string().min(1).optional(),
  body: z.string().optional(),
  type: z.enum(['announcement', 'alert', 'reminder']).optional(),
  audience_rules: z
    .object({
      min_age: z.number().optional(),
      max_age: z.number().optional(),
      regions: z.array(z.string()).optional(),
      gender: z.enum(['M', 'F', 'all']).optional(),
    })
    .optional(),
  publish_at: z.string().nullable().optional(),
  expire_at: z.string().nullable().optional(),
  status: z.enum(['draft', 'scheduled', 'published', 'archived']).optional(),
});

const adminMessagesRoutes: FastifyPluginAsync = async (fastify) => {
  // Same auth hook as polls (Phase 0: accept any Bearer token)
  fastify.addHook('onRequest', async (request, reply) => {
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return reply.code(401).send({ error: 'Admin authentication required' });
    }
  });

  // GET /api/v1/admin/messages
  fastify.get('/', async (request) => {
    const { status } = request.query as { status?: string };
    return await listMessages(status);
  });

  // POST /api/v1/admin/messages
  fastify.post('/', async (request) => {
    const body = CreateMessageSchema.parse(request.body);
    const msg = await createMessage(body);
    return { message: msg };
  });

  // GET /api/v1/admin/messages/:id
  fastify.get('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const msg = await getMessage(id);
    if (!msg) {
      return reply.code(404).send({ error: 'Message not found' });
    }
    return msg;
  });

  // PATCH /api/v1/admin/messages/:id
  fastify.patch('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = UpdateMessageSchema.parse(request.body);
    const msg = await updateMessage(id, body as any);
    if (!msg) {
      return reply.code(404).send({ error: 'Message not found' });
    }
    return msg;
  });

  // POST /api/v1/admin/messages/:id/publish
  fastify.post('/:id/publish', async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      return await publishMessage(id);
    } catch (error: any) {
      if (error.message === 'Message not found') {
        return reply.code(404).send({ error: error.message });
      }
      throw error;
    }
  });

  // POST /api/v1/admin/messages/:id/archive
  fastify.post('/:id/archive', async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      return await archiveMessage(id);
    } catch (error: any) {
      if (error.message === 'Message not found') {
        return reply.code(404).send({ error: error.message });
      }
      throw error;
    }
  });
};

export default adminMessagesRoutes;
