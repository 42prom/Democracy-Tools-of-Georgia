BEGIN;

ALTER TABLE public.admin_sessions
    ADD COLUMN IF NOT EXISTS step_up_expires_at timestamp with time zone;

ALTER TABLE public.admin_sessions
    DROP CONSTRAINT IF EXISTS admin_sessions_step_up_expiry_check;

ALTER TABLE public.admin_sessions
    ADD CONSTRAINT admin_sessions_step_up_expiry_check
    CHECK (step_up_expires_at IS NULL OR step_up_expires_at <= absolute_expires_at);

COMMIT;

