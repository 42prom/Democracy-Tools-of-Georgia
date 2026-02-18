// =============================================================================
// ADMIN GEO-BLOCKING ROUTES
// Manage country blocks, IP blocks, and whitelist
// =============================================================================

import { Router, Request, Response, NextFunction } from 'express';
import { requireAdmin } from '../../middleware/auth';
import { GeoBlockingService } from '../../services/geoBlocking';

const router = Router();

router.use(requireAdmin);

// ============================================================================
// SETTINGS
// ============================================================================

router.get('/settings', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const settings = await GeoBlockingService.getSettings();
    res.json(settings);
  } catch (err) {
    next(err);
  }
});

router.patch('/settings', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const updates = req.body;
    for (const [key, value] of Object.entries(updates)) {
      await GeoBlockingService.updateSetting(key, value as string);
    }
    await GeoBlockingService.clearCache();
    const settings = await GeoBlockingService.getSettings();
    res.json(settings);
  } catch (err) {
    next(err);
  }
});

// ============================================================================
// COUNTRIES
// ============================================================================

router.get('/countries', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const countries = await GeoBlockingService.getBlockedCountries();
    res.json(countries);
  } catch (err) {
    next(err);
  }
});

router.post('/countries', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { country_code, country_name, reason } = req.body;

    if (!country_code || !country_name) {
      res.status(400).json({ error: 'country_code and country_name required' });
      return;
    }

    await GeoBlockingService.blockCountry(
      country_code,
      country_name,
      reason || 'Blocked by admin',
      req.adminUser!.id
    );

    res.json({ success: true, message: `${country_name} blocked` });
    return;
  } catch (err) {
    next(err);
  }
});

router.delete('/countries/:code', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await GeoBlockingService.deleteCountry(req.params.code as string);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// ============================================================================
// BLOCKED IPs
// ============================================================================

router.get('/blocked-ips', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const ips = await GeoBlockingService.getBlockedIPs();
    res.json(ips);
  } catch (err) {
    next(err);
  }
});

router.post('/blocked-ips', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { ip_address, reason, expires_at } = req.body;

    if (!ip_address) {
      res.status(400).json({ error: 'ip_address required' });
      return;
    }

    await GeoBlockingService.blockIP(
      ip_address,
      reason || 'Blocked by admin',
      req.adminUser!.id,
      expires_at ? new Date(expires_at) : undefined
    );

    res.json({ success: true, message: `${ip_address} blocked` });
    return;
  } catch (err) {
    next(err);
  }
});

router.delete('/blocked-ips/:ip', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await GeoBlockingService.unblockIP(decodeURIComponent(req.params.ip as string));
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// ============================================================================
// WHITELIST
// ============================================================================

router.get('/whitelist', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const ips = await GeoBlockingService.getWhitelistedIPs();
    res.json(ips);
  } catch (err) {
    next(err);
  }
});

router.post('/whitelist', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { ip_address, description } = req.body;

    if (!ip_address) {
      res.status(400).json({ error: 'ip_address required' });
      return;
    }

    await GeoBlockingService.whitelistIP(
      ip_address,
      description || '',
      req.adminUser!.id
    );

    res.json({ success: true, message: `${ip_address} whitelisted` });
    return;
  } catch (err) {
    next(err);
  }
});

router.delete('/whitelist/:ip', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await GeoBlockingService.removeWhitelistIP(decodeURIComponent(req.params.ip as string));
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// ============================================================================
// LOGS & STATS
// ============================================================================

router.get('/logs', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const limit = parseInt(req.query.limit as string) || 100;
    const offset = parseInt(req.query.offset as string) || 0;
    const logs = await GeoBlockingService.getBlockedAccessLog(limit, offset);
    res.json(logs);
  } catch (err) {
    next(err);
  }
});

router.get('/stats', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const stats = await GeoBlockingService.getBlockedStats();
    res.json(stats);
  } catch (err) {
    next(err);
  }
});

// ============================================================================
// TEST IP
// ============================================================================

router.post('/test', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { ip_address } = req.body;

    if (!ip_address) {
      res.status(400).json({ error: 'ip_address required' });
      return;
    }

    const geoInfo = await GeoBlockingService.lookupIP(ip_address);
    const blockResult = await GeoBlockingService.checkIP(ip_address);

    res.json({
      ip: ip_address,
      geo: geoInfo,
      block_status: blockResult
    });
  } catch (err) {
    next(err);
  }
});

export default router;
