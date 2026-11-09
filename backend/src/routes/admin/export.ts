import { Router, Request, Response, NextFunction } from 'express';
import { requireAdmin, requireAdminRole } from '../../middleware/auth';
import { pool } from '../../db/client';
import { AuditExportService } from '../../services/auditExport';

const router = Router();

// All export routes require admin authentication
router.use(requireAdmin);

/**
 * Helper function to escape CSV fields
 */
function escapeCsvField(field: any): string {
  if (field === null || field === undefined) {
    return '';
  }

  const stringValue = String(field);

  // If field contains comma, newline, or quotes, wrap in quotes and escape quotes
  if (stringValue.includes(',') || stringValue.includes('\n') || stringValue.includes('"')) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }

  return stringValue;
}

/**
 * Helper function to format array as comma-separated string
 */
/**
 * GET /api/v1/admin/export/users-aggregated.csv
 * Export a k-anonymous demographic distribution with no row-level identifiers.
 */
router.get(
  '/users-aggregated.csv',
  requireAdminRole('superadmin', 'observer'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const minimumK = Number.parseInt(process.env.MIN_K_ANONYMITY || '30', 10);
      if (!Number.isInteger(minimumK) || minimumK < 1) {
        throw new Error('MIN_K_ANONYMITY is invalid');
      }

      const result = await pool.query(
        `SELECT
           CASE
             WHEN credential_birth_year IS NULL THEN 'Unknown'
             WHEN EXTRACT(YEAR FROM CURRENT_DATE)::int - credential_birth_year BETWEEN 18 AND 24 THEN '18-24'
             WHEN EXTRACT(YEAR FROM CURRENT_DATE)::int - credential_birth_year BETWEEN 25 AND 34 THEN '25-34'
             WHEN EXTRACT(YEAR FROM CURRENT_DATE)::int - credential_birth_year BETWEEN 35 AND 44 THEN '35-44'
             WHEN EXTRACT(YEAR FROM CURRENT_DATE)::int - credential_birth_year BETWEEN 45 AND 54 THEN '45-54'
             WHEN EXTRACT(YEAR FROM CURRENT_DATE)::int - credential_birth_year BETWEEN 55 AND 64 THEN '55-64'
             WHEN EXTRACT(YEAR FROM CURRENT_DATE)::int - credential_birth_year >= 65 THEN '65+'
             ELSE 'Unknown'
           END AS age_bucket,
           COALESCE(NULLIF(credential_gender, ''), 'Unknown') AS gender_bucket,
           COALESCE(credential_region_codes[1], 'Unknown') AS region_bucket,
           COUNT(*)::int AS user_count
         FROM users
         GROUP BY age_bucket, gender_bucket, region_bucket
         HAVING COUNT(*) >= $1
         ORDER BY age_bucket, gender_bucket, region_bucket`,
        [minimumK]
      );

      let csvContent = 'age_bucket,gender_bucket,region_bucket,user_count\n';
      for (const row of result.rows) {
        csvContent += [
          escapeCsvField(row.age_bucket),
          escapeCsvField(row.gender_bucket),
          escapeCsvField(row.region_bucket),
          escapeCsvField(row.user_count),
        ].join(',') + '\n';
      }

      // Fail closed: the export is not released if its audit write fails.
      await pool.query(
        `INSERT INTO security_events
         (event_type, result, user_id, ip_address, user_agent, meta, created_at)
         VALUES ('audit_export', 'success', NULL, $1, $2, $3, NOW())`,
        [
          req.ip || null,
          req.get('user-agent') || null,
          JSON.stringify({
            exportType: 'users_aggregated',
            adminUserId: req.adminUser!.id,
            adminEmail: req.adminUser!.email,
            minimumK,
            releasedBuckets: result.rows.length,
          }),
        ]
      );

      const filename = `DTG-users-aggregated-${new Date().toISOString().split('T')[0]}.csv`;
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Cache-Control', 'no-store, max-age=0');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('X-Privacy-Threshold', String(minimumK));
      res.send(csvContent);
    } catch (error) {
      console.error('Failed to export aggregated users:', error);
      next(error);
    }
  }
);

/**
 * GET /api/v1/admin/export/users.csv
 * Export users to CSV file
 *
 * Security:
 * - Protected by admin authentication
 * - NO raw personal numbers exported (only pn_hash)
 * - Includes only demographic and metadata
 */
router.get(
  '/users.csv',
  requireAdminRole('superadmin'),
  (_req: Request, res: Response) => {
    res.status(410).json({
      error: 'Row-level profile export is disabled. Use /users-aggregated.csv.',
    });
  }
);

/**
 * GET /api/v1/admin/export/security-events.csv
 * Export security events to CSV (bonus feature)
 */
router.get(
  '/security-events.csv',
  requireAdminRole('superadmin'),
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      console.log('📊 Exporting security events to CSV...');

      // Query security events
      const result = await pool.query(
        `SELECT
          id,
          event_type,
          result,
          pn_hash,
          liveness_score,
          face_match_score,
          reason_code,
          ip_address::text as ip_address,
          created_at
         FROM security_events
         ORDER BY created_at DESC
         LIMIT 10000` // Limit to prevent huge files
      );

      // Build CSV
      const headers = [
        'id',
        'event_type',
        'result',
        'pn_hash',
        'liveness_score',
        'face_match_score',
        'reason_code',
        'ip_address',
        'created_at',
      ];

      let csvContent = headers.join(',') + '\n';

      for (const row of result.rows) {
        const values = [
          escapeCsvField(row.id),
          escapeCsvField(row.event_type),
          escapeCsvField(row.result),
          escapeCsvField(row.pn_hash),
          escapeCsvField(row.liveness_score),
          escapeCsvField(row.face_match_score),
          escapeCsvField(row.reason_code),
          escapeCsvField(row.ip_address),
          escapeCsvField(row.created_at?.toISOString()),
        ];

        csvContent += values.join(',') + '\n';
      }

      // Set response headers
      const filename = `DTG-security-events-${new Date().toISOString().split('T')[0]}.csv`;

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Cache-Control', 'no-cache');

      res.send(csvContent);

      console.log(`✓ Exported ${result.rows.length} security events to CSV`);
    } catch (error) {
      console.error('Failed to export security events:', error);
      next(error);
    }
  }
);

/**
 * GET /api/v1/admin/export/polls/:pollId/audit.csv
 * Export audit data for a completed poll
 *
 * Query Parameters:
 * - includeVoteLevelData: must remain false to protect ballot secrecy
 * - anonymizeVoters: must remain true
 * - dateRangeStart: ISO date string (optional)
 * - dateRangeEnd: ISO date string (optional)
 *
 * Security:
 * - Protected by admin authentication
 * - Only ended/archived polls can be exported
 * - Every export is logged with user ID, timestamp, and poll ID
 * - Includes tamper-proof SHA-256 hash of dataset
 */
router.get(
  '/polls/:pollId/audit.csv',
  requireAdminRole('superadmin', 'observer'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const pollId = req.params.pollId as string;
      const {
        includeVoteLevelData = 'false',
        anonymizeVoters = 'true',
        dateRangeStart,
        dateRangeEnd,
      } = req.query;

      // Get admin user from authenticated request (set by requireAdmin middleware)
      const adminUser = req.adminUser;
      if (!adminUser || !adminUser.id) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      console.log(`📊 [Audit Export] Starting export for poll ${pollId} by ${adminUser.email}`);

      const exportService = new AuditExportService();

      const options = {
        pollId,
        includeVoteLevelData: includeVoteLevelData === 'true',
        anonymizeVoters: anonymizeVoters === 'true',
        dateRangeStart: dateRangeStart ? new Date(dateRangeStart as string) : undefined,
        dateRangeEnd: dateRangeEnd ? new Date(dateRangeEnd as string) : undefined,
        adminUserId: adminUser.id,
        adminEmail: adminUser.email,
      };

      // Generate export
      const { csvContent, manifest } = await exportService.generateExport(options);

      // Generate filename
      const pollTitle = manifest.poll.title
        .replace(/[^a-zA-Z0-9]/g, '_')
        .substring(0, 30);
      const date = new Date().toISOString().split('T')[0];
      const filename = `AUDIT_${pollTitle}_${date}_${manifest.exportId}.csv`;

      // Set response headers for CSV download
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('X-Export-Id', manifest.exportId);
      res.setHeader('X-Integrity-Hash', manifest.integrityHash);

      // Send CSV content
      res.send(csvContent);

      console.log(`✓ [Audit Export] Completed export ${manifest.exportId} for poll ${pollId}`);
      console.log(`  - Total votes: ${manifest.statistics.totalVotes}`);
      console.log(`  - Hash: ${manifest.integrityHash.substring(0, 16)}...`);
    } catch (error: any) {
      console.error('[Audit Export] Failed:', error.message);

      if (error.message.includes('not found')) {
        res.status(404).json({ error: error.message });
        return;
      }
      if (error.message.includes('Cannot export')) {
        res.status(400).json({ error: error.message });
        return;
      }

      next(error);
    }
  }
);

/**
 * GET /api/v1/admin/export/polls/:pollId/audit/preview
 * Preview audit export metadata without generating full CSV
 * Useful for showing confirmation modal with stats
 */
router.get(
  '/polls/:pollId/audit/preview',
  requireAdminRole('superadmin', 'observer'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const pollId = req.params.pollId as string;

      // Validate poll exists and is exportable
      const pollResult = await pool.query(
        `SELECT id, title, description, type, status, start_at, end_at, min_k_anonymity
         FROM polls WHERE id = $1`,
        [pollId]
      );

      if (pollResult.rows.length === 0) {
        res.status(404).json({ error: 'Poll not found' });
        return;
      }

      const poll = pollResult.rows[0];

      if (poll.status !== 'ended' && poll.status !== 'archived') {
        res.status(400).json({
          error: `Cannot export poll with status '${poll.status}'. Only ended or archived polls can be exported.`,
        });
        return;
      }

      // Get statistics
      const votesResult = await pool.query(
        `SELECT COUNT(*) as count FROM votes WHERE poll_id = $1`,
        [pollId]
      );
      const totalVotes = parseInt(votesResult.rows[0].count, 10);

      const participantsResult = await pool.query(
        `SELECT COUNT(*) as count FROM poll_participants WHERE poll_id = $1`,
        [pollId]
      );
      const totalParticipants = parseInt(participantsResult.rows[0].count, 10);

      const optionsResult = await pool.query(
        `SELECT COUNT(*) as count FROM poll_options WHERE poll_id = $1`,
        [pollId]
      );
      const optionsCount = parseInt(optionsResult.rows[0].count, 10);

      res.json({
        poll: {
          id: poll.id,
          title: poll.title,
          description: poll.description,
          type: poll.type,
          status: poll.status,
          startAt: poll.start_at,
          endAt: poll.end_at,
          kAnonymity: poll.min_k_anonymity,
        },
        statistics: {
          totalVotes,
          totalParticipants,
          optionsCount,
        },
        exportOptions: {
          includeVoteLevelData: {
            default: false,
            available: false,
            description: 'Disabled because timestamps and demographics can reveal ballot choices',
          },
          anonymizeVoters: {
            default: true,
            required: true,
            description: 'Voter identifiers are never included',
          },
          dateRange: {
            available: true,
            description: 'Filter votes by date range',
          },
        },
      });
    } catch (error) {
      console.error('[Audit Preview] Failed:', error);
      next(error);
    }
  }
);

/**
 * GET /api/v1/admin/export/polls/:pollId/audit-stream.csv
 * Streamed export for very large polls (memory efficient)
 */
router.get(
  '/polls/:pollId/audit-stream.csv',
  requireAdminRole('superadmin', 'observer'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const pollId = req.params.pollId as string;
      const {
        includeVoteLevelData = 'false',
        anonymizeVoters = 'true',
        dateRangeStart,
        dateRangeEnd,
      } = req.query;

      const adminUser = req.adminUser;
      if (!adminUser || !adminUser.id) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      console.log(`📊 [Audit Stream] Starting streamed export for poll ${pollId}`);

      const exportService = new AuditExportService();

      const options = {
        pollId,
        includeVoteLevelData: includeVoteLevelData === 'true',
        anonymizeVoters: anonymizeVoters === 'true',
        dateRangeStart: dateRangeStart ? new Date(dateRangeStart as string) : undefined,
        dateRangeEnd: dateRangeEnd ? new Date(dateRangeEnd as string) : undefined,
        adminUserId: adminUser.id,
        adminEmail: adminUser.email,
      };

      // Validate poll first
      await exportService.validatePoll(pollId);

      // Get poll title for filename
      const pollResult = await pool.query(`SELECT title FROM polls WHERE id = $1`, [pollId]);
      const pollTitle = pollResult.rows[0]?.title
        .replace(/[^a-zA-Z0-9]/g, '_')
        .substring(0, 30) || 'poll';

      const date = new Date().toISOString().split('T')[0];
      const filename = `AUDIT_STREAM_${pollTitle}_${date}.csv`;

      // Set headers for streaming response
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Transfer-Encoding', 'chunked');

      // Create and pipe stream
      const stream = await exportService.createExportStream(options);
      stream.pipe(res);

      stream.on('end', () => {
        console.log(`✓ [Audit Stream] Completed streamed export for poll ${pollId}`);
      });

      stream.on('error', (error) => {
        console.error('[Audit Stream] Stream error:', error);
        if (!res.headersSent) {
          res.status(500).json({ error: 'Export stream failed' });
        }
      });
    } catch (error: any) {
      console.error('[Audit Stream] Failed:', error.message);

      if (error.message.includes('not found')) {
        res.status(404).json({ error: error.message });
        return;
      }
      if (error.message.includes('Cannot export')) {
        res.status(400).json({ error: error.message });
        return;
      }

      next(error);
    }
  }
);

export default router;
