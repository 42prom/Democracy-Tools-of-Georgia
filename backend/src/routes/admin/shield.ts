import { Router, Request, Response, NextFunction } from 'express';
import { requireAdmin } from '../../middleware/auth';
import redisClient from '../../db/redis';
import { AuthRateLimiter } from '../../services/authRateLimit';

const router = Router();
router.use(requireAdmin);

/**
 * GET /api/v1/admin/shield/status
 * Get overall shield status: blocked IPs, risk scores, and AutoManager heartbeat.
 */
router.get('/status', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    // Shield-blocked IPs (from dtg-shield-service writing to Redis)
    const blockKeys = await redisClient.keys('shield:block:*');
    const blocked: Record<string, { reason: string; expiresInSec: number }> = {};

    for (const key of blockKeys) {
      const ip = key.split(':').pop()!;
      const reason = await redisClient.get(key);
      const ttl = await redisClient.ttl(key);
      blocked[ip] = { reason: reason || 'Unknown', expiresInSec: ttl };
    }

    // Top risk-scored IPs
    const riskKeys = await redisClient.keys('shield:risk:*');
    const riskScores: { ip: string; score: number }[] = [];

    for (const key of riskKeys) {
      const ip = key.split(':').pop()!;
      const score = await redisClient.get(key);
      if (score) riskScores.push({ ip, score: parseInt(score, 10) });
    }
    riskScores.sort((a, b) => b.score - a.score);

    // Standard backend rate-limit failures (all types)
    const rateLimitKeys = await redisClient.keys('rl:*:ip:*');
    const backendRateLimits: { key: string; count: number }[] = [];
    for (const key of rateLimitKeys) {
      const count = await redisClient.zCard(key);
      if (count > 0) backendRateLimits.push({ key, count });
    }
    backendRateLimits.sort((a, b) => b.count - a.count);

    res.json({
      active_blocks: blockKeys.length,
      blocked_ips: blocked,
      risk_scores: riskScores.slice(0, 20),
      backend_rate_limit_hotspots: backendRateLimits.slice(0, 20),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return next(error);
  }
});

/**
 * GET /api/v1/admin/shield/logs/:ip
 * Get Shield event log for a specific IP.
 */
router.get('/logs/:ip', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { ip } = req.params;
    const logKey = `shield:logs:${ip}`;
    const logs = await redisClient.lRange(logKey, 0, 49);
    const parsed = logs.map((entry: string) => {
      try { return JSON.parse(entry); } catch { return { raw: entry }; }
    });

    const riskScore = await redisClient.get(`shield:risk:${ip}`) ?? '0';
    const blockReason = await redisClient.get(`shield:block:${ip}`);

    res.json({
      ip,
      riskScore: parseInt(riskScore, 10),
      isBlocked: !!blockReason,
      blockReason: blockReason ?? null,
      events: parsed,
    });
  } catch (error) {
    return next(error);
  }
});

/**
 * DELETE /api/v1/admin/shield/block/:ip
 * Manually unblock an IP by clearing all Shield and Backend rate limit keys.
 */
router.delete('/block/:ip', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const ip = String(req.params.ip);

    // Clear Shield keys
    await redisClient.del(`shield:block:${ip}`);
    await redisClient.del(`shield:risk:${ip}`);
    await redisClient.del(`shield:logs:${ip}`);

    // Clear backend rate limit keys for this IP
    await AuthRateLimiter.adminClearIP(ip);

    const reqAny = (req as unknown) as Record<string, Record<string, string>>;
    const adminSub = reqAny?.['admin']?.['sub'] ?? 'unknown';
    console.log(`[Shield Admin] Manually unblocked IP: ${ip} by admin ${adminSub}`);
    return res.json({ success: true, message: `IP ${ip} has been fully unblocked.` });
  } catch (error) {
    return next(error);
  }
});

/**
 * POST /api/v1/admin/shield/block
 * Manually block an IP with reason and optional duration.
 */
router.post('/block', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { ip, reason, durationSec = 3600 } = req.body as { ip: string; reason: string; durationSec?: number };
    const duration = typeof durationSec === 'number' ? durationSec : Number(durationSec) || 3600;
    if (!ip || !reason) {
      return res.status(400).json({ error: 'ip and reason required' });
    }
    const blockKey = `shield:block:${ip}`;
    await redisClient.setEx(blockKey, duration, reason);
    console.log(`[Shield Admin] Manually blocked IP: ${ip} (${reason}) for ${duration}s`);
    return res.json({ success: true, message: `IP ${ip} blocked for ${duration}s.` });
  } catch (error) {
    return next(error);
  }
});

export default router;
