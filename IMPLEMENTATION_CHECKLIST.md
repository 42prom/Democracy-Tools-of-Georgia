# DTFG Implementation Checklist

## Phase 0: Foundation

- [ ] **Infrastructure**
  - [ ] `npm init` / `go mod init`.
  - [ ] Docker Compose for Postgres + Redis.
  - [ ] DB Migrations Setup (`db/migrations/001_init.sql`).
- [ ] **API Shell**
  - [ ] GET /health.
  - [ ] Error Handling Middleware (Security safe headers).
  - [ ] Logging Service (structured JSON).

## Phase 1: Core Logic

- [ ] **Identity Module**
  - [ ] Mobile: NFC Reader (Passport).
  - [ ] Mobile: Camera Liveness UI.
  - [ ] Server: `POST /auth/verify` mock implementation.
  - [ ] Server: `POST /auth/verify` REAL implementation using Risk Engine.
- [ ] **Voting Module**
  - [ ] DB: `polls`, `votes`, `nullifiers` tables.
  - [ ] Server: `POST /polls/{id}/vote` endpoint.
  - [ ] Logic: Check `Hash(nullifier)` uniqueness.
  - [ ] Logic: Verify Session Nonce.
- [ ] **Admin Module**
  - [ ] UI: Create Poll Wizard.
  - [ ] UI: Audience Estimator (checking `k >= 30`).
  - [ ] UI: Results Dashboard (Aggregated).

## Phase 2: Blockchain

- [ ] Smart Contracts: Write `AccountFactory.sol`.
- [ ] Smart Contracts: Write `Paymaster.sol`.
- [ ] Backend: Ethers.js / Viem integration.
- [ ] Worker: Anchoring Service (Batch -> Merkle Root -> Chain).

## Release Gates

- [ ] **Privacy**: Verify NO PII in DB.
- [ ] **Security**: Verify Anti-Replay (reuse nonce -> 400 Error).
- [ ] **Legal**: Verify Consent UI in Enrollment.
