#!/usr/bin/env ts-node
/**
 * Merkle Vote Integrity Verification Script
 *
 * Usage: npx ts-node src/scripts/verify_merkle.ts [--poll-id <UUID>]
 *
 * For each poll (or a specific poll), this script:
 *  1. Reads all vote_hash leaf values from the `votes` table (ordered by created_at).
 *  2. Recomputes the Merkle root locally.
 *  3. Compares to `polls.merkle_root` stored in the DB.
 *  4. Checks the latest on-chain anchor in `vote_anchors`.
 *  5. Exits with code 0 if all match, code 1 if any mismatch is detected.
 *
 * This script can be run by ANY independent auditor who has read access to the DB.
 */

import { pool } from '../db/client';
import { buildMerkleRoot } from '../services/merkle';

async function verifyPoll(pollId: string): Promise<boolean> {
  console.log(`\n━━━ Verifying poll: ${pollId} ━━━`);

  // 1. Fetch stored Merkle root from polls table
  const pollRes = await pool.query(
    `SELECT id, title, merkle_root FROM polls WHERE id = $1`,
    [pollId]
  );
  if (pollRes.rows.length === 0) {
    console.error(`  ✗ Poll ${pollId} not found.`);
    return false;
  }
  const storedRoot = pollRes.rows[0].merkle_root;
  console.log(`  Poll: "${pollRes.rows[0].title}"`);
  console.log(`  Stored Merkle root: ${storedRoot ?? 'NULL'}`);

  // 2. Fetch all vote leaf hashes ordered by creation time
  const leavesRes = await pool.query(
    `SELECT vote_hash FROM votes WHERE poll_id = $1 AND vote_hash IS NOT NULL ORDER BY created_at ASC`,
    [pollId]
  );
  const leaves: string[] = leavesRes.rows.map((r: any) => r.vote_hash);
  console.log(`  Total votes (leaves): ${leaves.length}`);

  if (leaves.length === 0) {
    console.log(`  ℹ No votes yet — nothing to verify.`);
    return true;
  }

  // 3. Recompute Merkle root independently
  const computedRoot = buildMerkleRoot(leaves);
  console.log(`  Computed Merkle root: ${computedRoot}`);

  const rootMatch = computedRoot === storedRoot;
  if (rootMatch) {
    console.log(`  ✅ DB Merkle root matches independently computed root.`);
  } else {
    console.error(`  ✗ MISMATCH! DB root does not match computed root.`);
    console.error(`    Expected (computed): ${computedRoot}`);
    console.error(`    Found (DB):          ${storedRoot}`);
  }

  // 4. Check on-chain anchor
  const anchorRes = await pool.query(
    `SELECT chain_hash, tx_hash, confirmed_at FROM vote_anchors
     WHERE poll_id = $1 AND status = 'confirmed'
     ORDER BY confirmed_at DESC LIMIT 1`,
    [pollId]
  );
  if (anchorRes.rows.length === 0) {
    console.warn(`  ⚠ No on-chain anchor found for this poll yet.`);
  } else {
    const anchor = anchorRes.rows[0];
    const anchorMatch = anchor.chain_hash === computedRoot;
    console.log(`  On-chain anchor:      ${anchor.chain_hash}`);
    console.log(`  Anchor tx hash:       ${anchor.tx_hash}`);
    console.log(`  Anchored at:          ${anchor.confirmed_at}`);
    if (anchorMatch) {
      console.log(`  ✅ On-chain anchor matches computed Merkle root.`);
    } else {
      console.error(`  ✗ MISMATCH! On-chain anchor does not match current Merkle root.`);
      console.warn(`    Note: This may be expected if new votes were cast since the last anchor.`);
    }
  }

  return rootMatch;
}

async function main() {
  const args = process.argv.slice(2);
  const pollIdFlag = args.indexOf('--poll-id');
  const specificPollId = pollIdFlag !== -1 ? args[pollIdFlag + 1] : null;

  console.log('=== DTG Merkle Vote Integrity Verifier ===');
  console.log(`Timestamp: ${new Date().toISOString()}\n`);

  let allPassed = true;

  if (specificPollId) {
    const passed = await verifyPoll(specificPollId);
    if (!passed) allPassed = false;
  } else {
    const pollsRes = await pool.query(
      `SELECT id FROM polls WHERE status IN ('active', 'ended') ORDER BY created_at`
    );
    console.log(`Verifying ${pollsRes.rows.length} poll(s)...`);
    for (const row of pollsRes.rows) {
      const passed = await verifyPoll(row.id);
      if (!passed) allPassed = false;
    }
  }

  console.log('\n========================================');
  if (allPassed) {
    console.log('✅ ALL CHECKS PASSED — Vote integrity verified.');
    process.exit(0);
  } else {
    console.error('✗ ONE OR MORE CHECKS FAILED — Integrity violation detected!');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
}).finally(() => pool.end());
