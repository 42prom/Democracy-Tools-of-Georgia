import { query, transaction } from '../db/client';
import { Poll, PollOption, CreatePollRequest, AudienceRules } from '../types/polls';
import { SurveyQuestion } from '../types/survey';

/**
 * Create a new poll
 */
export async function createPoll(pollData: CreatePollRequest): Promise<Poll> {
  return await transaction(async (client) => {
    // Insert poll
    const pollResult = await client.query(
      `INSERT INTO polls (title, description, type, status, start_at, end_at, audience_rules, min_k_anonymity)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        pollData.title,
        pollData.description || null,
        pollData.type,
        'draft',
        pollData.start_at || null,
        pollData.end_at || null,
        JSON.stringify(pollData.audience_rules),
        30, // Default k-anonymity threshold
      ]
    );

    const poll = pollResult.rows[0];

    // For survey type, insert survey questions and their options
    if (pollData.type === 'survey' && (pollData as any).questions && (pollData as any).questions.length > 0) {
      const questions: SurveyQuestion[] = (pollData as any).questions;

      for (let qi = 0; qi < questions.length; qi++) {
        const q = questions[qi];
        const questionResult = await client.query(
          `INSERT INTO survey_questions (poll_id, question_text, question_type, required, display_order, config)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING id`,
          [poll.id, q.questionText, q.questionType, q.required !== false, qi, JSON.stringify(q.config || {})]
        );
        const questionId = questionResult.rows[0].id;

        // Insert sub-options for choice-type questions
        if (q.options && q.options.length > 0 && ['single_choice', 'multiple_choice', 'ranked_choice'].includes(q.questionType)) {
          for (let oi = 0; oi < q.options.length; oi++) {
            await client.query(
              `INSERT INTO question_options (question_id, option_text, display_order)
               VALUES ($1, $2, $3)`,
              [questionId, q.options[oi].optionText, oi]
            );
          }
        }
      }

      // Also insert question texts as legacy poll_options for backward compatibility
      for (let qi = 0; qi < questions.length; qi++) {
        await client.query(
          `INSERT INTO poll_options (poll_id, text, display_order)
           VALUES ($1, $2, $3)`,
          [poll.id, `Q${qi + 1}: ${questions[qi].questionText}`, qi]
        );
      }
    } else if (pollData.options && pollData.options.length > 0) {
      // For election/referendum: insert flat options
      for (let i = 0; i < pollData.options.length; i++) {
        await client.query(
          `INSERT INTO poll_options (poll_id, text, display_order)
           VALUES ($1, $2, $3)`,
          [poll.id, pollData.options[i], i]
        );
      }
    }

    return poll;
  });
}

/**
 * Get survey questions for a poll
 */
export async function getSurveyQuestions(pollId: string): Promise<SurveyQuestion[]> {
  const questionsResult = await query(
    `SELECT * FROM survey_questions WHERE poll_id = $1 ORDER BY display_order`,
    [pollId]
  );

  const questions: SurveyQuestion[] = [];

  for (const row of questionsResult.rows) {
    // Fetch options for choice-type questions
    let options: any[] = [];
    if (['single_choice', 'multiple_choice', 'ranked_choice'].includes(row.question_type)) {
      const optionsResult = await query(
        `SELECT * FROM question_options WHERE question_id = $1 ORDER BY display_order`,
        [row.id]
      );
      options = optionsResult.rows.map((o: any) => ({
        id: o.id,
        optionText: o.option_text,
        displayOrder: o.display_order,
      }));
    }

    questions.push({
      id: row.id,
      questionText: row.question_text,
      questionType: row.question_type,
      required: row.required,
      displayOrder: row.display_order,
      config: row.config || {},
      options: options.length > 0 ? options : undefined,
    });
  }

  return questions;
}

/**
 * Get poll by ID with options
 */
export async function getPollById(pollId: string): Promise<{ poll: Poll; options: PollOption[] } | null> {
  const pollResult = await query('SELECT * FROM polls WHERE id = $1', [pollId]);

  if (pollResult.rows.length === 0) {
    return null;
  }

  const poll = pollResult.rows[0];

  const optionsResult = await query<PollOption>(
    'SELECT * FROM poll_options WHERE poll_id = $1 ORDER BY display_order',
    [pollId]
  );

  return {
    poll,
    options: optionsResult.rows,
  };
}

/**
 * Estimate audience size for given rules
 * Phase 0: Mock implementation returns random number
 * Phase 1: Will query actual user demographics
 */
export async function estimateAudience(_rules: AudienceRules): Promise<{ count: number; isPrivacySafe: boolean }> {
  // Phase 0: Return mock count
  const mockCount = Math.floor(Math.random() * (1000 - 50) + 50);

  const minK = parseInt(process.env.MIN_K_ANONYMITY || '30', 10);
  const isPrivacySafe = mockCount >= minK;

  return { count: mockCount, isPrivacySafe };
}

/**
 * Publish a poll (make it active)
 */
export async function publishPoll(pollId: string): Promise<void> {
  const pollData = await getPollById(pollId);

  if (!pollData) {
    throw new Error('Poll not found');
  }

  // Estimate audience
  const estimate = await estimateAudience(pollData.poll.audience_rules);

  if (!estimate.isPrivacySafe) {
    throw new Error(`Privacy violation: Estimated audience (${estimate.count}) is below k-anonymity threshold`);
  }

  // Update status to active
  await query(
    `UPDATE polls SET status = $1, published_at = NOW() WHERE id = $2`,
    ['active', pollId]
  );
}

/**
 * Get eligible polls for a user based on their credential demographics
 */
export async function getEligiblePolls(demographics: any): Promise<Array<Poll & { options: PollOption[] }>> {
  // Get active polls
  const pollsResult = await query<Poll>(
    `SELECT * FROM polls WHERE status = 'active' AND (start_at IS NULL OR start_at <= NOW()) AND (end_at IS NULL OR end_at >= NOW())`
  );

  const eligiblePolls: Array<Poll & { options: PollOption[] }> = [];

  for (const poll of pollsResult.rows) {
    // Check if user matches audience rules
    const rules = poll.audience_rules as AudienceRules;

    let eligible = true;

    // Check age (Phase 0: skip, no age in mock data)
    // Check gender
    if (rules.gender && rules.gender !== 'all' && demographics.gender !== rules.gender) {
      eligible = false;
    }

    // Check regions
    if (rules.regions && rules.regions.length > 0) {
      const hasMatchingRegion = demographics.region_codes.some((r: string) =>
        rules.regions?.includes(r)
      );
      if (!hasMatchingRegion) {
        eligible = false;
      }
    }

    if (eligible) {
      // Get options
      const optionsResult = await query<PollOption>(
        'SELECT * FROM poll_options WHERE poll_id = $1 ORDER BY display_order',
        [poll.id]
      );

      // For survey type, also include survey questions with sub-options
      let questions;
      if (poll.type === 'survey') {
        questions = await getSurveyQuestions(poll.id);
      }

      eligiblePolls.push({
        ...poll,
        options: optionsResult.rows,
        ...(questions && questions.length > 0 ? { questions } : {}),
      } as any);
    }
  }

  return eligiblePolls;
}
