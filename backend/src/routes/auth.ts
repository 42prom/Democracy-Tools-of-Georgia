import { Router, Request, Response, NextFunction } from 'express';
import NonceService from '../services/nonce';
import { ChallengeResponse } from '../types/credentials';
import { createError } from '../middleware/errorHandler';
import { verifySessionAttestation } from '../services/identity';

const router = Router();

/**
 * POST /api/v1/auth/challenge
 * Get authentication nonce
 */
router.post('/challenge', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { deviceId, purpose } = req.body;

    const noncePurpose =
      typeof purpose === 'string' && purpose.trim().length > 0 ? purpose.trim() : 'challenge';

    // For voting we need a nonce with purpose 'vote' (used by NonceService.verifyAndConsume)
    const allowedPurposes = new Set(['challenge', 'vote']);
    if (!allowedPurposes.has(noncePurpose)) {
      throw createError('Invalid purpose', 400);
    }

    // deviceId is optional for now (kept for compatibility / future device binding)
    if (!deviceId && noncePurpose === 'challenge') {
      throw createError('deviceId is required', 400);
    }

    // Generate nonce with 60s TTL
    const purposeTyped = noncePurpose as 'challenge' | 'vote';
    const nonce = await NonceService.generateNonce(purposeTyped);

    const response: ChallengeResponse = {
      nonce,
      ttl: 60,
    };

    res.json(response);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/auth/session/verify
 * Verify a session attestation JWT
 */
router.post('/session/verify', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { sessionAttestation } = req.body;

    if (!sessionAttestation) {
      throw createError('sessionAttestation is required', 400);
    }

    // Verify the session token
    const decoded = verifySessionAttestation(sessionAttestation);

    res.json({
      valid: true,
      userId: decoded.userId,
      pnHash: decoded.pnHash,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
