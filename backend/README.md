# DTG Backend API 🛡️

The core engine for the **Democracy Tools of Georgia** system, built on **Mikheili Nakeuri's Protocol**. This service manages identity verification, poll administration, secure voting, and the immutable ballot ledger.

## 🚀 Key Features

### 🔐 Security & Identity

- **Device Attestation**: Prevents emulators and rooted devices from voting.
- **Biometric Orchestration**: Integrates with the Python Biometric Service for face verification.
- **Nonce Replay Prevention**: Uses Redis for atomic challenge-response cycles.
- **Rate Limiting**: Tiered protection for Login, Enrollment, and API endpoints.

### 🗳️ Voting Engine

- **Immutable Ballot Ledger**:
  - **Layer 1 (Merkle Tree)**: Every vote is a leaf in a SHA-256 Merkle tree per poll. The incremental root is updated atomically on each vote inside a single ACID transaction.
  - **Layer 2 (Blockchain)**: The `VoteAnchorService` anchors each poll's Merkle root to both a public blockchain and the `vote_anchors` DB table every 10 minutes.
- **Ed25519 Signed Receipts**: Every voter receives a signed receipt. Public verification at `GET /api/v1/public/receipt-pubkey` and `POST /api/v1/public/verify-receipt`.
- **Server-Computed Nullifiers**: Nullifiers are computed server-side via `HMAC(NULLIFIER_SECRET, voterSub|pollId)` - client-supplied nullifiers are discarded.
- **Pluggable Cryptography**: Switch between HMAC-SHA256 and Poseidon BN254 (ZK-ready) via `CRYPTO_HASHER` env var.
- **Demographic Targeting**: Serve polls based on age, gender, and region.
- **k-Anonymity Analytics**: Ensures poll results never compromise voter privacy.

### 💰 Rewards

- **Automatic Distribution**: Reward participants with DTG tokens.
- **Reliable Fulfillment**: Background processing via `RewardProcessor` for stable operation.

## 🛠️ Tech Stack

- **Runtime**: Node.js v18+ with TypeScript
- **Framework**: Express.js
- **Database**: PostgreSQL 15+
- **Cache**: Redis (Rate limiting & Nonces)
- **Cryptography**: Ed25519 (receipts), HMAC-SHA256 / Poseidon BN254 (nullifiers)
- **Secrets**: HashiCorp Vault (production), `.env` fallback (development)
- **Blockchain**: Web3 integration for periodic Merkle root anchoring
- **Logging**: Pino (Structured JSON logging)
- **CI**: GitHub Actions (Integrity sweep on every push)

## 🚦 Getting Started

```bash
cd backend
npm install
npm run dev
```

## 📁 Project Structure

```
src/
├── config/       # App configuration, Vault integration, secrets
├── crypto/       # Pluggable hasher interface (HMAC, Poseidon, CryptoRegistry)
├── db/           # Client, Migrations, and Schema
├── middleware/   # Security, Rate Limiting, Error Handling
├── routes/       # API Route Definitions (incl. /public/verify-receipt)
├── services/     # Core Logic (Voting, Nullifiers, Merkle, Receipts, Anchoring)
├── scripts/      # Integrity verification scripts (audit log, Merkle sweep)
circuits/         # Circom ZK-SNARK circuits (nullifier.circom)
```

## 🏗️ Architecture: Immutable Merkle Ledger

Every vote is hashed into a SHA-256 Merkle leaf and the incremental tree root is stored in `polls.merkle_root`. Periodically, the **VoteAnchorService** commits the Merkle root to a public blockchain, creating a permanent, verifiable checkpoint of the election state. Any voter can independently verify their vote is included using `POST /api/v1/public/verify-receipt` and a Merkle inclusion proof.

## 🔍 Integrity Scripts

```bash
# Verify all poll Merkle roots + on-chain anchors + audit log
npx ts-node src/scripts/verify_vote_integrity.ts

# Verify just the audit log chain
npx ts-node src/scripts/verify_audit_log.ts

# Run full test suite
npx jest
```

---

© 2026 Mikheili Nakeuri. **Designed by Mikheili Nakeuri (Protocol).**
