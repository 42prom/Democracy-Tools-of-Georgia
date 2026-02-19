#!/usr/bin/env npx tsx
/**
 * Enrollment Flow Simulation Script
 *
 * Simulates the complete enrollment flow step by step with detailed logging.
 * This helps identify issues in the enrollment pipeline.
 *
 * Usage: npx tsx scripts/simulate_enrollment.ts
 */

import crypto from 'crypto';
import dotenv from 'dotenv';
dotenv.config();

const API_BASE = process.env.API_URL || 'http://localhost:3000/api/v1';

// Test data
const TEST_PN = '01234567890'; // 11-digit Georgian personal number
const TEST_DOB = '1990-01-15';
const TEST_EXPIRY = '2030-12-31';
const TEST_DOC_NUMBER = 'GE123456';
const TEST_NATIONALITY = 'GEO';

// Generate a test image buffer
function generateTestImage(size: number = 15000): Buffer {
  const buf = Buffer.alloc(size);
  buf[0] = 0xff; buf[1] = 0xd8; buf[2] = 0xff; buf[3] = 0xe0;
  for (let i = 4; i < size - 2; i++) {
    buf[i] = Math.floor(Math.random() * 256);
  }
  buf[size - 2] = 0xff; buf[size - 1] = 0xd9;
  return buf;
}

async function fetchJson(url: string, options?: RequestInit): Promise<any> {
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  const text = await response.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }

  return { status: response.status, ok: response.ok, data: json };
}

function printHeader(text: string): void {
  console.log('\n' + '='.repeat(60));
  console.log(text);
  console.log('='.repeat(60));
}

function printStep(step: number, title: string): void {
  console.log(`\n${'─'.repeat(50)}`);
  console.log(`Step ${step}: ${title}`);
  console.log('─'.repeat(50));
}

function printResult(success: boolean, message: string, details?: object): void {
  const symbol = success ? '✓' : '✗';
  console.log(`  ${symbol} ${message}`);
  if (details) {
    Object.entries(details).forEach(([key, value]) => {
      console.log(`    ${key}: ${JSON.stringify(value)}`);
    });
  }
}

async function runSimulation(): Promise<void> {
  printHeader('ENROLLMENT FLOW SIMULATION');
  console.log(`API Base: ${API_BASE}`);
  console.log(`Test PN: ${TEST_PN.substring(0, 4)}****${TEST_PN.substring(7)}`);

  const docPortrait = generateTestImage(15000);
  const selfie = generateTestImage(20000);
  const docPortraitBase64 = docPortrait.toString('base64');
  const selfieBase64 = selfie.toString('base64');

  let enrollmentSessionId: string | undefined;
  let livenessNonce: string | undefined;
  let credentialToken: string | undefined;

  // Step 1: Health Check
  printStep(1, 'Health Check');
  try {
    const healthRes = await fetchJson(`${API_BASE.replace('/api/v1', '')}/`);
    printResult(healthRes.ok, `Status: ${healthRes.data.status}`, {
      postgres: healthRes.data.dependencies?.postgres?.status,
      redis: healthRes.data.dependencies?.redis?.status,
      biometric: healthRes.data.dependencies?.['biometric-service']?.status,
    });
    if (healthRes.data.status === 'unhealthy') {
      console.log('\n  FATAL: Backend not healthy. Aborting.');
      process.exit(1);
    }
  } catch (e: any) {
    printResult(false, `Health check failed: ${e.message}`);
    console.log('\n  FATAL: Cannot reach backend. Is it running?');
    process.exit(1);
  }

  // Step 2: Fetch Verification Settings
  printStep(2, 'Fetch Verification Settings');
  try {
    const settingsRes = await fetchJson(`${API_BASE}/settings/verification`);
    printResult(settingsRes.ok, 'Settings fetched', {
      nfcProvider: settingsRes.data.nfc?.provider,
      livenessProvider: settingsRes.data.liveness?.provider,
      faceMatchProvider: settingsRes.data.faceMatch?.provider,
      faceMatchThreshold: settingsRes.data.faceMatch?.minThreshold,
    });

    // Verify we're using in-house providers
    if (settingsRes.data.liveness?.provider === 'mock') {
      console.log('\n  WARNING: Liveness provider is "mock" - should be "3d_face_detector"');
    }
    if (settingsRes.data.faceMatch?.provider === 'mock') {
      console.log('\n  WARNING: Face match provider is "mock" - should be "custom_biometric_matcher"');
    }
  } catch (e: any) {
    printResult(false, `Failed to fetch settings: ${e.message}`);
  }

  // Step 3: Check User Status
  printStep(3, 'Check User Status');
  try {
    const statusRes = await fetchJson(`${API_BASE}/enrollment/status`, {
      method: 'POST',
      body: JSON.stringify({ personalNumber: TEST_PN }),
    });
    printResult(statusRes.ok, `User exists: ${statusRes.data.exists}`, {
      status: statusRes.data.status,
    });
  } catch (e: any) {
    printResult(false, `Status check failed: ${e.message}`);
  }

  // Step 4: Submit NFC Data (Start Enrollment)
  printStep(4, 'Submit NFC Data (Start Enrollment)');
  try {
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
    console.log(`    Personal Number: [REDACTED]`);
    console.log(`    Nationality: ${nfcPayload.nationality}`);
    console.log(`    DOB: ${nfcPayload.dob}`);
    console.log(`    Expiry: ${nfcPayload.expiry}`);
    console.log(`    Doc Portrait length: ${nfcPayload.docPortraitBase64.length}`);

    const nfcRes = await fetchJson(`${API_BASE}/enrollment/nfc`, {
      method: 'POST',
      body: JSON.stringify(nfcPayload),
    });

    if (nfcRes.ok) {
      enrollmentSessionId = nfcRes.data.enrollmentSessionId;
      livenessNonce = nfcRes.data.livenessNonce;
      printResult(true, 'NFC submitted successfully', {
        sessionId: enrollmentSessionId?.substring(0, 8) + '...',
        mode: nfcRes.data.mode,
        next: nfcRes.data.next,
        livenessNonce: livenessNonce ? livenessNonce.substring(0, 16) + '...' : 'NULL',
      });

      if (!livenessNonce) {
        console.log('\n  WARNING: No liveness nonce returned! This will cause verification to fail.');
      }
    } else {
      printResult(false, `NFC submission failed: ${nfcRes.data.error?.message || JSON.stringify(nfcRes.data)}`);
      console.log('\n  Cannot proceed without enrollment session.');
      process.exit(1);
    }
  } catch (e: any) {
    printResult(false, `NFC submission error: ${e.message}`);
    process.exit(1);
  }

  // Step 5: Update Profile
  printStep(5, 'Update Profile (Region Selection)');
  try {
    const profileRes = await fetchJson(`${API_BASE}/enrollment/profile`, {
      method: 'POST',
      body: JSON.stringify({
        enrollmentSessionId,
        regionCode: 'reg_tbilisi',
        firstName: 'Test',
        lastName: 'User',
      }),
    });

    printResult(profileRes.ok, profileRes.ok ? 'Profile updated' : `Failed: ${profileRes.data.error?.message}`);
  } catch (e: any) {
    printResult(false, `Profile update error: ${e.message}`);
  }

  // Step 6a: Test nonce validation (should fail)
  printStep(6, 'Verify Biometrics');
  console.log('\n  6a. Test WITHOUT nonce (should fail):');
  try {
    const noNonceRes = await fetchJson(`${API_BASE}/enrollment/verify-biometrics`, {
      method: 'POST',
      body: JSON.stringify({
        enrollmentSessionId,
        selfieBase64,
        docPortraitBase64,
        livenessData: { tier: 'active', clientConfidenceScore: 0.95 },
        // livenessNonce intentionally omitted
      }),
    });

    if (noNonceRes.status === 403 && noNonceRes.data.error?.code === 'LIVENESS_FAIL') {
      printResult(true, 'Nonce validation working (correctly rejected request without nonce)', {
        errorCode: noNonceRes.data.error.code,
      });
    } else {
      printResult(false, `Unexpected response: ${JSON.stringify(noNonceRes.data)}`);
    }
  } catch (e: any) {
    printResult(false, `Nonce test error: ${e.message}`);
  }

  // Need to get a fresh session since the previous one might be in a bad state
  console.log('\n  Creating fresh session for actual verification...');
  try {
    const nfcPayload = {
      personalNumber: TEST_PN,
      nationality: TEST_NATIONALITY,
      dob: TEST_DOB,
      expiry: TEST_EXPIRY,
      docNumber: TEST_DOC_NUMBER,
      gender: 'M',
      docPortraitBase64: docPortraitBase64,
    };

    const nfcRes = await fetchJson(`${API_BASE}/enrollment/nfc`, {
      method: 'POST',
      body: JSON.stringify(nfcPayload),
    });

    if (nfcRes.ok) {
      enrollmentSessionId = nfcRes.data.enrollmentSessionId;
      livenessNonce = nfcRes.data.livenessNonce;
      console.log(`    New session: ${enrollmentSessionId?.substring(0, 8)}...`);
      console.log(`    New nonce: ${livenessNonce?.substring(0, 16)}...`);
    }
  } catch (e: any) {
    console.log(`    Failed to create fresh session: ${e.message}`);
  }

  // Step 6b: Test WITH correct nonce
  console.log('\n  6b. Test WITH correct nonce:');
  try {
    const verifyRes = await fetchJson(`${API_BASE}/enrollment/verify-biometrics`, {
      method: 'POST',
      body: JSON.stringify({
        enrollmentSessionId,
        selfieBase64,
        docPortraitBase64,
        livenessNonce, // Include the nonce!
        livenessData: {
          tier: 'active',
          clientConfidenceScore: 0.95,
          passiveSignals: {
            naturalBlinkDetected: true,
            consistentFrames: 30,
            facePresenceScore: 0.99,
          },
        },
      }),
    });

    if (verifyRes.ok) {
      credentialToken = verifyRes.data.credentialToken;
      printResult(true, 'Verification PASSED!', {
        userId: verifyRes.data.userId,
        isNewUser: verifyRes.data.isNewUser,
        credentialToken: credentialToken ? credentialToken.substring(0, 30) + '...' : 'MISSING',
        demographics: verifyRes.data.demographics,
      });
    } else {
      const errorCode = verifyRes.data.error?.code;
      const errorMessage = verifyRes.data.error?.message;

      if (errorMessage?.includes('ECONNREFUSED') || errorMessage?.includes('biometric')) {
        printResult(false, 'Biometric service not running', {
          errorCode,
          hint: 'Start biometric service: cd biometric-service && python main.py',
        });
      } else {
        printResult(false, `Verification failed: ${errorMessage}`, {
          errorCode,
          status: verifyRes.status,
        });
      }
    }
  } catch (e: any) {
    printResult(false, `Verification error: ${e.message}`);
  }

  // Summary
  printHeader('SIMULATION SUMMARY');

  if (credentialToken) {
    console.log('  ✓ Enrollment flow completed successfully!');
    console.log('  ✓ All steps passed');
    console.log('  ✓ Credential token issued');
  } else {
    console.log('  ✗ Enrollment flow did not complete');
    console.log('\n  Checklist:');
    console.log('    - Is the backend running? (npm run dev)');
    console.log('    - Is PostgreSQL running? (docker compose up -d)');
    console.log('    - Is the biometric service running? (cd biometric-service && python main.py)');
    console.log('    - Are verification settings correct? (run fix_verification_providers.ts)');
  }

  console.log('\n' + '='.repeat(60) + '\n');
}

// Cleanup function
async function cleanup(): Promise<void> {
  const { Pool } = await import('pg');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  const pnHash = crypto
    .createHmac('sha256', process.env.PN_HASH_SECRET || 'test-secret')
    .update(`GE:${TEST_PN}`)
    .digest('hex');

  console.log('Cleaning up test data...');
  await pool.query('DELETE FROM users WHERE pn_hash = $1', [pnHash]);
  await pool.query('DELETE FROM enrollment_sessions WHERE pn_hash = $1', [pnHash]);
  await pool.query('DELETE FROM auth_rate_limits WHERE pn_hash = $1', [pnHash]);
  await pool.query('DELETE FROM security_events WHERE pn_hash = $1', [pnHash]);
  console.log('Cleanup complete.');
  await pool.end();
}

// Main
const args = process.argv.slice(2);
if (args.includes('--cleanup')) {
  cleanup().catch(console.error);
} else {
  runSimulation().catch(console.error);
}
