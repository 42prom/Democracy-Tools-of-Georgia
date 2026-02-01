-- DTFG Database Schema v1
-- Invariant Checklist:
-- 1. Votes table has NO columns linking to users table.
-- 2. Nullifiers are UNIQUE per Poll.
-- 3. Security logs are separate.

CREATE TYPE poll_status AS ENUM ('draft', 'scheduled', 'active', 'ended', 'archived');
CREATE TYPE poll_type AS ENUM ('election', 'referendum', 'survey');
CREATE TYPE audit_severity AS ENUM ('info', 'warning', 'error', 'critical');

-- Regions: Core reference data
CREATE TABLE regions (
    id VARCHAR(20) PRIMARY KEY, -- e.g., 'reg_tbilisi'
    name VARCHAR(100) NOT NULL,
    type VARCHAR(20) NOT NULL, -- 'city', 'municipality'
    parent_id VARCHAR(20) REFERENCES regions(id),
    active BOOLEAN DEFAULT TRUE
);

-- Polls: Configuration
CREATE TABLE polls (
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
CREATE TABLE poll_options (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    poll_id UUID NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
    text VARCHAR(255) NOT NULL,
    display_order INT DEFAULT 0
);

-- Security: Used Nullifiers (The Core Anti-Double-Vote Mechanism)
-- Nullifier = Hash(PollID + UserSecret).
-- This table prevents replays and double votes. 
-- It contains NO useful data for an attacker (just hashes).
CREATE TABLE vote_nullifiers (
    poll_id UUID NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
    nullifier_hash CHAR(64) NOT NULL, -- SHA-256 hex
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    PRIMARY KEY (poll_id, nullifier_hash)
);

-- Votes: The actual ballots
-- STRICTLY ANONYMOUS. No user_id, no ip_address, no device_id here.
CREATE TABLE votes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    poll_id UUID NOT NULL REFERENCES polls(id),
    option_id UUID NOT NULL REFERENCES poll_options(id),
    
    -- Demographics Snapshot (Bucketed ONLY) for Analytics
    -- { "age_group": "25-34", "gender": "M", "region": "reg_batumi" }
    demographics_snapshot JSONB NOT NULL,
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Vote Attestations: The Verification Proof (Separated from Vote)
-- Kept for Audit/Non-Repudiation, but logic should not easily join this to 'votes' 
-- to de-anonymize (though timestamp correlation is a known risk, mitigated by batching).
CREATE TABLE vote_attestations (
    vote_id UUID PRIMARY KEY REFERENCES votes(id) ON DELETE CASCADE,
    attestation_payload TEXT NOT NULL, -- JWT or serialized struct
    device_key_hash CHAR(64) NOT NULL,
    nonce_used CHAR(64) NOT NULL
);

-- Users (Identity Metadata)
-- No Names, No Photos.
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_key_thumbprint CHAR(64) UNIQUE NOT NULL,
    
    -- We store hashed ID reference to prevent multi-device enrollment abuse if needed
    -- personal_id_hash CHAR(64) UNIQUE, 
    
    risk_score INT DEFAULT 0,
    enrolled_at TIMESTAMPTZ DEFAULT NOW(),
    last_active_at TIMESTAMPTZ
);

-- Security Audit Log
CREATE TABLE security_events (
    id BIGSERIAL PRIMARY KEY,
    event_type VARCHAR(50) NOT NULL, -- 'auth_fail', 'vote_success', 'liveness_fail'
    severity audit_severity DEFAULT 'info',
    user_ref UUID, -- NULL if unknown user
    meta JSONB, -- { "risk_reasons": ["ip_reputation"] }
    ip_hash CHAR(64), -- Hashed for privacy retention
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_votes_poll_option ON votes(poll_id, option_id);
CREATE INDEX idx_polls_status ON polls(status);
CREATE INDEX idx_nullifiers_hash ON vote_nullifiers(nullifier_hash);
