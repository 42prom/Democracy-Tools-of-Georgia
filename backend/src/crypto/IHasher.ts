/**
 * IHasher — Pluggable Cryptographic Hash Interface
 *
 * All hash functions used for nullifiers, Merkle leaves, and audit log rows
 * must implement this interface. This enables swapping between:
 *   - HMAC-SHA256 (current, production-safe, no ZK overhead)
 *   - Poseidon   (ZK-SNARK compatible, same output for circuit proofs)
 *   - Future:    Pedersen, MiMC, or any other algebraic hash
 *
 * The hasher is selected via the CRYPTO_HASHER env var (see CryptoRegistry.ts).
 */
export interface IHasher {
  /** Human-readable name of this hasher (logged at startup). */
  readonly name: string;

  /**
   * Compute the hash of one or more field inputs.
   * All inputs are coerced to strings before hashing.
   * The implementation MUST be deterministic.
   *
   * @param inputs - One or more strings to hash together.
   * @returns      Hex-encoded hash string.
   */
  hash(...inputs: string[]): string | Promise<string>;
}

/**
 * IKeyedHasher — Keyed variant for HMAC-style constructions.
 * Extends IHasher with a secret key so outputs are unforgeable.
 */
export interface IKeyedHasher extends IHasher {
  /** Verify that a given output was produced by this hasher for these inputs. */
  verify(expected: string, ...inputs: string[]): boolean | Promise<boolean>;
}
