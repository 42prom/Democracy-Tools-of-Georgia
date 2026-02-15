-- Add index on vote_nullifiers.poll_id for faster duplicate vote checks
CREATE INDEX IF NOT EXISTS idx_vote_nullifiers_poll ON vote_nullifiers(poll_id);
