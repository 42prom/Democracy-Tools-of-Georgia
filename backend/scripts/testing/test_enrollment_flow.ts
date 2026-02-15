/**
 * Test enrollment flow to identify issues
 * Run: npx tsx backend/test_enrollment_flow.ts
 */

import { pool } from '../../src/db/client';

async function testEnrollmentFlow() {
  console.log('🧪 Testing Enrollment Flow\n');

  // 1. Check if regions endpoint works
  console.log('1️⃣ Testing GET /enrollment/regions...');
  const regionsResult = await pool.query(`
    SELECT id, code, name_en FROM regions
  `);
  console.log(`   ✅ Found ${regionsResult.rows.length} regions`);
  console.log(`   Sample: ${regionsResult.rows[0]?.code} - ${regionsResult.rows[0]?.name_en}\n`);

  // 2. Check if we can query enrollment sessions
  console.log('2️⃣ Checking enrollment_sessions table...');
  try {
    const sessionsResult = await pool.query(`
      SELECT COUNT(*) FROM enrollment_sessions
    `);
    console.log(`   ✅ Found ${sessionsResult.rows[0].count} enrollment sessions\n`);
  } catch (error: any) {
    console.log(`   ❌ Error: ${error.message}\n`);
  }

  // 3. Check verification settings
  console.log('3️⃣ Checking verification settings...');
  try {
    const settingsResult = await pool.query(`
      SELECT * FROM verification_settings WHERE key = 'providers'
    `);
    if (settingsResult.rows.length > 0) {
      console.log(`   ✅ Verification settings found`);
      console.log(`   Value: ${JSON.stringify(settingsResult.rows[0].value).substring(0, 100)}...\n`);
    } else {
      console.log(`   ⚠️  No verification settings found\n`);
    }
  } catch (error: any) {
    console.log(`   ❌ Error: ${error.message}\n`);
  }

  // 4. Check if there are any users
  console.log('4️⃣ Checking existing users...');
  const usersResult = await pool.query(`
    SELECT COUNT(*) as total,
           COUNT(CASE WHEN credential_region_codes IS NOT NULL THEN 1 END) as with_regions
    FROM users
  `);
  console.log(`   Total users: ${usersResult.rows[0].total}`);
  console.log(`   Users with regions: ${usersResult.rows[0].with_regions}\n`);

  // 5. Check active polls
  console.log('5️⃣ Checking active polls...');
  const pollsResult = await pool.query(`
    SELECT id, title, status, audience_rules
    FROM polls
    WHERE status = 'active'
  `);
  console.log(`   ✅ Found ${pollsResult.rows.length} active polls`);
  for (const poll of pollsResult.rows) {
    const rules = poll.audience_rules || {};
    console.log(`      - "${poll.title}"`);
    console.log(`        Regions: ${JSON.stringify(rules.regions || [])}`);
    console.log(`        Gender: ${rules.gender || 'all'}`);
    console.log(`        Age: ${rules.min_age || 'any'} - ${rules.max_age || 'any'}`);
  }

  console.log('\n' + '='.repeat(60));
  console.log('✅ Enrollment flow test complete');
  console.log('='.repeat(60));

  process.exit(0);
}

testEnrollmentFlow().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
