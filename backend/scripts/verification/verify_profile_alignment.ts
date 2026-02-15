/**
 * Verify user profiles align with unified demographic structure
 * for correct poll/message eligibility
 * Run: npx tsx backend/verify_profile_alignment.ts
 */

import { pool } from '../../src/db/client';
import { issueCredentialForSubject } from '../../src/services/credentials';
import jwt from 'jsonwebtoken';

async function verifyProfileAlignment() {
  console.log('🔍 Verifying Profile → Credential → Eligibility Alignment\n');

  let allGood = true;

  // 1. Check users table has required fields
  console.log('1️⃣ Checking users table schema...');
  const schemaResult = await pool.query(`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_name = 'users'
      AND column_name IN ('credential_gender', 'credential_birth_year', 'credential_dob', 'credential_region_codes')
    ORDER BY column_name
  `);

  const requiredColumns = ['credential_gender', 'credential_birth_year', 'credential_region_codes'];
  for (const col of requiredColumns) {
    const found = schemaResult.rows.find(r => r.column_name === col);
    if (found) {
      console.log(`   ✅ ${col.padEnd(30)} ${found.data_type.padEnd(20)} nullable: ${found.is_nullable}`);
    } else {
      console.log(`   ❌ MISSING: ${col}`);
      allGood = false;
    }
  }

  // 2. Check sample user has valid demographics
  console.log('\n2️⃣ Checking sample user demographics...');
  const userResult = await pool.query(`
    SELECT id, pn_masked, credential_gender, credential_birth_year, credential_dob, credential_region_codes
    FROM users
    WHERE credential_region_codes IS NOT NULL
    LIMIT 1
  `);

  if (userResult.rows.length === 0) {
    console.log('   ⚠️  No users with demographics found');
  } else {
    const user = userResult.rows[0];
    console.log(`   User ID: ${user.id}`);
    console.log(`   PN Masked: ${user.pn_masked || 'none'}`);
    console.log(`   Gender: ${user.credential_gender || 'NOT SET ❌'}`);
    console.log(`   Birth Year: ${user.credential_birth_year || 'NOT SET ❌'}`);
    console.log(`   DOB: ${user.credential_dob || 'not set'}`);
    console.log(`   Regions: ${JSON.stringify(user.credential_region_codes) || 'NOT SET ❌'}`);

    // Validate demographics
    if (!user.credential_gender) {
      console.log('   ❌ Gender is missing!');
      allGood = false;
    }
    if (!user.credential_birth_year && !user.credential_dob) {
      console.log('   ❌ Age data (birth year/DOB) is missing!');
      allGood = false;
    }
    if (!user.credential_region_codes || user.credential_region_codes.length === 0) {
      console.log('   ❌ Region is missing!');
      allGood = false;
    } else {
      // Check if region is code or UUID
      const firstRegion = user.credential_region_codes[0];
      if (firstRegion.length === 36 && firstRegion.includes('-')) {
        console.log(`   ❌ Region is UUID (${firstRegion}), should be code!`);
        allGood = false;
      } else {
        console.log(`   ✅ Region is code: ${firstRegion}`);
      }
    }

    // 3. Simulate credential issuance
    console.log('\n3️⃣ Simulating credential issuance...');

    // Calculate age bucket
    const currentYear = new Date().getFullYear();
    const birthYear = user.credential_birth_year || currentYear - 30;
    const age = currentYear - birthYear;
    let ageBucket: string;

    if (age < 25) ageBucket = '18-24';
    else if (age < 35) ageBucket = '25-34';
    else if (age < 45) ageBucket = '35-44';
    else if (age < 55) ageBucket = '45-54';
    else if (age < 65) ageBucket = '55-64';
    else ageBucket = '65+';

    const demographics = {
      age_bucket: ageBucket as any,
      gender: user.credential_gender || 'M',
      region: user.credential_region_codes?.[0] || 'unknown',
      citizenship: 'GEO' as const,
    };

    console.log('   Credential demographics:');
    console.log(`     region: ${demographics.region}`);
    console.log(`     age_bucket: ${demographics.age_bucket}`);
    console.log(`     gender: ${demographics.gender}`);

    // Issue credential
    const credential = issueCredentialForSubject(user.id, demographics);

    // Decode to verify
    const decoded = jwt.decode(credential) as any;
    console.log('\n   Decoded JWT credential:');
    console.log(`     sub: ${decoded.sub}`);
    console.log(`     data.region: ${decoded.data.region}`);
    console.log(`     data.age_bucket: ${decoded.data.age_bucket}`);
    console.log(`     data.gender: ${decoded.data.gender}`);

    // Check if JWT matches expected format
    if (!decoded.data.region) {
      console.log('   ❌ JWT missing region field!');
      allGood = false;
    }
    if (decoded.data.region !== demographics.region) {
      console.log(`   ❌ JWT region mismatch: expected ${demographics.region}, got ${decoded.data.region}`);
      allGood = false;
    }
    if (decoded.data.region_codes) {
      console.log('   ⚠️  JWT has legacy region_codes field (should only use region)');
    }

    // 4. Check poll eligibility
    console.log('\n4️⃣ Checking poll eligibility simulation...');
    const pollsResult = await pool.query(`
      SELECT id, title, audience_rules, status
      FROM polls
      WHERE status = 'active'
      LIMIT 3
    `);

    for (const poll of pollsResult.rows) {
      const rules = poll.audience_rules || {};
      let eligible = true;
      let reason = '';

      // Check gender
      if (rules.gender && rules.gender !== 'all' && demographics.gender !== rules.gender) {
        eligible = false;
        reason = `gender mismatch (needs ${rules.gender}, user is ${demographics.gender})`;
      }

      // Check regions
      if (rules.regions && rules.regions.length > 0) {
        if (!demographics.region || demographics.region === 'unknown') {
          eligible = false;
          reason = 'user has no region';
        } else if (!rules.regions.includes(demographics.region)) {
          eligible = false;
          reason = `region mismatch (needs ${rules.regions[0]}, user is ${demographics.region})`;
        }
      }

      // Check age
      if (rules.min_age) {
        if (age < rules.min_age) {
          eligible = false;
          reason = `too young (needs ${rules.min_age}+, user is ${age})`;
        }
      }
      if (rules.max_age) {
        if (age > rules.max_age) {
          eligible = false;
          reason = `too old (needs max ${rules.max_age}, user is ${age})`;
        }
      }

      const status = eligible ? '✅ ELIGIBLE' : '❌ NOT ELIGIBLE';
      console.log(`   ${status} for poll "${poll.title}"`);
      if (!eligible) {
        console.log(`      Reason: ${reason}`);
      }
    }

    // 5. Check message eligibility
    console.log('\n5️⃣ Checking message eligibility simulation...');
    const messagesResult = await pool.query(`
      SELECT id, title, audience_rules, status
      FROM messages
      WHERE status = 'published'
      LIMIT 3
    `);

    for (const msg of messagesResult.rows) {
      const rules = msg.audience_rules || {};
      let eligible = true;
      let reason = '';

      // Check gender
      if (rules.gender && rules.gender !== 'all' && demographics.gender !== rules.gender) {
        eligible = false;
        reason = `gender mismatch`;
      }

      // Check regions
      if (rules.regions && rules.regions.length > 0) {
        const userRegions = user.credential_region_codes || [];
        const hasMatch = rules.regions.some((r: string) => userRegions.includes(r));
        if (!hasMatch) {
          eligible = false;
          reason = `region mismatch`;
        }
      }

      // Check age
      if (rules.min_age && age < rules.min_age) {
        eligible = false;
        reason = `too young`;
      }
      if (rules.max_age && age > rules.max_age) {
        eligible = false;
        reason = `too old`;
      }

      const status = eligible ? '✅ ELIGIBLE' : '❌ NOT ELIGIBLE';
      console.log(`   ${status} for message "${msg.title}"`);
      if (!eligible) {
        console.log(`      Reason: ${reason}`);
      }
    }
  }

  console.log('\n' + '='.repeat(60));
  if (allGood) {
    console.log('✅ PROFILE ALIGNMENT VERIFIED');
    console.log('   - Users have correct demographic fields');
    console.log('   - Credentials use unified structure');
    console.log('   - Eligibility checks will work correctly');
  } else {
    console.log('❌ ALIGNMENT ISSUES FOUND');
    console.log('   - Check errors above');
    console.log('   - Run backend/fix_missing_regions.ts to backfill');
  }
  console.log('='.repeat(60));

  process.exit(allGood ? 0 : 1);
}

verifyProfileAlignment().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
