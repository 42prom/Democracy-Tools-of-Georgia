-- Make pn_hash nullable to support device-only enrollment flow
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'pn_hash') THEN
    ALTER TABLE users ALTER COLUMN pn_hash DROP NOT NULL;
  END IF;
END $$;
