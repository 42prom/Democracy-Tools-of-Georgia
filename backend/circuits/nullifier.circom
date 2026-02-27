pragma circom 2.0.0;

/*
 * DTG Nullifier Circuit
 * =====================
 * Proves that a voter knows the preimage of their nullifier
 * WITHOUT revealing which voter they are.
 *
 * Public inputs:
 *   - nullifier_hash: The stored nullifier in the DB (public commitment)
 *   - poll_id_hash:   Poseidon(poll_id) — public identifier for the poll
 *
 * Private inputs (known only to the voter):
 *   - voter_sub_hash: Poseidon(voter_sub) — the voter's identity hash
 *   - nullifier_secret_hash: Poseidon(NULLIFIER_SECRET) — server secret commitment
 *
 * Statement proved:
 *   nullifier_hash == Poseidon(nullifier_secret_hash, voter_sub_hash, poll_id_hash)
 *
 * This enables a voter to prove:
 *   "I know a voter_sub whose Poseidon-based nullifier equals the stored nullifier"
 * without revealing voter_sub to anyone — full privacy-preserving vote verification.
 *
 * Compile with:
 *   circom circuits/nullifier.circom --r1cs --wasm --sym -o circuits/build/
 *
 * Setup (one-time trusted setup or PLONK universal):
 *   snarkjs groth16 setup circuits/build/nullifier.r1cs pot12_final.ptau circuits/build/nullifier_0000.zkey
 *   snarkjs zkey contribute circuits/build/nullifier_0000.zkey circuits/build/nullifier_final.zkey
 *   snarkjs zkey export verificationkey circuits/build/nullifier_final.zkey circuits/build/verification_key.json
 *
 * Prove:
 *   snarkjs groth16 fullprove input.json circuits/build/nullifier_js/nullifier.wasm circuits/build/nullifier_final.zkey proof.json public.json
 *
 * Verify:
 *   snarkjs groth16 verify circuits/build/verification_key.json public.json proof.json
 */

include "node_modules/circomlib/circuits/poseidon.circom";
include "node_modules/circomlib/circuits/comparators.circom";

template NullifierProof() {
    // === Public inputs ===
    signal input nullifier_hash;       // The server-stored nullifier
    signal input poll_id_hash;         // Poseidon(poll_id_bytes)

    // === Private inputs (known only to voter) ===
    signal input voter_sub_hash;       // Poseidon(voter_sub_bytes)
    signal input nullifier_secret_hash; // Poseidon(NULLIFIER_SECRET_bytes)

    // === Compute the expected nullifier using Poseidon ===
    component poseidon = Poseidon(3);
    poseidon.inputs[0] <== nullifier_secret_hash;
    poseidon.inputs[1] <== voter_sub_hash;
    poseidon.inputs[2] <== poll_id_hash;

    // === Assert: computed nullifier must equal the public committed nullifier ===
    // This is the core constraint: the proof is valid IFF the voter knows
    // a (voter_sub, nullifier_secret) pair that produces the stored nullifier.
    nullifier_hash === poseidon.out;
}

component main {public [nullifier_hash, poll_id_hash]} = NullifierProof();
