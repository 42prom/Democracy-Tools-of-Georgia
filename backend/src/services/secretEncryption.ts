import crypto from 'crypto';
import { getApiKeyEncryptionSecret } from '../config/secrets';

// Vault is initialized after module loading and before traffic is accepted.
// Resolve lazily so an import cannot pin an environment fallback prematurely.
const encryptionKey = (): Buffer =>
  crypto.createHash('sha256').update(getApiKeyEncryptionSecret()).digest();

export function encryptSensitiveValue(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv, { authTagLength: 16 });
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v2:${iv.toString('hex')}:${tag.toString('hex')}:${ciphertext.toString('hex')}`;
}

export function decryptSensitiveValue(value: string): string {
  const parts = value.split(':');
  if (parts[0] === 'v2' && parts.length === 4) {
    const iv = Buffer.from(parts[1], 'hex');
    const tag = Buffer.from(parts[2], 'hex');
    const ciphertext = Buffer.from(parts[3], 'hex');
    if (iv.length !== 12 || tag.length !== 16) throw new Error('Invalid encrypted value');
    const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), iv, { authTagLength: 16 });
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  }

  // Backward compatibility for existing AES-CBC settings. Every new write is
  // authenticated AES-GCM and naturally upgrades a value when it is changed.
  if (parts.length === 2) {
    const iv = Buffer.from(parts[0], 'hex');
    if (iv.length !== 16) throw new Error('Invalid legacy encrypted value');
    const decipher = crypto.createDecipheriv('aes-256-cbc', encryptionKey(), iv);
    return decipher.update(parts[1], 'hex', 'utf8') + decipher.final('utf8');
  }
  throw new Error('Invalid encrypted value format');
}
