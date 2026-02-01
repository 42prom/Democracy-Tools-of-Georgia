import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { VotingCredential, DemographicData } from '../types/credentials';
import { query } from '../db/client';

const JWT_SECRET = process.env.JWT_SECRET || 'CHANGE_ME_IN_PRODUCTION';
const JWT_EXPIRY = '7d'; // 7 days

/**
 * Generate device key thumbprint (SHA-256 hash)
 */
export function getDeviceKeyThumbprint(deviceKey: string): string {
  return crypto.createHash('sha256').update(deviceKey).digest('hex');
}

/**
 * Generate mock demographic data (Phase 0 only)
 * Phase 1 will use real data from NFC passport
 */
function generateMockDemographics(): DemographicData {
  const ageBuckets: DemographicData['age_bucket'][] = [
    '18-24',
    '25-34',
    '35-44',
    '45-54',
    '55-64',
    '65+',
  ];
  const genders: DemographicData['gender'][] = ['M', 'F', 'O'];

  return {
    age_bucket: ageBuckets[Math.floor(Math.random() * ageBuckets.length)],
    gender: genders[Math.floor(Math.random() * genders.length)],
    region_codes: ['reg_tbilisi'], // Mock: always Tbilisi
    citizenship: 'GEO',
  };
}

/**
 * Enroll a new device and issue voting credential
 * Phase 0: Mock implementation with random demographics
 * Phase 1: Will verify NFC + liveness before issuing
 */
export async function enrollDevice(deviceKey: string): Promise<string> {
  const thumbprint = getDeviceKeyThumbprint(deviceKey);

  // Check if user already exists
  const existingUser = await query(
    'SELECT id FROM users WHERE device_key_thumbprint = $1',
    [thumbprint]
  );

  let userId: string;

  if (existingUser.rows.length === 0) {
    // Create new user
    const result = await query(
      `INSERT INTO users (device_key_thumbprint, risk_score, enrolled_at, last_active_at)
       VALUES ($1, $2, NOW(), NOW())
       RETURNING id`,
      [thumbprint, 0]
    );
    userId = result.rows[0].id;
  } else {
    userId = existingUser.rows[0].id;

    // Update last active
    await query('UPDATE users SET last_active_at = NOW() WHERE id = $1', [
      userId,
    ]);
  }

  // Generate mock demographics (Phase 0)
  const demographics = generateMockDemographics();

  // Create JWT credential
  const credential = issueCredential(thumbprint, demographics);

  return credential;
}

/**
 * Issue a JWT voting credential
 */
export function issueCredential(
  deviceKeyThumbprint: string,
  demographics: DemographicData
): string {
  const payload: VotingCredential = {
    iss: 'dtfg-identity-service',
    sub: deviceKeyThumbprint,
    data: demographics,
    exp: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60, // 7 days
  };

  return jwt.sign(payload, JWT_SECRET, { algorithm: 'HS256' });
}

/**
 * Verify and decode a JWT credential
 */
export function verifyCredential(token: string): VotingCredential {
  try {
    const decoded = jwt.verify(token, JWT_SECRET, {
      algorithms: ['HS256'],
    }) as VotingCredential;

    return decoded;
  } catch (error) {
    throw new Error('Invalid or expired credential');
  }
}
