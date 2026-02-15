# DTG Roadmap: MVP to Production

## Phase 0: Foundation (Weeks 1-4)

**Goal**: Core Infrastructure, API skeleton, Database, and Admin UI Shell.

### Objectives

- [ ] Set up Monorepo (Mobile, Backend, Admin).
- [ ] Implement Database Schema (Postgres) with strict access controls.
- [ ] Build "Mock" Enrollment API (for testing without physical cards).
- [ ] Deploy Admin Panel skeletal UI (no real data).
- [ ] Implement basic Auth middleware (protecting Admin routes).

### Scope

- **In Scope**: DB migrations, API v1 shell, Logging system, Test suite setup.
- **Postponed**: Real NFC reading, Liveness integration, Blockchain interactions.

### Definition of Done

- CI/CD pipeline running.
- Database reachable and securely configured.
- Admin can login (simulated).

---

## Phase 1: Identity & Integrity - MVP (Weeks 5-12)

**Goal**: Functional Voting System with actual ID Verification & Analytics.

### Objectives

- [ ] Integrate Mobile SDKs for NFC (ICAO 9303) & Liveness.
- [ ] Implement Credential Issuance logic (Server + HSM logging).
- [ ] Build Vote Submission pipeline (Nonce + Nullifier + Signature).
- [ ] Complete Admin Poll Management (Create, Publish, close).
- [ ] Implement Aggregated Analytics with k-anonymity enforcement.

### Scope

- **In Scope**: Full end-to-end voting flow (Enroll -> Vote). Privacy checks.
- **Postponed**: Ethereum L2 integration (Gasless wallet), ZK-Snarks (using server-side verification for now).

### QA Gates

- [ ] Security Audit of Crypto implementation.
- [ ] Penetration testing of API.
- [ ] Load testing (10k concurrent votes).

---

## Phase 2: Decentralization & Production (Weeks 13-20+)

**Goal**: Uncensorable Audit & Economic Hub.

### Objectives

- [ ] Deploy ERC-4337 System (Factory, Paymaster).
- [ ] Implement Blockchain Anchoring (Merkle Root of votes to chain).
- [ ] Enable Reward distribution (Token claims).
- [ ] Advanced Differential Privacy filters for Analytics.

### Scope

- **In Scope**: Smart Contracts, Paymaster Rules, Integrity Proofs.

### Definition of Done

- Full system production release.
- External Security Audit passed.

