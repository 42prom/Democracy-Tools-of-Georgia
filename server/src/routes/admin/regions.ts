import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { query } from '../../db/client.js';

const CreateRegionSchema = z.object({
  code: z.string().min(1),
  name_en: z.string().min(1),
  name_ka: z.string().min(1),
  parent_region_id: z.string().optional(),
  active: z.boolean().optional().default(true),
});

const UpdateRegionSchema = z.object({
  code: z.string().optional(),
  name_en: z.string().optional(),
  name_ka: z.string().optional(),
  parent_region_id: z.string().nullable().optional(),
  active: z.boolean().optional(),
});

const adminRegionsRoutes: FastifyPluginAsync = async (fastify) => {
  // Same auth hook as polls (Phase 0)
  fastify.addHook('onRequest', async (request, reply) => {
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return reply.code(401).send({ error: 'Admin authentication required' });
    }
  });

  // GET /api/v1/admin/regions
  fastify.get('/', async () => {
    const result = await query('SELECT * FROM regions ORDER BY name_en ASC');
    return result.rows;
  });

  // POST /api/v1/admin/regions
  fastify.post('/', async (request, reply) => {
    const body = CreateRegionSchema.parse(request.body);
    const result = await query(
      `INSERT INTO regions (code, name_en, name_ka, parent_region_id, active)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [body.code, body.name_en, body.name_ka, body.parent_region_id || null, body.active]
    );
    return reply.code(201).send(result.rows[0]);
  });

  // PATCH /api/v1/admin/regions/:id
  fastify.patch('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = UpdateRegionSchema.parse(request.body);

    const updates: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (body.code !== undefined) {
      updates.push(`code = $${paramCount++}`);
      values.push(body.code);
    }
    if (body.name_en !== undefined) {
      updates.push(`name_en = $${paramCount++}`);
      values.push(body.name_en);
    }
    if (body.name_ka !== undefined) {
      updates.push(`name_ka = $${paramCount++}`);
      values.push(body.name_ka);
    }
    if (body.parent_region_id !== undefined) {
      updates.push(`parent_region_id = $${paramCount++}`);
      values.push(body.parent_region_id);
    }
    if (body.active !== undefined) {
      updates.push(`active = $${paramCount++}`);
      values.push(body.active);
    }

    if (updates.length === 0) {
      return reply.code(400).send({ error: 'No fields to update' });
    }

    values.push(id);
    const result = await query(
      `UPDATE regions SET ${updates.join(', ')} WHERE id = $${paramCount} RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      return reply.code(404).send({ error: 'Region not found' });
    }

    return result.rows[0];
  });

  // DELETE /api/v1/admin/regions/:id
  fastify.delete('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const result = await query('DELETE FROM regions WHERE id = $1 RETURNING *', [id]);

    if (result.rows.length === 0) {
      return reply.code(404).send({ error: 'Region not found' });
    }

    return { message: 'Region deleted successfully' };
  });

  // POST /api/v1/admin/regions/import — CSV import
  fastify.post('/import', async (_request, reply) => {
    // Phase 0: not implemented in Fastify (requires multipart)
    return reply.code(501).send({ error: 'CSV import not yet supported on this server' });
  });
};

export default adminRegionsRoutes;
