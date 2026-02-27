import { CryptoRegistry } from '../crypto/CryptoRegistry';

/**
 * Nullifier Service — Phase 2
 *
 * Now delegates to the CryptoRegistry for the actual hash computation.
 * The hasher is selected via CRYPTO_HASHER env var:
 *   CRYPTO_HASHER=hmac     → HMAC-SHA256 (default, current production)
 *   CRYPTO_HASHER=poseidon → Poseidon BN254 (ZK-SNARK compatible)
 *
 * Call sites are unchanged — computeNullifier(voterSub, pollId) works the same.
 * Only the underlying hash algorithm changes.
 */

/**
 * Compute a voter nullifier.
 * Deterministic: same inputs always produce the same nullifier.
 * Unforgeable:   without NULLIFIER_SECRET, clients cannot forge it.
 *
 * @param voterSub - The voter's unique identifier (JWT subject / user UUID).
 * @param pollId   - The poll UUID.
 * @returns        64-character hex string (32 bytes) — the nullifier hash.
 */
export async function computeNullifier(voterSub: string, pollId: string): Promise<string> {
  const hasher = CryptoRegistry.getNullifierHasher();
  const result = await hasher.hash(voterSub, pollId);
  return result as string;
}

/**
 * Synchronous HMAC fallback for contexts where async is not feasible
 * (e.g. test stubs). Only valid when CRYPTO_HASHER=hmac (default).
 * For Poseidon mode use the async computeNullifier instead.
 */
export function computeNullifierSync(voterSub: string, pollId: string): string {
  const { createHmac } = require('crypto');
  const secret = process.env.NULLIFIER_SECRET;
  if (!secret) throw new Error('[Nullifier] NULLIFIER_SECRET not set');
  return createHmac('sha256', secret).update(`${voterSub}|${pollId}`).digest('hex');
}

/**
 * Verify a nullifier using the active registry hasher.
 * Constant-time compare via the IKeyedHasher.verify() method.
 */
export async function verifyNullifier(
  voterSub: string,
  pollId: string,
  suppliedNullifier: string
): Promise<boolean> {
  const hasher = CryptoRegistry.getNullifierHasher();
  return hasher.verify(suppliedNullifier, voterSub, pollId) as Promise<boolean>;
}
