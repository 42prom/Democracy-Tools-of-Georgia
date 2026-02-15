-- Migration 009: Add user rewards tracking
-- Date: 2026-02-03
-- Description: Track rewards earned by devices/users for voting. 
-- Note: Uses device_key_hash (from VotingCredential.sub) as the identifier for MVP.

CREATE TABLE IF NOT EXISTS user_rewards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_key_hash VARCHAR(255) NOT NULL, -- Linked to VotingCredential.sub
    poll_id UUID NOT NULL REFERENCES polls(id),
    amount NUMERIC(18, 8) NOT NULL,
    token_symbol VARCHAR(20) NOT NULL, -- e.g. DTG
    
    tx_hash VARCHAR(255), -- Mock or real blockchain tx hash
    status VARCHAR(20) DEFAULT 'processed', -- pending, processed, failed
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Prevent double-rewarding for same poll/device combo if needed
    -- But anonymity rules might prevent this check on the backend if we strictly separate.
    -- For MVP reward verification, we will track it.
    CONSTRAINT unique_reward_per_poll_device UNIQUE (poll_id, device_key_hash)
);

CREATE INDEX IF NOT EXISTS idx_rewards_device ON user_rewards(device_key_hash);

