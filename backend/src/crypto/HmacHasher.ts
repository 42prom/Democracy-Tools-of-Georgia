import { createHmac } from 'crypto';
import { IKeyedHasher } from './IHasher';

/**
 * HmacHasher — HMAC-SHA256 implementation of IKeyedHasher.
 *
 * This is the current production hasher. It wraps the existing nullifier
 * computation so that switching to Poseidon requires only changing the
 * registry configuration, not the call sites.
 *
 * Properties:
 *  - Production safe: FIPS-140 approved, available in Node core.
 *  - Keyed: outputs are unforgeable without knowing the secret.
 *  - NOT ZK-compatible: cannot be used inside Circom circuits directly.
 *    Use PoseidonHasher for that.
 */
export class HmacHasher implements IKeyedHasher {
  readonly name = 'HMAC-SHA256';

  constructor(private readonly secret: string) {
    if (!secret || secret.length < 16) {
      throw new Error('[HmacHasher] Secret must be at least 16 characters');
    }
  }

  /**
   * Compute HMAC-SHA256 over concatenated inputs, separated by '|'.
   * The '|' separator prevents prefix-concatenation attacks.
   */
  hash(...inputs: string[]): string {
    return createHmac('sha256', this.secret)
      .update(inputs.join('|'))
      .digest('hex');
  }

  /**
   * Constant-time comparison to prevent timing attacks.
   */
  verify(expected: string, ...inputs: string[]): boolean {
    const computed = this.hash(...inputs);
    if (expected.length !== computed.length) return false;
    let diff = 0;
    for (let i = 0; i < computed.length; i++) {
      diff |= expected.charCodeAt(i) ^ computed.charCodeAt(i);
    }
    return diff === 0;
  }
}
