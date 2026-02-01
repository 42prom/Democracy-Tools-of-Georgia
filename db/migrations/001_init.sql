-- DTFG Database Schema v1
-- Invariant Checklist:
-- 1. Votes table has NO columns linking to users table.
-- 2. Nullifiers are UNIQUE per Poll.
-- 3. Security logs are separate.
-- 4. ALL statements are idempotent (safe to re-run).

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

-- Regions: Core reference data
CREATE TABLE IF NOT EXISTS regions (
    id VARCHAR(20) PRIMARY KEY, -- e.g., 'reg_tbilisi'
    name VARCHAR(100) NOT NULL,
    type VARCHAR(20) NOT NULL, -- 'city', 'municipality'
    parent_id VARCHAR(20) REFERENCES regions(id),
    active BOOLEAN DEFAULT TRUE
);

-- Polls: Configuration
CREATE TABLE IF NOT EXISTS polls (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    type poll_type NOT NULL DEFAULT 'survey',
    status poll_status NOT NULL DEFAULT 'draft',
    start_at TIMESTAMPTZ,
    end_at TIMESTAMPTZ,

    -- Eligibility Rules (JSONB for flexibility)
    -- { "min_age": 18, "regions": ["reg_tbilisi"], "gender": "all" }
    audience_rules JSONB NOT NULL DEFAULT '{}',

    -- Privacy Config
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

-- Security: Used Nullifiers (The Core Anti-Double-Vote Mechanism)
CREATE TABLE IF NOT EXISTS vote_nullifiers (
    poll_id UUID NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
    nullifier_hash CHAR(64) NOT NULL, -- SHA-256 hex
    created_at TIMESTAMPTZ DEFAULT NOW(),

    PRIMARY KEY (poll_id, nullifier_hash)
);

-- Votes: The actual ballots
-- STRICTLY ANONYMOUS. No user_id, no ip_address, no device_id here.
CREATE TABLE IF NOT EXISTS votes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    poll_id UUID NOT NULL REFERENCES polls(id),
    option_id UUID NOT NULL REFERENCES poll_options(id),

    -- Demographics Snapshot (Bucketed ONLY) for Analytics
    demographics_snapshot JSONB NOT NULL,

    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Vote Attestations: The Verification Proof (Separated from Vote)
CREATE TABLE IF NOT EXISTS vote_attestations (
    vote_id UUID PRIMARY KEY REFERENCES votes(id) ON DELETE CASCADE,
    attestation_payload TEXT NOT NULL, -- JWT or serialized struct
    device_key_hash CHAR(64) NOT NULL,
    nonce_used CHAR(64) NOT NULL
);

-- Users (Identity Metadata) - legacy schema, replaced by 004
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_key_thumbprint CHAR(64) UNIQUE NOT NULL,
    risk_score INT DEFAULT 0,
    enrolled_at TIMESTAMPTZ DEFAULT NOW(),
    last_active_at TIMESTAMPTZ
);

-- Security Audit Log
CREATE TABLE IF NOT EXISTS security_events (
    id BIGSERIAL PRIMARY KEY,
    event_type VARCHAR(50) NOT NULL,
    severity audit_severity DEFAULT 'info',
    user_ref UUID,
    meta JSONB,
    ip_hash CHAR(64),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_votes_poll_option ON votes(poll_id, option_id);
CREATE INDEX IF NOT EXISTS idx_polls_status ON polls(status);
CREATE INDEX IF NOT EXISTS idx_nullifiers_hash ON vote_nullifiers(nullifier_hash);
