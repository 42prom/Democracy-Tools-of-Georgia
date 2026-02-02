import { Router, Request, Response, NextFunction } from 'express';
import { requireAdmin } from '../../middleware/auth';
import { pool } from '../../db/client';

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
      const filename = `dtfg-users-export-${new Date().toISOString().split('T')[0]}.csv`;

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
      const filename = `dtfg-security-events-${new Date().toISOString().split('T')[0]}.csv`;

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

export default router;
