export function getJwtSecret(): string {
  return process.env.JWT_SECRET || 'CHANGE_ME_IN_PRODUCTION_USE_RANDOM_64_CHAR_STRING';
}
