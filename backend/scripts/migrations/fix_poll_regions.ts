/**
 * Fix polls: Convert region UUIDs to region codes
 * Run: npx tsx backend/fix_poll_regions.ts
 */

import { pool } from '../../src/db/client';

async function fixPollRegions() {
  console.log('🔧 Fixing Poll Region UUIDs → Codes\n');

  // 1. Get all regions (UUID → code mapping)
  const regionsResult = await pool.query(`
    SELECT id, code, name_en FROM regions
  `);

  const uuidToCode = new Map<string, string>();
  for (const region of regionsResult.rows) {
    uuidToCode.set(region.id, region.code);
    console.log(`   ${region.code.padEnd(20)} → ${region.id}`);
  }

  console.log(`\n📊 Found ${uuidToCode.size} regions\n`);

  // 2. Get all polls
  const pollsResult = await pool.query(`
    SELECT id, title, audience_rules FROM polls
  `);

  console.log(`Found ${pollsResult.rows.length} polls to check:\n`);

  let fixedCount = 0;

  for (const poll of pollsResult.rows) {
    const rules = poll.audience_rules || {};
    const regions = rules.regions || [];

    if (regions.length === 0) {
      console.log(`  ⏭️  Poll "${poll.title}" has no region restrictions`);
      continue;
    }

    // Check if regions are UUIDs (36 chars with dashes) or codes
    const firstRegion = regions[0];
    const isUUID = firstRegion.length === 36 && firstRegion.includes('-');

    if (!isUUID) {
      console.log(`  ✅ Poll "${poll.title}" already uses codes: ${regions.slice(0, 2).join(', ')}...`);
      continue;
    }

    // Convert UUIDs to codes
    console.log(`  🔄 Poll "${poll.title}" - Converting ${regions.length} UUIDs to codes...`);

    const convertedRegions: string[] = [];
    for (const uuid of regions) {
      const code = uuidToCode.get(uuid);
      if (code) {
        convertedRegions.push(code);
      } else {
        console.log(`     ⚠️  Warning: UUID ${uuid} not found in regions table`);
      }
    }

    if (convertedRegions.length > 0) {
      // Update poll with region codes
      const newRules = { ...rules, regions: convertedRegions };

      await pool.query(
        `UPDATE polls SET audience_rules = $1 WHERE id = $2`,
        [JSON.stringify(newRules), poll.id]
      );

      console.log(`     ✅ Converted to: ${convertedRegions.slice(0, 3).join(', ')}${convertedRegions.length > 3 ? '...' : ''}`);
      fixedCount++;
    } else {
      console.log(`     ❌ No valid regions found for this poll`);
    }

    console.log('');
  }

  console.log('\n' + '='.repeat(60));
  console.log(`✅ Fixed ${fixedCount} polls`);
  console.log('='.repeat(60));

  if (fixedCount > 0) {
    console.log('\n🎉 Polls now use region CODES instead of UUIDs');
    console.log('   Users should now be able to see eligible polls!');
    console.log('\n   Restart backend and test mobile app.');
  }

  process.exit(0);
}

fixPollRegions().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
