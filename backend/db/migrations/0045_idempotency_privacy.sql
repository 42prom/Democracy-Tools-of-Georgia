-- Idempotency state is an ephemeral delivery control, never a ballot ledger.
-- Purge legacy rows because `params` previously stored raw vote/survey bodies
-- beside user_id, which could link an identity to a choice or response.
DELETE FROM public.idempotency_keys;

ALTER TABLE public.idempotency_keys
    ALTER COLUMN params SET NOT NULL;

ALTER TABLE public.idempotency_keys
    DROP CONSTRAINT IF EXISTS idempotency_keys_fingerprint_only;

ALTER TABLE public.idempotency_keys
    ADD CONSTRAINT idempotency_keys_fingerprint_only CHECK (
        jsonb_typeof(params) = 'object'
        AND params ? 'requestFingerprint'
        AND (params - 'requestFingerprint') = '{}'::jsonb
        AND jsonb_typeof(params -> 'requestFingerprint') = 'string'
        AND (params ->> 'requestFingerprint') ~ '^[a-f0-9]{64}$'
    );

COMMENT ON COLUMN public.idempotency_keys.params IS
    'Server-keyed HMAC request fingerprint only; raw request bodies are forbidden.';
