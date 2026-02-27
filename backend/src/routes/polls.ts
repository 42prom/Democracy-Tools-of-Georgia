import { Router, Request, Response, NextFunction } from 'express';
import { requireCredential } from '../middleware/auth';
import { checkIdempotency } from '../middleware/idempotency';
import { dynamicRateLimit } from '../middleware/dynamicRateLimit';
import { getEligiblePolls, getSurveyQuestions, getPollById } from '../services/polls';
import { submitVote, buildDemographicsSnapshot } from '../services/voting';
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
  dynamicRateLimit('vote'), // Apply dynamic vote rate limit (surveys count as votes)
  checkIdempotency, // Idempotency check
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.credential) {
        throw createError('Credential missing', 401);
      }

      const { nullifier, responses } = req.body;
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

      const poll = pollResult.rows[0];
      const nowUtc = new Date();
      if (poll.start_at && new Date(poll.start_at) > nowUtc) {
        throw createError('Survey has not started yet', 403);
      }
      if (poll.end_at && new Date(poll.end_at) < nowUtc) {
        throw createError('Survey has already ended', 403);
      }

      // Check nullifier (prevent double submission)
      const nullifierCheck = await pool.query(
        'SELECT 1 FROM survey_nullifiers WHERE poll_id = $1 AND nullifier_hash = $2',
        [pollId, nullifier]
      );
      if (nullifierCheck.rows.length > 0) {
        // SELF-HEALING: Ensure user_rewards has a record so it's filtered out from dashboard
        try {
          const existingReward = await pool.query(
            'SELECT id FROM user_rewards WHERE poll_id = $1 AND device_key_hash = $2',
            [pollId, req.credential.sub]
          );
          if (existingReward.rows.length === 0) {
            await pool.query(
              `INSERT INTO user_rewards (device_key_hash, poll_id, amount, token_symbol, status, tx_hash)
               VALUES ($1, $2, 0, 'DTG', 'processed', $3)`,
              [req.credential.sub, pollId, 'mock_survey_self_heal_' + Date.now()]
            );
          }
        } catch (rewardError) {
          console.error('[Self-Heal] Failed to record survey participation:', rewardError);
        }
        throw createError('Already submitted response to this survey', 409);
      }

      // Get survey questions for validation
      const questions = await getSurveyQuestions(String(pollId));
      const questionMap = new Map(questions.map(q => [q.id, q]));

      // Build demographics snapshot using unified helper
      const demographics = buildDemographicsSnapshot(req.credential.data);

      // Insert nullifier
      await pool.query(
        'INSERT INTO survey_nullifiers (poll_id, nullifier_hash) VALUES ($1, $2)',
        [pollId, nullifier]
      );

      // Insert responses
      for (const response of responses) {
        const question = questionMap.get(response.questionId);
        if (!question) continue;

        // Note: Pass object directly - pg driver handles object->jsonb conversion correctly
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
            demographics,
          ]
        );
      }

      // Record participation in poll_participants for activity history
      await pool.query(
        `INSERT INTO poll_participants (poll_id, user_id, participated_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (poll_id, user_id) DO NOTHING`,
        [pollId, req.credential.sub]
      );

      // Check if poll has rewards configured
      const hasReward = poll.reward_amount && parseFloat(poll.reward_amount) > 0;
      let rewardInfo = null;

      // Check if reward already exists (avoid constraint issues)
      const existingReward = await pool.query(
        'SELECT id FROM user_rewards WHERE poll_id = $1 AND device_key_hash = $2',
        [pollId, req.credential.sub]
      );

      if (existingReward.rows.length === 0) {
        if (hasReward) {
          // Record reward (will be processed by background worker)
          // Note: user_rewards table only has: device_key_hash, poll_id, amount, token_symbol, status, tx_hash
          await pool.query(
            `INSERT INTO user_rewards (device_key_hash, poll_id, amount, token_symbol, status)
             VALUES ($1, $2, $3, $4, 'pending')`,
            [req.credential.sub, pollId, poll.reward_amount, poll.reward_token || 'DTG']
          );
          rewardInfo = {
            issued: true,
            amount: parseFloat(poll.reward_amount),
            tokenSymbol: poll.reward_token || 'DTG',
          };
        } else {
          // Record zero reward for filtering (Phase 0: 0 amount if no rewards)
          await pool.query(
            `INSERT INTO user_rewards (device_key_hash, poll_id, amount, token_symbol, status, tx_hash)
             VALUES ($1, $2, $3, $4, 'processed', $5)`,
            [req.credential.sub, pollId, 0, 'DTG', `mock_survey_reward_${Date.now()}`]
          );
        }
      }

      res.json({
        success: true,
        message: 'Survey submitted successfully',
        txHash: `mock_survey_tx_${Date.now()}`,
        reward: rewardInfo,
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
