# Democratic Tools for Georgia (DTFG) - System Specification

## 1. Assumptions

- **Mobile Device Penetration**: Target users typically possess smartphones with NFC capabilities (for passport reading) and cameras (for liveness).
- **Passport Standards**: Georgian ID cards and Passports comply with ICAO 9303 standards for NFC chip readout.
- **Connectivity**: Voting requires an active internet connection; offline voting is out of scope for MVP.
- **Legal Framework**: The generated analytics and identity verification levels comply with Georgian Data Protection laws.
- **Trust Model**: The "Admin" is trusted to manage polls but NOT trusted with user identity data (Partial Trust). The "Server" is semi-trusted but constrained by cryptographic commitments (Attestations, Nullifiers).

## 2. Non-negotiable Invariants (Hard Constraints)

1.  **Strict Privacy**: Never store passport images, chip portrait images, or selfie videos/frames on the server.
2.  **Server Storage Minimization**: Store only verification results (Pass/Fail + Metadata), signed attestations, and anonymized logs.
3.  **Ephemeral Evidence**: Any evidence retention (debugging only) must be OPTIONAL, user-consented, encrypted, <24h TTL, and effectively inaccessible to admins.
4.  **Strict Verification**: Every vote requires a fresh session: NFC + 3D Liveness + Face Match.
5.  **Double-Vote Prevention**: `Nullifier = Hash(ballotId + credentialSecret)`. `credentialSecret` NEVER leaves the device.
6.  **Anti-Replay**: Vote requests must include a single-use Server Nonce (short TTL) and a signed Attestation bound to `ballotId` + `pollId` + `nonce` + `votePayloadHash` + `timestamp`.
7.  **Admin Blindness**: Admins MUST NOT see per-person lists, recent logins by name, or de-anonymized user records.
8.  **k-Anonymity**: Enforced at Publish (Audience < k warning) AND Query time (Cohort count < k suppressed). Default k=30.
9.  **Inference Defense**: Query suppression, min time windows, rate limits, result batching. No overlapping cohort subtraction.
10. **UX Standards**: No footer in Auth flows. Success = Wallet/Voting/Settings footer.

## 3. Naming Map

| Term                    | Schema / Key     | Version | Description                                                |
| :---------------------- | :--------------- | :------ | :--------------------------------------------------------- |
| **API Base URL**        | `/api/v1`        | v1      | Root for all REST endpoints                                |
| **Voting Credential**   | `dtfg.vc.v1`     | v1      | Device-bound credential with buckets (age, gender, region) |
| **Session Attestation** | `dtfg.att.v1`    | v1      | Proof of liveness/auth for a specific action               |
| **Database Schema**     | `dtfg.schema.v1` | v1      | Database versioning tag                                    |
| **Poll ID**             | `poll_{uuid}`    | -       | Unique identifier for polls                                |
| **Ballot ID**           | `ballot_{uuid}`  | -       | Unique identifier for a specific ballot within a poll      |
| **Nullifier**           | `null_{hash}`    | -       | Deterministic hash to prevent double voting                |
| **Region ID**           | `reg_{code}`     | -       | Standardized region codes                                  |

## 4. Conflicts & Resolutions

- **Conflict**: User Convenience vs. Vote Integrity.
  - _Resolution_: Integrity wins. Every vote requires full re-verification (NFC + Liveness). Relaxing this would compromise the "One Person One Vote" guarantee.
- **Conflict**: Rich Analytics vs. Privacy.
  - _Resolution_: Privacy wins. Analytics are strictly aggregated. Cohorts smaller than `k=30` are strictly suppressed.
- **Conflict**: Prevention of Vote Selling vs. Remote Voting.
  - _Resolution_: Remote voting is allowed, but the UX emphasizes secrecy. Tech-wise, we cannot physically prevent coercion in a remote setting, but we prevent _systematic_ vote selling via `credentialSecret` isolation (cannot sell key without giving away phone).

## 5. System Architecture

### High-Level Components

1.  **Mobile App (iOS/Android)**:
    - Handles NFC ICAO 9303 reading.
    - Performs On-Device Face Matching (Probe vs. Chip Image).
    - Executes Liveness Challenge (Active/Passive).
    - Holds `credentialSecret` in Secure Enclave / Keystore.
    - Manages 4337 Smart Wallet.
2.  **API Gateway / Backend (Node.js/Go)**:
    - Restricted API surface.
    - Validates Zero-Knowledge proofs (if Phase 2) or Signed Attestations (MVP).
    - Manages Nonces (Redis).
    - Enforces Rate Limits & WAF.
3.  **Identity Service (Stateless)**:
    - Issues partial credentials based on verification results.
    - Does NOT store biometric data.
4.  **Voting Service**:
    - Manages Polls, Ballots, and Tallying.
    - Enforces K-Anonymity on results.
    - Verifies Nullifiers.
5.  **Smart Contract Layer (Polygon/Base)**:
    - ERC-4337 Account Factory.
    - Paymaster (Gas sponsorship).
    - Rewards Distributor.
    - Audit Log Anchor (Merkle roots of votes per hour).
6.  **Admin Panel (Web)**:
    - Poll Management.
    - Aggregated Analytics Dashboard.
    - System Health Monitoring.

### Trust Boundaries

- **Device <-> Server**: Untrusted channel. Protected by TLS + App Attestation + request signing.
- **Server <-> Database**: Trusted.
- **Server <-> Blockchain**: Trusted for submission, public for verification.
- **Admin <-> Server**: Semi-trusted. Authentication required (MFA). ACLs enforce "No PII access".

## 6. Threat Model & Mitigations

| Threat Category            | Specific Threat                       | Mitigation                                                                                                                          |
| :------------------------- | :------------------------------------ | :---------------------------------------------------------------------------------------------------------------------------------- |
| **Spoofing**               | Deepfake Injection                    | 3D Liveness (Randomized prompts: "Look Left", "Smile"), texture analysis.                                                           |
| **Spoofing**               | Presentation Attack (Masks/Screens)   | Active liveness + depth checks (if avail) or multi-frame analysis.                                                                  |
| **Spoofing**               | Replay of valid biometrics            | Server-side Nonce (single use) + Timestamp window + Request Binding.                                                                |
| **Tampering**              | Database Manipulation                 | Merkle Tree anchoring of vote batches on-chain. Immutable audit logs.                                                               |
| **Repudiation**            | "I didn't vote"                       | Signed attestation logged (non-repudiation of origin).                                                                              |
| **Information Disclosure** | Admin spies on user votes             | `Nullifier` disconnects identity from vote. DB separation can be used (Vote DB vs User DB). Admin UI blocked from row-level access. |
| **Information Disclosure** | Inference Attack (Cohort Subtraction) | Rate limiting queries. Forbid overlapping queries that allow inferring $A = (A \cup B) - B$ if $B$ is small.                        |
| **Denial of Service**      | Wallet Drain                          | Paymaster whitelist (only valid votes get gas). Daily caps per user.                                                                |
| **Elevation of Privilege** | Admin modifies active poll            | Polls are immutable once "Published". Content hashing.                                                                              |

## 7. Workflows

### 7.1. Enrollment (First Access)

1.  **User**: Opens App -> "Verify Identity".
2.  **App**: Generates ephemeral key pair.
3.  **App**: Scans ID Card (NFC) -> Extracts `DesignatedData` (Portrait, Name, DOB, etc).
4.  **App**: request `challenge_nonce` from Server.
5.  **App**: Performs Liveness check (Video capture).
6.  **App**: Computes `MatchScore(LiveFace, ChipPortrait)`.
7.  **App**: Sends `Signed({nonce, MatchScore, LivenessData, UserDemographics, DevicePubKey})` to Server. **No Images sent.**
8.  **Server**: Verifies signature, Nonce, Liveness metadata, Risk Engine checks.
9.  **Server**: If Pass -> Issues `VotingCredential` (JWT/SD-JWT) containing `{issuerSig, ageBucket, gender, region, devicePubKey}`.
10. **App**: Stores Credential securely. Generates `credentialSecret`.

### 7.2. Vote Session (Strict Re-verification)

1.  **User**: Selects Poll -> "Vote".
2.  **App**: Request `vote_nonce` from Server (TTL 60s).
3.  **App**: Prompts NFC Scan (Proof of possession) + Quick Liveness (Proof of presence).
4.  **App**: Generates `nullifier = Hash(ballotId + credentialSecret)`.
5.  **App**: Signs Vote Payload: `Sig_DeviceKey({ pollId, optionId, nullifier, vote_nonce, timestamp })`.
6.  **App**: POST `/api/v1/vote` with Payload + `VotingCredential`.
7.  **Server**:
    - Checks `Valid(VotingCredential)`.
    - Checks `Valid(vote_nonce)` and consumes it.
    - Checks `Used(nullifier)` -> Reject if exists.
    - Checks `Eligibility(Poll, Credential.buckets)`.
8.  **Server**: Records Vote.
9.  **Server**: Trigger Blockchain Reward (Async).

### 7.3. Poll Creation & Publish

1.  **Admin**: "Create Poll". Defines Title, Options.
2.  **Admin**: Selects Audience (e.g., "Tbilisi + Batumi", Age 18-25).
3.  **Server**: Calculates `EstimatedAudience`.
4.  **Server**: Checks `If EstimatedAudience < 30`.
    - If True: Show "Privacy Warning" and Block Publish (or require override with strict logging).
5.  **Admin**: "Publish".
6.  **Server**: Freezes Poll Definition. Opens Voting Window.

## 8. Data Model

`dtfg.schema.v1`

### 8.1. Database Schema (Conceptual)

- **users_metadata**: `user_ref (uuid)`, `created_at`, `risk_score` (No PII).
- **regions**: `id`, `name`, `type`, `parent_id`.
- **polls**: `id`, `title`, `config_json`, `status`, `start_time`, `end_time`, `audience_rules_json`.
- **poll_options**: `id`, `poll_id`, `text`.
- **votes**: `id`, `poll_id`, `nullifier_hash` (UNIQUE), `option_id`, `created_at` (Truncated to hour for privacy?), `credential_snapshot` (buckets only).
- **vote_attestations**: `id`, `vote_id`, `attestation_sig`, `device_key_hash`.
- **security_events**: `id`, `event_type`, `status`, `reason`, `metadata_json` (liveness scores), `ip_hash`.

### 8.2. JSON Examples

**Voting Credential Payload**:

```json
{
  "iss": "dtfg-identity-service",
  "sub": "device_key_thumbprint",
  "data": {
    "age_bucket": "18-25",
    "gender": "F",
    "region_codes": ["reg_tbilisi", "reg_vake"],
    "citizenship": "GEO"
  },
  "exp": 1735689600
}
```

## 9. API Specification

Base: `/api/v1`

| Method | Path                    | Description         | Request                                                                 | Response                                        |
| :----- | :---------------------- | :------------------ | :---------------------------------------------------------------------- | :---------------------------------------------- |
| POST   | `/auth/challenge`       | Get Auth Nonce      | `{ "deviceId": "..." }`                                                 | `{ "nonce": "xyz", "ttl": 60 }`                 |
| POST   | `/auth/enroll`          | Submit Enrollment   | `{ "proof": "...", "demographics": {...} }`                             | `{ "credential": "eyJ..." }`                    |
| GET    | `/polls`                | List Eligible Polls | `Header: Bearer Credential`                                             | `{ "polls": [...] }`                            |
| POST   | `/polls/{id}/vote`      | Submit Vote         | `{ "nonce": "...", "nullifier": "...", "option": "...", "sig": "..." }` | `{ "txHash": "0x...", "receipt": "..." }`       |
| POST   | `/admin/polls/estimate` | Check Audience Size | `{ "rules": {...} }`                                                    | `{ "count": 1500, "safe": true }`               |
| GET    | `/stats/polls/{id}`     | Get Results         | `?groupBy=region`                                                       | `{ "options": {"A": 50}, "suppressed": false }` |

## 10. Smart Contract Plan

- **Wallet**: `SimpleAccount` (ERC-4337) or Modular Account (ERC-7579).
  - Owner: User's Device Key.
- **Paymaster**: Verifying Paymaster.
  - Signer: DTFG Backend.
  - Rule: Valid signature from Backend required to sponsor gas. Backend only signs if Vote is valid.
- **Rewards**:
  - Simple `ERC20` or `MerkleDistributor` if batching.
  - For MVP: Direct mint/transfer to User's computed address upon vote success.

## 11. UI Specification

### 11.1. Mobile Structure

- **Footer** (Only after Enroll): [ Wallet (icon) ] [ **Voting** (active) ] [ Settings (gear) ]
- **Colors**: Dark Mode default. Facebook Blue (#1877F2) accents.
- **States**:
  - _Loading_: Shimmer skeletons.
  - _Error_: Toast message (Top) + Haptic Feedback.
  - _Empty_: "No polls available right now."

### 11.2. Admin Pages

- **Create Poll**:
  - Title Input.
  - "Add Option" button (dynamic list).
  - Audience Selector:
    - Age: [ ] All | [18] - [99]
    - Gender: [Men] [Women] [All]
    - Regions: Searchable Dropdown. Chips for selected.
  - "Privacy Safe" Badge (Green Check / Red Warning).
  - "Publish" Button (Disabled if unsafe or invalid).

## 12. Functional Logic Rules

1.  **Poll_Status_Machine**: `Draft` -> `Scheduled` -> `Active` -> `Ended` -> `Archived`.
    - Strict transitions. Cannot edit `Active` polls.
2.  **Vote_Acceptance**:
    - IF `Poll.state != Active` REJECT.
    - IF `Nullifier` exists REJECT.
    - IF `Nonce` expired REJECT.
    - IF `Signature` invalid REJECT.
3.  **Audience_Safety**:
    - `Count(Audience)` must be `>= k`. Else `is_safe = false`.

## 13. Risk Register

| Risk                          | Severity | Mitigation                                                           |
| :---------------------------- | :------- | :------------------------------------------------------------------- |
| **Admin extracts User Data**  | High     | System design stores NO PII. Admin UI has no list views.             |
| **Phone Theft / Forced Vote** | Medium   | `credentialSecret` requires biometric unlock (local auth) to engage. |
| **Device Rooting**            | Medium   | App Attestation / Play Integrity API checks on Enrollment and Vote.  |
| **Inference through Queries** | High     | Rate limits. Subtracting cohorts blocked by query analyzer.          |

## 14. MVP Roadmap

### Phase 0: Foundation

- Core API & DB.
- Mock ID Verification (Dev Mode).
- Admin Panel Layout.

### Phase 1: Identity & Integrity (MVP Target)

- Real NFC + Liveness integration.
- Credential Issuance.
- Voting Logic + Nullifiers.
- Basic Admin Analytics (Count ONLY).
- **Postponed**: Blockchain Rewards (Server-side tally only first), complex ZK proofs.

### Phase 2: Decentralization & Governance

- ERC-4337 Integration.
- On-chain Anchoring.
- Advanced query privacy (Differential Privacy noise).

## 15. Non-Functional Requirements

- **Performance**: Vote submission < 2s.
- **Scalability**: Support 100k concurrent voters (Queue system for writing to DB).
- **Auditability**: All admin actions logged to immutable `audit_log`.
- **Retention**: Zero retention of failed biometric attempts > 24h.

## 16. Self-Audit Checklist

- [ ] Invariant 1: No PII stored? Check.
- [ ] Invariant 2: Session Nonce used? Check.
- [ ] Invariant 3: Nullifiers implemented? Check.
- [ ] Invariant 4: k-Anonymity (k=30)? Check.
- [ ] Invariant 5: Inference protections? Check.
- [ ] Invariant 6: No Admin ID views? Check.
- [ ] Invariant 7: Wallet abuse controls? Check.

## 17. Acceptance Criteria

- **Enrollment**: Given a valid ID + Face, When I enroll, Then I receive a credential.
- **Voting**: Given I have voted, When I try again, Then the server rejects with "Already Voted".
- **Privacy**: Given a cohort of 5 people, When Admin queries stats, Then return "Suppressed".

## 18. ADR Decision Log Summary

- **ADR-001**: **Use NFC + Liveness for every vote.** _Why_: Max integrity. _Tradeoff_: High friction.
- **ADR-002**: **Server-side Aggregation (Phase 1).** _Why_: ZK client-side tally is too complex for MVP timeline. _Tradeoff_: Trust in server code (mitigated by partial trust arch).
- **ADR-003**: **Nullifiers via Device Secret.** _Why_: Preventing double votes without tracking identity.
