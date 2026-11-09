import crypto, { KeyObject, X509Certificate } from 'node:crypto';
import { decode, decodeMultiple } from 'cbor-x';
import { pool } from '../db/client';
import { getSecret } from '../config/vault';
import type { AttestationResult } from './deviceAttestation';

// Pinned trust anchor published by Apple at:
// https://www.apple.com/certificateauthority/Apple_App_Attestation_Root_CA.pem
const APPLE_APP_ATTEST_ROOT_CA_PEM = `-----BEGIN CERTIFICATE-----
MIICITCCAaegAwIBAgIQC/O+DvHN0uD7jG5yH2IXmDAKBggqhkjOPQQDAzBSMSYw
JAYDVQQDDB1BcHBsZSBBcHAgQXR0ZXN0YXRpb24gUm9vdCBDQTETMBEGA1UECgwK
QXBwbGUgSW5jLjETMBEGA1UECAwKQ2FsaWZvcm5pYTAeFw0yMDAzMTgxODMyNTNa
Fw00NTAzMTUwMDAwMDBaMFIxJjAkBgNVBAMMHUFwcGxlIEFwcCBBdHRlc3RhdGlv
biBSb290IENBMRMwEQYDVQQKDApBcHBsZSBJbmMuMRMwEQYDVQQIDApDYWxpZm9y
bmlhMHYwEAYHKoZIzj0CAQYFK4EEACIDYgAERTHhmLW07ATaFQIEVwTtT4dyctdh
NbJhFs/Ii2FdCgAHGbpphY3+d8qjuDngIN3WVhQUBHAoMeQ/cLiP1sOUtgjqK9au
Yen1mMEvRq9Sk3Jm5X8U62H+xTD3FE9TgS41o0IwQDAPBgNVHRMBAf8EBTADAQH/
MB0GA1UdDgQWBBSskRBTM72+aEH/pwyp5frq5eWKoTAOBgNVHQ8BAf8EBAMCAQYw
CgYIKoZIzj0EAwMDaAAwZQIwQgFGnByvsiVbpTKwSga0kP0e8EeDS4+sQmTvb7vn
53O5+FRXgeLhpJ06ysC5PrOyAjEAp5U4xDgEgllF7En3VcE3iexZZtKeYnpqtijV
oyFraWVIyd/dganmrduC1bmTBGwD
-----END CERTIFICATE-----`;

const APP_ATTEST_NONCE_OID = Buffer.from('2a864886f763640802', 'hex');
const PRODUCTION_AAGUID = Buffer.concat([Buffer.from('appattest'), Buffer.alloc(7)]);
const DEVELOPMENT_AAGUID = Buffer.from('appattestdevelop');
const MAX_CBOR_BYTES = 32_768;

type CborMap = Map<unknown, unknown> | Record<string, unknown>;

interface AppAttestEvidence {
  version: 1;
  keyId: string;
  assertion: string;
  attestationObject?: string;
}

interface StoredAppAttestKey {
  key_id: string;
  subject_hash: string;
  public_key_pem: string;
  receipt_base64: string;
  environment: 'development' | 'production';
  assertion_counter: string | number;
  validation_category: number | null;
  bundle_version: string | null;
}

interface AuthenticatorMetadata {
  rpIdHash: Buffer;
  flags: number;
  counter: number;
  validationCategory: number | null;
  bundleVersion: string | null;
}

interface VerifiedAttestation {
  publicKeyPem: string;
  receiptBase64: string;
  environment: 'development' | 'production';
  validationCategory: number | null;
  bundleVersion: string | null;
}

function fail(reason: string): AttestationResult {
  return { success: false, verdict: 'FAILS_BASIC', deviceKeyHash: '', reason, platform: 'ios' };
}

function sha256(value: crypto.BinaryLike): Buffer {
  return crypto.createHash('sha256').update(value).digest();
}

function safeEqual(left: Buffer, right: Buffer): boolean {
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function mapValue(value: unknown, key: string): unknown {
  if (value instanceof Map) return value.get(key);
  if (value && typeof value === 'object') return (value as Record<string, unknown>)[key];
  return undefined;
}

function asBuffer(value: unknown, label: string, maximum = MAX_CBOR_BYTES): Buffer {
  if (!(value instanceof Uint8Array)) throw new Error(`${label} must be a CBOR byte string`);
  const result = Buffer.from(value);
  if (result.length === 0 || result.length > maximum) throw new Error(`${label} has an invalid size`);
  return result;
}

function decodeBase64(value: unknown, label: string, maximum = MAX_CBOR_BYTES): Buffer {
  if (typeof value !== 'string' || value.length === 0 || value.length > Math.ceil(maximum * 1.5)) {
    throw new Error(`${label} is missing or too large`);
  }
  if (!/^[A-Za-z0-9+/_-]+={0,2}$/.test(value)) throw new Error(`${label} is not valid base64`);
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const result = Buffer.from(normalized, 'base64');
  if (result.length === 0 || result.length > maximum) throw new Error(`${label} has an invalid size`);
  return result;
}

function parseEvidence(token: string): AppAttestEvidence {
  let value: unknown;
  try {
    value = JSON.parse(token);
  } catch {
    throw new Error('App Attest evidence must be valid JSON');
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('App Attest evidence must be an object');
  }
  const object = value as Record<string, unknown>;
  const allowed = new Set(['version', 'keyId', 'assertion', 'attestationObject']);
  if (Object.keys(object).some(key => !allowed.has(key))) {
    throw new Error('App Attest evidence contains unsupported fields');
  }
  if (object.version !== 1 || typeof object.keyId !== 'string' || typeof object.assertion !== 'string') {
    throw new Error('App Attest evidence is incomplete');
  }
  if (object.attestationObject !== undefined && typeof object.attestationObject !== 'string') {
    throw new Error('App Attest attestationObject must be base64');
  }
  return object as unknown as AppAttestEvidence;
}

interface DerElement {
  tag: number;
  contentStart: number;
  contentEnd: number;
  next: number;
}

function readDerElement(input: Buffer, offset: number): DerElement {
  if (offset < 0 || offset + 2 > input.length) throw new Error('Invalid DER element');
  const tag = input[offset];
  const firstLength = input[offset + 1];
  let length = firstLength;
  let headerLength = 2;
  if ((firstLength & 0x80) !== 0) {
    const lengthBytes = firstLength & 0x7f;
    if (lengthBytes === 0 || lengthBytes > 4 || offset + 2 + lengthBytes > input.length) {
      throw new Error('Invalid DER length');
    }
    length = 0;
    for (let index = 0; index < lengthBytes; index += 1) {
      length = (length * 256) + input[offset + 2 + index];
    }
    headerLength += lengthBytes;
  }
  const contentStart = offset + headerLength;
  const contentEnd = contentStart + length;
  if (contentEnd > input.length) throw new Error('Truncated DER value');
  return { tag, contentStart, contentEnd, next: contentEnd };
}

function findCertificateExtension(input: Buffer, start = 0, end = input.length, depth = 0): Buffer | null {
  if (depth > 16) throw new Error('DER nesting is too deep');
  let offset = start;
  while (offset < end) {
    const element = readDerElement(input, offset);
    if (element.next > end) throw new Error('Invalid nested DER value');
    if (element.tag === 0x30) {
      const first = readDerElement(input, element.contentStart);
      if (
        first.tag === 0x06 &&
        safeEqual(input.subarray(first.contentStart, first.contentEnd), APP_ATTEST_NONCE_OID)
      ) {
        let childOffset = first.next;
        let child = readDerElement(input, childOffset);
        if (child.tag === 0x01) {
          childOffset = child.next;
          child = readDerElement(input, childOffset);
        }
        if (child.tag !== 0x04 || child.next !== element.contentEnd) {
          throw new Error('Malformed App Attest certificate extension');
        }
        return input.subarray(child.contentStart, child.contentEnd);
      }
    }
    if ((element.tag & 0x20) !== 0) {
      const nested = findCertificateExtension(input, element.contentStart, element.contentEnd, depth + 1);
      if (nested) return nested;
    }
    offset = element.next;
  }
  return null;
}

function findOctetString32(input: Buffer, start = 0, end = input.length, depth = 0): Buffer | null {
  if (depth > 8) throw new Error('App Attest extension nesting is too deep');
  let offset = start;
  while (offset < end) {
    const element = readDerElement(input, offset);
    if (element.next > end) throw new Error('Invalid App Attest extension DER');
    if (element.tag === 0x04 && element.contentEnd - element.contentStart === 32) {
      return input.subarray(element.contentStart, element.contentEnd);
    }
    if ((element.tag & 0x20) !== 0) {
      const nested = findOctetString32(input, element.contentStart, element.contentEnd, depth + 1);
      if (nested) return nested;
    }
    offset = element.next;
  }
  return null;
}

function validateCertificateTime(certificate: X509Certificate, now = Date.now()): void {
  const validFrom = Date.parse(certificate.validFrom);
  const validTo = Date.parse(certificate.validTo);
  if (!Number.isFinite(validFrom) || !Number.isFinite(validTo) || now < validFrom || now > validTo) {
    throw new Error('App Attest certificate is outside its validity period');
  }
}

function validateCertificateChain(x5c: unknown): X509Certificate {
  if (!Array.isArray(x5c) || x5c.length < 2 || x5c.length > 4) {
    throw new Error('App Attest certificate chain is incomplete');
  }
  const certificates = x5c.map((value, index) =>
    new X509Certificate(asBuffer(value, `App Attest certificate ${index}`, 8192))
  );
  const root = new X509Certificate(APPLE_APP_ATTEST_ROOT_CA_PEM);
  certificates.forEach(validateCertificateTime);
  validateCertificateTime(root);

  if (certificates[0].ca) throw new Error('App Attest credential certificate cannot be a CA');
  for (let index = 0; index < certificates.length - 1; index += 1) {
    const subject = certificates[index];
    const issuer = certificates[index + 1];
    if (subject.issuer !== issuer.subject || !subject.verify(issuer.publicKey)) {
      throw new Error('App Attest certificate chain signature is invalid');
    }
  }
  const finalIntermediate = certificates[certificates.length - 1];
  if (!finalIntermediate.ca || finalIntermediate.issuer !== root.subject || !finalIntermediate.verify(root.publicKey)) {
    throw new Error('App Attest certificate chain is not rooted in the pinned Apple CA');
  }
  return certificates[0];
}

function expectedRpIdHash(): Buffer {
  const prefix = (process.env.APPLE_APP_ID_PREFIX || process.env.APPLE_DEVICECHECK_TEAM_ID || '').trim();
  const bundleId = (process.env.APPLE_BUNDLE_ID || '').trim();
  if (!prefix || !bundleId) throw new Error('Apple App ID prefix and bundle ID are not configured');
  return sha256(`${prefix}.${bundleId}`);
}

function extensionMetadata(extensions: unknown): Pick<AuthenticatorMetadata, 'validationCategory' | 'bundleVersion'> {
  const validationValue = mapValue(extensions, 'apple_validation_category_01');
  const bundleValue = mapValue(extensions, 'apple_bundle_version_01');
  const validationCategory = typeof validationValue === 'number' && Number.isInteger(validationValue)
    ? validationValue
    : null;
  const bundleVersion = typeof bundleValue === 'string' && bundleValue.length <= 64
    ? bundleValue
    : null;
  return { validationCategory, bundleVersion };
}

function validateMetadata(metadata: AuthenticatorMetadata): void {
  if (!safeEqual(metadata.rpIdHash, expectedRpIdHash())) {
    throw new Error('App Attest App ID hash mismatch');
  }
  const requiredExtensions = process.env.APPLE_APP_ATTEST_REQUIRE_EXTENSIONS === 'true';
  if (requiredExtensions && (metadata.validationCategory === null || metadata.bundleVersion === null)) {
    throw new Error('App Attest validation category or bundle version is missing');
  }

  const allowedCategories = (process.env.APPLE_APP_ATTEST_ALLOWED_CATEGORIES || '')
    .split(',')
    .map(value => Number.parseInt(value.trim(), 10))
    .filter(value => Number.isInteger(value));
  if (
    allowedCategories.length > 0 &&
    (metadata.validationCategory === null || !allowedCategories.includes(metadata.validationCategory))
  ) {
    throw new Error('App Attest validation category is not allowed');
  }

  const expectedBundleVersion = process.env.APPLE_APP_BUNDLE_VERSION?.trim();
  if (expectedBundleVersion && metadata.bundleVersion !== expectedBundleVersion) {
    throw new Error('App Attest bundle version mismatch');
  }
}

function parseAuthenticatorMetadata(authData: Buffer, attested: boolean): AuthenticatorMetadata & {
  aaguid?: Buffer;
  credentialId?: Buffer;
} {
  if (authData.length < 37) throw new Error('App Attest authenticator data is too short');
  const rpIdHash = authData.subarray(0, 32);
  const flags = authData[32];
  const counter = authData.readUInt32BE(33);
  let extensions: unknown;
  let aaguid: Buffer | undefined;
  let credentialId: Buffer | undefined;

  if (attested) {
    if ((flags & 0x40) === 0 || authData.length < 55) {
      throw new Error('App Attest attested credential data is missing');
    }
    aaguid = authData.subarray(37, 53);
    const credentialLength = authData.readUInt16BE(53);
    const credentialEnd = 55 + credentialLength;
    if (credentialLength !== 32 || credentialEnd >= authData.length) {
      throw new Error('App Attest credential ID has an invalid size');
    }
    credentialId = authData.subarray(55, credentialEnd);
    const decoded = decodeMultiple(authData.subarray(credentialEnd)) as unknown[];
    if (decoded.length < 1) throw new Error('App Attest credential public key is missing');
    extensions = decoded[1];
  } else {
    if (authData.length > 37) {
      extensions = decode(authData.subarray(37));
    }
  }

  const metadata = { rpIdHash, flags, counter, ...extensionMetadata(extensions) };
  validateMetadata(metadata);
  return { ...metadata, aaguid, credentialId };
}

function publicKeyIdentifier(publicKey: KeyObject): Buffer {
  const jwk = publicKey.export({ format: 'jwk' });
  if (jwk.kty !== 'EC' || jwk.crv !== 'P-256' || !jwk.x || !jwk.y) {
    throw new Error('App Attest credential key must be P-256');
  }
  return sha256(Buffer.concat([
    Buffer.from([0x04]),
    Buffer.from(jwk.x, 'base64url'),
    Buffer.from(jwk.y, 'base64url'),
  ]));
}

function verifyAttestation(attestationBase64: string, keyId: Buffer, clientDataHash: Buffer): VerifiedAttestation {
  const attestation = decode(decodeBase64(attestationBase64, 'attestationObject')) as CborMap;
  if (mapValue(attestation, 'fmt') !== 'apple-appattest') {
    throw new Error('Unexpected App Attest format');
  }
  const statement = mapValue(attestation, 'attStmt');
  const authData = asBuffer(mapValue(attestation, 'authData'), 'App Attest authData');
  const leaf = validateCertificateChain(mapValue(statement, 'x5c'));
  const receipt = asBuffer(mapValue(statement, 'receipt'), 'App Attest receipt', 24_000);

  const nonce = sha256(Buffer.concat([authData, clientDataHash]));
  const extension = findCertificateExtension(leaf.raw);
  const certificateNonce = extension ? findOctetString32(extension) : null;
  if (!certificateNonce || !safeEqual(certificateNonce, nonce)) {
    throw new Error('App Attest certificate nonce mismatch');
  }
  if (!safeEqual(publicKeyIdentifier(leaf.publicKey), keyId)) {
    throw new Error('App Attest key identifier does not match the credential certificate');
  }

  const metadata = parseAuthenticatorMetadata(authData, true);
  if (metadata.counter !== 0 || !metadata.credentialId || !safeEqual(metadata.credentialId, keyId)) {
    throw new Error('App Attest attestation counter or credential ID is invalid');
  }
  const isProduction = safeEqual(metadata.aaguid!, PRODUCTION_AAGUID);
  const isDevelopment = safeEqual(metadata.aaguid!, DEVELOPMENT_AAGUID);
  if (!isProduction && !isDevelopment) throw new Error('App Attest AAGUID is invalid');
  const expectedEnvironment = process.env.APPLE_APP_ATTEST_ENVIRONMENT?.trim();
  const environment = isProduction ? 'production' : 'development';
  if (expectedEnvironment && expectedEnvironment !== environment) {
    throw new Error('App Attest environment mismatch');
  }

  return {
    publicKeyPem: leaf.publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    receiptBase64: receipt.toString('base64'),
    environment,
    validationCategory: metadata.validationCategory,
    bundleVersion: metadata.bundleVersion,
  };
}

function verifyAssertion(assertionBase64: string, stored: StoredAppAttestKey, clientDataHash: Buffer): number {
  const assertion = decode(decodeBase64(assertionBase64, 'assertion')) as CborMap;
  const signature = asBuffer(mapValue(assertion, 'signature'), 'App Attest assertion signature', 256);
  const authData = asBuffer(mapValue(assertion, 'authenticatorData'), 'App Attest assertion authData');
  const metadata = parseAuthenticatorMetadata(authData, false);
  const previousCounter = Number(stored.assertion_counter);
  if (!Number.isSafeInteger(previousCounter) || metadata.counter <= previousCounter || metadata.counter <= 0) {
    throw new Error('App Attest assertion counter did not advance');
  }
  if (
    stored.validation_category !== null &&
    metadata.validationCategory !== stored.validation_category
  ) {
    throw new Error('App Attest assertion validation category changed');
  }
  if (stored.bundle_version !== null && metadata.bundleVersion !== stored.bundle_version) {
    throw new Error('App Attest assertion bundle version changed');
  }

  const nonce = sha256(Buffer.concat([authData, clientDataHash]));
  const publicKey = crypto.createPublicKey(stored.public_key_pem);
  if (!crypto.verify('sha256', nonce, publicKey, signature)) {
    throw new Error('App Attest assertion signature is invalid');
  }
  return metadata.counter;
}

function subjectHash(subject: string): string {
  const secret = getSecret('VOTER_HASH_SECRET');
  if (!secret) throw new Error('Voter hashing secret is unavailable');
  return crypto.createHmac('sha256', secret).update(`app-attest:${subject}`).digest('hex');
}

export async function verifyAppleAppAttest(
  token: string,
  requestBinding: string,
  subject: string | undefined
): Promise<AttestationResult> {
  if (!subject) return fail('App Attest requires an authenticated credential subject');
  try {
    const evidence = parseEvidence(token);
    const keyId = decodeBase64(evidence.keyId, 'keyId', 64);
    if (keyId.length !== 32) return fail('App Attest key ID must decode to 32 bytes');
    const clientDataHash = sha256(Buffer.from(requestBinding, 'utf8'));
    const expectedSubjectHash = subjectHash(subject);

    let storedResult = await pool.query<StoredAppAttestKey>(
      `SELECT key_id, subject_hash, public_key_pem, receipt_base64, environment,
              assertion_counter, validation_category, bundle_version
         FROM app_attest_keys WHERE key_id = $1`,
      [evidence.keyId]
    );

    if (storedResult.rows.length === 0) {
      if (!evidence.attestationObject) {
        return fail('App Attest key is not registered and no attestation object was supplied');
      }
      const verified = verifyAttestation(evidence.attestationObject, keyId, clientDataHash);
      await pool.query(
        `INSERT INTO app_attest_keys
           (key_id, subject_hash, public_key_pem, receipt_base64, environment,
            assertion_counter, validation_category, bundle_version)
         VALUES ($1, $2, $3, $4, $5, 0, $6, $7)
         ON CONFLICT (key_id) DO NOTHING`,
        [
          evidence.keyId,
          expectedSubjectHash,
          verified.publicKeyPem,
          verified.receiptBase64,
          verified.environment,
          verified.validationCategory,
          verified.bundleVersion,
        ]
      );
      storedResult = await pool.query<StoredAppAttestKey>(
        `SELECT key_id, subject_hash, public_key_pem, receipt_base64, environment,
                assertion_counter, validation_category, bundle_version
           FROM app_attest_keys WHERE key_id = $1`,
        [evidence.keyId]
      );
    }

    const stored = storedResult.rows[0];
    if (!stored || !safeEqual(Buffer.from(stored.subject_hash), Buffer.from(expectedSubjectHash))) {
      return fail('App Attest key is already associated with another credential');
    }
    const nextCounter = verifyAssertion(evidence.assertion, stored, clientDataHash);
    const updated = await pool.query(
      `UPDATE app_attest_keys
          SET assertion_counter = $2, last_asserted_at = NOW()
        WHERE key_id = $1 AND assertion_counter = $3
        RETURNING key_id`,
      [evidence.keyId, nextCounter, Number(stored.assertion_counter)]
    );
    if (updated.rows.length !== 1) return fail('App Attest assertion replay or concurrency conflict');

    return {
      success: true,
      verdict: 'HARDWARE_BACKED',
      deviceKeyHash: crypto
        .createHmac('sha256', getSecret('DEVICE_HASH_SECRET')!)
        .update(`ios-app-attest:${evidence.keyId}`)
        .digest('hex'),
      platform: 'ios',
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'App Attest verification failed';
    console.warn('[AppAttest] Verification rejected:', reason);
    return fail(reason);
  }
}
