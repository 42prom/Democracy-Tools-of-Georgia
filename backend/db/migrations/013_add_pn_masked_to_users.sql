-- Add pn_masked to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS pn_masked TEXT;
