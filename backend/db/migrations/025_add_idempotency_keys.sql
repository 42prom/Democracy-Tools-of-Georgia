-- Idempotency keys table to prevent double-processing of requests
CREATE TABLE IF NOT EXISTS idempotency_keys (
  key VARCHAR(255) PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  path VARCHAR(255) NOT NULL,
  params JSONB,
  response_code INTEGER,
  response_body JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '24 hours') -- Keys valid for 24h
);

CREATE INDEX idx_idempotency_keys_expires_at ON idempotency_keys(expires_at);
