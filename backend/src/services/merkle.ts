import { createHash } from 'crypto';

/**
 * Merkle Tree Service
 *
 * Provides a pure-function, SHA-256 based Merkle tree implementation for
 * vote integrity. Each vote is a "leaf" hashed from its content; the root
 * commits to the entire set of votes in a poll.
 *
 * Features:
 *  - buildMerkleRoot(leaves):  Compute the root from raw leaf strings.
 *  - getMerkleProof(leaves, i): Produce a sibling-path proof for leaf i.
 *  - verifyMerkleProof(leaf, proof, root): Verify inclusion without rebuilding the full tree.
 */

/** Compute SHA-256 hex of a string. */
export function sha256(data: string): string {
  return createHash('sha256').update(data).digest('hex');
}

/**
 * Hash a vote into a leaf node.
 * Format: SHA256(pollId + '|' + optionId + '|' + nullifier + '|' + bucketTs)
 * All fields are canonical strings; '|' separators prevent concatenation ambiguity.
 */
export function computeVoteLeaf(params: {
  pollId: string;
  optionId: string;
  nullifier: string;
  bucketTs: Date;
}): string {
  const content = [
    params.pollId,
    params.optionId,
    params.nullifier,
    params.bucketTs.toISOString(),
  ].join('|');
  return sha256(content);
}

/**
 * Build the Merkle root from an array of already-hashed leaf strings.
 * If an odd number of leaves exist, the last leaf is duplicated.
 *
 * @param leaves - Array of hex-encoded SHA-256 leaf hashes.
 * @returns      The Merkle root as a 64-char hex string.
 */
export function buildMerkleRoot(leaves: string[]): string {
  if (leaves.length === 0) {
    return sha256('EMPTY_TREE');
  }
  if (leaves.length === 1) {
    return sha256(leaves[0]); // Single leaf: hash it once more
  }

  let level: string[] = [...leaves];

  while (level.length > 1) {
    const next: string[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i];
      const right = i + 1 < level.length ? level[i + 1] : level[i]; // duplicate if odd
      // Sort before hashing so sibling order doesn't matter for verification
      const [a, b] = left <= right ? [left, right] : [right, left];
      next.push(sha256(a + b));
    }
    level = next;
  }

  return level[0];
}

/**
 * Generate a Merkle inclusion proof for the leaf at `index`.
 *
 * @param leaves - Full array of leaf hashes (the same array used to build the root).
 * @param index  - Zero-based index of the leaf to prove.
 * @returns Array of { sibling, position } objects from leaf to root.
 */
export interface MerkleProofStep {
  sibling: string;
  position: 'left' | 'right';
}

export function getMerkleProof(leaves: string[], index: number): MerkleProofStep[] {
  if (leaves.length === 0) throw new Error('Cannot prove membership in empty tree');
  if (index < 0 || index >= leaves.length) throw new Error('Index out of range');

  const proof: MerkleProofStep[] = [];
  let level: string[] = [...leaves];
  let idx = index;

  while (level.length > 1) {
    const siblingIdx = idx % 2 === 0 ? idx + 1 : idx - 1;
    const sibling = siblingIdx < level.length ? level[siblingIdx] : level[idx];
    const position: 'left' | 'right' = idx % 2 === 0 ? 'right' : 'left';
    proof.push({ sibling, position });

    const next: string[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i];
      const right = i + 1 < level.length ? level[i + 1] : level[i];
      const [a, b] = left <= right ? [left, right] : [right, left];
      next.push(sha256(a + b));
    }
    level = next;
    idx = Math.floor(idx / 2);
  }

  return proof;
}

/**
 * Verify a leaf's inclusion in a Merkle tree given its proof and the known root.
 *
 * @param leaf  - The leaf hash to verify (hex string).
 * @param proof - The proof steps returned by getMerkleProof.
 * @param root  - The trusted Merkle root (from DB or on-chain anchor).
 * @returns true if the leaf is included in the tree represented by root.
 */
export function verifyMerkleProof(
  leaf: string,
  proof: MerkleProofStep[],
  root: string
): boolean {
  // Single-leaf tree: buildMerkleRoot hashes the leaf one extra time.
  // Empty proof means no siblings — the root is sha256(leaf), not leaf itself.
  if (proof.length === 0) {
    return sha256(leaf) === root;
  }

  let current = leaf;
  for (const step of proof) {
    const [a, b] =
      current <= step.sibling
        ? [current, step.sibling]
        : [step.sibling, current];
    current = sha256(a + b);
  }
  return current === root;
}
