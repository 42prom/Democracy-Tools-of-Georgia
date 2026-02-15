-- Migration 024: Add wallet binding and reward status updates
-- Date: 2026-02-08

-- 1. Add wallet_address to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS wallet_address VARCHAR(42);

-- 2. Update status column in user_rewards to be more robust
-- If status is already processed (from older mock logic), keep it.
-- New rewards will default to 'pending'.
ALTER TABLE user_rewards ALTER COLUMN status SET DEFAULT 'pending';

-- 3. Add error_message column to user_rewards for tracking payout failures
ALTER TABLE user_rewards ADD COLUMN IF NOT EXISTS error_message TEXT;
ALTER TABLE user_rewards ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- 4. Create a unique constraint for wallet binding if we want one wallet per user
-- Only if we strictly want 1:1. For now, we allow multiple users to use same wallet (family/shared) or vice versa.
-- But index for searching is good.
CREATE INDEX IF NOT EXISTS idx_users_wallet_address ON users(wallet_address);

-- 5. Add status index to user_rewards for the background worker
CREATE INDEX IF NOT EXISTS idx_user_rewards_status ON user_rewards(status) WHERE status = 'pending';
