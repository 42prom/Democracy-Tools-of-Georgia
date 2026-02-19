import { query } from '../db/client';
import { AppConfig } from '../config/app';

// Production-safe k-anonymity floor: cannot be bypassed via env in non-development
const PRODUCTION_SAFE_MIN_K = 5;
const ENV_MIN_K = AppConfig.MIN_K_ANONYMITY;

// In production, enforce minimum of PRODUCTION_SAFE_MIN_K even if env says 0
const MIN_K_ANONYMITY = AppConfig.NODE_ENV === 'development'
  ? ENV_MIN_K
  : Math.max(ENV_MIN_K, PRODUCTION_SAFE_MIN_K);

interface PollResults {
  totalVotes: number;
  results: Array<{
    optionId: string;
    optionText: string;
    count: number;
  }>;
  suppressed?: boolean;
  pollEnded?: boolean;
}

interface GroupedPollResults {
  totalVotes: number;
  results: Array<{
    optionId: string;
    optionText: string;
    breakdowns: Record<string, number | string>;
  }>;
  pollEnded?: boolean;
}

/**
 * Get poll results with k-anonymity enforcement.
 * 
 * K-Anonymity Rules:
 * 1. If total votes < MIN_K (default 30), ALL results suppressed for active polls.
 * 2. If filtering by group (e.g. region), any bucket with < MIN_K votes is masked.
 * 3. Admins can see raw counts only after poll ends.
 * 
 * @param pollId - UUID of the poll
 * @param groupBy - Optional dimension to pivot results by
 */
export async function getPollResults(
  pollId: string,
  groupBy?: 'region' | 'age_bucket' | 'gender'
): Promise<PollResults | GroupedPollResults> {
  // Get poll config (including min_k_anonymity, end_at, and status)
  const pollConfigResult = await query('SELECT type, min_k_anonymity, end_at, status FROM polls WHERE id = $1', [pollId]);
  if (pollConfigResult.rows.length === 0) {
    throw new Error('Poll not found');
  }
  const poll = pollConfigResult.rows[0];
  const pollType = poll.type;
  // Poll is ended if: status is 'ended' OR end_at has passed
  const pollEnded = poll.status === 'ended' ||
    (poll.end_at && new Date(poll.end_at) < new Date());

  // Use poll-specific threshold, fall back to global MIN_K_ANONYMITY
  // In production, always enforce at least PRODUCTION_SAFE_MIN_K
  const rawThreshold = poll.min_k_anonymity || MIN_K_ANONYMITY;
  const pollKThreshold = AppConfig.NODE_ENV === 'development'
    ? rawThreshold
    : Math.max(rawThreshold, PRODUCTION_SAFE_MIN_K);

  // Get total votes
  const totalResult = await query(
    'SELECT COUNT(*) as count FROM votes WHERE poll_id = $1',
    [pollId]
  );
  const totalVotes = parseInt(totalResult.rows[0].count, 10);

  // K-anonymity check: Only suppress details for LIVE polls
  // Once a poll has ended, results should be visible regardless of vote count
  if (!pollEnded && totalVotes < pollKThreshold) {
    return {
      totalVotes: totalVotes,
      results: [],
      suppressed: true,
      pollEnded: false
    };
  }

  if (!groupBy) {
    if (pollType === 'survey') {
      // For surveys, we aggregate responses from survey_responses
      const resultsQuery = await query(
        `SELECT
          po.id as option_id,
          po.text as option_text,
          po.display_order,
          (SELECT COUNT(*) FROM survey_responses sr 
           JOIN survey_questions sq ON sr.question_id = sq.id
           WHERE sr.poll_id = $1 AND sq.display_order = po.display_order) as count
         FROM poll_options po
         WHERE po.poll_id = $1
         ORDER BY po.display_order`,
        [pollId]
      );

      const totalResponsesResult = await query(
        'SELECT COUNT(DISTINCT nullifier_hash) as count FROM survey_nullifiers WHERE poll_id = $1',
        [pollId]
      );
      const totalResponses = parseInt(totalResponsesResult.rows[0].count, 10);

      return {
        totalVotes: totalResponses,
        results: resultsQuery.rows.map(row => ({
          optionId: row.option_id,
          optionText: row.option_text,
          count: parseInt(row.count, 10),
        })),
        pollEnded,
      };
    }

    // Standard aggregation (election/referendum)
    const resultsQuery = await query(
      `SELECT
        v.option_id,
        po.text as option_text,
        po.display_order,
        COUNT(*) as count
       FROM votes v
       JOIN poll_options po ON v.option_id = po.id
       WHERE v.poll_id = $1
       GROUP BY v.option_id, po.text, po.display_order
       ORDER BY po.display_order`,
      [pollId]
    );

    return {
      totalVotes,
      results: resultsQuery.rows.map(row => ({
        optionId: row.option_id,
        optionText: row.option_text,
        count: parseInt(row.count, 10),
      })),
      pollEnded,
    };
  } else {
    // Grouped aggregation with k-anonymity enforcement
    const jsonField = `demographics_snapshot->>'${groupBy}'`;

    const resultsQuery = await query(
      `SELECT
        v.option_id,
        po.text as option_text,
        po.display_order,
        ${jsonField} as group_value,
        COUNT(*) as count
       FROM votes v
       JOIN poll_options po ON v.option_id = po.id
       WHERE v.poll_id = $1
       GROUP BY v.option_id, po.text, po.display_order, ${jsonField}
       ORDER BY po.display_order, ${jsonField}`,
      [pollId]
    );

    // Build results with suppression
    const optionsMap: Record<string, { optionText: string; breakdowns: Record<string, number | string> }> = {};

    for (const row of resultsQuery.rows) {
      const optionId = row.option_id;
      const groupValue = row.group_value;
      const count = parseInt(row.count, 10);

      if (!optionsMap[optionId]) {
        optionsMap[optionId] = {
          optionText: row.option_text,
          breakdowns: {},
        };
      }

      // Apply k-anonymity: suppress cohorts below threshold (only for live polls)
      if (!pollEnded && count < pollKThreshold) {
        optionsMap[optionId].breakdowns['<suppressed>'] = '<k_threshold_not_met>';
      } else {
        optionsMap[optionId].breakdowns[groupValue] = count;
      }
    }

    return {
      totalVotes,
      results: Object.entries(optionsMap).map(([optionId, data]) => ({
        optionId,
        optionText: data.optionText,
        breakdowns: data.breakdowns,
      })),
      pollEnded,
    };
  }
}

/**
 * Get aggregated demographic breakdowns for a poll
 */
export async function getPollDemographics(
  pollId: string,
  dimensions: string[] = ['age', 'gender', 'region']
): Promise<any> {
    // Get poll config (including min_k_anonymity, end_at, and status)
    const pollConfigResult = await query('SELECT type, min_k_anonymity, end_at, status FROM polls WHERE id = $1', [pollId]);
    if (pollConfigResult.rows.length === 0) {
      throw new Error('Poll not found');
    }
    const poll = pollConfigResult.rows[0];
    const pollEnded = poll.status === 'ended' || (poll.end_at && new Date(poll.end_at) < new Date());
  
    // Use poll-specific threshold, fall back to global
    // In production, always enforce at least PRODUCTION_SAFE_MIN_K
    const rawThreshold = poll.min_k_anonymity || MIN_K_ANONYMITY;
    const kThreshold = AppConfig.NODE_ENV === 'development'
      ? rawThreshold
      : Math.max(rawThreshold, PRODUCTION_SAFE_MIN_K);
  
    // Get total votes
    const totalResult = await query(
      'SELECT COUNT(*) as count FROM votes WHERE poll_id = $1',
      [pollId]
    );
    const totalVotes = parseInt(totalResult.rows[0].count, 10);
  
    // If total votes < k and poll is live, suppress EVERYTHING
    if (!pollEnded && totalVotes < kThreshold) {
      return {};
    }

    const breakdowns: Record<string, any> = {};

    for (const dim of dimensions) {
        let dbField = dim;
        // Map frontend keys to backend keys
        if (dim === 'age') dbField = 'age_bucket';
        
        // Safety check to prevent SQL injection via column name (though we use jsonb accessor)
        if (!['age', 'age_bucket', 'gender', 'region'].includes(dbField)) continue;

        const jsonField = `demographics_snapshot->>'${dbField}'`;

        const distributionResult = await query(
            `SELECT ${jsonField} as value, COUNT(*) as count
             FROM votes
             WHERE poll_id = $1
             GROUP BY ${jsonField}
             ORDER BY count DESC`,
            [pollId]
        );

        breakdowns[dim] = {
            dimension: dim,
            cohorts: distributionResult.rows.map(row => {
                const count = parseInt(row.count, 10);
                const isSuppressed = !pollEnded && count < kThreshold && count > 0;
                return {
                    value: row.value || 'unknown',
                    count: isSuppressed ? '<suppressed>' : count,
                    percentage: totalVotes > 0 ? Math.round((count / totalVotes) * 1000) / 10 : 0
                };
            })
        };
    }

    return breakdowns;
}
