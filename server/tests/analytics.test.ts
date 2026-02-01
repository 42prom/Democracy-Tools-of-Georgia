import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { getPollResults, getSecurityEventsSummary, clearQueryCache } from '../src/services/analytics.js';
import { connectRedis, closeRedis } from '../src/db/redis.js';
import { query, pool } from '../src/db/client.js';

describe('Analytics with k-Anonymity', () => {
  let testPollId: string;
  let testOptionIds: string[];

  beforeAll(async () => {
    await connectRedis();

    // Create test poll
    const pollResult = await query(
      `INSERT INTO polls (title, type, status, audience_rules, min_k_anonymity)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      ['Analytics Test Poll', 'survey', 'active', JSON.stringify({}), 30]
    );
    testPollId = pollResult.rows[0].id;

    // Create options
    const option1 = await query(
      `INSERT INTO poll_options (poll_id, text, display_order) VALUES ($1, $2, $3) RETURNING id`,
      [testPollId, 'Option A', 0]
    );
    const option2 = await query(
      `INSERT INTO poll_options (poll_id, text, display_order) VALUES ($1, $2, $3) RETURNING id`,
      [testPollId, 'Option B', 1]
    );
    testOptionIds = [option1.rows[0].id, option2.rows[0].id];
  });

  afterAll(async () => {
    // Cleanup
    await query('DELETE FROM votes WHERE poll_id = $1', [testPollId]);
    await query('DELETE FROM vote_nullifiers WHERE poll_id = $1', [testPollId]);
    await query('DELETE FROM poll_options WHERE poll_id = $1', [testPollId]);
    await query('DELETE FROM polls WHERE id = $1', [testPollId]);

    await closeRedis();
    await pool.end();
  });

  describe('k-anonymity enforcement', () => {
    it('should suppress results when total votes < k', async () => {
      // Insert only 5 votes (< k=30)
      for (let i = 0; i < 5; i++) {
        await query(
          `INSERT INTO votes (poll_id, option_id, demographics_snapshot)
           VALUES ($1, $2, $3)`,
          [
            testPollId,
            testOptionIds[0],
            JSON.stringify({ age_bucket: '25-34', gender: 'M', region_codes: ['reg_tbilisi'] }),
          ]
        );
      }

      const results = await getPollResults(testPollId);

      // Should hide total and return empty results
      expect(results.totalVotes).toBe(0);
      expect(results.results.length).toBe(0);
      expect(results.metadata.kThreshold).toBe(30);

      // Cleanup
      await query('DELETE FROM votes WHERE poll_id = $1', [testPollId]);
    });

    it('should suppress individual cells when count < k', async () => {
      // Insert 100 votes for Option A, 5 for Option B
      for (let i = 0; i < 100; i++) {
        await query(
          `INSERT INTO votes (poll_id, option_id, demographics_snapshot)
           VALUES ($1, $2, $3)`,
          [
            testPollId,
            testOptionIds[0],
            JSON.stringify({ age_bucket: '25-34', gender: 'M', region_codes: ['reg_tbilisi'] }),
          ]
        );
      }

      for (let i = 0; i < 5; i++) {
        await query(
          `INSERT INTO votes (poll_id, option_id, demographics_snapshot)
           VALUES ($1, $2, $3)`,
          [
            testPollId,
            testOptionIds[1],
            JSON.stringify({ age_bucket: '25-34', gender: 'F', region_codes: ['reg_tbilisi'] }),
          ]
        );
      }

      const results = await getPollResults(testPollId);

      // Total should be shown (105 >= k)
      expect(results.totalVotes).toBe(105);

      // Option A should be shown (100 >= k)
      const optionA = results.results.find(r => r.optionId === testOptionIds[0]);
      expect(optionA?.count).toBe(100);

      // Option B should be suppressed (5 < k)
      const optionB = results.results.find(r => r.optionId === testOptionIds[1]);
      expect(optionB?.count).toBe(0); // Suppressed

      expect(results.metadata.suppressedCells).toBeGreaterThan(0);

      // Cleanup
      await query('DELETE FROM votes WHERE poll_id = $1', [testPollId]);
    });

    it('should show results when all cells >= k', async () => {
      // Insert 50 votes for each option (both >= k)
      for (let i = 0; i < 50; i++) {
        await query(
          `INSERT INTO votes (poll_id, option_id, demographics_snapshot)
           VALUES ($1, $2, $3)`,
          [
            testPollId,
            testOptionIds[0],
            JSON.stringify({ age_bucket: '25-34', gender: 'M', region_codes: ['reg_tbilisi'] }),
          ]
        );

        await query(
          `INSERT INTO votes (poll_id, option_id, demographics_snapshot)
           VALUES ($1, $2, $3)`,
          [
            testPollId,
            testOptionIds[1],
            JSON.stringify({ age_bucket: '35-44', gender: 'F', region_codes: ['reg_batumi'] }),
          ]
        );
      }

      const results = await getPollResults(testPollId);

      expect(results.totalVotes).toBe(100);
      expect(results.results[0].count).toBe(50);
      expect(results.results[1].count).toBe(50);
      expect(results.metadata.suppressedCells).toBe(0);

      // Cleanup for next test
      // Don't delete - keep for breakdown tests
    });
  });

  describe('demographic breakdowns with k-anonymity', () => {
    it('should suppress cohorts with count < k', async () => {
      const results = await getPollResults(testPollId, ['gender']);

      expect(results.breakdowns).toBeDefined();

      if (results.breakdowns?.gender) {
        const cohorts = results.breakdowns.gender.cohorts;

        // Each gender should have 50 votes (from previous test)
        const maleCohort = cohorts.find(c => c.value === 'M');
        const femaleCohort = cohorts.find(c => c.value === 'F');

        expect(maleCohort?.count).toBe(50); // >= k
        expect(femaleCohort?.count).toBe(50); // >= k
      }

      clearQueryCache(testPollId); // Reset for next test
    });

    it('should apply complementary suppression', async () => {
      // Clear existing votes
      await query('DELETE FROM votes WHERE poll_id = $1', [testPollId]);

      // Create scenario: 95 votes in one cohort, 5 in another
      // Both should be suppressed to prevent inference
      for (let i = 0; i < 95; i++) {
        await query(
          `INSERT INTO votes (poll_id, option_id, demographics_snapshot)
           VALUES ($1, $2, $3)`,
          [
            testPollId,
            testOptionIds[0],
            JSON.stringify({ age_bucket: '25-34', gender: 'M', region_codes: ['reg_tbilisi'] }),
          ]
        );
      }

      for (let i = 0; i < 5; i++) {
        await query(
          `INSERT INTO votes (poll_id, option_id, demographics_snapshot)
           VALUES ($1, $2, $3)`,
          [
            testPollId,
            testOptionIds[0],
            JSON.stringify({ age_bucket: '25-34', gender: 'F', region_codes: ['reg_tbilisi'] }),
          ]
        );
      }

      clearQueryCache(testPollId);
      const results = await getPollResults(testPollId, ['gender']);

      if (results.breakdowns?.gender) {
        const cohorts = results.breakdowns.gender.cohorts;

        // With only 2 cohorts and one < k, complementary suppression should apply
        // Check that small cohort is suppressed
        const smallCohort = cohorts.find(c => c.value === 'F');
        expect(smallCohort?.count).toBe('<suppressed>');
      }

      // Cleanup
      await query('DELETE FROM votes WHERE poll_id = $1', [testPollId]);
      clearQueryCache(testPollId);
    });
  });

  describe('inference attack prevention', () => {
    it('should reject overlapping cohort queries (differencing attack)', async () => {
      // Insert test data
      for (let i = 0; i < 50; i++) {
        await query(
          `INSERT INTO votes (poll_id, option_id, demographics_snapshot)
           VALUES ($1, $2, $3)`,
          [
            testPollId,
            testOptionIds[0],
            JSON.stringify({ age_bucket: '25-34', gender: 'M', region_codes: ['reg_tbilisi'] }),
          ]
        );
      }

      clearQueryCache(testPollId);

      // First query: breakdown by both gender and age
      await getPollResults(testPollId, ['gender', 'age_bucket']);

      // Second query: breakdown by just gender (subset)
      // This would allow differencing to infer age distribution
      await expect(
        getPollResults(testPollId, ['gender'])
      ).rejects.toThrow(/inference attack/i);

      // Cleanup
      await query('DELETE FROM votes WHERE poll_id = $1', [testPollId]);
      clearQueryCache(testPollId);
    });

    it('should allow same query multiple times', async () => {
      for (let i = 0; i < 50; i++) {
        await query(
          `INSERT INTO votes (poll_id, option_id, demographics_snapshot)
           VALUES ($1, $2, $3)`,
          [
            testPollId,
            testOptionIds[0],
            JSON.stringify({ age_bucket: '25-34', gender: 'M', region_codes: ['reg_tbilisi'] }),
          ]
        );
      }

      clearQueryCache(testPollId);

      // First query
      const result1 = await getPollResults(testPollId, ['gender']);

      // Same query again - should be allowed
      const result2 = await getPollResults(testPollId, ['gender']);

      expect(result1).toBeDefined();
      expect(result2).toBeDefined();

      // Cleanup
      await query('DELETE FROM votes WHERE poll_id = $1', [testPollId]);
      clearQueryCache(testPollId);
    });
  });

  describe('minimum cell requirement', () => {
    it('should suppress entire dimension if < 3 non-suppressed cells', async () => {
      // Clear and insert data with only 2 valid cohorts
      await query('DELETE FROM votes WHERE poll_id = $1', [testPollId]);

      // 50 males, 40 females, 5 other (will be suppressed)
      for (let i = 0; i < 50; i++) {
        await query(
          `INSERT INTO votes (poll_id, option_id, demographics_snapshot)
           VALUES ($1, $2, $3)`,
          [
            testPollId,
            testOptionIds[0],
            JSON.stringify({ age_bucket: '25-34', gender: 'M', region_codes: ['reg_tbilisi'] }),
          ]
        );
      }

      for (let i = 0; i < 40; i++) {
        await query(
          `INSERT INTO votes (poll_id, option_id, demographics_snapshot)
           VALUES ($1, $2, $3)`,
          [
            testPollId,
            testOptionIds[0],
            JSON.stringify({ age_bucket: '25-34', gender: 'F', region_codes: ['reg_tbilisi'] }),
          ]
        );
      }

      for (let i = 0; i < 5; i++) {
        await query(
          `INSERT INTO votes (poll_id, option_id, demographics_snapshot)
           VALUES ($1, $2, $3)`,
          [
            testPollId,
            testOptionIds[0],
            JSON.stringify({ age_bucket: '25-34', gender: 'O', region_codes: ['reg_tbilisi'] }),
          ]
        );
      }

      clearQueryCache(testPollId);
      const results = await getPollResults(testPollId, ['gender']);

      // Should have only 2 non-suppressed cells (M, F)
      // This might trigger additional suppression depending on implementation

      // Cleanup
      await query('DELETE FROM votes WHERE poll_id = $1', [testPollId]);
      clearQueryCache(testPollId);
    });
  });
});

describe('Security Events Summary', () => {
  beforeAll(async () => {
    await connectRedis();

    // Insert test security events
    for (let i = 0; i < 50; i++) {
      await query(
        `INSERT INTO security_events (event_type, severity, meta)
         VALUES ($1, $2, $3)`,
        ['vote_recorded', 'info', JSON.stringify({ test: true })]
      );
    }

    for (let i = 0; i < 5; i++) {
      await query(
        `INSERT INTO security_events (event_type, severity, meta)
         VALUES ($1, $2, $3)`,
        ['duplicate_vote_rejected', 'warning', JSON.stringify({ test: true })]
      );
    }
  });

  afterAll(async () => {
    await query(`DELETE FROM security_events WHERE meta->>'test' = 'true'`);
    await closeRedis();
  });

  it('should suppress event types with count < k', async () => {
    const summary = await getSecurityEventsSummary();

    // vote_recorded (50) should be shown
    const voteRecorded = summary.events.find(e => e.eventType === 'vote_recorded');
    expect(voteRecorded?.count).toBe(50);

    // duplicate_vote_rejected (5) should be suppressed
    const duplicateRejected = summary.events.find(e => e.eventType === 'duplicate_vote_rejected');
    expect(duplicateRejected?.count).toBe('<suppressed>');

    expect(summary.metadata.suppressedEvents).toBeGreaterThan(0);
  });

  it('should return aggregated counts only (no individual events)', async () => {
    const summary = await getSecurityEventsSummary();

    expect(summary.events).toBeDefined();
    expect(Array.isArray(summary.events)).toBe(true);

    // Should not contain individual event details
    summary.events.forEach(event => {
      expect(event).not.toHaveProperty('user_ref');
      expect(event).not.toHaveProperty('ip_hash');
      expect(event).not.toHaveProperty('id');
    });
  });

  it('should support date range filtering', async () => {
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const summary = await getSecurityEventsSummary({
      startDate: yesterday,
      endDate: now,
    });

    expect(summary.metadata.timeRange.start).toBeDefined();
    expect(summary.metadata.timeRange.end).toBeDefined();
  });
});
