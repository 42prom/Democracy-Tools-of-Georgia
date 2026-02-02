-- Migration: Enrollment sessions + verification settings defaults
-- Created: 2026-02-02

-- Ensure UUID helper exists
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- -----------------------------------------------------------------------------
-- Compatibility fix: legacy paths/logs referenced polls.options
-- The canonical model uses poll_options table; this column is optional.
-- -----------------------------------------------------------------------------
ALTER TABLE polls ADD COLUMN IF NOT EXISTS options JSONB;

-- -----------------------------------------------------------------------------
-- Enrollment sessions for 3-step verification flow
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS enrollment_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pn_hash TEXT NOT NULL,
  mode VARCHAR(20) NOT NULL CHECK (mode IN ('login', 'register')),
  step INT NOT NULL DEFAULT 1,
  status VARCHAR(20) NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed', 'failed')),

  nfc_payload JSONB,
  document_payload JSONB,

  nfc_portrait_hash CHAR(64),
  document_portrait_hash CHAR(64),

  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_enrollment_sessions_pn_hash ON enrollment_sessions(pn_hash);
CREATE INDEX IF NOT EXISTS idx_enrollment_sessions_expires_at ON enrollment_sessions(expires_at);

-- -----------------------------------------------------------------------------
-- Default verification settings (safe defaults for development)
-- -----------------------------------------------------------------------------
-- NFC
INSERT INTO settings (key, value, updated_at)
VALUES
  ('verification_nfc_provider', 'mock', NOW()),
  ('verification_nfc_require_nfc', 'true', NOW()),
  ('verification_nfc_require_georgian_citizen', 'true', NOW()),
  ('verification_nfc_require_personal_number', 'true', NOW())
ON CONFLICT (key) DO NOTHING;

-- Document scanner + policy
INSERT INTO settings (key, value, updated_at)
VALUES
  ('verification_document_provider', 'manual', NOW()),
  ('verification_document_require_photo_scan', 'true', NOW()),
  ('verification_document_strictness', 'strict', NOW())
ON CONFLICT (key) DO NOTHING;

-- Existing keys for liveness and face match may already exist; ensure sane defaults
INSERT INTO settings (key, value, updated_at)
VALUES
  ('verification_liveness_provider', 'mock', NOW()),
  ('verification_liveness_min_score', '0.7', NOW()),
  ('verification_liveness_retry_limit', '3', NOW()),
  ('verification_facematch_provider', 'mock', NOW()),
  ('verification_facematch_min_score', '0.75', NOW())
ON CONFLICT (key) DO NOTHING;
