import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { pool } from '../db/client';
import { getJwtSecret } from '../config/jwt';
import { getPnHashSecret } from '../config/secrets';

const PN_HASH_SECRET = getPnHashSecret();
const MAX_ATTEMPTS = 5;
const LOCKOUT_DURATION_MINUTES = 15;

/**
 * Compute HMAC hash of personal number
 * Format: HMAC(secret, "GE:" + pnDigits)
 */
export function computePnHash(pnDigits: string): string {
  const input = `GE:${pnDigits}`;
  return crypto
    .createHmac('sha256', PN_HASH_SECRET)
    .update(input)
    .digest('hex');
}

/**
 * Validate personal number format (digits only, 11 characters for Georgia)
 */
export function validatePersonalNumber(pnDigits: string): { valid: boolean; error?: string } {
  if (!pnDigits || typeof pnDigits !== 'string') {
    return { valid: false, error: 'Personal number is required' };
  }

  if (!/^\d+$/.test(pnDigits)) {
    return { valid: false, error: 'Personal number must contain only digits' };
  }

  if (pnDigits.length !== 11) {
    return { valid: false, error: 'Personal number must be exactly 11 digits for Georgia' };
  }

  return { valid: true };
}

/**
 * Check rate limits and lockout status
 */
export async function checkRateLimit(
  pnHash: string,
  ipAddress: string
): Promise<{ allowed: boolean; reason?: string }> {
  const result = await pool.query(
    `SELECT attempt_count, locked_until FROM auth_rate_limits
     WHERE pn_hash = $1 AND ip_address = $2`,
    [pnHash, ipAddress]
  );

  if (result.rows.length === 0) {
    return { allowed: true };
  }

  const { attempt_count, locked_until } = result.rows[0];

  // Check if locked
  if (locked_until && new Date(locked_until) > new Date()) {
    return {
      allowed: false,
      reason: `Account locked until ${new Date(locked_until).toISOString()}`,
    };
  }

  // Check attempt count
  if (attempt_count >= MAX_ATTEMPTS) {
    return { allowed: false, reason: 'Too many attempts' };
  }

  return { allowed: true };
}

/**
 * Record failed attempt and update rate limits
 */
export async function recordFailedAttempt(pnHash: string, ipAddress: string): Promise<void> {
  const result = await pool.query(
    `INSERT INTO auth_rate_limits (pn_hash, ip_address, attempt_count, last_attempt_at)
     VALUES ($1, $2, 1, NOW())
     ON CONFLICT (pn_hash, ip_address)
     DO UPDATE SET
       attempt_count = auth_rate_limits.attempt_count + 1,
       last_attempt_at = NOW(),
       locked_until = CASE
         WHEN auth_rate_limits.attempt_count + 1 >= $3
         THEN NOW() + INTERVAL '${LOCKOUT_DURATION_MINUTES} minutes'
         ELSE auth_rate_limits.locked_until
       END
     RETURNING attempt_count, locked_until`,
    [pnHash, ipAddress, MAX_ATTEMPTS]
  );

  const { attempt_count, locked_until: _locked_until } = result.rows[0];

  // Log lockout event if threshold reached
  if (attempt_count >= MAX_ATTEMPTS) {
    await pool.query(
      `INSERT INTO security_events
       (pn_hash, event_type, result, reason_code, ip_address, created_at)
       VALUES ($1, 'LOCKOUT', 'BLOCKED', 'MAX_ATTEMPTS_EXCEEDED', $2, NOW())`,
      [pnHash, ipAddress]
    );
  }
}

/**
 * Clear rate limits on successful auth
 */
export async function clearRateLimit(pnHash: string, ipAddress: string): Promise<void> {
  await pool.query(
    `DELETE FROM auth_rate_limits WHERE pn_hash = $1 AND ip_address = $2`,
    [pnHash, ipAddress]
  );
}

/**
 * Verify session attestation JWT
 */
export function verifySessionAttestation(token: string): any {
  try {
    return jwt.verify(token, getJwtSecret());
  } catch (error) {
    throw new Error('Invalid or expired session attestation');
  }
}
