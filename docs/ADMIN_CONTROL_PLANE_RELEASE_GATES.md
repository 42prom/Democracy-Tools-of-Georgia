# Admin control plane release gates

This document separates locally verified controls from deployment controls that
cannot be proven by source code or a developer Compose stack.

## Locally verified

- Default-deny admin RBAC with CSRF protection on unsafe methods.
- Opaque, hashed, revocable admin sessions with idle and absolute expiry.
- Login lockout, TOTP MFA support, and five-minute step-up authentication for
  destructive or security-sensitive actions.
- Admin account lifecycle controls, including last-superadmin and self-lockout
  safeguards.
- Append-only, hash-chained audit records and a paginated verification endpoint.
- Strict poll validation and database-enforced lifecycle immutability.
- Restricted application-role template for staging/production database access.
- Migration ledger checksums and fail-closed drift detection.
- SSRF controls and production allowlists for outbound blockchain RPC traffic.
- Authenticated encryption for secrets stored in the database.
- Automated backend, admin, Flutter, Android, iOS-simulator, and container gates
  in CI.
- Isolated PostgreSQL dump/restore drill with automatic cleanup.

## Required before production traffic

- Provision TOTP for every administrator; keep `ADMIN_MFA_REQUIRED=true`.
- Store database, signing, encryption, and TOTP-encryption keys in an external
  KMS/Vault; rotate all development credentials.
- Terminate TLS at a hardened ingress, configure an exact production CORS
  origin, add WAF/rate-limit policy, and enforce outbound network allowlists.
- Use a non-owner application database role. Run migrations with the separate
  owner role, then revoke it from the application runtime.
- Enable continuous WAL archiving to a separate, immutable/object-locked account
  and demonstrate the documented RPO/RTO with a production-like restore drill.
- Export signed audit checkpoints to an independent WORM/SIEM destination and
  alert on missing checkpoints or chain verification failures.
- Run external threat modeling and an independent penetration test; close all
  high/critical findings before release.
- Complete Android device regression and the iOS/App Attest gates in
  `MOBILE_RELEASE_GATES.md`, including real-device testing and store signing.

## Commands

Full release gate:

```bash
./scripts/release-gate.sh
```

Admin/backend-only gate while the mobile phase is intentionally deferred:

```bash
SKIP_MOBILE=1 ./scripts/release-gate.sh
```

Database recovery drill on the isolated Antygravity Compose project:

```powershell
.\scripts\verify-backup-restore.ps1
```

Passing local gates is necessary but is not a claim of “military-grade” or
absolute security. Production assurance also depends on the infrastructure,
operations, keys, devices, and independent review listed above.
