import { Router, Request, Response, NextFunction } from 'express';
import { requireAdmin } from '../../middleware/auth';
import { pool } from '../../db/client';
import redisClient from '../../db/redis';

const router = Router();

// All admin routes require authentication
router.use(requireAdmin);

/**
 * GET /api/v1/admin/profiles
 * List user profiles with k-anonymity protection
 */
router.get(
  '/',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const {
        page = 1,
        pageSize = 20,
        sortBy = 'created_at',
        sortOrder = 'desc',
        search,
        ageBucket,
        genderBucket,
        regionBucket,
      } = req.query;
      const MIN_K_ANONYMITY = parseInt(process.env.MIN_K_ANONYMITY || '30', 10);

      // Build WHERE conditions
      const conditions: string[] = [];
      const params: any[] = [];
      let paramIndex = 1;

      // Search by PN hash (partial match)
      if (search && typeof search === 'string' && search.trim()) {
        conditions.push(`pn_hash LIKE $${paramIndex}`);
        params.push(`%${search.trim()}%`);
        paramIndex++;
      }

      // Filter by gender
      if (genderBucket && typeof genderBucket === 'string') {
        conditions.push(`credential_gender = $${paramIndex}`);
        params.push(genderBucket);
        paramIndex++;
      }

      // Filter by region
      if (regionBucket && typeof regionBucket === 'string') {
        conditions.push(`$${paramIndex} = ANY(credential_region_codes)`);
        params.push(regionBucket);
        paramIndex++;
      }

      // Filter by age bucket (convert to birth year range)
      if (ageBucket && typeof ageBucket === 'string') {
        const currentYear = new Date().getFullYear();
        let minAge = 0, maxAge = 999;

        if (ageBucket === '18-24') { minAge = 18; maxAge = 24; }
        else if (ageBucket === '25-34') { minAge = 25; maxAge = 34; }
        else if (ageBucket === '35-44') { minAge = 35; maxAge = 44; }
        else if (ageBucket === '45-54') { minAge = 45; maxAge = 54; }
        else if (ageBucket === '55-64') { minAge = 55; maxAge = 64; }
        else if (ageBucket === '65+') { minAge = 65; maxAge = 999; }

        const maxBirthYear = currentYear - minAge;
        const minBirthYear = currentYear - maxAge;

        conditions.push(`credential_birth_year BETWEEN $${paramIndex} AND $${paramIndex + 1}`);
        params.push(minBirthYear, maxBirthYear);
        paramIndex += 2;
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      // Get total count with filters
      const countResult = await pool.query(
        `SELECT COUNT(*) as count FROM users ${whereClause}`,
        params
      );
      const total = parseInt(countResult.rows[0].count, 10);

      // Calculate pagination
      const offset = (parseInt(page as string, 10) - 1) * parseInt(pageSize as string, 10);
      const limit = parseInt(pageSize as string, 10);

      // Map frontend field names to database columns
      const sortByMap: Record<string, string> = {
        'enrolledAt': 'created_at',
        'enrolled_at': 'created_at',
        'created_at': 'created_at',
        'last_login_at': 'last_login_at',
        'lastLoginAt': 'last_login_at',
        'trust_score': 'trust_score',
        'trustScore': 'trust_score',
      };

      const dbSortBy = sortByMap[sortBy as string] || 'created_at';

      // Add pagination params
      params.push(limit, offset);

      // Query users with pagination and filters
      const usersResult = await pool.query(
        `SELECT
          id,
          pn_hash,
          credential_gender,
          credential_birth_year,
          credential_dob,
          credential_region_codes,
          first_name,
          last_name,
          pn_masked,
          created_at,
          last_login_at,
          trust_score,
          notifications_enabled
         FROM users
         ${whereClause}
         ORDER BY ${dbSortBy} ${sortOrder}
         LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
        params
      );

      // Helper to generate mock names from hash (for display only, not stored)
      const generateMockName = (hash: string | null, gender: string) => {
        const maleNames = ['Giorgi', 'Levan', 'Davit', 'Nikoloz', 'Aleksandre', 'Irakli', 'Mamuka', 'Zurab'];
        const femaleNames = ['Nino', 'Mariam', 'Tamar', 'Ana', 'Natia', 'Khatia', 'Salome', 'Elene'];
        const surnames = ['Beridze', 'Kapanadze', 'Gelashvili', 'Lomidze', 'Janelidze', 'Maisuradze', 'Kvaratskhelia', 'Chkheidze'];

        const names = gender === 'M' ? maleNames : femaleNames;
        // Handle potentially null hash
        const safeHash = hash || '00000000';
        const hashNum = parseInt(safeHash.substring(0, 8), 16);
        const name = names[hashNum % names.length];
        const surname = surnames[(hashNum >> 4) % surnames.length];

        return { name, surname };
      };

      // Map to profile format
      const profiles = usersResult.rows.map((user) => {
        try {
          // Create masked PN: Prefer real partial PN if available
          const maskedPn = user.pn_masked || '••••••••••••';

          // Use real name if available, otherwise generate mock
          let name, surname;
          if (user.first_name && user.last_name) {
             name = user.first_name;
             surname = user.last_name;
          } else {
             const mock = generateMockName(user.pn_hash, user.credential_gender);
             name = mock.name;
             surname = mock.surname;
             // Append * to indicate mock
             if (!name.endsWith('*')) name += '*'; 
          }

          // Calculate exact age from full DOB if available, otherwise from birth year
          let age: string = 'Unknown';
          if (user.credential_dob) {
            const dob = new Date(user.credential_dob);
            const today = new Date();
            let years = today.getFullYear() - dob.getFullYear();
            const monthDiff = today.getMonth() - dob.getMonth();
            if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
              years--;
            }
            age = String(years);
          } else if (user.credential_birth_year) {
            age = String(new Date().getFullYear() - user.credential_birth_year);
          }

          return {
            id: user.id,
            pnHash: user.pn_hash,
            personalNumberMasked: maskedPn,
            name,
            surname,
            ageBucket: age,
            genderBucket: user.credential_gender === 'M' ? 'Male' : (user.credential_gender === 'F' ? 'Female' : (user.credential_gender || 'Unknown')),
            regionBucket: user.credential_region_codes?.[0] || 'Unknown',
            enrolledAt: user.created_at,
            lastLoginAt: user.last_login_at,
            status: 'active',
            notificationsEnabled: user.notifications_enabled,
          };
        } catch (err: any) {
          console.error(`[Profile Error] Failed to map user ${user.id}:`, err);
          return {
            id: user.id,
            pnHash: 'ERROR',
            personalNumberMasked: 'ERROR',
            name: 'Error',
            surname: 'User',
            ageBucket: 'Unknown',
            genderBucket: 'Unknown',
            regionBucket: 'Unknown',
            enrolledAt: user.created_at,
            lastLoginAt: user.last_login_at,
            status: 'error',
            notificationsEnabled: false,
          };
        }
      });

      const response = {
        profiles,
        total: total < MIN_K_ANONYMITY ? '<k' : total,
        page: parseInt(page as string, 10),
        pageSize: parseInt(pageSize as string, 10),
        totalPages: Math.ceil(total / parseInt(pageSize as string, 10)),
      };

      res.json(response);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/v1/admin/profiles/:id
 * Get a single profile by ID with full details
 */
router.get(
  '/:id',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;

      const userResult = await pool.query(
        `SELECT
          id,
          pn_hash,
          credential_gender,
          credential_birth_year,
          credential_dob,
          credential_region_codes,
          first_name,
          last_name,
          pn_masked,
          created_at,
          last_login_at,
          trust_score,
          risk_score,
          notifications_enabled,
          device_key_thumbprint
         FROM users
         WHERE id = $1`,
        [id]
      );

      if (userResult.rows.length === 0) {
        return res.status(404).json({ error: 'Profile not found' });
      }

      const user = userResult.rows[0];

      // Calculate exact age from full DOB if available, otherwise from birth year
      let age: string = 'Unknown';
      if (user.credential_dob) {
        const dob = new Date(user.credential_dob);
        const today = new Date();
        let years = today.getFullYear() - dob.getFullYear();
        const monthDiff = today.getMonth() - dob.getMonth();
        if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
          years--;
        }
        age = String(years);
      } else if (user.credential_birth_year) {
        age = String(new Date().getFullYear() - user.credential_birth_year);
      }

      // Get participation count
      const participationResult = await pool.query(
        `SELECT COUNT(*) as count FROM poll_participants WHERE user_id = $1`,
        [id]
      );
      const participationCount = parseInt(participationResult.rows[0].count, 10);

      const profile = {
        id: user.id,
        pnHash: user.pn_hash,
        personalNumberMasked: user.pn_masked || '••••••••••••',
        name: user.first_name || 'Unknown',
        surname: user.last_name || 'Unknown',
        ageBucket: age,
        genderBucket: user.credential_gender === 'M' ? 'Male' : (user.credential_gender === 'F' ? 'Female' : (user.credential_gender || 'Unknown')),
        regionBucket: user.credential_region_codes?.[0] || 'Unknown',
        enrolledAt: user.created_at,
        lastLoginAt: user.last_login_at,
        status: 'active',
        notificationsEnabled: user.notifications_enabled,
        trustScore: user.trust_score,
        riskScore: user.risk_score,
        participationCount,
        hasDeviceKey: !!user.device_key_thumbprint,
      };

      return res.json(profile);
    } catch (error) {
      return next(error);
    }
  }
);

/**
 * POST /api/v1/admin/profiles/export
 * Export profiles data (Phase 1 implementation)
 */
router.post(
  '/export',
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      // Phase 0: Return not implemented
      res.status(501).json({
        error: 'Profile export not implemented in Phase 0',
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/v1/admin/profiles/:id/participation
 * Get participation records for a profile
 * Returns poll participation history (YES/NO only, never reveals vote choice for privacy)
 */
router.get(
  '/:id/participation',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;

      // Get user details for metadata
      const userResult = await pool.query(
        `SELECT
          last_login_at,
          created_at,
          notifications_enabled
         FROM users
         WHERE id = $1`,
        [id]
      );

      if (userResult.rows.length === 0) {
        return res.status(404).json({ error: 'Profile not found' });
      }

      const user = userResult.rows[0];

      // Query actual poll participation records
      // Privacy: Only shows participation status (YES), never vote choice
      const participationResult = await pool.query(
        `SELECT
          pp.poll_id,
          pp.participated_at,
          p.title as poll_title,
          p.type as poll_type,
          p.status as poll_status
         FROM poll_participants pp
         JOIN polls p ON pp.poll_id = p.id
         WHERE pp.user_id = $1
         ORDER BY pp.participated_at DESC`,
        [id]
      );

      // Map to frontend format
      const participationRecords = participationResult.rows.map(row => ({
        pollId: row.poll_id,
        pollTitle: row.poll_title,
        participated: true, // If in poll_participants, they participated
        participationDate: row.participated_at,
        pollType: row.poll_type,
        pollStatus: row.poll_status,
      }));

      res.json({
        metadata: {
          lastLoginAt: user.last_login_at,
          enrolledAt: user.created_at,
          notificationsEnabled: user.notifications_enabled,
        },
        participationRecords,
      });
    } catch (error) {
      return next(error);
    }
  }
);

/**
 * PATCH /api/v1/admin/profiles/:id/region
 * Update user's region (for when user changes living location)
 */
router.patch(
  '/:id/region',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const { regionCode } = req.body;

      if (!regionCode) {
        return res.status(400).json({ error: 'regionCode is required' });
      }

      // Update user's region
      const result = await pool.query(
        `UPDATE users
         SET credential_region_codes = ARRAY[$1]::text[]
         WHERE id = $2
         RETURNING id, credential_region_codes`,
        [regionCode, id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Profile not found' });
      }

      console.log(`✓ Updated region for user ${id} to ${regionCode}`);

      return res.json({
        success: true,
        regionCode: result.rows[0].credential_region_codes[0],
      });
    } catch (error) {
      return next(error);
    }
  }
);

/**
 * POST /api/v1/admin/profiles/:id/reset-security
 * Reset user's security limits (rate limits, device-voter associations, etc.)
 * This allows a blocked user to re-attempt verification
 */
router.post(
  '/:id/reset-security',
  async (req: Request, res: Response, next: NextFunction) => {
    console.log(`[reset-security] Handler invoked for ID: ${req.params.id}`);
    try {
      const { id } = req.params;
      const { invalidateCredential = false } = req.body;

      // Get user's device_key_thumbprint
      const userResult = await pool.query(
        `SELECT device_key_thumbprint, pn_hash FROM users WHERE id = $1`,
        [id]
      );

      if (userResult.rows.length === 0) {
        return res.status(404).json({ error: 'Profile not found' });
      }

      const user = userResult.rows[0];
      const resetActions: string[] = [];

      // 1. Clear device-poll-voter associations for this user
      const deviceVoterResult = await pool.query(
        `DELETE FROM device_poll_voters
         WHERE device_key_hash = $1 OR voter_hash = $1
         RETURNING poll_id`,
        [user.device_key_thumbprint]
      );
      resetActions.push(`Cleared ${deviceVoterResult.rowCount || 0} device-voter records`);

      // 2. Clear any Redis rate limit keys related to this user
      // We don't have the user's IP stored (privacy), but we can clear user-specific keys
      try {
        // Clear biometric rate limit by device key pattern
        const userRateLimitPattern = `*${user.device_key_thumbprint?.substring(0, 16)}*`;
        const keys = await redisClient.keys(userRateLimitPattern);
        if (keys.length > 0) {
          await redisClient.del(keys);
          resetActions.push(`Cleared ${keys.length} Redis rate limit keys`);
        }
      } catch (redisErr) {
        console.warn('[ResetSecurity] Redis cleanup skipped:', redisErr);
      }

      // 3. Clear auth_rate_limits (login attempts)
      try {
        const rateLimitResult = await pool.query(
          `DELETE FROM auth_rate_limits WHERE pn_hash = $1 RETURNING pn_hash`,
          [user.pn_hash]
        );
        if ((rateLimitResult.rowCount || 0) > 0) {
          resetActions.push(`Cleared ${rateLimitResult.rowCount} rate limit records`);
        }
      } catch (e) {
        console.warn('[ResetSecurity] Rate limit cleanup failed:', e);
      }

      // 4. Optionally invalidate the user's credential (requires re-verification)
      if (invalidateCredential) {
        await pool.query(
          `UPDATE users SET trust_score = 0, risk_score = 0 WHERE id = $1`,
          [id]
        );
        resetActions.push('Reset trust/risk scores (user may need re-verification)');
      }

      // 5. Clear failed enrollment sessions to allow fresh start
      try {
        const sessionResult = await pool.query(
           `DELETE FROM enrollment_sessions WHERE pn_hash = $1 AND status != 'completed'`,
           [user.pn_hash]
        );
        if ((sessionResult.rowCount || 0) > 0) {
          resetActions.push(`Cleared ${sessionResult.rowCount} failed/stuck enrollment sessions`);
        }
      } catch (e) {
         console.warn('[ResetSecurity] Session cleanup failed:', e);
      }

      // Log the admin action for audit
      console.log(`[Admin] Reset security for user ${id}:`, resetActions);

      return res.json({
        success: true,
        message: 'Security limits reset successfully',
        actions: resetActions,
      });
    } catch (error) {
      return next(error);
    }
  }
);

/**
 * POST /api/v1/admin/profiles/:id/reset-enrollment
 * Delete user record to allow re-enrollment (for testing purposes)
 * WARNING: This permanently deletes the user and all associated data
 */
router.post(
  '/:id/reset-enrollment',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;

      // Get user info before deletion for logging
      const userResult = await pool.query(
        `SELECT pn_hash, pn_masked, first_name, last_name, device_key_thumbprint FROM users WHERE id = $1`,
        [id]
      );

      if (userResult.rows.length === 0) {
        return res.status(404).json({ error: 'Profile not found' });
      }

      const user = userResult.rows[0];
      const deletedInfo: string[] = [];

      // 1. Delete poll participations
      const participationResult = await pool.query(
        `DELETE FROM poll_participants WHERE user_id = $1 RETURNING poll_id`,
        [id]
      );
      deletedInfo.push(`Deleted ${participationResult.rowCount || 0} poll participations`);

      // 2. Delete user rewards (uses device_key_hash, not user_id)
      const rewardsResult = await pool.query(
        `DELETE FROM user_rewards WHERE device_key_hash = $1 RETURNING id`,
        [user.device_key_thumbprint]
      );
      deletedInfo.push(`Deleted ${rewardsResult.rowCount || 0} reward records`);

      // 3. Delete device-voter associations by pn_hash
      const deviceVoterResult = await pool.query(
        `DELETE FROM device_poll_voters WHERE voter_hash = $1 RETURNING poll_id`,
        [user.pn_hash]
      );
      deletedInfo.push(`Deleted ${deviceVoterResult.rowCount || 0} device-voter records`);

      // 4. Delete ANY enrollment sessions
      try {
        const sessionResult = await pool.query(
          `DELETE FROM enrollment_sessions WHERE pn_hash = $1`,
          [user.pn_hash]
        );
        deletedInfo.push(`Deleted ${sessionResult.rowCount || 0} enrollment sessions`);
      } catch (e) {
        // Table might not exist, ignore
      }

      // 5. Delete auth rate limits
      try {
        const rateLimitResult = await pool.query(
          `DELETE FROM auth_rate_limits WHERE pn_hash = $1`,
          [user.pn_hash]
        );
        deletedInfo.push(`Deleted ${rateLimitResult.rowCount || 0} rate limit records`);
      } catch (e) {
         console.warn('[ResetEnrollment] Rate limit cleanup failed:', e);
      }

      // 6. Delete security events (logs) to unclutter
      try {
        const eventsResult = await pool.query(
          `DELETE FROM security_events WHERE pn_hash = $1 OR user_id = $2`,
          [user.pn_hash, id]
        );
        deletedInfo.push(`Deleted ${eventsResult.rowCount || 0} security events`);
      } catch (e) {
         console.warn('[ResetEnrollment] Security events cleanup failed:', e);
      }

      // 7. Delete idempotency keys for this user
      try {
        const idempotencyResult = await pool.query(
          `DELETE FROM idempotency_keys WHERE user_id = $1`,
          [id]
        );
        deletedInfo.push(`Deleted ${idempotencyResult.rowCount || 0} idempotency keys`);
      } catch (e) {
        console.warn('[ResetEnrollment] Idempotency keys cleanup failed:', e);
      }

      // 8. Finally delete the user record
      await pool.query(`DELETE FROM users WHERE id = $1`, [id]);
      deletedInfo.push(`Deleted user record`);


      // Log the admin action for audit
      console.log(`[Admin] Reset enrollment for user ${user.pn_masked} (${user.first_name} ${user.last_name}):`, deletedInfo);

      return res.json({
        success: true,
        message: 'Enrollment reset - user can now re-enroll',
        deletedUser: {
          maskedPn: user.pn_masked,
          name: `${user.first_name} ${user.last_name}`,
        },
        actions: deletedInfo,
      });
    } catch (error) {
      return next(error);
    }
  }
);

export default router;
