import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import {
  issueAttestation,
  verifyAttestation,
  computeVotePayloadHash,
  verifyVotePayloadHash
} from '../src/services/attestations.js';
import { NonceService } from '../src/services/nonce.js';
import { connectRedis, closeRedis } from '../src/db/redis.js';
import { pool } from '../src/db/client.js';

describe('Attestation Service', () => {
  beforeAll(async () => {
    await connectRedis();
  });

  afterAll(async () => {
    await closeRedis();
    await pool.end();
  });

  describe('issueAttestation', () => {
    it('should issue valid attestation with unused nonce', async () => {
      const { nonce } = await NonceService.generate();
      const pollId = '123e4567-e89b-12d3-a456-426614174000';
      const optionId = '123e4567-e89b-12d3-a456-426614174001';
      const timestampBucket = Math.floor(Date.now() / 1000);

      const result = await issueAttestation({
        deviceKey: 'test_device_key_001',
        pollId,
        optionId,
        timestampBucket,
        nonce,
      });

      expect(result.attestation).toBeDefined();
      expect(result.issuedAt).toBeGreaterThan(0);
      expect(result.ttlSec).toBeGreaterThan(0);
      expect(result.kid).toBeDefined();

      // Verify attestation can be decoded
      const decoded = verifyAttestation(result.attestation);
      expect(decoded.v).toBe('dtfg.att.v1');
      expect(decoded.pollId).toBe(pollId);
      expect(decoded.nonce).toBe(nonce);
    });

    it('should reject used nonce (replay)', async () => {
      const { nonce } = await NonceService.generate();
      const pollId = '123e4567-e89b-12d3-a456-426614174000';
      const optionId = '123e4567-e89b-12d3-a456-426614174001';
      const timestampBucket = Math.floor(Date.now() / 1000);

      // Use nonce first time
      await issueAttestation({
        deviceKey: 'test_device_key_002',
        pollId,
        optionId,
        timestampBucket,
        nonce,
      });

      // Try to use same nonce again (replay attack)
      await expect(
        issueAttestation({
          deviceKey: 'test_device_key_003',
          pollId,
          optionId,
          timestampBucket,
          nonce,
        })
      ).rejects.toThrow(/already used|replay/i);
    });

    it('should reject non-existent nonce', async () => {
      const pollId = '123e4567-e89b-12d3-a456-426614174000';
      const optionId = '123e4567-e89b-12d3-a456-426614174001';
      const timestampBucket = Math.floor(Date.now() / 1000);

      await expect(
        issueAttestation({
          deviceKey: 'test_device_key_004',
          pollId,
          optionId,
          timestampBucket,
          nonce: 'invalid_nonce_12345678901234567890123456789012345678901234',
        })
      ).rejects.toThrow(/nonce/i);
    });
  });

  describe('verifyAttestation', () => {
    it('should verify valid attestation', async () => {
      const { nonce } = await NonceService.generate();
      const pollId = '123e4567-e89b-12d3-a456-426614174000';
      const optionId = '123e4567-e89b-12d3-a456-426614174001';
      const timestampBucket = Math.floor(Date.now() / 1000);

      const { attestation } = await issueAttestation({
        deviceKey: 'test_device_key_005',
        pollId,
        optionId,
        timestampBucket,
        nonce,
      });

      const decoded = verifyAttestation(attestation);

      expect(decoded.v).toBe('dtfg.att.v1');
      expect(decoded.pollId).toBe(pollId);
      expect(decoded.sub).toBeDefined();
      expect(decoded.data).toBeDefined();
      expect(decoded.votePayloadHash).toBeDefined();
    });

    it('should reject invalid signature', async () => {
      const fakeAttestation = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';

      expect(() => verifyAttestation(fakeAttestation)).toThrow(/invalid/i);
    });
  });

  describe('votePayloadHash validation', () => {
    it('should accept matching vote payload hash', async () => {
      const { nonce } = await NonceService.generate();
      const pollId = '123e4567-e89b-12d3-a456-426614174000';
      const optionId = '123e4567-e89b-12d3-a456-426614174001';
      const timestampBucket = Math.floor(Date.now() / 1000);

      const { attestation } = await issueAttestation({
        deviceKey: 'test_device_key_006',
        pollId,
        optionId,
        timestampBucket,
        nonce,
      });

      const decoded = verifyAttestation(attestation);

      // Verify with same parameters
      const isValid = verifyVotePayloadHash(decoded, pollId, optionId, timestampBucket);
      expect(isValid).toBe(true);
    });

    it('should reject mismatched pollId', async () => {
      const { nonce } = await NonceService.generate();
      const pollId = '123e4567-e89b-12d3-a456-426614174000';
      const optionId = '123e4567-e89b-12d3-a456-426614174001';
      const timestampBucket = Math.floor(Date.now() / 1000);

      const { attestation } = await issueAttestation({
        deviceKey: 'test_device_key_007',
        pollId,
        optionId,
        timestampBucket,
        nonce,
      });

      const decoded = verifyAttestation(attestation);

      // Try with different pollId
      const differentPollId = '123e4567-e89b-12d3-a456-426614174999';
      const isValid = verifyVotePayloadHash(decoded, differentPollId, optionId, timestampBucket);
      expect(isValid).toBe(false);
    });

    it('should reject mismatched optionId', async () => {
      const { nonce } = await NonceService.generate();
      const pollId = '123e4567-e89b-12d3-a456-426614174000';
      const optionId = '123e4567-e89b-12d3-a456-426614174001';
      const timestampBucket = Math.floor(Date.now() / 1000);

      const { attestation } = await issueAttestation({
        deviceKey: 'test_device_key_008',
        pollId,
        optionId,
        timestampBucket,
        nonce,
      });

      const decoded = verifyAttestation(attestation);

      // Try with different optionId
      const differentOptionId = '123e4567-e89b-12d3-a456-426614174999';
      const isValid = verifyVotePayloadHash(decoded, pollId, differentOptionId, timestampBucket);
      expect(isValid).toBe(false);
    });

    it('should reject mismatched timestampBucket', async () => {
      const { nonce } = await NonceService.generate();
      const pollId = '123e4567-e89b-12d3-a456-426614174000';
      const optionId = '123e4567-e89b-12d3-a456-426614174001';
      const timestampBucket = Math.floor(Date.now() / 1000);

      const { attestation } = await issueAttestation({
        deviceKey: 'test_device_key_009',
        pollId,
        optionId,
        timestampBucket,
        nonce,
      });

      const decoded = verifyAttestation(attestation);

      // Try with different timestampBucket
      const differentTimestamp = timestampBucket + 3600;
      const isValid = verifyVotePayloadHash(decoded, pollId, optionId, differentTimestamp);
      expect(isValid).toBe(false);
    });
  });

  describe('computeVotePayloadHash', () => {
    it('should compute deterministic hash', () => {
      const pollId = 'poll_123';
      const optionId = 'option_456';
      const timestampBucket = 1234567890;

      const hash1 = computeVotePayloadHash(pollId, optionId, timestampBucket);
      const hash2 = computeVotePayloadHash(pollId, optionId, timestampBucket);

      expect(hash1).toBe(hash2);
      expect(hash1.length).toBe(64); // SHA-256 hex
    });

    it('should produce different hash for different inputs', () => {
      const pollId = 'poll_123';
      const optionId1 = 'option_456';
      const optionId2 = 'option_789';
      const timestampBucket = 1234567890;

      const hash1 = computeVotePayloadHash(pollId, optionId1, timestampBucket);
      const hash2 = computeVotePayloadHash(pollId, optionId2, timestampBucket);

      expect(hash1).not.toBe(hash2);
    });
  });
});
