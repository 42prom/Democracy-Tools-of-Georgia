import { NextFunction, Request, Response } from 'express';
import { requireAdmin, requireAdminRole } from '../src/middleware/auth';
import { AppError } from '../src/middleware/errorHandler';
import { authenticateAdminSession } from '../src/services/adminSession';
import {
  ADMIN_PERMISSION_RULES,
  requireAdminCsrf,
  requireAdminPermission,
  requiresAdminStepUp,
} from '../src/middleware/adminAuthorization';

jest.mock('../src/services/adminSession', () => ({
  authenticateAdminSession: jest.fn(),
  verifyAdminCsrf: jest.fn((_identity, token) => token === 'valid-csrf'),
}));

const mockedAuthenticate = authenticateAdminSession as jest.MockedFunction<typeof authenticateAdminSession>;

function emptyRequest(): Request {
  return { headers: {} } as Request;
}

function nextError(next: NextFunction): AppError {
  return (next as jest.Mock).mock.calls[0][0] as AppError;
}

describe('admin authentication and role authorization', () => {
  beforeEach(() => mockedAuthenticate.mockReset());

  it('accepts only a live server-side admin session', async () => {
    mockedAuthenticate.mockResolvedValue({
      sessionId: 'session-1',
      sessionTokenHash: 'a'.repeat(64),
      csrfTokenHash: 'b'.repeat(64),
      id: 'observer-1',
      email: 'observer@example.ge',
      role: 'observer',
    });
    const req = emptyRequest();
    const next = jest.fn() as NextFunction;

    requireAdmin(req, {} as Response, next);
    await new Promise(setImmediate);

    expect(next).toHaveBeenCalledWith();
    expect(req.adminUser).toEqual({
      id: 'observer-1',
      email: 'observer@example.ge',
      role: 'observer',
      fullName: undefined,
    });
  });

  it('rejects a missing, expired, revoked, locked, or disabled session', async () => {
    mockedAuthenticate.mockResolvedValue(null);
    const next = jest.fn() as NextFunction;
    requireAdmin(emptyRequest(), {} as Response, next);
    await new Promise(setImmediate);
    expect(nextError(next).statusCode).toBe(401);
  });

  it('distinguishes missing authentication from insufficient role', () => {
    const roleGuard = requireAdminRole('superadmin');
    const unauthenticatedNext = jest.fn() as NextFunction;
    roleGuard(emptyRequest(), {} as Response, unauthenticatedNext);
    expect(nextError(unauthenticatedNext).statusCode).toBe(401);

    const req = emptyRequest();
    req.adminUser = { id: 'observer-1', email: 'observer@example.ge', role: 'observer' };
    const forbiddenNext = jest.fn() as NextFunction;
    roleGuard(req, {} as Response, forbiddenNext);
    expect(nextError(forbiddenNext).statusCode).toBe(403);
  });
});

describe('admin default-deny policy', () => {
  function policyRequest(method: string, path: string, role: 'superadmin' | 'admin' | 'moderator' | 'observer'): Request {
    return {
      method,
      originalUrl: `/api/v1/admin${path}`,
      path,
      headers: {},
      adminUser: { id: `${role}-1`, email: `${role}@example.ge`, role },
    } as Request;
  }

  it('has unique permission labels and an explicit rule set', () => {
    expect(ADMIN_PERMISSION_RULES.length).toBeGreaterThanOrEqual(20);
    expect(new Set(ADMIN_PERMISSION_RULES.map(rule => rule.permission)).size).toBeGreaterThanOrEqual(15);
  });

  it.each([
    ['observer', 'GET', '/polls', undefined],
    ['observer', 'POST', '/polls', 403],
    ['moderator', 'POST', '/messages', undefined],
    ['moderator', 'PATCH', '/settings', 403],
    ['admin', 'PATCH', '/regions/region-1', undefined],
    ['admin', 'DELETE', '/regions/region-1', 403],
    ['superadmin', 'DELETE', '/regions/region-1', undefined],
    ['observer', 'GET', '/security-events/summary', undefined],
    ['admin', 'GET', '/security-events/summary', 403],
    ['superadmin', 'POST', '/new-unclassified-control', 403],
  ] as const)('%s %s %s follows the policy', (role, method, path, expectedStatus) => {
    const next = jest.fn() as NextFunction;
    requireAdminPermission(policyRequest(method, path, role), {} as Response, next);
    if (expectedStatus === undefined) expect(next).toHaveBeenCalledWith();
    else expect(nextError(next).statusCode).toBe(expectedStatus);
  });

  it('requires CSRF on every unsafe request and never on safe reads', () => {
    const identity = {
      sessionId: 'session-1', sessionTokenHash: 'a'.repeat(64), csrfTokenHash: 'b'.repeat(64),
      id: 'admin-1', email: 'admin@example.ge', role: 'admin' as const,
    };
    const denied = { method: 'PATCH', headers: {}, adminSession: identity } as unknown as Request;
    const deniedNext = jest.fn() as NextFunction;
    requireAdminCsrf(denied, {} as Response, deniedNext);
    expect(nextError(deniedNext).statusCode).toBe(403);

    const allowed = { method: 'PATCH', headers: { 'x-admin-csrf': 'valid-csrf' }, adminSession: identity } as unknown as Request;
    const allowedNext = jest.fn() as NextFunction;
    requireAdminCsrf(allowed, {} as Response, allowedNext);
    expect(allowedNext).toHaveBeenCalledWith();

    const read = { method: 'GET', headers: {} } as unknown as Request;
    const readNext = jest.fn() as NextFunction;
    requireAdminCsrf(read, {} as Response, readNext);
    expect(readNext).toHaveBeenCalledWith();
  });

  it('requires recent re-authentication for critical control-plane changes', () => {
    expect(requiresAdminStepUp('PATCH', '/polls/550e8400-e29b-41d4-a716-446655440000/publish')).toBe(true);
    expect(requiresAdminStepUp('DELETE', '/polls/550e8400-e29b-41d4-a716-446655440000')).toBe(true);
    expect(requiresAdminStepUp('PATCH', '/settings')).toBe(true);
    expect(requiresAdminStepUp('POST', '/users')).toBe(true);
    expect(requiresAdminStepUp('POST', '/settings/blockchain/test')).toBe(false);
    expect(requiresAdminStepUp('POST', '/auth/step-up')).toBe(false);
  });
});
