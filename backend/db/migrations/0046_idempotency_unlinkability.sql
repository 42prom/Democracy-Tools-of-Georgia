-- Delivery retries must never become an identity-to-ballot or identity-to-receipt ledger.
DELETE FROM public.idempotency_keys;

ALTER TABLE public.idempotency_keys
    DROP CONSTRAINT IF EXISTS idempotency_keys_anonymous;

ALTER TABLE public.idempotency_keys
    ADD CONSTRAINT idempotency_keys_anonymous CHECK (user_id IS NULL);

ALTER TABLE public.idempotency_keys
    DROP CONSTRAINT IF EXISTS idempotency_keys_replay_metadata_only;

ALTER TABLE public.idempotency_keys
    ADD CONSTRAINT idempotency_keys_replay_metadata_only CHECK (
        response_body IS NULL
        OR response_body = '{"success": true, "duplicate": true}'::jsonb
        OR response_body = '{"error": "Previous request with this Idempotency-Key failed", "duplicate": true}'::jsonb
    );

COMMENT ON COLUMN public.idempotency_keys.user_id IS
    'Always NULL for ballot unlinkability; user scope exists only inside the server-keyed HMAC key.';

COMMENT ON COLUMN public.idempotency_keys.response_body IS
    'Generic replay metadata only; receipts, ballot choices, and survey answers are forbidden.';
