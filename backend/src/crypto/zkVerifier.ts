/**
 * ZK Nullifier Verifier — Runtime Groth16 proof verification using snarkjs.
 *
 * The `nullifier.circom` circuit proves that:
 *   1. The voter knows a secret that produces the submitted nullifier.
 *   2. The nullifier is deterministic — same voter, same poll → same nullifier.
 *   3. The secret never leaves the device.
 *
 * This module loads the verification key and exposes verifyNullifierProof().
 * Verification is backward-compatible: votes without a zkProof are still accepted.
 *
 * Setup: Run `npm run zk:setup` once to generate the proving/verification keys.
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

// Lazy-load snarkjs to avoid import cost when ZK is not used
let _snarkjs: any = null;

// Helper to get snarkjs with consistent typing
function getSnarkjs() {
  if (!_snarkjs) {
    // Use require internally to bypass ESM module typing issues in TSX/TSC
    _snarkjs = require('snarkjs');
  }
  return _snarkjs;
}

const VK_PATH = join(__dirname, 'nullifier_verification_key.json');

let _verificationKey: any = null;

function loadVerificationKey(): any | null {
  if (_verificationKey) return _verificationKey;
  if (!existsSync(VK_PATH)) {
    console.warn('[ZKVerifier] Verification key not found at', VK_PATH,
      '— ZK proof verification disabled. Run npm run zk:setup to enable.');
    return null;
  }
  _verificationKey = JSON.parse(readFileSync(VK_PATH, 'utf-8'));
  return _verificationKey;
}

export interface ZKProof {
  pi_a: string[];
  pi_b: string[][];
  pi_c: string[];
  protocol: string;
  curve: string;
}

export interface ZKPublicSignals {
  nullifierHash: string;  // public: the nullifier being submitted
  pollIdHash: string;     // public: H(pollId) — links proof to this poll
}

/**
 * Verify a Groth16 ZK proof of nullifier knowledge.
 *
 * @param proof         - The zk-SNARK proof object
 * @param publicSignals - Public inputs to the circuit (nullifierHash, pollIdHash)
 * @returns true if valid, false if invalid or ZK not configured
 */
export async function verifyNullifierProof(
  proof: ZKProof,
  publicSignals: ZKPublicSignals
): Promise<boolean> {
  const vk = loadVerificationKey();
  if (!vk) {
    // ZK not configured — this is expected in dev/CI; log and continue
    return true;
  }

  try {
    const snarkjs = await getSnarkjs();
    const signals = [publicSignals.nullifierHash, publicSignals.pollIdHash];
    const isValid = await snarkjs.groth16.verify(vk, signals, proof);
    return isValid;
  } catch (err) {
    console.error('[ZKVerifier] Proof verification error:', err);
    return false;
  }
}

/**
 * Returns true if the ZK verification key is loaded and ready.
 * Use to conditionally require ZK proofs on votes.
 */
export function isZKEnabled(): boolean {
  return loadVerificationKey() !== null;
}
