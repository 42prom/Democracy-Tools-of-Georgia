import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { submitVote } from '../services/votes.js';

const VoteSchema = z.object({
  pollId: z.string().uuid(),
  optionId: z.string().uuid(),
  nullifier: z.string().min(32), // SHA-256 hash or similar
  timestampBucket: z.number().int().positive(),
});

const votesRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * POST /api/v1/votes
   * Submit a vote with session attestation
   *
   * Requirements:
   * - Verify attestation signature and not expired
   * - Verify votePayloadHash matches
   * - Enforce unique nullifier
   */
  fastify.post('/', async (request, reply) => {
    // Extract attestation from Authorization header
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return reply.code(401).send({ error: 'Missing Authorization header' });
    }

    const attestation = authHeader.substring(7);

    const body = VoteSchema.parse(request.body);

    try {
      const result = await submitVote({ ...body, attestation });
      return result;
    } catch (error: any) {
      const message = error.message;

      // Map specific errors to status codes
      if (message.includes('Attestation verification failed')) {
        return reply.code(401).send({ error: message });
      }
      if (message.includes('Attestation not valid for this poll')) {
        return reply.code(403).send({ error: message });
      }
      if (message.includes('Vote payload hash mismatch')) {
        return reply.code(400).send({ error: message });
      }
      if (message.includes('Already voted')) {
        return reply.code(409).send({ error: message });
      }
      if (message.includes('not active')) {
        return reply.code(404).send({ error: message });
      }
      if (message.includes('Not eligible')) {
        return reply.code(403).send({ error: message });
      }

      throw error;
    }
  });
};

export default votesRoutes;
