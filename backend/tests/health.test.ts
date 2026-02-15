import request from 'supertest';
import app from '../src/index';

import { connectRedis, closeRedis } from '../src/db/redis';
import { close as closeDb } from '../src/db/client';

describe('Health Endpoint', () => {
  beforeAll(async () => {
    try {
      await connectRedis();
    } catch (e) {
      console.error('Failed to connect to Redis in test setup', e);
    }
  });

  afterAll(async () => {
    await closeRedis();
    await closeDb();
  });

  it('should return 200 and health status', async () => {
    // Health endpoint is mounted at root '/'
    const response = await request(app).get('/');

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('status');
    expect(response.body).toHaveProperty('timestamp');
    expect(response.body).toHaveProperty('dependencies');
  });

  it('should report database and redis status', async () => {
    const response = await request(app).get('/');

    expect(response.body.dependencies).toHaveProperty('postgres');
    expect(response.body.dependencies).toHaveProperty('redis');
  });
});
