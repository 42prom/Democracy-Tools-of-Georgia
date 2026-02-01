import request from 'supertest';
import app from '../src/index';

describe('Auth Endpoints', () => {
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

    it('should reject request without deviceId', async () => {
      const response = await request(app)
        .post('/api/v1/auth/challenge')
        .send({});

      expect(response.status).toBe(400);
    });
  });

  describe('POST /api/v1/auth/enroll', () => {
    it('should enroll device and return credential', async () => {
      const response = await request(app)
        .post('/api/v1/auth/enroll')
        .send({
          proof: 'mock_proof',
          deviceKey: 'test_device_key_001',
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('credential');
      expect(typeof response.body.credential).toBe('string');

      // JWT should have 3 parts (header.payload.signature)
      const parts = response.body.credential.split('.');
      expect(parts.length).toBe(3);
    });

    it('should reject enrollment without deviceKey', async () => {
      const response = await request(app)
        .post('/api/v1/auth/enroll')
        .send({ proof: 'mock_proof' });

      expect(response.status).toBe(400);
    });

    it('should allow re-enrollment with same deviceKey', async () => {
      const deviceKey = 'test_device_key_002';

      // First enrollment
      const response1 = await request(app)
        .post('/api/v1/auth/enroll')
        .send({ proof: 'mock_proof', deviceKey });

      expect(response1.status).toBe(200);

      // Second enrollment with same device
      const response2 = await request(app)
        .post('/api/v1/auth/enroll')
        .send({ proof: 'mock_proof', deviceKey });

      expect(response2.status).toBe(200);
      expect(response2.body).toHaveProperty('credential');
    });
  });
});
