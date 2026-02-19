import { Router, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { pool } from '../../db/client';
import { createError } from '../../middleware/errorHandler';
import { requireAdmin } from '../../middleware/auth';
import { getJwtSecret } from '../../config/jwt';

const router = Router();

// Use centralized JWT secret config (enforces production checks at startup)
const JWT_SECRET = getJwtSecret();

/**
 * POST /api/v1/admin/auth/login
 * Admin login
 */
router.post('/login', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      throw createError('Email and password are required', 400);
    }

    const result = await pool.query(
      'SELECT * FROM admin_users WHERE email = $1',
      [email]
    );

    const user = result.rows[0];

    // Check if user exists
    if (!user) {
      // Dummy check to prevent timing attacks
      await bcrypt.compare(password, '$2b$10$Um4WyJZrlplY5cCDZRslk.lHr.Ph6JLkGygl1XYG1TEQNOwhN3Y0u');
      throw createError('Invalid credentials', 401);
    }

    // Verify password
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      throw createError('Invalid credentials', 401);
    }

    // Update last login
    await pool.query('UPDATE admin_users SET last_login_at = NOW() WHERE id = $1', [user.id]);

    // Issue JWT
    const token = jwt.sign(
      {
        sub: user.id,
        email: user.email,
        role: user.role,
        type: 'admin'
      },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        fullName: user.full_name
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/admin/auth/me
 * Get current admin user
 */
router.get('/me', requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    // req.adminUser is set by requireAdmin middleware (need to update middleware)
    // For now, assume req.adminUser or extract from token manually if middleware not updated yet
    // But we WILL update middleware next.
    const adminUser = (req as any).adminUser;
    
    if (!adminUser) {
        throw createError('Not authenticated', 401);
    }

    res.json({
        id: adminUser.id,
        email: adminUser.email,
        role: adminUser.role,
        fullName: adminUser.full_name || adminUser.fullName
    });
  } catch (error) {
    next(error);
  }
});

export default router;
