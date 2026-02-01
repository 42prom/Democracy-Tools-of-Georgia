import { Router, Request, Response, NextFunction } from 'express';
import NonceService from '../services/nonce';
import { enrollDevice } from '../services/credentials';
import { EnrollmentRequest, ChallengeResponse } from '../types/credentials';
import { createError } from '../middleware/errorHandler';
import { loginOrEnroll, verifySessionAttestation } from '../services/identity';

const router = Router();

/**
 * POST /api/v1/auth/challenge
 * Get authentication nonce
 */
router.post(
  '/challenge',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { deviceId } = req.body;

      if (!deviceId) {
        throw createError('deviceId is required', 400);
      }

      // Generate nonce with 60s TTL
      const nonce = await NonceService.generateNonce('challenge');

      const response: ChallengeResponse = {
        nonce,
        ttl: 60,
      };

      res.json(response);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/v1/auth/enroll
 * Submit enrollment proof and receive credential
 * Phase 0: Mock implementation
 */
router.post(
  '/enroll',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { proof, deviceKey }: EnrollmentRequest = req.body;

      if (!proof || !deviceKey) {
        throw createError('proof and deviceKey are required', 400);
      }

      // Phase 0: Skip actual verification
      // Phase 1: Verify NFC + Liveness proof here

      // Enroll device and issue credential
      const credential = await enrollDevice(deviceKey);

      res.json({ credential });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/v1/auth/login-or-enroll
 * Privacy-safe identity login with auto-enrollment
 * NO PII storage - uses HMAC hashing
 */
router.post(
  '/login-or-enroll',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const {
        pnDigits,
        liveness,
        faceMatch,
        gender,
        birthYear,
        regionCodes,
      } = req.body;

      if (!pnDigits) {
        throw createError('pnDigits is required', 400);
      }

      // Extract IP and user agent for security logging
      const ipAddress = (req.ip || req.connection.remoteAddress || 'unknown').replace('::ffff:', '');
      const userAgent = req.headers['user-agent'] || 'unknown';

      // Call identity service
      const result = await loginOrEnroll({
        pnDigits,
        liveness,
        faceMatch,
        gender,
        birthYear,
        regionCodes,
        ipAddress,
        userAgent,
      });

      res.json(result);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/v1/auth/session/verify
 * Verify a session attestation JWT
 */
router.post(
  '/session/verify',
  async (req: Request, res: Response, next: NextFunction) => {
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
  }
);

export default router;
