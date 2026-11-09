import crypto from 'crypto';
import { generateMfaSecret, mfaProvisioningUri, verifyMfaCode } from '../src/services/adminMfa';
import { hashAdminPassword, validateAdminPassword } from '../src/services/adminPassword';
import { decryptSensitiveValue, encryptSensitiveValue } from '../src/services/secretEncryption';
import { getApiKeyEncryptionSecret } from '../src/config/secrets';

describe('admin MFA', () => {
  it('verifies the RFC 6238 SHA-1 vector with a bounded clock window', () => {
    const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
    expect(verifyMfaCode(secret, '287082', 59_000)).toBe(true);
    expect(verifyMfaCode(secret, '287082', 59_000 + 60_000)).toBe(false);
    expect(verifyMfaCode(secret, 'not-six-digits', 59_000)).toBe(false);
  });

  it('generates a 160-bit Base32 secret and an encoded provisioning URI', () => {
    const secret = generateMfaSecret();
    expect(secret).toMatch(/^[A-Z2-7]{32}$/);
    const uri = mfaProvisioningUri('admin+security@example.ge', secret);
    expect(uri).toContain(`secret=${secret}`);
    expect(uri).toContain('admin%2Bsecurity%40example.ge');
  });
});

describe('authenticated secret encryption', () => {
  it('round-trips with AES-GCM and rejects ciphertext tampering', () => {
    const encrypted = encryptSensitiveValue('sensitive-admin-secret');
    expect(encrypted).toMatch(/^v2:/);
    expect(decryptSensitiveValue(encrypted)).toBe('sensitive-admin-secret');

    const tampered = encrypted.slice(0, -1) + (encrypted.endsWith('0') ? '1' : '0');
    expect(() => decryptSensitiveValue(tampered)).toThrow();
  });

  it('can read the legacy AES-CBC format for in-place upgrades', () => {
    const key = crypto.createHash('sha256').update(getApiKeyEncryptionSecret()).digest();
    const iv = Buffer.alloc(16, 7);
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    const ciphertext = cipher.update('legacy-secret', 'utf8', 'hex') + cipher.final('hex');
    expect(decryptSensitiveValue(`${iv.toString('hex')}:${ciphertext}`)).toBe('legacy-secret');
  });
});

describe('admin password policy', () => {
  it('rejects short, common, identity-derived, and bcrypt-truncated passwords', () => {
    expect(validateAdminPassword('short')).toBeTruthy();
    expect(validateAdminPassword('administrator')).toBeTruthy();
    expect(validateAdminPassword('alice-safe-long-secret', 'alice@example.ge')).toBeTruthy();
    expect(validateAdminPassword('x'.repeat(73))).toBeTruthy();
  });

  it('accepts and hashes a strong password', async () => {
    const password = 'correct horse battery staple 2026';
    expect(validateAdminPassword(password, 'admin@example.ge')).toBeNull();
    expect(await hashAdminPassword(password)).toMatch(/^\$2[aby]\$/);
  });
});
