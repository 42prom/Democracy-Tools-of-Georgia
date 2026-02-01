import { Router, Request, Response, NextFunction } from 'express';
import { requireAdmin } from '../../middleware/auth';
import { pool } from '../../db/client';

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
        status,
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
        const currentYear = 2026;
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
          credential_region_codes,
          created_at,
          last_login_at,
          trust_score
         FROM users
         ${whereClause}
         ORDER BY ${dbSortBy} ${sortOrder}
         LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
        params
      );

      // Helper to generate mock names from hash (for display only, not stored)
      const generateMockName = (hash: string, gender: string) => {
        const maleNames = ['Giorgi', 'Levan', 'Davit', 'Nikoloz', 'Aleksandre', 'Irakli', 'Mamuka', 'Zurab'];
        const femaleNames = ['Nino', 'Mariam', 'Tamar', 'Ana', 'Natia', 'Khatia', 'Salome', 'Elene'];
        const surnames = ['Beridze', 'Kapanadze', 'Gelashvili', 'Lomidze', 'Janelidze', 'Maisuradze', 'Kvaratskhelia', 'Chkheidze'];

        const names = gender === 'M' ? maleNames : femaleNames;
        const hashNum = parseInt(hash.substring(0, 8), 16);
        const name = names[hashNum % names.length];
        const surname = surnames[(hashNum >> 4) % surnames.length];

        return { name, surname };
      };

      // Map to profile format
      const profiles = usersResult.rows.map((user) => {
        // Create masked PN from hash (show first 4 and last 4 chars of hash)
        const maskedPn = user.pn_hash
          ? `${user.pn_hash.substring(0, 4)}${'•'.repeat(8)}${user.pn_hash.substring(user.pn_hash.length - 4)}`
          : '••••••••••••••••';

        // Generate mock name for display (not stored in DB)
        const { name, surname } = generateMockName(user.pn_hash, user.credential_gender);

        return {
          id: user.id,
          pnHash: user.pn_hash,
          personalNumberMasked: maskedPn,
          name,
          surname,
          ageBucket: user.credential_birth_year ? `${2026 - user.credential_birth_year}` : 'Unknown',
          genderBucket: user.credential_gender || 'Unknown',
          regionBucket: user.credential_region_codes?.[0] || 'Unknown',
          enrolledAt: user.created_at,
          lastLoginAt: user.last_login_at,
          status: 'active',
          notificationsEnabled: true,
        };
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
 * Get a single profile by ID (Phase 1 implementation)
 */
router.get(
  '/:id',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Phase 0: Return not implemented
      res.status(501).json({
        error: 'Profile details not implemented in Phase 0',
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/v1/admin/profiles/export
 * Export profiles data (Phase 1 implementation)
 */
router.post(
  '/export',
  async (req: Request, res: Response, next: NextFunction) => {
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
 * Get participation records for a profile (Phase 1 implementation)
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
          created_at
         FROM users
         WHERE id = $1`,
        [id]
      );

      if (userResult.rows.length === 0) {
        return res.status(404).json({ error: 'Profile not found' });
      }

      const user = userResult.rows[0];

      // Return user metadata (Phase 0: no actual poll participation yet)
      res.json({
        metadata: {
          lastLoginAt: user.last_login_at,
          enrolledAt: user.created_at,
          notificationsEnabled: true,
        },
        participationRecords: [],
      });
    } catch (error) {
      next(error);
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

      res.json({
        success: true,
        regionCode: result.rows[0].credential_region_codes[0],
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
