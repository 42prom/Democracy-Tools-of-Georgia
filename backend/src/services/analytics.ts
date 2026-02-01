import { query } from '../db/client';

const MIN_K_ANONYMITY = parseInt(process.env.MIN_K_ANONYMITY || '30', 10);

interface PollResults {
  totalVotes: number;
  results: Array<{
    optionId: string;
    optionText: string;
    count: number;
  }>;
  suppressed?: boolean;
}

interface GroupedPollResults {
  totalVotes: number;
  results: Array<{
    optionId: string;
    optionText: string;
    breakdowns: Record<string, number | string>;
  }>;
}

/**
 * Get poll results with k-anonymity enforcement
 */
export async function getPollResults(
  pollId: string,
  groupBy?: 'region' | 'age_bucket' | 'gender'
): Promise<PollResults | GroupedPollResults> {
  // Get total votes
  const totalResult = await query(
    'SELECT COUNT(*) as count FROM votes WHERE poll_id = $1',
    [pollId]
  );
  const totalVotes = parseInt(totalResult.rows[0].count, 10);

  if (!groupBy) {
    // Simple aggregation
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
      pollId,
      totalVotes,
      results: resultsQuery.rows.map(row => ({
        optionId: row.option_id,
        optionText: row.option_text,
        count: parseInt(row.count, 10),
        percentage: totalVotes > 0 ? (parseInt(row.count, 10) / totalVotes) * 100 : 0,
      })),
      metadata: {
        kThreshold: MIN_K_ANONYMITY,
        suppressedCells: 0,
        lastUpdated: new Date().toISOString(),
      },
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
    const optionsMap: Record<string, { optionText: string; breakdowns: Record<string, number> }> = {};

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

      // Apply k-anonymity: suppress cohorts below threshold
      if (count < MIN_K_ANONYMITY) {
        optionsMap[optionId].breakdowns['<suppressed>'] = '<k_threshold_not_met>';
      } else {
        optionsMap[optionId].breakdowns[groupValue] = count;
      }
    }

    // Count suppressed cells
    let suppressedCells = 0;
    for (const row of resultsQuery.rows) {
      const count = parseInt(row.count, 10);
      if (count < MIN_K_ANONYMITY) {
        suppressedCells++;
      }
    }

    return {
      pollId,
      totalVotes,
      results: Object.entries(optionsMap).map(([optionId, data]) => ({
        optionId,
        optionText: data.optionText,
        count: Object.values(data.breakdowns).reduce((sum, val) => {
          return sum + (typeof val === 'number' ? val : 0);
        }, 0),
        breakdowns: data.breakdowns,
      })),
      metadata: {
        kThreshold: MIN_K_ANONYMITY,
        suppressedCells,
        lastUpdated: new Date().toISOString(),
      },
    };
  }
}
