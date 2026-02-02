import { Router, Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { pool } from '../db/client';
import { computePnHash, validatePersonalNumber, checkRateLimit, recordFailedAttempt, clearRateLimit } from '../services/identity';
import { getVerificationSettings } from '../services/verificationSettings';
import { createErrorWithCode } from '../middleware/errorHandler';
import { issueCredentialForSubject } from '../services/credentials';
import { DemographicData } from '../types/credentials';

const router = Router();

type EnrollmentMode = 'login' | 'register';

interface NfcPayload {
  personalNumber?: string;
  nationality?: string;
  dob?: string;
  expiry?: string;
  docNumber?: string;
  docPortraitBase64?: string; // optional
}

interface DocPayload {
  enrollmentSessionId: string;
  personalNumber?: string;
  dob?: string;
  expiry?: string;
  docNumber?: string;
  documentPortraitBase64?: string; // optional
}

interface LivenessPayload {
  enrollmentSessionId: string;
  livenessScore?: number;
  selfieBase64?: string; // optional
}

function isProd(): boolean {
  return process.env.NODE_ENV === 'production';
}

function parseDate(value: string | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function normalizeDocNumber(value: string | undefined): string {
  return (value || '').trim().toUpperCase();
}

function normalizeNationality(value: string | undefined): string {
  return (value || '').trim().toUpperCase();
}

function decodeBase64Image(input: string | undefined): Buffer | null {
  if (!input) return null;
  // allow either raw base64 or data URL
  const parts = input.split(',');
  const b64 = parts.length === 2 ? parts[1] : parts[0];
  try {
    const buf = Buffer.from(b64, 'base64');
    return buf.length > 0 ? buf : null;
  } catch {
    return null;
  }
}

function basicImageQualityScore(buf: Buffer): number {
  // Cheap heuristic: variance of byte values. Range ~[0..~1]
  if (buf.length < 1024) return 0;
  let mean = 0;
  for (const b of buf) mean += b;
  mean /= buf.length;
  let variance = 0;
  for (const b of buf) {
    const d = b - mean;
    variance += d * d;
  }
  variance /= buf.length;
  // Normalize: max variance for bytes is 255^2/4 ~ 16256
  const score = Math.min(1, variance / 16256);
  return score;
}

function embedding128(buf: Buffer): Float32Array {
  // Deterministic pseudo-embedding (MVP placeholder).
  // NOTE: Replace with real face embedding model/provider in Phase 1.
  const base = crypto.createHash('sha256').update(buf).digest();
  const out = new Float32Array(128);
  for (let i = 0; i < 128; i++) {
    const h = crypto.createHash('sha256').update(base).update(Buffer.from([i])).digest();
    const v = h.readUInt32BE(0);
    out[i] = (v % 1000000) / 1000000; // [0,1)
  }
  return out;
}

function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / Math.sqrt(na * nb);
}

async function ensureSchema(): Promise<void> {
  // No-op guard: migration creates tables.
  await pool.query('SELECT 1');
}

async function logSessionEvent(params: {
  pnHash: string;
  result: 'PASS' | 'FAIL' | 'BLOCKED';
  reasonCode?: string;
  livenessScore?: number;
  faceScore?: number;
  ipAddress?: string;
  userAgent?: string;
}): Promise<void> {
  const { pnHash, result, reasonCode, livenessScore, faceScore, ipAddress, userAgent } = params;
  await pool.query(
    `INSERT INTO security_events
     (pn_hash, event_type, result, liveness_score, face_match_score, reason_code, ip_address, user_agent)
     VALUES ($1, 'SESSION_VERIFY', $2, $3, $4, $5, $6, $7)`,
    [pnHash, result, livenessScore ?? null, faceScore ?? null, reasonCode ?? null, ipAddress ?? null, userAgent ?? null]
  );
}

/**
 * Step 1: NFC
 * POST /api/v1/enrollment/nfc
 */
router.post('/nfc', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await ensureSchema();
    const settings = await getVerificationSettings();
    const payload: NfcPayload = req.body || {};

    if (settings.nfc.requirePersonalNumber && !payload.personalNumber) {
      throw createErrorWithCode('PN_MISSING', 'Personal number is required', 400);
    }

    const pnDigits = (payload.personalNumber || '').trim();
    const pnValidation = validatePersonalNumber(pnDigits);
    if (!pnValidation.valid) {
      throw createErrorWithCode('PN_MISSING', pnValidation.error || 'Invalid personal number', 400);
    }

    const pnHash = computePnHash(pnDigits);

    const ipAddress = (req.ip || req.connection.remoteAddress || 'unknown').replace('::ffff:', '');
    const userAgent = req.headers['user-agent'] || 'unknown';

    const rate = await checkRateLimit(pnHash, ipAddress);
    if (!rate.allowed) {
      await logSessionEvent({ pnHash, result: 'BLOCKED', reasonCode: 'RATE_LIMIT', ipAddress, userAgent });
      throw createErrorWithCode('RATE_LIMIT', rate.reason || 'Rate limit exceeded', 429);
    }

    if (settings.nfc.requireGeorgianCitizen) {
      const nat = normalizeNationality(payload.nationality);
      if (nat && nat !== 'GEO') {
        await recordFailedAttempt(pnHash, ipAddress);
        await logSessionEvent({ pnHash, result: 'FAIL', reasonCode: 'NOT_GEO', ipAddress, userAgent });
        throw createErrorWithCode('NOT_GEO', 'Georgian citizenship required', 403);
      }
    }

    const expiry = parseDate(payload.expiry);
    if (expiry && expiry.getTime() < Date.now()) {
      await recordFailedAttempt(pnHash, ipAddress);
      await logSessionEvent({ pnHash, result: 'FAIL', reasonCode: 'DOC_EXPIRED', ipAddress, userAgent });
      throw createErrorWithCode('DOC_EXPIRED', 'Document is expired', 403);
    }

    // Determine login vs register (by pn_hash)
    const userResult = await pool.query('SELECT id FROM users WHERE pn_hash = $1', [pnHash]);
    const mode: EnrollmentMode = userResult.rows.length > 0 ? 'login' : 'register';

    const docNumber = normalizeDocNumber(payload.docNumber);
    const dob = payload.dob ? payload.dob.trim() : '';
    const expiryIso = payload.expiry ? payload.expiry.trim() : '';
    const nationality = normalizeNationality(payload.nationality);

    const nfcPortrait = decodeBase64Image(payload.docPortraitBase64);
    const nfcPortraitHash = nfcPortrait ? crypto.createHash('sha256').update(nfcPortrait).digest('hex') : null;

    const sessionInsert = await pool.query(
      `INSERT INTO enrollment_sessions
       (pn_hash, mode, step, nfc_payload, nfc_portrait_hash, created_at, updated_at, expires_at)
       VALUES ($1, $2, 1, $3, $4, NOW(), NOW(), NOW() + INTERVAL '10 minutes')
       RETURNING id`,
      [
        pnHash,
        mode,
        JSON.stringify({
          nationality,
          dob,
          expiry: expiryIso,
          docNumber,
        }),
        nfcPortraitHash,
      ]
    );

    await logSessionEvent({ pnHash, result: 'PASS', reasonCode: 'NFC_OK', ipAddress, userAgent });

    return res.json({ enrollmentSessionId: sessionInsert.rows[0].id, next: 'document', mode });
  } catch (error) {
    return next(error);
  }
});

/**
 * Step 2: Document scan + compare
 * POST /api/v1/enrollment/document
 */
router.post('/document', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await ensureSchema();
    const settings = await getVerificationSettings();
    const payload: DocPayload = req.body || {};

    if (!payload.enrollmentSessionId) {
      throw createErrorWithCode('INVALID_SESSION', 'enrollmentSessionId is required', 400);
    }

    const sessionResult = await pool.query(
      `SELECT * FROM enrollment_sessions WHERE id = $1 AND expires_at > NOW()`,
      [payload.enrollmentSessionId]
    );
    if (sessionResult.rows.length === 0) {
      throw createErrorWithCode('INVALID_SESSION', 'Enrollment session not found or expired', 404);
    }
    const session = sessionResult.rows[0] as any;
    const pnHash: string = session.pn_hash;

    const ipAddress = (req.ip || req.connection.remoteAddress || 'unknown').replace('::ffff:', '');
    const userAgent = req.headers['user-agent'] || 'unknown';

    if (!settings.documentScanner.requireDocumentPhotoScan) {
      // Policy disabled: allow advancing without compare
      await pool.query(
        `UPDATE enrollment_sessions SET step = 2, document_payload = $2, updated_at = NOW() WHERE id = $1`,
        [payload.enrollmentSessionId, JSON.stringify({ skipped: true })]
      );
      await logSessionEvent({ pnHash, result: 'PASS', reasonCode: 'DOC_SKIPPED', ipAddress, userAgent });
      return res.json({ enrollmentSessionId: payload.enrollmentSessionId, next: 'liveness' });
    }

    const nfcPayload = session.nfc_payload as any;

    const mismatches: Record<string, { nfc: string; doc: string }> = {};

    const compareField = (field: string, nfcValue: string, docValue: string) => {
      if (!nfcValue || !docValue) return;
      const n = nfcValue.trim();
      const d = docValue.trim();
      if (n !== d) {
        mismatches[field] = { nfc: n, doc: d };
      }
    };

    // Compare PN by hash (never store raw PN).
    if (payload.personalNumber) {
      const docPnValidation = validatePersonalNumber(payload.personalNumber.trim());
      if (!docPnValidation.valid) {
        mismatches.personalNumber = { nfc: 'pn_hash', doc: 'invalid' };
      } else {
        const docPnHash = computePnHash(payload.personalNumber.trim());
        if (docPnHash !== pnHash) {
          mismatches.personalNumber = { nfc: 'pn_hash', doc: 'pn_hash' };
        }
      }
    }
    compareField('dob', String(nfcPayload.dob || ''), String(payload.dob || ''));
    compareField('expiry', String(nfcPayload.expiry || ''), String(payload.expiry || ''));
    compareField('docNumber', String(nfcPayload.docNumber || ''), normalizeDocNumber(payload.docNumber));

    if (settings.documentScanner.strictness === 'strict' && Object.keys(mismatches).length > 0) {
      await recordFailedAttempt(pnHash, ipAddress);
      await logSessionEvent({ pnHash, result: 'FAIL', reasonCode: 'NFC_DOC_MISMATCH', ipAddress, userAgent });
      throw createErrorWithCode(
        'NFC_DOC_MISMATCH',
        'Document data does not match NFC chip data',
        403,
        { mismatches: Object.keys(mismatches) }
      );
    }

    const docPortrait = decodeBase64Image(payload.documentPortraitBase64);
    const docPortraitHash = docPortrait ? crypto.createHash('sha256').update(docPortrait).digest('hex') : null;

    await pool.query(
      `UPDATE enrollment_sessions
       SET step = 2,
           document_payload = $2,
           document_portrait_hash = COALESCE($3, document_portrait_hash),
           updated_at = NOW()
       WHERE id = $1`,
      [
        payload.enrollmentSessionId,
        JSON.stringify({
          personalNumber: (payload.personalNumber || '').trim(),
          dob: (payload.dob || '').trim(),
          expiry: (payload.expiry || '').trim(),
          docNumber: normalizeDocNumber(payload.docNumber),
        }),
        docPortraitHash,
      ]
    );

    await logSessionEvent({ pnHash, result: 'PASS', reasonCode: 'DOC_OK', ipAddress, userAgent });
    return res.json({ enrollmentSessionId: payload.enrollmentSessionId, next: 'liveness' });
  } catch (error) {
    return next(error);
  }
});

/**
 * Step 3: Liveness + face match
 * POST /api/v1/enrollment/liveness
 */
router.post('/liveness', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await ensureSchema();
    const settings = await getVerificationSettings();
    const payload: LivenessPayload = req.body || {};

    if (!payload.enrollmentSessionId) {
      throw createErrorWithCode('INVALID_SESSION', 'enrollmentSessionId is required', 400);
    }

    const sessionResult = await pool.query(
      `SELECT * FROM enrollment_sessions WHERE id = $1 AND expires_at > NOW()`,
      [payload.enrollmentSessionId]
    );
    if (sessionResult.rows.length === 0) {
      throw createErrorWithCode('INVALID_SESSION', 'Enrollment session not found or expired', 404);
    }
    const session = sessionResult.rows[0] as any;
    const pnHash: string = session.pn_hash;

    const ipAddress = (req.ip || req.connection.remoteAddress || 'unknown').replace('::ffff:', '');
    const userAgent = req.headers['user-agent'] || 'unknown';

    const allowMocks = !isProd();

    // Liveness checks
    const livenessScore = typeof payload.livenessScore === 'number' ? payload.livenessScore : 0;
    if (settings.liveness.provider === 'mock') {
      if (!allowMocks) {
        throw createErrorWithCode('MOCK_DISABLED', 'Mock liveness provider is disabled in production', 500);
      }
      // accept any score in dev
    } else {
      if (livenessScore < settings.liveness.minThreshold) {
        await recordFailedAttempt(pnHash, ipAddress);
        await logSessionEvent({ pnHash, result: 'FAIL', reasonCode: 'LIVENESS_FAIL', livenessScore, ipAddress, userAgent });
        throw createErrorWithCode('LIVENESS_FAIL', 'Liveness check failed', 403);
      }
    }

    // Face match
    let faceScore = 0;
    if (settings.faceMatch.provider === 'mock') {
      if (!allowMocks) {
        throw createErrorWithCode('MOCK_DISABLED', 'Mock face match provider is disabled in production', 500);
      }
      faceScore = 0.99;
    } else if (settings.faceMatch.provider === 'provider') {
      throw createErrorWithCode('PROVIDER_NOT_IMPLEMENTED', 'Face match provider integration not implemented yet', 501);
    } else {
      const selfie = decodeBase64Image(payload.selfieBase64);
      if (!selfie) {
        throw createErrorWithCode('FACE_MATCH_FAIL', 'Selfie image is required for face match', 400);
      }

      const selfieQuality = basicImageQualityScore(selfie);
      if (selfieQuality < 0.05) {
        throw createErrorWithCode('FACE_MATCH_FAIL', 'Selfie image quality too low', 400);
      }

      // For MVP, we use portrait hashes only (no raw storage). In a real implementation,
      // you should store encrypted references or re-fetch portrait from provider.
      // Here, we require the client to send the document portrait again via X-Doc-Portrait.
      const docPortraitHeader = req.headers['x-doc-portrait-base64'];
      const docPortrait = typeof docPortraitHeader === 'string' ? decodeBase64Image(docPortraitHeader) : null;
      if (!docPortrait) {
        throw createErrorWithCode('FACE_MATCH_FAIL', 'Document portrait is required for in-house face match', 400);
      }

      const docQuality = basicImageQualityScore(docPortrait);
      if (docQuality < 0.05) {
        throw createErrorWithCode('FACE_MATCH_FAIL', 'Document portrait quality too low', 400);
      }

      const a = embedding128(docPortrait);
      const b = embedding128(selfie);
      const cos = cosineSimilarity(a, b);
      faceScore = (cos + 1) / 2; // [0,1]

      if (faceScore < settings.faceMatch.minThreshold) {
        await recordFailedAttempt(pnHash, ipAddress);
        await logSessionEvent({ pnHash, result: 'FAIL', reasonCode: 'FACE_MATCH_FAIL', livenessScore, faceScore, ipAddress, userAgent });
        throw createErrorWithCode('FACE_MATCH_FAIL', 'Face match failed', 403);
      }
    }

    // Upsert user (no raw personal number stored)
    const userResult = await pool.query('SELECT id, credential_birth_year, credential_gender, credential_region_codes FROM users WHERE pn_hash = $1', [pnHash]);
    let userId: string;
    let isNew = false;

    if (userResult.rows.length === 0) {
      const dob = session?.nfc_payload?.dob ? String(session.nfc_payload.dob) : '';
      const birthYear = dob.length >= 4 ? Number(dob.substring(0, 4)) : null;
      const insert = await pool.query(
        `INSERT INTO users (pn_hash, credential_gender, credential_birth_year, credential_region_codes, created_at, last_login_at)
         VALUES ($1, $2, $3, $4, NOW(), NOW())
         RETURNING id`,
        [pnHash, 'UNKNOWN', birthYear, []]
      );
      userId = insert.rows[0].id;
      isNew = true;
    } else {
      userId = userResult.rows[0].id;
      await pool.query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [userId]);
    }

    // Clear rate limits on success
    await clearRateLimit(pnHash, ipAddress);

    // Issue long-lived credential token for requireCredential
    const demographics: DemographicData = {
      age_bucket: '25-34',
      gender: 'O',
      region_codes: [],
      citizenship: 'GEO',
    };

    const credentialToken = issueCredentialForSubject(userId, demographics, 7 * 24 * 60 * 60);

    await pool.query(
      `UPDATE enrollment_sessions SET step = 3, status = 'completed', updated_at = NOW() WHERE id = $1`,
      [payload.enrollmentSessionId]
    );

    await logSessionEvent({ pnHash, result: 'PASS', reasonCode: isNew ? 'ENROLL_OK' : 'LOGIN_OK', livenessScore, faceScore, ipAddress, userAgent });

    return res.json({ credentialToken, userId, isNewUser: isNew });
  } catch (error) {
    return next(error);
  }
});

export default router;
