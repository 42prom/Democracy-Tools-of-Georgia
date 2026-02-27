import { Router, Request, Response, NextFunction } from 'express';
import { requireAdmin } from '../../middleware/auth';
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
function formatArray(arr: any[]): string {
  if (!arr || arr.length === 0) return '';
  return arr.join(';'); // Use semicolon to avoid CSV parsing issues
}

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
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      console.log('📊 Exporting users to CSV...');

      // Query all users with relevant fields
      const result = await pool.query(
        `SELECT
          id as user_id,
          pn_hash,
          credential_gender as gender,
          credential_birth_year as birth_year,
          credential_region_codes as region_codes,
          trust_score,
          created_at,
          last_login_at
         FROM users
         ORDER BY created_at DESC`
      );

      // Build CSV content
      const headers = [
        'user_id',
        'pn_hash',
        'gender',
        'birth_year',
        'region_codes',
        'trust_score',
        'created_at',
        'last_login_at',
      ];

      let csvContent = headers.join(',') + '\n';

      // Add data rows
      for (const row of result.rows) {
        const values = [
          escapeCsvField(row.user_id),
          escapeCsvField(row.pn_hash),
          escapeCsvField(row.gender),
          escapeCsvField(row.birth_year),
          escapeCsvField(formatArray(row.region_codes)),
          escapeCsvField(row.trust_score),
          escapeCsvField(row.created_at?.toISOString()),
          escapeCsvField(row.last_login_at?.toISOString()),
        ];

        csvContent += values.join(',') + '\n';
      }

      // Set response headers for CSV download
      const filename = `DTG-users-export-${new Date().toISOString().split('T')[0]}.csv`;

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Cache-Control', 'no-cache');

      // Send CSV content
      res.send(csvContent);

      console.log(`✓ Exported ${result.rows.length} users to CSV`);
    } catch (error) {
      console.error('Failed to export users:', error);
      next(error);
    }
  }
);

/**
 * GET /api/v1/admin/export/security-events.csv
 * Export security events to CSV (bonus feature)
 */
router.get(
  '/security-events.csv',
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
 * - includeVoteLevelData: boolean (default: true)
 * - anonymizeVoters: boolean (default: false)
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
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const pollId = req.params.pollId as string;
      const {
        includeVoteLevelData = 'true',
        anonymizeVoters = 'false',
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
            default: true,
            description: 'Include individual vote records with anonymized demographics',
          },
          anonymizeVoters: {
            default: false,
            description: 'Replace vote IDs with sequential numbers (VOTE-000001)',
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
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const pollId = req.params.pollId as string;
      const {
        includeVoteLevelData = 'true',
        anonymizeVoters = 'false',
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

