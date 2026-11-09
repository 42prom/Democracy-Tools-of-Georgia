import { createHmac } from 'node:crypto';
import { Request, Response, NextFunction } from 'express';
import { query } from '../db/client';

const MIN_KEY_LENGTH = 8;
const MAX_KEY_LENGTH = 200;
const SAFE_KEY_PATTERN = /^[A-Za-z0-9._:-]+$/;
const FINGERPRINT_PATTERN = /^[a-f0-9]{64}$/;

interface IdempotencyRecord {
  response_code: number | null;
  response_body: unknown;
  params: { requestFingerprint?: unknown } | null;
}

function getHmacSecret(): string {
  const secret = (
    process.env.IDEMPOTENCY_HMAC_SECRET || process.env.NULLIFIER_SECRET || ''
  ).trim();
  if (!secret) {
    throw new Error('Idempotency HMAC secret is not configured');
  }
  return secret;
}

function canonicalJson(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'string' || typeof value === 'boolean') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Request contains a non-finite number');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`;
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map(key => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(',')}}`;
  }
  throw new Error('Request body must be JSON-compatible');
}

function keyedHash(domain: string, value: string): string {
  return createHmac('sha256', getHmacSecret())
    .update(`${domain}\0${value}`, 'utf8')
    .digest('hex');
}

export function buildIdempotencyStorageKey(
  userId: string | null,
  path: string,
  clientKey: string
): string {
  return keyedHash('dtg-idempotency-scope-v1', `${userId || 'anonymous'}\0${path}\0${clientKey}`);
}

export function buildIdempotencyRequestFingerprint(body: unknown): string {
  return keyedHash('dtg-idempotency-request-v1', canonicalJson(body));
}

function extractClientKey(req: Request): string | null {
  const key = req.get('Idempotency-Key') || req.get('X-Idempotency-Key');
  if (!key) return null;
  if (
    key.length < MIN_KEY_LENGTH ||
    key.length > MAX_KEY_LENGTH ||
    !SAFE_KEY_PATTERN.test(key)
  ) {
    throw new Error('Invalid Idempotency-Key format');
  }
  return key;
}

function storedFingerprint(record: IdempotencyRecord): string | null {
  const fingerprint = record.params?.requestFingerprint;
  return typeof fingerprint === 'string' && FINGERPRINT_PATTERN.test(fingerprint)
    ? fingerprint
    : null;
}

function replayOrReject(
  record: IdempotencyRecord,
  requestFingerprint: string,
  res: Response
): boolean {
  if (storedFingerprint(record) !== requestFingerprint) {
    res.status(409).json({ error: 'Idempotency-Key was already used for a different request' });
    return true;
  }
  if (record.response_code !== null) {
    res.status(record.response_code).json(record.response_body);
    return true;
  }
  res.status(409).json({ error: 'Request with this Idempotency-Key is currently in progress' });
  return true;
}

function replayMetadata(statusCode: number): Record<string, unknown> {
  if (statusCode >= 200 && statusCode < 300) {
    return { success: true, duplicate: true };
  }
  return {
    error: 'Previous request with this Idempotency-Key failed',
    duplicate: true,
  };
}

/**
 * Provides scoped request idempotency without persisting ballot choices,
 * survey responses, raw client keys, or brute-forceable request hashes.
 */
export const checkIdempotency = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  let clientKey: string | null;
  try {
    clientKey = extractClientKey(req);
  } catch {
    res.status(400).json({ error: 'Invalid Idempotency-Key format' });
    return;
  }
  if (!clientKey) {
    next();
    return;
  }

  try {
    const userId = req.credential?.sub || null;
    const path = req.originalUrl.split('?', 1)[0];
    const storageKey = buildIdempotencyStorageKey(userId, path, clientKey);
    const requestFingerprint = buildIdempotencyRequestFingerprint(req.body);

    await query('DELETE FROM idempotency_keys WHERE key = $1 AND expires_at <= NOW()', [
      storageKey,
    ]);

    const existing = await query<IdempotencyRecord>(
      `SELECT response_code, response_body, params
       FROM idempotency_keys
       WHERE key = $1 AND expires_at > NOW()`,
      [storageKey]
    );
    if (existing.rows.length > 0) {
      replayOrReject(existing.rows[0], requestFingerprint, res);
      return;
    }

    const inserted = await query<{ key: string }>(
      `INSERT INTO idempotency_keys (key, user_id, path, params)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (key) DO NOTHING
       RETURNING key`,
      [storageKey, null, path, { requestFingerprint }]
    );

    if (inserted.rows.length === 0) {
      const raced = await query<IdempotencyRecord>(
        `SELECT response_code, response_body, params
         FROM idempotency_keys
         WHERE key = $1 AND expires_at > NOW()`,
        [storageKey]
      );
      if (raced.rows.length === 0) {
        res.status(409).json({ error: 'Idempotent request state changed; retry with a new key' });
        return;
      }
      replayOrReject(raced.rows[0], requestFingerprint, res);
      return;
    }

    const originalJson = res.json;
    res.json = function storeIdempotentResponse(body: unknown) {
      res.json = originalJson;
      const storedResponse = replayMetadata(res.statusCode);
      query(
        `UPDATE idempotency_keys
         SET response_code = $1, response_body = $2
         WHERE key = $3`,
        [res.statusCode, storedResponse, storageKey]
      ).catch(error => console.error('[Idempotency] Failed to store response metadata', error));
      return originalJson.call(this, body);
    };

    next();
  } catch (error) {
    console.error('[Idempotency] Fail-closed storage error', error);
    res.status(500).json({ error: 'Idempotency check failed' });
  }
};
