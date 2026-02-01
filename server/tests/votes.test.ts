import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { submitVote } from '../src/services/votes.js';
import { issueAttestation } from '../src/services/attestations.js';
import { NonceService } from '../src/services/nonce.js';
import { connectRedis, closeRedis } from '../src/db/redis.js';
import { query, pool } from '../src/db/client.js';

describe('Vote Submission', () => {
  let testPollId: string;
  let testOptionId: string;

  beforeAll(async () => {
    await connectRedis();

    // Create a test poll
    const pollResult = await query(
      `INSERT INTO polls (title, type, status, audience_rules, min_k_anonymity)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      ['Test Poll', 'survey', 'active', JSON.stringify({ gender: 'all' }), 30]
    );
    testPollId = pollResult.rows[0].id;

    // Create poll options
    const optionResult = await query(
      `INSERT INTO poll_options (poll_id, text, display_order)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [testPollId, 'Option A', 0]
    );
    testOptionId = optionResult.rows[0].id;
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

  describe('successful vote submission', () => {
    it('should accept valid vote with correct attestation', async () => {
      const { nonce } = await NonceService.generate();
      const timestampBucket = Math.floor(Date.now() / 1000);

      // Issue attestation
      const { attestation } = await issueAttestation({
        deviceKey: 'test_device_vote_001',
        pollId: testPollId,
        optionId: testOptionId,
        timestampBucket,
        nonce,
      });

      // Submit vote
      const result = await submitVote({
        pollId: testPollId,
        optionId: testOptionId,
        nullifier: 'test_nullifier_001',
        timestampBucket,
        attestation,
      });

      expect(result.txHash).toBeDefined();
      expect(result.receipt).toBe('Vote recorded');
    });
  });

  describe('duplicate nullifier rejection', () => {
    it('should reject duplicate nullifier (double vote)', async () => {
      const nullifier = 'test_nullifier_duplicate_' + Date.now();

      // First vote
      const { nonce: nonce1 } = await NonceService.generate();
      const timestampBucket1 = Math.floor(Date.now() / 1000);

      const { attestation: attestation1 } = await issueAttestation({
        deviceKey: 'test_device_vote_002',
        pollId: testPollId,
        optionId: testOptionId,
        timestampBucket: timestampBucket1,
        nonce: nonce1,
      });

      await submitVote({
        pollId: testPollId,
        optionId: testOptionId,
        nullifier,
        timestampBucket: timestampBucket1,
        attestation: attestation1,
      });

      // Second vote with same nullifier (different attestation)
      const { nonce: nonce2 } = await NonceService.generate();
      const timestampBucket2 = Math.floor(Date.now() / 1000) + 1;

      const { attestation: attestation2 } = await issueAttestation({
        deviceKey: 'test_device_vote_003',
        pollId: testPollId,
        optionId: testOptionId,
        timestampBucket: timestampBucket2,
        nonce: nonce2,
      });

      // Should reject duplicate nullifier
      await expect(
        submitVote({
          pollId: testPollId,
          optionId: testOptionId,
          nullifier, // Same nullifier
          timestampBucket: timestampBucket2,
          attestation: attestation2,
        })
      ).rejects.toThrow(/already voted|duplicate nullifier/i);
    });
  });

  describe('attestation validation', () => {
    it('should reject invalid attestation signature', async () => {
      const timestampBucket = Math.floor(Date.now() / 1000);
      const fakeAttestation = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.invalid.signature';

      await expect(
        submitVote({
          pollId: testPollId,
          optionId: testOptionId,
          nullifier: 'test_nullifier_invalid_sig',
          timestampBucket,
          attestation: fakeAttestation,
        })
      ).rejects.toThrow(/attestation verification failed/i);
    });

    it('should reject attestation for wrong poll', async () => {
      const { nonce } = await NonceService.generate();
      const timestampBucket = Math.floor(Date.now() / 1000);

      // Issue attestation for different poll
      const differentPollId = '123e4567-e89b-12d3-a456-999999999999';
      const { attestation } = await issueAttestation({
        deviceKey: 'test_device_vote_004',
        pollId: differentPollId,
        optionId: testOptionId,
        timestampBucket,
        nonce,
      });

      // Try to use it for different poll
      await expect(
        submitVote({
          pollId: testPollId, // Different poll
          optionId: testOptionId,
          nullifier: 'test_nullifier_wrong_poll',
          timestampBucket,
          attestation,
        })
      ).rejects.toThrow(/not valid for this poll/i);
    });
  });

  describe('vote payload hash validation', () => {
    it('should reject mismatched votePayloadHash', async () => {
      const { nonce } = await NonceService.generate();
      const timestampBucket = Math.floor(Date.now() / 1000);

      // Issue attestation with specific parameters
      const { attestation } = await issueAttestation({
        deviceKey: 'test_device_vote_005',
        pollId: testPollId,
        optionId: testOptionId,
        timestampBucket,
        nonce,
      });

      // Try to vote with different timestampBucket (mismatched hash)
      await expect(
        submitVote({
          pollId: testPollId,
          optionId: testOptionId,
          nullifier: 'test_nullifier_mismatch',
          timestampBucket: timestampBucket + 3600, // Different timestamp
          attestation,
        })
      ).rejects.toThrow(/vote payload hash mismatch/i);
    });
  });

  describe('security event logging', () => {
    it('should log successful vote in security_events', async () => {
      const { nonce } = await NonceService.generate();
      const timestampBucket = Math.floor(Date.now() / 1000);

      const { attestation } = await issueAttestation({
        deviceKey: 'test_device_vote_006',
        pollId: testPollId,
        optionId: testOptionId,
        timestampBucket,
        nonce,
      });

      await submitVote({
        pollId: testPollId,
        optionId: testOptionId,
        nullifier: 'test_nullifier_logging_' + Date.now(),
        timestampBucket,
        attestation,
      });

      // Check security event was logged
      const events = await query(
        `SELECT * FROM security_events
         WHERE event_type = 'vote_recorded'
         AND meta->>'pollId' = $1
         ORDER BY created_at DESC
         LIMIT 1`,
        [testPollId]
      );

      expect(events.rows.length).toBeGreaterThan(0);
    });

    it('should log duplicate vote rejection', async () => {
      const nullifier = 'test_nullifier_duplicate_log_' + Date.now();

      // First vote
      const { nonce: nonce1 } = await NonceService.generate();
      const timestampBucket1 = Math.floor(Date.now() / 1000);

      const { attestation: attestation1 } = await issueAttestation({
        deviceKey: 'test_device_vote_007',
        pollId: testPollId,
        optionId: testOptionId,
        timestampBucket: timestampBucket1,
        nonce: nonce1,
      });

      await submitVote({
        pollId: testPollId,
        optionId: testOptionId,
        nullifier,
        timestampBucket: timestampBucket1,
        attestation: attestation1,
      });

      // Try duplicate
      const { nonce: nonce2 } = await NonceService.generate();
      const timestampBucket2 = Math.floor(Date.now() / 1000) + 1;

      const { attestation: attestation2 } = await issueAttestation({
        deviceKey: 'test_device_vote_008',
        pollId: testPollId,
        optionId: testOptionId,
        timestampBucket: timestampBucket2,
        nonce: nonce2,
      });

      try {
        await submitVote({
          pollId: testPollId,
          optionId: testOptionId,
          nullifier,
          timestampBucket: timestampBucket2,
          attestation: attestation2,
        });
      } catch {
        // Expected to fail
      }

      // Check rejection was logged
      const events = await query(
        `SELECT * FROM security_events
         WHERE event_type = 'duplicate_vote_rejected'
         AND meta->>'pollId' = $1
         ORDER BY created_at DESC
         LIMIT 1`,
        [testPollId]
      );

      expect(events.rows.length).toBeGreaterThan(0);
    });
  });
});
