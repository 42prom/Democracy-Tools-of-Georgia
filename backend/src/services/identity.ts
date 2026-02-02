import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { pool } from '../db/client';
import { getJwtSecret } from '../config/jwt';
import { issueCredentialForSubject } from './credentials';

const PN_HASH_SECRET = process.env.PN_HASH_SECRET || 'CHANGE_ME_IN_PRODUCTION';
const MAX_ATTEMPTS = 5;
const LOCKOUT_DURATION_MINUTES = 15;
const SESSION_EXPIRY_MINUTES = 2;

interface BiometricCheck {
  passed: boolean;
  score: number;
}

interface LoginOrEnrollRequest {
  pnDigits: string;
  liveness: BiometricCheck;
  faceMatch: BiometricCheck;
  gender?: 'M' | 'F' | 'UNKNOWN';
  birthYear?: number;
  regionCodes?: string[];
  ipAddress?: string;
  userAgent?: string;
}

interface LoginOrEnrollResponse {
  isNew: boolean;
  userId: string;
  credential: {
    gender?: string;
    birthYear?: number;
    regionCodes?: string[];
  };
  sessionAttestation: string;
  credentialToken: string;
}

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
 * Generate session attestation JWT
 * Phase 0/1: Should be compatible with VotingCredential for access control
 */
export function generateSessionAttestation(userId: string, credential: any): string {
  const payload = {
    iss: 'dtfg-identity-service',
    sub: userId, // Use userId as subject for session tokens
    data: {
      age_bucket: credential.birthYear ? calculateAgeBucket(credential.birthYear) : '25-34', // Mock/default
      gender: credential.gender || 'O',
      region_codes: credential.regionCodes || [],
      citizenship: 'GEO',
    },
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + SESSION_EXPIRY_MINUTES * 60,
  };

  return jwt.sign(payload, getJwtSecret(), { algorithm: 'HS256' });
}

/**
 * Helper to calculate age bucket from birth year
 */
function calculateAgeBucket(birthYear: number): any {
  const age = new Date().getFullYear() - birthYear;
  if (age < 25) return '18-24';
  if (age < 35) return '25-34';
  if (age < 45) return '35-44';
  if (age < 55) return '45-54';
  if (age < 65) return '55-64';
  return '65+';
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

/**
 * Main login or enroll flow
 */
export async function loginOrEnroll(
  request: LoginOrEnrollRequest
): Promise<LoginOrEnrollResponse> {
  const { pnDigits, liveness, faceMatch, gender, birthYear, regionCodes, ipAddress, userAgent } =
    request;

  // 1. Validate personal number format
  const validation = validatePersonalNumber(pnDigits);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  // 2. Compute hash
  const pnHash = computePnHash(pnDigits);

  // 3. Check rate limits
  const rateLimitCheck = await checkRateLimit(pnHash, ipAddress || '0.0.0.0');
  if (!rateLimitCheck.allowed) {
    await pool.query(
      `INSERT INTO security_events
       (pn_hash, event_type, result, reason_code, ip_address, user_agent, created_at)
       VALUES ($1, 'LOGIN', 'BLOCKED', 'RATE_LIMIT', $2, $3, NOW())`,
      [pnHash, ipAddress, userAgent]
    );
    throw new Error(rateLimitCheck.reason || 'Rate limit exceeded');
  }

  // 4. Validate biometric checks
  if (!liveness.passed) {
    await recordFailedAttempt(pnHash, ipAddress || '0.0.0.0');
    await pool.query(
      `INSERT INTO security_events
       (pn_hash, event_type, result, liveness_score, face_match_score, reason_code, ip_address, user_agent)
       VALUES ($1, 'LOGIN', 'FAIL', $2, $3, 'LIVENESS_FAILED', $4, $5)`,
      [pnHash, liveness.score, faceMatch.score, ipAddress, userAgent]
    );
    throw new Error('Liveness check failed');
  }

  if (!faceMatch.passed) {
    await recordFailedAttempt(pnHash, ipAddress || '0.0.0.0');
    await pool.query(
      `INSERT INTO security_events
       (pn_hash, event_type, result, liveness_score, face_match_score, reason_code, ip_address, user_agent)
       VALUES ($1, 'LOGIN', 'FAIL', $2, $3, 'FACE_MATCH_FAILED', $4, $5)`,
      [pnHash, liveness.score, faceMatch.score, ipAddress, userAgent]
    );
    throw new Error('Face match check failed');
  }

  // 5. Find or create user
  const userResult = await pool.query(`SELECT * FROM users WHERE pn_hash = $1`, [pnHash]);

  let userId: string;
  let isNew: boolean;
  let eventType: 'ENROLL' | 'LOGIN';

  if (userResult.rows.length === 0) {
    // New user - enroll
    const insertResult = await pool.query(
      `INSERT INTO users (pn_hash, credential_gender, credential_birth_year, credential_region_codes, created_at, last_login_at)
       VALUES ($1, $2, $3, $4, NOW(), NOW())
       RETURNING id`,
      [pnHash, gender || 'UNKNOWN', birthYear, regionCodes || []]
    );
    userId = insertResult.rows[0].id;
    isNew = true;
    eventType = 'ENROLL';
  } else {
    // Existing user - login
    userId = userResult.rows[0].id;
    await pool.query(`UPDATE users SET last_login_at = NOW() WHERE id = $1`, [userId]);
    isNew = false;
    eventType = 'LOGIN';
  }

  // 6. Record successful event
  await pool.query(
    `INSERT INTO security_events
     (user_id, pn_hash, event_type, result, liveness_score, face_match_score, ip_address, user_agent)
     VALUES ($1, $2, $3, 'PASS', $4, $5, $6, $7)`,
    [userId, pnHash, eventType, liveness.score, faceMatch.score, ipAddress, userAgent]
  );

  // 7. Clear rate limits on success
  await clearRateLimit(pnHash, ipAddress || '0.0.0.0');

  // 8. Generate session attestation
  const credential = {
    gender,
    birthYear,
    regionCodes,
  };

  const sessionAttestation = generateSessionAttestation(userId, credential);

  // Long-lived credential token used by API Authorization (Bearer)
  // Keep sessionAttestation short-lived for session verification flows.
  const credentialToken = issueCredentialForSubject(
    userId,
    {
      age_bucket: birthYear ? calculateAgeBucket(birthYear) : '25-34',
      gender: (gender === 'M' ? 'M' : gender === 'F' ? 'F' : 'O'),
      region_codes: regionCodes || [],
      citizenship: 'GEO',
    } as any,
    7 * 24 * 60 * 60
  );

  return {
    isNew,
    userId,
    credential,
    sessionAttestation,
    credentialToken,
  };
}