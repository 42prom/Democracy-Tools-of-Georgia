-- Identity System Migration
-- Privacy-safe login/enrollment with no biometric storage
-- ALL statements are idempotent (safe to re-run).
--
-- NOTE: This migration replaces the original users/security_events tables from 001.
-- It uses conditional logic to only drop the OLD v1 schema, never the v2 schema.

-- Users table: No PII, only hashed identifiers and demographic buckets
-- Only drop the OLD v1 schema (with device_key_thumbprint) if it exists.
-- Never drop the v2 schema (with pn_hash) — that has real user data.
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'device_key_thumbprint'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'pn_hash'
  ) THEN
    DROP TABLE IF EXISTS users CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pn_hash TEXT UNIQUE NOT NULL, -- HMAC(secret, "GE:" + pnDigits)

    -- Demographic buckets (from credential, privacy-safe)
    credential_gender TEXT CHECK (credential_gender IN ('M', 'F', 'UNKNOWN')),
    credential_birth_year INTEGER CHECK (credential_birth_year >= 1900 AND credential_birth_year <= EXTRACT(YEAR FROM CURRENT_DATE)),
    credential_region_codes TEXT[], -- Array of region codes e.g., ['reg_tbilisi']

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_login_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Risk/trust metrics (for future use)
    trust_score FLOAT DEFAULT 0.0
);

CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at);
CREATE INDEX IF NOT EXISTS idx_users_last_login ON users(last_login_at);

-- Security events: Only drop old v1 schema (with ip_hash column, no pn_hash column)
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

    -- User reference (nullable for failed enrollments)
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    pn_hash TEXT, -- For correlation even if user not created yet

    -- Event details
    event_type TEXT NOT NULL CHECK (event_type IN ('ENROLL', 'LOGIN', 'SESSION_VERIFY', 'LOCKOUT')),
    result TEXT NOT NULL CHECK (result IN ('PASS', 'FAIL', 'BLOCKED')),

    -- Biometric scores (NOT the actual biometrics, just pass/fail scores)
    liveness_score FLOAT CHECK (liveness_score >= 0 AND liveness_score <= 1),
    face_match_score FLOAT CHECK (face_match_score >= 0 AND face_match_score <= 1),

    -- Failure reason (if applicable)
    reason_code TEXT,

    -- Request metadata (for security analysis)
    ip_address INET,
    user_agent TEXT,

    -- Timestamp
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_security_events_user_id ON security_events(user_id);
CREATE INDEX IF NOT EXISTS idx_security_events_pn_hash ON security_events(pn_hash);
CREATE INDEX IF NOT EXISTS idx_security_events_created_at ON security_events(created_at);
CREATE INDEX IF NOT EXISTS idx_security_events_event_type ON security_events(event_type);
CREATE INDEX IF NOT EXISTS idx_security_events_result ON security_events(result);

-- auth_rate_limits is ephemeral (24h TTL), safe to create if not exists
CREATE TABLE IF NOT EXISTS auth_rate_limits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pn_hash TEXT NOT NULL,
    ip_address INET NOT NULL,
    attempt_count INTEGER NOT NULL DEFAULT 1,
    last_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    locked_until TIMESTAMPTZ, -- NULL if not locked

    CONSTRAINT unique_pn_hash_ip UNIQUE (pn_hash, ip_address)
);

CREATE INDEX IF NOT EXISTS idx_auth_rate_limits_pn_hash ON auth_rate_limits(pn_hash);
CREATE INDEX IF NOT EXISTS idx_auth_rate_limits_ip ON auth_rate_limits(ip_address);
CREATE INDEX IF NOT EXISTS idx_auth_rate_limits_locked_until ON auth_rate_limits(locked_until);

-- Function to clean up old rate limit records (for maintenance)
CREATE OR REPLACE FUNCTION cleanup_old_rate_limits()
RETURNS void AS $$
BEGIN
    DELETE FROM auth_rate_limits
    WHERE last_attempt_at < NOW() - INTERVAL '24 hours'
    AND (locked_until IS NULL OR locked_until < NOW());
END;
$$ LANGUAGE plpgsql;

-- Comments for documentation
COMMENT ON TABLE users IS 'Privacy-safe user table with no PII, only hashed identifiers';
COMMENT ON COLUMN users.pn_hash IS 'HMAC hash of personal number - never store raw PN';
COMMENT ON TABLE security_events IS 'Audit log for all authentication events';
COMMENT ON TABLE auth_rate_limits IS 'Rate limiting and lockout tracking';
