import NonceService from '../src/services/nonce';
import { connectRedis, closeRedis } from '../src/db/redis';

describe('Nonce Service & API', () => {
  beforeAll(async () => {
    await connectRedis();
  });

  afterAll(async () => {
    await closeRedis();
  });

  describe('generateNonce', () => {
    it('should generate a valid nonce', async () => {
      const nonce = await NonceService.generateNonce('challenge');

      expect(nonce).toBeDefined();
      expect(typeof nonce).toBe('string');
      expect(nonce.length).toBe(64); // 32 bytes in hex = 64 chars
    });

    it('should generate unique nonces', async () => {
      const nonce1 = await NonceService.generateNonce('challenge');
      const nonce2 = await NonceService.generateNonce('challenge');

      expect(nonce1).not.toBe(nonce2);
    });
  });

  describe('verifyAndConsume', () => {
    it('should verify and consume a valid nonce', async () => {
      const nonce = await NonceService.generateNonce('challenge');
      const result = await NonceService.verifyAndConsume(nonce, 'challenge');

      expect(result).toBe(true);
    });

    it('should reject already consumed nonce', async () => {
      const nonce = await NonceService.generateNonce('challenge');

      // First consumption should succeed
      const firstResult = await NonceService.verifyAndConsume(nonce, 'challenge');
      expect(firstResult).toBe(true);

      // Second consumption should fail (already used)
      const secondResult = await NonceService.verifyAndConsume(nonce, 'challenge');
      expect(secondResult).toBe(false);
    });

    it('should reject non-existent nonce', async () => {
      const result = await NonceService.verifyAndConsume('invalid_nonce_123', 'challenge');

      expect(result).toBe(false);
    });
  });

  describe('TTL', () => {
    it('should set TTL on nonce', async () => {
      const nonce = await NonceService.generateNonce('challenge');
      const ttl = await NonceService.getTTL(nonce, 'challenge');

      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(60);
    });
  });
});
