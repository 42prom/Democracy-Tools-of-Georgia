import redisClient from '../db/redis';

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
  retryAfter?: number; // seconds until reset
}

/**
 * IP-based rate limiting service using Redis sliding window
 * Controls how many biometric verification attempts are allowed per IP
 */
export class IPRateLimiter {
  /**
   * Check if an IP address has exceeded the rate limit
   * @param ip - IP address to check
   * @param maxAttempts - Maximum attempts allowed (from admin settings)
   * @param windowMinutes - Time window in minutes (from admin settings)
   * @returns Rate limit result with allowed status and metadata
   */
  static async checkRateLimit(
    ip: string,
    maxAttempts: number,
    windowMinutes: number
  ): Promise<RateLimitResult> {
    const key = `biometric_ip_limit:${ip}`;
    const now = Date.now();
    const windowMs = windowMinutes * 60 * 1000;
    const windowStart = now - windowMs;

    try {
      // Remove old entries outside the time window
      await redisClient.zRemRangeByScore(key, 0, windowStart);

      // Count attempts within the current window
      const count = await redisClient.zCard(key);

      // Calculate when the window resets (oldest entry + window duration)
      let resetAt = new Date(now + windowMs);
      if (count > 0) {
        const oldestEntry = await redisClient.zRange(key, 0, 0, { BY: 'SCORE' });
        if (oldestEntry.length > 0) {
          const oldestScore = await redisClient.zScore(key, oldestEntry[0]);
          if (oldestScore) {
            resetAt = new Date(oldestScore + windowMs);
          }
        }
      }

      const retryAfter = Math.ceil((resetAt.getTime() - now) / 1000);
      const remaining = Math.max(0, maxAttempts - count);

      if (count >= maxAttempts) {
        // Rate limit exceeded
        return {
          allowed: false,
          remaining: 0,
          resetAt,
          retryAfter: retryAfter > 0 ? retryAfter : undefined,
        };
      }

      // Within limit
      return {
        allowed: true,
        remaining,
        resetAt,
      };
    } catch (error) {
      console.error('[IPRateLimiter] Redis error:', error);
      // Fail open: allow request if Redis is unavailable
      return {
        allowed: true,
        remaining: maxAttempts,
        resetAt: new Date(now + windowMs),
      };
    }
  }

  /**
   * Record a biometric verification attempt for an IP address
   * @param ip - IP address
   * @param windowMinutes - Time window in minutes (for TTL)
   */
  static async recordAttempt(ip: string, windowMinutes: number): Promise<void> {
    const key = `biometric_ip_limit:${ip}`;
    const now = Date.now();
    const ttl = windowMinutes * 60; // Convert to seconds for Redis

    try {
      // Add current timestamp to sorted set (score = timestamp)
      const uniqueId = `${now}-${Math.random().toString(36).substr(2, 9)}`;
      await redisClient.zAdd(key, { score: now, value: uniqueId });

      // Set expiration on the key (cleanup old data)
      await redisClient.expire(key, ttl);
    } catch (error) {
      console.error('[IPRateLimiter] Failed to record attempt:', error);
      // Don't throw - recording failure shouldn't block the request
    }
  }

  /**
   * Clear rate limit for an IP address (admin override or successful verification)
   * @param ip - IP address to clear
   */
  static async clearRateLimit(ip: string): Promise<void> {
    const key = `biometric_ip_limit:${ip}`;
    try {
      await redisClient.del(key);
    } catch (error) {
      console.error('[IPRateLimiter] Failed to clear rate limit:', error);
    }
  }

  /**
   * Get current attempt count for an IP
   * @param ip - IP address
   * @param windowMinutes - Time window in minutes
   * @returns Current attempt count within the window
   */
  static async getAttemptCount(ip: string, windowMinutes: number): Promise<number> {
    const key = `biometric_ip_limit:${ip}`;
    const now = Date.now();
    const windowMs = windowMinutes * 60 * 1000;
    const windowStart = now - windowMs;

    try {
      // Remove old entries
      await redisClient.zRemRangeByScore(key, 0, windowStart);
      // Return current count
      return await redisClient.zCard(key);
    } catch (error) {
      console.error('[IPRateLimiter] Failed to get attempt count:', error);
      return 0;
    }
  }
}
