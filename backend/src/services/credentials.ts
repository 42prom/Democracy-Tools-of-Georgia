import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { VotingCredential, DemographicData } from '../types/credentials';
import { getJwtSecret } from '../config/jwt';


/**
 * Generate device key thumbprint (SHA-256 hash)
 */
export function getDeviceKeyThumbprint(deviceKey: string): string {
  return crypto.createHash('sha256').update(deviceKey).digest('hex');
}

/**
 * Issue a JWT voting credential
 */
export function issueCredential(
  deviceKeyThumbprint: string,
  demographics: DemographicData
): string {
  const payload: VotingCredential = {
    iss: 'DTG-identity-service',
    sub: deviceKeyThumbprint,
    data: demographics,
    exp: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60, // 30 days
  };

  return jwt.sign(payload, getJwtSecret(), { algorithm: 'HS256' });
}


/**
 * Issue a JWT voting credential for an arbitrary subject (e.g., userId or pn_hash)
 * Useful for enrollment flows where device key is not the identity root.
 */
export function issueCredentialForSubject(
  subject: string,
  demographics: DemographicData,
  ttlSeconds: number = 30 * 24 * 60 * 60
): string {
  const payload: VotingCredential = {
    iss: 'DTG-identity-service',
    sub: subject,
    data: demographics,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  };

  return jwt.sign(payload, getJwtSecret(), { algorithm: 'HS256' });
}

/**
 * Verify and decode a JWT credential
 */
export function verifyCredential(token: string): VotingCredential {
  try {
    const decoded = jwt.verify(token, getJwtSecret(), {
      algorithms: ['HS256'],
    }) as VotingCredential;

    return decoded;
  } catch (error) {
    console.error('JWT Verification Error:', error);
    throw new Error('Invalid or expired credential');
  }
}

