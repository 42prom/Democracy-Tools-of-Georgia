jest.mock('../src/db/client', () => ({
  pool: { query: jest.fn() },
}));

jest.mock('google-auth-library', () => ({
  GoogleAuth: jest.fn().mockImplementation(() => ({
    getClient: jest.fn().mockResolvedValue({
      getAccessToken: jest.fn().mockResolvedValue({ token: 'test-oauth-token' }),
    }),
  })),
}));

import { generateKeyPairSync } from 'crypto';
import { pool } from '../src/db/client';
import { DeviceAttestationService } from '../src/services/deviceAttestation';

const ORIGINAL_ENV = { ...process.env };
const ORIGINAL_FETCH = global.fetch;
const mockedPoolQuery = pool.query as jest.Mock;

function configureProductionAndroid(): void {
  process.env.NODE_ENV = 'production';
  process.env.ANDROID_PACKAGE_NAME = 'messaging.dtg';
  process.env.GOOGLE_SERVICE_ACCOUNT_JSON = JSON.stringify({
    client_email: 'integrity@example.invalid',
    private_key: 'test-key-material',
  });
}

function playIntegrityResponse(requestHash: string): any {
  return {
    ok: true,
    json: jest.fn().mockResolvedValue({
      tokenPayloadExternal: {
        requestDetails: {
          requestPackageName: 'messaging.dtg',
          requestHash,
          timestampMillis: Date.now().toString(),
        },
        appIntegrity: { appRecognitionVerdict: 'PLAY_RECOGNIZED' },
        accountDetails: { appLicensingVerdict: 'LICENSED' },
        deviceIntegrity: {
          deviceRecognitionVerdict: [
            'MEETS_DEVICE_INTEGRITY',
            'MEETS_STRONG_INTEGRITY',
          ],
        },
      },
    }),
  };
}

describe('DeviceAttestationService fail-closed behavior', () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
    delete process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
    delete process.env.ANDROID_PACKAGE_NAME;
    delete process.env.ALLOW_DEVELOPMENT_ATTESTATION_BYPASS;
    delete process.env.APPLE_DEVICECHECK_KEY_ID;
    delete process.env.APPLE_DEVICECHECK_TEAM_ID;
    delete process.env.APPLE_DEVICECHECK_PRIVATE_KEY;
    process.env.DEVICE_HASH_SECRET = 'device-hash-secret-for-unit-tests-1234567890';
    process.env.VOTER_HASH_SECRET = 'voter-hash-secret-for-unit-tests-1234567890';
    mockedPoolQuery.mockReset();
    global.fetch = jest.fn();
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
    global.fetch = ORIGINAL_FETCH;
  });

  it('rejects development placeholder tokens in production', async () => {
    process.env.NODE_ENV = 'production';
    const result = await DeviceAttestationService.verify(
      'android',
      'play_integrity_standard',
      'DEV_ANDROID_fake',
      'nonce'
    );

    expect(result.success).toBe(false);
    expect(result.verdict).toBe('FAILS_BASIC');
    expect(result.reason).toMatch(/forbidden in production/);
  });

  it('does not trust arbitrary non-empty tokens when production credentials are missing', async () => {
    process.env.NODE_ENV = 'production';
    const result = await DeviceAttestationService.verify(
      'android',
      'play_integrity_standard',
      'opaque-token',
      'nonce'
    );

    expect(result.success).toBe(false);
    expect(result.verdict).toBe('UNKNOWN');
    expect(result.reason).toMatch(/not configured/);
  });

  it('keeps the development bypass opt-in and never labels it strong', async () => {
    process.env.NODE_ENV = 'development';
    process.env.ALLOW_DEVELOPMENT_ATTESTATION_BYPASS = 'true';
    const result = await DeviceAttestationService.verify(
      'android',
      'play_integrity_standard',
      'DEV_ANDROID_local-only',
      'nonce'
    );

    expect(result.success).toBe(true);
    expect(result.verdict).toBe('MEETS_BASIC');
    expect(result.reason).toMatch(/Development-only bypass/);
  });

  it('rejects an unknown verdict instead of accidentally passing it', () => {
    expect(DeviceAttestationService.meetsMinimum('UNKNOWN', 'MEETS_BASIC')).toBe(false);
    expect(DeviceAttestationService.meetsMinimum('MEETS_STRONG', 'MEETS_BASIC')).toBe(true);
  });

  it('accepts a fresh Standard request only when requestHash matches', async () => {
    configureProductionAndroid();
    const requestBinding = 'a'.repeat(64);
    global.fetch = jest.fn().mockResolvedValue(playIntegrityResponse(requestBinding));

    const result = await DeviceAttestationService.verify(
      'android',
      'play_integrity_standard',
      'opaque-google-token',
      requestBinding
    );

    expect(result.success).toBe(true);
    expect(result.verdict).toBe('MEETS_STRONG');
  });

  it('rejects a Standard token bound to a different request hash', async () => {
    configureProductionAndroid();
    global.fetch = jest.fn().mockResolvedValue(playIntegrityResponse('b'.repeat(64)));

    const result = await DeviceAttestationService.verify(
      'android',
      'play_integrity_standard',
      'opaque-google-token',
      'a'.repeat(64)
    );

    expect(result.success).toBe(false);
    expect(result.reason).toMatch(/request-hash mismatch/);
  });

  it('forbids Classic Play Integrity in production', async () => {
    configureProductionAndroid();

    const result = await DeviceAttestationService.verify(
      'android',
      'play_integrity',
      'opaque-google-token',
      'a'.repeat(64)
    );

    expect(result.success).toBe(false);
    expect(result.reason).toMatch(/Classic Play Integrity requests are forbidden/);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('does not authorize voting with an unbound DeviceCheck token', async () => {
    const apple = generateKeyPairSync('ec', {
      namedCurve: 'prime256v1',
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      publicKeyEncoding: { type: 'spki', format: 'pem' },
    });
    process.env.NODE_ENV = 'production';
    process.env.APPLE_DEVICECHECK_KEY_ID = 'ABC123DEFG';
    process.env.APPLE_DEVICECHECK_TEAM_ID = 'TEAM123456';
    process.env.APPLE_DEVICECHECK_PRIVATE_KEY = apple.privateKey;
    global.fetch = jest.fn().mockResolvedValue({ ok: true });

    const result = await DeviceAttestationService.verify(
      'ios',
      'device_check',
      'apple-device-token',
      'a'.repeat(64)
    );

    expect(result.success).toBe(false);
    expect(result.verdict).toBe('MEETS_BASIC');
    expect(result.reason).toMatch(/insufficient for voting/);
  });

  it('rejects malformed App Attest evidence as an integrity failure', async () => {
    const result = await DeviceAttestationService.verify(
      'ios',
      'app_attest',
      '{not-json',
      'request-binding',
      'credential-subject'
    );

    expect(result.success).toBe(false);
    expect(result.verdict).toBe('FAILS_BASIC');
    expect(result.reason).toMatch(/valid JSON/);
    expect(mockedPoolQuery).not.toHaveBeenCalled();
  });

  it('never accepts an App Attest key without an authenticated subject', async () => {
    const result = await DeviceAttestationService.verify(
      'ios',
      'app_attest',
      JSON.stringify({
        version: 1,
        keyId: Buffer.alloc(32).toString('base64'),
        assertion: Buffer.from('assertion').toString('base64'),
      }),
      'request-binding'
    );

    expect(result.success).toBe(false);
    expect(result.reason).toMatch(/authenticated credential subject/);
    expect(mockedPoolQuery).not.toHaveBeenCalled();
  });

  it('rejects an unregistered key when no Apple attestation object is supplied', async () => {
    mockedPoolQuery.mockResolvedValueOnce({ rows: [] });
    const result = await DeviceAttestationService.verify(
      'ios',
      'app_attest',
      JSON.stringify({
        version: 1,
        keyId: Buffer.alloc(32, 7).toString('base64'),
        assertion: Buffer.from('assertion').toString('base64'),
      }),
      'request-binding',
      'credential-subject'
    );

    expect(result.success).toBe(false);
    expect(result.verdict).toBe('FAILS_BASIC');
    expect(result.reason).toMatch(/key is not registered/);
    expect(mockedPoolQuery).toHaveBeenCalledTimes(1);
  });
});
