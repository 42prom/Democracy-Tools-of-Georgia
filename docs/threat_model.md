# DTFG Threat Model

## Methodology: STRIDE + Module Analysis

### 1. Identity & Enrollment

- **Spoofing**: Attacker uses a 3D mask or video of a victim to bypass facial recognition.
  - _Mitigation_: SDK uses "Active Liveness" (randomized instructions) + "Passive Liveness" (texture/depth analysis). Server cross-references Face vs Chip Image (high trust source).
- **Tampering**: Attacker modifies the NFC chip read data.
  - _Mitigation_: Passive Auth (SOD signature verification) validates chip data integrity signed by Issuing State.
- **Repudiation**: User claims "I never enrolled".
  - _Mitigation_: Server logs the cryptographically signed request from the device (Device Attestation).

### 2. Voting Session

- **Spoofing**: Attacker replays a captured valid vote packet.
  - _Mitigation_: Strict Anti-Replay.
    - Server Nonce (TTL 60s, Single Use).
    - Vote Payload includes `nonce`.
    - DB Constraint: `UNIQUE(nonce)`.
- **Information Disclosure**: Admin queries database to see who voted for whom.
  - _Mitigation_:
    - `Nullifier` separates Identity from Vote.
    - `votes` table has NO user reference.
    - `vote_attestations` (security log) is separated from `votes`.
    - Admin UI does not support raw SQL or list views.
- **Tampering**: Admin modifies vote results in DB.
  - _Mitigation_:
    - Phase 1: Database Audit Logs (immutable append-only).
    - Phase 2: Blockchain Anchoring (Periodic Merkle Root of votes committed to Ethereum). Use merkle proof to verify inclusion.

### 3. Analytics & Queries

- **Information Disclosure (Inference)**: Attacker runs two queries: Audience($A$) and Audience($A + \{Target\}$) to infer Target's vote.
  - _Mitigation_:
    - **Query Suppression**: Reject result if Count < k (30).
    - **Batching**: Update stats only every N minutes.
    - **Subtract-Blocker**: Analytic engine analyzer blocks overlapping cohort subtractions.

### 4. Admin Abuse

- **Elevation of Privilege**: Admin changes a "Published" poll to rig options.
  - _Mitigation_: State Machine enforces `Published` polls are Immutable. Any change requires "Cancel" + "New Poll".

### 5. Wallet & Economic Hub

- **Denial of Service**: Attacker spams transactions to drain Paymaster gas.
  - _Mitigation_:
    - Paymaster only signs transactions with a valid `vote_proof`.
    - Rate Limit: 1 transaction per voter per poll (or day).
- **Spoofing**: Attacker tries to claim rewards for others.
  - _Mitigation_: Reward claim address must be derived from the `credentialSecret` owner (Device Key).

## Critical Assets

1.  **Passport Images**: NEVER stored. (Highest Risk if violated).
2.  **Credential Secret**: Stored in Device Secure Enclave.
3.  **Vote Database**: Integrity is paramount.
4.  **Admin Credentials**: Protected by MFA.
