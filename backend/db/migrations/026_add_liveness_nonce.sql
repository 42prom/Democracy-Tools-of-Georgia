-- Add liveness_nonce column to enrollment_sessions for replay protection
ALTER TABLE enrollment_sessions ADD COLUMN IF NOT EXISTS liveness_nonce VARCHAR(64);
