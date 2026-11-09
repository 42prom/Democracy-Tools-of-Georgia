/**
 * Server-side mobile device attestation verification.
 *
 * Android uses Standard Play Integrity requestHash binding and Google's decode
 * endpoint. Apple DeviceCheck may be validated as a basic signal, but can never
 * authorize a ballot because it is not bound to the request. Apple App Attest
 * keys and monotonic assertions provide the high-assurance iOS path.
 */
import crypto from 'crypto';
import { GoogleAuth } from 'google-auth-library';
import { pool } from '../db/client';
import { getSecret } from '../config/vault';

export type AttestationVerdict =
  | 'HARDWARE_BACKED'
  | 'MEETS_STRONG'
  | 'MEETS_BASIC'
  | 'FAILS_BASIC'
  | 'UNKNOWN';

export interface AttestationResult {
  success: boolean;
  verdict: AttestationVerdict;
  deviceKeyHash: string;
  reason?: string;
  platform?: string;
}

const VERDICT_ORDER: AttestationVerdict[] = [
  'HARDWARE_BACKED',
  'MEETS_STRONG',
  'MEETS_BASIC',
  'FAILS_BASIC',
  'UNKNOWN',
];

const MAX_ATTESTATION_TOKEN_LENGTH = 50_000;
const MAX_TOKEN_AGE_MS = 2 * 60 * 1000;

function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

function verdictMeetsMinimum(
  verdict: AttestationVerdict,
  minimum: AttestationVerdict
): boolean {
  const verdictIndex = VERDICT_ORDER.indexOf(verdict);
  const minimumIndex = VERDICT_ORDER.indexOf(minimum);
  return verdictIndex >= 0 && minimumIndex >= 0 && verdictIndex <= minimumIndex;
}

function isPlaceholderToken(token: string): boolean {
  return /^(DEV_|mvp_attestation_|EMULATOR_|SIMULATOR_)/.test(token);
}

function unavailable(platform: 'android' | 'ios', reason: string): AttestationResult {
  return { success: false, verdict: 'UNKNOWN', deviceKeyHash: '', reason, platform };
}

function fail(platform: 'android' | 'ios', reason: string): AttestationResult {
  return { success: false, verdict: 'FAILS_BASIC', deviceKeyHash: '', reason, platform };
}

function tokenHash(platform: 'android' | 'ios', token: string): string {
  const secret = getSecret('DEVICE_HASH_SECRET');
  if (!secret) return '';
  return crypto.createHmac('sha256', secret).update(`${platform}:${token}`).digest('hex');
}

function developmentBypass(
  platform: 'android' | 'ios',
  token: string,
  reason: string
): AttestationResult {
  if (isProduction() || process.env.ALLOW_DEVELOPMENT_ATTESTATION_BYPASS !== 'true') {
    return unavailable(platform, reason);
  }
  if (!token || token === 'mock_token_fail') {
    return fail(platform, 'No usable development attestation token was provided');
  }

  return {
    success: true,
    verdict: 'MEETS_BASIC',
    deviceKeyHash: tokenHash(platform, token),
    reason: `Development-only bypass: ${reason}`,
    platform,
  };
}

function timingSafeStringEqual(actual: unknown, expected: string): boolean {
  if (typeof actual !== 'string') return false;
  const left = Buffer.from(actual, 'utf8');
  const right = Buffer.from(expected, 'utf8');
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

type PlayIntegrityProvider = 'play_integrity_standard' | 'play_integrity';

async function verifyPlayIntegrity(
  token: string,
  requestBinding: string,
  provider: PlayIntegrityProvider
): Promise<AttestationResult> {
  const packageName = process.env.ANDROID_PACKAGE_NAME?.trim();
  const serviceAccountJson = getSecret('GOOGLE_SERVICE_ACCOUNT_JSON')?.trim();
  const hasAmbientCredentials = Boolean(process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim());

  if (!packageName || (!serviceAccountJson && !hasAmbientCredentials)) {
    return developmentBypass(
      'android',
      token,
      'Play Integrity service-account credentials or package name are not configured'
    );
  }

  try {
    const credentials = serviceAccountJson ? JSON.parse(serviceAccountJson) : undefined;
    const auth = new GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/playintegrity'],
    });
    const authClient = await auth.getClient();
    const accessToken = await authClient.getAccessToken();
    if (!accessToken.token) {
      return unavailable('android', 'Could not obtain a Google OAuth access token');
    }

    const response = await fetch(
      `https://playintegrity.googleapis.com/v1/${encodeURIComponent(packageName)}:decodeIntegrityToken`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ integrity_token: token }),
      }
    );

    if (!response.ok) {
      console.error('[DeviceAttest] Play Integrity rejected the token:', response.status);
      return unavailable('android', `Play Integrity API returned HTTP ${response.status}`);
    }

    const data = (await response.json()) as any;
    const payload = data?.tokenPayloadExternal;
    if (!payload) return unavailable('android', 'Play Integrity response had no decoded payload');

    if (payload.requestDetails?.requestPackageName !== packageName) {
      return fail('android', 'Play Integrity package-name mismatch');
    }

    if (provider === 'play_integrity_standard') {
      if (!timingSafeStringEqual(payload.requestDetails?.requestHash, requestBinding)) {
        return fail('android', 'Play Integrity request-hash mismatch');
      }
    } else {
      const expectedNonce = Buffer.from(requestBinding, 'utf8').toString('base64url');
      if (!timingSafeStringEqual(payload.requestDetails?.nonce, expectedNonce)) {
        return fail('android', 'Play Integrity nonce mismatch');
      }
    }

    const requestTimestamp = Number(payload.requestDetails?.timestampMillis);
    if (
      !Number.isFinite(requestTimestamp) ||
      requestTimestamp > Date.now() + 30_000 ||
      Date.now() - requestTimestamp > MAX_TOKEN_AGE_MS
    ) {
      return fail('android', 'Play Integrity token is stale or has an invalid timestamp');
    }

    if (payload.appIntegrity?.appRecognitionVerdict !== 'PLAY_RECOGNIZED') {
      return fail('android', 'Application version is not recognized by Google Play');
    }
    if (payload.accountDetails?.appLicensingVerdict !== 'LICENSED') {
      return fail('android', 'Application is not licensed by Google Play');
    }

    const googleVerdicts: string[] =
      payload.deviceIntegrity?.deviceRecognitionVerdict ?? [];
    const verdict: AttestationVerdict = googleVerdicts.includes('MEETS_STRONG_INTEGRITY')
      ? 'MEETS_STRONG'
      : googleVerdicts.includes('MEETS_DEVICE_INTEGRITY')
        ? 'MEETS_BASIC'
        : 'FAILS_BASIC';

    return {
      success: verdictMeetsMinimum(verdict, 'MEETS_BASIC'),
      verdict,
      deviceKeyHash: tokenHash('android', token),
      platform: 'android',
    };
  } catch (error) {
    console.error(
      '[DeviceAttest] Play Integrity verification failed:',
      error instanceof Error ? error.message : 'unknown error'
    );
    return unavailable('android', 'Play Integrity verification error');
  }
}

async function verifyAppleDeviceCheck(token: string): Promise<AttestationResult> {
  const keyId = getSecret('APPLE_DEVICECHECK_KEY_ID');
  const teamId = getSecret('APPLE_DEVICECHECK_TEAM_ID');
  const privateKey = getSecret('APPLE_DEVICECHECK_PRIVATE_KEY')?.replace(/\\n/g, '\n');

  if (!keyId || !teamId || !privateKey) {
    return developmentBypass('ios', token, 'Apple DeviceCheck credentials are not configured');
  }

  try {
    const header = Buffer.from(JSON.stringify({ alg: 'ES256', kid: keyId })).toString(
      'base64url'
    );
    const claims = Buffer.from(
      JSON.stringify({ iss: teamId, iat: Math.floor(Date.now() / 1000) })
    ).toString('base64url');
    const signingInput = `${header}.${claims}`;
    const signature = crypto
      .sign('sha256', Buffer.from(signingInput, 'utf8'), {
        key: privateKey,
        dsaEncoding: 'ieee-p1363',
      })
      .toString('base64url');

    const appleBaseUrl = isProduction()
      ? 'https://api.devicecheck.apple.com/v1'
      : 'https://api.development.devicecheck.apple.com/v1';
    const response = await fetch(`${appleBaseUrl}/validate_device_token`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${signingInput}.${signature}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        device_token: token,
        transaction_id: crypto.randomUUID(),
        timestamp: Date.now(),
      }),
    });

    if (!response.ok) {
      console.warn('[DeviceAttest] Apple DeviceCheck rejected the token:', response.status);
      return fail('ios', `Apple DeviceCheck returned HTTP ${response.status}`);
    }

    return {
      success: false,
      // DeviceCheck validates an Apple-issued token but does not prove this app
      // instance or bind the result to the vote challenge.
      verdict: 'MEETS_BASIC',
      deviceKeyHash: tokenHash('ios', token),
      reason: 'DeviceCheck validated but is insufficient for voting; App Attest is required',
      platform: 'ios',
    };
  } catch (error) {
    console.error(
      '[DeviceAttest] Apple DeviceCheck verification failed:',
      error instanceof Error ? error.message : 'unknown error'
    );
    return unavailable('ios', 'Apple DeviceCheck verification error');
  }
}

export class DeviceAttestationService {
  static async verify(
    platform: string,
    provider: string,
    token: string,
    nonce: string,
    credentialSubject?: string
  ): Promise<AttestationResult> {
    const platformLower = platform.toLowerCase();
    if (platformLower !== 'android' && platformLower !== 'ios') {
      return {
        success: false,
        verdict: 'UNKNOWN',
        deviceKeyHash: '',
        reason: `Unsupported platform: ${platform}`,
        platform: platformLower,
      };
    }

    if (!token || token.length > MAX_ATTESTATION_TOKEN_LENGTH) {
      return fail(platformLower, 'Attestation token is missing or too large');
    }
    if (isProduction() && isPlaceholderToken(token)) {
      return fail(platformLower, 'Development attestation tokens are forbidden in production');
    }
    if (!nonce) return fail(platformLower, 'Attestation challenge nonce is required');

    const providerLower = provider.toLowerCase();
    if (platformLower === 'android') {
      if (providerLower !== 'play_integrity_standard' && providerLower !== 'play_integrity') {
        return fail('android', `Unsupported Play Integrity provider: ${provider}`);
      }
      if (isProduction() && providerLower !== 'play_integrity_standard') {
        return fail('android', 'Classic Play Integrity requests are forbidden in production');
      }
      return verifyPlayIntegrity(token, nonce, providerLower);
    }
    if (providerLower === 'app_attest') {
      const { verifyAppleAppAttest } = await import('./appleAppAttest');
      return verifyAppleAppAttest(token, nonce, credentialSubject);
    }
    if (providerLower !== 'device_check') {
      return fail('ios', `Unsupported Apple attestation provider: ${provider}`);
    }
    return verifyAppleDeviceCheck(token);
  }

  static async getMinimumRequiredVerdict(): Promise<AttestationVerdict> {
    try {
      const result = await pool.query(
        "SELECT value FROM settings WHERE key = 'security_attestation_minimum_verdict'"
      );
      const value = result.rows[0]?.value as AttestationVerdict | undefined;
      return value && VERDICT_ORDER.includes(value) ? value : 'MEETS_BASIC';
    } catch {
      return 'MEETS_BASIC';
    }
  }

  static meetsMinimum(
    verdict: AttestationVerdict,
    minimum: AttestationVerdict
  ): boolean {
    return verdictMeetsMinimum(verdict, minimum);
  }
}
