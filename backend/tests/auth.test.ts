import request from 'supertest';
import app from '../src/index';
import { connectRedis, closeRedis } from '../src/db/redis';
import { close as closeDb } from '../src/db/client';

describe('Auth Endpoints', () => {
  beforeAll(async () => {
    await connectRedis();
  });

  afterAll(async () => {
    await closeRedis();
    await closeDb();
  });

  describe('POST /api/v1/auth/challenge', () => {
    it('should return a nonce with TTL', async () => {
      const response = await request(app)
        .post('/api/v1/auth/challenge')
        .send({ deviceId: 'test_device_001' });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('nonce');
      expect(response.body).toHaveProperty('ttl');
      expect(response.body.ttl).toBe(60);
      expect(response.body.nonce).toHaveLength(64);
    });

    it('should reject challenge request without deviceId', async () => {
      const response = await request(app)
        .post('/api/v1/auth/challenge')
        .send({});

      expect(response.status).toBe(400);
    });

    it('should accept vote purpose', async () => {
      const response = await request(app)
        .post('/api/v1/auth/challenge')
        .send({ deviceId: 'test_device_002', purpose: 'vote' });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('nonce');
    });

    it('should reject invalid purpose', async () => {
      const response = await request(app)
        .post('/api/v1/auth/challenge')
        .send({ deviceId: 'test_device_003', purpose: 'invalid_purpose' });

      expect(response.status).toBe(400);
    });
  });


});
