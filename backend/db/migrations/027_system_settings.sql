-- System Settings table for rate limits and other JSON configurations
-- This is separate from the key-value 'settings' table for structured data

CREATE TABLE IF NOT EXISTS system_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key TEXT UNIQUE NOT NULL,
    value JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_system_settings_key ON system_settings(key);

-- Insert default rate limit settings
INSERT INTO system_settings (key, value) VALUES
    ('rate_limit_enrollment', '{"ip": 10, "device": 5, "pn": 3, "window": 60}'::jsonb),
    ('rate_limit_login', '{"ip": 20, "device": 10, "pn": 5, "window": 15}'::jsonb),
    ('rate_limit_biometric', '{"ip": 10, "account": 5, "window": 60}'::jsonb),
    ('rate_limit_vote', '{"poll": 1, "account": 3, "window": 1}'::jsonb)
ON CONFLICT (key) DO NOTHING;

COMMENT ON TABLE system_settings IS 'System configuration with JSONB values for structured settings';
COMMENT ON COLUMN system_settings.key IS 'Unique setting key';
COMMENT ON COLUMN system_settings.value IS 'JSONB structured setting value';
