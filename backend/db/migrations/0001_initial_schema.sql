-- DTG Consolidated Schema v1
-- Generated from production dump
-- Replaces previous 37 iterative migrations

-- Extensions
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;

-- Enums
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'admin_role') THEN
    CREATE TYPE public.admin_role AS ENUM ('superadmin', 'admin', 'moderator', 'observer');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'audit_severity') THEN
    CREATE TYPE public.audit_severity AS ENUM ('info', 'warning', 'error', 'critical');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'message_status') THEN
    CREATE TYPE public.message_status AS ENUM ('draft', 'scheduled', 'published', 'archived');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'message_type') THEN
    CREATE TYPE public.message_type AS ENUM ('announcement', 'alert', 'reminder');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'poll_status') THEN
    CREATE TYPE public.poll_status AS ENUM ('draft', 'scheduled', 'active', 'ended', 'archived');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'poll_type') THEN
    CREATE TYPE public.poll_type AS ENUM ('election', 'referendum', 'survey');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ticket_category') THEN
    CREATE TYPE public.ticket_category AS ENUM ('general', 'account', 'voting', 'technical', 'verification', 'rewards', 'other');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ticket_priority') THEN
    CREATE TYPE public.ticket_priority AS ENUM ('low', 'medium', 'high', 'urgent');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ticket_status') THEN
    CREATE TYPE public.ticket_status AS ENUM ('open', 'in_progress', 'waiting_user', 'resolved', 'closed');
  END IF;
END $$;

-- Functions
CREATE OR REPLACE FUNCTION public.cleanup_biometric_limits() RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    DELETE FROM ip_biometric_limits
    WHERE last_attempt_at < NOW() - INTERVAL '24 hours'
    AND (locked_until IS NULL OR locked_until < NOW());
END;
$$;

CREATE OR REPLACE FUNCTION public.cleanup_blocked_access_log(retention_days integer DEFAULT 30) RETURNS integer LANGUAGE plpgsql AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM blocked_access_log
    WHERE attempted_at < NOW() - (retention_days || ' days')::INTERVAL;
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.cleanup_old_rate_limits() RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    DELETE FROM auth_rate_limits
    WHERE last_attempt_at < NOW() - INTERVAL '24 hours'
    AND (locked_until IS NULL OR locked_until < NOW());
END;
$$;

CREATE OR REPLACE FUNCTION public.generate_ticket_number() RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  year_part TEXT;
  seq_num INT;
  ticket_num TEXT;
BEGIN
  year_part := TO_CHAR(NOW(), 'YY');
  SELECT COALESCE(MAX(CAST(SUBSTRING(ticket_number FROM 4) AS INT)), 0) + 1
  INTO seq_num
  FROM tickets
  WHERE ticket_number LIKE 'TK' || year_part || '%';

  ticket_num := 'TK' || year_part || LPAD(seq_num::TEXT, 6, '0');
  RETURN ticket_num;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_ticket_number() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.ticket_number IS NULL OR NEW.ticket_number = '' THEN
    NEW.ticket_number := generate_ticket_number();
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_regions_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_ticket_on_response() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE tickets SET updated_at = NOW() WHERE id = NEW.ticket_id;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_ticket_timestamp() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_updated_at_column() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

-- Tables
CREATE TABLE IF NOT EXISTS public.admin_users (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    email character varying(255) NOT NULL UNIQUE,
    password_hash character varying(255) NOT NULL,
    role public.admin_role DEFAULT 'admin'::public.admin_role NOT NULL,
    full_name character varying(100),
    last_login_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.auth_rate_limits (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    pn_hash text NOT NULL,
    ip_address inet NOT NULL,
    attempt_count integer DEFAULT 1 NOT NULL,
    last_attempt_at timestamp with time zone DEFAULT now() NOT NULL,
    locked_until timestamp with time zone,
    CONSTRAINT unique_pn_hash_ip UNIQUE (pn_hash, ip_address)
);

CREATE TABLE IF NOT EXISTS public.blocked_access_log (
    id BIGSERIAL PRIMARY KEY,
    ip_address inet NOT NULL,
    country_code character(2),
    country_name character varying(100),
    block_type character varying(20) NOT NULL,
    endpoint character varying(255),
    user_agent text,
    attempted_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.blocked_countries (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    country_code character(2) NOT NULL UNIQUE,
    country_name character varying(100) NOT NULL,
    block_reason character varying(255),
    blocked_at timestamp with time zone DEFAULT now(),
    blocked_by uuid REFERENCES public.admin_users(id),
    is_active boolean DEFAULT true
);

CREATE TABLE IF NOT EXISTS public.blocked_ips (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    ip_address inet NOT NULL UNIQUE,
    ip_range cidr,
    block_reason character varying(255),
    blocked_at timestamp with time zone DEFAULT now(),
    blocked_by uuid REFERENCES public.admin_users(id),
    expires_at timestamp with time zone,
    is_active boolean DEFAULT true
);

CREATE TABLE IF NOT EXISTS public.polls (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    title character varying(255) NOT NULL,
    description text,
    type public.poll_type DEFAULT 'survey'::public.poll_type NOT NULL,
    status public.poll_status DEFAULT 'draft'::public.poll_status NOT NULL,
    start_at timestamp with time zone,
    end_at timestamp with time zone,
    audience_rules jsonb DEFAULT '{}'::jsonb NOT NULL,
    min_k_anonymity integer DEFAULT 30,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    published_at timestamp with time zone,
    rewards_enabled boolean DEFAULT false,
    reward_amount numeric(18,8),
    reward_token character varying(10) DEFAULT 'DTG'::character varying,
    options jsonb,
    CONSTRAINT check_reward_amount_if_enabled CHECK (((rewards_enabled = false) OR ((rewards_enabled = true) AND (reward_amount > (0)::numeric))))
);

CREATE TABLE IF NOT EXISTS public.device_poll_voters (
    poll_id uuid NOT NULL REFERENCES public.polls(id) ON DELETE CASCADE,
    device_key_hash character(64) NOT NULL,
    voter_hash character(64) NOT NULL,
    first_seen_at timestamp with time zone DEFAULT now(),
    PRIMARY KEY (poll_id, device_key_hash, voter_hash)
);

CREATE TABLE IF NOT EXISTS public.users (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    device_key_thumbprint character(64) UNIQUE,
    risk_score integer DEFAULT 0,
    enrolled_at timestamp with time zone DEFAULT now(),
    last_active_at timestamp with time zone,
    pn_hash text UNIQUE,
    credential_gender text,
    credential_birth_year integer,
    credential_region_codes text[],
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    last_login_at timestamp with time zone DEFAULT now() NOT NULL,
    trust_score double precision DEFAULT 0.0,
    first_name text,
    last_name text,
    pn_masked text,
    notifications_enabled boolean DEFAULT true,
    wallet_address character varying(42),
    credential_dob date,
    CONSTRAINT users_credential_birth_year_check CHECK (((credential_birth_year >= 1900) AND ((credential_birth_year)::numeric <= EXTRACT(year FROM CURRENT_DATE)))),
    CONSTRAINT users_credential_gender_check CHECK ((credential_gender = ANY (ARRAY['M'::text, 'F'::text, 'UNKNOWN'::text])))
);

CREATE TABLE IF NOT EXISTS public.device_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    token text NOT NULL UNIQUE,
    platform text NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    polls_enabled boolean DEFAULT true NOT NULL,
    messages_enabled boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    last_seen_at timestamp with time zone DEFAULT now(),
    CONSTRAINT device_tokens_platform_check CHECK ((platform = ANY (ARRAY['android'::text, 'ios'::text, 'web'::text])))
);

CREATE TABLE IF NOT EXISTS public.enrollment_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    pn_hash text NOT NULL,
    mode character varying(20) NOT NULL,
    step integer DEFAULT 1 NOT NULL,
    status character varying(20) DEFAULT 'in_progress'::character varying NOT NULL,
    nfc_payload jsonb,
    document_payload jsonb,
    nfc_portrait_hash character(64),
    document_portrait_hash character(64),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    liveness_nonce character varying(64),
    CONSTRAINT enrollment_sessions_mode_check CHECK (((mode)::text = ANY ((ARRAY['login'::character varying, 'register'::character varying])::text[]))),
    CONSTRAINT enrollment_sessions_status_check CHECK (((status)::text = ANY ((ARRAY['in_progress'::character varying, 'completed'::character varying, 'failed'::character varying])::text[])))
);

CREATE TABLE IF NOT EXISTS public.geo_blocking_settings (
    key character varying(50) NOT NULL PRIMARY KEY,
    value text NOT NULL,
    updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.idempotency_keys (
    key character varying(255) NOT NULL PRIMARY KEY,
    user_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
    path character varying(255) NOT NULL,
    params jsonb,
    response_code integer,
    response_body jsonb,
    created_at timestamp with time zone DEFAULT now(),
    expires_at timestamp with time zone DEFAULT (now() + '24:00:00'::interval)
);

CREATE TABLE IF NOT EXISTS public.ip_biometric_limits (
    ip_address inet NOT NULL PRIMARY KEY,
    retry_count integer DEFAULT 0 NOT NULL,
    reject_count integer DEFAULT 0 NOT NULL,
    last_attempt_at timestamp with time zone DEFAULT now() NOT NULL,
    locked_until timestamp with time zone,
    lockout_reason text
);

CREATE TABLE IF NOT EXISTS public.messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    title character varying(255) NOT NULL,
    body text DEFAULT ''::text NOT NULL,
    type public.message_type DEFAULT 'announcement'::public.message_type NOT NULL,
    status public.message_status DEFAULT 'draft'::public.message_status NOT NULL,
    audience_rules jsonb DEFAULT '{}'::jsonb NOT NULL,
    publish_at timestamp with time zone,
    expire_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    published_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.poll_options (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    poll_id uuid NOT NULL REFERENCES public.polls(id) ON DELETE CASCADE,
    text character varying(255) NOT NULL,
    display_order integer DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.poll_participants (
    poll_id uuid NOT NULL REFERENCES public.polls(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    participated_at timestamp with time zone DEFAULT now() NOT NULL,
    PRIMARY KEY (poll_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.survey_questions (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    poll_id uuid NOT NULL REFERENCES public.polls(id) ON DELETE CASCADE,
    question_text text NOT NULL,
    question_type text NOT NULL,
    required boolean DEFAULT true,
    display_order integer DEFAULT 0,
    config jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT survey_questions_question_type_check CHECK ((question_type = ANY (ARRAY['single_choice'::text, 'multiple_choice'::text, 'text'::text, 'rating_scale'::text, 'ranked_choice'::text])))
);

CREATE TABLE IF NOT EXISTS public.question_options (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    question_id uuid NOT NULL REFERENCES public.survey_questions(id) ON DELETE CASCADE,
    option_text text NOT NULL,
    display_order integer DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.regions (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    code character varying(50) NOT NULL UNIQUE,
    name_en character varying(255) NOT NULL,
    name_ka character varying(255) NOT NULL,
    parent_region_id uuid REFERENCES public.regions(id) ON DELETE SET NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.security_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
    pn_hash text,
    event_type text NOT NULL,
    result text NOT NULL,
    liveness_score double precision,
    face_match_score double precision,
    reason_code text,
    ip_address inet,
    user_agent text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    meta jsonb,
    CONSTRAINT security_events_event_type_check CHECK ((event_type = ANY (ARRAY['ENROLL'::text, 'LOGIN'::text, 'SESSION_VERIFY'::text, 'LOCKOUT'::text, 'audit_export'::text, 'admin_action'::text]))),
    CONSTRAINT security_events_face_match_score_check CHECK (((face_match_score >= (0)::double precision) AND (face_match_score <= (1)::double precision))),
    CONSTRAINT security_events_liveness_score_check CHECK (((liveness_score >= (0)::double precision) AND (liveness_score <= (1)::double precision))),
    CONSTRAINT security_events_result_check CHECK ((result = ANY (ARRAY['PASS'::text, 'FAIL'::text, 'BLOCKED'::text, 'success'::text, 'error'::text])))
);

CREATE TABLE IF NOT EXISTS public.settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    key text NOT NULL UNIQUE,
    value text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.survey_nullifiers (
    poll_id uuid NOT NULL REFERENCES public.polls(id) ON DELETE CASCADE,
    nullifier_hash character(64) NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    PRIMARY KEY (poll_id, nullifier_hash)
);

CREATE TABLE IF NOT EXISTS public.survey_responses (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    poll_id uuid NOT NULL REFERENCES public.polls(id),
    question_id uuid NOT NULL REFERENCES public.survey_questions(id),
    selected_option_id uuid REFERENCES public.question_options(id),
    selected_option_ids uuid[],
    text_response text,
    rating_value integer,
    ranked_option_ids uuid[],
    demographics_snapshot jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT survey_responses_rating_value_check CHECK (((rating_value >= 1) AND (rating_value <= 10)))
);

CREATE TABLE IF NOT EXISTS public.system_settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    key text NOT NULL UNIQUE,
    value jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.tickets (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
    ticket_number character varying(20) NOT NULL UNIQUE,
    subject character varying(200) NOT NULL,
    message text NOT NULL,
    category public.ticket_category DEFAULT 'general'::public.ticket_category,
    priority public.ticket_priority DEFAULT 'medium'::public.ticket_priority,
    status public.ticket_status DEFAULT 'open'::public.ticket_status,
    assigned_admin_id uuid REFERENCES public.admin_users(id) ON DELETE SET NULL,
    user_email character varying(255),
    user_device_info jsonb,
    attachments jsonb DEFAULT '[]'::jsonb,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    resolved_at timestamp with time zone,
    closed_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.ticket_responses (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    ticket_id uuid NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
    user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
    admin_id uuid REFERENCES public.admin_users(id) ON DELETE SET NULL,
    is_admin boolean DEFAULT false,
    message text NOT NULL,
    attachments jsonb DEFAULT '[]'::jsonb,
    is_internal_note boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.user_rewards (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    device_key_hash character varying(255) NOT NULL,
    poll_id uuid REFERENCES public.polls(id),
    amount numeric(18,8) NOT NULL,
    token_symbol character varying(20) NOT NULL,
    tx_hash character varying(255),
    status character varying(20) DEFAULT 'pending'::character varying,
    created_at timestamp with time zone DEFAULT now(),
    error_message text,
    updated_at timestamp with time zone DEFAULT now(),
    transfer_to character varying(255),
    tx_id character varying(100)
);

CREATE TABLE IF NOT EXISTS public.vote_nullifiers (
    poll_id uuid NOT NULL REFERENCES public.polls(id) ON DELETE CASCADE,
    nullifier_hash character(64) NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    PRIMARY KEY (poll_id, nullifier_hash)
);

CREATE TABLE IF NOT EXISTS public.votes (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    poll_id uuid NOT NULL REFERENCES public.polls(id),
    option_id uuid NOT NULL REFERENCES public.poll_options(id),
    demographics_snapshot jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    bucket_ts timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.vote_attestations (
    vote_id uuid NOT NULL REFERENCES public.votes(id) ON DELETE CASCADE PRIMARY KEY,
    attestation_payload text NOT NULL,
    nonce_used character(64) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.whitelisted_ips (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    ip_address inet NOT NULL UNIQUE,
    ip_range cidr,
    description character varying(255),
    created_at timestamp with time zone DEFAULT now(),
    created_by uuid REFERENCES public.admin_users(id),
    is_active boolean DEFAULT true
);

-- Triggers
CREATE TRIGGER regions_updated_at BEFORE UPDATE ON public.regions FOR EACH ROW EXECUTE FUNCTION public.update_regions_updated_at();
CREATE TRIGGER trigger_set_ticket_number BEFORE INSERT ON public.tickets FOR EACH ROW EXECUTE FUNCTION public.set_ticket_number();
CREATE TRIGGER trigger_update_ticket_on_response AFTER INSERT ON public.ticket_responses FOR EACH ROW EXECUTE FUNCTION public.update_ticket_on_response();
CREATE TRIGGER trigger_update_ticket_timestamp BEFORE UPDATE ON public.tickets FOR EACH ROW EXECUTE FUNCTION public.update_ticket_timestamp();
CREATE TRIGGER update_device_tokens_updated_at BEFORE UPDATE ON public.device_tokens FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Indexes (Explicit non-PK/Unique indexes)
CREATE INDEX IF NOT EXISTS idx_auth_rate_limits_ip ON public.auth_rate_limits(ip_address);
CREATE INDEX IF NOT EXISTS idx_auth_rate_limits_locked_until ON public.auth_rate_limits(locked_until);
CREATE INDEX IF NOT EXISTS idx_auth_rate_limits_pn_hash ON public.auth_rate_limits(pn_hash);
CREATE INDEX IF NOT EXISTS idx_blocked_access_log_country ON public.blocked_access_log(country_code);
CREATE INDEX IF NOT EXISTS idx_blocked_access_log_time ON public.blocked_access_log(attempted_at DESC);
CREATE INDEX IF NOT EXISTS idx_blocked_countries_active ON public.blocked_countries(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_blocked_countries_code ON public.blocked_countries(country_code);
CREATE INDEX IF NOT EXISTS idx_blocked_ips_active ON public.blocked_ips(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_device_poll_voters_lookup ON public.device_poll_voters(poll_id, device_key_hash);
CREATE INDEX IF NOT EXISTS idx_device_tokens_enabled ON public.device_tokens(enabled);
CREATE INDEX IF NOT EXISTS idx_device_tokens_messages_enabled ON public.device_tokens(messages_enabled);
CREATE INDEX IF NOT EXISTS idx_device_tokens_polls_enabled ON public.device_tokens(polls_enabled);
CREATE INDEX IF NOT EXISTS idx_device_tokens_user_id ON public.device_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_enrollment_sessions_expires_at ON public.enrollment_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_enrollment_sessions_pn_hash ON public.enrollment_sessions(pn_hash);
CREATE INDEX IF NOT EXISTS idx_idempotency_keys_expires_at ON public.idempotency_keys(expires_at);
CREATE INDEX IF NOT EXISTS idx_ip_biometric_limits_locked_until ON public.ip_biometric_limits(locked_until);
CREATE INDEX IF NOT EXISTS idx_messages_publish_at ON public.messages(publish_at);
CREATE INDEX IF NOT EXISTS idx_messages_status ON public.messages(status);
CREATE INDEX IF NOT EXISTS idx_nullifiers_hash ON public.vote_nullifiers(nullifier_hash);
CREATE INDEX IF NOT EXISTS idx_poll_participants_user ON public.poll_participants(user_id);
CREATE INDEX IF NOT EXISTS idx_polls_rewards_enabled ON public.polls(rewards_enabled) WHERE rewards_enabled = true;
CREATE INDEX IF NOT EXISTS idx_polls_status ON public.polls(status);
CREATE INDEX IF NOT EXISTS idx_question_options_order ON public.question_options(question_id, display_order);
CREATE INDEX IF NOT EXISTS idx_question_options_question ON public.question_options(question_id);
CREATE INDEX IF NOT EXISTS idx_regions_active ON public.regions(active);
CREATE INDEX IF NOT EXISTS idx_regions_code ON public.regions(code);
CREATE INDEX IF NOT EXISTS idx_regions_name_en ON public.regions(name_en);
CREATE INDEX IF NOT EXISTS idx_regions_parent ON public.regions(parent_region_id);
CREATE INDEX IF NOT EXISTS idx_rewards_device ON public.user_rewards(device_key_hash);
CREATE INDEX IF NOT EXISTS idx_rewards_transfers ON public.user_rewards(device_key_hash, transfer_to) WHERE transfer_to IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_rewards_tx_id ON public.user_rewards(tx_id);
CREATE INDEX IF NOT EXISTS idx_security_events_created_at ON public.security_events(created_at);
CREATE INDEX IF NOT EXISTS idx_security_events_event_type ON public.security_events(event_type);
CREATE INDEX IF NOT EXISTS idx_security_events_pn_hash ON public.security_events(pn_hash);
CREATE INDEX IF NOT EXISTS idx_security_events_result ON public.security_events(result);
CREATE INDEX IF NOT EXISTS idx_security_events_user_id ON public.security_events(user_id);
CREATE INDEX IF NOT EXISTS idx_settings_key ON public.settings(key);
CREATE INDEX IF NOT EXISTS idx_survey_questions_order ON public.survey_questions(poll_id, display_order);
CREATE INDEX IF NOT EXISTS idx_survey_questions_poll ON public.survey_questions(poll_id);
CREATE INDEX IF NOT EXISTS idx_survey_responses_poll ON public.survey_responses(poll_id);
CREATE INDEX IF NOT EXISTS idx_survey_responses_poll_question ON public.survey_responses(poll_id, question_id);
CREATE INDEX IF NOT EXISTS idx_survey_responses_question ON public.survey_responses(question_id);
CREATE INDEX IF NOT EXISTS idx_system_settings_key ON public.system_settings(key);
CREATE INDEX IF NOT EXISTS idx_ticket_responses_ticket_id ON public.ticket_responses(ticket_id);
CREATE INDEX IF NOT EXISTS idx_tickets_assigned_admin ON public.tickets(assigned_admin_id);
CREATE INDEX IF NOT EXISTS idx_tickets_category ON public.tickets(category);
CREATE INDEX IF NOT EXISTS idx_tickets_created_at ON public.tickets(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tickets_priority ON public.tickets(priority);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON public.tickets(status);
CREATE INDEX IF NOT EXISTS idx_tickets_user_id ON public.tickets(user_id);
CREATE INDEX IF NOT EXISTS idx_user_rewards_status ON public.user_rewards(status) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_users_created_at ON public.users(created_at);
CREATE INDEX IF NOT EXISTS idx_users_credential_dob ON public.users(credential_dob);
CREATE INDEX IF NOT EXISTS idx_users_device_key_thumbprint ON public.users(device_key_thumbprint);
CREATE INDEX IF NOT EXISTS idx_users_last_login ON public.users(last_login_at);
CREATE INDEX IF NOT EXISTS idx_users_wallet_address ON public.users(wallet_address);
CREATE INDEX IF NOT EXISTS idx_vote_nullifiers_poll ON public.vote_nullifiers(poll_id);
CREATE INDEX IF NOT EXISTS idx_votes_bucket_ts ON public.votes(bucket_ts);
CREATE INDEX IF NOT EXISTS idx_votes_poll_option ON public.votes(poll_id, option_id);
CREATE INDEX IF NOT EXISTS idx_whitelisted_ips_active ON public.whitelisted_ips(is_active) WHERE is_active = true;
CREATE UNIQUE INDEX IF NOT EXISTS unique_reward_per_poll_device_v2 ON public.user_rewards(poll_id, device_key_hash) WHERE poll_id IS NOT NULL AND transfer_to IS NULL;
