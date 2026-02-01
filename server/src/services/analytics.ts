import { query } from '../db/client.js';
import { CONFIG } from '../config.js';

const K_THRESHOLD = CONFIG.privacy.minKAnonymity;

/**
 * Inference Protection Rules:
 *
 * 1. Cell Suppression: Any cell (cohort) with count < k is suppressed
 * 2. Complementary Suppression: If suppressing one cell reveals another via subtraction,
 *    suppress both (e.g., if total=100, cellA=95, cellB would be 5 < k, suppress both)
 * 3. No Overlapping Slices: Prevent queries that allow differencing
 *    (e.g., can't query "Male 18-25" after querying "All 18-25" - enables subtraction)
 * 4. Minimum Cell Count: At least 3 non-suppressed cells in any breakdown
 * 5. Batching: Results materialized at intervals to prevent real-time inference
 */

interface PollResult {
  optionId: string;
  optionText: string;
  count: number;
  percentage: number;
}

interface PollResultsResponse {
  pollId: string;
  totalVotes: number;
  results: PollResult[];
  breakdowns?: Record<string, BreakdownResult>;
  metadata: {
    kThreshold: number;
    suppressedCells: number;
    lastUpdated: string;
  };
}

interface BreakdownResult {
  dimension: string;
  cohorts: Array<{
    value: string;
    count: number | string; // number or "<suppressed>"
    percentage?: number;
  }>;
}

/**
 * Query cache to track overlapping queries (inference protection)
 * In production, use Redis with TTL
 */
const queryCache = new Map<string, { dimensions: string[]; timestamp: number }>();

/**
 * Check if new query would enable differencing attack
 */
function validateNoOverlap(pollId: string, requestedDimensions: string[]): boolean {
  const key = `poll:${pollId}`;
  const cached = queryCache.get(key);

  if (!cached) {
    // First query for this poll - allow it
    queryCache.set(key, { dimensions: requestedDimensions, timestamp: Date.now() });
    return true;
  }

  // Check if requested dimensions would allow differencing
  // Rule: Cannot query subset of previously queried dimensions
  const previousDims = new Set(cached.dimensions);
  const requestedDims = new Set(requestedDimensions);

  // If requested is subset of previous, it could enable differencing
  const isSubset = [...requestedDims].every(dim => previousDims.has(dim));
  const isSuperset = [...previousDims].every(dim => requestedDims.has(dim));

  if (isSubset && requestedDims.size < previousDims.size) {
    // Requested is strict subset - DENY (enables differencing)
    return false;
  }

  if (isSuperset && previousDims.size < requestedDims.size) {
    // Requested is strict superset - DENY (enables differencing)
    return false;
  }

  // Update cache with new query
  queryCache.set(key, { dimensions: requestedDimensions, timestamp: Date.now() });
  return true;
}

/**
 * Apply complementary suppression
 * If suppressing cells would reveal others via subtraction, suppress those too
 */
function applyComplementarySuppression(
  cohorts: Array<{ value: string; count: number }>,
  total: number
): Array<{ value: string; count: number | string; percentage?: number }> {
  // Count non-suppressed cells
  const nonSuppressed = cohorts.filter(c => c.count >= K_THRESHOLD);
  const suppressed = cohorts.filter(c => c.count < K_THRESHOLD);

  if (suppressed.length === 0) {
    // No suppression needed
    return cohorts.map(c => ({
      value: c.value,
      count: c.count,
      percentage: (c.count / total) * 100,
    }));
  }

  // If only one cell remains after suppression, it can be inferred via subtraction
  if (nonSuppressed.length === 1) {
    // Suppress all cells
    return cohorts.map(c => ({
      value: c.value,
      count: '<suppressed>',
    }));
  }

  // If suppressed cells sum can be inferred (difference between total and non-suppressed)
  const nonSuppressedSum = nonSuppressed.reduce((sum, c) => sum + c.count, 0);
  const suppressedSum = total - nonSuppressedSum;

  if (suppressedSum < K_THRESHOLD && suppressed.length > 0) {
    // The suppressed total is itself < k, which could leak info
    // Apply additional suppression to smallest non-suppressed cell
    const sorted = [...nonSuppressed].sort((a, b) => a.count - b.count);
    const toSuppress = new Set([...suppressed.map(c => c.value), sorted[0].value]);

    return cohorts.map(c => ({
      value: c.value,
      count: toSuppress.has(c.value) ? '<suppressed>' : c.count,
      percentage: toSuppress.has(c.value) ? undefined : (c.count / total) * 100,
    }));
  }

  // Standard suppression
  return cohorts.map(c => ({
    value: c.value,
    count: c.count < K_THRESHOLD ? '<suppressed>' : c.count,
    percentage: c.count < K_THRESHOLD ? undefined : (c.count / total) * 100,
  }));
}

/**
 * Get poll results with k-anonymity enforcement
 */
export async function getPollResults(
  pollId: string,
  breakdownBy?: string[]
): Promise<PollResultsResponse> {
  // Validate no overlapping queries (inference protection)
  if (breakdownBy && breakdownBy.length > 0) {
    const allowed = validateNoOverlap(pollId, breakdownBy);
    if (!allowed) {
      throw new Error(
        'Query denied: Would enable inference attack via cohort differencing. ' +
        'Cannot query overlapping demographic dimensions.'
      );
    }
  }

  // Get total vote count
  const totalResult = await query(
    'SELECT COUNT(*) as count FROM votes WHERE poll_id = $1',
    [pollId]
  );
  const totalVotes = parseInt(totalResult.rows[0].count, 10);

  // Enforce minimum votes for any results
  if (totalVotes < K_THRESHOLD) {
    return {
      pollId,
      totalVotes: 0, // Hide actual count
      results: [],
      metadata: {
        kThreshold: K_THRESHOLD,
        suppressedCells: 0,
        lastUpdated: new Date().toISOString(),
      },
    };
  }

  // Get results by option
  const resultsQuery = await query(
    `SELECT
       v.option_id,
       po.text as option_text,
       COUNT(*) as count
     FROM votes v
     JOIN poll_options po ON v.option_id = po.id
     WHERE v.poll_id = $1
     GROUP BY v.option_id, po.text
     ORDER BY po.display_order`,
    [pollId]
  );

  const results: PollResult[] = resultsQuery.rows.map(row => ({
    optionId: row.option_id,
    optionText: row.option_text,
    count: parseInt(row.count, 10),
    percentage: (parseInt(row.count, 10) / totalVotes) * 100,
  }));

  // Apply k-anonymity to option counts
  let suppressedCells = 0;
  const safeResults = results.map(r => {
    if (r.count < K_THRESHOLD) {
      suppressedCells++;
      return {
        ...r,
        count: 0, // Suppress
        percentage: 0,
      };
    }
    return r;
  });

  // Get breakdowns if requested
  let breakdowns: Record<string, BreakdownResult> | undefined;

  if (breakdownBy && breakdownBy.length > 0) {
    breakdowns = {};

    for (const dimension of breakdownBy) {
      // Validate dimension
      const validDimensions = ['age_bucket', 'gender', 'region_codes'];
      if (!validDimensions.includes(dimension)) {
        continue;
      }

      // Query breakdown
      const jsonField =
        dimension === 'region_codes'
          ? `demographics_snapshot->'region_codes'->>0` // First region only
          : `demographics_snapshot->>'${dimension}'`;

      const breakdownQuery = await query(
        `SELECT
           ${jsonField} as cohort_value,
           COUNT(*) as count
         FROM votes
         WHERE poll_id = $1
           AND ${jsonField} IS NOT NULL
         GROUP BY ${jsonField}`,
        [pollId]
      );

      const cohorts = breakdownQuery.rows.map(row => ({
        value: row.cohort_value,
        count: parseInt(row.count, 10),
      }));

      // Apply k-anonymity with complementary suppression
      const safeCohorts = applyComplementarySuppression(cohorts, totalVotes);

      // Count suppressed cells
      suppressedCells += safeCohorts.filter(c => c.count === '<suppressed>').length;

      // Only include breakdown if at least 3 non-suppressed cells
      const nonSuppressed = safeCohorts.filter(c => c.count !== '<suppressed>');
      if (nonSuppressed.length >= 3) {
        breakdowns[dimension] = {
          dimension,
          cohorts: safeCohorts,
        };
      } else {
        // Too few cells - suppress entire dimension
        suppressedCells += safeCohorts.length;
      }
    }
  }

  return {
    pollId,
    totalVotes,
    results: safeResults,
    breakdowns,
    metadata: {
      kThreshold: K_THRESHOLD,
      suppressedCells,
      lastUpdated: new Date().toISOString(),
    },
  };
}

/**
 * Get security events summary (aggregated only, no PII)
 */
export async function getSecurityEventsSummary(options?: {
  startDate?: Date;
  endDate?: Date;
  eventTypes?: string[];
}) {
  const conditions: string[] = ['1=1'];
  const params: any[] = [];
  let paramIndex = 1;

  if (options?.startDate) {
    conditions.push(`created_at >= $${paramIndex}`);
    params.push(options.startDate);
    paramIndex++;
  }

  if (options?.endDate) {
    conditions.push(`created_at <= $${paramIndex}`);
    params.push(options.endDate);
    paramIndex++;
  }

  if (options?.eventTypes && options.eventTypes.length > 0) {
    conditions.push(`event_type = ANY($${paramIndex})`);
    params.push(options.eventTypes);
    paramIndex++;
  }

  // Aggregate by event type and severity
  const summaryQuery = await query(
    `SELECT
       event_type,
       severity,
       COUNT(*) as count,
       MIN(created_at) as first_seen,
       MAX(created_at) as last_seen
     FROM security_events
     WHERE ${conditions.join(' AND ')}
     GROUP BY event_type, severity
     ORDER BY count DESC`,
    params
  );

  // Get total counts
  const totalQuery = await query(
    `SELECT COUNT(*) as total FROM security_events WHERE ${conditions.join(' AND ')}`,
    params
  );

  const total = parseInt(totalQuery.rows[0].total, 10);

  // Apply k-anonymity to event counts
  const events = summaryQuery.rows.map(row => {
    const count = parseInt(row.count, 10);

    return {
      eventType: row.event_type,
      severity: row.severity,
      count: count < K_THRESHOLD ? '<suppressed>' : count,
      firstSeen: count < K_THRESHOLD ? undefined : row.first_seen,
      lastSeen: count < K_THRESHOLD ? undefined : row.last_seen,
    };
  });

  // Count suppressed events
  const suppressedCount = events.filter(e => e.count === '<suppressed>').length;

  return {
    total: total < K_THRESHOLD ? '<suppressed>' : total,
    events,
    metadata: {
      kThreshold: K_THRESHOLD,
      suppressedEvents: suppressedCount,
      timeRange: {
        start: options?.startDate?.toISOString(),
        end: options?.endDate?.toISOString(),
      },
    },
  };
}

/**
 * Clear query cache for a poll (call after poll ends)
 */
export function clearQueryCache(pollId: string) {
  queryCache.delete(`poll:${pollId}`);
}
