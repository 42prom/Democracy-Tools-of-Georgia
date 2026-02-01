-- Messages Module Schema
-- Separate from Polls; reuses audience_rules JSONB pattern.

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'message_type') THEN
    CREATE TYPE message_type AS ENUM ('announcement', 'alert', 'reminder');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'message_status') THEN
    CREATE TYPE message_status AS ENUM ('draft', 'scheduled', 'published', 'archived');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL,
    body TEXT NOT NULL DEFAULT '',
    type message_type NOT NULL DEFAULT 'announcement',
    status message_status NOT NULL DEFAULT 'draft',

    -- Audience targeting (same JSONB shape as polls.audience_rules)
    audience_rules JSONB NOT NULL DEFAULT '{}',

    publish_at TIMESTAMPTZ,
    expire_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    published_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_messages_status ON messages(status);
CREATE INDEX IF NOT EXISTS idx_messages_publish_at ON messages(publish_at);
