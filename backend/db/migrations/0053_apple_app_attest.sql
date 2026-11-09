BEGIN;

CREATE TABLE IF NOT EXISTS public.app_attest_keys (
    key_id character varying(128) PRIMARY KEY,
    subject_hash character(64) NOT NULL,
    public_key_pem text NOT NULL,
    receipt_base64 text NOT NULL,
    environment character varying(16) NOT NULL,
    assertion_counter bigint NOT NULL DEFAULT 0,
    validation_category integer,
    bundle_version character varying(64),
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    last_asserted_at timestamp with time zone,
    CONSTRAINT app_attest_subject_hash_format CHECK (subject_hash ~ '^[0-9a-f]{64}$'),
    CONSTRAINT app_attest_environment_check CHECK (environment IN ('development', 'production')),
    CONSTRAINT app_attest_counter_check CHECK (assertion_counter >= 0),
    CONSTRAINT app_attest_validation_category_check
        CHECK (validation_category IS NULL OR validation_category BETWEEN 1 AND 10)
);

CREATE INDEX IF NOT EXISTS idx_app_attest_keys_subject
    ON public.app_attest_keys(subject_hash);

COMMIT;
