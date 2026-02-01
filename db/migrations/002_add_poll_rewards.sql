-- Migration 002: Add reward configuration to polls
-- Date: 2026-01-30
-- Description: Add columns for per-vote rewards (rewards_enabled, reward_amount, reward_token)
-- ALL statements are idempotent (safe to re-run).

-- Add reward columns to polls table (IF NOT EXISTS)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'polls' AND column_name = 'rewards_enabled'
  ) THEN
    ALTER TABLE polls ADD COLUMN rewards_enabled BOOLEAN DEFAULT FALSE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'polls' AND column_name = 'reward_amount'
  ) THEN
    ALTER TABLE polls ADD COLUMN reward_amount NUMERIC(18, 8);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'polls' AND column_name = 'reward_token'
  ) THEN
    ALTER TABLE polls ADD COLUMN reward_token VARCHAR(10) DEFAULT 'DTFG';
  END IF;
END $$;

-- Add comment explaining the columns
COMMENT ON COLUMN polls.rewards_enabled IS 'Whether voters receive a reward for participating in this poll';
COMMENT ON COLUMN polls.reward_amount IS 'Amount of tokens rewarded per vote (if rewards_enabled is true)';
COMMENT ON COLUMN polls.reward_token IS 'Token symbol for the reward (e.g., DTFG, ETH, USDC)';

-- Validation: If rewards are enabled, amount must be positive (idempotent)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_name = 'check_reward_amount_if_enabled'
  ) THEN
    ALTER TABLE polls ADD CONSTRAINT check_reward_amount_if_enabled
    CHECK (
      (rewards_enabled = FALSE) OR
      (rewards_enabled = TRUE AND reward_amount > 0)
    );
  END IF;
END $$;

-- Index for queries filtering by rewards_enabled
CREATE INDEX IF NOT EXISTS idx_polls_rewards_enabled ON polls(rewards_enabled) WHERE rewards_enabled = TRUE;
