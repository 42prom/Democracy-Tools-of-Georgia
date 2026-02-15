import { Router, Request, Response, NextFunction } from 'express';
import { requireAdmin } from '../../middleware/auth';
import { pool } from '../../db/client';
import { pushService } from '../../services/pushNotifications';

const router = Router();

// All admin routes require authentication
router.use(requireAdmin);

/**
 * GET /api/v1/admin/messages
 * List all messages, optionally filtered by status
 */
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { status } = req.query;

    let query = 'SELECT * FROM messages';
    const params: string[] = [];

    // Filter by status if provided
    if (status && typeof status === 'string' && status !== 'all') {
      query += ' WHERE status = $1';
      params.push(status);
    }

    query += ' ORDER BY created_at DESC';

    const result = await pool.query(query, params);
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
router.post('/', async (req: Request, res: Response) => {
  try {
    const { title, body, type, audience_rules, publish_at, expire_at } = req.body;
    console.log(`[Messages] Creating new message: "${title}" (Type: ${type})`);
    console.log(`[Messages] Audience Rules Payload:`, JSON.stringify(audience_rules, null, 2));
    
    // Explicitly validate/clean audience_rules if needed
    const rulesJson = JSON.stringify(audience_rules || {});
    console.log(`[Messages] SQL JSON Param:`, rulesJson);

    const result = await pool.query(
      `INSERT INTO messages (
        title, body, type, audience_rules, publish_at, expire_at, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *`,
      [
        title, 
        body, 
        type, 
        JSON.stringify(audience_rules || {}), 
        publish_at || null, 
        expire_at || null, 
        'draft'
      ]
    );

    console.log(`[Messages] ✓ Created message ID: ${result.rows[0].id}`);
    return res.status(201).json(result.rows[0]);
  } catch (error: any) {
    console.error('[Messages] Error creating message:', error);
    return res.status(500).json({ error: error.message, stack: error.stack });
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

    // If status is being updated to 'published', ensure published_at is set to NOW()
    let publishedAtValue = publish_at;
    if (status === 'published' && !publish_at) {
      console.log(`[Messages] Status set to 'published', defaulting published_at to NOW()`);
      publishedAtValue = new Date().toISOString();
    }

    const result = await pool.query(
      `UPDATE messages 
       SET 
        title = COALESCE($1, title),
        body = COALESCE($2, body),
        type = COALESCE($3, type),
        audience_rules = COALESCE($4, audience_rules),
        publish_at = COALESCE($5, publish_at),
        published_at = CASE 
          WHEN $7 = 'published' AND published_at IS NULL THEN NOW()
          ELSE published_at 
        END,
        expire_at = COALESCE($6, expire_at),
        status = COALESCE($7, status),
        updated_at = NOW()
       WHERE id = $8
       RETURNING *`,
      [
        title,
        body,
        type,
        audience_rules ? JSON.stringify(audience_rules) : null, 
        publishedAtValue || null, 
        expire_at || null, 
        status,
        id,
      ]
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
router.post('/:id/publish', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    console.log(`[Messages] Publishing message ${id}...`);

    const result = await pool.query(
      `UPDATE messages 
       SET status = 'published', published_at = NOW(), updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id]
    );

    if (result.rows.length === 0) {
      console.warn(`[Messages] Publish failed: Message ${id} not found`);
      return res.status(404).json({ error: 'Message not found' });
    }

    console.log(`[Messages] ✓ Published message ${id}. Status: ${result.rows[0].status}`);
    
    // Trigger notification (async, don't block)
    const msg = result.rows[0];
    pushService.notifyMessagePublished(id as string, msg.title, msg.body);
    
    return res.json(result.rows[0]);
  } catch (error: any) {
    console.error(`[Messages] Error publishing message ${req.params.id}:`, error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/v1/admin/messages/:id/archive
 * Archive a message
 */
router.post('/:id/archive', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    console.log(`[Messages] Archiving message ${id}...`);

    const result = await pool.query(
      `UPDATE messages
       SET status = 'archived', updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id]
    );

    if (result.rows.length === 0) {
      console.warn(`[Messages] Archive failed: Message ${id} not found`);
      return res.status(404).json({ error: 'Message not found' });
    }

    console.log(`[Messages] ✓ Archived message ${id}`);
    return res.json({ message: 'Message archived successfully' });
  } catch (error) {
    return next(error);
  }
});

/**
 * GET /api/v1/admin/messages/:id
 * Get a single message by ID
 */
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const result = await pool.query('SELECT * FROM messages WHERE id = $1', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Message not found' });
    }

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
