/**
 * ZK Proof Service
 *
 * Provides zero-knowledge proof generation and verification for votes.
 * Voters can generate a proof that:
 *  - They know the preimage of their nullifier (without revealing who they are)
 *  - Their vote is included in the Merkle tree (without revealing which leaf)
 *
 * STACK: snarkjs (Groth16) + circomlibjs (Poseidon) + pre-compiled circuit
 *
 * SETUP REQUIRED (one-time, run by admin):
 *   1. Install: npm install snarkjs circomlibjs
 *   2. Compile circuit:
 *        cd backend
 *        npx circom circuits/nullifier.circom --r1cs --wasm --sym -o circuits/build/
 *   3. Powers of Tau (or use existing DTG ptau):
 *        snarkjs powersoftau new bn128 12 circuits/build/pot12_0000.ptau -v
 *        snarkjs powersoftau prepare phase2 circuits/build/pot12_0000.ptau circuits/build/pot12_final.ptau -v
 *   4. Groth16 setup:
 *        snarkjs groth16 setup circuits/build/nullifier.r1cs circuits/build/pot12_final.ptau circuits/build/nullifier_0000.zkey
 *        snarkjs zkey contribute circuits/build/nullifier_0000.zkey circuits/build/nullifier_final.zkey --name="DTG-phase2"
 *        snarkjs zkey export verificationkey circuits/build/nullifier_final.zkey circuits/build/verification_key.json
 *
 * USAGE (voter-side, in Flutter app):
 *   The Flutter app calls POST /api/v1/public/generate-proof-inputs  ← server builds witness inputs
 *   Then locally proves inside the app using snarkjs WASM or sends to this service.
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

// Paths to compiled circuit artefacts
const CIRCUITS_BASE = join(__dirname, '../../circuits/build');
const WASM_PATH = join(CIRCUITS_BASE, 'nullifier_js/nullifier.wasm');
const ZKEY_PATH = join(CIRCUITS_BASE, 'nullifier_final.zkey');
const VKEY_PATH = join(CIRCUITS_BASE, 'verification_key.json');

export interface NullifierProofInputs {
  // Public
  nullifier_hash: string;  // field element (hex)
  poll_id_hash: string;    // Poseidon(pollId)
  // Private (known only to voter)
  voter_sub_hash: string;       // Poseidon(voterSub) — NOT sent to server
  nullifier_secret_hash: string; // Poseidon(NULLIFIER_SECRET) — NOT sent to server
}

export interface ZKProof {
  proof: {
    pi_a: string[];
    pi_b: string[][];
    pi_c: string[];
    protocol: string;
    curve: string;
  };
  publicSignals: string[];
}

export interface ProofVerificationResult {
  valid: boolean;
  error?: string;
}

/**
 * Check whether the circuit build artefacts exist.
 * Returns false if snarkjs setup hasn't been run yet.
 */
export function isZKReady(): boolean {
  return existsSync(WASM_PATH) && existsSync(ZKEY_PATH) && existsSync(VKEY_PATH);
}

/**
 * Generate server-side witness inputs for the nullifier proof.
 * The PRIVATE inputs (voter_sub_hash, nullifier_secret_hash) are
 * returned only to the requesting voter and NEVER stored server-side.
 *
 * The voter's client uses these as input to snarkjs.fullProve() locally.
 *
 * @param voterSub   - Voter's sub (from their JWT — must match the stored nullifier).
 * @param pollId     - Target poll ID.
 * @param nullifier  - The stored server nullifier (public).
 */
export async function buildProofInputs(
  voterSub: string,
  pollId: string,
  nullifier: string
): Promise<NullifierProofInputs> {
  let buildPoseidon: any;
  try {
    // @ts-ignore — optional ZK dep; install with: npm install circomlibjs snarkjs
    const lib = await import('circomlibjs');
    buildPoseidon = lib.buildPoseidon;
  } catch {
    throw new Error(
      '[ZKProof] circomlibjs not installed. Run: npm install circomlibjs snarkjs'
    );
  }

  const poseidon = await buildPoseidon();
  const F = poseidon.F;

  const toField = (s: string) => {
    const bytes = Buffer.from(s, 'utf8');
    const bn = BigInt('0x' + bytes.toString('hex'));
    return (bn % F.p).toString();
  };

  const nullifierSecret = process.env.NULLIFIER_SECRET ?? '';

  return {
    nullifier_hash: nullifier,
    poll_id_hash: F.toString(poseidon([BigInt(toField(pollId))]), 10),
    voter_sub_hash: F.toString(poseidon([BigInt(toField(voterSub))]), 10),
    nullifier_secret_hash: F.toString(poseidon([BigInt(toField(nullifierSecret))]), 10),
  };
}

/**
 * Verify a ZK proof that the voter knows the preimage of their nullifier.
 * Only requires the public signals — no private data needed.
 *
 * @param proof         - The Groth16 proof object from snarkjs.
 * @param publicSignals - [nullifier_hash, poll_id_hash]
 */
export async function verifyNullifierProof(
  proof: ZKProof['proof'],
  publicSignals: string[]
): Promise<ProofVerificationResult> {
  if (!isZKReady()) {
    return {
      valid: false,
      error: 'ZK circuit not compiled. Run the Groth16 setup steps documented in zkProof.ts.',
    };
  }

  try {
    // @ts-ignore — optional ZK dep; install with: npm install snarkjs
    const snarkjs = await import('snarkjs');
    const vKey = JSON.parse(readFileSync(VKEY_PATH, 'utf8'));
    const valid = await snarkjs.groth16.verify(vKey, publicSignals, proof);
    return { valid };
  } catch (err: any) {
    return { valid: false, error: err.message };
  }
}

/**
 * Generate a full Groth16 proof server-side (for testing/demo).
 * In production, proofs should be generated client-side (in the Flutter app)
 * to preserve zero-knowledge — the server should never see private inputs.
 */
export async function generateProofServerSide(
  inputs: NullifierProofInputs
): Promise<ZKProof> {
  if (!isZKReady()) {
    throw new Error('[ZKProof] Circuit artefacts not found. Run Groth16 setup first.');
  }

  // @ts-ignore — optional ZK dep; install with: npm install snarkjs
  const snarkjs = await import('snarkjs');
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    inputs,
    WASM_PATH,
    ZKEY_PATH
  );
  return { proof: proof as any, publicSignals };
}
