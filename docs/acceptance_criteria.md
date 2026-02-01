# DTFG Acceptance Criteria

## Module: Enrollment

- **AC-01**: Successful Enrollment
  - **Given** A user with a valid Georgian Passport and NFC-enabled phone
  - **When** They complete the NFC scan and pass Liveness
  - **Then** A `VotingCredential` is stored in the device Secure Storage
  - **And** No biometric images are sent to the server (only vector/scores)

- **AC-02**: Failed Liveness
  - **Given** A user attempting to use a photo of a face
  - **When** They perform the Liveness challenge
  - **Then** The server returns `403 Forbidden` with `reason: liveness_fail`
  - **And** A security event is logged

- **AC-03**: Chip Auth Failure
  - **Given** A modified/cloned NFC tag
  - **When** The app attempts Passive Authentication
  - **Then** Signature verification fails and enrollment aborts

- **AC-04**: Underage User
  - **Given** A user born in 2015 (Age < 18)
  - **When** They scan their passport
  - **Then** The app captures the age bucket but the enrollment is marked "Ineligible for Vote" OR buckets are strictly stored
  - **And** Server enforces Age >= 18 for general Elections

- **AC-05**: Re-Enrollment
  - **Given** A user who lost their phone
  - **When** They enroll on a new device
  - **Then** A NEW Credential is issued
  - **And** The old Credential is implicitly invalid for FUTURE votes (Nullifiers are unique per ballot, but different credentialSecret implies new nullifier? **Review Constraint 5**: If CredentialSecret changes, Nullifier changes. _Mitigation_: We must bind Nullifier to `Hash(PersonalID + Salt)` OR User must revoke old credential. **Correction**: For MVP, if CredentialSecret changes, they can vote again IF we don't track PersonalID global usage.
  - **Refinement**: `Nullifier` MUST depend on something invariant if we want to prevent multi-device voting.
  - **DECISION**: `Nullifier = Hash(PersonalID_Hash_From_Server + PollID)`. But Server must not know PersonalId_Hash maps to User.
  - **MVP Approach**: Server tracks `Hash(PersonalID)` in a `UsedIdentity` table for the Poll to prevent re-enrollment abuse, BUT this table is NOT linked to the specific Vote.
  - **AC Update**: When enrolling, if `Hash(PersonalID)` exists, revoke old keys or merge.

## Module: Voting

- **AC-06**: Double Vote Prevention
  - **Given** A user who has already submitted a vote for Poll A
  - **When** They try to vote again via API
  - **Then** Server returns `409 Conflict` (Nullifier used)

- **AC-07**: Replay Attack
  - **Given** A monitored network traffic packet of a valid vote
  - **When** Attacker replays the payload 2 minutes later
  - **Then** Server returns `401 Unauthorized` (Nonce expired/used)

- **AC-08**: Eligibility Check
  - **Given** A Poll for "Batumi Residents"
  - **When** A user with "Tbilisi" in their credential votes
  - **Then** Server rejects with `403 Forbidden` (Eligibility mismatch)

## Module: Admin & Privacy

- **AC-09**: Small Cohort Safety
  - **Given** A Poll with only 5 votes from "Kutaisi"
  - **When** Admin views results filtered by "Kutaisi"
  - **Then** The UI shows "Insufficient Data (Privacy Protected)"
  - **And** The API returns `null` or masked value

- **AC-10**: Publish Safety
  - **Given** A drafted Poll targeting "Age 100-110" (Very small group)
  - **When** Admin tries to Publish
  - **Then** The system shows a "High Risk / Too Small Audience" error
  - **And** Prevents publication
