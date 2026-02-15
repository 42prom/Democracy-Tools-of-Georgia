-- Migration: Add credential_dob column to users table
-- This stores the full date of birth for exact age calculation

ALTER TABLE users ADD COLUMN IF NOT EXISTS credential_dob DATE;

-- Add index for potential age-based queries
CREATE INDEX IF NOT EXISTS idx_users_credential_dob ON users(credential_dob);

-- Comment
COMMENT ON COLUMN users.credential_dob IS 'Full date of birth from ID document for exact age calculation';
