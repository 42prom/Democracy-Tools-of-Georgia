BEGIN;

ALTER TABLE public.admin_users
    ADD COLUMN IF NOT EXISTS mfa_secret_encrypted text,
    ADD COLUMN IF NOT EXISTS mfa_enabled boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS mfa_enrolled_at timestamp with time zone;

ALTER TABLE public.admin_users
    DROP CONSTRAINT IF EXISTS admin_users_mfa_state_check;

ALTER TABLE public.admin_users
    ADD CONSTRAINT admin_users_mfa_state_check CHECK (
        mfa_enabled = false OR (mfa_secret_encrypted IS NOT NULL AND mfa_enrolled_at IS NOT NULL)
    );

COMMIT;
