import { FastifyPluginAsync } from 'fastify';
import { query } from '../../db/client.js';

const MIN_K_ANONYMITY = 30;

const adminProfilesRoutes: FastifyPluginAsync = async (fastify) => {
  // Same auth hook as polls (Phase 0)
  fastify.addHook('onRequest', async (request, reply) => {
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return reply.code(401).send({ error: 'Admin authentication required' });
    }
  });

  // GET /api/v1/admin/profiles
  fastify.get('/', async (request) => {
    const {
      page = '1',
      pageSize = '20',
      sortBy = 'created_at',
      sortOrder = 'desc',
      search,
      ageBucket,
      genderBucket,
      regionBucket,
      lastLoginStart,
      lastLoginEnd,
    } = request.query as Record<string, string | undefined>;

    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (search && search.trim()) {
      conditions.push(`pn_hash LIKE $${paramIndex}`);
      params.push(`%${search.trim()}%`);
      paramIndex++;
    }

    if (genderBucket) {
      conditions.push(`credential_gender = $${paramIndex}`);
      params.push(genderBucket);
      paramIndex++;
    }

    if (regionBucket) {
      conditions.push(`$${paramIndex} = ANY(credential_region_codes)`);
      params.push(regionBucket);
      paramIndex++;
    }

    if (ageBucket) {
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

    if (lastLoginStart) {
      conditions.push(`last_login_at >= $${paramIndex}`);
      params.push(lastLoginStart);
      paramIndex++;
    }

    if (lastLoginEnd) {
      conditions.push(`last_login_at <= $${paramIndex}`);
      params.push(lastLoginEnd);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await query(
      `SELECT COUNT(*) as count FROM users ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].count, 10);

    const pgSize = parseInt(pageSize!, 10);
    const pgNum = parseInt(page!, 10);
    const offset = (pgNum - 1) * pgSize;

    const sortByMap: Record<string, string> = {
      enrolledAt: 'created_at',
      enrolled_at: 'created_at',
      created_at: 'created_at',
      last_login_at: 'last_login_at',
      lastLoginAt: 'last_login_at',
      trust_score: 'trust_score',
      trustScore: 'trust_score',
    };

    const dbSortBy = sortByMap[sortBy!] || 'created_at';
    const order = sortOrder === 'asc' ? 'ASC' : 'DESC';

    params.push(pgSize, offset);

    const usersResult = await query(
      `SELECT
        id, pn_hash, credential_gender, credential_birth_year,
        credential_region_codes, created_at, last_login_at, trust_score
       FROM users
       ${whereClause}
       ORDER BY ${dbSortBy} ${order}
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      params
    );

    const generateMockName = (hash: string, gender: string) => {
      const maleNames = ['Giorgi', 'Levan', 'Davit', 'Nikoloz', 'Aleksandre', 'Irakli', 'Mamuka', 'Zurab'];
      const femaleNames = ['Nino', 'Mariam', 'Tamar', 'Ana', 'Natia', 'Khatia', 'Salome', 'Elene'];
      const surnames = ['Beridze', 'Kapanadze', 'Gelashvili', 'Lomidze', 'Janelidze', 'Maisuradze', 'Kvaratskhelia', 'Chkheidze'];
      const names = gender === 'M' ? maleNames : femaleNames;
      const hashNum = parseInt(hash.substring(0, 8), 16);
      return {
        name: names[hashNum % names.length],
        surname: surnames[(hashNum >> 4) % surnames.length],
      };
    };

    const profiles = usersResult.rows.map((user: any) => {
      const maskedPn = user.pn_hash
        ? `${user.pn_hash.substring(0, 4)}${'•'.repeat(8)}${user.pn_hash.substring(user.pn_hash.length - 4)}`
        : '••••••••••••••••';
      const { name, surname } = generateMockName(user.pn_hash || '00000000', user.credential_gender);

      return {
        id: user.id,
        pnHash: user.pn_hash,
        personalNumberMasked: maskedPn,
        name,
        surname,
        ageBucket: user.credential_birth_year ? `${new Date().getFullYear() - user.credential_birth_year}` : 'Unknown',
        genderBucket: user.credential_gender || 'Unknown',
        regionBucket: user.credential_region_codes?.[0] || 'Unknown',
        enrolledAt: user.created_at,
        lastLoginAt: user.last_login_at,
        status: 'active',
        notificationsEnabled: true,
      };
    });

    return {
      profiles,
      total: total < MIN_K_ANONYMITY ? '<k' : total,
      page: pgNum,
      pageSize: pgSize,
      totalPages: Math.ceil(total / pgSize),
    };
  });

  // GET /api/v1/admin/profiles/:id
  fastify.get('/:id', async (_request, reply) => {
    return reply.code(501).send({ error: 'Profile details not implemented in Phase 0' });
  });

  // POST /api/v1/admin/profiles/export
  fastify.post('/export', async (_request, reply) => {
    return reply.code(501).send({ error: 'Profile export not implemented in Phase 0' });
  });

  // PATCH /api/v1/admin/profiles/:id/region
  fastify.patch('/:id/region', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { regionCode } = request.body as { regionCode: string };

    if (!regionCode) {
      return reply.code(400).send({ error: 'regionCode is required' });
    }

    const result = await query(
      `UPDATE users SET credential_region_codes = ARRAY[$1] WHERE id = $2 RETURNING id`,
      [regionCode, id]
    );

    if (result.rows.length === 0) {
      return reply.code(404).send({ error: 'Profile not found' });
    }

    return { message: 'Region updated successfully' };
  });

  // GET /api/v1/admin/profiles/:id/participation
  fastify.get('/:id/participation', async (request, reply) => {
    const { id } = request.params as { id: string };
    const userResult = await query(
      'SELECT last_login_at, created_at FROM users WHERE id = $1',
      [id]
    );

    if (userResult.rows.length === 0) {
      return reply.code(404).send({ error: 'Profile not found' });
    }

    const user = userResult.rows[0];
    return {
      metadata: {
        lastLoginAt: user.last_login_at,
        enrolledAt: user.created_at,
        notificationsEnabled: true,
      },
      participationRecords: [],
    };
  });
};

export default adminProfilesRoutes;
