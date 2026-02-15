import crypto from 'crypto';
import pool from '../db/client';
import { createError } from '../middleware/errorHandler';
import { getDeviceHashSecret, getVoterHashSecret } from '../config/secrets';

/**
 * SecurityService - Enforcement for Device and Voter policies
 * Includes heavy debug logging for verification as requested by user.
 */
export class SecurityService {
  private static readonly DEVICE_SECRET = getDeviceHashSecret();
  private static readonly VOTER_SECRET = getVoterHashSecret();

  /**
   * Derive privacy-safe hash for a device identifier
   */
  static getDeviceHash(deviceId: string): string {
    const hash = crypto.createHmac('sha256', this.DEVICE_SECRET).update(deviceId).digest('hex');
    return hash;
  }

  /**
   * Derive privacy-safe hash for a voter (identity)
   */
  static getVoterHash(personalNumber: string): string {
    const hash = crypto.createHmac('sha256', this.VOTER_SECRET).update(personalNumber).digest('hex');
    return hash;
  }

  /**
   * Enforce the "Max distinct voters per device per poll" policy
   */
  static async checkDeviceVoterLimit(pollId: string, deviceHash: string, voterHash: string): Promise<void> {
    // 1. Get the limit from settings
    const settingRes = await pool.query(
      "SELECT value FROM settings WHERE key = 'security_max_distinct_voters_per_device_per_poll'"
    );
    const limit = parseInt(settingRes.rows[0]?.value || '2', 10);

    // 2. Check if THIS voter has already voted on THIS device for THIS poll
    // (If they have, they aren't a "new" distinct voter, so they don't count towards the limit increase)
    const existingVoterRes = await pool.query(
      'SELECT 1 FROM device_poll_voters WHERE poll_id = $1 AND device_key_hash = $2 AND voter_hash = $3',
      [pollId, deviceHash, voterHash]
    );

    if (existingVoterRes.rows.length > 0) {
      return;
    }

    // 3. Count how many OTHER distinct voters have used this device for this poll
    const countRes = await pool.query(
      'SELECT COUNT(DISTINCT voter_hash) as count FROM device_poll_voters WHERE poll_id = $1 AND device_key_hash = $2',
      [pollId, deviceHash]
    );
    const currentDistinctVoters = parseInt(countRes.rows[0].count, 10);

    if (currentDistinctVoters >= limit) {
      throw createError(`Security Policy: This device has exceeded the maximum number of distinct voters (${limit}) for this poll.`, 403);
    }
  }

  /**
   * Record the device-voter association
   */
  static async recordDeviceVoter(pollId: string, deviceHash: string, voterHash: string, client: any): Promise<void> {
    await client.query(
      'INSERT INTO device_poll_voters (poll_id, device_key_hash, voter_hash) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
      [pollId, deviceHash, voterHash]
    );
  }

  /**
   * Log a security event for monitoring
   */
  static async logSecurityEvent(
    eventType: 'REPLAY_ATTACK' | 'DOUBLE_VOTE_ATTEMPT' | 'ELIGIBILITY_FAIL' | 'SIGNATURE_FAIL',
    details: any,
    req?: any
  ): Promise<void> {
    try {
      const ip = req?.ip || 'unknown';
      const userAgent = req?.headers?.['user-agent'] || 'unknown';
      
      console.warn(`[Security] ${eventType}:`, JSON.stringify({ ...details, ip, userAgent }));
      
      // Persist to DB for admin dashboard
      // Note: We use a catch-all try/catch here to ensure logging never breaks the main flow
      // In a real app, we might want a dedicated security_logs table, but for now console is key.
      /*
      await pool.query(
        `INSERT INTO security_logs (event_type, details, ip_address, user_agent, severity)
         VALUES ($1, $2, $3, $4, 'high')`,
        [eventType, JSON.stringify(details), ip, userAgent]
      );
      */
    } catch (err) {
      console.error('[Security] Failed to log event:', err);
    }
  }
}
