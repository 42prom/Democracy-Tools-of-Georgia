import crypto from 'crypto';
import express from 'express';
import request from 'supertest';
import { pool, transaction } from '../src/db/client';
import auditRouter from '../src/routes/admin/audit';
import { errorHandler } from '../src/middleware/errorHandler';

jest.mock('../src/db/client', () => ({
  pool: { query: jest.fn(), connect: jest.fn() },
  transaction: jest.fn(),
}));

const mockedQuery = pool.query as jest.Mock;
const mockedTransaction = transaction as jest.Mock;

function appFor(role: 'superadmin' | 'admin' | 'observer') {
  const app = express();
  app.use((req, _res, next) => {
    req.adminUser = { id: `${role}-1`, email: `${role}@example.ge`, role };
    req.adminSession = {
      sessionId: 'session-1', sessionTokenHash: 'a'.repeat(64), csrfTokenHash: 'b'.repeat(64),
      ...req.adminUser,
    };
    next();
  });
  app.use('/api/v1/admin/audit', auditRouter);
  app.use(errorHandler);
  return app;
}

function chainedRow(id: number, eventType: string, payload: string, previousHash: string, createdAt: string) {
  const rowHash = crypto.createHash('sha256')
    .update(`${eventType}|${payload}|${previousHash}|${createdAt}`)
    .digest('hex');
  return { id, event_type: eventType, payload, previous_hash: previousHash, row_hash: rowHash, created_at: createdAt };
}

describe('administrative audit API', () => {
  beforeEach(() => {
    mockedQuery.mockReset();
    mockedTransaction.mockReset();
    mockedTransaction.mockImplementation(async (callback: any) => callback({
      query: (sql: string, params?: unknown[]) => sql.startsWith('SET TRANSACTION')
        ? Promise.resolve({ rows: [] })
        : mockedQuery(sql, params),
    }));
  });

  it('returns bounded, parsed admin events only to auditors', async () => {
    mockedQuery
      .mockResolvedValueOnce({ rows: [{
        id: 9, eventType: 'ADMIN_ACTION_RESULT', payload: '{"statusCode":204}',
        previousHash: 'a'.repeat(64), rowHash: 'b'.repeat(64), createdAt: '2026-09-03T00:00:00.000Z',
      }] })
      .mockResolvedValueOnce({ rows: [{ count: 1 }] });
    const response = await request(appFor('observer')).get('/api/v1/admin/audit?limit=1000');
    expect(response.status).toBe(200);
    expect(response.body.limit).toBe(100);
    expect(response.body.entries[0].payload).toEqual({ statusCode: 204 });
    expect(mockedQuery.mock.calls[0][0]).toContain("event_type LIKE 'ADMIN_%'");

    const denied = await request(appFor('admin')).get('/api/v1/admin/audit');
    expect(denied.status).toBe(403);
  });

  it('verifies a valid chain and identifies the first corrupted row', async () => {
    const first = chainedRow(1, 'ADMIN_LOGIN_SUCCEEDED', '{"adminUserId":"a"}', '0'.repeat(64), '2026-09-03T00:00:00.000Z');
    const second = chainedRow(2, 'ADMIN_LOGOUT', '{"adminUserId":"a"}', first.row_hash, '2026-09-03T00:01:00.000Z');
    mockedQuery
      .mockResolvedValueOnce({ rows: [first, second] })
      .mockResolvedValueOnce({ rows: [] });
    const valid = await request(appFor('superadmin')).get('/api/v1/admin/audit/verify');
    expect(valid.status).toBe(200);
    expect(valid.body).toEqual(expect.objectContaining({ valid: true, entries: 2, brokenAt: null, headHash: second.row_hash }));

    mockedQuery.mockResolvedValueOnce({ rows: [first, { ...second, row_hash: 'f'.repeat(64) }] });
    const invalid = await request(appFor('superadmin')).get('/api/v1/admin/audit/verify');
    expect(invalid.body).toEqual(expect.objectContaining({ valid: false, brokenAt: 2 }));
  });
});
