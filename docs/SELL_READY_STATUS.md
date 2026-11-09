# Sell-ready status

Last local verification: 2026-09-04

## Current completion estimate

- Admin control plane and database hardening: **97%**.
- Whole product, including mobile and production operations: **86%**.

Percentages are delivery estimates, not security guarantees. No software can be
proved absolutely secure by local tests alone.

## Evidence collected

- Backend: 18 suites and 134 tests passed; lint and TypeScript build passed.
- Admin: 5 files and 66 tests passed; production Docker build passed.
- Database migration ledger: 48 applied entries, checksums present, no pending
  migration, and drift detection enabled.
- Restore drill: 48 migrations, 1 admin, 36 polls, and 30 audit rows restored
  into an isolated temporary database; the temporary database and dump were
  removed after verification.
- Docker: admin, backend, PostgreSQL, Redis, Shield, and biometric services are
  healthy on Antygravity's existing loopback-bound ports.
- Admin API smoke: login `200`, session check `200`, audit verification `200`
  with a valid chain, protected delete before step-up `428`, step-up `200`,
  protected request after step-up reached the route and returned `404` for the
  deliberately nonexistent target, and logout `204`.
- Admin HTTP hardening: CSP, clickjacking protection, and one-year HSTS are
  present in the rebuilt image. HSTS is enforced by browsers only over HTTPS.
- Backend dependency installation reported zero vulnerabilities. The admin
  advisory request was attempted from both the host and an isolated container,
  but the npm advisory endpoint timed out; the mandatory CI audit remains open
  until the registry returns a definitive result.
- Repository-local cybersecurity skills are under `.local/`, which is ignored
  by Git.

## Remaining release work

1. Complete the admin npm advisory gate when the registry is reachable.
2. Provision and verify TOTP for every real administrator.
3. Deploy with separate migration-owner and restricted runtime database roles.
4. Move all production secrets and signing keys to KMS/Vault, rotate development
   credentials, and document dual-control key recovery.
5. Configure the real TLS ingress, WAF/rate limits, outbound egress allowlists,
   monitoring, alerting, and an independent WORM/SIEM audit checkpoint.
6. Enable off-host continuous WAL/PITR backups and pass a production-like RPO/RTO
   recovery exercise.
7. Obtain an independent penetration test and close every high/critical issue.
8. Finish the deferred mobile phase: final Android device regression, iOS
   simulator parity, real-device App Attest, store signing, accessibility, and
   release acceptance.
9. Complete legal/privacy/election-process review for the intended jurisdictions.

The implementation details and deployment-only controls are tracked in
`ADMIN_CONTROL_PLANE_RELEASE_GATES.md`, `DATABASE_RECOVERY.md`, and
`MOBILE_RELEASE_GATES.md`.
