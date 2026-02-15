-- Migration: Add support for audit export events in security_events table
-- This adds the 'meta' JSONB column and relaxes constraints to support new event types

-- Add meta column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'security_events' AND column_name = 'meta'
  ) THEN
    ALTER TABLE security_events ADD COLUMN meta JSONB;
  END IF;
END $$;

-- Drop and recreate the event_type constraint to allow more types
ALTER TABLE security_events DROP CONSTRAINT IF EXISTS security_events_event_type_check;
ALTER TABLE security_events ADD CONSTRAINT security_events_event_type_check
  CHECK (event_type IN ('ENROLL', 'LOGIN', 'SESSION_VERIFY', 'LOCKOUT', 'audit_export', 'admin_action'));

-- Drop and recreate the result constraint to allow more values
ALTER TABLE security_events DROP CONSTRAINT IF EXISTS security_events_result_check;
ALTER TABLE security_events ADD CONSTRAINT security_events_result_check
  CHECK (result IN ('PASS', 'FAIL', 'BLOCKED', 'success', 'error'));

COMMENT ON COLUMN security_events.meta IS 'Additional event metadata as JSONB (export details, etc)';
