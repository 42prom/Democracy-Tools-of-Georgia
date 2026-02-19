
CREATE TABLE IF NOT EXISTS system_settings (
    key VARCHAR(255) PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_by VARCHAR(255)
);

-- Insert default values if they don't exist
INSERT INTO system_settings (key, value)
VALUES 
    ('rate_limit_enrollment', '{"ip": 10, "device": 5, "pn": 3, "window": 60}'::jsonb),
    ('rate_limit_login', '{"ip": 20, "device": 10, "pn": 5, "window": 15}'::jsonb),
    ('rate_limit_biometric', '{"ip": 10, "account": 5, "window": 60}'::jsonb),
    ('rate_limit_vote', '{"poll": 1, "account": 3, "window": 1}'::jsonb)
ON CONFLICT (key) DO NOTHING;
