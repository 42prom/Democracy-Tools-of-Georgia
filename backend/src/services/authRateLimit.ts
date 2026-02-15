import redisClient from '../db/redis';
import { pool } from '../db/client';

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
  retryAfter?: number; // seconds until reset
  blockedBy?: string; // which limit was exceeded (ip, device, pn)
}

export interface RateLimitConfig {
  ip?: number;
  device?: number;
  pn?: number;
  account?: number;
  poll?: number;
  window: number; // in minutes
}

// Cache for settings to avoid DB hits on every request
let settingsCache: Record<string, RateLimitConfig> = {};
let lastCacheUpdate = 0;
const CACHE_TTL_MS = 30 * 1000; // 30 seconds for faster admin setting updates

/**
 * Load rate limit configuration from system_settings table
 * Falls back to defaults if not configured
 *
 * For biometric type, also checks verification_liveness_retry_limit setting
 * to allow admins to configure limits from Verification Providers page
 */
async function loadRateLimitConfig(type: 'enrollment' | 'login' | 'biometric' | 'vote'): Promise<RateLimitConfig> {
  const now = Date.now();
  const cacheKey = `rate_limit_${type}`;

  if (now - lastCacheUpdate < CACHE_TTL_MS && settingsCache[cacheKey]) {
    return settingsCache[cacheKey];
  }

  // Defaults matching admin UI
  const defaults: Record<string, RateLimitConfig> = {
    rate_limit_enrollment: { ip: 100, device: 50, pn: 30, window: 60 },
    rate_limit_login: { ip: 200, device: 100, pn: 50, window: 15 },
    rate_limit_biometric: { ip: 100, account: 5, window: 60 },
    rate_limit_vote: { account: 3, poll: 1, window: 1 },
  };

  let config: RateLimitConfig | null = null;

  try {
    // Try system_settings first (where admin UI saves rate limits)
    const result = await pool.query(
      `SELECT value FROM system_settings WHERE key = $1`,
      [cacheKey]
    );

    if (result.rows.length > 0 && result.rows[0].value) {
      const value = result.rows[0].value;
      // Handle both JSON object and string
      config = typeof value === 'string' ? JSON.parse(value) : value;
    }

    // Fallback to settings table
    if (!config) {
      const settingsResult = await pool.query(
        `SELECT value FROM settings WHERE key = $1`,
        [cacheKey]
      );

      if (settingsResult.rows.length > 0 && settingsResult.rows[0].value) {
        const value = settingsResult.rows[0].value;
        config = typeof value === 'string' ? JSON.parse(value) : value;
      }
    }

    // For biometric, check liveness.retryLimit from Verification Providers settings
    // This allows admins to set retry limit from the Verification Providers page
    if (type === 'biometric') {
      const livenessResult = await pool.query(
        `SELECT value FROM settings WHERE key = 'verification_liveness_retry_limit'`
      );
      if (livenessResult.rows.length > 0 && livenessResult.rows[0].value) {
        const retryLimit = parseInt(livenessResult.rows[0].value, 10);
        if (retryLimit > 0) {
          // Use the liveness retry limit as the account limit for biometric
          config = config || { ...defaults[cacheKey] };
          config.account = retryLimit;
          console.log(`[AuthRateLimiter] Using liveness.retryLimit (${retryLimit}) for biometric account limit`);
        }
      }
    }

    if (config) {
      settingsCache[cacheKey] = config;
      lastCacheUpdate = now;
      return config;
    }
  } catch (error) {
    console.error(`[AuthRateLimiter] Failed to load config for ${type}:`, error);
  }

  // Use defaults
  lastCacheUpdate = now;
  settingsCache[cacheKey] = defaults[cacheKey];
  return defaults[cacheKey];
}

/**
 * Clear the settings cache to force reload from database
 * Call this when admin updates rate limit settings
 */
export function clearRateLimitCache(): void {
  settingsCache = {};
  lastCacheUpdate = 0;
  console.log('[AuthRateLimiter] Settings cache cleared');
}

/**
 * Authentication Rate Limiter
 *
 * Best practices implemented:
 * - Only counts FAILED attempts (not all requests)
 * - Resets counters on successful authentication
 * - Uses sliding window for accurate limiting
 * - Loads limits dynamically from admin settings
 */
export class AuthRateLimiter {
  /**
   * Check if request should be allowed based on rate limits
   * This is called BEFORE processing - it checks current state without incrementing
   */
  static async checkRateLimit(
    type: 'enrollment' | 'login' | 'biometric' | 'vote',
    identifiers: {
      ip?: string;
      deviceId?: string;
      pnHash?: string;
      userId?: string;
      pollId?: string;
    }
  ): Promise<RateLimitResult> {
    const config = await loadRateLimitConfig(type);
    const windowMs = config.window * 60 * 1000;
    const windowStart = Date.now() - windowMs;
    const resetAt = new Date(Date.now() + windowMs);

    const checks = [
      { key: `rl:${type}:ip:${identifiers.ip}`, limit: config.ip, name: 'ip' },
      { key: `rl:${type}:device:${identifiers.deviceId}`, limit: config.device, name: 'device' },
      { key: `rl:${type}:pn:${identifiers.pnHash}`, limit: config.pn, name: 'pn' },
      { key: `rl:${type}:user:${identifiers.userId}`, limit: config.account, name: 'account' },
    ];

    // For voting, add poll-specific limit
    if (type === 'vote' && identifiers.pollId && identifiers.userId) {
      checks.push({
        key: `rl:vote:poll:${identifiers.pollId}:user:${identifiers.userId}`,
        limit: config.poll,
        name: 'poll'
      });
    }

    try {
      for (const check of checks) {
        // Skip if identifier not provided or limit not configured
        if (!check.key.includes('undefined') && check.limit !== undefined && check.limit > 0) {
          // Clean old entries
          await redisClient.zRemRangeByScore(check.key, 0, windowStart);

          // Count current failures
          const count = await redisClient.zCard(check.key);

          if (count >= check.limit) {
            // Get oldest entry to calculate actual reset time
            const oldest = await redisClient.zRange(check.key, 0, 0, { BY: 'SCORE' });
            let actualResetAt = resetAt;
            if (oldest.length > 0) {
              const oldestScore = await redisClient.zScore(check.key, oldest[0]);
              if (oldestScore) {
                actualResetAt = new Date(oldestScore + windowMs);
              }
            }

            const retryAfter = Math.ceil((actualResetAt.getTime() - Date.now()) / 1000);

            console.warn(`[AuthRateLimiter] BLOCKED ${type} - ${check.name}: ${count}/${check.limit} failures (IP: ${identifiers.ip})`);

            return {
              allowed: false,
              remaining: 0,
              resetAt: actualResetAt,
              retryAfter: retryAfter > 0 ? retryAfter : undefined,
              blockedBy: check.name,
            };
          }
        }
      }

      // Calculate minimum remaining across all limits
      let minRemaining = Infinity;
      for (const check of checks) {
        if (!check.key.includes('undefined') && check.limit !== undefined && check.limit > 0) {
          const count = await redisClient.zCard(check.key);
          minRemaining = Math.min(minRemaining, check.limit - count);
        }
      }

      return {
        allowed: true,
        remaining: minRemaining === Infinity ? 100 : minRemaining,
        resetAt,
      };
    } catch (error) {
      console.error('[AuthRateLimiter] Redis error:', error);
      // Fail open: allow request if Redis is unavailable
      return {
        allowed: true,
        remaining: 100,
        resetAt,
      };
    }
  }

  /**
   * Record a FAILED attempt
   * Only call this when authentication/verification FAILS
   */
  static async recordFailure(
    type: 'enrollment' | 'login' | 'biometric' | 'vote',
    identifiers: {
      ip?: string;
      deviceId?: string;
      pnHash?: string;
      userId?: string;
      pollId?: string;
    },
    reason?: string
  ): Promise<void> {
    const config = await loadRateLimitConfig(type);
    const windowSeconds = config.window * 60;
    const now = Date.now();
    const uniqueId = `${now}-${Math.random().toString(36).substr(2, 9)}`;

    const keys = [
      { key: `rl:${type}:ip:${identifiers.ip}`, limit: config.ip },
      { key: `rl:${type}:device:${identifiers.deviceId}`, limit: config.device },
      { key: `rl:${type}:pn:${identifiers.pnHash}`, limit: config.pn },
      { key: `rl:${type}:user:${identifiers.userId}`, limit: config.account },
    ];

    if (type === 'vote' && identifiers.pollId && identifiers.userId) {
      keys.push({
        key: `rl:vote:poll:${identifiers.pollId}:user:${identifiers.userId}`,
        limit: config.poll,
      });
    }

    console.log(`[AuthRateLimiter] Recording ${type} failure for IP: ${identifiers.ip}${reason ? ` (${reason})` : ''}`);

    try {
      for (const item of keys) {
        if (!item.key.includes('undefined') && item.limit !== undefined && item.limit > 0) {
          // Add failure timestamp
          await redisClient.zAdd(item.key, { score: now, value: uniqueId + item.key });
          // Set TTL
          await redisClient.expire(item.key, windowSeconds);
        }
      }
    } catch (error) {
      console.error('[AuthRateLimiter] Failed to record failure:', error);
    }
  }

  /**
   * Reset rate limits on successful authentication
   * Call this when user successfully enrolls or logs in
   */
  static async resetOnSuccess(
    type: 'enrollment' | 'login' | 'biometric' | 'vote',
    identifiers: {
      ip?: string;
      deviceId?: string;
      pnHash?: string;
      userId?: string;
      pollId?: string;
    }
  ): Promise<void> {
    const keysToDelete = [
      `rl:${type}:ip:${identifiers.ip}`,
      `rl:${type}:device:${identifiers.deviceId}`,
      `rl:${type}:pn:${identifiers.pnHash}`,
      `rl:${type}:user:${identifiers.userId}`,
    ];

    // Also reset biometric limits on successful login/enrollment
    if (type === 'enrollment' || type === 'login') {
      keysToDelete.push(
        `rl:biometric:ip:${identifiers.ip}`,
        `rl:biometric:pn:${identifiers.pnHash}`,
        `rl:biometric:user:${identifiers.userId}`
      );
    }

    if (type === 'vote' && identifiers.pollId && identifiers.userId) {
      keysToDelete.push(`rl:vote:poll:${identifiers.pollId}:user:${identifiers.userId}`);
    }

    console.log(`[AuthRateLimiter] Resetting ${type} rate limits on success for IP: ${identifiers.ip}`);

    try {
      for (const key of keysToDelete) {
        if (!key.includes('undefined')) {
          await redisClient.del(key);
        }
      }
    } catch (error) {
      console.error('[AuthRateLimiter] Failed to reset rate limits:', error);
    }
  }

  /**
   * Get current failure count for diagnostics
   */
  static async getFailureCount(
    type: 'enrollment' | 'login' | 'biometric' | 'vote',
    identifier: { type: 'ip' | 'device' | 'pn' | 'user'; value: string }
  ): Promise<number> {
    const config = await loadRateLimitConfig(type);
    const windowMs = config.window * 60 * 1000;
    const windowStart = Date.now() - windowMs;
    const key = `rl:${type}:${identifier.type}:${identifier.value}`;

    try {
      await redisClient.zRemRangeByScore(key, 0, windowStart);
      return await redisClient.zCard(key);
    } catch (error) {
      console.error('[AuthRateLimiter] Failed to get failure count:', error);
      return 0;
    }
  }

  /**
   * Admin: Clear all rate limits for an IP (for support/testing)
   */
  static async adminClearIP(ip: string): Promise<void> {
    const patterns = [
      `rl:enrollment:ip:${ip}`,
      `rl:login:ip:${ip}`,
      `rl:biometric:ip:${ip}`,
      `rl:vote:ip:${ip}`,
    ];

    try {
      for (const key of patterns) {
        await redisClient.del(key);
      }
      console.log(`[AuthRateLimiter] Admin cleared all rate limits for IP: ${ip}`);
    } catch (error) {
      console.error('[AuthRateLimiter] Admin clear failed:', error);
    }
  }
}
