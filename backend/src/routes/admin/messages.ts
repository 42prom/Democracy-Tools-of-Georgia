import { Router, Request, Response, NextFunction } from 'express';
import { requireAdmin } from '../../middleware/auth';
import { pool } from '../../db/client';

const router = Router();

// All admin routes require authentication
router.use(requireAdmin);

/**
 * GET /api/v1/admin/messages
 * List all messages
 */
router.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await pool.query('SELECT * FROM messages ORDER BY created_at DESC');
    return res.json(result.rows);
  } catch (error) {
    // If table doesn't exist yet, return empty list
    if ((error as any).code === '42P01') {
      return res.json([]);
    }
    return next(error);
  }
});

/**
 * POST /api/v1/admin/messages
 * Create a new message
 */
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { title, body, type, audience_rules, publish_at, expire_at } = req.body;
    
    const result = await pool.query(
      `INSERT INTO messages (
        title, body, type, audience_rules, publish_at, expire_at, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *`,
      [title, body, type, JSON.stringify(audience_rules || {}), publish_at, expire_at, 'draft']
    );

    return res.status(201).json(result.rows[0]);
  } catch (error) {
    return next(error);
  }
});

/**
 * PATCH /api/v1/admin/messages/:id
 * Update a message
 */
router.patch('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { title, body, type, audience_rules, publish_at, expire_at, status } = req.body;

    const result = await pool.query(
      `UPDATE messages 
       SET 
        title = COALESCE($1, title),
        body = COALESCE($2, body),
        type = COALESCE($3, type),
        audience_rules = COALESCE($4, audience_rules),
        publish_at = COALESCE($5, publish_at),
        expire_at = COALESCE($6, expire_at),
        status = COALESCE($7, status),
        updated_at = NOW()
       WHERE id = $8
       RETURNING *`,
      [title, body, type, audience_rules ? JSON.stringify(audience_rules) : null, publish_at, expire_at, status, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Message not found' });
    }

    return res.json(result.rows[0]);
  } catch (error) {
    return next(error);
  }
});

/**
 * POST /api/v1/admin/messages/:id/publish
 * Publish a message
 */
router.post('/:id/publish', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `UPDATE messages 
       SET status = 'published', published_at = NOW(), updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Message not found' });
    }

    console.log(`✓ Published message ${id}`);
    return res.json(result.rows[0]);
  } catch (error) {
    return next(error);
  }
});

/**
 * DELETE /api/v1/admin/messages/:id
 */
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM messages WHERE id = $1 RETURNING id', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Message not found' });
    }

    return res.status(204).send();
  } catch (error) {
    return next(error);
  }
});

export default router;
