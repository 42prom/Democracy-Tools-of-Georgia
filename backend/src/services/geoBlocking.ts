// =============================================================================
// FLAGSHIP GEO-BLOCKING SERVICE
// Advanced country and IP blocking with caching
// =============================================================================

import { pool } from '../db/client';
import redisClient from '../db/redis';

const CACHE_PREFIX = 'geo:';
const CACHE_TTL = 300; // 5 minutes

interface GeoInfo {
  ip: string;
  country_code: string;
  country_name: string;
  city?: string;
  region?: string;
}

interface BlockCheckResult {
  blocked: boolean;
  reason?: string;
  country_code?: string;
  country_name?: string;
}

export class GeoBlockingService {

  // =========================================================================
  // SETTINGS
  // =========================================================================

  static async getSettings(): Promise<Record<string, string>> {
    const cacheKey = `${CACHE_PREFIX}settings`;

    try {
      const cached = await redisClient.get(cacheKey);
      if (cached) return JSON.parse(cached);
    } catch (e) {
      // Redis not available, continue without cache
    }

    const result = await pool.query('SELECT key, value FROM geo_blocking_settings');
    const settings: Record<string, string> = {};
    result.rows.forEach(row => { settings[row.key] = row.value; });

    try {
      await redisClient.setEx(cacheKey, CACHE_TTL, JSON.stringify(settings));
    } catch (e) {
      // Redis not available
    }

    return settings;
  }

  static async updateSetting(key: string, value: string): Promise<void> {
    await pool.query(
      `INSERT INTO geo_blocking_settings (key, value, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
      [key, value]
    );

    try {
      await redisClient.del(`${CACHE_PREFIX}settings`);
    } catch (e) {
      // Redis not available
    }
  }

  // =========================================================================
  // GEO LOOKUP
  // =========================================================================

  static async lookupIP(ip: string): Promise<GeoInfo | null> {
    const cacheKey = `${CACHE_PREFIX}ip:${ip}`;

    try {
      const cached = await redisClient.get(cacheKey);
      if (cached) return JSON.parse(cached);
    } catch (e) {
      // Redis not available
    }

    const settings = await this.getSettings();
    const provider = settings.geo_provider || 'ip-api';

    let geoInfo: GeoInfo | null = null;

    try {
      if (provider === 'ip-api') {
        const response = await fetch(`http://ip-api.com/json/${ip}?fields=status,country,countryCode,city,regionName`);
        const data: any = await response.json();

        if (data.status === 'success') {
          geoInfo = {
            ip,
            country_code: data.countryCode,
            country_name: data.country,
            city: data.city,
            region: data.regionName
          };
        }
      } else if (provider === 'ipinfo') {
        const apiKey = settings.geo_api_key;
        const url = apiKey
          ? `https://ipinfo.io/${ip}?token=${apiKey}`
          : `https://ipinfo.io/${ip}/json`;

        const response = await fetch(url);
        const data: any = await response.json();

        if (data.country) {
          geoInfo = {
            ip,
            country_code: data.country,
            country_name: data.country,
            city: data.city,
            region: data.region
          };
        }
      }

      if (geoInfo) {
        try {
          await redisClient.setEx(cacheKey, CACHE_TTL * 12, JSON.stringify(geoInfo));
        } catch (e) {
          // Redis not available
        }
      }

      return geoInfo;
    } catch (err) {
      console.error('[GeoBlocking] Lookup failed:', err);
      return null;
    }
  }

  // =========================================================================
  // BLOCK CHECKING
  // =========================================================================

  static async checkIP(ip: string, endpoint?: string, userAgent?: string): Promise<BlockCheckResult> {
    const settings = await this.getSettings();

    // Check if geo-blocking is enabled
    if (settings.geo_blocking_enabled !== 'true') {
      return { blocked: false };
    }

    // Check whitelist first (always allow)
    const whitelisted = await this.isWhitelisted(ip);
    if (whitelisted) {
      return { blocked: false };
    }

    // Check specific IP blocks
    const ipBlocked = await this.isIPBlocked(ip);
    if (ipBlocked.blocked) {
      await this.logBlockedAttempt(ip, null, null, 'ip', endpoint, userAgent);
      return ipBlocked;
    }

    // Get geo info
    const geoInfo = await this.lookupIP(ip);
    if (!geoInfo) {
      return { blocked: false };
    }

    // Check country block
    const countryBlocked = await this.isCountryBlocked(geoInfo.country_code);
    if (countryBlocked) {
      await this.logBlockedAttempt(ip, geoInfo.country_code, geoInfo.country_name, 'country', endpoint, userAgent);
      return {
        blocked: true,
        reason: `Access blocked from ${geoInfo.country_name}`,
        country_code: geoInfo.country_code,
        country_name: geoInfo.country_name
      };
    }

    return { blocked: false, country_code: geoInfo.country_code, country_name: geoInfo.country_name };
  }

  static async isCountryBlocked(countryCode: string): Promise<boolean> {
    const cacheKey = `${CACHE_PREFIX}blocked_countries`;

    let blockedCodes: string[];

    try {
      const cached = await redisClient.get(cacheKey);
      if (cached) {
        blockedCodes = JSON.parse(cached);
        return blockedCodes.includes(countryCode.toUpperCase());
      }
    } catch (e) {
      // Redis not available
    }

    const result = await pool.query(
      'SELECT country_code FROM blocked_countries WHERE is_active = TRUE'
    );
    blockedCodes = result.rows.map(r => r.country_code);

    try {
      await redisClient.setEx(cacheKey, CACHE_TTL, JSON.stringify(blockedCodes));
    } catch (e) {
      // Redis not available
    }

    return blockedCodes.includes(countryCode.toUpperCase());
  }

  static async isIPBlocked(ip: string): Promise<BlockCheckResult> {
    try {
      const result = await pool.query(
        `SELECT block_reason, expires_at FROM blocked_ips
         WHERE is_active = TRUE
         AND ip_address = $1::inet
         AND (expires_at IS NULL OR expires_at > NOW())
         LIMIT 1`,
        [ip]
      );

      if (result.rows.length > 0) {
        return { blocked: true, reason: result.rows[0].block_reason || 'IP address blocked' };
      }
    } catch (err) {
      console.error('[GeoBlocking] IP check error:', err);
    }

    return { blocked: false };
  }

  static async isWhitelisted(ip: string): Promise<boolean> {
    try {
      const result = await pool.query(
        `SELECT 1 FROM whitelisted_ips
         WHERE is_active = TRUE
         AND ip_address = $1::inet
         LIMIT 1`,
        [ip]
      );

      return result.rows.length > 0;
    } catch (err) {
      console.error('[GeoBlocking] Whitelist check error:', err);
      return false;
    }
  }

  // =========================================================================
  // COUNTRY MANAGEMENT
  // =========================================================================

  static async getBlockedCountries(): Promise<any[]> {
    const result = await pool.query(
      `SELECT bc.*, au.email as blocked_by_email
       FROM blocked_countries bc
       LEFT JOIN admin_users au ON bc.blocked_by = au.id
       ORDER BY bc.country_name`
    );
    return result.rows;
  }

  static async blockCountry(
    countryCode: string,
    countryName: string,
    reason: string,
    blockedBy: string
  ): Promise<void> {
    await pool.query(
      `INSERT INTO blocked_countries (country_code, country_name, block_reason, blocked_by)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (country_code) DO UPDATE SET
         is_active = TRUE,
         block_reason = $3,
         blocked_at = NOW(),
         blocked_by = $4`,
      [countryCode.toUpperCase(), countryName, reason, blockedBy]
    );

    try {
      await redisClient.del(`${CACHE_PREFIX}blocked_countries`);
    } catch (e) {
      // Redis not available
    }
  }

  static async unblockCountry(countryCode: string): Promise<void> {
    await pool.query(
      'UPDATE blocked_countries SET is_active = FALSE WHERE country_code = $1',
      [countryCode.toUpperCase()]
    );

    try {
      await redisClient.del(`${CACHE_PREFIX}blocked_countries`);
    } catch (e) {
      // Redis not available
    }
  }

  static async deleteCountry(countryCode: string): Promise<void> {
    await pool.query(
      'DELETE FROM blocked_countries WHERE country_code = $1',
      [countryCode.toUpperCase()]
    );

    try {
      await redisClient.del(`${CACHE_PREFIX}blocked_countries`);
    } catch (e) {
      // Redis not available
    }
  }

  // =========================================================================
  // IP MANAGEMENT
  // =========================================================================

  static async getBlockedIPs(): Promise<any[]> {
    const result = await pool.query(
      `SELECT bi.*, au.email as blocked_by_email
       FROM blocked_ips bi
       LEFT JOIN admin_users au ON bi.blocked_by = au.id
       WHERE bi.is_active = TRUE
       ORDER BY bi.blocked_at DESC`
    );
    return result.rows;
  }

  static async blockIP(
    ip: string,
    reason: string,
    blockedBy: string,
    expiresAt?: Date
  ): Promise<void> {
    await pool.query(
      `INSERT INTO blocked_ips (ip_address, block_reason, blocked_by, expires_at)
       VALUES ($1::inet, $2, $3, $4)
       ON CONFLICT (ip_address) DO UPDATE SET
         is_active = TRUE,
         block_reason = $2,
         blocked_at = NOW(),
         blocked_by = $3,
         expires_at = $4`,
      [ip, reason, blockedBy, expiresAt]
    );
  }

  static async unblockIP(ip: string): Promise<void> {
    await pool.query(
      'UPDATE blocked_ips SET is_active = FALSE WHERE ip_address = $1::inet',
      [ip]
    );
  }

  static async getWhitelistedIPs(): Promise<any[]> {
    const result = await pool.query(
      `SELECT wi.*, au.email as created_by_email
       FROM whitelisted_ips wi
       LEFT JOIN admin_users au ON wi.created_by = au.id
       WHERE wi.is_active = TRUE
       ORDER BY wi.created_at DESC`
    );
    return result.rows;
  }

  static async whitelistIP(ip: string, description: string, createdBy: string): Promise<void> {
    await pool.query(
      `INSERT INTO whitelisted_ips (ip_address, description, created_by)
       VALUES ($1::inet, $2, $3)
       ON CONFLICT (ip_address) DO UPDATE SET
         is_active = TRUE,
         description = $2,
         created_at = NOW(),
         created_by = $3`,
      [ip, description, createdBy]
    );
  }

  static async removeWhitelistIP(ip: string): Promise<void> {
    await pool.query(
      'UPDATE whitelisted_ips SET is_active = FALSE WHERE ip_address = $1::inet',
      [ip]
    );
  }

  // =========================================================================
  // LOGGING
  // =========================================================================

  static async logBlockedAttempt(
    ip: string,
    countryCode: string | null,
    countryName: string | null,
    blockType: string,
    endpoint?: string,
    userAgent?: string
  ): Promise<void> {
    const settings = await this.getSettings();
    if (settings.log_blocked_attempts !== 'true') return;

    try {
      await pool.query(
        `INSERT INTO blocked_access_log (ip_address, country_code, country_name, block_type, endpoint, user_agent)
         VALUES ($1::inet, $2, $3, $4, $5, $6)`,
        [ip, countryCode, countryName, blockType, endpoint, userAgent]
      );
    } catch (err) {
      console.error('[GeoBlocking] Failed to log blocked attempt:', err);
    }
  }

  static async getBlockedAccessLog(limit: number = 100, offset: number = 0): Promise<any[]> {
    const result = await pool.query(
      `SELECT * FROM blocked_access_log
       ORDER BY attempted_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    return result.rows;
  }

  static async getBlockedStats(): Promise<any> {
    const result = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM blocked_access_log WHERE attempted_at > NOW() - INTERVAL '24 hours') as total_blocked,
        (SELECT COUNT(DISTINCT ip_address) FROM blocked_access_log WHERE attempted_at > NOW() - INTERVAL '24 hours') as unique_ips,
        (SELECT COUNT(DISTINCT country_code) FROM blocked_access_log WHERE attempted_at > NOW() - INTERVAL '24 hours') as unique_countries,
        (SELECT COUNT(*) FROM blocked_countries WHERE is_active = TRUE) as blocked_countries_count,
        (SELECT COUNT(*) FROM blocked_ips WHERE is_active = TRUE) as blocked_ips_count,
        (SELECT COUNT(*) FROM whitelisted_ips WHERE is_active = TRUE) as whitelisted_ips_count
    `);
    return result.rows[0];
  }

  // =========================================================================
  // CLEAR CACHE
  // =========================================================================

  static async clearCache(): Promise<void> {
    try {
      await redisClient.del(`${CACHE_PREFIX}settings`);
      await redisClient.del(`${CACHE_PREFIX}blocked_countries`);
    } catch (e) {
      // Redis not available
    }
  }
}
