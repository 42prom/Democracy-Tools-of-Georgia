/**
 * Quick script to backfill missing region data for existing users
 * Run with: npx tsx backend/fix_missing_regions.ts
 */

import { pool } from '../../src/db/client';

async function backfillRegions() {
  console.log('🔍 Finding users without region data...');

  const result = await pool.query(`
    SELECT id, pn_masked, credential_region_codes
    FROM users
    WHERE credential_region_codes IS NULL
       OR credential_region_codes = '{}'
       OR array_length(credential_region_codes, 1) IS NULL
  `);

  console.log(`Found ${result.rows.length} users without region data`);

  if (result.rows.length === 0) {
    console.log('✓ All users have region data');
    process.exit(0);
  }

  // Backfill with default region (reg_tbilisi)
  for (const user of result.rows) {
    console.log(`  Updating user ${user.id} (${user.pn_masked || 'unknown'})...`);
    await pool.query(
      `UPDATE users
       SET credential_region_codes = $1
       WHERE id = $2`,
      [['reg_tbilisi'], user.id]
    );
  }

  console.log(`✓ Updated ${result.rows.length} users with default region (reg_tbilisi)`);
  console.log('⚠️  Users should re-enroll to set their correct region');

  process.exit(0);
}

backfillRegions().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
