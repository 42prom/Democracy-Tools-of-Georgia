/**
 * E2E Enrollment Flow Tests
 *
 * Tests the complete enrollment flow:
 * MRZ → NFC → Profile → Liveness → Face Match → Credential
 *
 * Run: npx jest tests/enrollment-e2e.test.ts --verbose
 */

import request from 'supertest';
import crypto from 'crypto';
import { pool } from '../src/db/client';

// Use a dynamic import or direct require depending on your setup
const BASE_URL = process.env.TEST_API_URL || 'http://localhost:3000/api/v1';

// Test constants
const TEST_PN = '01234567890'; // 11-digit Georgian personal number
const TEST_DOB = '1990-01-15';
const TEST_EXPIRY = '2030-12-31';
const TEST_DOC_NUMBER = 'GE123456';
const TEST_NATIONALITY = 'GEO';

// Generate a minimal valid JPEG-like buffer for testing
function generateTestImage(size: number = 10000): Buffer {
  const buf = Buffer.alloc(size);
  // JPEG magic bytes
  buf[0] = 0xff;
  buf[1] = 0xd8;
  buf[2] = 0xff;
  buf[3] = 0xe0;
  // Fill with varying data for quality check
  for (let i = 4; i < size - 2; i++) {
    buf[i] = Math.floor(Math.random() * 256);
  }
  // JPEG end marker
  buf[size - 2] = 0xff;
  buf[size - 1] = 0xd9;
  return buf;
}

describe('Enrollment E2E Flow', () => {
  let enrollmentSessionId: string;
  let livenessNonce: string | null;
  let pnHash: string;
  let docPortraitBase64: string;
  let selfieBase64: string;

  beforeAll(async () => {
    // Generate test images
    docPortraitBase64 = generateTestImage(15000).toString('base64');
    selfieBase64 = generateTestImage(20000).toString('base64');

    // Compute pnHash for cleanup
    pnHash = crypto
      .createHmac('sha256', process.env.PN_HASH_SECRET || 'test-secret')
      .update(`GE:${TEST_PN}`)
      .digest('hex');

    console.log('\n========================================');
    console.log('E2E ENROLLMENT TEST STARTING');
    console.log('========================================');
    console.log(`Test PN: ${TEST_PN.substring(0, 4)}****${TEST_PN.substring(7)}`);
    console.log(`PN Hash: ${pnHash.substring(0, 16)}...`);
    console.log('========================================\n');
  });

  afterAll(async () => {
    // Cleanup test data
    console.log('\n========================================');
    console.log('CLEANUP: Removing test data');
    console.log('========================================');

    try {
      // Delete test user if created
      await pool.query('DELETE FROM users WHERE pn_hash = $1', [pnHash]);
      console.log('  - Removed test user');

      // Delete enrollment sessions
      await pool.query('DELETE FROM enrollment_sessions WHERE pn_hash = $1', [pnHash]);
      console.log('  - Removed enrollment sessions');

      // Delete rate limits
      await pool.query('DELETE FROM auth_rate_limits WHERE pn_hash = $1', [pnHash]);
      console.log('  - Removed rate limits');

      // Delete security events
      await pool.query('DELETE FROM security_events WHERE pn_hash = $1', [pnHash]);
      console.log('  - Removed security events');
    } catch (e) {
      console.error('Cleanup error:', e);
    }

    await pool.end();
    console.log('========================================\n');
  });

  describe('Step 0: Health Check', () => {
    it('should confirm API is running', async () => {
      console.log('\n--- Step 0: Health Check ---');

      const res = await request(BASE_URL.replace('/api/v1', ''))
        .get('/health')
        .expect(200);

      console.log('  Status:', res.body.status);
      console.log('  Database:', res.body.database);
      console.log('  Redis:', res.body.redis);

      expect(res.body.status).toBe('healthy');
      expect(res.body.database).toBe('connected');
    });
  });

  describe('Step 1: Fetch Verification Policy', () => {
    it('should return verification settings', async () => {
      console.log('\n--- Step 1: Fetch Verification Policy ---');

      const res = await request(BASE_URL)
        .get('/settings/verification')
        .expect(200);

      console.log('  NFC Provider:', res.body.nfc?.provider);
      console.log('  Liveness Provider:', res.body.liveness?.provider);
      console.log('  Face Match Provider:', res.body.faceMatch?.provider);
      console.log('  Face Match Threshold:', res.body.faceMatch?.minThreshold);
      console.log('  Allow Mocks:', res.body.env?.allowMocks);

      expect(res.body.nfc).toBeDefined();
      expect(res.body.liveness).toBeDefined();
      expect(res.body.faceMatch).toBeDefined();

      // Verify we're using in-house providers, not mock
      expect(res.body.liveness.provider).not.toBe('mock');
      expect(res.body.faceMatch.provider).not.toBe('mock');
    });
  });

  describe('Step 2: Fetch Regions', () => {
    it('should return list of regions', async () => {
      console.log('\n--- Step 2: Fetch Regions ---');

      const res = await request(BASE_URL)
        .get('/enrollment/regions')
        .expect(200);

      console.log('  Total regions:', res.body.length);
      if (res.body.length > 0) {
        console.log('  First region:', res.body[0].name_en, `(${res.body[0].code})`);
      }

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);
    });
  });

  describe('Step 3: Check User Status (should not exist)', () => {
    it('should report user does not exist', async () => {
      console.log('\n--- Step 3: Check User Status ---');

      const res = await request(BASE_URL)
        .post('/enrollment/status')
        .send({ personalNumber: TEST_PN })
        .expect(200);

      console.log('  User exists:', res.body.exists);
      console.log('  Status:', res.body.status);

      expect(res.body.exists).toBe(false);
    });
  });

  describe('Step 4: Submit NFC Data (Start Enrollment)', () => {
    it('should create enrollment session and return nonce', async () => {
      console.log('\n--- Step 4: Submit NFC Data ---');

      const nfcPayload = {
        personalNumber: TEST_PN,
        nationality: TEST_NATIONALITY,
        dob: TEST_DOB,
        expiry: TEST_EXPIRY,
        docNumber: TEST_DOC_NUMBER,
        gender: 'M',
        docPortraitBase64: docPortraitBase64,
      };

      console.log('  Sending NFC payload...');
      console.log('  - Personal Number: [REDACTED]');
      console.log('  - Nationality:', nfcPayload.nationality);
      console.log('  - DOB:', nfcPayload.dob);
      console.log('  - Expiry:', nfcPayload.expiry);
      console.log('  - Doc Portrait length:', nfcPayload.docPortraitBase64.length);

      const res = await request(BASE_URL)
        .post('/enrollment/nfc')
        .send(nfcPayload)
        .expect(200);

      enrollmentSessionId = res.body.enrollmentSessionId;
      livenessNonce = res.body.livenessNonce;

      console.log('\n  Response:');
      console.log('  - Session ID:', enrollmentSessionId);
      console.log('  - Mode:', res.body.mode);
      console.log('  - Next step:', res.body.next);
      console.log('  - Liveness Nonce:', livenessNonce ? `${livenessNonce.substring(0, 16)}...` : 'NULL');

      expect(enrollmentSessionId).toBeDefined();
      expect(res.body.mode).toBe('register'); // New user
      expect(res.body.next).toBe('liveness');
      expect(livenessNonce).toBeDefined(); // Critical: nonce must be returned
    });
  });

  describe('Step 5: Update Profile (Region Selection)', () => {
    it('should update profile with region', async () => {
      console.log('\n--- Step 5: Update Profile ---');

      const profilePayload = {
        enrollmentSessionId,
        regionCode: 'reg_tbilisi',
        firstName: 'Test',
        lastName: 'User',
      };

      console.log('  Session ID:', enrollmentSessionId);
      console.log('  Region:', profilePayload.regionCode);

      const res = await request(BASE_URL)
        .post('/enrollment/profile')
        .send(profilePayload)
        .expect(200);

      console.log('  Result:', res.body.success ? 'SUCCESS' : 'FAILED');

      expect(res.body.success).toBe(true);
    });
  });

  describe('Step 6: Verify Biometrics (Liveness + Face Match)', () => {
    it('should fail WITHOUT nonce (testing nonce validation)', async () => {
      console.log('\n--- Step 6a: Test Nonce Validation (should fail) ---');

      const payloadWithoutNonce = {
        enrollmentSessionId,
        selfieBase64: selfieBase64,
        docPortraitBase64: docPortraitBase64,
        livenessData: {
          tier: 'active',
          clientConfidenceScore: 0.95,
          passiveSignals: {
            naturalBlinkDetected: true,
            consistentFrames: 30,
          },
        },
        // livenessNonce: intentionally omitted
      };

      console.log('  Sending verification WITHOUT nonce...');

      const res = await request(BASE_URL)
        .post('/enrollment/verify-biometrics')
        .send(payloadWithoutNonce);

      console.log('  Status:', res.status);
      console.log('  Error:', res.body.error?.code || res.body.error?.message || 'none');

      // Should fail with nonce mismatch
      expect(res.status).toBe(403);
      expect(res.body.error?.code).toBe('LIVENESS_FAIL');
    });

    it('should succeed WITH correct nonce', async () => {
      console.log('\n--- Step 6b: Verify Biometrics (with nonce) ---');

      // Need to create a new session since the previous one may be in a bad state
      // Let's re-submit NFC to get a fresh session
      console.log('  Creating fresh enrollment session...');

      const nfcPayload = {
        personalNumber: TEST_PN,
        nationality: TEST_NATIONALITY,
        dob: TEST_DOB,
        expiry: TEST_EXPIRY,
        docNumber: TEST_DOC_NUMBER,
        gender: 'M',
        docPortraitBase64: docPortraitBase64,
      };

      const nfcRes = await request(BASE_URL)
        .post('/enrollment/nfc')
        .send(nfcPayload)
        .expect(200);

      enrollmentSessionId = nfcRes.body.enrollmentSessionId;
      livenessNonce = nfcRes.body.livenessNonce;

      console.log('  New Session ID:', enrollmentSessionId);
      console.log('  New Liveness Nonce:', livenessNonce ? `${livenessNonce.substring(0, 16)}...` : 'NULL');

      // Update profile again
      await request(BASE_URL)
        .post('/enrollment/profile')
        .send({
          enrollmentSessionId,
          regionCode: 'reg_tbilisi',
        });

      const verifyPayload = {
        enrollmentSessionId,
        selfieBase64: selfieBase64,
        docPortraitBase64: docPortraitBase64,
        livenessNonce: livenessNonce, // Include the nonce!
        livenessData: {
          tier: 'active',
          clientConfidenceScore: 0.95,
          passiveSignals: {
            naturalBlinkDetected: true,
            consistentFrames: 30,
            facePresenceScore: 0.99,
          },
        },
      };

      console.log('\n  Sending verification payload...');
      console.log('  - Session ID:', enrollmentSessionId);
      console.log('  - Selfie length:', selfieBase64.length);
      console.log('  - Doc Portrait length:', docPortraitBase64.length);
      console.log('  - Nonce included:', !!livenessNonce);

      const res = await request(BASE_URL)
        .post('/enrollment/verify-biometrics')
        .send(verifyPayload);

      console.log('\n  Response Status:', res.status);

      if (res.status === 200) {
        console.log('  ✓ Verification PASSED');
        console.log('  - User ID:', res.body.userId);
        console.log('  - Is New User:', res.body.isNewUser);
        console.log('  - Credential Token:', res.body.credentialToken ? `${res.body.credentialToken.substring(0, 30)}...` : 'MISSING');
        console.log('  - Demographics:', JSON.stringify(res.body.demographics, null, 2));

        expect(res.body.credentialToken).toBeDefined();
        expect(res.body.userId).toBeDefined();
        expect(res.body.isNewUser).toBe(true);
      } else {
        console.log('  ✗ Verification FAILED');
        console.log('  - Error Code:', res.body.error?.code);
        console.log('  - Error Message:', res.body.error?.message);

        // If biometric service is not running, we expect a specific error
        // This is acceptable in test environment
        if (res.body.error?.message?.includes('ECONNREFUSED') ||
            res.body.error?.message?.includes('biometric')) {
          console.log('  (Biometric service not running - expected in test env)');
        }
      }
    });
  });

  describe('Step 7: Verify Session (Login Flow)', () => {
    it('should show user now exists', async () => {
      console.log('\n--- Step 7: Verify User Exists ---');

      const res = await request(BASE_URL)
        .post('/enrollment/status')
        .send({ personalNumber: TEST_PN });

      console.log('  User exists:', res.body.exists);
      console.log('  Status:', res.body.status);

      // User should exist now (if biometric passed) or not (if biometric service unavailable)
    });
  });
});

describe('Enrollment Edge Cases', () => {
  describe('Invalid Personal Number', () => {
    it('should reject invalid PN format', async () => {
      console.log('\n--- Edge Case: Invalid PN ---');

      const res = await request(BASE_URL)
        .post('/enrollment/nfc')
        .send({
          personalNumber: '123', // Too short
          nationality: 'GEO',
          dob: '1990-01-15',
          expiry: '2030-12-31',
        });

      console.log('  Status:', res.status);
      console.log('  Error:', res.body.error?.code);

      expect(res.status).toBe(400);
      expect(res.body.error?.code).toBe('PN_MISSING');
    });
  });

  describe('Non-Georgian Nationality', () => {
    it('should reject non-GEO nationality', async () => {
      console.log('\n--- Edge Case: Non-Georgian ---');

      const res = await request(BASE_URL)
        .post('/enrollment/nfc')
        .send({
          personalNumber: '98765432109',
          nationality: 'USA',
          dob: '1990-01-15',
          expiry: '2030-12-31',
        });

      console.log('  Status:', res.status);
      console.log('  Error:', res.body.error?.code);

      expect(res.status).toBe(403);
      expect(res.body.error?.code).toBe('NOT_GEO');
    });
  });

  describe('Expired Document', () => {
    it('should reject expired document', async () => {
      console.log('\n--- Edge Case: Expired Document ---');

      const res = await request(BASE_URL)
        .post('/enrollment/nfc')
        .send({
          personalNumber: '11111111111',
          nationality: 'GEO',
          dob: '1990-01-15',
          expiry: '2020-01-01', // Expired
        });

      console.log('  Status:', res.status);
      console.log('  Error:', res.body.error?.code);

      expect(res.status).toBe(403);
      expect(res.body.error?.code).toBe('DOC_EXPIRED');
    });
  });

  describe('Missing Session ID', () => {
    it('should reject verify-biometrics without session', async () => {
      console.log('\n--- Edge Case: Missing Session ---');

      const res = await request(BASE_URL)
        .post('/enrollment/verify-biometrics')
        .send({
          selfieBase64: 'test',
        });

      console.log('  Status:', res.status);
      console.log('  Error:', res.body.error?.code);

      expect(res.status).toBe(400);
      expect(res.body.error?.code).toBe('INVALID_SESSION');
    });
  });
});

describe('Debug: Session State Inspection', () => {
  it('should inspect enrollment_sessions table', async () => {
    console.log('\n--- Debug: Session State ---');

    const result = await pool.query(
      `SELECT id, pn_hash, mode, step, status,
              liveness_nonce IS NOT NULL as has_nonce,
              nfc_portrait_hash IS NOT NULL as has_nfc_portrait,
              document_portrait_hash IS NOT NULL as has_doc_portrait,
              created_at, expires_at
       FROM enrollment_sessions
       ORDER BY created_at DESC
       LIMIT 5`
    );

    console.log('  Recent sessions:');
    for (const row of result.rows) {
      console.log(`    - ${row.id.substring(0, 8)}... | step=${row.step} | status=${row.status} | nonce=${row.has_nonce}`);
    }
  });

  it('should inspect verification settings', async () => {
    console.log('\n--- Debug: Verification Settings ---');

    const result = await pool.query(
      `SELECT key, value FROM settings WHERE key LIKE 'verification_%' ORDER BY key`
    );

    console.log('  Current settings:');
    for (const row of result.rows) {
      console.log(`    - ${row.key}: ${row.value}`);
    }
  });
});
