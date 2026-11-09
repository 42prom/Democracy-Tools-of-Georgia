import crypto from 'crypto';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function generateMfaSecret(): string {
  return base32Encode(crypto.randomBytes(20));
}

function base32Encode(value: Buffer): string {
  let bits = 0;
  let accumulator = 0;
  let result = '';
  for (const byte of value) {
    accumulator = (accumulator << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      result += BASE32_ALPHABET[(accumulator >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) result += BASE32_ALPHABET[(accumulator << (5 - bits)) & 31];
  return result;
}

function base32Decode(value: string): Buffer {
  let bits = 0;
  let accumulator = 0;
  const bytes: number[] = [];
  for (const character of value.toUpperCase().replace(/=+$/g, '')) {
    const index = BASE32_ALPHABET.indexOf(character);
    if (index < 0) throw new Error('Invalid MFA secret');
    accumulator = (accumulator << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((accumulator >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

function totpAt(secret: string, counter: number): string {
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));
  const digest = crypto.createHmac('sha1', base32Decode(secret)).update(counterBuffer).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary = (digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return binary.toString().padStart(6, '0');
}

export function verifyMfaCode(secret: string, suppliedCode: unknown, now = Date.now()): boolean {
  if (typeof suppliedCode !== 'string' || !/^\d{6}$/.test(suppliedCode)) return false;
  const supplied = Buffer.from(suppliedCode);
  const counter = Math.floor(now / 30_000);
  for (const drift of [-1, 0, 1]) {
    const expected = Buffer.from(totpAt(secret, counter + drift));
    if (crypto.timingSafeEqual(supplied, expected)) return true;
  }
  return false;
}

export function mfaProvisioningUri(email: string, secret: string): string {
  const issuer = 'Democracy Tools of Georgia';
  const label = `${issuer}:${email}`;
  return `otpauth://totp/${encodeURIComponent(label)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}
