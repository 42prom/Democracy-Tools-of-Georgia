import { Router, Request, Response, NextFunction } from 'express';
import { getVerificationSettingsPublic } from '../services/verificationSettings';

const router = Router();

/**
 * GET /api/v1/settings/verification
 * Public endpoint for mobile app to fetch verification policy
 */
router.get('/verification', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const settings = await getVerificationSettingsPublic();
    res.json(settings);
  } catch (error) {
    next(error);
  }
});

export default router;
