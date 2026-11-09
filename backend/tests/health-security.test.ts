jest.mock('../src/db/client', () => ({
  pool: { query: jest.fn().mockResolvedValue({ rows: [{ '?column?': 1 }] }) },
}));
jest.mock('../src/db/redis', () => ({
  __esModule: true,
  default: { ping: jest.fn().mockResolvedValue('PONG') },
}));
jest.mock('../src/utils/httpClient', () => ({
  HttpClientFactory: {
    getBiometricHealthClient: jest.fn(() => ({ get: jest.fn().mockResolvedValue({}) })),
    getBiometricClient: jest.fn(() => ({ getCircuitState: jest.fn(() => 'CLOSED') })),
  },
}));
jest.mock('../src/middleware/metrics', () => ({
  getMetrics: jest.fn().mockResolvedValue('# HELP dtg_test test\ndtg_test 1\n'),
}));

import express from 'express';
import request from 'supertest';
import healthRouter from '../src/routes/health';

const app = express();
app.use('/health', healthRouter);

describe('health and metrics information boundary', () => {
  const originalToken = process.env.METRICS_BEARER_TOKEN;

  afterEach(() => {
    if (originalToken === undefined) delete process.env.METRICS_BEARER_TOKEN;
    else process.env.METRICS_BEARER_TOKEN = originalToken;
  });

  it('keeps metrics disabled when no credential is configured', async () => {
    delete process.env.METRICS_BEARER_TOKEN;
    const response = await request(app).get('/health/metrics');
    expect(response.status).toBe(503);
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('rejects a wrong bearer token', async () => {
    process.env.METRICS_BEARER_TOKEN = 'correct-' + 'x'.repeat(40);
    const response = await request(app)
      .get('/health/metrics')
      .set('Authorization', 'Bearer wrong-token');
    expect(response.status).toBe(401);
    expect(response.headers['www-authenticate']).toBe('Bearer');
  });

  it('returns Prometheus data only for the configured bearer token', async () => {
    const token = 'correct-' + 'x'.repeat(40);
    process.env.METRICS_BEARER_TOKEN = token;
    const response = await request(app)
      .get('/health/metrics')
      .set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(200);
    expect(response.text).toContain('dtg_test 1');
    expect(response.headers['content-type']).toMatch(/text\/plain/);
  });
});
