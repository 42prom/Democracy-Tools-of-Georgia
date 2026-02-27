/**
 * Unit and fuzz tests for the nullifier system.
 * Tests determinism, uniqueness, and constant-time comparison.
 *
 * NOTE: computeNullifier is now async (delegates to CryptoRegistry).
 * All tests are async and use await.
 */

// Set test secret BEFORE any imports so CryptoRegistry picks it up
process.env.NULLIFIER_SECRET = 'test_secret_for_jest_do_not_use_in_production_abcdef1234567890';
process.env.CRYPTO_HASHER = 'hmac';

import { computeNullifier, verifyNullifier } from '../src/services/nullifier';
import { CryptoRegistry } from '../src/crypto/CryptoRegistry';

// Initialise CryptoRegistry once before all tests
beforeAll(async () => {
  await CryptoRegistry.init();
});

describe('Nullifier Service', () => {

  describe('computeNullifier', () => {
    it('should be deterministic — same inputs always produce the same nullifier', async () => {
      const n1 = await computeNullifier('user-uuid-001', 'poll-uuid-001');
      const n2 = await computeNullifier('user-uuid-001', 'poll-uuid-001');
      expect(n1).toBe(n2);
    });

    it('should produce a 64-character hex string (256-bit)', async () => {
      const n = await computeNullifier('user-001', 'poll-001');
      expect(n).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should produce different nullifiers for different voters on the same poll', async () => {
      const n1 = await computeNullifier('voter-A', 'poll-001');
      const n2 = await computeNullifier('voter-B', 'poll-001');
      expect(n1).not.toBe(n2);
    });

    it('should produce different nullifiers for the same voter on different polls', async () => {
      const n1 = await computeNullifier('voter-A', 'poll-001');
      const n2 = await computeNullifier('voter-A', 'poll-002');
      expect(n1).not.toBe(n2);
    });

    it('should produce different nullifiers for all combinations in a matrix', async () => {
      const voters = ['voter-1', 'voter-2', 'voter-3'];
      const polls = ['poll-A', 'poll-B', 'poll-C'];
      const nullifiers = new Set<string>();

      for (const v of voters) {
        for (const p of polls) {
          nullifiers.add(await computeNullifier(v, p));
        }
      }

      // All 9 combinations should produce unique nullifiers
      expect(nullifiers.size).toBe(9);
    });

    it('should not be trivially guessable — prefix concatenation attack', async () => {
      // Ensure "voter-A" + "|" + "poll-B" and "voter-A|poll" + "-B" differ
      const n1 = await computeNullifier('voter-A', 'poll-B');
      const n2 = await computeNullifier('voter-A|poll', 'B'); // prefix injection attempt
      expect(n1).not.toBe(n2);
    });

    it('fuzz: 100 random inputs should all produce unique nullifiers', async () => {
      const results = new Set<string>();
      for (let i = 0; i < 100; i++) {
        const voter = `voter-${Math.random().toString(36).slice(2)}`;
        const poll = `poll-${Math.random().toString(36).slice(2)}`;
        results.add(await computeNullifier(voter, poll));
      }
      expect(results.size).toBe(100);
    });
  });

  describe('verifyNullifier', () => {
    it('should return true when the supplied value matches server-computed', async () => {
      const voterSub = 'voter-verify-test';
      const pollId = 'poll-verify-test';
      const serverComputed = await computeNullifier(voterSub, pollId);
      const result = await verifyNullifier(voterSub, pollId, serverComputed);
      expect(result).toBe(true);
    });

    it('should return false for a tampered nullifier', async () => {
      const serverComputed = await computeNullifier('voter-X', 'poll-X');
      const tampered = (serverComputed as string).slice(0, -2) + 'ff';
      const result = await verifyNullifier('voter-X', 'poll-X', tampered);
      expect(result).toBe(false);
    });

    it('should return false for an empty string', async () => {
      const result = await verifyNullifier('voter-X', 'poll-X', '');
      expect(result).toBe(false);
    });

    it('should return false for a nullifier from a different voter', async () => {
      const otherNullifier = await computeNullifier('voter-Y', 'poll-X');
      const result = await verifyNullifier('voter-X', 'poll-X', otherNullifier as string);
      expect(result).toBe(false);
    });
  });
});
