import crypto from 'crypto';
import { Router, Request, Response, NextFunction } from 'express';
import { pool, transaction } from '../../db/client';
import { requireAdmin, requireAdminRole } from '../../middleware/auth';

const router = Router();
router.use(requireAdmin);
router.use(requireAdminRole('superadmin', 'observer'));

function parsePayload(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return { malformed: true };
  }
}

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const requestedLimit = Number.parseInt(String(req.query.limit || '50'), 10);
    const requestedOffset = Number.parseInt(String(req.query.offset || '0'), 10);
    const limit = Number.isInteger(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 100) : 50;
    const offset = Number.isInteger(requestedOffset) ? Math.min(Math.max(requestedOffset, 0), 100_000) : 0;

    const [entries, count] = await Promise.all([
      pool.query(
        `SELECT id, event_type AS "eventType", payload, previous_hash AS "previousHash",
                row_hash AS "rowHash", created_at AS "createdAt"
           FROM audit_log
          WHERE event_type LIKE 'ADMIN_%'
          ORDER BY id DESC
          LIMIT $1 OFFSET $2`,
        [limit, offset]
      ),
      pool.query(`SELECT COUNT(*)::int AS count FROM audit_log WHERE event_type LIKE 'ADMIN_%'`),
    ]);

    res.setHeader('Cache-Control', 'no-store');
    res.json({
      entries: entries.rows.map(row => ({
        ...row,
        payload: parsePayload(row.payload),
      })),
      total: count.rows[0].count,
      limit,
      offset,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/verify', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    let previousHash = '0'.repeat(64);
    let brokenAt: number | null = null;
    let entries = 0;
    let cursor = 0;

    await transaction(async client => {
      await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
      while (brokenAt === null) {
        const page = await client.query(
          `SELECT id, event_type, payload, previous_hash, row_hash, created_at
             FROM audit_log WHERE id > $1 ORDER BY id LIMIT 5000`,
          [cursor]
        );
        if (page.rows.length === 0) break;

        for (const row of page.rows) {
          const expected = crypto
            .createHash('sha256')
            .update(`${row.event_type}|${row.payload}|${previousHash}|${row.created_at}`)
            .digest('hex');
          entries += 1;
          cursor = Number(row.id);
          if (row.previous_hash !== previousHash || row.row_hash !== expected) {
            brokenAt = cursor;
            break;
          }
          previousHash = row.row_hash;
        }
      }
    });

    res.setHeader('Cache-Control', 'no-store');
    res.json({
      valid: brokenAt === null,
      entries,
      brokenAt,
      headHash: previousHash,
      verifiedAt: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
});

export default router;
