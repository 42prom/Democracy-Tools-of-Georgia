BEGIN;

ALTER TABLE public.admin_users
    ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS failed_login_attempts integer NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS locked_until timestamp with time zone,
    ADD COLUMN IF NOT EXISTS password_changed_at timestamp with time zone NOT NULL DEFAULT now();

ALTER TABLE public.admin_users
    DROP CONSTRAINT IF EXISTS admin_users_failed_login_attempts_check;

ALTER TABLE public.admin_users
    ADD CONSTRAINT admin_users_failed_login_attempts_check
    CHECK (failed_login_attempts >= 0 AND failed_login_attempts <= 1000);

CREATE TABLE IF NOT EXISTS public.admin_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    admin_user_id uuid NOT NULL REFERENCES public.admin_users(id) ON DELETE CASCADE,
    token_hash character(64) NOT NULL UNIQUE,
    csrf_token_hash character(64) NOT NULL,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    last_seen_at timestamp with time zone NOT NULL DEFAULT now(),
    idle_expires_at timestamp with time zone NOT NULL,
    absolute_expires_at timestamp with time zone NOT NULL,
    revoked_at timestamp with time zone,
    ip_address inet,
    user_agent character varying(512),
    CONSTRAINT admin_sessions_expiry_order_check
        CHECK (idle_expires_at <= absolute_expires_at),
    CONSTRAINT admin_sessions_token_hash_format_check
        CHECK (token_hash ~ '^[0-9a-f]{64}$'),
    CONSTRAINT admin_sessions_csrf_hash_format_check
        CHECK (csrf_token_hash ~ '^[0-9a-f]{64}$')
);

CREATE INDEX IF NOT EXISTS idx_admin_sessions_active_lookup
    ON public.admin_sessions(token_hash, idle_expires_at, absolute_expires_at)
    WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_admin_sessions_user_active
    ON public.admin_sessions(admin_user_id, created_at DESC)
    WHERE revoked_at IS NULL;

CREATE OR REPLACE FUNCTION public.prevent_audit_log_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'audit_log is append-only';
END;
$$;

DROP TRIGGER IF EXISTS audit_log_no_update_or_delete ON public.audit_log;
CREATE TRIGGER audit_log_no_update_or_delete
    BEFORE UPDATE OR DELETE ON public.audit_log
    FOR EACH ROW EXECUTE FUNCTION public.prevent_audit_log_mutation();

DROP TRIGGER IF EXISTS audit_log_no_truncate ON public.audit_log;
CREATE TRIGGER audit_log_no_truncate
    BEFORE TRUNCATE ON public.audit_log
    FOR EACH STATEMENT EXECUTE FUNCTION public.prevent_audit_log_mutation();

COMMIT;
