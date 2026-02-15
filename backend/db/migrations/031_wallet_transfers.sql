-- Migration 031: Add wallet transfer support to user_rewards
-- Date: 2026-02-14
-- Description: Allow tracking of outgoing transfers from user reward balance

-- Make poll_id nullable (transfers don't have an associated poll)
ALTER TABLE user_rewards
ALTER COLUMN poll_id DROP NOT NULL;

-- Add column for transfer recipient address
ALTER TABLE user_rewards
ADD COLUMN IF NOT EXISTS transfer_to VARCHAR(255);

-- Add tx_id for unique transaction identification
ALTER TABLE user_rewards
ADD COLUMN IF NOT EXISTS tx_id VARCHAR(100);

-- Drop the unique constraint that requires poll_id (need to recreate with different logic)
ALTER TABLE user_rewards
DROP CONSTRAINT IF EXISTS unique_reward_per_poll_device;

-- Add back a partial unique constraint (only for poll rewards, not transfers)
CREATE UNIQUE INDEX IF NOT EXISTS unique_reward_per_poll_device_v2
ON user_rewards(poll_id, device_key_hash)
WHERE poll_id IS NOT NULL AND transfer_to IS NULL;

-- Index for transaction lookups
CREATE INDEX IF NOT EXISTS idx_rewards_tx_id ON user_rewards(tx_id);

-- Index for transfer lookups
CREATE INDEX IF NOT EXISTS idx_rewards_transfers ON user_rewards(device_key_hash, transfer_to)
WHERE transfer_to IS NOT NULL;
