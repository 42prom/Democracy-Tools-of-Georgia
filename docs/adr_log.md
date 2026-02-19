# ADR Log

## ADR-001: Mobile-First Biometrics

- **Status**: Accepted
- **Context**: We need high assurance of identity. Webcams are insecure.
- **Decision**: Voting is Mobile App ONLY. Admin is Web.
- **Consequences**: Excludes users without smartphones (Acceptable for MVP).

## ADR-002: Nullifier Construction

- **Status**: Accepted
- **Context**: Need to prevent double voting without tracking who voted.
- **Decision**: `Nullifier = Hash(PollID + DeviceSecret)`.
- **Correction/Refinement**: To prevent multi-device voting (install on phone 1, vote; install on phone 2, vote), we need an invariant.
- **Final Decision**: Server issues a `DeterministicIdentityHash` during Enrollment (blinded). `Nullifier = Hash(PollID + DeterministicIdentityHash)`.
- **Privacy implication**: The Server _can_ see that "User X voted", but _cannot_ see "User X voted for Option Y" if the vote submission is decoupled or anonymity set is large.
- **Mitigation**: The `Vote` table strictly DOES NOT contain the `UserRef` or `DeterministicIdentityHash`. It ONLY contains the `Nullifier`. The link is broken by the client calculating the Nullifier locally.

## ADR-003: k-Anonymity Threshold

- **Status**: Accepted
- **Context**: GDPR/Privacy requirements.
- **Decision**: `k=30`.
- **Rationale**: Standard statistical disclosure control baseline.

## ADR-004: No Server-Side Biometrics

- **Status**: Accepted (Hard Constraint)
- **Context**: High risk of data leak.
- **Decision**: Server sets policy, Client executes match. Server verifies Attestation.
- **Consequences**: We trust the Client Device's secure enclave and the attestation chain.

## ADR-005: Database Technology

- **Status**: Accepted
- **Decision**: PostgreSQL.
- **Rationale**: Robust, supports JSONB for flexible schema (Poll Config), strong ACID compliance for Vote Counting.
