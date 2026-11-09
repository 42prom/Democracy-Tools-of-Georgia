import bcrypt from 'bcrypt';

const MIN_PASSWORD_LENGTH = 14;
const MAX_BCRYPT_BYTES = 72;
const COMMON_PASSWORDS = new Set([
  'password', 'password123', 'admin', 'administrator', 'qwerty',
  'letmein', 'welcome', 'changeme', '123456789',
]);

export function validateAdminPassword(password: unknown, email?: string): string | null {
  if (typeof password !== 'string') return 'Password is required';
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Password must contain at least ${MIN_PASSWORD_LENGTH} characters`;
  }
  if (Buffer.byteLength(password, 'utf8') > MAX_BCRYPT_BYTES) {
    return `Password must not exceed ${MAX_BCRYPT_BYTES} UTF-8 bytes`;
  }
  if (COMMON_PASSWORDS.has(password.trim().toLowerCase())) return 'Password is too common';
  const localPart = email?.split('@')[0]?.toLowerCase();
  if (localPart && localPart.length >= 4 && password.toLowerCase().includes(localPart)) {
    return 'Password must not contain the email username';
  }
  return null;
}

export async function hashAdminPassword(password: string): Promise<string> {
  const configured = Number.parseInt(process.env.ADMIN_BCRYPT_COST || '', 10);
  const cost = Number.isInteger(configured) && configured >= 10 && configured <= 14
    ? configured
    : process.env.NODE_ENV === 'test' ? 10 : 12;
  return bcrypt.hash(password, cost);
}
