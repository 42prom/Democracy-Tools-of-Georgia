import { NextFunction, Request, Response } from 'express';
import { AdminRole, requireAdmin, requireAdminRole } from './auth';
import { createError, createErrorWithCode } from './errorHandler';
import { verifyAdminCsrf } from '../services/adminSession';
import { SecurityService } from '../services/security';
import { getRequestId } from './requestId';

type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

interface AdminPermissionRule {
  methods: readonly HttpMethod[];
  path: RegExp;
  roles: readonly AdminRole[];
  permission: string;
}

const ALL: readonly AdminRole[] = ['superadmin', 'admin', 'moderator', 'observer'];
const OPERATORS: readonly AdminRole[] = ['superadmin', 'admin', 'moderator'];
const ADMINS: readonly AdminRole[] = ['superadmin', 'admin'];
const SUPERADMIN: readonly AdminRole[] = ['superadmin'];
const AUDITORS: readonly AdminRole[] = ['superadmin', 'observer'];

export const ADMIN_PERMISSION_RULES: readonly AdminPermissionRule[] = [
  { methods: ['GET'], path: /^\/auth\/me$/, roles: ALL, permission: 'session:read' },
  { methods: ['POST'], path: /^\/auth\/logout$/, roles: ALL, permission: 'session:logout' },
  { methods: ['POST'], path: /^\/auth\/step-up$/, roles: ALL, permission: 'session:step-up' },
  { methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'], path: /^\/users(?:\/.*)?$/, roles: SUPERADMIN, permission: 'admin-user:manage' },

  { methods: ['GET'], path: /^\/polls(?:\/.*)?$/, roles: ALL, permission: 'poll:read' },
  { methods: ['POST'], path: /^\/polls\/estimate$/, roles: ALL, permission: 'poll:estimate' },
  { methods: ['POST', 'PATCH'], path: /^\/polls(?:\/.*)?$/, roles: ADMINS, permission: 'poll:write' },
  { methods: ['DELETE'], path: /^\/polls\/[^/]+$/, roles: SUPERADMIN, permission: 'poll:delete' },

  { methods: ['GET'], path: /^\/regions(?:\/.*)?$/, roles: ALL, permission: 'region:read' },
  { methods: ['POST', 'PATCH'], path: /^\/regions(?:\/.*)?$/, roles: ADMINS, permission: 'region:write' },
  { methods: ['DELETE'], path: /^\/regions\/[^/]+$/, roles: SUPERADMIN, permission: 'region:delete' },

  { methods: ['GET'], path: /^\/insights(?:\/.*)?$/, roles: ALL, permission: 'insight:read' },
  { methods: ['GET', 'POST', 'PATCH'], path: /^\/profiles(?:\/.*)?$/, roles: ADMINS, permission: 'profile:manage' },

  { methods: ['GET'], path: /^\/messages(?:\/.*)?$/, roles: ALL, permission: 'message:read' },
  { methods: ['POST', 'PATCH'], path: /^\/messages(?:\/.*)?$/, roles: OPERATORS, permission: 'message:write' },
  { methods: ['DELETE'], path: /^\/messages\/[^/]+$/, roles: SUPERADMIN, permission: 'message:delete' },

  { methods: ['GET'], path: /^\/security-events(?:\/.*)?$/, roles: AUDITORS, permission: 'security-event:read' },
  { methods: ['GET'], path: /^\/export(?:\/.*)?$/, roles: AUDITORS, permission: 'audit:export' },
  { methods: ['GET'], path: /^\/audit(?:\/.*)?$/, roles: AUDITORS, permission: 'audit:read' },

  { methods: ['GET'], path: /^\/tickets(?:\/.*)?$/, roles: ALL, permission: 'ticket:read' },
  { methods: ['POST', 'PATCH'], path: /^\/tickets(?:\/.*)?$/, roles: OPERATORS, permission: 'ticket:write' },

  { methods: ['GET'], path: /^\/geo-blocking(?:\/.*)?$/, roles: ALL, permission: 'network-policy:read' },
  { methods: ['POST', 'PATCH'], path: /^\/geo-blocking(?:\/.*)?$/, roles: ADMINS, permission: 'network-policy:write' },
  { methods: ['DELETE'], path: /^\/geo-blocking(?:\/.*)?$/, roles: SUPERADMIN, permission: 'network-policy:delete' },

  { methods: ['GET'], path: /^\/shield(?:\/.*)?$/, roles: ALL, permission: 'shield:read' },
  { methods: ['POST'], path: /^\/shield(?:\/.*)?$/, roles: ADMINS, permission: 'shield:write' },
  { methods: ['DELETE'], path: /^\/shield(?:\/.*)?$/, roles: SUPERADMIN, permission: 'shield:delete' },

  { methods: ['GET'], path: /^\/settings(?:\/.*)?$/, roles: ADMINS, permission: 'setting:read' },
  { methods: ['POST', 'PATCH', 'PUT', 'DELETE'], path: /^\/settings(?:\/.*)?$/, roles: SUPERADMIN, permission: 'setting:write' },
];

function normalizedAdminPath(req: Request): string {
  const original = req.originalUrl.split('?')[0];
  const prefix = '/api/v1/admin';
  return original.startsWith(prefix) ? original.slice(prefix.length) || '/' : req.path;
}

export function requiresAdminStepUp(method: string, path: string): boolean {
  const normalizedMethod = method.toUpperCase();
  if (normalizedMethod === 'DELETE') return true;
  if (normalizedMethod === 'PATCH' && path === '/settings') return true;
  if (normalizedMethod === 'POST' && path === '/settings/verification-providers') return true;
  if (normalizedMethod === 'PATCH' && /^\/polls\/[^/]+\/publish$/.test(path)) return true;
  if (['POST', 'PATCH'].includes(normalizedMethod) && /^\/users(?:\/.*)?$/.test(path)) return true;
  return false;
}

export function requireAdminPermission(req: Request, res: Response, next: NextFunction): void {
  const method = req.method.toUpperCase() as HttpMethod;
  const path = normalizedAdminPath(req);
  const rule = ADMIN_PERMISSION_RULES.find(candidate =>
    candidate.methods.includes(method) && candidate.path.test(path)
  );

  if (!rule) {
    next(createError('Admin operation is not authorized by policy', 403));
    return;
  }

  requireAdminRole(...rule.roles)(req, res, next);
}

export function requireAdminCsrf(req: Request, _res: Response, next: NextFunction): void {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method.toUpperCase())) {
    next();
    return;
  }
  if (!req.adminSession || !verifyAdminCsrf(req.adminSession, req.headers['x-admin-csrf'])) {
    next(createError('Invalid or missing admin CSRF token', 403));
    return;
  }
  next();
}

export function adminSecurityBoundary(req: Request, res: Response, next: NextFunction): void {
  const path = normalizedAdminPath(req);
  if (req.method === 'POST' && path === '/auth/login') {
    next();
    return;
  }

  requireAdmin(req, res, (authError?: unknown) => {
    if (authError) {
      next(authError);
      return;
    }
    requireAdminCsrf(req, res, (csrfError?: unknown) => {
      if (csrfError) {
        next(csrfError);
        return;
      }
      requireAdminPermission(req, res, (permissionError?: unknown) => {
        if (permissionError) {
          next(permissionError);
          return;
        }

        if (['GET', 'HEAD', 'OPTIONS'].includes(req.method.toUpperCase())) {
          next();
          return;
        }

        const adminPath = normalizedAdminPath(req);
        const stepUpExpiry = req.adminSession?.stepUpExpiresAt
          ? new Date(req.adminSession.stepUpExpiresAt).getTime()
          : 0;
        if (requiresAdminStepUp(req.method, adminPath) && stepUpExpiry <= Date.now()) {
          next(createErrorWithCode(
            'ADMIN_STEP_UP_REQUIRED',
            'Recent administrator re-authentication is required',
            428
          ));
          return;
        }

        const auditPayload = {
          requestId: getRequestId(req),
          adminUserId: req.adminUser!.id,
          role: req.adminUser!.role,
          session: req.adminSession!.sessionTokenHash.slice(0, 16),
          method: req.method.toUpperCase(),
          path: normalizedAdminPath(req),
          ip: req.ip,
        };

        SecurityService.logAuditEventStrict('ADMIN_ACTION_ATTEMPT', auditPayload)
          .then(() => {
            res.once('finish', () => {
              void SecurityService.logAuditEvent('ADMIN_ACTION_RESULT', {
                ...auditPayload,
                statusCode: res.statusCode,
              });
            });
            next();
          })
          .catch(next);
      });
    });
  });
}
