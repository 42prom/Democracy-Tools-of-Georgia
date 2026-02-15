import { getJwtSecret as getSecret } from './secrets';

export function getJwtSecret(): string {
  return getSecret();
}
