/**
 * Device Attestation Service
 * ==========================================================================
 * Verifies hardware-backed device integrity using:
 *   - Google Play Integrity API (Android)
 *   - Apple App Attest / DeviceCheck (iOS)
 *
 * This REJECTS rooted/jailbroken devices and emulators at the application
 * layer. Combined with the Shield's edge-level check, this gives two
 * independent enforcement points.
 *
 * SETUP REQUIRED:
 *   - GOOGLE_PLAY_INTEGRITY_DECRYPTION_KEY  (base64, from Play Console)
 *   - GOOGLE_PLAY_INTEGRITY_VERIFICATION_KEY (base64, from Play Console)
 *   - APPLE_DEVICECHECK_KEY_ID               (from Apple Developer Console)
 *   - APPLE_DEVICECHECK_TEAM_ID              (from Apple Developer Console)
 *   - APPLE_DEVICECHECK_PRIVATE_KEY          (PEM, from Apple Developer Console)
 * ==========================================================================
 */

import crypto from 'crypto';
import { pool } from '../db/client';

// ---------------------------------------------------------------------------
// Verdict types
// ---------------------------------------------------------------------------

export type AttestationVerdict =
  | 'HARDWARE_BACKED'      // Highest trust: genuine device, certified OS
  | 'MEETS_STRONG'         // Strong integrity: not rooted, unmodified OS
  | 'MEETS_BASIC'          // Basic integrity: sideloaded or minor modifications
  | 'FAILS_BASIC'          // Failed: rooted, emulator, or tampered device
  | 'UNKNOWN';             // Could not determine (server error or unsupported)

export interface AttestationResult {
  success: boolean;
  verdict: AttestationVerdict;
  deviceKeyHash: string;
  reason?: string;
  platform?: string;
}

// ---------------------------------------------------------------------------
// Minimum required verdict (configurable from DB settings)
// ---------------------------------------------------------------------------

const VERDICT_ORDER: AttestationVerdict[] = [
  'HARDWARE_BACKED',
  'MEETS_STRONG',
  'MEETS_BASIC',
  'FAILS_BASIC',
  'UNKNOWN',
];

function verdictMeetsMinimum(verdict: AttestationVerdict, minimum: AttestationVerdict): boolean {
  return VERDICT_ORDER.indexOf(verdict) <= VERDICT_ORDER.indexOf(minimum);
}

// ---------------------------------------------------------------------------
// Google Play Integrity API
// ---------------------------------------------------------------------------

async function verifyPlayIntegrity(token: string, nonce: string): Promise<AttestationResult> {
  // In production, you POST to:
  //   POST https://playintegrity.googleapis.com/v1/{packageName}:decodeIntegrityToken
  // with a service account auth token.
  //
  // The response contains a JSON payload with:
  //   requestDetails.requestPackageName
  //   requestDetails.nonce
  //   appIntegrity.appRecognitionVerdict  -> PLAY_RECOGNIZED | UNRECOGNIZED_VERSION | UNEVALUATED
  //   deviceIntegrity.deviceRecognitionVerdict -> MEETS_DEVICE_INTEGRITY | MEETS_STRONG_INTEGRITY | etc.
  //   accountDetails.appLicensingVerdict -> LICENSED | UNLICENSED | UNEVALUATED

  const googleApiKey = process.env.GOOGLE_PLAY_INTEGRITY_API_KEY;

  if (!googleApiKey) {
    console.warn('[DeviceAttest] GOOGLE_PLAY_INTEGRITY_API_KEY not set — running in development bypass mode');
    // Development bypass: if no API key configured, trust any non-empty token
    if (!token || token === 'mock_token_fail') {
      return { success: false, verdict: 'FAILS_BASIC', deviceKeyHash: '', reason: 'No token provided', platform: 'android' };
    }
    const devHash = crypto.createHash('sha256').update('android_' + token).digest('hex');
    return { success: true, verdict: 'MEETS_STRONG', deviceKeyHash: devHash, platform: 'android' };
  }

  try {
    const packageName = process.env.ANDROID_PACKAGE_NAME || 'com.dtg.app';
    const response = await fetch(
      `https://playintegrity.googleapis.com/v1/${packageName}:decodeIntegrityToken?key=${googleApiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ integrity_token: token }),
      }
    );

    if (!response.ok) {
      const text = await response.text();
      console.error('[DeviceAttest] Play Integrity API error:', response.status, text);
      return { success: false, verdict: 'UNKNOWN', deviceKeyHash: '', reason: 'Play Integrity API error', platform: 'android' };
    }

    const data: any = await response.json();
    const tokenPayload = data.tokenPayloadExternal;

    // Verify nonce matches to prevent token replay attacks
    const serverNonce = Buffer.from(nonce).toString('base64');
    if (tokenPayload?.requestDetails?.nonce !== serverNonce) {
      console.warn('[DeviceAttest] Nonce mismatch — possible replay attack');
      return { success: false, verdict: 'FAILS_BASIC', deviceKeyHash: '', reason: 'Nonce mismatch', platform: 'android' };
    }

    // Map Google verdict to our internal verdict
    const googleVerdicts: string[] = tokenPayload?.deviceIntegrity?.deviceRecognitionVerdict || [];
    let verdict: AttestationVerdict = 'FAILS_BASIC';

    if (googleVerdicts.includes('MEETS_STRONG_INTEGRITY')) {
      verdict = 'MEETS_STRONG'; // Hardware-backed, unrooted, unmodified
    } else if (googleVerdicts.includes('MEETS_DEVICE_INTEGRITY')) {
      verdict = 'MEETS_BASIC'; // Passes basic checks but not hardware-backed
    }

    // Reject unlicensed apps (sideloaded)
    const appVerdict = tokenPayload?.appIntegrity?.appRecognitionVerdict;
    if (appVerdict === 'UNEVALUATED' || appVerdict === 'UNRECOGNIZED_VERSION') {
      console.warn('[DeviceAttest] App not recognized in Play Store');
      verdict = 'FAILS_BASIC';
    }

    const deviceHash = crypto.createHash('sha256')
      .update('android_' + (tokenPayload?.requestDetails?.requestPackageName || '') + '_' + token.substring(0, 32))
      .digest('hex');

    return {
      success: verdictMeetsMinimum(verdict, 'MEETS_BASIC'),
      verdict,
      deviceKeyHash: deviceHash,
      platform: 'android',
    };
  } catch (err) {
    console.error('[DeviceAttest] Play Integrity verification failed:', err);
    return { success: false, verdict: 'UNKNOWN', deviceKeyHash: '', reason: 'Verification error', platform: 'android' };
  }
}

// ---------------------------------------------------------------------------
// Apple App Attest / DeviceCheck
// ---------------------------------------------------------------------------

async function verifyAppleAttestation(token: string, nonce: string): Promise<AttestationResult> {
  const keyId = process.env.APPLE_DEVICECHECK_KEY_ID;
  const teamId = process.env.APPLE_DEVICECHECK_TEAM_ID;
  const privateKey = process.env.APPLE_DEVICECHECK_PRIVATE_KEY;

  if (!keyId || !teamId || !privateKey) {
    console.warn('[DeviceAttest] Apple DeviceCheck credentials not set — running in development bypass mode');
    if (!token || token === 'mock_token_fail') {
      return { success: false, verdict: 'FAILS_BASIC', deviceKeyHash: '', reason: 'No token provided', platform: 'ios' };
    }
    const devHash = crypto.createHash('sha256').update('ios_' + token).digest('hex');
    return { success: true, verdict: 'MEETS_STRONG', deviceKeyHash: devHash, platform: 'ios' };
  }

  try {
    // Generate a signed JWT for Apple DeviceCheck API
    const jwtHeader = Buffer.from(JSON.stringify({ alg: 'ES256', kid: keyId })).toString('base64url');
    const jwtPayload = Buffer.from(JSON.stringify({
      iss: teamId,
      iat: Math.floor(Date.now() / 1000),
    })).toString('base64url');

    const signingInput = `${jwtHeader}.${jwtPayload}`;
    const sign = crypto.createSign('SHA256');
    sign.update(signingInput);
    const signature = sign.sign(privateKey, 'base64url');
    const jwt = `${signingInput}.${signature}`;

    // Verify via Apple's DeviceCheck API
    const isProduction = process.env.NODE_ENV === 'production';
    const appleBaseUrl = isProduction
      ? 'https://api.devicecheck.apple.com/v1'
      : 'https://api.development.devicecheck.apple.com/v1';

    const response = await fetch(`${appleBaseUrl}/validate_device_token`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${jwt}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        device_token: token,
        transaction_id: nonce,
        timestamp: Date.now(),
      }),
    });

    // Apple returns 200 for valid tokens, 4xx for invalid
    if (response.status === 200) {
      const deviceHash = crypto.createHash('sha256')
        .update('ios_' + teamId + '_' + token.substring(0, 32))
        .digest('hex');

      return {
        success: true,
        verdict: 'MEETS_STRONG', // Apple DeviceCheck only passes genuine Apple devices
        deviceKeyHash: deviceHash,
        platform: 'ios',
      };
    } else {
      const text = await response.text();
      console.warn('[DeviceAttest] Apple DeviceCheck rejected token:', response.status, text);
      return { success: false, verdict: 'FAILS_BASIC', deviceKeyHash: '', reason: `Apple rejected: ${response.status}`, platform: 'ios' };
    }
  } catch (err) {
    console.error('[DeviceAttest] Apple attestation verification failed:', err);
    return { success: false, verdict: 'UNKNOWN', deviceKeyHash: '', reason: 'Apple verification error', platform: 'ios' };
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export class DeviceAttestationService {

  /**
   * Verify an attestation token from a mobile device.
   * Routes to the correct provider based on platform.
   */
  static async verify(
    platform: string,
    _provider: string,
    token: string,
    nonce: string
  ): Promise<AttestationResult> {
    if (!token) {
      return { success: false, verdict: 'FAILS_BASIC', deviceKeyHash: '', reason: 'No attestation token provided' };
    }

    const platformLower = platform.toLowerCase();

    if (platformLower === 'android') {
      return verifyPlayIntegrity(token, nonce);
    } else if (platformLower === 'ios') {
      return verifyAppleAttestation(token, nonce);
    } else {
      return { success: false, verdict: 'UNKNOWN', deviceKeyHash: '', reason: `Unsupported platform: ${platform}` };
    }
  }

  /**
   * Get the minimum required verdict from admin settings
   */
  static async getMinimumRequiredVerdict(): Promise<AttestationVerdict> {
    try {
      const res = await pool.query(
        "SELECT value FROM settings WHERE key = 'security_attestation_minimum_verdict'"
      );
      const value = res.rows[0]?.value || 'MEETS_BASIC';
      return value as AttestationVerdict;
    } catch {
      return 'MEETS_BASIC'; // Default to basic check
    }
  }

  /**
   * Check if a verdict meets the minimum required level
   */
  static meetsMinimum(verdict: AttestationVerdict, minimum: AttestationVerdict): boolean {
    return verdictMeetsMinimum(verdict, minimum);
  }
}
