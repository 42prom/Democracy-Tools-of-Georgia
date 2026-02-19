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
  - **Internal Linkage**: SHA256 Hash Chain per poll (PostgreSQL).
  - **Blockchain Anchoring**: Scheduled anchoring of chain hashes to a public blockchain for third-party auditability.
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
- **Blockchain**: Web3 integration for periodic anchoring
- **Logging**: Pino (Structured JSON logging)

## 🚦 Getting Started

```bash
cd backend
npm install
npm run dev
```

## 📁 Project Structure

```
src/
├── api/          # OpenAPI Definitions & Controllers
├── config/       # Environment & App Configuration
├── db/           # Client, Migrations, and Schema
├── middleware/   # Security, Rate Limiting, Error Handling
├── routes/       # API Route Definitions
├── services/     # Core Logic (Voting, Verification, Anchoring)
└── scripts/      # Utility & Maintenance Scripts
```

## 🏗️ Architecture: Immutable Ledger

Every vote is cryptographically linked to the previous one in the `votes` table using a `chain_hash`. Periodically, the **VoteAnchorService** commits the latest `chain_hash` to a public blockchain, creating a permanent, verifiable checkpoint of the election state.

---

© 2026 Mikheili Nakeuri. **Designed by Mikheili Nakeuri (Protocol).**
