-- Biometric Rate Limiting Migration
-- Tracks retries and rejects strictly per IP address

CREATE TABLE IF NOT EXISTS ip_biometric_limits (
    ip_address INET PRIMARY KEY,
    retry_count INTEGER NOT NULL DEFAULT 0,    -- Count for Tier 2 [0.60 - 0.80]
    reject_count INTEGER NOT NULL DEFAULT 0,   -- Count for Tier 3 [0.00 - 0.60]
    last_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    locked_until TIMESTAMPTZ, -- If they hit the limits
    
    -- Track which rule they broke
    lockout_reason TEXT 
);

CREATE INDEX IF NOT EXISTS idx_ip_biometric_limits_locked_until ON ip_biometric_limits(locked_until);

-- Cleanup function for biometric limits (every 24h)
CREATE OR REPLACE FUNCTION cleanup_biometric_limits()
RETURNS void AS $$
BEGIN
    DELETE FROM ip_biometric_limits
    WHERE last_attempt_at < NOW() - INTERVAL '24 hours'
    AND (locked_until IS NULL OR locked_until < NOW());
END;
$$ LANGUAGE plpgsql;
