import { query, transaction } from '../db/client';
import { Poll, PollOption, CreatePollRequest, AudienceRules } from '../types/polls';
import { SurveyQuestion } from '../types/survey';
import { pushService } from './pushNotifications';
import { AppConfig } from '../config/app';

/**
 * Create a new poll
 */
export async function createPoll(pollData: CreatePollRequest): Promise<Poll> {
  console.log(`[PollsService] Creating poll: ${pollData.title}`);
  
  return await transaction(async (client) => {
    try {
      // Safe defaults
      const audienceRules = pollData.audience_rules || {};
      const rewardsEnabled = (pollData as any).rewards_enabled === true;
      const rewardAmount = rewardsEnabled ? ((pollData as any).reward_amount || '0') : null;
      const rewardToken = rewardsEnabled ? ((pollData as any).reward_token || 'DTG') : null;

      // Insert poll
      const pollResult = await client.query(
        `INSERT INTO polls (title, description, type, status, start_at, end_at, audience_rules, min_k_anonymity, rewards_enabled, reward_amount, reward_token)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         RETURNING *`,
        [
          pollData.title,
          pollData.description || null,
          pollData.type,
          'draft',
          pollData.start_at || null,
          pollData.end_at || null,
          JSON.stringify(audienceRules),
          AppConfig.MIN_K_ANONYMITY,
          rewardsEnabled,
          rewardAmount,
          rewardToken,
        ]
      );

      const poll = pollResult.rows[0];
      console.log(`[PollsService] Poll inserted, ID: ${poll.id}`);

    // For survey type, insert survey questions and their options
    if (pollData.type === 'survey' && (pollData as any).questions && Array.isArray((pollData as any).questions) && (pollData as any).questions.length > 0) {
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
    } else if (pollData.options && Array.isArray(pollData.options) && pollData.options.length > 0) {
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
    } catch (err: any) {
      console.error(`[PollsService] Error in createPoll transaction:`, err);
      // Re-throw to route handler
      throw err;
    }
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
 */
export async function estimateAudience(rules: AudienceRules): Promise<{ count: number; isPrivacySafe: boolean }> {
  console.log('[PollsService] Estimating audience for rules:', JSON.stringify(rules || {}));
  let queryStr = 'SELECT COUNT(*) as count FROM users';
  const conditions: string[] = [];
  const params: any[] = [];
  let paramIndex = 1;

  if (!rules || Object.keys(rules).length === 0) {
    const result = await query(queryStr);
    const count = parseInt(result.rows[0].count, 10);
    const minK = AppConfig.MIN_K_ANONYMITY;
    return { count, isPrivacySafe: count >= minK };
  }

  if (rules.gender && rules.gender !== 'all') {
    conditions.push(`credential_gender = $${paramIndex}`);
    params.push(rules.gender);
    paramIndex++;
  }

  if (rules.regions && Array.isArray(rules.regions) && rules.regions.length > 0) {
    conditions.push(`credential_region_codes && $${paramIndex}`);
    params.push(rules.regions);
    paramIndex++;
  }

  if (rules.min_age || rules.max_age) {
    const currentYear = new Date().getFullYear();
    if (rules.min_age) {
      const maxBirthYear = currentYear - rules.min_age;
      conditions.push(`credential_birth_year <= $${paramIndex}`);
      params.push(maxBirthYear);
      paramIndex++;
    }
    if (rules.max_age) {
      const minBirthYear = currentYear - rules.max_age;
      conditions.push(`credential_birth_year >= $${paramIndex}`);
      params.push(minBirthYear);
      paramIndex++;
    }
  }

  if (conditions.length > 0) {
    queryStr += ' WHERE ' + conditions.join(' AND ');
  }

  console.log('[PollsService] Running estimate query:', queryStr, 'with params:', params);
  const result = await query(queryStr, params);
  const count = parseInt(result.rows[0].count, 10);

  const minK = AppConfig.MIN_K_ANONYMITY;
  const isPrivacySafe = count >= minK;
  console.log('[PollsService] Estimate result:', { count, isPrivacySafe, minK });

  return { count, isPrivacySafe };
}

/**
 * Publish a poll (make it active)
 */
export async function publishPoll(pollId: string): Promise<Poll> {
  console.log('[PollsService] Publishing poll:', pollId);
  return await transaction(async (client) => {
    try {
      const pollRes = await client.query('SELECT * FROM polls WHERE id = $1', [pollId]);
      if (pollRes.rows.length === 0) {
        console.error('[PollsService] Poll not found for publishing:', pollId);
        throw new Error('Poll not found');
      }

      const poll = pollRes.rows[0] as Poll;
      console.log('[PollsService] Found poll for publishing:', poll.title, 'status:', poll.status);

      // Estimate audience (this one still uses the global pool for now, which is fine as it's READ only)
      const estimate = await estimateAudience(poll.audience_rules);

      const minK = AppConfig.MIN_K_ANONYMITY;
      if (!estimate.isPrivacySafe) {
        // Warning only - admin can publish regardless, results will be suppressed until k-anonymity is met
        console.warn('[PollsService] Small audience warning for poll:', pollId, 'estimate:', estimate.count, 'minK:', minK);
        console.warn('[PollsService] Results will be suppressed until enough votes are collected');
      }

      // Update status to active
      console.log('[PollsService] Updating poll status to active for ID:', pollId);
      const updated = await client.query(
        `UPDATE polls SET status = $1, published_at = NOW() WHERE id = $2 RETURNING *`,
        ['active', pollId]
      );
      
      if (updated.rowCount === 0) {
        console.error('[PollsService] Update failed, no rows returned for ID:', pollId);
        throw new Error('Failed to update poll status');
      }
      
      // Explicit fetch to ensure fresh state
      const freshPoll = await client.query('SELECT * FROM polls WHERE id = $1', [pollId]);
      
      console.log('[PollsService] Poll published successfully:', pollId);
      
      // Trigger notification (async, don't block)
      pushService.notifyPollPublished(pollId, freshPoll.rows[0].title);
      
      return freshPoll.rows[0];
    } catch (err: any) {
      console.error('[PollsService] Database error during publishing:', err.message);
      throw err;
    }
  });
}

/**
 * Get eligible polls for a user based on their credential demographics
 */
export async function getEligiblePolls(demographics: any, deviceKeyHash?: string): Promise<Array<Poll & { options: PollOption[] }>> {
  // Get active polls
  const pollsResult = await query<Poll>(
    `SELECT * FROM polls WHERE status = 'active' AND (start_at IS NULL OR start_at <= NOW()) AND (end_at IS NULL OR end_at >= NOW())`
  );

  // Get list of polls user has already participated in (voted)
  const votedPollIds = new Set<string>();
  if (deviceKeyHash) {
    // FIX: Use poll_participants as the source of truth, not user_rewards
    // deviceKeyHash here is actually the userId (credential.sub)
    const participantsResult = await query(
      `SELECT poll_id FROM poll_participants WHERE user_id = $1`,
      [deviceKeyHash]
    );
    participantsResult.rows.forEach((r: any) => votedPollIds.add(r.poll_id));
  }

  const eligiblePolls: Array<Poll & { options: PollOption[] }> = [];

  for (const poll of pollsResult.rows) {
    // Skip if already voted
    if (votedPollIds.has(poll.id)) continue;

    // Check if user matches audience rules
    const rules = poll.audience_rules as AudienceRules;

    let eligible = true;

    // Check age
    if (rules.min_age || rules.max_age) {
      // demographics.age_bucket example: "25-34"
      const bucket = demographics.age_bucket || 'UNKNOWN';
      let userMinAge = 0;
      let userMaxAge = 999;
      
      const match = bucket.match(/(\d+)-(\d+)/);
      if (match) {
        userMinAge = parseInt(match[1]);
        userMaxAge = parseInt(match[2]);
      } else if (bucket === '65+') {
        userMinAge = 65;
      } else if (bucket === '18-24') {
        userMinAge = 18;
        userMaxAge = 24;
      }

      // If poll min_age is 35, and user is 25-34, they are out.
      if (rules.min_age && userMaxAge < rules.min_age) {
        eligible = false;
      }
      // If poll max_age is 44, and user is 45-54, they are out.
      if (rules.max_age && userMinAge > rules.max_age) {
        eligible = false;
      }
    }

    // Check gender
    if (rules.gender && rules.gender !== 'all' && demographics.gender !== rules.gender) {
      eligible = false;
    }

    // Check regions
    // Support both demographics.region (single string) and demographics.region_codes (array)
    if (rules.regions && rules.regions.length > 0) {
      const userRegion = demographics.region;
      const userRegionCodes = demographics.region_codes || [];

      // Try single region first, then fallback to region_codes array
      let hasMatch = false;
      if (userRegion && userRegion !== 'unknown') {
        hasMatch = rules.regions.includes(userRegion);
      }
      if (!hasMatch && userRegionCodes.length > 0) {
        hasMatch = rules.regions.some((r: string) => userRegionCodes.includes(r));
      }
      if (!hasMatch) {
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

      // Check if poll has at least one way to interact (standard options or survey questions)
      const hasOptions = optionsResult.rows.length > 0;
      const hasQuestions = questions && questions.length > 0;

      if (hasOptions || hasQuestions) {
        eligiblePolls.push({
          ...poll,
          options: optionsResult.rows,
          ...(hasQuestions ? { questions } : {}),
        } as any);
      } else {
        console.log(`[PollsService] Skipping poll "${poll.title}" (${poll.id}) because it has 0 options/questions.`);
      }
    }
  }

  return eligiblePolls;
}

/**
 * Update an existing poll
 */
export async function updatePoll(pollId: string, pollData: Partial<CreatePollRequest>): Promise<Poll> {
  console.log(`[PollsService] Updating poll ${pollId}: ${JSON.stringify(pollData)}`);
  
  return await transaction(async (client) => {
    try {
      // 1. Lock and fetch current poll
      const currentPollRes = await client.query('SELECT * FROM polls WHERE id = $1 FOR UPDATE', [pollId]);
      if (currentPollRes.rows.length === 0) {
        throw new Error('Poll not found');
      }
      const currentPoll = currentPollRes.rows[0];

      // 2. Update main polls table
      // options/questions are separate tables, not columns
      const ALLOWED_COLUMNS = [
        'title', 'description', 'type', 'status', 'start_at', 'end_at', 
        'audience_rules', 'min_k_anonymity', 'rewards_enabled', 
        'reward_amount', 'reward_token'
      ];

      const fields: string[] = [];
      const values: any[] = [];
      let paramCount = 1;

      for (const [key, value] of Object.entries(pollData)) {
        if (ALLOWED_COLUMNS.includes(key)) {
          fields.push(`${key} = $${paramCount}`);
          if (['audience_rules'].includes(key) && typeof value === 'object') {
            values.push(JSON.stringify(value));
          } else {
            values.push(value);
          }
          paramCount++;
        }
      }

      if (fields.length > 0) {
        values.push(pollId);
        await client.query(
          `UPDATE polls SET ${fields.join(', ')}, updated_at = NOW() WHERE id = $${paramCount}`,
          values
        );
      }

      // 3. Refresh options/questions if provided
      const targetType = pollData.type || currentPoll.type;
      
      if (targetType === 'survey' && pollData.questions) {
        // Delete old questions (cascades to question_options)
        await client.query('DELETE FROM survey_questions WHERE poll_id = $1', [pollId]);
        // Also clean up legacy options just in case
        await client.query('DELETE FROM poll_options WHERE poll_id = $1', [pollId]); 

        const questions = pollData.questions;
        for (let qi = 0; qi < questions.length; qi++) {
          const q = questions[qi];
          const questionResult = await client.query(
            `INSERT INTO survey_questions (poll_id, question_text, question_type, required, display_order, config)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING id`,
            [pollId, q.questionText, q.questionType, q.required !== false, qi, JSON.stringify(q.config || {})]
          );
          const questionId = questionResult.rows[0].id;

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
      } 
      // Handle standard poll options (election/referendum/quick poll)
      else if (pollData.options && Array.isArray(pollData.options)) {
        // Refresh flat options
        await client.query('DELETE FROM poll_options WHERE poll_id = $1', [pollId]);
        
        // Ensure options are strings
        for (let i = 0; i < pollData.options.length; i++) {
            const optText = typeof pollData.options[i] === 'string' ? pollData.options[i] : (pollData.options[i] as any).optionText || String(pollData.options[i]);
            await client.query(
                `INSERT INTO poll_options (poll_id, text, display_order)
                 VALUES ($1, $2, $3)`,
                [pollId, optText, i]
            );
        }
      }

      const result = await client.query('SELECT * FROM polls WHERE id = $1', [pollId]);
      return result.rows[0];
    } catch (err: any) {
      console.error(`[PollsService] Error in updatePoll transaction:`, err);
      throw err;
    }
  });
}
