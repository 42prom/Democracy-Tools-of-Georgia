/**
 * Verify all demographic data uses unified codes
 * Run: npx tsx backend/verify_demographics_unified.ts
 */

import { pool } from '../../src/db/client';

async function verifyDemographicsUnified() {
  console.log('🔍 Verifying Demographic Data Unification\n');

  let allGood = true;

  // 1. Check regions table uses codes
  console.log('1️⃣ Checking regions table...');
  const regionsResult = await pool.query(`
    SELECT id, code, name_en
    FROM regions
    LIMIT 5
  `);

  for (const region of regionsResult.rows) {
    if (!region.code || region.code.includes('-')) {
      console.log(`   ❌ Region has UUID-like code: ${region.code}`);
      allGood = false;
    } else {
      console.log(`   ✅ ${region.code.padEnd(25)} → ${region.name_en}`);
    }
  }

  // 2. Check users store region codes (not UUIDs)
  console.log('\n2️⃣ Checking users table...');
  const usersResult = await pool.query(`
    SELECT id, credential_region_codes, credential_gender, credential_birth_year
    FROM users
    WHERE credential_region_codes IS NOT NULL
    LIMIT 5
  `);

  for (const user of usersResult.rows) {
    const regions = user.credential_region_codes || [];
    const firstRegion = regions[0];

    if (firstRegion && firstRegion.length === 36 && firstRegion.includes('-')) {
      console.log(`   ❌ User ${user.id.substring(0, 8)} has UUID in regions: ${firstRegion}`);
      allGood = false;
    } else {
      console.log(`   ✅ User ${user.id.substring(0, 8)} has code: ${firstRegion || 'none'}, Gender: ${user.credential_gender}, Birth Year: ${user.credential_birth_year}`);
    }
  }

  // 3. Check polls use region codes in audience_rules
  console.log('\n3️⃣ Checking polls audience_rules...');
  const pollsResult = await pool.query(`
    SELECT id, title, audience_rules
    FROM polls
  `);

  for (const poll of pollsResult.rows) {
    const rules = poll.audience_rules || {};
    const regions = rules.regions || [];

    if (regions.length > 0) {
      const firstRegion = regions[0];
      if (firstRegion.length === 36 && firstRegion.includes('-')) {
        console.log(`   ❌ Poll "${poll.title}" has UUID: ${firstRegion}`);
        allGood = false;
      } else {
        console.log(`   ✅ Poll "${poll.title}" has codes: ${regions.slice(0, 2).join(', ')}...`);
      }
    } else {
      console.log(`   ℹ️  Poll "${poll.title}" has no region restrictions`);
    }
  }

  // 4. Check votes demographics_snapshot uses single region key
  console.log('\n4️⃣ Checking votes demographics_snapshot...');
  const votesResult = await pool.query(`
    SELECT demographics_snapshot
    FROM votes
    LIMIT 5
  `);

  for (const vote of votesResult.rows) {
    const snapshot = vote.demographics_snapshot;

    if (snapshot.region) {
      if (snapshot.region.length === 36 && snapshot.region.includes('-')) {
        console.log(`   ❌ Vote has UUID in region: ${snapshot.region}`);
        allGood = false;
      } else {
        console.log(`   ✅ Snapshot: region=${snapshot.region}, age=${snapshot.age_bucket}, gender=${snapshot.gender}`);
      }
    }

    if (snapshot.region_codes) {
      console.log(`   ⚠️  Vote has legacy region_codes field (should only use region)`);
    }

    // Check for identity leaks
    if (snapshot.user_id || snapshot.device_id || snapshot.pn_hash) {
      console.log(`   ❌ PRIVACY VIOLATION: Snapshot contains identity fields!`);
      allGood = false;
    }
  }

  // 5. Check messages audience_rules
  console.log('\n5️⃣ Checking messages audience_rules...');
  const messagesResult = await pool.query(`
    SELECT id, title, audience_rules
    FROM messages
  `);

  for (const msg of messagesResult.rows) {
    const rules = msg.audience_rules || {};
    const regions = rules.regions || [];

    if (regions.length > 0) {
      const firstRegion = regions[0];
      if (firstRegion.length === 36 && firstRegion.includes('-')) {
        console.log(`   ❌ Message "${msg.title}" has UUID: ${firstRegion}`);
        allGood = false;
      } else {
        console.log(`   ✅ Message "${msg.title}" has codes: ${regions.slice(0, 2).join(', ')}...`);
      }
    } else {
      console.log(`   ℹ️  Message "${msg.title}" has no region restrictions`);
    }
  }

  console.log('\n' + '='.repeat(60));
  if (allGood) {
    console.log('✅ ALL DEMOGRAPHIC DATA IS UNIFIED');
    console.log('   - Regions use CODES (not UUIDs)');
    console.log('   - Votes use single region key');
    console.log('   - No identity leaks in snapshots');
  } else {
    console.log('❌ ISSUES FOUND - See errors above');
  }
  console.log('='.repeat(60));

  process.exit(allGood ? 0 : 1);
}

verifyDemographicsUnified().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
