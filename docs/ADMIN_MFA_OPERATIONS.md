# Admin MFA operations

Every production administrator must use an individual account with TOTP MFA.
Shared accounts and delivery of the TOTP seed through tickets, chat, email, or
application logs are prohibited.

## Provision or rotate

Run from an authorized maintenance session with the application database role
and the Vault-supplied encryption secret:

```bash
cd backend
npm run admin:mfa:provision -- admin@example.ge
```

The command replaces the encrypted seed and revokes every active session for
that administrator. Transfer the one-time secret/URI through an approved
out-of-band secret channel and close the terminal transcript. The first valid
password plus TOTP login marks enrollment complete.

## Verify without exposing the seed

```bash
cd backend
npm run admin:mfa:status -- admin@example.ge
```

Release evidence must show `provisioned=true`, `enabled=true`, a non-null
`enrolled_at`, and only the expected active sessions. The command never decrypts
or prints the seed.

For loss, suspected disclosure, staff departure, or authenticator replacement,
rerun provisioning, verify enrollment, and review the immutable admin audit log.
Do not disable `ADMIN_MFA_REQUIRED` as a recovery mechanism.
