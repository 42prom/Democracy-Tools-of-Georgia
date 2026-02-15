-- Identity System Migration
-- Privacy-safe login/enrollment with no biometric storage
-- ALL statements are idempotent (safe to re-run).

-- Users table: No PII, only hashed identifiers and demographic buckets
-- If the old v1 schema exists, safely upgrade it to v2.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'users') THEN
    
    -- Add ALL missing columns (this was the bug — created_at was missing)
    ALTER TABLE users ADD COLUMN IF NOT EXISTS pn_hash TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS credential_gender TEXT CHECK (credential_gender IN ('M', 'F', 'UNKNOWN'));
    ALTER TABLE users ADD COLUMN IF NOT EXISTS credential_birth_year INTEGER CHECK (credential_birth_year >= 1900 AND credential_birth_year <= EXTRACT(YEAR FROM CURRENT_DATE));
    ALTER TABLE users ADD COLUMN IF NOT EXISTS credential_region_codes TEXT[];
    ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();  -- ← FIXED
    ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
    ALTER TABLE users ADD COLUMN IF NOT EXISTS trust_score FLOAT DEFAULT 0.0;

    -- Make pn_hash UNIQUE (safe even if constraint already exists)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE table_name = 'users' AND constraint_name = 'users_pn_hash_key'
    ) THEN
        ALTER TABLE users ADD CONSTRAINT users_pn_hash_key UNIQUE (pn_hash);
    END IF;

  END IF;
END $$;

-- Create table (only runs on completely fresh DB)
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pn_hash TEXT UNIQUE NOT NULL,

    -- Demographic buckets (from credential, privacy-safe)
    credential_gender TEXT CHECK (credential_gender IN ('M', 'F', 'UNKNOWN')),
    credential_birth_year INTEGER CHECK (credential_birth_year >= 1900 AND credential_birth_year <= EXTRACT(YEAR FROM CURRENT_DATE)),
    credential_region_codes TEXT[],

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_login_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Risk/trust metrics
    trust_score FLOAT DEFAULT 0.0
);

-- Indexes (now guaranteed to succeed because columns exist)
CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at);
CREATE INDEX IF NOT EXISTS idx_users_last_login ON users(last_login_at);

-- Security events: Drop old v1 schema only if needed
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'security_events' AND column_name = 'ip_hash'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'security_events' AND column_name = 'pn_hash'
  ) THEN
    DROP TABLE IF EXISTS security_events CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS security_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    pn_hash TEXT,

    event_type TEXT NOT NULL CHECK (event_type IN ('ENROLL', 'LOGIN', 'SESSION_VERIFY', 'LOCKOUT')),
    result TEXT NOT NULL CHECK (result IN ('PASS', 'FAIL', 'BLOCKED')),

    liveness_score FLOAT CHECK (liveness_score >= 0 AND liveness_score <= 1),
    face_match_score FLOAT CHECK (face_match_score >= 0 AND face_match_score <= 1),

    reason_code TEXT,
    ip_address INET,
    user_agent TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_security_events_user_id ON security_events(user_id);
CREATE INDEX IF NOT EXISTS idx_security_events_pn_hash ON security_events(pn_hash);
CREATE INDEX IF NOT EXISTS idx_security_events_created_at ON security_events(created_at);
CREATE INDEX IF NOT EXISTS idx_security_events_event_type ON security_events(event_type);
CREATE INDEX IF NOT EXISTS idx_security_events_result ON security_events(result);

-- Rate limits (ephemeral)
CREATE TABLE IF NOT EXISTS auth_rate_limits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pn_hash TEXT NOT NULL,
    ip_address INET NOT NULL,
    attempt_count INTEGER NOT NULL DEFAULT 1,
    last_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    locked_until TIMESTAMPTZ,

    CONSTRAINT unique_pn_hash_ip UNIQUE (pn_hash, ip_address)
);

CREATE INDEX IF NOT EXISTS idx_auth_rate_limits_pn_hash ON auth_rate_limits(pn_hash);
CREATE INDEX IF NOT EXISTS idx_auth_rate_limits_ip ON auth_rate_limits(ip_address);
CREATE INDEX IF NOT EXISTS idx_auth_rate_limits_locked_until ON auth_rate_limits(locked_until);

-- Cleanup function
CREATE OR REPLACE FUNCTION cleanup_old_rate_limits()
RETURNS void AS $$
BEGIN
    DELETE FROM auth_rate_limits
    WHERE last_attempt_at < NOW() - INTERVAL '24 hours'
    AND (locked_until IS NULL OR locked_until < NOW());
END;
$$ LANGUAGE plpgsql;

-- Comments
COMMENT ON TABLE users IS 'Privacy-safe user table with no PII, only hashed identifiers';
COMMENT ON COLUMN users.pn_hash IS 'HMAC hash of personal number - never store raw PN';
COMMENT ON TABLE security_events IS 'Audit log for all authentication events';
COMMENT ON TABLE auth_rate_limits IS 'Rate limiting and lockout tracking';