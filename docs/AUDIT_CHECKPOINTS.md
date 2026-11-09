# External audit checkpoints

The database audit log is append-only for the application role and protected by
a SHA-256 chain. A database owner could still replace the entire chain, so a
production deployment must periodically export its head to an independently
administered immutable/WORM system.

The checkpoint worker signs a canonical payload with a dedicated Ed25519 key,
links it to the previous checkpoint, and sends it only to the exact HTTPS host
in `AUDIT_CHECKPOINT_ALLOWED_HOSTS`. Requests use the checkpoint hash as an
idempotency key. The receiver must persist the body, receipt time, and
idempotency key under object lock or equivalent write-once retention.

Required receiver behavior:

- accept `POST` JSON and authenticate the bearer credential;
- return 2xx after durable write, or 409 when that idempotency key already
  exists with identical content;
- reject a reused key with different content;
- independently verify the Ed25519 signature and SHA-256 checkpoint hash;
- enforce retention in a separate account/security boundary;
- deny delete/retention changes to the application and database operators.

The local `audit_checkpoints` table records delivery evidence but is not itself
the WORM boundary. Release remains blocked until a real endpoint has returned a
durable receipt and an independent operator has verified restore/read access.
