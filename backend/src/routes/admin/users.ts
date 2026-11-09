import { Router, Request, Response, NextFunction } from 'express';
import { pool, transaction } from '../../db/client';
import { ADMIN_ROLES, AdminRole, requireAdmin, requireAdminRole } from '../../middleware/auth';
import { createError } from '../../middleware/errorHandler';
import { hashAdminPassword, validateAdminPassword } from '../../services/adminPassword';
import { revokeAllAdminSessions } from '../../services/adminSession';
import { generateMfaSecret, mfaProvisioningUri } from '../../services/adminMfa';
import { encryptSensitiveValue } from '../../services/secretEncryption';

const router = Router();

router.use(requireAdmin);
router.use(requireAdminRole('superadmin'));

function normalizedEmail(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function validRole(value: unknown): value is AdminRole {
  return typeof value === 'string' && ADMIN_ROLES.includes(value as AdminRole);
}

router.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await pool.query(
      `SELECT id, email, role, full_name AS "fullName", is_active AS "isActive",
              failed_login_attempts AS "failedLoginAttempts",
              locked_until AS "lockedUntil", last_login_at AS "lastLoginAt",
              password_changed_at AS "passwordChangedAt", mfa_enabled AS "mfaEnabled",
              created_at AS "createdAt"
         FROM admin_users
        ORDER BY created_at, id`
    );
    res.setHeader('Cache-Control', 'no-store');
    res.json({ users: result.rows });
  } catch (error) {
    next(error);
  }
});

router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const email = normalizedEmail(req.body?.email);
    const fullName = typeof req.body?.fullName === 'string' ? req.body.fullName.trim() : '';
    const role = req.body?.role;
    const password = req.body?.password;

    if (!/^\S+@\S+\.\S+$/.test(email) || email.length > 255) throw createError('Valid email is required', 400);
    if (!validRole(role)) throw createError('Valid admin role is required', 400);
    if (fullName.length > 100) throw createError('Full name is too long', 400);
    const passwordError = validateAdminPassword(password, email);
    if (passwordError) throw createError(passwordError, 400);

    const passwordHash = await hashAdminPassword(password);
    const mfaSecret = generateMfaSecret();
    const result = await pool.query(
      `INSERT INTO admin_users
         (email, password_hash, role, full_name, is_active, password_changed_at, mfa_secret_encrypted)
       VALUES ($1, $2, $3, NULLIF($4, ''), true, NOW(), $5)
       RETURNING id, email, role, full_name AS "fullName", is_active AS "isActive",
                 mfa_enabled AS "mfaEnabled", created_at AS "createdAt"`,
      [email, passwordHash, role, fullName, encryptSensitiveValue(mfaSecret)]
    );
    res.status(201).json({
      ...result.rows[0],
      mfaSecret,
      mfaProvisioningUri: mfaProvisioningUri(email, mfaSecret),
    });
  } catch (error: any) {
    if (error?.code === '23505') {
      next(createError('An admin with that email already exists', 409));
      return;
    }
    next(error);
  }
});

router.patch('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const targetId = req.params.id;
    const role = req.body?.role;
    const isActive = req.body?.isActive;
    const fullName = req.body?.fullName;

    if (role !== undefined && !validRole(role)) throw createError('Invalid admin role', 400);
    if (isActive !== undefined && typeof isActive !== 'boolean') throw createError('isActive must be boolean', 400);
    if (fullName !== undefined && (typeof fullName !== 'string' || fullName.trim().length > 100)) {
      throw createError('Invalid full name', 400);
    }
    if (req.adminUser?.id === targetId && (isActive === false || (role !== undefined && role !== 'superadmin'))) {
      throw createError('A superadmin cannot disable or demote the active account', 409);
    }

    const updated = await transaction<any>(async client => {
      const currentResult = await client.query(
        'SELECT id, role, is_active FROM admin_users WHERE id = $1 FOR UPDATE',
        [targetId]
      );
      const current = currentResult.rows[0];
      if (!current) throw createError('Admin user not found', 404);

      const removesActiveSuperadmin = current.role === 'superadmin' && current.is_active &&
        (isActive === false || (role !== undefined && role !== 'superadmin'));
      if (removesActiveSuperadmin) {
        const count = await client.query(
          `SELECT COUNT(*)::int AS count FROM admin_users
            WHERE role = 'superadmin' AND is_active = true`
        );
        if (count.rows[0].count <= 1) throw createError('Cannot remove the last active superadmin', 409);
      }

      const result = await client.query(
        `UPDATE admin_users
            SET role = COALESCE($2, role),
                is_active = COALESCE($3, is_active),
                full_name = CASE WHEN $4::boolean THEN NULLIF($5, '') ELSE full_name END,
                updated_at = NOW()
          WHERE id = $1
          RETURNING id, email, role, full_name AS "fullName", is_active AS "isActive",
                    locked_until AS "lockedUntil", updated_at AS "updatedAt"`,
        [targetId, role ?? null, isActive ?? null, fullName !== undefined, fullName?.trim() ?? null]
      );

      if (isActive === false || (role !== undefined && role !== current.role)) {
        await client.query(
          'UPDATE admin_sessions SET revoked_at = COALESCE(revoked_at, NOW()) WHERE admin_user_id = $1 AND revoked_at IS NULL',
          [targetId]
        );
      }
      return result.rows[0];
    });

    res.json(updated);
  } catch (error) {
    next(error);
  }
});

router.post('/:id/revoke-sessions', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const targetId = String(req.params.id);
    const target = await pool.query('SELECT id FROM admin_users WHERE id = $1', [targetId]);
    if (!target.rows[0]) throw createError('Admin user not found', 404);
    await revokeAllAdminSessions(targetId);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

router.post('/:id/reset-password', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const targetId = String(req.params.id);
    const target = await pool.query('SELECT id, email FROM admin_users WHERE id = $1', [targetId]);
    if (!target.rows[0]) throw createError('Admin user not found', 404);
    const passwordError = validateAdminPassword(req.body?.password, target.rows[0].email);
    if (passwordError) throw createError(passwordError, 400);
    const passwordHash = await hashAdminPassword(req.body.password);

    await transaction(async client => {
      await client.query(
        `UPDATE admin_users
            SET password_hash = $2, password_changed_at = NOW(),
                failed_login_attempts = 0, locked_until = NULL, updated_at = NOW()
          WHERE id = $1`,
        [targetId, passwordHash]
      );
      await client.query(
        'UPDATE admin_sessions SET revoked_at = COALESCE(revoked_at, NOW()) WHERE admin_user_id = $1 AND revoked_at IS NULL',
        [targetId]
      );
    });
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

router.post('/:id/reset-mfa', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const targetId = String(req.params.id);
    const target = await pool.query('SELECT id, email FROM admin_users WHERE id = $1', [targetId]);
    if (!target.rows[0]) throw createError('Admin user not found', 404);
    const secret = generateMfaSecret();
    await transaction(async client => {
      await client.query(
        `UPDATE admin_users
            SET mfa_secret_encrypted = $2, mfa_enabled = false,
                mfa_enrolled_at = NULL, updated_at = NOW()
          WHERE id = $1`,
        [targetId, encryptSensitiveValue(secret)]
      );
      await client.query(
        'UPDATE admin_sessions SET revoked_at = COALESCE(revoked_at, NOW()) WHERE admin_user_id = $1 AND revoked_at IS NULL',
        [targetId]
      );
    });
    res.json({
      mfaSecret: secret,
      mfaProvisioningUri: mfaProvisioningUri(target.rows[0].email, secret),
    });
  } catch (error) {
    next(error);
  }
});

export default router;
