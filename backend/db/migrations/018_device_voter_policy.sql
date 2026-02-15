-- Security Policy Module: Device Attestation & Multi-Voter Limits
-- 1. Table to track which devices have voted in which polls
CREATE TABLE IF NOT EXISTS device_poll_voters (
    poll_id UUID NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
    device_key_hash CHAR(64) NOT NULL, -- HMAC of device identifier
    voter_hash CHAR(64) NOT NULL,      -- HMAC of personal_number/identity
    first_seen_at TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (poll_id, device_key_hash, voter_hash)
);

CREATE INDEX IF NOT EXISTS idx_device_poll_voters_lookup ON device_poll_voters(poll_id, device_key_hash);

-- 2. New Security Settings
INSERT INTO settings (key, value) 
VALUES 
    ('security_max_distinct_voters_per_device_per_poll', '2'),
    ('security_require_device_attestation_for_vote', 'false')
ON CONFLICT (key) DO NOTHING;
