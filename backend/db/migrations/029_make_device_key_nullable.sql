-- Migration: Make device_key_thumbprint nullable
-- The new enrollment flow uses pn_hash for identity, not device keys

-- Drop the NOT NULL constraint
ALTER TABLE users ALTER COLUMN device_key_thumbprint DROP NOT NULL;

-- Drop the default empty string if it exists and set to NULL
ALTER TABLE users ALTER COLUMN device_key_thumbprint DROP DEFAULT;

-- Also remove the unique constraint if it causes issues with multiple NULLs
-- (PostgreSQL allows multiple NULLs in unique columns by default, so this is fine)

COMMENT ON COLUMN users.device_key_thumbprint IS 'Legacy device key thumbprint - nullable for pn_hash based enrollment';
