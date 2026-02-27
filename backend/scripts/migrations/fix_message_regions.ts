/**
 * Fix messages: Convert region UUIDs to region codes
 * Run: npx tsx backend/fix_message_regions.ts
 */

import { pool } from '../../src/db/client';

async function fixMessageRegions() {
  console.log('🔧 Fixing Message Region UUIDs → Codes\n');

  // 1. Get all regions (UUID → code mapping)
  const regionsResult = await pool.query(`
    SELECT id, code, name_en FROM regions
  `);

  const uuidToCode = new Map<string, string>();
  for (const region of regionsResult.rows) {
    uuidToCode.set(region.id, region.code);
  }

  console.log(`📊 Found ${uuidToCode.size} regions\n`);

  // 2. Get all messages
  const messagesResult = await pool.query(`
    SELECT id, title, audience_rules FROM messages
  `);

  console.log(`Found ${messagesResult.rows.length} messages to check:\n`);

  let fixedCount = 0;

  for (const message of messagesResult.rows) {
    const rules = message.audience_rules || {};
    const regions = rules.regions || [];

    if (regions.length === 0) {
      console.log(`  ⏭️  Message "${message.title}" has no region restrictions`);
      continue;
    }

    // Check if regions are UUIDs (36 chars with dashes) or codes
    const firstRegion = regions[0];
    const isUUID = firstRegion.length === 36 && firstRegion.includes('-');

    if (!isUUID) {
      console.log(`  ✅ Message "${message.title}" already uses codes`);
      continue;
    }

    // Convert UUIDs to codes
    console.log(`  🔄 Message "${message.title}" - Converting ${regions.length} UUIDs to codes...`);

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
      // Update message with region codes
      const newRules = { ...rules, regions: convertedRegions };

      await pool.query(
        `UPDATE messages SET audience_rules = $1 WHERE id = $2`,
        [JSON.stringify(newRules), message.id]
      );

      console.log(`     ✅ Converted to: ${convertedRegions.join(', ')}`);
      fixedCount++;
    } else {
      console.log(`     ❌ No valid regions found for this message`);
    }

    console.log('');
  }

  console.log('\n' + '='.repeat(60));
  console.log(`✅ Fixed ${fixedCount} messages`);
  console.log('='.repeat(60));

  if (fixedCount > 0) {
    console.log('\n🎉 Messages now use region CODES instead of UUIDs');
  }

  process.exit(0);
}

fixMessageRegions().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
