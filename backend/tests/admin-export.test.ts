import express from 'express';
import request from 'supertest';
import { pool } from '../src/db/client';
import exportRouter from '../src/routes/admin/export';
import { errorHandler } from '../src/middleware/errorHandler';

jest.mock('../src/db/client', () => ({
  pool: {
    query: jest.fn(),
    connect: jest.fn(),
  },
}));

const mockedQuery = pool.query as jest.Mock;

function createApp(role: 'superadmin' | 'admin' | 'moderator' | 'observer') {
  const app = express();
  app.use((req, _res, next) => {
    req.adminUser = { id: `${role}-1`, email: `${role}@example.ge`, role };
    req.adminSession = {
      sessionId: 'session-1',
      sessionTokenHash: 'a'.repeat(64),
      csrfTokenHash: 'b'.repeat(64),
      ...req.adminUser,
    };
    next();
  });
  app.use('/api/v1/admin/export', exportRouter);
  app.use(errorHandler);
  return app;
}

describe('privacy-safe admin exports', () => {
  beforeEach(() => {
    mockedQuery.mockReset();
    process.env.MIN_K_ANONYMITY = '30';
  });

  it('exports only k-anonymous buckets and records the export first', async () => {
    mockedQuery
      .mockResolvedValueOnce({
        rows: [
          {
            age_bucket: '25-34',
            gender_bucket: 'F',
            region_bucket: 'reg_tbilisi',
            user_count: 42,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] });

    const response = await request(createApp('observer'))
      .get('/api/v1/admin/export/users-aggregated.csv');

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store, max-age=0');
    expect(response.headers['x-privacy-threshold']).toBe('30');
    expect(response.text).toContain('age_bucket,gender_bucket,region_bucket,user_count');
    expect(response.text).toContain('25-34,F,reg_tbilisi,42');
    expect(response.text).not.toMatch(/pn_hash|user_id|birth_year|trust_score/);
    expect(mockedQuery.mock.calls[0][0]).toContain('HAVING COUNT(*) >= $1');
    expect(mockedQuery.mock.calls[0][1]).toEqual([30]);
    expect(mockedQuery.mock.calls[1][0]).toContain('INSERT INTO security_events');
  });

  it('denies ordinary admins and permanently disables row-level export', async () => {
    const denied = await request(createApp('admin'))
      .get('/api/v1/admin/export/users-aggregated.csv');
    expect(denied.status).toBe(403);

    const removed = await request(createApp('superadmin'))
      .get('/api/v1/admin/export/users.csv');
    expect(removed.status).toBe(410);
    expect(mockedQuery).not.toHaveBeenCalled();
  });
});
