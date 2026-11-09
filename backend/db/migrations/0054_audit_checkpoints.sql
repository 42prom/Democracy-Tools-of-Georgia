BEGIN;

CREATE TABLE IF NOT EXISTS public.audit_checkpoints (
    id bigserial PRIMARY KEY,
    audit_id bigint NOT NULL UNIQUE REFERENCES public.audit_log(id),
    audit_row_hash character(64) NOT NULL,
    previous_checkpoint_hash character(64) NOT NULL,
    checkpoint_hash character(64) NOT NULL UNIQUE,
    payload text NOT NULL,
    signature_base64 text NOT NULL,
    signing_public_key_pem text NOT NULL,
    endpoint_url text NOT NULL,
    delivery_status character varying(16) NOT NULL DEFAULT 'pending',
    delivery_attempts integer NOT NULL DEFAULT 0,
    delivered_at timestamp with time zone,
    response_hash character(64),
    last_error_hash character(64),
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT audit_checkpoint_hashes CHECK (
        audit_row_hash ~ '^[0-9a-f]{64}$' AND
        previous_checkpoint_hash ~ '^[0-9a-f]{64}$' AND
        checkpoint_hash ~ '^[0-9a-f]{64}$'
    ),
    CONSTRAINT audit_checkpoint_status CHECK (delivery_status IN ('pending', 'delivered')),
    CONSTRAINT audit_checkpoint_attempts CHECK (delivery_attempts >= 0),
    CONSTRAINT audit_checkpoint_delivery CHECK (
        (delivery_status = 'pending' AND delivered_at IS NULL) OR
        (delivery_status = 'delivered' AND delivered_at IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_audit_checkpoints_pending
    ON public.audit_checkpoints(id)
    WHERE delivery_status = 'pending';

CREATE OR REPLACE FUNCTION public.protect_audit_checkpoint()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP IN ('DELETE', 'TRUNCATE') THEN
        RAISE EXCEPTION 'audit_checkpoints is append-only';
    END IF;
    IF OLD.delivery_status = 'delivered' OR
       NEW.audit_id IS DISTINCT FROM OLD.audit_id OR
       NEW.audit_row_hash IS DISTINCT FROM OLD.audit_row_hash OR
       NEW.previous_checkpoint_hash IS DISTINCT FROM OLD.previous_checkpoint_hash OR
       NEW.checkpoint_hash IS DISTINCT FROM OLD.checkpoint_hash OR
       NEW.payload IS DISTINCT FROM OLD.payload OR
       NEW.signature_base64 IS DISTINCT FROM OLD.signature_base64 OR
       NEW.signing_public_key_pem IS DISTINCT FROM OLD.signing_public_key_pem OR
       NEW.endpoint_url IS DISTINCT FROM OLD.endpoint_url OR
       NEW.created_at IS DISTINCT FROM OLD.created_at THEN
        RAISE EXCEPTION 'audit checkpoint core fields are immutable';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS audit_checkpoint_no_mutation ON public.audit_checkpoints;
CREATE TRIGGER audit_checkpoint_no_mutation
    BEFORE UPDATE OR DELETE ON public.audit_checkpoints
    FOR EACH ROW EXECUTE FUNCTION public.protect_audit_checkpoint();

DROP TRIGGER IF EXISTS audit_checkpoint_no_truncate ON public.audit_checkpoints;
CREATE TRIGGER audit_checkpoint_no_truncate
    BEFORE TRUNCATE ON public.audit_checkpoints
    FOR EACH STATEMENT EXECUTE FUNCTION public.protect_audit_checkpoint();

COMMIT;
