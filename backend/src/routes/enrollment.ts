import { Router, Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { pool } from '../db/client';
import { computePnHash, validatePersonalNumber, checkRateLimit, recordFailedAttempt, clearRateLimit } from '../services/identity';
import { getVerificationSettings } from '../services/verificationSettings';
import { createErrorWithCode } from '../middleware/errorHandler';
import { issueCredentialForSubject } from '../services/credentials';
import { DemographicData } from '../types/credentials';
import { BlockchainService } from '../services/blockchain';
import { BiometricService } from '../services/biometrics';
import { AuthRateLimiter } from '../services/authRateLimit';

const router = Router();

type EnrollmentMode = 'login' | 'register';

interface NfcPayload {
  personalNumber?: string;
  nationality?: string;
  dob?: string;
  expiry?: string;
  docNumber?: string;
  gender?: string;
  docPortraitBase64?: string; // optional
}

interface DocPayload {
  enrollmentSessionId: string;
  personalNumber?: string;
  dob?: string;
  expiry?: string;
  docNumber?: string;
  docPortraitBase64?: string; // optional
}

interface PassiveLivenessSignals {
  textureScore?: number;
  microMovementScore?: number;
  naturalBlinkDetected?: boolean;
  consistentFrames?: number;
  facePresenceScore?: number;
  confidence?: number;
}

interface LivenessData {
  tier: 'passive' | 'active';
  passiveSignals?: PassiveLivenessSignals;
  clientConfidenceScore?: number;
}

interface LivenessPayload {
  enrollmentSessionId: string;
  livenessScore?: number;
  selfieBase64?: string;
  docPortraitBase64?: string;
  livenessData?: LivenessData; // NEW: Tiered liveness data from client
  livenessNonce?: string; // P2: Challenge nonce
}


function parseDate(value: string | undefined): Date | null {
  if (!value) return null;

  // Try DD-MM-YYYY or DDMMYYYY
  // IMPORTANT: Use Date.UTC to avoid timezone shifts
  const clean = value.replace(/[^0-9-]/g, '');
  const dmyMatch = clean.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (dmyMatch) {
    const day = parseInt(dmyMatch[1]);
    const month = parseInt(dmyMatch[2]) - 1;
    const year = parseInt(dmyMatch[3]);
    const d = new Date(Date.UTC(year, month, day));
    if (!Number.isNaN(d.getTime())) return d;
  }

  // Try raw digits DDMMYYYY
  if (/^\d{8}$/.test(clean)) {
    const day = parseInt(clean.substring(0, 2));
    const month = parseInt(clean.substring(2, 4)) - 1;
    const year = parseInt(clean.substring(4, 8));
    const d = new Date(Date.UTC(year, month, day));
    if (!Number.isNaN(d.getTime())) return d;
  }

  // For ISO format strings like "1991-01-01", parse and convert to UTC
  const isoMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    const year = parseInt(isoMatch[1]);
    const month = parseInt(isoMatch[2]) - 1;
    const day = parseInt(isoMatch[3]);
    const d = new Date(Date.UTC(year, month, day));
    if (!Number.isNaN(d.getTime())) return d;
  }

  // Fallback: try native parsing but adjust to UTC noon to avoid timezone issues
  const d = new Date(value);
  if (!Number.isNaN(d.getTime())) {
    // Normalize to UTC midnight
    return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  }
  return null;
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
 * Step 0: Public Regions
 * GET /api/v1/enrollment/regions
 */
router.get('/regions', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await pool.query(
      'SELECT id, code, name_en, name_ka FROM regions WHERE active = true ORDER BY name_en ASC'
    );
    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

/**
 * Step 1a: Check User Status (Interim)
 * POST /api/v1/enrollment/status
 */
router.post('/status', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { personalNumber } = req.body;
    if (!personalNumber) {
      throw createErrorWithCode('PN_MISSING', 'Personal number is required', 400);
    }

    const pnDigits = (personalNumber || '').trim();
    const pnValidation = validatePersonalNumber(pnDigits);
    if (!pnValidation.valid) {
      throw createErrorWithCode('PN_MISSING', pnValidation.error || 'Invalid personal number', 400);
    }

    // Verify existence without revealing too much info (rate limiting applied)
    const pnHash = computePnHash(pnDigits);
    const ipAddress = (req.ip || req.connection.remoteAddress || 'unknown').replace('::ffff:', '');
    const userAgent = req.headers['user-agent'] || 'unknown';
    
    // Check strict rate limit for existence checks to prevent enumeration
    const rate = await checkRateLimit(pnHash, ipAddress);
    if (!rate.allowed) {
      await logSessionEvent({ pnHash, result: 'BLOCKED', reasonCode: 'RATE_LIMIT', ipAddress, userAgent });
      throw createErrorWithCode('RATE_LIMIT', rate.reason || 'Rate limit exceeded', 429);
    }
    
    const userResult = await pool.query('SELECT id FROM users WHERE pn_hash = $1', [pnHash]);
    const exists = userResult.rows.length > 0;
    
    res.json({ exists, status: exists ? 'active' : 'unknown' });
  } catch (error) {
    next(error);
  }
});

/**
 * Step 2.1: Register Partial Profile
 * POST /api/v1/enrollment/profile
 */
router.post('/profile', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { enrollmentSessionId, regionCode, firstName, lastName } = req.body;
    
    if (!enrollmentSessionId) {
      throw createErrorWithCode('INVALID_SESSION', 'Session ID required', 400);
    }
    
    // validate session
    const sessionResult = await pool.query(
      `SELECT * FROM enrollment_sessions WHERE id = $1 AND expires_at > NOW()`,
      [enrollmentSessionId]
    );
    if (sessionResult.rows.length === 0) {
      throw createErrorWithCode('INVALID_SESSION', 'Session not found or expired', 404);
    }
    
    // Resolve regionCode (can be UUID or code) to string code
    let resolvedRegionCode = regionCode;
    if (regionCode) {
       const regionResult = await pool.query(
         'SELECT code FROM regions WHERE (id::text = $1 OR code = $1) AND active = true', 
         [regionCode]
       );
       if (regionResult.rows.length === 0) {
          throw createErrorWithCode('INVALID_REGION', 'Invalid or inactive region', 400);
       }
       resolvedRegionCode = regionResult.rows[0].code;
    }

    // Update session with profile data
    const session = sessionResult.rows[0];
    const currentPayload = session.nfc_payload || {};
    
    const updatedPayload = {
      ...currentPayload,
      regionCode: resolvedRegionCode || currentPayload.regionCode,
      firstName: firstName || currentPayload.firstName,
      lastName: lastName || currentPayload.lastName,
      gender: req.body.gender || currentPayload.gender,
      dob: req.body.dob || currentPayload.dob
    };

    await pool.query(
      `UPDATE enrollment_sessions SET nfc_payload = $2, updated_at = NOW() WHERE id = $1`,
      [enrollmentSessionId, JSON.stringify(updatedPayload)]
    );

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

/**
 * Step 1: NFC
 * POST /api/v1/enrollment/nfc
 */
router.post('/nfc', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await ensureSchema();
    const settings = await getVerificationSettings();
    const payload: NfcPayload & { enrollmentSessionId?: string } = req.body || {};

    console.log('[Enrollment] /nfc hit with payload:', {
      ...payload,
      docPortraitBase64: payload.docPortraitBase64 ? '(base64)' : null,
    });

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
      // FAIL-CLOSED: if nationality is missing/empty, we MUST fail.
      if (!nat || nat !== 'GEO') {
        await recordFailedAttempt(pnHash, ipAddress);
        await logSessionEvent({ pnHash, result: 'FAIL', reasonCode: 'NOT_GEO', ipAddress, userAgent });
        throw createErrorWithCode('NOT_GEO', 'Georgian citizenship required', 403);
      }
    }

    const expiry = parseDate(payload.expiry);
    console.log('[Enrollment] Checking Expiry (2):', payload.expiry);
    
    // FAIL-CLOSED: Valid expiry required if NFC is required (assuming NFC always provides expiry)
    if (settings.nfc.requireNfc) {
       if (!expiry) {
          console.log('[Enrollment] DOC_EXPIRED detected. Expiry missing/invalid.');
          await recordFailedAttempt(pnHash, ipAddress);
          await logSessionEvent({ pnHash, result: 'FAIL', reasonCode: 'DOC_EXPIRED', ipAddress, userAgent });
          throw createErrorWithCode('DOC_EXPIRED', 'Document expiry date is missing or invalid', 403);
       }
    }

    if (expiry && expiry.getTime() < Date.now()) {
      console.log('[Enrollment] DOC_EXPIRED detected. Expiry:', expiry.toISOString());
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
    const genderRaw = payload.gender ? String(payload.gender).toUpperCase() : '';
    const gender = (genderRaw.includes('FEMALE') || genderRaw === 'F') ? 'F' : 'M'; // Default M, fix if F detected

    const nfcPortrait = decodeBase64Image(payload.docPortraitBase64);
    const nfcPortraitHash = nfcPortrait ? crypto.createHash('sha256').update(nfcPortrait).digest('hex') : null;

    let enrollmentSessionId = payload.enrollmentSessionId;

    if (enrollmentSessionId) {
      // Update existing session (Document was first)
      const sessionResult = await pool.query('SELECT nfc_payload, step FROM enrollment_sessions WHERE id = $1', [enrollmentSessionId]);
      if (sessionResult.rows.length === 0) {
         throw createErrorWithCode('INVALID_SESSION', 'Session not found', 404);
      }
      // Enforce prior step (Step 2: Document) if we are in a strict flow
      // For now, we just ensure it's not already finalized (step 4)
      if (sessionResult.rows[0].step >= 4) {
         throw createErrorWithCode('INVALID_STATE', 'Session already finalized', 409);
      }
      
      const currentPayload = sessionResult.rows[0]?.nfc_payload || {};
      
      const mergedPayload = {
        ...currentPayload,
        personalNumber: pnDigits, // Preserve raw digits for finalized profile masking
        nationality,
        dob,
        expiry: expiryIso,
        docNumber,
        gender
      };

      await pool.query(
        `UPDATE enrollment_sessions 
         SET nfc_payload = $2, nfc_portrait_hash = COALESCE($3, nfc_portrait_hash), step = 3, updated_at = NOW()
         WHERE id = $1 AND pn_hash = $4`,
        [enrollmentSessionId, JSON.stringify(mergedPayload), nfcPortraitHash, pnHash]
      );
    } else {
      // Create new session (NFC is first - legacy flow or "NFC First" flow)
      // If we allow NFC first, we set step=3 (skipping step 2/doc if allowed)
      // CHECK POLICY: If document scan is REQUIRED and NOT skipped, we might warn?
      // For now, we set step=3, implying NFC is done.
      const sessionInsert = await pool.query(
        `INSERT INTO enrollment_sessions
         (pn_hash, mode, step, nfc_payload, nfc_portrait_hash, created_at, updated_at, expires_at)
         VALUES ($1, $2, 3, $3, $4, NOW(), NOW(), NOW() + INTERVAL '10 minutes')
         RETURNING id`,
        [
          pnHash,
          mode,
          JSON.stringify({
            personalNumber: pnDigits, // Added for profile masking
            nationality,
            dob,
            expiry: expiryIso,
            docNumber,
            gender,
          }),
          nfcPortraitHash,
        ]
      );
      enrollmentSessionId = sessionInsert.rows[0].id;
    }

    // Generate Liveness Nonce (P2: Challenge-based binding)
    const livenessNonce = crypto.randomBytes(32).toString('hex');
    
    // Store nonce in session (using nfc_payload for simplicity in this phase, or separate field if exists)
    // efficient: update the session we just inserted/updated
    await pool.query(
      `UPDATE enrollment_sessions SET liveness_nonce = $2 WHERE id = $1`,
      [enrollmentSessionId, livenessNonce]
    );

    await logSessionEvent({ pnHash, result: 'PASS', reasonCode: 'NFC_OK', ipAddress, userAgent });
    
    // Determine next step: skip document if we have a portrait and policy allows it
    // Logic: If I started with NFC, I might still need Doc.
    const next = 'liveness'; // NFC is usually the last step before liveness in standard flow

    return res.json({ enrollmentSessionId, next, mode, livenessNonce }); // Return nonce to client
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

    let pnHash: string;
    let enrollmentSessionId = payload.enrollmentSessionId;
    let mode: EnrollmentMode = 'register';

    if (!enrollmentSessionId) {
      // Start session via Document (New Flow)
      if (!payload.personalNumber) {
        throw createErrorWithCode('PN_MISSING', 'Personal number is required to start enrollment', 400);
      }
      const pnDigits = (payload.personalNumber || '').trim();
      const pnValidation = validatePersonalNumber(pnDigits);
      if (!pnValidation.valid) {
        throw createErrorWithCode('PN_MISSING', pnValidation.error || 'Invalid personal number', 400);
      }
      pnHash = computePnHash(pnDigits);

      const userResult = await pool.query('SELECT id FROM users WHERE pn_hash = $1', [pnHash]);
      mode = userResult.rows.length > 0 ? 'login' : 'register';

      const sessionInsert = await pool.query(
        `INSERT INTO enrollment_sessions
         (pn_hash, mode, step, created_at, updated_at, expires_at)
         VALUES ($1, $2, 1, NOW(), NOW(), NOW() + INTERVAL '10 minutes')
         RETURNING id`,
        [pnHash, mode]
      );
      enrollmentSessionId = sessionInsert.rows[0].id;
    } else {
      // Continue existing session
      const sessionResult = await pool.query(
        `SELECT * FROM enrollment_sessions WHERE id = $1 AND expires_at > NOW()`,
        [enrollmentSessionId]
      );
      if (sessionResult.rows.length === 0) {
        throw createErrorWithCode('INVALID_SESSION', 'Enrollment session not found or expired', 404);
      }
      const session = sessionResult.rows[0] as any;
      pnHash = session.pn_hash;
      mode = session.mode;
    }

    const ipAddress = (req.ip || req.connection.remoteAddress || 'unknown').replace('::ffff:', '');
    const userAgent = req.headers['user-agent'] || 'unknown';

    if (!settings.documentScanner.requireDocumentPhotoScan) {
      // Policy disabled: allow advancing without compare
      await pool.query(
        `UPDATE enrollment_sessions SET step = 2, document_payload = $2, updated_at = NOW() WHERE id = $1`,
        [enrollmentSessionId, JSON.stringify({ skipped: true })]
      );
      await logSessionEvent({ pnHash, result: 'PASS', reasonCode: 'DOC_SKIPPED', ipAddress, userAgent });
      return res.json({ enrollmentSessionId, next: 'nfc', mode });
    }

    const docPortrait = decodeBase64Image(payload.docPortraitBase64);
    const docPortraitHash = docPortrait ? crypto.createHash('sha256').update(docPortrait).digest('hex') : null;

    await pool.query(
      `UPDATE enrollment_sessions
       SET step = 2,
           document_payload = $2,
           document_portrait_hash = COALESCE($3, document_portrait_hash),
           updated_at = NOW()
       WHERE id = $1`,
      [
        enrollmentSessionId,
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
    return res.json({ enrollmentSessionId, next: 'nfc', mode });
  } catch (error) {
    return next(error);
  }
});

/**
 * Step 3: Liveness + face match
 * Step 3: Liveness + face match
 * POST /api/v1/enrollment/verify-biometrics
 */
router.post('/verify-biometrics', async (req: Request, res: Response, next: NextFunction) => {
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

    // --- FAIL-CLOSED ENFORCEMENT (FINAL CHECK) ---
    // Even if /nfc passed, we re-verify constraints here to prevent
    // session manipulation or policy changes during the session.

    // 0. Check State Machine (Step Order)
    // We expect at least Step 3 (NFC) to be done.
    if (session.step < 3) {
       console.error(`[Biometrics] Blocked: Premature step. Current: ${session.step}, Expected: >=3`);
       await logSessionEvent({ pnHash, result: 'BLOCKED', reasonCode: 'PREMATURE_STEP', ipAddress, userAgent });
       throw createErrorWithCode('INVALID_STATE', 'Prerequisite steps (Document/NFC) not completed', 409);
    }
    
    // 1. Check Citizenship
    if (settings.nfc.requireGeorgianCitizen) {
       const nat = normalizeNationality(session.nfc_payload?.nationality);
       if (!nat || nat !== 'GEO') {
          console.error('[Biometrics] Blocked: Non-GEO citizenship in final check');
          await logSessionEvent({ pnHash, result: 'BLOCKED', reasonCode: 'NOT_GEO_FINAL', ipAddress, userAgent });
           throw createErrorWithCode('NOT_GEO', 'Georgian citizenship required', 403);
       }
    }

    // 2. Check Expiry
    if (settings.nfc.requireNfc) {
       // Check if NFC payload exists (it should if step >= 3, but be safe)
       if (!session.nfc_payload) {
          throw createErrorWithCode('INVALID_STATE', 'NFC data missing despite step completion', 409);
       }

       const expiryStr = session.nfc_payload?.expiry;
       const expiry = parseDate(expiryStr);
       
       if (!expiry) {
          console.error('[Biometrics] Blocked: Missing expiry in final check');
           await logSessionEvent({ pnHash, result: 'BLOCKED', reasonCode: 'DOC_EXPIRED_FINAL_MISSING', ipAddress, userAgent });
           throw createErrorWithCode('DOC_EXPIRED', 'Document expiry date is missing', 403);
       }
       
       if (expiry.getTime() < Date.now()) {
          console.error('[Biometrics] Blocked: Expired document in final check');
           await logSessionEvent({ pnHash, result: 'BLOCKED', reasonCode: 'DOC_EXPIRED_FINAL', ipAddress, userAgent });
           throw createErrorWithCode('DOC_EXPIRED', 'Document is expired', 403);
       }
    }

    // 3. Check Document Scan Requirement
    if (settings.documentScanner.requireDocumentPhotoScan) {
        // Must have document_payload and NOT be skipped
        if (!session.document_payload && !settings.nfc.allowSkipDocumentWhenNfcHasPortrait) {
             throw createErrorWithCode('INVALID_STATE', 'Document scan required', 409);
        }
    }


    // Rate limiting for biometric verification (admin-controlled)
    // Uses new AuthRateLimiter which:
    // - Only counts FAILED attempts (not all requests)
    // - Resets counters on successful enrollment/login
    // - Loads limits dynamically from admin settings
    const biometricRateLimit = await AuthRateLimiter.checkRateLimit('biometric', {
      ip: ipAddress,
      pnHash,
      deviceId: session.device_id,
    });

    if (!biometricRateLimit.allowed) {
      await logSessionEvent({
        pnHash,
        result: 'BLOCKED',
        reasonCode: 'IP_RATE_LIMIT_EXCEEDED',
        ipAddress,
        userAgent,
      });

      const error: any = createErrorWithCode(
        'RATE_LIMIT_EXCEEDED',
        'Too many failed biometric verification attempts. Please try again later.',
        429
      );
      error.retryAfter = biometricRateLimit.retryAfter;
      error.resetAt = biometricRateLimit.resetAt;
      error.blockedBy = biometricRateLimit.blockedBy;
      throw error;
    }

    // NOTE: We do NOT record an attempt here - only record on FAILURE
    // This is the best practice: only penalize failed attempts, not all attempts

    // Log tiered liveness data from client (for analytics and debugging)
    const livenessData = payload.livenessData;
    if (livenessData) {
      console.log(`[Liveness] Tier: ${livenessData.tier}`);
      console.log(`[Liveness] Client confidence: ${livenessData.clientConfidenceScore?.toFixed(3) ?? 'N/A'}`);
      if (livenessData.passiveSignals) {
        console.log(`[Liveness] Passive signals:`, {
          textureScore: livenessData.passiveSignals.textureScore?.toFixed(3),
          microMovement: livenessData.passiveSignals.microMovementScore?.toFixed(3),
          naturalBlink: livenessData.passiveSignals.naturalBlinkDetected,
          facePresence: livenessData.passiveSignals.facePresenceScore?.toFixed(3),
          consistentFrames: livenessData.passiveSignals.consistentFrames,
        });
      }
    }

    // 3D Face Detector (In-house) / Provider: MUST verify Liveness Nonce (P2 Binding)
    if (session.liveness_nonce) {
      if (!payload.livenessNonce || payload.livenessNonce !== session.liveness_nonce) {
        console.error('[Biometrics] Blocked: Liveness nonce mismatch');
        await logSessionEvent({ pnHash, result: 'BLOCKED', reasonCode: 'NONCE_MISMATCH', ipAddress, userAgent });
        throw createErrorWithCode('LIVENESS_FAIL', 'Liveness challenge expired or invalid', 403);
      }
    }

    // Liveness is pass/fail only - the actual verification happens in BiometricService.verify()
    // Client-side signals are for logging only; we don't reject based on them
    // The biometric service will verify a face is present in the selfie
    const clientSignals = payload.livenessData?.passiveSignals;

    if (clientSignals?.naturalBlinkDetected === false) {
      console.warn('[Liveness] Client reported: Blink NOT detected - proceeding to biometric verification');
    }

    // Face match (includes liveness verification via BiometricService)

    let faceScore = 0;
    if (settings.faceMatch.provider === 'provider') {
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

      console.log(`[Liveness] Session: ${payload.enrollmentSessionId}`);
      console.log(`[Liveness] Keys in body: ${Object.keys(payload).join(', ')}`);
      console.log(`[Liveness] Selfie length: ${payload.selfieBase64?.length ?? 0}`);
      
      const docPortraitSource = payload.docPortraitBase64 || (req.headers['x-doc-portrait-base64'] as string);
      console.log(`[Liveness] Doc portrait source: ${payload.docPortraitBase64 ? 'body' : 'header'}`);
      console.log(`[Liveness] Doc portrait length: ${docPortraitSource?.length ?? 0}`);

      const docPortrait = typeof docPortraitSource === 'string' ? decodeBase64Image(docPortraitSource) : null;
      if (!docPortrait) {
        console.error('[Liveness] No doc portrait decoded');
        throw createErrorWithCode('FACE_MATCH_FAIL', 'Document portrait is required for in-house face match', 400);
      }

      // Backend as source of truth: Verify against session hash
      const providedHash = crypto.createHash('sha256').update(docPortrait).digest('hex');
      const expectedHash = session.document_portrait_hash || session.nfc_portrait_hash;

      if (!expectedHash || providedHash !== expectedHash) {
        console.error('[Liveness] Portrait hash mismatch or missing');
        throw createErrorWithCode('FACE_MATCH_FAIL', 'Session portrait verification failed', 403);
      }

      const docQuality = basicImageQualityScore(docPortrait);
      if (docQuality < 0.05) {
        throw createErrorWithCode('FACE_MATCH_FAIL', 'Document portrait quality too low', 400);
      }

      // 1. Perform Real Biometric Verification (with Three-Tier Logic and IP Throttling)
      const bioResult = await BiometricService.verify(ipAddress, selfie, docPortrait);
      
      faceScore = bioResult.score;

      if (!bioResult.allowed) {
        // Record event
        await logSessionEvent({
          pnHash,
          result: bioResult.isRetryable ? 'FAIL' : 'BLOCKED',
          reasonCode: bioResult.isRetryable ? 'FACE_MATCH_RETRY' : 'FACE_MATCH_FAIL',
          faceScore,
          ipAddress,
          userAgent
        });

        // Record this FAILURE in the rate limiter (only failures count!)
        await AuthRateLimiter.recordFailure('biometric', {
          ip: ipAddress,
          pnHash,
          deviceId: session.device_id,
        }, bioResult.isRetryable ? 'FACE_MATCH_RETRY' : 'FACE_MATCH_FAIL');

        // Specific error for UI to handle retries
        throw createErrorWithCode(
          bioResult.isRetryable ? 'FACE_MATCH_RETRY' : 'FACE_MATCH_FAIL',
          bioResult.message || 'Face match verification failed',
          bioResult.isRetryable ? 401 : 403
        );
      }

      console.log(`[FaceMatch] Pass! Score: ${faceScore.toFixed(3)} for IP: ${ipAddress}`);

      // Clear biometric rate limits on successful verification (best practice)
      await AuthRateLimiter.resetOnSuccess('biometric', {
        ip: ipAddress,
        pnHash,
        deviceId: session.device_id,
      });
    }

    // Upsert user (no raw personal number stored)
    const userResult = await pool.query('SELECT id, credential_birth_year, credential_gender, credential_region_codes FROM users WHERE pn_hash = $1', [pnHash]);
    let userId: string;
    let isNew = false;

    if (userResult.rows.length === 0) {
      const dob = session?.nfc_payload?.dob ? String(session.nfc_payload.dob) : '';
      const birthYear = dob.length >= 4 ? Number(dob.substring(0, 4)) : null;
      // Parse full DOB for exact age calculation (formats: YYYYMMDD, YYYY-MM-DD, DD-MM-YYYY)
      // IMPORTANT: Use Date.UTC to avoid timezone shifts when storing in PostgreSQL
      let dobDate: Date | null = null;
      if (dob) {
        const cleaned = dob.replace(/[-\/]/g, '');
        if (cleaned.length >= 8) {
          // Try YYYYMMDD format first
          const year = parseInt(cleaned.substring(0, 4));
          const month = parseInt(cleaned.substring(4, 6)) - 1;
          const day = parseInt(cleaned.substring(6, 8));
          if (year > 1900 && month >= 0 && month < 12 && day >= 1 && day <= 31) {
            // Use Date.UTC to create date in UTC timezone (prevents timezone shift)
            dobDate = new Date(Date.UTC(year, month, day));
          }
        }
      }
      const firstName = session?.nfc_payload?.firstName || null;
      const lastName = session?.nfc_payload?.lastName || null;
      const gender = session?.nfc_payload?.gender || 'M';
      const pnDigits = session?.nfc_payload?.personalNumber || (session as any)?.document_payload?.personalNumber || '';
      const pnMasked = pnDigits.length >= 8 
        ? `${pnDigits.substring(0, 4)}*****${pnDigits.substring(pnDigits.length - 4)}`
        : pnDigits;

      const regionCode = session?.nfc_payload?.regionCode;
      // Ensure at least one region is set (default to reg_tbilisi if missing)
      const regionCodes = regionCode ? [regionCode] : ['reg_tbilisi'];

      const insert = await pool.query(
        `INSERT INTO users (pn_hash, credential_gender, credential_birth_year, credential_dob, credential_region_codes, first_name, last_name, pn_masked, created_at, last_login_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
         RETURNING id`,
        [pnHash, gender, birthYear, dobDate, regionCodes, firstName, lastName, pnMasked]
      );
      userId = insert.rows[0].id;
      isNew = true;
    } else {
      userId = userResult.rows[0].id;
      const existingUser = userResult.rows[0];

      // Backfill missing demographic data for existing users
      const pnDigits = session?.nfc_payload?.personalNumber || (session as any)?.document_payload?.personalNumber || '';
      const pnMasked = pnDigits.length >= 8
        ? `${pnDigits.substring(0, 4)}*****${pnDigits.substring(pnDigits.length - 4)}`
        : null;

      // Get demographic data from session
      const newGender = session?.nfc_payload?.gender || null;
      const dob = session?.nfc_payload?.dob ? String(session.nfc_payload.dob) : '';
      const newBirthYear = dob.length >= 4 ? Number(dob.substring(0, 4)) : null;
      const regionCode = session?.nfc_payload?.regionCode;
      // Only use session region if present; don't default for existing users
      const newRegionCodes = regionCode ? [regionCode] : null;

      // Build dynamic update query to backfill missing fields
      const updates: string[] = ['last_login_at = NOW()'];
      const values: any[] = [];
      let paramIndex = 1;

      if (pnMasked && !existingUser.pn_masked) {
        updates.push(`pn_masked = $${paramIndex++}`);
        values.push(pnMasked);
      }
      if (newGender && !existingUser.credential_gender) {
        updates.push(`credential_gender = $${paramIndex++}`);
        values.push(newGender);
      }
      if (newBirthYear && !existingUser.credential_birth_year) {
        updates.push(`credential_birth_year = $${paramIndex++}`);
        values.push(newBirthYear);
      }
      // Only backfill regions if we have NEW data from session (not default)
      if (newRegionCodes && newRegionCodes.length > 0 && (!existingUser.credential_region_codes || existingUser.credential_region_codes.length === 0)) {
        updates.push(`credential_region_codes = $${paramIndex++}`);
        values.push(newRegionCodes);
      }

      values.push(userId);
      await pool.query(
        `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
        values
      );

      // CRITICAL FIX: Re-fetch user data after backfill to get CURRENT values
      // This ensures JWT uses up-to-date demographics, not stale cached data
      const refreshedUserResult = await pool.query(
        'SELECT id, credential_birth_year, credential_gender, credential_region_codes, credential_dob FROM users WHERE id = $1',
        [userId]
      );
      if (refreshedUserResult.rows.length > 0) {
        // Update userResult to use fresh data for JWT issuance below
        userResult.rows[0] = refreshedUserResult.rows[0];
      }
    }

    // Clear rate limits on success
    await clearRateLimit(pnHash, ipAddress);

    // Calculate dynamic age bucket
    const dobRaw = session?.nfc_payload?.dob;
    let ageBucket: DemographicData['age_bucket'] = '25-34'; // Default
    if (dobRaw) {
      const birthDate = parseDate(String(dobRaw));
      if (birthDate) {
        const today = new Date();
        let age = today.getFullYear() - birthDate.getFullYear();
        const m = today.getMonth() - birthDate.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
          age--;
        }
        
        if (age < 25) ageBucket = '18-24';
        else if (age < 35) ageBucket = '25-34';
        else if (age < 45) ageBucket = '35-44';
        else if (age < 55) ageBucket = '45-54';
        else if (age < 65) ageBucket = '55-64';
        else ageBucket = '65+';
      }
    }

    const regionCode = session?.nfc_payload?.regionCode;
    // Determine region_codes: prioritize existing DB data, then NFC payload, then default (only for new users)
    let userRegionCodes: string[];
    const existingDbRegions = userResult?.rows[0]?.credential_region_codes;

    if (existingDbRegions && existingDbRegions.length > 0) {
      // Use current DB value (refreshed after backfill for existing users)
      userRegionCodes = existingDbRegions;
    } else if (regionCode) {
      // Use NFC payload region (new user or session has explicit region)
      userRegionCodes = [regionCode];
    } else if (isNew) {
      // Only default for NEW users
      userRegionCodes = ['reg_tbilisi'];
    } else {
      // Existing user with no region data - this indicates incomplete migration
      // Log warning and use safe default, but this should be rare
      console.warn(`[Enrollment] Existing user ${userId} has no region data. Using default.`);
      userRegionCodes = ['reg_tbilisi'];
    }
    
    // Determine gender: prioritize DB for existing users, session for new users
    let genderForJwt: 'M' | 'F' | 'O' = 'M';
    if (!isNew && userResult.rows[0]?.credential_gender) {
      // Existing user: use DB value
      genderForJwt = userResult.rows[0].credential_gender as 'M' | 'F' | 'O';
    } else if (session?.nfc_payload?.gender) {
      // New user or backfill: use session value
      genderForJwt = session.nfc_payload.gender === 'F' ? 'F' : 'M';
    }

    const demographics: DemographicData = {
      age_bucket: ageBucket,
      gender: genderForJwt,
      region: userRegionCodes[0] || 'reg_tbilisi',
      region_codes: userRegionCodes,
      citizenship: 'GEO',
    };


    const credentialToken = issueCredentialForSubject(userId, demographics, 7 * 24 * 60 * 60);


    await pool.query(
      `UPDATE enrollment_sessions SET step = 3, status = 'completed', updated_at = NOW() WHERE id = $1`,
      [payload.enrollmentSessionId]
    );

    // Trigger reward minting if enabled (Phase 0)
    try {
      // In a real app, we would get the user's wallet address from the session/deviceKey
      // For Phase 0, we'll log it and simulate.
      await BlockchainService.mintReward('0xWALLET_PLACEHOLDER', 1);
    } catch (bcError) {
      console.error('[Blockchain] Reward minting failed (non-blocking):', bcError);
    }

    await logSessionEvent({ pnHash, result: 'PASS', reasonCode: isNew ? 'ENROLL_OK' : 'LOGIN_OK', faceScore, ipAddress, userAgent });

    // Reset ALL rate limits on successful enrollment/login (best practice)
    // This ensures users who successfully authenticate get a fresh start
    const rateLimitType = isNew ? 'enrollment' : 'login';
    await AuthRateLimiter.resetOnSuccess(rateLimitType, {
      ip: ipAddress,
      pnHash,
      deviceId: session.device_id,
      userId,
    });
    console.log(`[RateLimit] Reset ${rateLimitType} rate limits for successful auth (IP: ${ipAddress})`);

    const userRow = userResult.rows[0];
    const finalGender = userRow ? userRow.credential_gender : demographics.gender;
    const finalRegionCodes = userRow ? userRow.credential_region_codes : demographics.region_codes;

    return res.json({
      credentialToken,
      userId,
      isNewUser: isNew,
      demographics: {
        gender: finalGender,
        age_bucket: ageBucket,
        birth_year: userRow?.credential_birth_year || null,
        birth_date: userRow?.credential_dob ? userRow.credential_dob.toISOString().split('T')[0] : null,
        region: userRegionCodes[0] || 'reg_tbilisi', // Match JWT's region value
        region_codes: finalRegionCodes,
        citizenship: 'GEO',
        first_name: userRow?.first_name || null,
        last_name: userRow?.last_name || null
      }


    });
  } catch (error) {
    return next(error);
  }
});

export default router;
