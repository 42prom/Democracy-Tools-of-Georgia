import crypto from 'crypto';
import { Request, Response } from 'express';
import { pool, transaction } from '../db/client';
import type { AdminRole } from '../middleware/auth';

const TOKEN_BYTES = 32;
const SESSION_COOKIE = process.env.NODE_ENV === 'production'
  ? '__Host-dtg_admin_session'
  : 'dtg_admin_session';

function boundedInteger(value: string | undefined, fallback: number, min: number, max: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}

const IDLE_TIMEOUT_SECONDS = boundedInteger(
  process.env.ADMIN_SESSION_IDLE_SECONDS,
  15 * 60,
  5 * 60,
  60 * 60
);
const ABSOLUTE_TIMEOUT_SECONDS = boundedInteger(
  process.env.ADMIN_SESSION_ABSOLUTE_SECONDS,
  8 * 60 * 60,
  15 * 60,
  24 * 60 * 60
);
const MAX_CONCURRENT_SESSIONS = boundedInteger(
  process.env.ADMIN_MAX_CONCURRENT_SESSIONS,
  3,
  1,
  10
);

export interface AdminSessionIdentity {
  sessionId: string;
  sessionTokenHash: string;
  csrfTokenHash: string;
  id: string;
  email: string;
  role: AdminRole;
  fullName?: string;
  stepUpExpiresAt?: Date;
}

function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function randomToken(): string {
  return crypto.randomBytes(TOKEN_BYTES).toString('base64url');
}

function cookieValue(req: Request, name: string): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;

  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 1) continue;
    const key = part.slice(0, separator).trim();
    if (key !== name) continue;
    try {
      return decodeURIComponent(part.slice(separator + 1).trim());
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function sessionCookie(token: string, maxAgeSeconds: number): string {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSeconds}${secure}`;
}

export function clearAdminSessionCookie(res: Response): void {
  res.append('Set-Cookie', sessionCookie('', 0));
}

export async function createAdminSession(
  adminUserId: string,
  req: Request,
  res: Response
): Promise<string> {
  const sessionToken = randomToken();
  const csrfToken = randomToken();
  const tokenHash = sha256(sessionToken);
  const csrfTokenHash = sha256(csrfToken);
  const ipAddress = req.ip || null;
  const userAgent = String(req.headers['user-agent'] || '').slice(0, 512) || null;

  await transaction(async client => {
    await client.query(
      `DELETE FROM admin_sessions
        WHERE admin_user_id = $1
          AND (absolute_expires_at <= NOW() OR revoked_at < NOW() - INTERVAL '30 days')`,
      [adminUserId]
    );

    await client.query(
      `INSERT INTO admin_sessions
         (admin_user_id, token_hash, csrf_token_hash, idle_expires_at,
          absolute_expires_at, ip_address, user_agent)
       VALUES ($1, $2, $3, NOW() + ($4 * INTERVAL '1 second'),
               NOW() + ($5 * INTERVAL '1 second'), $6, $7)`,
      [adminUserId, tokenHash, csrfTokenHash, IDLE_TIMEOUT_SECONDS, ABSOLUTE_TIMEOUT_SECONDS, ipAddress, userAgent]
    );

    await client.query(
      `UPDATE admin_sessions
          SET revoked_at = COALESCE(revoked_at, NOW())
        WHERE id IN (
          SELECT id
            FROM admin_sessions
           WHERE admin_user_id = $1 AND revoked_at IS NULL
           ORDER BY created_at DESC
          OFFSET $2
        )`,
      [adminUserId, MAX_CONCURRENT_SESSIONS]
    );
  });

  res.append('Set-Cookie', sessionCookie(sessionToken, ABSOLUTE_TIMEOUT_SECONDS));
  return csrfToken;
}

export async function authenticateAdminSession(req: Request): Promise<AdminSessionIdentity | null> {
  const token = cookieValue(req, SESSION_COOKIE);
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;

  const tokenHash = sha256(token);
  const result = await pool.query(
    `UPDATE admin_sessions AS s
        SET last_seen_at = NOW(),
            idle_expires_at = LEAST(
              s.absolute_expires_at,
              NOW() + ($2 * INTERVAL '1 second')
            )
       FROM admin_users AS u
      WHERE s.token_hash = $1
        AND s.admin_user_id = u.id
        AND s.revoked_at IS NULL
        AND s.idle_expires_at > NOW()
        AND s.absolute_expires_at > NOW()
        AND u.is_active = true
        AND (u.locked_until IS NULL OR u.locked_until <= NOW())
      RETURNING s.id AS session_id, s.token_hash, s.csrf_token_hash, s.step_up_expires_at,
                u.id, u.email, u.role, u.full_name`,
    [tokenHash, IDLE_TIMEOUT_SECONDS]
  );

  const row = result.rows[0];
  if (!row) return null;
  return {
    sessionId: row.session_id,
    sessionTokenHash: row.token_hash,
    csrfTokenHash: row.csrf_token_hash,
    id: row.id,
    email: row.email,
    role: row.role,
    fullName: row.full_name || undefined,
    stepUpExpiresAt: row.step_up_expires_at || undefined,
  };
}

export function verifyAdminCsrf(identity: AdminSessionIdentity, suppliedToken: unknown): boolean {
  if (typeof suppliedToken !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(suppliedToken)) {
    return false;
  }
  const actual = Buffer.from(sha256(suppliedToken), 'hex');
  const expected = Buffer.from(identity.csrfTokenHash, 'hex');
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

export async function rotateAdminCsrf(sessionId: string): Promise<string> {
  const csrfToken = randomToken();
  await pool.query(
    `UPDATE admin_sessions
        SET csrf_token_hash = $2
      WHERE id = $1 AND revoked_at IS NULL`,
    [sessionId, sha256(csrfToken)]
  );
  return csrfToken;
}

export async function revokeAdminSession(sessionId: string): Promise<void> {
  await pool.query(
    'UPDATE admin_sessions SET revoked_at = COALESCE(revoked_at, NOW()) WHERE id = $1',
    [sessionId]
  );
}

export async function revokeAllAdminSessions(adminUserId: string): Promise<void> {
  await pool.query(
    'UPDATE admin_sessions SET revoked_at = COALESCE(revoked_at, NOW()) WHERE admin_user_id = $1 AND revoked_at IS NULL',
    [adminUserId]
  );
}

export const adminSessionPolicy = {
  cookieName: SESSION_COOKIE,
  idleTimeoutSeconds: IDLE_TIMEOUT_SECONDS,
  absoluteTimeoutSeconds: ABSOLUTE_TIMEOUT_SECONDS,
  maxConcurrentSessions: MAX_CONCURRENT_SESSIONS,
};
