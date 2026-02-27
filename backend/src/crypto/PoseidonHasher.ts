import { IHasher } from './IHasher';

/**
 * PoseidonHasher — ZK-SNARK-compatible Poseidon hash implementation.
 *
 * Poseidon is an algebraic hash function over prime fields, specifically
 * designed for efficiency inside zk-SNARK circuits (Circom, Groth16, PLONK).
 * Using Poseidon for nullifiers means the same hash function runs both:
 *   - Server-side: to compute and store nullifiers.
 *   - Circuit-side: inside the Circom nullifier.circom proof.
 * This enables a voter to generate a ZK proof that they know the preimage
 * of their nullifier WITHOUT revealing which voter they are.
 *
 * RUNTIME: Uses `circomlibjs` for the Poseidon implementation.
 * Install: npm install circomlibjs
 *
 * NOTE: The first call initialises the Poseidon parameters asynchronously
 * (prime field constants). Subsequent calls are synchronous via the cached
 * `poseidon` function. The registry pre-warms this on startup.
 */
export class PoseidonHasher implements IHasher {
  readonly name = 'Poseidon-BN254';

  private poseidon: ((inputs: bigint[]) => bigint) | null = null;
  private F: any = null;

  /**
   * Initialise Poseidon parameters. Must be called once before first use.
   * CryptoRegistry calls this during wakeup.
   */
  async init(): Promise<void> {
    try {
      // Dynamic import — circomlibjs is optional; system gracefully falls back
      // to HMAC if not installed.
      // @ts-ignore — optional ZK dep; install with: npm install circomlibjs
      const { buildPoseidon } = await import('circomlibjs');
      const poseidonFn = await buildPoseidon();
      this.poseidon = poseidonFn;
      this.F = poseidonFn.F;
      console.log('[PoseidonHasher] Initialised Poseidon over BN254 prime field.');
    } catch (err: any) {
      throw new Error(
        '[PoseidonHasher] Failed to load circomlibjs. ' +
        'Install it with: npm install circomlibjs\n' +
        err.message
      );
    }
  }

  /**
   * Hash up to 16 string inputs using Poseidon over BN254.
   * Each input string is first converted to a BigInt via UTF-8 byte encoding.
   *
   * The output is a hex-encoded 254-bit prime field element (32 bytes).
   */
  hash(...inputs: string[]): string {
    if (!this.poseidon || !this.F) {
      throw new Error(
        '[PoseidonHasher] Not initialised. Call init() first or use CryptoRegistry.'
      );
    }
    if (inputs.length > 16) {
      throw new Error('[PoseidonHasher] Maximum 16 inputs supported per call.');
    }

    // Convert each string to a BigInt field element
    const fieldInputs = inputs.map((s) => {
      const bytes = Buffer.from(s, 'utf8');
      // Read as big-endian BigInt, mod BN254 prime to stay in field
      const bn = BigInt('0x' + bytes.toString('hex'));
      return bn % this.F.p;
    });

    const result: bigint = this.poseidon(fieldInputs);
    // Convert field element to 32-byte hex string
    return this.F.toString(result, 16).padStart(64, '0');
  }
}
