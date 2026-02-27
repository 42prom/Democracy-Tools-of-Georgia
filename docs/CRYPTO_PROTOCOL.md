# DTG Cryptographic Protocol Specification v2.0

**Democracy Tools of Georgia (DTG)**
Protocol version: 2.0 (Phase 2 — ZK-Ready)
Status: Production / ZK-Ready
Authors: DTG Engineering Team

---

## 1. Overview

DTG implements an election-grade voting protocol that guarantees:

| Property                   | Mechanism                                           |
| -------------------------- | --------------------------------------------------- |
| **Double-vote prevention** | Server-computed nullifiers (HMAC-SHA256 / Poseidon) |
| **Vote integrity**         | Per-poll Merkle tree, anchored to Ethereum          |
| **Receipt authenticity**   | Ed25519 signed receipts                             |
| **Audit immutability**     | Chained-hash audit log (SHA-256 chain)              |
| **Privacy (Phase 2)**      | Poseidon hash + Groth16 ZK nullifier proofs         |
| **Availability**           | No blockchain dependency for vote submission        |

---

## 2. Cryptographic Primitives

| Primitive         | Algorithm                                        | Purpose                            |
| ----------------- | ------------------------------------------------ | ---------------------------------- |
| Nullifier hash    | HMAC-SHA256 (Phase 1) / Poseidon BN254 (Phase 2) | Linkage prevention                 |
| Merkle hash       | SHA-256                                          | Vote tree leaf/internal nodes      |
| Receipt signing   | Ed25519                                          | Voter receipt authentication       |
| Audit chain       | SHA-256                                          | Tamper-evident log chaining        |
| ZK proof          | Groth16 over BN254                               | Privacy-preserving nullifier proof |
| Blockchain anchor | Ethereum `eth_sendRawTransaction`                | Merkle root immutability           |

---

## 3. Vote Submission Protocol (13 Steps)

```
Voter → Backend → DB → Blockchain
```

### Step 1: Nonce Request

```
GET /api/v1/polls/{pollId}/nonce
→ { nonce: "uuid4", expiresAt: "ISO8601" }
```

Nonces are single-use, 5-minute TTL, stored in Redis. Prevents replay attacks.

### Step 2: Nonce Validation

Server verifies nonce exists in Redis and deletes it atomically (consume-once).

### Step 3: Poll Validation

- Poll must exist and be `status = 'active'`
- `start_at ≤ now ≤ end_at` (if time-bounded)

### Step 4: Option Validation

`optionId` must belong to this poll.

### Step 5: Audience Eligibility Check

Poll `audience_rules` checked against voter credential data:

- `regions`: voter's region must be in the allowed list
- `age_buckets`: voter's age bucket must match
- `gender`: voter's gender must match (optional)

### Step 6: Device Attestation

If `require_device_attestation = true`, device fingerprint must be approved.

### Step 7: Server Nullifier Computation

```
nullifier = HMAC-SHA256(NULLIFIER_SECRET, voterSub | pollId)
         // Phase 2: Poseidon(NULLIFIER_SECRET, voterSub, pollId) over BN254
```

Client-supplied nullifiers are **ignored**. The server always computes its own.

### Step 8: Double-Vote Prevention

`SELECT FROM vote_nullifiers WHERE nullifier = $1 AND poll_id = $2`
If found → 409 Conflict.

### Step 9: Merkle Leaf Hash Computation

```
bucketTs = floor(now / 10min) * 10min   // 10-minute bucketing for privacy
leaf = SHA256("${pollId}|${optionId}|${nullifier}|${bucketTs.toISOString()}")
```

### Step 10: Database Write (Atomic Transaction)

```sql
INSERT INTO vote_nullifiers ...       -- double-vote lock
INSERT INTO votes ...                 -- vote record
UPDATE polls SET merkle_root = ...    -- Merkle root update
INSERT INTO vote_attestations ...     -- server signature over vote
```

### Step 11: Merkle Root Update

All existing leaf hashes for the poll are fetched and a new Merkle root is computed:

```
root = buildMerkleRoot([leaf₀, leaf₁, ..., leafₙ])
```

The root is written to `polls.merkle_root`.

### Step 12: Receipt Signing

```
receipt = {
  payload: { voteId, pollId, leafHash, merkleRoot, ts },
  signature: Ed25519Sign(RECEIPT_PRIVATE_KEY, JSON.stringify(payload)),
  algorithm: "Ed25519",
  version: 1
}
```

### Step 13: Response

```json
{
  "success": true,
  "voteId": "...",
  "receipt": { "payload": {...}, "signature": "...", "algorithm": "Ed25519" },
  "merkleRoot": "64-char-hex"
}
```

---

## 4. Merkle Tree Construction

Leaves are vote hashes ordered by `votes.created_at ASC`.

```
Level 0 (leaves): [h₀, h₁, h₂, h₃, h₄]
                        ↓ pad odd: duplicate last leaf
                   [h₀, h₁, h₂, h₃, h₄, h₄]

Level 1:          [H(sort(h₀,h₁)), H(sort(h₂,h₃)), H(sort(h₄,h₄))]

Level 2:          [H(sort(n₀,n₁)), H(sort(n₂,n₂))]

Root:              H(sort(p₀, p₁))
```

Siblings are **sorted before hashing** (`min(a,b) || max(a,b)`) to ensure proofs are order-independent.

### Merkle Inclusion Proof

A voter can verify their vote is in the tree:

```
GET /api/v1/public/merkle-root/{pollId}
→ { merkleRoot, onChainAnchor, txHash }

POST /api/v1/public/verify-receipt
→ { valid, signatureValid, payload, onChainAnchor }
```

---

## 5. Blockchain Anchoring

The `VoteAnchorService` periodically (every 5 min) calls:

```
eth_sendRawTransaction with data = polls.merkle_root
```

to an Ethereum-compatible chain. The transaction hash is stored in `vote_anchors`.
This makes the Merkle root **publicly and immutably verifiable** by any auditor.

---

## 6. Chained-Hash Audit Log

Every security event writes a row:

```
row_hash = SHA256(eventType | JSON(payload) | previousRowHash | timestamp)
```

The genesis row uses `previousRowHash = "000...0"` (64 zeros).
Any deletion or modification of a row breaks the chain.

Verify with: `npx ts-node src/scripts/verify_audit_log.ts`

---

## 7. ZK Proof Extension (Phase 2)

When `CRYPTO_HASHER=poseidon`, nullifiers are computed using Poseidon over BN254, enabling voters to generate Groth16 proofs:

```
Circuit: NullifierProof (circuits/nullifier.circom)
Public:  [nullifier_hash, poll_id_hash]
Private: [voter_sub_hash, nullifier_secret_hash]
Statement: nullifier_hash == Poseidon(nullifier_secret_hash, voter_sub_hash, poll_id_hash)
```

This proves vote inclusion without revealing which voter cast the vote.

### Migration from HMAC to Poseidon

1. Set `CRYPTO_HASHER=poseidon`
2. Install `circomlibjs snarkjs`: `npm install circomlibjs snarkjs`
3. Run Groth16 setup (one-time): see comments in `zkProof.ts`
4. All new nullifiers use Poseidon; existing HMAC nullifiers remain valid for historical votes.

---

## 8. Key Management

| Secret                    | Source         | Rotation                                                        |
| ------------------------- | -------------- | --------------------------------------------------------------- |
| `NULLIFIER_SECRET`        | Vault / `.env` | **Never rotate** without clearing `vote_nullifiers` table first |
| `RECEIPT_PRIVATE_KEY_PEM` | Vault / `.env` | Safe to rotate; old receipts verifiable with old public key     |
| `JWT_SECRET`              | Vault / `.env` | Rotate → all sessions invalidated                               |
| `BLOCKCHAIN_PRIVATE_KEY`  | Vault / `.env` | Rotate by funding new wallet and updating `CONTRACT_ADDRESS`    |

### Vault Integration

Set `VAULT_ADDR` + `VAULT_TOKEN` to enable HashiCorp Vault:

```bash
vault kv put secret/dtg \
  NULLIFIER_SECRET="..." \
  RECEIPT_PRIVATE_KEY_PEM="..." \
  JWT_SECRET="..." \
  BLOCKCHAIN_PRIVATE_KEY="..."
```

---

## 9. Independent Audit Verification

Any third party with read access to the database can verify:

```bash
# Verify all Merkle roots
npx ts-node backend/src/scripts/verify_merkle.ts

# Verify audit log chain integrity
npx ts-node backend/src/scripts/verify_audit_log.ts

# Full sweep (Merkle + audit log)
npx ts-node backend/src/scripts/verify_vote_integrity.ts

# Verify a specific receipt (no DB access needed)
curl -X POST https://api.dtg.ge/api/v1/public/verify-receipt \
  -H "Content-Type: application/json" \
  -d '{"receipt": <paste receipt JSON>}'
```

---

## 10. Data Flow Diagram

```
Voter submits vote
       │
       ▼
[1] Nonce consumed (Redis → deleted)
       │
       ▼
[2] Poll + audience validation
       │
       ▼
[3] Server computes nullifier
    HMAC-SHA256(SECRET, voter|poll) OR Poseidon(SECRET, voter, poll)
       │
       ▼
[4] Double-vote check: vote_nullifiers table
    ┌── If exists → 409 Conflict
    └── If new → continue
       │
       ▼
[5] Atomic DB transaction
    ├── INSERT vote_nullifiers
    ├── INSERT votes (with SHA256 leaf hash)
    ├── UPDATE polls.merkle_root
    └── INSERT vote_attestations (server Ed25519 sig)
       │
       ▼
[6] Ed25519 signed receipt generated
       │
       ▼
[7] Response: { receipt, merkleRoot }
       │
       ▼
[8] (Async) VoteAnchorService anchors merkle_root → Ethereum
       │
       ▼
[9] (Optional) Voter generates Groth16 ZK proof
    Proves: I know voter_sub s.t. Poseidon(secret, voter_sub, poll) = nullifier
```

---

_This document should be published alongside the source code for full open-source auditability._
