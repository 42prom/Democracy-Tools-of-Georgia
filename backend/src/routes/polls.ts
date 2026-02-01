import { Router, Request, Response, NextFunction } from 'express';
import { requireCredential } from '../middleware/auth';
import { getEligiblePolls, getSurveyQuestions } from '../services/polls';
import { submitVote } from '../services/voting';
import NonceService from '../services/nonce';
import { VoteSubmission } from '../types/polls';
import { createError } from '../middleware/errorHandler';
import { pool } from '../db/client';

const router = Router();

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

      const polls = await getEligiblePolls(req.credential.data);

      res.json({ polls });
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
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.credential) {
        throw createError('Credential missing', 401);
      }

      const voteData: VoteSubmission = req.body;

      // Validate vote data
      if (
        !voteData.pollId ||
        !voteData.optionId ||
        !voteData.nullifier ||
        !voteData.nonce ||
        !voteData.signature
      ) {
        throw createError(
          'Missing required fields: pollId, optionId, nullifier, nonce, signature',
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
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.credential) {
        throw createError('Credential missing', 401);
      }

      const { nullifier, responses, demographicsSnapshot } = req.body;
      const pollId = req.params.id;

      if (!nullifier || !responses || !Array.isArray(responses)) {
        throw createError('Missing required fields: nullifier, responses[]', 400);
      }

      // Verify poll exists and is active survey
      const pollResult = await pool.query(
        `SELECT * FROM polls WHERE id = $1 AND status = 'active' AND type = 'survey'`,
        [pollId]
      );
      if (pollResult.rows.length === 0) {
        throw createError('Active survey poll not found', 404);
      }

      // Check nullifier (prevent double submission)
      const nullifierCheck = await pool.query(
        'SELECT 1 FROM survey_nullifiers WHERE poll_id = $1 AND nullifier_hash = $2',
        [pollId, nullifier]
      );
      if (nullifierCheck.rows.length > 0) {
        throw createError('Already submitted response to this survey', 409);
      }

      // Get survey questions for validation
      const questions = await getSurveyQuestions(pollId);
      const questionMap = new Map(questions.map(q => [q.id, q]));

      // Build demographics snapshot
      const demographics = demographicsSnapshot || {
        age_bucket: req.credential.data?.age_bucket,
        gender: req.credential.data?.gender,
        region_codes: req.credential.data?.region_codes,
      };

      // Insert nullifier
      await pool.query(
        'INSERT INTO survey_nullifiers (poll_id, nullifier_hash) VALUES ($1, $2)',
        [pollId, nullifier]
      );

      // Insert responses
      for (const response of responses) {
        const question = questionMap.get(response.questionId);
        if (!question) continue;

        await pool.query(
          `INSERT INTO survey_responses
           (poll_id, question_id, selected_option_id, selected_option_ids, text_response, rating_value, ranked_option_ids, demographics_snapshot)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            pollId,
            response.questionId,
            response.selectedOptionId || null,
            response.selectedOptionIds || null,
            response.textResponse || null,
            response.ratingValue || null,
            response.rankedOptionIds || null,
            JSON.stringify(demographics),
          ]
        );
      }

      res.json({
        success: true,
        message: 'Survey submitted successfully',
        txHash: `mock_survey_tx_${Date.now()}`,
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
