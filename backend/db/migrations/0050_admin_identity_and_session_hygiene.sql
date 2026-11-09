BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT lower(trim(email))
      FROM public.admin_users
     GROUP BY lower(trim(email))
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'admin_users contains case-insensitive duplicate emails';
  END IF;
END;
$$;

UPDATE public.admin_users
   SET email = lower(trim(email))
 WHERE email <> lower(trim(email));

CREATE UNIQUE INDEX IF NOT EXISTS uq_admin_users_email_canonical
    ON public.admin_users (lower(email));

CREATE INDEX IF NOT EXISTS idx_admin_sessions_cleanup
    ON public.admin_sessions (absolute_expires_at, revoked_at);

-- Credential file paths are deployment configuration, never mutable application data.
DELETE FROM public.settings WHERE key = 'push_service_account_path';

COMMIT;

