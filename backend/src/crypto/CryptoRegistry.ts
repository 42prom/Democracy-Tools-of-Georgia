import { IHasher, IKeyedHasher } from './IHasher';
import { HmacHasher } from './HmacHasher';
import { PoseidonHasher } from './PoseidonHasher';

/**
 * CryptoRegistry — Dependency-injection registry for pluggable hash functions.
 *
 * Controlled by the CRYPTO_HASHER environment variable:
 *
 *   CRYPTO_HASHER=hmac     → HMAC-SHA256 (default, production-safe, no extra deps)
 *   CRYPTO_HASHER=poseidon → Poseidon BN254 (ZK-SNARK compatible, requires circomlibjs)
 *
 * The registry is a singleton initialised once at startup.
 * All services call `CryptoRegistry.getNullifierHasher()` instead of
 * instantiating a hasher directly — this is the only change-point for
 * future algorithm upgrades.
 *
 * MIGRATION PATH:
 *   Phase 1 (now):    CRYPTO_HASHER=hmac     — Zero new dependencies, full production.
 *   Phase 2 (ZK):    CRYPTO_HASHER=poseidon  — Install circomlibjs, deploy Circom circuits.
 *   Phase 3 (future): Plug in any new hasher by adding a case here.
 */

export type HasherType = 'hmac' | 'poseidon';

class CryptoRegistryClass {
  private nullifierHasher: IKeyedHasher | null = null;
  private leafHasher: IHasher | null = null;
  private initialised = false;

  /**
   * Initialise the registry. Called once in server startup.
   * Idempotent — safe to call multiple times.
   */
  async init(): Promise<void> {
    if (this.initialised) return;

    const hasherType = (process.env.CRYPTO_HASHER ?? 'hmac').toLowerCase() as HasherType;
    const nullifierSecret = process.env.NULLIFIER_SECRET;

    console.log(`[CryptoRegistry] Initialising with hasher: ${hasherType}`);

    if (hasherType === 'poseidon') {
      // ── Poseidon path (ZK-ready) ──
      const poseidon = new PoseidonHasher();
      await poseidon.init(); // Loads circomlibjs prime field constants

      // Poseidon is public — keyed behaviour is achieved by prepending the secret
      // as the first input (domain separation). This keeps compatibility while
      // remaining provable inside a circuit.
      const keyedPoseidon: IKeyedHasher = {
        name: 'Poseidon-BN254-Keyed',
        hash: (...inputs: string[]) => poseidon.hash(nullifierSecret ?? '', ...inputs),
        verify: (expected: string, ...inputs: string[]) => {
          const computed = poseidon.hash(nullifierSecret ?? '', ...inputs) as string;
          return computed === expected;
        },
      };
      this.nullifierHasher = keyedPoseidon;
      this.leafHasher = poseidon;

    } else {
      // ── HMAC path (default) ──
      if (!nullifierSecret) {
        throw new Error('[CryptoRegistry] NULLIFIER_SECRET is required for HMAC hasher');
      }
      const hmac = new HmacHasher(nullifierSecret);
      this.nullifierHasher = hmac;

      // For Merkle leaf hashing, we use raw SHA-256 (already in merkle.ts sha256())
      // so we don't need to override the leafHasher here.
      this.leafHasher = {
        name: 'SHA-256',
        hash: (...inputs: string[]) => {
          const { createHash } = require('crypto');
          return createHash('sha256').update(inputs.join('|')).digest('hex');
        },
      };
    }

    this.initialised = true;
    console.log(`[CryptoRegistry] Ready. Nullifier hasher: ${this.nullifierHasher.name}`);
  }

  /** Returns the configured nullifier hasher. Throws if not initialised. */
  getNullifierHasher(): IKeyedHasher {
    if (!this.nullifierHasher) {
      throw new Error('[CryptoRegistry] Not initialised. Call CryptoRegistry.init() first.');
    }
    return this.nullifierHasher;
  }

  /** Returns the configured leaf hasher (for Merkle trees). */
  getLeafHasher(): IHasher {
    if (!this.leafHasher) {
      throw new Error('[CryptoRegistry] Not initialised. Call CryptoRegistry.init() first.');
    }
    return this.leafHasher;
  }

  /** Returns the active hasher type name (for logging). */
  getActiveHasherName(): string {
    return this.nullifierHasher?.name ?? 'uninitialised';
  }

  /**
   * Returns the ZK nullifier verifier (M1).
   * Lazy-imported so snarkjs is only loaded when needed.
   */
  async getZKVerifier() {
    const { verifyNullifierProof, isZKEnabled } = await import('./zkVerifier');
    return { verifyNullifierProof, isZKEnabled };
  }
}

export const CryptoRegistry = new CryptoRegistryClass();
