import { Router, Request, Response, NextFunction } from 'express';
import { requireCredential } from '../middleware/auth';
import { checkIdempotency } from '../middleware/idempotency';
import { dynamicRateLimit } from '../middleware/dynamicRateLimit';
import { getEligiblePolls, getPollById } from '../services/polls';
import {
  submitVote,
  enforceDeviceAttestation,
} from '../services/voting';
import { VoteSubmission } from '../types/polls';
import { createError } from '../middleware/errorHandler';
import NonceService from '../services/nonce';
import {
  buildSurveyAttestationOption,
  submitSurveyResponses,
} from '../services/surveyVoting';

const router = Router();

const FORBIDDEN_BALLOT_FIELDS = new Set([
  'nullifier',
  'userId',
  'user_id',
  'name',
  'firstName',
  'lastName',
  'personalNumber',
  'pnHash',
  'walletAddress',
  'pushToken',
]);

export function assertAnonymousBallotEnvelope(body: unknown): void {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw createError('Invalid ballot request body', 400);
  }
  for (const field of Object.keys(body)) {
    if (FORBIDDEN_BALLOT_FIELDS.has(field)) {
      throw createError(`Forbidden identity-bearing ballot field: ${field}`, 400);
    }
  }
}

/**
 * GET /api/v1/polls
 * List eligible polls for authenticated user
 */
router.get(
  '/',
  requireCredential,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.credential) {
        throw createError('Credential missing', 401);
      }

      const polls = await getEligiblePolls(req.credential.data, req.credential.sub);
      res.json({ polls });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/v1/polls/:id
 * Get detailed poll information
 */
router.get(
  '/:id',
  requireCredential,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const pollData = await getPollById(String(req.params.id));
      if (!pollData) {
        throw createError('Poll not found', 404);
      }

      // Check if user is eligible (demo simple: if it exists, they can view it)
      // For Activity history, they already voted, so they definitely can view it.
      res.json(pollData);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/v1/polls/:id/vote
 * Submit a vote
 */
router.post(
  '/:id/vote',
  requireCredential,
  dynamicRateLimit('vote'), // Apply dynamic vote rate limit
  checkIdempotency, // Idempotency check
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.credential) {
        throw createError('Credential missing', 401);
      }

      assertAnonymousBallotEnvelope(req.body);
      const voteData: VoteSubmission = req.body;

      // Validate vote data
      if (
        !voteData.pollId ||
        !voteData.optionId ||
        !voteData.nonce ||
        !Number.isInteger(voteData.timestampBucket) ||
        !voteData.signature
      ) {
        throw createError(
          'Missing required fields: pollId, optionId, nonce, timestampBucket, signature',
          400
        );
      }

      // Ensure pollId matches URL parameter
      if (voteData.pollId !== req.params.id) {
        throw createError('Poll ID mismatch', 400);
      }

      const result = await submitVote(voteData, req.credential);

      res.json(result);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/v1/polls/:id/survey-submit
 * Submit survey responses (mobile app)
 */
router.post(
  '/:id/survey-submit',
  requireCredential,
  dynamicRateLimit('vote'), // Apply dynamic vote rate limit (surveys count as votes)
  checkIdempotency, // Idempotency check
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.credential) {
        throw createError('Credential missing', 401);
      }

      assertAnonymousBallotEnvelope(req.body);
      const { responses, nonce, timestampBucket, signature, device, attestation } = req.body;
      const pollId = req.params.id;

      if (
        !responses ||
        !Array.isArray(responses) ||
        !nonce ||
        !Number.isInteger(timestampBucket) ||
        !signature
      ) {
        throw createError(
          'Missing required fields: responses[], nonce, timestampBucket, signature',
          400
        );
      }

      const nonceValid = await NonceService.verifyAndConsume(nonce, 'vote');
      if (!nonceValid) throw createError('Invalid or expired nonce (replay detected)', 400);

      await enforceDeviceAttestation({
        pollId: String(pollId),
        optionId: buildSurveyAttestationOption(responses),
        nonce,
        timestampBucket,
        signature,
        device,
        attestation,
      }, req.credential.sub);

      const result = await submitSurveyResponses(
        String(pollId),
        responses,
        req.credential
      );

      res.json({
        success: true,
        message: 'Survey submitted successfully',
        ...result,
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
