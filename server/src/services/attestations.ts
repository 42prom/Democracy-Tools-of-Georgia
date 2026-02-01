import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { CONFIG } from '../config';
import { query } from '../db/client';

// Mock demographics for Phase 0
function generateMockDemographics() {
  const ageBuckets = ['18-24', '25-34', '35-44', '45-54', '55-64', '65+'] as const;
  const genders = ['M', 'F', 'O'] as const;

  return {
    age_bucket: ageBuckets[Math.floor(Math.random() * ageBuckets.length)],
    gender: genders[Math.floor(Math.random() * genders.length)],
    region_codes: ['reg_tbilisi'],
    citizenship: 'GEO' as const,
  };
}

/**
 * Issue attestation (voting credential)
 * Phase 0: Mock implementation
 */
export async function issueAttestation(deviceKey: string) {
  const thumbprint = crypto.createHash('sha256').update(deviceKey).digest('hex');

  // Upsert user
  await query(
    `INSERT INTO users (device_key_thumbprint, risk_score, enrolled_at, last_active_at)
     VALUES ($1, 0, NOW(), NOW())
     ON CONFLICT (device_key_thumbprint)
     DO UPDATE SET last_active_at = NOW()`,
    [thumbprint]
  );

  // Generate credential with mock demographics
  const demographics = generateMockDemographics();

  const payload = {
    iss: 'dtfg-identity-service',
    sub: thumbprint,
    data: demographics,
    exp: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60, // 7 days
  };

  const attestation = jwt.sign(payload, CONFIG.jwt.secret, { algorithm: 'HS256' });

  return { attestation };
}

/**
 * Verify attestation JWT
 */
export function verifyAttestation(token: string) {
  try {
    const decoded = jwt.verify(token, CONFIG.jwt.secret, { algorithms: ['HS256'] });
    return decoded as any;
  } catch {
    throw new Error('Invalid or expired attestation');
  }
}

/**
 * Verify that the attestation's votePayloadHash matches what we expect for this vote.
 * NOTE: This must match how votePayloadHash is produced when the attestation/session is created.
 *
 * We use: sha256(`${pollId}|${optionId}|${timestampBucket}`)
 * and compare to expectedHash from the attestation.
 */
export function verifyVotePayloadHash(
  pollId: string,
  optionId: string,
  timestampBucket: string,
  expectedHash: string
): boolean {
  const raw = `${pollId}|${optionId}|${timestampBucket}`;
  const actual = crypto.createHash('sha256').update(raw).digest('hex');

  const cleaned = expectedHash?.startsWith('0x') ? expectedHash.slice(2) : expectedHash;
  return actual === cleaned;
}

// Optional: export a type so votes.ts can type it if needed
export type SessionAttestation = {
  pollId?: string;
  votePayloadHash?: string;
  issuedAt?: number;
  ttlSec?: number;
  data?: {
    age_bucket?: string;
    gender?: string;
    region_codes?: string[];
    citizenship?: string;
  };
  [k: string]: any;
};
