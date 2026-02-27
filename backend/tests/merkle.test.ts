import {
  sha256,
  computeVoteLeaf,
  buildMerkleRoot,
  getMerkleProof,
  verifyMerkleProof,
} from '../src/services/merkle';

/**
 * Unit tests for the Merkle Tree service.
 * Covers: leaf hashing, root building, proof generation, and proof verification.
 */

describe('Merkle Tree Service', () => {

  describe('sha256', () => {
    it('should produce a 64-character hex string', () => {
      expect(sha256('hello')).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should be deterministic', () => {
      expect(sha256('test')).toBe(sha256('test'));
    });

    it('should differ for different inputs', () => {
      expect(sha256('a')).not.toBe(sha256('b'));
    });
  });

  describe('computeVoteLeaf', () => {
    const base = {
      pollId: 'poll-001',
      optionId: 'option-A',
      nullifier: 'nullifier-hash-abc',
      bucketTs: new Date('2025-01-01T12:00:00.000Z'),
    };

    it('should produce a deterministic leaf hash', () => {
      expect(computeVoteLeaf(base)).toBe(computeVoteLeaf(base));
    });

    it('should differ for different options', () => {
      const a = computeVoteLeaf({ ...base, optionId: 'option-A' });
      const b = computeVoteLeaf({ ...base, optionId: 'option-B' });
      expect(a).not.toBe(b);
    });

    it('should differ for different nullifiers', () => {
      const a = computeVoteLeaf({ ...base, nullifier: 'null-1' });
      const b = computeVoteLeaf({ ...base, nullifier: 'null-2' });
      expect(a).not.toBe(b);
    });
  });

  describe('buildMerkleRoot', () => {
    it('should return a fixed "EMPTY_TREE" root for empty leaves', () => {
      const root = buildMerkleRoot([]);
      expect(root).toBe(sha256('EMPTY_TREE'));
    });

    it('should return SHA256 of the single leaf for one leaf', () => {
      const leaf = sha256('vote-content-1');
      const root = buildMerkleRoot([leaf]);
      expect(root).toBe(sha256(leaf));
    });

    it('should produce the same root for same leaf set', () => {
      const leaves = ['a', 'b', 'c'].map(sha256);
      expect(buildMerkleRoot(leaves)).toBe(buildMerkleRoot(leaves));
    });

    it('should change the root when a leaf changes', () => {
      const leaves1 = ['vote-1', 'vote-2', 'vote-3'].map(sha256);
      const leaves2 = ['vote-1', 'vote-X', 'vote-3'].map(sha256);
      expect(buildMerkleRoot(leaves1)).not.toBe(buildMerkleRoot(leaves2));
    });

    it('should handle an even number of leaves', () => {
      const leaves = ['a', 'b', 'c', 'd'].map(sha256);
      const root = buildMerkleRoot(leaves);
      expect(root).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should handle an odd number of leaves (duplicates last)', () => {
      const leaves = ['a', 'b', 'c'].map(sha256);
      const root = buildMerkleRoot(leaves);
      expect(root).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should produce monotonically changing roots as votes are added', () => {
      const leaves = ['v1', 'v2', 'v3', 'v4', 'v5'].map(sha256);
      const roots = new Set<string>();
      for (let i = 1; i <= leaves.length; i++) {
        roots.add(buildMerkleRoot(leaves.slice(0, i)));
      }
      expect(roots.size).toBe(5); // Each addition creates a unique root
    });
  });

  describe('getMerkleProof + verifyMerkleProof', () => {
    const leaves = ['vote-1', 'vote-2', 'vote-3', 'vote-4', 'vote-5'].map(sha256);
    const root = buildMerkleRoot(leaves);

    it('should generate a verifiable proof for every leaf', () => {
      for (let i = 0; i < leaves.length; i++) {
        const proof = getMerkleProof(leaves, i);
        const valid = verifyMerkleProof(leaves[i], proof, root);
        expect(valid).toBe(true);
      }
    });

    it('should reject a tampered leaf', () => {
      const proof = getMerkleProof(leaves, 0);
      const tamperedLeaf = sha256('tampered-vote');
      expect(verifyMerkleProof(tamperedLeaf, proof, root)).toBe(false);
    });

    it('should reject a proof against a different root', () => {
      const proof = getMerkleProof(leaves, 0);
      const wrongRoot = sha256('wrong-root');
      expect(verifyMerkleProof(leaves[0], proof, wrongRoot)).toBe(false);
    });

    it('should reject an empty proof for non-trivial trees', () => {
      expect(verifyMerkleProof(leaves[0], [], root)).toBe(false);
    });

    it('should work for a single-leaf tree', () => {
      const singleLeaf = sha256('only-vote');
      const singleRoot = buildMerkleRoot([singleLeaf]);
      const proof = getMerkleProof([singleLeaf], 0);
      expect(verifyMerkleProof(singleLeaf, proof, singleRoot)).toBe(true);
    });

    it('should throw when index is out of range', () => {
      expect(() => getMerkleProof(leaves, -1)).toThrow();
      expect(() => getMerkleProof(leaves, leaves.length)).toThrow();
    });

    it('should throw for empty leaves array', () => {
      expect(() => getMerkleProof([], 0)).toThrow();
    });
  });
});
