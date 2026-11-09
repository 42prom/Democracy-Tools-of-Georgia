import crypto from 'crypto';
import { Router, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcrypt';
import { transaction } from '../../db/client';
import { createError, createErrorWithCode } from '../../middleware/errorHandler';
import { requireAdmin } from '../../middleware/auth';
import { requireAdminCsrf } from '../../middleware/adminAuthorization';
import { adminLoginLimiter } from '../../middleware/rateLimit';
import {
  clearAdminSessionCookie,
  createAdminSession,
  revokeAdminSession,
  rotateAdminCsrf,
} from '../../services/adminSession';
import { SecurityService } from '../../services/security';
import { verifyMfaCode } from '../../services/adminMfa';
import { decryptSensitiveValue } from '../../services/secretEncryption';

const router = Router();
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;
const STEP_UP_MINUTES = 5;
const DUMMY_PASSWORD_HASH = '$2b$10$Um4WyJZrlplY5cCDZRslk.lHr.Ph6JLkGygl1XYG1TEQNOwhN3Y0u';

type LoginUser = {
  id: string;
  email: string;
  role: 'superadmin' | 'admin' | 'moderator' | 'observer';
  full_name: string | null;
};

function loginSubject(email: string): string {
  return crypto.createHash('sha256').update(email).digest('hex').slice(0, 16);
}

/** POST /api/v1/admin/auth/login */
router.post('/login', adminLoginLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    const totpCode = typeof req.body?.totpCode === 'string' ? req.body.totpCode.trim() : '';

    if (!email || email.length > 255 || !password || password.length > 1024) {
      throw createError('Invalid credentials', 401);
    }

    let enrollmentRequired = false;
    const authenticatedUser = await transaction<LoginUser | null>(async client => {
      const result = await client.query(
        `SELECT id, email, password_hash, role, full_name, is_active,
                failed_login_attempts, locked_until, mfa_secret_encrypted, mfa_enabled
           FROM admin_users
          WHERE lower(email) = $1
          FOR UPDATE`,
        [email]
      );
      const user = result.rows[0];

      if (!user) {
        await bcrypt.compare(password, DUMMY_PASSWORD_HASH);
        return null;
      }

      const passwordValid = await bcrypt.compare(password, user.password_hash);
      const locked = user.locked_until && new Date(user.locked_until).getTime() > Date.now();
      let mfaValid = true;
      if (passwordValid && user.is_active && !locked) {
        if (user.mfa_secret_encrypted) {
          try {
            mfaValid = verifyMfaCode(decryptSensitiveValue(user.mfa_secret_encrypted), totpCode);
          } catch {
            mfaValid = false;
          }
        } else if (process.env.ADMIN_MFA_REQUIRED === 'true') {
          enrollmentRequired = true;
          mfaValid = false;
        }
      }

      if (!passwordValid || !user.is_active || locked || !mfaValid) {
        if ((!passwordValid || !mfaValid) && !enrollmentRequired && user.is_active && !locked) {
          await client.query(
            `UPDATE admin_users
                SET failed_login_attempts = LEAST(failed_login_attempts + 1, 1000),
                    locked_until = CASE
                      WHEN failed_login_attempts + 1 >= $2
                        THEN NOW() + ($3 * INTERVAL '1 minute')
                      ELSE locked_until
                    END,
                    updated_at = NOW()
              WHERE id = $1`,
            [user.id, MAX_FAILED_ATTEMPTS, LOCKOUT_MINUTES]
          );
        }
        return null;
      }

      await client.query(
        `UPDATE admin_users
            SET last_login_at = NOW(), failed_login_attempts = 0,
                locked_until = NULL,
                mfa_enabled = CASE WHEN mfa_secret_encrypted IS NOT NULL THEN true ELSE mfa_enabled END,
                mfa_enrolled_at = CASE
                  WHEN mfa_secret_encrypted IS NOT NULL THEN COALESCE(mfa_enrolled_at, NOW())
                  ELSE mfa_enrolled_at
                END,
                updated_at = NOW()
          WHERE id = $1`,
        [user.id]
      );

      return {
        id: user.id,
        email: user.email,
        role: user.role,
        full_name: user.full_name,
      };
    });

    if (!authenticatedUser) {
      await SecurityService.logAuditEvent('ADMIN_LOGIN_FAILED', {
        subject: loginSubject(email),
        ip: req.ip,
        userAgent: String(req.headers['user-agent'] || '').slice(0, 256),
      });
      if (enrollmentRequired) {
        throw createErrorWithCode(
          'MFA_ENROLLMENT_REQUIRED',
          'This admin account must be provisioned with MFA before login',
          403
        );
      }
      throw createError('Invalid credentials', 401);
    }

    const csrfToken = await createAdminSession(authenticatedUser.id, req, res);
    await SecurityService.logAuditEvent('ADMIN_LOGIN_SUCCEEDED', {
      adminUserId: authenticatedUser.id,
      role: authenticatedUser.role,
      ip: req.ip,
    });

    res.setHeader('Cache-Control', 'no-store');
    res.json({
      csrfToken,
      user: {
        id: authenticatedUser.id,
        email: authenticatedUser.email,
        role: authenticatedUser.role,
        fullName: authenticatedUser.full_name || undefined,
      },
    });
  } catch (error) {
    next(error);
  }
});

/** GET /api/v1/admin/auth/me */
router.get('/me', requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.adminUser || !req.adminSession) {
      throw createError('Not authenticated', 401);
    }
    const csrfToken = await rotateAdminCsrf(req.adminSession.sessionId);
    res.setHeader('Cache-Control', 'no-store');
    res.json({
      csrfToken,
      user: req.adminUser,
    });
  } catch (error) {
    next(error);
  }
});

/** POST /api/v1/admin/auth/step-up */
router.post(
  '/step-up',
  requireAdmin,
  requireAdminCsrf,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.adminUser || !req.adminSession) throw createError('Not authenticated', 401);
      const password = typeof req.body?.password === 'string' ? req.body.password : '';
      const totpCode = typeof req.body?.totpCode === 'string' ? req.body.totpCode.trim() : '';
      if (!password || password.length > 1024) throw createError('Invalid credentials', 401);

      const expiresAt = await transaction<Date | null>(async client => {
        const result = await client.query(
          `SELECT password_hash, is_active, locked_until, mfa_secret_encrypted
             FROM admin_users WHERE id = $1 FOR UPDATE`,
          [req.adminUser!.id]
        );
        const user = result.rows[0];
        if (!user) return null;

        const passwordValid = await bcrypt.compare(password, user.password_hash);
        const locked = user.locked_until && new Date(user.locked_until).getTime() > Date.now();
        const mfaRequired = Boolean(user.mfa_secret_encrypted) || process.env.ADMIN_MFA_REQUIRED === 'true';
        let mfaValid = !mfaRequired;
        if (mfaRequired && user.mfa_secret_encrypted) {
          try {
            mfaValid = verifyMfaCode(decryptSensitiveValue(user.mfa_secret_encrypted), totpCode);
          } catch {
            mfaValid = false;
          }
        }

        if (!passwordValid || !mfaValid || !user.is_active || locked) {
          if (user.is_active && !locked) {
            await client.query(
              `UPDATE admin_users
                  SET failed_login_attempts = LEAST(failed_login_attempts + 1, 1000),
                      locked_until = CASE
                        WHEN failed_login_attempts + 1 >= $2
                          THEN NOW() + ($3 * INTERVAL '1 minute')
                        ELSE locked_until
                      END,
                      updated_at = NOW()
                WHERE id = $1`,
              [req.adminUser!.id, MAX_FAILED_ATTEMPTS, LOCKOUT_MINUTES]
            );
          }
          return null;
        }

        await client.query(
          `UPDATE admin_users
              SET failed_login_attempts = 0, locked_until = NULL, updated_at = NOW()
            WHERE id = $1`,
          [req.adminUser!.id]
        );
        const session = await client.query(
          `UPDATE admin_sessions
              SET step_up_expires_at = LEAST(
                    absolute_expires_at,
                    NOW() + ($3 * INTERVAL '1 minute')
                  )
            WHERE id = $1 AND admin_user_id = $2 AND revoked_at IS NULL
            RETURNING step_up_expires_at`,
          [req.adminSession!.sessionId, req.adminUser!.id, STEP_UP_MINUTES]
        );
        if (!session.rows[0]) return null;

        await SecurityService.logAuditEventInTransaction(client, 'ADMIN_STEP_UP_GRANTED', {
          adminUserId: req.adminUser!.id,
          session: req.adminSession!.sessionTokenHash.slice(0, 16),
          ip: req.ip,
        });
        return new Date(session.rows[0].step_up_expires_at);
      });

      if (!expiresAt) {
        await SecurityService.logAuditEvent('ADMIN_STEP_UP_FAILED', {
          adminUserId: req.adminUser.id,
          session: req.adminSession.sessionTokenHash.slice(0, 16),
          ip: req.ip,
        });
        throw createError('Invalid credentials', 401);
      }

      res.setHeader('Cache-Control', 'no-store');
      res.json({ expiresAt: expiresAt.toISOString() });
    } catch (error) {
      next(error);
    }
  }
);

/** POST /api/v1/admin/auth/logout */
router.post(
  '/logout',
  requireAdmin,
  requireAdminCsrf,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.adminSession || !req.adminUser) {
        throw createError('Not authenticated', 401);
      }
      await revokeAdminSession(req.adminSession.sessionId);
      clearAdminSessionCookie(res);
      await SecurityService.logAuditEvent('ADMIN_LOGOUT', {
        adminUserId: req.adminUser.id,
        session: req.adminSession.sessionTokenHash.slice(0, 16),
      });
      res.setHeader('Clear-Site-Data', '"cache"');
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }
);

export default router;
