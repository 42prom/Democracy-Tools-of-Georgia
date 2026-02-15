-- Add index on poll_participants.user_id for faster "my votes" lookups
CREATE INDEX IF NOT EXISTS idx_poll_participants_user ON poll_participants(user_id);
