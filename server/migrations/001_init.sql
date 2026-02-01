-- DTFG Database Schema v1
-- Invariant Checklist:
-- 1. Votes table has NO columns linking to users table.
-- 2. Nullifiers are UNIQUE per Poll.
-- 3. Security logs are separate.

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'poll_status') THEN
    CREATE TYPE poll_status AS ENUM ('draft', 'scheduled', 'active', 'ended', 'archived');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'poll_type') THEN
    CREATE TYPE poll_type AS ENUM ('election', 'referendum', 'survey');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'audit_severity') THEN
    CREATE TYPE audit_severity AS ENUM ('info', 'warning', 'error', 'critical');
  END IF;
END $$;

-- Polls: Configuration
CREATE TABLE IF NOT EXISTS polls (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    type poll_type NOT NULL DEFAULT 'survey',
    status poll_status NOT NULL DEFAULT 'draft',
    start_at TIMESTAMPTZ,
    end_at TIMESTAMPTZ,
    audience_rules JSONB NOT NULL DEFAULT '{}',
    min_k_anonymity INT DEFAULT 30,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    published_at TIMESTAMPTZ
);

-- Options for Polls
CREATE TABLE IF NOT EXISTS poll_options (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    poll_id UUID NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
    text VARCHAR(255) NOT NULL,
    display_order INT DEFAULT 0
);

-- Security: Used Nullifiers
CREATE TABLE IF NOT EXISTS vote_nullifiers (
    poll_id UUID NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
    nullifier_hash CHAR(64) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (poll_id, nullifier_hash)
);

-- Votes: The actual ballots (STRICTLY ANONYMOUS)
CREATE TABLE IF NOT EXISTS votes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    poll_id UUID NOT NULL REFERENCES polls(id),
    option_id UUID NOT NULL REFERENCES poll_options(id),
    demographics_snapshot JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Vote Attestations
CREATE TABLE IF NOT EXISTS vote_attestations (
    vote_id UUID PRIMARY KEY REFERENCES votes(id) ON DELETE CASCADE,
    attestation_payload TEXT NOT NULL,
    device_key_hash CHAR(64) NOT NULL,
    nonce_used CHAR(64) NOT NULL
);

-- Indexes (IF NOT EXISTS for safety)
CREATE INDEX IF NOT EXISTS idx_votes_poll_option ON votes(poll_id, option_id);
CREATE INDEX IF NOT EXISTS idx_polls_status ON polls(status);
CREATE INDEX IF NOT EXISTS idx_nullifiers_hash ON vote_nullifiers(nullifier_hash);
