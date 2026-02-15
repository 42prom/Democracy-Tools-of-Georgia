/**
 * Demographic data buckets (anonymized)
 */
export interface DemographicData {
  age_bucket: '18-24' | '25-34' | '35-44' | '45-54' | '55-64' | '65+';
  gender: 'M' | 'F' | 'O';
  region_codes?: string[]; // e.g., ['reg_tbilisi', 'reg_vake']
  region?: string; // Unified region code e.g., 'reg_tbilisi'
  citizenship: 'GEO';
}

/**
 * Voting Credential Payload (JWT)
 * Version: DTG.vc.v1
 */
export interface VotingCredential {
  iss: string; // Issuer: "DTG-identity-service"
  sub: string; // Subject: device_key_thumbprint
  data: DemographicData;
  exp: number; // Expiration timestamp
}

/**
 * Enrollment request
 */
export interface EnrollmentRequest {
  proof: string; // Mock: any string. Phase 1: actual proof
  deviceKey: string; // Public key of device
}

/**
 * Challenge response
 */
export interface ChallengeResponse {
  nonce: string;
  ttl: number;
}

