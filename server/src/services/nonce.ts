import crypto from 'crypto';
import { redisClient } from '../db/redis.js';
import { CONFIG } from '../config.js';

const NONCE_PREFIX = 'nonce:';

export class NonceService {
  /**
   * Generate a cryptographically secure nonce with TTL
   */
  static async generate(type: 'challenge' | 'vote' = 'challenge'): Promise<string> {
    const nonce = crypto.randomBytes(32).toString('hex');
    const key = `${NONCE_PREFIX}${type}:${nonce}`;

    await redisClient.setEx(key, CONFIG.nonce.ttl, '1');

    return nonce;
  }

  /**
   * Verify and consume nonce atomically (single-use)
   */
  static async verifyAndConsume(nonce: string, type: 'challenge' | 'vote' = 'challenge'): Promise<boolean> {
    const key = `${NONCE_PREFIX}${type}:${nonce}`;

    // Lua script for atomic get-and-delete
    const luaScript = `
      if redis.call("EXISTS", KEYS[1]) == 1 then
        redis.call("DEL", KEYS[1])
        return 1
      else
        return 0
      end
    `;

    try {
      const result = await redisClient.eval(luaScript, { keys: [key] }) as number;
      return result === 1;
    } catch {
      return false;
    }
  }
}
