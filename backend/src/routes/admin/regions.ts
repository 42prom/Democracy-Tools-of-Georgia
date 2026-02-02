import { Router, Request, Response, NextFunction } from 'express';
import { requireAdmin } from '../../middleware/auth';
import { createError } from '../../middleware/errorHandler';
import { pool } from '../../db/client';
import multer from 'multer';
import csvParser from 'csv-parser';
import { Readable } from 'stream';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

// All admin routes require authentication
router.use(requireAdmin);

/**
 * GET /api/v1/admin/regions
 * List all regions
 */
router.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await pool.query(
      'SELECT * FROM regions ORDER BY name_en ASC'
    );
    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/admin/regions
 * Create a new region
 */
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { code, name_en, name_ka, parent_region_id, active } = req.body;

    if (!code || !name_en || !name_ka) {
      throw createError('Code, name_en, and name_ka are required', 400);
    }

    const result = await pool.query(
      `INSERT INTO regions (code, name_en, name_ka, parent_region_id, active)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [code, name_en, name_ka, parent_region_id || null, active ?? true]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /api/v1/admin/regions/:id
 * Update a region
 */
router.patch('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { code, name_en, name_ka, parent_region_id, active } = req.body;

    const updates: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (code !== undefined) {
      updates.push(`code = $${paramCount++}`);
      values.push(code);
    }
    if (name_en !== undefined) {
      updates.push(`name_en = $${paramCount++}`);
      values.push(name_en);
    }
    if (name_ka !== undefined) {
      updates.push(`name_ka = $${paramCount++}`);
      values.push(name_ka);
    }
    if (parent_region_id !== undefined) {
      updates.push(`parent_region_id = $${paramCount++}`);
      values.push(parent_region_id === '' ? null : parent_region_id);
    }
    if (active !== undefined) {
      updates.push(`active = $${paramCount++}`);
      values.push(active);
    }

    if (updates.length === 0) {
      throw createError('No fields to update', 400);
    }

    values.push(id);
    const result = await pool.query(
      `UPDATE regions SET ${updates.join(', ')} WHERE id = $${paramCount} RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      throw createError('Region not found', 404);
    }

    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/v1/admin/regions/:id
 * Delete a region
 */
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const result = await pool.query('DELETE FROM regions WHERE id = $1 RETURNING *', [id]);

    if (result.rows.length === 0) {
      throw createError('Region not found', 404);
    }

    res.json({ message: 'Region deleted successfully' });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/admin/regions/import
 * Import regions from CSV
 */
router.post('/import', upload.single('file'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.file) {
      throw createError('CSV file is required', 400);
    }

    const regions: any[] = [];
    const errors: string[] = [];
    const csvData = req.file.buffer.toString('utf-8');

    // Parse CSV
    await new Promise((resolve, reject) => {
      const stream = Readable.from(csvData);
      stream
        .pipe(csvParser())
        .on('data', (row: any) => {
          // Validate row
          if (!row.code || !row.name_en || !row.name_ka) {
            errors.push(`Invalid row: ${JSON.stringify(row)}`);
            return;
          }
          regions.push({
            code: row.code,
            name_en: row.name_en,
            name_ka: row.name_ka,
            parent_region_id: row.parent_region_id || null,
            active: row.active === 'true' || row.active === '1',
          });
        })
        .on('end', resolve)
        .on('error', reject);
    });

    // Insert regions
    let imported = 0;
    for (const region of regions) {
      try {
        await pool.query(
          `INSERT INTO regions (code, name_en, name_ka, parent_region_id, active)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (code) DO UPDATE
           SET name_en = EXCLUDED.name_en,
               name_ka = EXCLUDED.name_ka,
               parent_region_id = EXCLUDED.parent_region_id,
               active = EXCLUDED.active`,
          [region.code, region.name_en, region.name_ka, (region.parent_region_id === '' ? null : region.parent_region_id), region.active]
        );
        imported++;
      } catch (err: any) {
        errors.push(`Failed to import ${region.code}: ${err.message}`);
      }
    }

    res.json({ imported, errors });
  } catch (error) {
    next(error);
  }
});

export default router;
