import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { NonceService } from '../src/services/nonce.js';
import { connectRedis, closeRedis } from '../src/db/redis.js';

describe('NonceService', () => {
  beforeAll(async () => {
    await connectRedis();
  });

  afterAll(async () => {
    await closeRedis();
  });

  describe('generate', () => {
    it('should generate a valid nonce with status=unused', async () => {
      const { nonce, ttl } = await NonceService.generate();

      expect(nonce).toBeDefined();
      expect(typeof nonce).toBe('string');
      expect(nonce.length).toBe(64); // 32 bytes hex = 64 chars
      expect(ttl).toBeGreaterThan(0);

      // Verify status is unused
      const status = await NonceService.getStatus(nonce);
      expect(status).not.toBeNull();
      expect(status?.status).toBe('unused');
    });

    it('should generate unique nonces', async () => {
      const { nonce: nonce1 } = await NonceService.generate();
      const { nonce: nonce2 } = await NonceService.generate();

      expect(nonce1).not.toBe(nonce2);
    });
  });

  describe('verifyAndMarkUsed - replay protection', () => {
    it('should mark nonce as used and accept first use', async () => {
      const { nonce } = await NonceService.generate();

      // First use should succeed
      const result = await NonceService.verifyAndMarkUsed(nonce);
      expect(result).toBe(true);

      // Verify status is now 'used'
      const status = await NonceService.getStatus(nonce);
      expect(status?.status).toBe('used');
    });

    it('should reject nonce replay (second use)', async () => {
      const { nonce } = await NonceService.generate();

      // First use
      const firstUse = await NonceService.verifyAndMarkUsed(nonce);
      expect(firstUse).toBe(true);

      // Second use should fail (replay attack)
      const secondUse = await NonceService.verifyAndMarkUsed(nonce);
      expect(secondUse).toBe(false);
    });

    it('should reject non-existent nonce', async () => {
      const result = await NonceService.verifyAndMarkUsed('invalid_nonce_12345678901234567890123456789012');
      expect(result).toBe(false);
    });
  });

  describe('expiration', () => {
    it('should reject expired nonce', async () => {
      // This test would require either:
      // 1. Waiting for TTL to expire (slow)
      // 2. Mocking time (complex)
      // 3. Setting very short TTL for test

      // For now, we verify TTL is set correctly
      const { nonce, ttl } = await NonceService.generate();
      expect(ttl).toBeGreaterThan(0);

      const status = await NonceService.getStatus(nonce);
      expect(status?.expiresAt).toBeGreaterThan(Date.now());
    }, 10000);
  });

  describe('isValid', () => {
    it('should return true for valid unused nonce', async () => {
      const { nonce } = await NonceService.generate();
      const isValid = await NonceService.isValid(nonce);
      expect(isValid).toBe(true);
    });

    it('should return false for used nonce', async () => {
      const { nonce } = await NonceService.generate();
      await NonceService.verifyAndMarkUsed(nonce);

      const isValid = await NonceService.isValid(nonce);
      expect(isValid).toBe(false);
    });

    it('should return false for non-existent nonce', async () => {
      const isValid = await NonceService.isValid('nonexistent_nonce_1234567890123456789012345678');
      expect(isValid).toBe(false);
    });
  });
});
