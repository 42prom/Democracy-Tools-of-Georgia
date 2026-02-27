#!/usr/bin/env ts-node
/**
 * Audit Log Chain Integrity Verification Script
 *
 * Usage: npx ts-node src/scripts/verify_audit_log.ts
 *
 * This script replays all rows in the `audit_log` table in order (by id),
 * recomputes each row's SHA-256 hash from (event_type | payload | previous_hash | created_at),
 * and verifies that:
 *  1. Each row's stored `row_hash` matches the recomputed hash.
 *  2. Each row's `previous_hash` equals the `row_hash` of the preceding row.
 *
 * A broken chain indicates that a row was modified, deleted, or inserted out of order.
 * Exits 0 if clean, 1 if any violation found.
 */

import { createHash } from 'crypto';
import { pool } from '../db/client';

async function main() {
  console.log('=== DTG Audit Log Chain Integrity Verifier ===');
  console.log(`Timestamp: ${new Date().toISOString()}\n`);

  const res = await pool.query(
    `SELECT id, event_type, payload, previous_hash, row_hash, created_at
     FROM audit_log
     ORDER BY id ASC`
  );

  const rows = res.rows;
  console.log(`Total audit log rows: ${rows.length}`);

  if (rows.length === 0) {
    console.log('ℹ No audit log entries to verify.');
    process.exit(0);
  }

  const GENESIS_HASH = '0000000000000000000000000000000000000000000000000000000000000000';
  let previousHash = GENESIS_HASH;
  let allPassed = true;
  let checkedCount = 0;

  for (const row of rows) {
    const { id, event_type, payload, previous_hash, row_hash, created_at } = row;

    // 1. Verify previous_hash link
    if (previous_hash !== previousHash) {
      console.error(
        `✗ Row #${id}: Chain link broken!\n` +
          `  Expected previous_hash: ${previousHash}\n` +
          `  Stored  previous_hash:  ${previous_hash}`
      );
      allPassed = false;
    }

    // 2. Recompute row_hash
    const ts = new Date(created_at).toISOString();
    const payloadStr = typeof payload === 'string' ? payload : JSON.stringify(payload);
    const computedHash = createHash('sha256')
      .update(`${event_type}|${payloadStr}|${previous_hash}|${ts}`)
      .digest('hex');

    if (computedHash !== row_hash) {
      console.error(
        `✗ Row #${id} (${event_type}): Hash mismatch!\n` +
          `  Computed: ${computedHash}\n` +
          `  Stored:   ${row_hash}`
      );
      allPassed = false;
    } else {
      process.stdout.write(`  ✓ Row #${id} (${event_type})\r`);
    }

    previousHash = row_hash;
    checkedCount++;
  }

  console.log(`\nChecked ${checkedCount} rows.`);
  console.log('\n========================================');

  if (allPassed) {
    console.log('✅ AUDIT LOG INTEGRITY VERIFIED — all hashes and chain links are valid.');
    process.exit(0);
  } else {
    console.error('✗ AUDIT LOG INTEGRITY VIOLATION DETECTED!');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
}).finally(() => pool.end());
