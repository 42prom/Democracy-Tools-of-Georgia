-- Settings table for system configuration
-- Stores key-value pairs for various system settings

CREATE TABLE IF NOT EXISTS settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key TEXT UNIQUE NOT NULL,
    value TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_settings_key ON settings(key);

-- Insert default verification provider settings
INSERT INTO settings (key, value) VALUES
    ('verification_document_provider', 'manual'),
    ('verification_document_apikey', ''),
    ('verification_liveness_provider', 'mock'),
    ('verification_liveness_apikey', ''),
    ('verification_liveness_min_score', '0.7'),
    ('verification_liveness_retry_limit', '3'),
    ('verification_facematch_provider', 'mock'),
    ('verification_facematch_apikey', ''),
    ('verification_facematch_min_score', '0.75')
ON CONFLICT (key) DO NOTHING;

COMMENT ON TABLE settings IS 'System configuration key-value store';
COMMENT ON COLUMN settings.key IS 'Unique setting key';
COMMENT ON COLUMN settings.value IS 'Setting value (may be encrypted for sensitive data)';
