import { Router, Request, Response, NextFunction } from 'express';
import { requireAdmin } from '../../middleware/auth';
import { createPoll, estimateAudience, publishPoll, getSurveyQuestions } from '../../services/polls';
import { CreatePollRequest, AudienceRules } from '../../types/polls';
import { createError } from '../../middleware/errorHandler';
import { pool } from '../../db/client';

const router = Router();

// All admin routes require authentication
router.use(requireAdmin);

/**
 * GET /api/v1/admin/polls
 * List all polls (with optional status filter)
 */
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { status } = req.query;

    let query = 'SELECT * FROM polls';
    const params: any[] = [];

    if (status) {
      query += ' WHERE status = $1';
      params.push(status);
    }

    query += ' ORDER BY created_at DESC';

    const pollsResult = await pool.query(query, params);

    // Fetch options for each poll (and survey questions for survey type)
    const pollsWithOptions = await Promise.all(
      pollsResult.rows.map(async (poll) => {
        const optionsResult = await pool.query(
          'SELECT id, poll_id, text, display_order FROM poll_options WHERE poll_id = $1 ORDER BY display_order',
          [poll.id]
        );

        let surveyQuestions;
        if (poll.type === 'survey') {
          surveyQuestions = await getSurveyQuestions(poll.id);
        }

        const result: any = {
          ...poll,
          options: optionsResult.rows,
          ...(surveyQuestions && surveyQuestions.length > 0 ? { questions: surveyQuestions } : {}),
        };

        // Extract referendum metadata from audience_rules
        if (poll.type === 'referendum' && poll.audience_rules) {
          result.referendum_question = poll.audience_rules.referendum_question || '';
          result.referendum_threshold = poll.audience_rules.referendum_threshold || 50;
        }

        return result;
      })
    );

    res.json(pollsWithOptions);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/admin/polls/:id
 * Get a single poll by ID
 */
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const result = await pool.query('SELECT * FROM polls WHERE id = $1', [id]);

    if (result.rows.length === 0) {
      throw createError('Poll not found', 404);
    }

    const poll = result.rows[0];

    // Fetch options for this poll
    const optionsResult = await pool.query(
      'SELECT id, poll_id, text, display_order FROM poll_options WHERE poll_id = $1 ORDER BY display_order',
      [id]
    );

    // For survey type, also fetch survey questions with sub-options
    let surveyQuestions;
    if (poll.type === 'survey') {
      surveyQuestions = await getSurveyQuestions(id);
    }

    const response: any = {
      ...poll,
      options: optionsResult.rows,
      ...(surveyQuestions && surveyQuestions.length > 0 ? { questions: surveyQuestions } : {}),
    };

    // Extract referendum metadata from audience_rules for referendum polls
    if (poll.type === 'referendum' && poll.audience_rules) {
      response.referendum_question = poll.audience_rules.referendum_question || '';
      response.referendum_threshold = poll.audience_rules.referendum_threshold || 50;
    }

    res.json(response);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/admin/polls
 * Create a new poll
 */
router.post(
  '/',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const pollData = req.body;

      // Validation
      if (!pollData.title) {
        throw createError('Title is required', 400);
      }

      // For survey type, validate questions instead of options
      if (pollData.type === 'survey') {
        if (!pollData.questions || pollData.questions.length < 1) {
          // Allow fallback to options for backward compatibility
          if (!pollData.options || pollData.options.length < 2) {
            throw createError('Survey requires at least 1 question or 2 options', 400);
          }
        }
      } else {
        if (!pollData.options || pollData.options.length < 2) {
          throw createError('At least 2 options are required', 400);
        }
      }

      // For referendum type, store referendum metadata in audience_rules
      if (pollData.type === 'referendum') {
        pollData.audience_rules = {
          ...pollData.audience_rules,
          referendum_question: pollData.referendum_question || '',
          referendum_threshold: pollData.referendum_threshold || 50,
        };
      }

      const poll = await createPoll(pollData);

      res.status(201).json(poll);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/v1/admin/polls/estimate
 * Estimate audience size for given rules
 */
router.post(
  '/estimate',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const rules: AudienceRules = req.body.rules || {};

      const estimate = await estimateAudience(rules);

      res.json(estimate);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * PATCH /api/v1/admin/polls/:id
 * Update a poll
 */
router.patch('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const fields: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    // Build dynamic UPDATE query
    for (const [key, value] of Object.entries(updates)) {
      if (key !== 'id') {
        fields.push(`${key} = $${paramCount}`);
        values.push(value);
        paramCount++;
      }
    }

    if (fields.length === 0) {
      throw createError('No fields to update', 400);
    }

    values.push(id);
    const query = `UPDATE polls SET ${fields.join(', ')} WHERE id = $${paramCount} RETURNING *`;

    const result = await pool.query(query, values);

    if (result.rows.length === 0) {
      throw createError('Poll not found', 404);
    }

    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/v1/admin/polls/:id
 * Delete a poll
 */
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const result = await pool.query('DELETE FROM polls WHERE id = $1 RETURNING *', [id]);

    if (result.rows.length === 0) {
      throw createError('Poll not found', 404);
    }

    res.json({ message: 'Poll deleted successfully' });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /api/v1/admin/polls/:id/publish
 * Publish a poll (make it active)
 */
router.patch(
  '/:id/publish',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;

      const poll = await publishPoll(id);

      res.json(poll);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/v1/admin/polls/:id/survey-results
 * Get survey results with per-question analytics and k-anonymity
 */
router.get(
  '/:id/survey-results',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const K_THRESHOLD = 30;

      // Verify poll exists and is a survey
      const pollResult = await pool.query('SELECT * FROM polls WHERE id = $1', [id]);
      if (pollResult.rows.length === 0) {
        throw createError('Poll not found', 404);
      }

      const poll = pollResult.rows[0];
      if (poll.type !== 'survey') {
        throw createError('This endpoint is only for survey-type polls', 400);
      }

      // Get total submissions count
      const submissionCountResult = await pool.query(
        'SELECT COUNT(DISTINCT nullifier_hash) as count FROM survey_nullifiers WHERE poll_id = $1',
        [id]
      );
      const totalSubmissions = parseInt(submissionCountResult.rows[0].count, 10);

      // Get survey questions
      const questions = await getSurveyQuestions(id);
      const questionResults: any[] = [];

      for (const question of questions) {
        const responseCountResult = await pool.query(
          'SELECT COUNT(*) as count FROM survey_responses WHERE poll_id = $1 AND question_id = $2',
          [id, question.id]
        );
        const totalResponses = parseInt(responseCountResult.rows[0].count, 10);

        let results: any;

        switch (question.questionType) {
          case 'single_choice': {
            const optionResults = await pool.query(
              `SELECT qo.id as option_id, qo.option_text, COUNT(sr.id) as count
               FROM question_options qo
               LEFT JOIN survey_responses sr ON sr.selected_option_id = qo.id AND sr.question_id = $1
               WHERE qo.question_id = $1
               GROUP BY qo.id, qo.option_text, qo.display_order
               ORDER BY qo.display_order`,
              [question.id]
            );
            results = {
              type: 'single_choice',
              options: optionResults.rows.map((r: any) => {
                const count = parseInt(r.count, 10);
                return {
                  optionId: r.option_id,
                  optionText: r.option_text,
                  count: count < K_THRESHOLD && count > 0 ? '<suppressed>' : count,
                  percentage: totalResponses > 0 ? Math.round((count / totalResponses) * 1000) / 10 : 0,
                };
              }),
            };
            break;
          }

          case 'multiple_choice': {
            const optionResults = await pool.query(
              `SELECT qo.id as option_id, qo.option_text, COUNT(sr.id) as count
               FROM question_options qo
               LEFT JOIN survey_responses sr ON qo.id = ANY(sr.selected_option_ids) AND sr.question_id = $1
               WHERE qo.question_id = $1
               GROUP BY qo.id, qo.option_text, qo.display_order
               ORDER BY qo.display_order`,
              [question.id]
            );
            results = {
              type: 'multiple_choice',
              options: optionResults.rows.map((r: any) => {
                const count = parseInt(r.count, 10);
                return {
                  optionId: r.option_id,
                  optionText: r.option_text,
                  count: count < K_THRESHOLD && count > 0 ? '<suppressed>' : count,
                  percentage: totalResponses > 0 ? Math.round((count / totalResponses) * 1000) / 10 : 0,
                };
              }),
            };
            break;
          }

          case 'text': {
            // Only return aggregate metrics, never individual responses
            const lengthResult = await pool.query(
              `SELECT COUNT(*) as count, AVG(LENGTH(text_response)) as avg_length
               FROM survey_responses WHERE poll_id = $1 AND question_id = $2 AND text_response IS NOT NULL`,
              [id, question.id]
            );
            results = {
              type: 'text',
              responseCount: parseInt(lengthResult.rows[0].count, 10),
              averageLength: Math.round(parseFloat(lengthResult.rows[0].avg_length || '0')),
            };
            break;
          }

          case 'rating_scale': {
            const config = question.config as any;
            const min = config.min || 1;
            const max = config.max || 5;

            const ratingResults = await pool.query(
              `SELECT rating_value, COUNT(*) as count
               FROM survey_responses WHERE poll_id = $1 AND question_id = $2 AND rating_value IS NOT NULL
               GROUP BY rating_value ORDER BY rating_value`,
              [id, question.id]
            );

            const avgResult = await pool.query(
              `SELECT AVG(rating_value) as avg FROM survey_responses
               WHERE poll_id = $1 AND question_id = $2 AND rating_value IS NOT NULL`,
              [id, question.id]
            );

            // Build full distribution
            const distribution: any[] = [];
            for (let v = min; v <= max; v++) {
              const row = ratingResults.rows.find((r: any) => parseInt(r.rating_value) === v);
              const count = row ? parseInt(row.count, 10) : 0;
              distribution.push({
                value: v,
                count: count < K_THRESHOLD && count > 0 ? '<suppressed>' : count,
                percentage: totalResponses > 0 ? Math.round((count / totalResponses) * 1000) / 10 : 0,
              });
            }

            results = {
              type: 'rating_scale',
              average: Math.round(parseFloat(avgResult.rows[0].avg || '0') * 10) / 10,
              distribution,
              config: question.config,
            };
            break;
          }

          case 'ranked_choice': {
            // Weighted scoring: 1st place = N pts, 2nd = N-1, etc.
            const optionResults = await pool.query(
              `SELECT id, option_text FROM question_options WHERE question_id = $1 ORDER BY display_order`,
              [question.id]
            );

            const rankings: any[] = [];
            for (const opt of optionResults.rows) {
              // Count first-place appearances
              const firstPlaceResult = await pool.query(
                `SELECT COUNT(*) as count FROM survey_responses
                 WHERE question_id = $1 AND ranked_option_ids[1] = $2`,
                [question.id, opt.id]
              );
              const firstPlaceCount = parseInt(firstPlaceResult.rows[0].count, 10);

              rankings.push({
                optionId: opt.id,
                optionText: opt.option_text,
                firstPlaceCount: firstPlaceCount < K_THRESHOLD && firstPlaceCount > 0 ? '<suppressed>' : firstPlaceCount,
                percentage: totalResponses > 0 ? Math.round((firstPlaceCount / totalResponses) * 1000) / 10 : 0,
              });
            }

            results = {
              type: 'ranked_choice',
              rankings: rankings.sort((a, b) => {
                const aCount = typeof a.firstPlaceCount === 'number' ? a.firstPlaceCount : 0;
                const bCount = typeof b.firstPlaceCount === 'number' ? b.firstPlaceCount : 0;
                return bCount - aCount;
              }),
            };
            break;
          }
        }

        questionResults.push({
          questionId: question.id,
          questionText: question.questionText,
          questionType: question.questionType,
          totalResponses,
          results,
        });
      }

      res.json({
        pollId: id,
        totalSubmissions,
        questions: questionResults,
        metadata: {
          kThreshold: K_THRESHOLD,
          suppressedCells: 0,
          lastUpdated: new Date().toISOString(),
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
