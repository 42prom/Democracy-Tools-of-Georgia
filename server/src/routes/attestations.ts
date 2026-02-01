import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { NonceService } from '../services/nonce.js';
import { issueAttestation } from '../services/attestations.js';

const ChallengeSchema = z.object({
  deviceId: z.string(),
});

const IssueSchema = z.object({
  deviceKey: z.string(),
  pollId: z.string().uuid(),
  optionId: z.string().uuid(),
  timestampBucket: z.number().int().positive(),
  nonce: z.string().length(64), // 32 bytes hex
});

const attestationsRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * POST /api/v1/attestations/challenge
   * Generate a server nonce for attestation issuance
   */
  fastify.post('/challenge', async (request, reply) => {
    const body = ChallengeSchema.parse(request.body);

    const { nonce, ttl } = await NonceService.generate();

    return {
      nonce,
      ttl,
    };
  });

  /**
   * POST /api/v1/attestations/issue
   * Issue session attestation bound to pollId + nonce + votePayloadHash
   *
   * Phase 0: Mock verification (no real NFC/liveness)
   * Phase 1: Will verify NFC + liveness proof
   */
  fastify.post('/issue', async (request, reply) => {
    try {
      const body = IssueSchema.parse(request.body);

      const result = await issueAttestation(body);

      return result;
    } catch (error: any) {
      if (error.message.includes('Nonce')) {
        if (error.message.includes('replay')) {
          return reply.code(400).send({ error: error.message });
        }
        if (error.message.includes('expired')) {
          return reply.code(400).send({ error: error.message });
        }
        return reply.code(400).send({ error: error.message });
      }
      throw error;
    }
  });
};

export default attestationsRoutes;
