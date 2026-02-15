-- Fix missing columns in users table required by credentials service
ALTER TABLE users ADD COLUMN IF NOT EXISTS device_key_thumbprint VARCHAR(255);
CREATE INDEX IF NOT EXISTS idx_users_device_key_thumbprint ON users(device_key_thumbprint);

ALTER TABLE users ADD COLUMN IF NOT EXISTS risk_score NUMERIC(5, 2) DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS enrolled_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ DEFAULT NOW();
