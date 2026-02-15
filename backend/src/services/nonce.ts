import crypto from 'crypto';
import redisClient from '../db/redis';
import { createError } from '../middleware/errorHandler';

const NONCE_TTL_SECONDS = 60; // 60 second TTL
const NONCE_PREFIX = 'nonce:';

export class NonceService {
  /**
   * Generate a new nonce and store it in Redis
   * @param type - Type of nonce (challenge, vote, etc.)
   * @returns Generated nonce string
   */
  static async generateNonce(type: 'challenge' | 'vote' = 'challenge'): Promise<string> {
    try {
      // Generate cryptographically secure random 32-byte hex string
      const nonce = crypto.randomBytes(32).toString('hex');
      const key = `${NONCE_PREFIX}${type}:${nonce}`;

      // Store in Redis with TTL
      await redisClient.setEx(key, NONCE_TTL_SECONDS, '1');

      return nonce;
    } catch (error: any) {
      console.error('[Nonce] Redis error during generation:', error.message);
      throw createError('Service temporarily unavailable. Please try again.', 503);
    }
  }

  /**
   * Verify and consume a nonce (atomic operation)
   * Returns true if nonce was valid and not previously used
   * Returns false if nonce doesn't exist, expired, or already consumed
   * @param nonce - Nonce to verify
   * @param type - Type of nonce
   * @returns boolean indicating if nonce was valid
   */
  static async verifyAndConsume(
    nonce: string,
    type: 'challenge' | 'vote' = 'challenge'
  ): Promise<boolean> {
    const key = `${NONCE_PREFIX}${type}:${nonce}`;

    // Use Lua script for atomic get-and-delete
    // This ensures the nonce can only be consumed once
    const luaScript = `
      if redis.call("EXISTS", KEYS[1]) == 1 then
        redis.call("DEL", KEYS[1])
        return 1
      else
        return 0
      end
    `;

    try {
      const result = await redisClient.eval(luaScript, {
        keys: [key],
      });

      return result === 1;
    } catch (error: any) {
      console.error('[Nonce] Redis error during verification:', error.message);
      throw createError('Service temporarily unavailable. Please try again.', 503);
    }
  }

  /**
   * Check if a nonce exists without consuming it (for debugging)
   * @param nonce - Nonce to check
   * @param type - Type of nonce
   * @returns boolean indicating if nonce exists
   */
  static async exists(
    nonce: string,
    type: 'challenge' | 'vote' = 'challenge'
  ): Promise<boolean> {
    const key = `${NONCE_PREFIX}${type}:${nonce}`;
    const exists = await redisClient.exists(key);
    return exists === 1;
  }

  /**
   * Get TTL for a nonce (for debugging)
   * @param nonce - Nonce to check
   * @param type - Type of nonce
   * @returns TTL in seconds, or -1 if nonce doesn't exist
   */
  static async getTTL(
    nonce: string,
    type: 'challenge' | 'vote' = 'challenge'
  ): Promise<number> {
    const key = `${NONCE_PREFIX}${type}:${nonce}`;
    return await redisClient.ttl(key);
  }
}

export default NonceService;
