/**
 * Development-only seed script for test identity profiles
 *
 * SECURITY: This script only runs when NODE_ENV=development
 * NEVER run in production - contains test personal numbers
 */

import crypto from 'crypto';
import { pool } from './client';

// HMAC secret from environment (same as identity service)
const PN_HASH_SECRET = process.env.PN_HASH_SECRET || 'dtfg-pn-secret-phase0-change-in-production';

/**
 * Compute pn_hash using same logic as identity service
 */
function computePnHash(pnDigits: string): string {
  const input = `GE:${pnDigits}`;
  return crypto.createHmac('sha256', PN_HASH_SECRET).update(input).digest('hex');
}

/**
 * Test user profiles for development
 * Format: [pnDigits, gender, birthYear, regions, description]
 */
const TEST_PROFILES: Array<[string, string, number, string[], string]> = [
  // Young adults (18-25)
  ['12345678901', 'M', 2002, ['reg_tbilisi'], 'Male, 24, Tbilisi'],
  ['12345678902', 'F', 2001, ['reg_tbilisi'], 'Female, 25, Tbilisi'],
  ['12345678903', 'M', 2004, ['reg_batumi'], 'Male, 22, Batumi'],
  ['12345678904', 'F', 2006, ['reg_kutaisi'], 'Female, 20, Kutaisi'],

  // Adults (26-40)
  ['23456789011', 'M', 1990, ['reg_tbilisi'], 'Male, 36, Tbilisi'],
  ['23456789012', 'F', 1985, ['reg_batumi'], 'Female, 41, Batumi'],
  ['23456789013', 'M', 1995, ['reg_rustavi'], 'Male, 31, Rustavi'],
  ['23456789014', 'F', 1992, ['reg_gori'], 'Female, 34, Gori'],
  ['23456789015', 'M', 1988, ['reg_zugdidi'], 'Male, 38, Zugdidi'],

  // Middle-aged (41-55)
  ['34567890121', 'F', 1975, ['reg_tbilisi'], 'Female, 51, Tbilisi'],
  ['34567890122', 'M', 1980, ['reg_batumi'], 'Male, 46, Batumi'],
  ['34567890123', 'F', 1978, ['reg_poti'], 'Female, 48, Poti'],
  ['34567890124', 'M', 1982, ['reg_telavi'], 'Male, 44, Telavi'],

  // Seniors (56+)
  ['45678901231', 'M', 1960, ['reg_tbilisi'], 'Male, 66, Tbilisi'],
  ['45678901232', 'F', 1965, ['reg_batumi'], 'Female, 61, Batumi'],
  ['45678901233', 'M', 1958, ['reg_kutaisi'], 'Male, 68, Kutaisi'],

  // Multi-region users (travelers, relocated)
  ['56789012341', 'F', 1990, ['reg_tbilisi', 'reg_batumi'], 'Female, 36, Tbilisi+Batumi'],
  ['56789012342', 'M', 1987, ['reg_kutaisi', 'reg_rustavi'], 'Male, 39, Kutaisi+Rustavi'],

  // Edge cases
  ['67890123451', 'M', 2008, ['reg_tbilisi'], 'Male, 18 (youngest eligible), Tbilisi'],
  ['67890123452', 'F', 1945, ['reg_batumi'], 'Female, 81 (senior), Batumi'],
];

/**
 * Seed development test users
 */
export async function seedDevUsers() {
  // Safety check: only run in development
  if (process.env.NODE_ENV === 'production') {
    console.error('❌ Cannot seed test users in production!');
    process.exit(1);
  }

  console.log('🌱 Seeding development test users...');

  try {
    let insertedCount = 0;
    let skippedCount = 0;

    for (const [pnDigits, gender, birthYear, regionCodes, description] of TEST_PROFILES) {
      const pnHash = computePnHash(pnDigits);

      // Check if user already exists
      const existing = await pool.query(
        'SELECT id FROM users WHERE pn_hash = $1',
        [pnHash]
      );

      if (existing.rows.length > 0) {
        console.log(`  ⊘ Skipped: ${description} (already exists)`);
        skippedCount++;
        continue;
      }

      // Create realistic timestamps (spread over past 30 days)
      const daysAgo = Math.floor(Math.random() * 30);
      const hoursAgo = Math.floor(Math.random() * 24);
      const createdAt = new Date();
      createdAt.setDate(createdAt.getDate() - daysAgo);
      createdAt.setHours(createdAt.getHours() - hoursAgo);

      // Last login is sometime after creation
      const lastLoginAt = new Date(createdAt);
      lastLoginAt.setHours(lastLoginAt.getHours() + Math.floor(Math.random() * (daysAgo * 24)));

      // Insert test user
      await pool.query(
        `INSERT INTO users (pn_hash, credential_gender, credential_birth_year, credential_region_codes, created_at, last_login_at, trust_score)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [pnHash, gender, birthYear, regionCodes, createdAt, lastLoginAt, 0.0]
      );

      console.log(`  ✓ Created: ${description}`);
      insertedCount++;
    }

    console.log(`\n✅ Seeding complete!`);
    console.log(`   Inserted: ${insertedCount} users`);
    console.log(`   Skipped: ${skippedCount} users (already existed)`);
    console.log(`   Total test users: ${TEST_PROFILES.length}`);

  } catch (error) {
    console.error('❌ Failed to seed test users:', error);
    throw error;
  }
}

/**
 * Run seeding if executed directly
 */
if (require.main === module) {
  seedDevUsers()
    .then(() => {
      console.log('\n✓ Seeding script completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n✗ Seeding script failed:', error);
      process.exit(1);
    });
}
