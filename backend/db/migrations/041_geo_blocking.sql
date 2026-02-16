-- =============================================================================
-- Migration 041: FLAGSHIP GEO-BLOCKING SYSTEM
-- Advanced country and IP blocking with whitelist/blacklist support
-- =============================================================================

-- Blocked countries table
CREATE TABLE IF NOT EXISTS blocked_countries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    country_code CHAR(2) NOT NULL UNIQUE,
    country_name VARCHAR(100) NOT NULL,
    block_reason VARCHAR(255),
    blocked_at TIMESTAMPTZ DEFAULT NOW(),
    blocked_by UUID REFERENCES admin_users(id),
    is_active BOOLEAN DEFAULT TRUE
);

-- Whitelisted IPs (bypass country block)
CREATE TABLE IF NOT EXISTS whitelisted_ips (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ip_address INET NOT NULL UNIQUE,
    ip_range CIDR,
    description VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES admin_users(id),
    is_active BOOLEAN DEFAULT TRUE
);

-- Blocked IP addresses (specific IPs regardless of country)
CREATE TABLE IF NOT EXISTS blocked_ips (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ip_address INET NOT NULL UNIQUE,
    ip_range CIDR,
    block_reason VARCHAR(255),
    blocked_at TIMESTAMPTZ DEFAULT NOW(),
    blocked_by UUID REFERENCES admin_users(id),
    expires_at TIMESTAMPTZ,
    is_active BOOLEAN DEFAULT TRUE
);

-- Access log for blocked attempts
CREATE TABLE IF NOT EXISTS blocked_access_log (
    id BIGSERIAL PRIMARY KEY,
    ip_address INET NOT NULL,
    country_code CHAR(2),
    country_name VARCHAR(100),
    block_type VARCHAR(20) NOT NULL,
    endpoint VARCHAR(255),
    user_agent TEXT,
    attempted_at TIMESTAMPTZ DEFAULT NOW()
);

-- Geo settings
CREATE TABLE IF NOT EXISTS geo_blocking_settings (
    key VARCHAR(50) PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Default settings
INSERT INTO geo_blocking_settings (key, value) VALUES
    ('geo_blocking_enabled', 'false'),
    ('geo_provider', 'ip-api'),
    ('geo_api_key', ''),
    ('block_mode', 'blacklist'),
    ('log_blocked_attempts', 'true'),
    ('block_enrollment', 'true'),
    ('block_voting', 'true'),
    ('block_admin', 'false')
ON CONFLICT (key) DO NOTHING;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_blocked_countries_active ON blocked_countries(is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_blocked_countries_code ON blocked_countries(country_code);
CREATE INDEX IF NOT EXISTS idx_blocked_ips_active ON blocked_ips(is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_whitelisted_ips_active ON whitelisted_ips(is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_blocked_access_log_time ON blocked_access_log(attempted_at DESC);
CREATE INDEX IF NOT EXISTS idx_blocked_access_log_country ON blocked_access_log(country_code);

-- Cleanup function for old logs
CREATE OR REPLACE FUNCTION cleanup_blocked_access_log(retention_days INTEGER DEFAULT 30)
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM blocked_access_log
    WHERE attempted_at < NOW() - (retention_days || ' days')::INTERVAL;
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;
