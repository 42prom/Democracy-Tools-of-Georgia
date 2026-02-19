--
-- PostgreSQL database dump
--

\restrict FOfzXunyYxZKd9zOKfGOdaSRTqrgzgctkffZetVmCHqoDalesFfgJDfhpd8WPe0

-- Dumped from database version 15.16
-- Dumped by pg_dump version 15.16

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;


--
-- Name: EXTENSION pgcrypto; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION pgcrypto IS 'cryptographic functions';


--
-- Name: admin_role; Type: TYPE; Schema: public; Owner: dtg_user
--

CREATE TYPE public.admin_role AS ENUM (
    'superadmin',
    'admin',
    'moderator',
    'observer'
);


ALTER TYPE public.admin_role OWNER TO dtg_user;

--
-- Name: audit_severity; Type: TYPE; Schema: public; Owner: dtg_user
--

CREATE TYPE public.audit_severity AS ENUM (
    'info',
    'warning',
    'error',
    'critical'
);


ALTER TYPE public.audit_severity OWNER TO dtg_user;

--
-- Name: message_status; Type: TYPE; Schema: public; Owner: dtg_user
--

CREATE TYPE public.message_status AS ENUM (
    'draft',
    'scheduled',
    'published',
    'archived'
);


ALTER TYPE public.message_status OWNER TO dtg_user;

--
-- Name: message_type; Type: TYPE; Schema: public; Owner: dtg_user
--

CREATE TYPE public.message_type AS ENUM (
    'announcement',
    'alert',
    'reminder'
);


ALTER TYPE public.message_type OWNER TO dtg_user;

--
-- Name: poll_status; Type: TYPE; Schema: public; Owner: dtg_user
--

CREATE TYPE public.poll_status AS ENUM (
    'draft',
    'scheduled',
    'active',
    'ended',
    'archived'
);


ALTER TYPE public.poll_status OWNER TO dtg_user;

--
-- Name: poll_type; Type: TYPE; Schema: public; Owner: dtg_user
--

CREATE TYPE public.poll_type AS ENUM (
    'election',
    'referendum',
    'survey'
);


ALTER TYPE public.poll_type OWNER TO dtg_user;

--
-- Name: ticket_category; Type: TYPE; Schema: public; Owner: dtg_user
--

CREATE TYPE public.ticket_category AS ENUM (
    'general',
    'account',
    'voting',
    'technical',
    'verification',
    'rewards',
    'other'
);


ALTER TYPE public.ticket_category OWNER TO dtg_user;

--
-- Name: ticket_priority; Type: TYPE; Schema: public; Owner: dtg_user
--

CREATE TYPE public.ticket_priority AS ENUM (
    'low',
    'medium',
    'high',
    'urgent'
);


ALTER TYPE public.ticket_priority OWNER TO dtg_user;

--
-- Name: ticket_status; Type: TYPE; Schema: public; Owner: dtg_user
--

CREATE TYPE public.ticket_status AS ENUM (
    'open',
    'in_progress',
    'waiting_user',
    'resolved',
    'closed'
);


ALTER TYPE public.ticket_status OWNER TO dtg_user;

--
-- Name: cleanup_biometric_limits(); Type: FUNCTION; Schema: public; Owner: dtg_user
--

CREATE FUNCTION public.cleanup_biometric_limits() RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
    DELETE FROM ip_biometric_limits
    WHERE last_attempt_at < NOW() - INTERVAL '24 hours'
    AND (locked_until IS NULL OR locked_until < NOW());
END;
$$;


ALTER FUNCTION public.cleanup_biometric_limits() OWNER TO dtg_user;

--
-- Name: cleanup_blocked_access_log(integer); Type: FUNCTION; Schema: public; Owner: dtg_user
--

CREATE FUNCTION public.cleanup_blocked_access_log(retention_days integer DEFAULT 30) RETURNS integer
    LANGUAGE plpgsql
    AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM blocked_access_log
    WHERE attempted_at < NOW() - (retention_days || ' days')::INTERVAL;
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$;


ALTER FUNCTION public.cleanup_blocked_access_log(retention_days integer) OWNER TO dtg_user;

--
-- Name: cleanup_old_rate_limits(); Type: FUNCTION; Schema: public; Owner: dtg_user
--

CREATE FUNCTION public.cleanup_old_rate_limits() RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
    DELETE FROM auth_rate_limits
    WHERE last_attempt_at < NOW() - INTERVAL '24 hours'
    AND (locked_until IS NULL OR locked_until < NOW());
END;
$$;


ALTER FUNCTION public.cleanup_old_rate_limits() OWNER TO dtg_user;

--
-- Name: generate_ticket_number(); Type: FUNCTION; Schema: public; Owner: dtg_user
--

CREATE FUNCTION public.generate_ticket_number() RETURNS text
    LANGUAGE plpgsql
    AS $$
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


ALTER FUNCTION public.generate_ticket_number() OWNER TO dtg_user;

--
-- Name: set_ticket_number(); Type: FUNCTION; Schema: public; Owner: dtg_user
--

CREATE FUNCTION public.set_ticket_number() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.ticket_number IS NULL OR NEW.ticket_number = '' THEN
    NEW.ticket_number := generate_ticket_number();
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION public.set_ticket_number() OWNER TO dtg_user;

--
-- Name: update_regions_updated_at(); Type: FUNCTION; Schema: public; Owner: dtg_user
--

CREATE FUNCTION public.update_regions_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION public.update_regions_updated_at() OWNER TO dtg_user;

--
-- Name: update_ticket_on_response(); Type: FUNCTION; Schema: public; Owner: dtg_user
--

CREATE FUNCTION public.update_ticket_on_response() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  UPDATE tickets SET updated_at = NOW() WHERE id = NEW.ticket_id;
  RETURN NEW;
END;
$$;


ALTER FUNCTION public.update_ticket_on_response() OWNER TO dtg_user;

--
-- Name: update_ticket_timestamp(); Type: FUNCTION; Schema: public; Owner: dtg_user
--

CREATE FUNCTION public.update_ticket_timestamp() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION public.update_ticket_timestamp() OWNER TO dtg_user;

--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: dtg_user
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;


ALTER FUNCTION public.update_updated_at_column() OWNER TO dtg_user;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: admin_users; Type: TABLE; Schema: public; Owner: dtg_user
--

CREATE TABLE public.admin_users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email character varying(255) NOT NULL,
    password_hash character varying(255) NOT NULL,
    role public.admin_role DEFAULT 'admin'::public.admin_role NOT NULL,
    full_name character varying(100),
    last_login_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.admin_users OWNER TO dtg_user;

--
-- Name: auth_rate_limits; Type: TABLE; Schema: public; Owner: dtg_user
--

CREATE TABLE public.auth_rate_limits (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    pn_hash text NOT NULL,
    ip_address inet NOT NULL,
    attempt_count integer DEFAULT 1 NOT NULL,
    last_attempt_at timestamp with time zone DEFAULT now() NOT NULL,
    locked_until timestamp with time zone
);


ALTER TABLE public.auth_rate_limits OWNER TO dtg_user;

--
-- Name: TABLE auth_rate_limits; Type: COMMENT; Schema: public; Owner: dtg_user
--

COMMENT ON TABLE public.auth_rate_limits IS 'Rate limiting and lockout tracking';


--
-- Name: blocked_access_log; Type: TABLE; Schema: public; Owner: dtg_user
--

CREATE TABLE public.blocked_access_log (
    id bigint NOT NULL,
    ip_address inet NOT NULL,
    country_code character(2),
    country_name character varying(100),
    block_type character varying(20) NOT NULL,
    endpoint character varying(255),
    user_agent text,
    attempted_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.blocked_access_log OWNER TO dtg_user;

--
-- Name: blocked_access_log_id_seq; Type: SEQUENCE; Schema: public; Owner: dtg_user
--

CREATE SEQUENCE public.blocked_access_log_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.blocked_access_log_id_seq OWNER TO dtg_user;

--
-- Name: blocked_access_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: dtg_user
--

ALTER SEQUENCE public.blocked_access_log_id_seq OWNED BY public.blocked_access_log.id;


--
-- Name: blocked_countries; Type: TABLE; Schema: public; Owner: dtg_user
--

CREATE TABLE public.blocked_countries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    country_code character(2) NOT NULL,
    country_name character varying(100) NOT NULL,
    block_reason character varying(255),
    blocked_at timestamp with time zone DEFAULT now(),
    blocked_by uuid,
    is_active boolean DEFAULT true
);


ALTER TABLE public.blocked_countries OWNER TO dtg_user;

--
-- Name: blocked_ips; Type: TABLE; Schema: public; Owner: dtg_user
--

CREATE TABLE public.blocked_ips (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ip_address inet NOT NULL,
    ip_range cidr,
    block_reason character varying(255),
    blocked_at timestamp with time zone DEFAULT now(),
    blocked_by uuid,
    expires_at timestamp with time zone,
    is_active boolean DEFAULT true
);


ALTER TABLE public.blocked_ips OWNER TO dtg_user;

--
-- Name: device_poll_voters; Type: TABLE; Schema: public; Owner: dtg_user
--

CREATE TABLE public.device_poll_voters (
    poll_id uuid NOT NULL,
    device_key_hash character(64) NOT NULL,
    voter_hash character(64) NOT NULL,
    first_seen_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.device_poll_voters OWNER TO dtg_user;

--
-- Name: device_tokens; Type: TABLE; Schema: public; Owner: dtg_user
--

CREATE TABLE public.device_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    token text NOT NULL,
    platform text NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    polls_enabled boolean DEFAULT true NOT NULL,
    messages_enabled boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    last_seen_at timestamp with time zone DEFAULT now(),
    CONSTRAINT device_tokens_platform_check CHECK ((platform = ANY (ARRAY['android'::text, 'ios'::text, 'web'::text])))
);


ALTER TABLE public.device_tokens OWNER TO dtg_user;

--
-- Name: enrollment_sessions; Type: TABLE; Schema: public; Owner: dtg_user
--

CREATE TABLE public.enrollment_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
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


ALTER TABLE public.enrollment_sessions OWNER TO dtg_user;

--
-- Name: geo_blocking_settings; Type: TABLE; Schema: public; Owner: dtg_user
--

CREATE TABLE public.geo_blocking_settings (
    key character varying(50) NOT NULL,
    value text NOT NULL,
    updated_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.geo_blocking_settings OWNER TO dtg_user;

--
-- Name: idempotency_keys; Type: TABLE; Schema: public; Owner: dtg_user
--

CREATE TABLE public.idempotency_keys (
    key character varying(255) NOT NULL,
    user_id uuid,
    path character varying(255) NOT NULL,
    params jsonb,
    response_code integer,
    response_body jsonb,
    created_at timestamp with time zone DEFAULT now(),
    expires_at timestamp with time zone DEFAULT (now() + '24:00:00'::interval)
);


ALTER TABLE public.idempotency_keys OWNER TO dtg_user;

--
-- Name: ip_biometric_limits; Type: TABLE; Schema: public; Owner: dtg_user
--

CREATE TABLE public.ip_biometric_limits (
    ip_address inet NOT NULL,
    retry_count integer DEFAULT 0 NOT NULL,
    reject_count integer DEFAULT 0 NOT NULL,
    last_attempt_at timestamp with time zone DEFAULT now() NOT NULL,
    locked_until timestamp with time zone,
    lockout_reason text
);


ALTER TABLE public.ip_biometric_limits OWNER TO dtg_user;

--
-- Name: messages; Type: TABLE; Schema: public; Owner: dtg_user
--

CREATE TABLE public.messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
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


ALTER TABLE public.messages OWNER TO dtg_user;

--
-- Name: poll_options; Type: TABLE; Schema: public; Owner: dtg_user
--

CREATE TABLE public.poll_options (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    poll_id uuid NOT NULL,
    text character varying(255) NOT NULL,
    display_order integer DEFAULT 0
);


ALTER TABLE public.poll_options OWNER TO dtg_user;

--
-- Name: poll_participants; Type: TABLE; Schema: public; Owner: dtg_user
--

CREATE TABLE public.poll_participants (
    poll_id uuid NOT NULL,
    user_id uuid NOT NULL,
    participated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.poll_participants OWNER TO dtg_user;

--
-- Name: polls; Type: TABLE; Schema: public; Owner: dtg_user
--

CREATE TABLE public.polls (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
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


ALTER TABLE public.polls OWNER TO dtg_user;

--
-- Name: COLUMN polls.rewards_enabled; Type: COMMENT; Schema: public; Owner: dtg_user
--

COMMENT ON COLUMN public.polls.rewards_enabled IS 'Whether voters receive a reward for participating in this poll';


--
-- Name: COLUMN polls.reward_amount; Type: COMMENT; Schema: public; Owner: dtg_user
--

COMMENT ON COLUMN public.polls.reward_amount IS 'Amount of tokens rewarded per vote (if rewards_enabled is true)';


--
-- Name: COLUMN polls.reward_token; Type: COMMENT; Schema: public; Owner: dtg_user
--

COMMENT ON COLUMN public.polls.reward_token IS 'Token symbol for the reward (e.g., DTG, ETH, USDC)';


--
-- Name: question_options; Type: TABLE; Schema: public; Owner: dtg_user
--

CREATE TABLE public.question_options (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    question_id uuid NOT NULL,
    option_text text NOT NULL,
    display_order integer DEFAULT 0
);


ALTER TABLE public.question_options OWNER TO dtg_user;

--
-- Name: regions; Type: TABLE; Schema: public; Owner: dtg_user
--

CREATE TABLE public.regions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code character varying(50) NOT NULL,
    name_en character varying(255) NOT NULL,
    name_ka character varying(255) NOT NULL,
    parent_region_id uuid,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.regions OWNER TO dtg_user;

--
-- Name: TABLE regions; Type: COMMENT; Schema: public; Owner: dtg_user
--

COMMENT ON TABLE public.regions IS 'Administrative regions for poll audience targeting';


--
-- Name: COLUMN regions.code; Type: COMMENT; Schema: public; Owner: dtg_user
--

COMMENT ON COLUMN public.regions.code IS 'Unique region code (e.g., reg_tbilisi)';


--
-- Name: COLUMN regions.name_en; Type: COMMENT; Schema: public; Owner: dtg_user
--

COMMENT ON COLUMN public.regions.name_en IS 'Region name in English';


--
-- Name: COLUMN regions.name_ka; Type: COMMENT; Schema: public; Owner: dtg_user
--

COMMENT ON COLUMN public.regions.name_ka IS 'Region name in Georgian';


--
-- Name: COLUMN regions.parent_region_id; Type: COMMENT; Schema: public; Owner: dtg_user
--

COMMENT ON COLUMN public.regions.parent_region_id IS 'Parent region for hierarchical regions';


--
-- Name: COLUMN regions.active; Type: COMMENT; Schema: public; Owner: dtg_user
--

COMMENT ON COLUMN public.regions.active IS 'Whether region is active and can be used in polls';


--
-- Name: schema_migrations; Type: TABLE; Schema: public; Owner: dtg_user
--

CREATE TABLE public.schema_migrations (
    version integer NOT NULL,
    filename character varying(255) NOT NULL,
    applied_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.schema_migrations OWNER TO dtg_user;

--
-- Name: security_events; Type: TABLE; Schema: public; Owner: dtg_user
--

CREATE TABLE public.security_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
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


ALTER TABLE public.security_events OWNER TO dtg_user;

--
-- Name: TABLE security_events; Type: COMMENT; Schema: public; Owner: dtg_user
--

COMMENT ON TABLE public.security_events IS 'Audit log for all authentication events';


--
-- Name: COLUMN security_events.meta; Type: COMMENT; Schema: public; Owner: dtg_user
--

COMMENT ON COLUMN public.security_events.meta IS 'Additional event metadata as JSONB (export details, etc)';


--
-- Name: settings; Type: TABLE; Schema: public; Owner: dtg_user
--

CREATE TABLE public.settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    key text NOT NULL,
    value text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.settings OWNER TO dtg_user;

--
-- Name: TABLE settings; Type: COMMENT; Schema: public; Owner: dtg_user
--

COMMENT ON TABLE public.settings IS 'System configuration key-value store';


--
-- Name: COLUMN settings.key; Type: COMMENT; Schema: public; Owner: dtg_user
--

COMMENT ON COLUMN public.settings.key IS 'Unique setting key';


--
-- Name: COLUMN settings.value; Type: COMMENT; Schema: public; Owner: dtg_user
--

COMMENT ON COLUMN public.settings.value IS 'Setting value (may be encrypted for sensitive data)';


--
-- Name: survey_nullifiers; Type: TABLE; Schema: public; Owner: dtg_user
--

CREATE TABLE public.survey_nullifiers (
    poll_id uuid NOT NULL,
    nullifier_hash character(64) NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.survey_nullifiers OWNER TO dtg_user;

--
-- Name: TABLE survey_nullifiers; Type: COMMENT; Schema: public; Owner: dtg_user
--

COMMENT ON TABLE public.survey_nullifiers IS 'Prevents double survey submission per user per poll';


--
-- Name: survey_questions; Type: TABLE; Schema: public; Owner: dtg_user
--

CREATE TABLE public.survey_questions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    poll_id uuid NOT NULL,
    question_text text NOT NULL,
    question_type text NOT NULL,
    required boolean DEFAULT true,
    display_order integer DEFAULT 0,
    config jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT survey_questions_question_type_check CHECK ((question_type = ANY (ARRAY['single_choice'::text, 'multiple_choice'::text, 'text'::text, 'rating_scale'::text, 'ranked_choice'::text])))
);


ALTER TABLE public.survey_questions OWNER TO dtg_user;

--
-- Name: TABLE survey_questions; Type: COMMENT; Schema: public; Owner: dtg_user
--

COMMENT ON TABLE public.survey_questions IS 'Multi-question survey support with different question types';


--
-- Name: COLUMN survey_questions.question_type; Type: COMMENT; Schema: public; Owner: dtg_user
--

COMMENT ON COLUMN public.survey_questions.question_type IS 'single_choice, multiple_choice, text, rating_scale, ranked_choice';


--
-- Name: COLUMN survey_questions.config; Type: COMMENT; Schema: public; Owner: dtg_user
--

COMMENT ON COLUMN public.survey_questions.config IS 'Type-specific config: rating_scale={min,max,minLabel,maxLabel}, text={maxLength,placeholder}';


--
-- Name: survey_responses; Type: TABLE; Schema: public; Owner: dtg_user
--

CREATE TABLE public.survey_responses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    poll_id uuid NOT NULL,
    question_id uuid NOT NULL,
    selected_option_id uuid,
    selected_option_ids uuid[],
    text_response text,
    rating_value integer,
    ranked_option_ids uuid[],
    demographics_snapshot jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT survey_responses_rating_value_check CHECK (((rating_value >= 1) AND (rating_value <= 10)))
);


ALTER TABLE public.survey_responses OWNER TO dtg_user;

--
-- Name: TABLE survey_responses; Type: COMMENT; Schema: public; Owner: dtg_user
--

COMMENT ON TABLE public.survey_responses IS 'Anonymous survey responses - same privacy model as votes';


--
-- Name: system_settings; Type: TABLE; Schema: public; Owner: dtg_user
--

CREATE TABLE public.system_settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    key text NOT NULL,
    value jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.system_settings OWNER TO dtg_user;

--
-- Name: TABLE system_settings; Type: COMMENT; Schema: public; Owner: dtg_user
--

COMMENT ON TABLE public.system_settings IS 'System configuration with JSONB values for structured settings';


--
-- Name: COLUMN system_settings.key; Type: COMMENT; Schema: public; Owner: dtg_user
--

COMMENT ON COLUMN public.system_settings.key IS 'Unique setting key';


--
-- Name: COLUMN system_settings.value; Type: COMMENT; Schema: public; Owner: dtg_user
--

COMMENT ON COLUMN public.system_settings.value IS 'JSONB structured setting value';


--
-- Name: ticket_responses; Type: TABLE; Schema: public; Owner: dtg_user
--

CREATE TABLE public.ticket_responses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ticket_id uuid NOT NULL,
    user_id uuid,
    admin_id uuid,
    is_admin boolean DEFAULT false,
    message text NOT NULL,
    attachments jsonb DEFAULT '[]'::jsonb,
    is_internal_note boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.ticket_responses OWNER TO dtg_user;

--
-- Name: tickets; Type: TABLE; Schema: public; Owner: dtg_user
--

CREATE TABLE public.tickets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    ticket_number character varying(20) NOT NULL,
    subject character varying(200) NOT NULL,
    message text NOT NULL,
    category public.ticket_category DEFAULT 'general'::public.ticket_category,
    priority public.ticket_priority DEFAULT 'medium'::public.ticket_priority,
    status public.ticket_status DEFAULT 'open'::public.ticket_status,
    assigned_admin_id uuid,
    user_email character varying(255),
    user_device_info jsonb,
    attachments jsonb DEFAULT '[]'::jsonb,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    resolved_at timestamp with time zone,
    closed_at timestamp with time zone
);


ALTER TABLE public.tickets OWNER TO dtg_user;

--
-- Name: user_rewards; Type: TABLE; Schema: public; Owner: dtg_user
--

CREATE TABLE public.user_rewards (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    device_key_hash character varying(255) NOT NULL,
    poll_id uuid,
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


ALTER TABLE public.user_rewards OWNER TO dtg_user;

--
-- Name: users; Type: TABLE; Schema: public; Owner: dtg_user
--

CREATE TABLE public.users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    device_key_thumbprint character(64),
    risk_score integer DEFAULT 0,
    enrolled_at timestamp with time zone DEFAULT now(),
    last_active_at timestamp with time zone,
    pn_hash text,
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


ALTER TABLE public.users OWNER TO dtg_user;

--
-- Name: TABLE users; Type: COMMENT; Schema: public; Owner: dtg_user
--

COMMENT ON TABLE public.users IS 'Privacy-safe user table with no PII, only hashed identifiers';


--
-- Name: COLUMN users.device_key_thumbprint; Type: COMMENT; Schema: public; Owner: dtg_user
--

COMMENT ON COLUMN public.users.device_key_thumbprint IS 'Legacy device key thumbprint - nullable for pn_hash based enrollment';


--
-- Name: COLUMN users.pn_hash; Type: COMMENT; Schema: public; Owner: dtg_user
--

COMMENT ON COLUMN public.users.pn_hash IS 'HMAC hash of personal number - never store raw PN';


--
-- Name: COLUMN users.credential_dob; Type: COMMENT; Schema: public; Owner: dtg_user
--

COMMENT ON COLUMN public.users.credential_dob IS 'Full date of birth from ID document for exact age calculation';


--
-- Name: vote_attestations; Type: TABLE; Schema: public; Owner: dtg_user
--

CREATE TABLE public.vote_attestations (
    vote_id uuid NOT NULL,
    attestation_payload text NOT NULL,
    nonce_used character(64) NOT NULL
);


ALTER TABLE public.vote_attestations OWNER TO dtg_user;

--
-- Name: vote_nullifiers; Type: TABLE; Schema: public; Owner: dtg_user
--

CREATE TABLE public.vote_nullifiers (
    poll_id uuid NOT NULL,
    nullifier_hash character(64) NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.vote_nullifiers OWNER TO dtg_user;

--
-- Name: votes; Type: TABLE; Schema: public; Owner: dtg_user
--

CREATE TABLE public.votes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    poll_id uuid NOT NULL,
    option_id uuid NOT NULL,
    demographics_snapshot jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    bucket_ts timestamp with time zone DEFAULT now()
);


ALTER TABLE public.votes OWNER TO dtg_user;

--
-- Name: whitelisted_ips; Type: TABLE; Schema: public; Owner: dtg_user
--

CREATE TABLE public.whitelisted_ips (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ip_address inet NOT NULL,
    ip_range cidr,
    description character varying(255),
    created_at timestamp with time zone DEFAULT now(),
    created_by uuid,
    is_active boolean DEFAULT true
);


ALTER TABLE public.whitelisted_ips OWNER TO dtg_user;

--
-- Name: blocked_access_log id; Type: DEFAULT; Schema: public; Owner: dtg_user
--

ALTER TABLE ONLY public.blocked_access_log ALTER COLUMN id SET DEFAULT nextval('public.blocked_access_log_id_seq'::regclass);


--
-- Name: admin_users admin_users_email_key; Type: CONSTRAINT; Schema: public; Owner: dtg_user
--

ALTER TABLE ONLY public.admin_users
    ADD CONSTRAINT admin_users_email_key UNIQUE (email);


--
-- Name: admin_users admin_users_pkey; Type: CONSTRAINT; Schema: public; Owner: dtg_user
--

ALTER TABLE ONLY public.admin_users
    ADD CONSTRAINT admin_users_pkey PRIMARY KEY (id);


--
-- Name: auth_rate_limits auth_rate_limits_pkey; Type: CONSTRAINT; Schema: public; Owner: dtg_user
--

ALTER TABLE ONLY public.auth_rate_limits
    ADD CONSTRAINT auth_rate_limits_pkey PRIMARY KEY (id);


--
-- Name: blocked_access_log blocked_access_log_pkey; Type: CONSTRAINT; Schema: public; Owner: dtg_user
--

ALTER TABLE ONLY public.blocked_access_log
    ADD CONSTRAINT blocked_access_log_pkey PRIMARY KEY (id);


--
-- Name: blocked_countries blocked_countries_country_code_key; Type: CONSTRAINT; Schema: public; Owner: dtg_user
--

ALTER TABLE ONLY public.blocked_countries
    ADD CONSTRAINT blocked_countries_country_code_key UNIQUE (country_code);


--
-- Name: blocked_countries blocked_countries_pkey; Type: CONSTRAINT; Schema: public; Owner: dtg_user
--

ALTER TABLE ONLY public.blocked_countries
    ADD CONSTRAINT blocked_countries_pkey PRIMARY KEY (id);


--
-- Name: blocked_ips blocked_ips_ip_address_key; Type: CONSTRAINT; Schema: public; Owner: dtg_user
--

ALTER TABLE ONLY public.blocked_ips
    ADD CONSTRAINT blocked_ips_ip_address_key UNIQUE (ip_address);


--
-- Name: blocked_ips blocked_ips_pkey; Type: CONSTRAINT; Schema: public; Owner: dtg_user
--

ALTER TABLE ONLY public.blocked_ips
    ADD CONSTRAINT blocked_ips_pkey PRIMARY KEY (id);


--
-- Name: device_poll_voters device_poll_voters_pkey; Type: CONSTRAINT; Schema: public; Owner: dtg_user
--

ALTER TABLE ONLY public.device_poll_voters
    ADD CONSTRAINT device_poll_voters_pkey PRIMARY KEY (poll_id, device_key_hash, voter_hash);


--
-- Name: device_tokens device_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: dtg_user
--

ALTER TABLE ONLY public.device_tokens
    ADD CONSTRAINT device_tokens_pkey PRIMARY KEY (id);


--
-- Name: device_tokens device_tokens_token_key; Type: CONSTRAINT; Schema: public; Owner: dtg_user
--

ALTER TABLE ONLY public.device_tokens
    ADD CONSTRAINT device_tokens_token_key UNIQUE (token);


--
-- Name: enrollment_sessions enrollment_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: dtg_user
--

ALTER TABLE ONLY public.enrollment_sessions
    ADD CONSTRAINT enrollment_sessions_pkey PRIMARY KEY (id);


--
-- Name: geo_blocking_settings geo_blocking_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: dtg_user
--

ALTER TABLE ONLY public.geo_blocking_settings
    ADD CONSTRAINT geo_blocking_settings_pkey PRIMARY KEY (key);


--
-- Name: idempotency_keys idempotency_keys_pkey; Type: CONSTRAINT; Schema: public; Owner: dtg_user
--

ALTER TABLE ONLY public.idempotency_keys
    ADD CONSTRAINT idempotency_keys_pkey PRIMARY KEY (key);


--
-- Name: ip_biometric_limits ip_biometric_limits_pkey; Type: CONSTRAINT; Schema: public; Owner: dtg_user
--

ALTER TABLE ONLY public.ip_biometric_limits
    ADD CONSTRAINT ip_biometric_limits_pkey PRIMARY KEY (ip_address);


--
-- Name: messages messages_pkey; Type: CONSTRAINT; Schema: public; Owner: dtg_user
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_pkey PRIMARY KEY (id);


--
-- Name: poll_options poll_options_pkey; Type: CONSTRAINT; Schema: public; Owner: dtg_user
--

ALTER TABLE ONLY public.poll_options
    ADD CONSTRAINT poll_options_pkey PRIMARY KEY (id);


--
-- Name: poll_participants poll_participants_pkey; Type: CONSTRAINT; Schema: public; Owner: dtg_user
--

ALTER TABLE ONLY public.poll_participants
    ADD CONSTRAINT poll_participants_pkey PRIMARY KEY (poll_id, user_id);


--
-- Name: polls polls_pkey; Type: CONSTRAINT; Schema: public; Owner: dtg_user
--

ALTER TABLE ONLY public.polls
    ADD CONSTRAINT polls_pkey PRIMARY KEY (id);


--
-- Name: question_options question_options_pkey; Type: CONSTRAINT; Schema: public; Owner: dtg_user
--

ALTER TABLE ONLY public.question_options
    ADD CONSTRAINT question_options_pkey PRIMARY KEY (id);


--
-- Name: regions regions_code_key; Type: CONSTRAINT; Schema: public; Owner: dtg_user
--

ALTER TABLE ONLY public.regions
    ADD CONSTRAINT regions_code_key UNIQUE (code);


--
-- Name: regions regions_pkey; Type: CONSTRAINT; Schema: public; Owner: dtg_user
--

ALTER TABLE ONLY public.regions
    ADD CONSTRAINT regions_pkey PRIMARY KEY (id);


--
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: dtg_user
--

ALTER TABLE ONLY public.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (version);


--
-- Name: security_events security_events_pkey; Type: CONSTRAINT; Schema: public; Owner: dtg_user
--

ALTER TABLE ONLY public.security_events
    ADD CONSTRAINT security_events_pkey PRIMARY KEY (id);


--
-- Name: settings settings_key_key; Type: CONSTRAINT; Schema: public; Owner: dtg_user
--

ALTER TABLE ONLY public.settings
    ADD CONSTRAINT settings_key_key UNIQUE (key);


--
-- Name: settings settings_pkey; Type: CONSTRAINT; Schema: public; Owner: dtg_user
--

ALTER TABLE ONLY public.settings
    ADD CONSTRAINT settings_pkey PRIMARY KEY (id);


--
-- Name: survey_nullifiers survey_nullifiers_pkey; Type: CONSTRAINT; Schema: public; Owner: dtg_user
--

ALTER TABLE ONLY public.survey_nullifiers
    ADD CONSTRAINT survey_nullifiers_pkey PRIMARY KEY (poll_id, nullifier_hash);


--
-- Name: survey_questions survey_questions_pkey; Type: CONSTRAINT; Schema: public; Owner: dtg_user
--

ALTER TABLE ONLY public.survey_questions
    ADD CONSTRAINT survey_questions_pkey PRIMARY KEY (id);


--
-- Name: survey_responses survey_responses_pkey; Type: CONSTRAINT; Schema: public; Owner: dtg_user
--

ALTER TABLE ONLY public.survey_responses
    ADD CONSTRAINT survey_responses_pkey PRIMARY KEY (id);


--
-- Name: system_settings system_settings_key_key; Type: CONSTRAINT; Schema: public; Owner: dtg_user
--

ALTER TABLE ONLY public.system_settings
    ADD CONSTRAINT system_settings_key_key UNIQUE (key);


--
-- Name: system_settings system_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: dtg_user
--

ALTER TABLE ONLY public.system_settings
    ADD CONSTRAINT system_settings_pkey PRIMARY KEY (id);


--
-- Name: ticket_responses ticket_responses_pkey; Type: CONSTRAINT; Schema: public; Owner: dtg_user
--

ALTER TABLE ONLY public.ticket_responses
    ADD CONSTRAINT ticket_responses_pkey PRIMARY KEY (id);


--
-- Name: tickets tickets_pkey; Type: CONSTRAINT; Schema: public; Owner: dtg_user
--

ALTER TABLE ONLY public.tickets
    ADD CONSTRAINT tickets_pkey PRIMARY KEY (id);


--
-- Name: tickets tickets_ticket_number_key; Type: CONSTRAINT; Schema: public; Owner: dtg_user
--

ALTER TABLE ONLY public.tickets
    ADD CONSTRAINT tickets_ticket_number_key UNIQUE (ticket_number);


--
-- Name: auth_rate_limits unique_pn_hash_ip; Type: CONSTRAINT; Schema: public; Owner: dtg_user
--

ALTER TABLE ONLY public.auth_rate_limits
    ADD CONSTRAINT unique_pn_hash_ip UNIQUE (pn_hash, ip_address);


--
-- Name: user_rewards user_rewards_pkey; Type: CONSTRAINT; Schema: public; Owner: dtg_user
--

ALTER TABLE ONLY public.user_rewards
    ADD CONSTRAINT user_rewards_pkey PRIMARY KEY (id);


--
-- Name: users users_device_key_thumbprint_key; Type: CONSTRAINT; Schema: public; Owner: dtg_user
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_device_key_thumbprint_key UNIQUE (device_key_thumbprint);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: dtg_user
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: users users_pn_hash_key; Type: CONSTRAINT; Schema: public; Owner: dtg_user
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pn_hash_key UNIQUE (pn_hash);


--
-- Name: vote_attestations vote_attestations_pkey; Type: CONSTRAINT; Schema: public; Owner: dtg_user
--

ALTER TABLE ONLY public.vote_attestations
    ADD CONSTRAINT vote_attestations_pkey PRIMARY KEY (vote_id);


--
-- Name: vote_nullifiers vote_nullifiers_pkey; Type: CONSTRAINT; Schema: public; Owner: dtg_user
--

ALTER TABLE ONLY public.vote_nullifiers
    ADD CONSTRAINT vote_nullifiers_pkey PRIMARY KEY (poll_id, nullifier_hash);


--
-- Name: votes votes_pkey; Type: CONSTRAINT; Schema: public; Owner: dtg_user
--

ALTER TABLE ONLY public.votes
    ADD CONSTRAINT votes_pkey PRIMARY KEY (id);


--
-- Name: whitelisted_ips whitelisted_ips_ip_address_key; Type: CONSTRAINT; Schema: public; Owner: dtg_user
--

ALTER TABLE ONLY public.whitelisted_ips
    ADD CONSTRAINT whitelisted_ips_ip_address_key UNIQUE (ip_address);


--
-- Name: whitelisted_ips whitelisted_ips_pkey; Type: CONSTRAINT; Schema: public; Owner: dtg_user
--

ALTER TABLE ONLY public.whitelisted_ips
    ADD CONSTRAINT whitelisted_ips_pkey PRIMARY KEY (id);


--
-- Name: idx_auth_rate_limits_ip; Type: INDEX; Schema: public; Owner: dtg_user
--

CREATE INDEX idx_auth_rate_limits_ip ON public.auth_rate_limits USING btree (ip_address);


--
-- Name: idx_auth_rate_limits_locked_until; Type: INDEX; Schema: public; Owner: dtg_user
--

CREATE INDEX idx_auth_rate_limits_locked_until ON public.auth_rate_limits USING btree (locked_until);


--
-- Name: idx_auth_rate_limits_pn_hash; Type: INDEX; Schema: public; Owner: dtg_user
--

CREATE INDEX idx_auth_rate_limits_pn_hash ON public.auth_rate_limits USING btree (pn_hash);


--
-- Name: idx_blocked_access_log_country; Type: INDEX; Schema: public; Owner: dtg_user
--

CREATE INDEX idx_blocked_access_log_country ON public.blocked_access_log USING btree (country_code);


--
-- Name: idx_blocked_access_log_time; Type: INDEX; Schema: public; Owner: dtg_user
--

CREATE INDEX idx_blocked_access_log_time ON public.blocked_access_log USING btree (attempted_at DESC);


--
-- Name: idx_blocked_countries_active; Type: INDEX; Schema: public; Owner: dtg_user
--

CREATE INDEX idx_blocked_countries_active ON public.blocked_countries USING btree (is_active) WHERE (is_active = true);


--
-- Name: idx_blocked_countries_code; Type: INDEX; Schema: public; Owner: dtg_user
--

CREATE INDEX idx_blocked_countries_code ON public.blocked_countries USING btree (country_code);


--
-- Name: idx_blocked_ips_active; Type: INDEX; Schema: public; Owner: dtg_user
--

CREATE INDEX idx_blocked_ips_active ON public.blocked_ips USING btree (is_active) WHERE (is_active = true);


--
-- Name: idx_device_poll_voters_lookup; Type: INDEX; Schema: public; Owner: dtg_user
--

CREATE INDEX idx_device_poll_voters_lookup ON public.device_poll_voters USING btree (poll_id, device_key_hash);


--
-- Name: idx_device_tokens_enabled; Type: INDEX; Schema: public; Owner: dtg_user
--

CREATE INDEX idx_device_tokens_enabled ON public.device_tokens USING btree (enabled);


--
-- Name: idx_device_tokens_messages_enabled; Type: INDEX; Schema: public; Owner: dtg_user
--

CREATE INDEX idx_device_tokens_messages_enabled ON public.device_tokens USING btree (messages_enabled);


--
-- Name: idx_device_tokens_polls_enabled; Type: INDEX; Schema: public; Owner: dtg_user
--

CREATE INDEX idx_device_tokens_polls_enabled ON public.device_tokens USING btree (polls_enabled);


--
-- Name: idx_device_tokens_user_id; Type: INDEX; Schema: public; Owner: dtg_user
--

CREATE INDEX idx_device_tokens_user_id ON public.device_tokens USING btree (user_id);


--
-- Name: idx_enrollment_sessions_expires_at; Type: INDEX; Schema: public; Owner: dtg_user
--

CREATE INDEX idx_enrollment_sessions_expires_at ON public.enrollment_sessions USING btree (expires_at);


--
-- Name: idx_enrollment_sessions_pn_hash; Type: INDEX; Schema: public; Owner: dtg_user
--

CREATE INDEX idx_enrollment_sessions_pn_hash ON public.enrollment_sessions USING btree (pn_hash);


--
-- Name: idx_idempotency_keys_expires_at; Type: INDEX; Schema: public; Owner: dtg_user
--

CREATE INDEX idx_idempotency_keys_expires_at ON public.idempotency_keys USING btree (expires_at);


--
-- Name: idx_ip_biometric_limits_locked_until; Type: INDEX; Schema: public; Owner: dtg_user
--

CREATE INDEX idx_ip_biometric_limits_locked_until ON public.ip_biometric_limits USING btree (locked_until);


--
-- Name: idx_messages_publish_at; Type: INDEX; Schema: public; Owner: dtg_user
--

CREATE INDEX idx_messages_publish_at ON public.messages USING btree (publish_at);


--
-- Name: idx_messages_status; Type: INDEX; Schema: public; Owner: dtg_user
--

CREATE INDEX idx_messages_status ON public.messages USING btree (status);


--
-- Name: idx_nullifiers_hash; Type: INDEX; Schema: public; Owner: dtg_user
--

CREATE INDEX idx_nullifiers_hash ON public.vote_nullifiers USING btree (nullifier_hash);


--
-- Name: idx_poll_participants_user; Type: INDEX; Schema: public; Owner: dtg_user
--

CREATE INDEX idx_poll_participants_user ON public.poll_participants USING btree (user_id);


--
-- Name: idx_polls_rewards_enabled; Type: INDEX; Schema: public; Owner: dtg_user
--

CREATE INDEX idx_polls_rewards_enabled ON public.polls USING btree (rewards_enabled) WHERE (rewards_enabled = true);


--
-- Name: idx_polls_status; Type: INDEX; Schema: public; Owner: dtg_user
--

CREATE INDEX idx_polls_status ON public.polls USING btree (status);


--
-- Name: idx_question_options_order; Type: INDEX; Schema: public; Owner: dtg_user
--

CREATE INDEX idx_question_options_order ON public.question_options USING btree (question_id, display_order);


--
-- Name: idx_question_options_question; Type: INDEX; Schema: public; Owner: dtg_user
--

CREATE INDEX idx_question_options_question ON public.question_options USING btree (question_id);


--
-- Name: idx_regions_active; Type: INDEX; Schema: public; Owner: dtg_user
--

CREATE INDEX idx_regions_active ON public.regions USING btree (active);


--
-- Name: idx_regions_code; Type: INDEX; Schema: public; Owner: dtg_user
--

CREATE INDEX idx_regions_code ON public.regions USING btree (code);


--
-- Name: idx_regions_name_en; Type: INDEX; Schema: public; Owner: dtg_user
--

CREATE INDEX idx_regions_name_en ON public.regions USING btree (name_en);


--
-- Name: idx_regions_parent; Type: INDEX; Schema: public; Owner: dtg_user
--

CREATE INDEX idx_regions_parent ON public.regions USING btree (parent_region_id);


--
-- Name: idx_rewards_device; Type: INDEX; Schema: public; Owner: dtg_user
--

CREATE INDEX idx_rewards_device ON public.user_rewards USING btree (device_key_hash);


--
-- Name: idx_rewards_transfers; Type: INDEX; Schema: public; Owner: dtg_user
--

CREATE INDEX idx_rewards_transfers ON public.user_rewards USING btree (device_key_hash, transfer_to) WHERE (transfer_to IS NOT NULL);


--
-- Name: idx_rewards_tx_id; Type: INDEX; Schema: public; Owner: dtg_user
--

CREATE INDEX idx_rewards_tx_id ON public.user_rewards USING btree (tx_id);


--
-- Name: idx_security_events_created_at; Type: INDEX; Schema: public; Owner: dtg_user
--

CREATE INDEX idx_security_events_created_at ON public.security_events USING btree (created_at);


--
-- Name: idx_security_events_event_type; Type: INDEX; Schema: public; Owner: dtg_user
--

CREATE INDEX idx_security_events_event_type ON public.security_events USING btree (event_type);


--
-- Name: idx_security_events_pn_hash; Type: INDEX; Schema: public; Owner: dtg_user
--

CREATE INDEX idx_security_events_pn_hash ON public.security_events USING btree (pn_hash);


--
-- Name: idx_security_events_result; Type: INDEX; Schema: public; Owner: dtg_user
--

CREATE INDEX idx_security_events_result ON public.security_events USING btree (result);


--
-- Name: idx_security_events_user_id; Type: INDEX; Schema: public; Owner: dtg_user
--

CREATE INDEX idx_security_events_user_id ON public.security_events USING btree (user_id);


--
-- Name: idx_settings_key; Type: INDEX; Schema: public; Owner: dtg_user
--

CREATE INDEX idx_settings_key ON public.settings USING btree (key);


--
-- Name: idx_survey_questions_order; Type: INDEX; Schema: public; Owner: dtg_user
--

CREATE INDEX idx_survey_questions_order ON public.survey_questions USING btree (poll_id, display_order);


--
-- Name: idx_survey_questions_poll; Type: INDEX; Schema: public; Owner: dtg_user
--

CREATE INDEX idx_survey_questions_poll ON public.survey_questions USING btree (poll_id);


--
-- Name: idx_survey_responses_poll; Type: INDEX; Schema: public; Owner: dtg_user
--

CREATE INDEX idx_survey_responses_poll ON public.survey_responses USING btree (poll_id);


--
-- Name: idx_survey_responses_poll_question; Type: INDEX; Schema: public; Owner: dtg_user
--

CREATE INDEX idx_survey_responses_poll_question ON public.survey_responses USING btree (poll_id, question_id);


--
-- Name: idx_survey_responses_question; Type: INDEX; Schema: public; Owner: dtg_user
--

CREATE INDEX idx_survey_responses_question ON public.survey_responses USING btree (question_id);


--
-- Name: idx_system_settings_key; Type: INDEX; Schema: public; Owner: dtg_user
--

CREATE INDEX idx_system_settings_key ON public.system_settings USING btree (key);


--
-- Name: idx_ticket_responses_ticket_id; Type: INDEX; Schema: public; Owner: dtg_user
--

CREATE INDEX idx_ticket_responses_ticket_id ON public.ticket_responses USING btree (ticket_id);


--
-- Name: idx_tickets_assigned_admin; Type: INDEX; Schema: public; Owner: dtg_user
--

CREATE INDEX idx_tickets_assigned_admin ON public.tickets USING btree (assigned_admin_id);


--
-- Name: idx_tickets_category; Type: INDEX; Schema: public; Owner: dtg_user
--

CREATE INDEX idx_tickets_category ON public.tickets USING btree (category);


--
-- Name: idx_tickets_created_at; Type: INDEX; Schema: public; Owner: dtg_user
--

CREATE INDEX idx_tickets_created_at ON public.tickets USING btree (created_at DESC);


--
-- Name: idx_tickets_priority; Type: INDEX; Schema: public; Owner: dtg_user
--

CREATE INDEX idx_tickets_priority ON public.tickets USING btree (priority);


--
-- Name: idx_tickets_status; Type: INDEX; Schema: public; Owner: dtg_user
--

CREATE INDEX idx_tickets_status ON public.tickets USING btree (status);


--
-- Name: idx_tickets_user_id; Type: INDEX; Schema: public; Owner: dtg_user
--

CREATE INDEX idx_tickets_user_id ON public.tickets USING btree (user_id);


--
-- Name: idx_user_rewards_status; Type: INDEX; Schema: public; Owner: dtg_user
--

CREATE INDEX idx_user_rewards_status ON public.user_rewards USING btree (status) WHERE ((status)::text = 'pending'::text);


--
-- Name: idx_users_created_at; Type: INDEX; Schema: public; Owner: dtg_user
--

CREATE INDEX idx_users_created_at ON public.users USING btree (created_at);


--
-- Name: idx_users_credential_dob; Type: INDEX; Schema: public; Owner: dtg_user
--

CREATE INDEX idx_users_credential_dob ON public.users USING btree (credential_dob);


--
-- Name: idx_users_device_key_thumbprint; Type: INDEX; Schema: public; Owner: dtg_user
--

CREATE INDEX idx_users_device_key_thumbprint ON public.users USING btree (device_key_thumbprint);


--
-- Name: idx_users_last_login; Type: INDEX; Schema: public; Owner: dtg_user
--

CREATE INDEX idx_users_last_login ON public.users USING btree (last_login_at);


--
-- Name: idx_users_wallet_address; Type: INDEX; Schema: public; Owner: dtg_user
--

CREATE INDEX idx_users_wallet_address ON public.users USING btree (wallet_address);


--
-- Name: idx_vote_nullifiers_poll; Type: INDEX; Schema: public; Owner: dtg_user
--

CREATE INDEX idx_vote_nullifiers_poll ON public.vote_nullifiers USING btree (poll_id);


--
-- Name: idx_votes_bucket_ts; Type: INDEX; Schema: public; Owner: dtg_user
--

CREATE INDEX idx_votes_bucket_ts ON public.votes USING btree (bucket_ts);


--
-- Name: idx_votes_poll_option; Type: INDEX; Schema: public; Owner: dtg_user
--

CREATE INDEX idx_votes_poll_option ON public.votes USING btree (poll_id, option_id);


--
-- Name: idx_whitelisted_ips_active; Type: INDEX; Schema: public; Owner: dtg_user
--

CREATE INDEX idx_whitelisted_ips_active ON public.whitelisted_ips USING btree (is_active) WHERE (is_active = true);


--
-- Name: unique_reward_per_poll_device_v2; Type: INDEX; Schema: public; Owner: dtg_user
--

CREATE UNIQUE INDEX unique_reward_per_poll_device_v2 ON public.user_rewards USING btree (poll_id, device_key_hash) WHERE ((poll_id IS NOT NULL) AND (transfer_to IS NULL));


--
-- Name: regions regions_updated_at; Type: TRIGGER; Schema: public; Owner: dtg_user
--

CREATE TRIGGER regions_updated_at BEFORE UPDATE ON public.regions FOR EACH ROW EXECUTE FUNCTION public.update_regions_updated_at();


--
-- Name: tickets trigger_set_ticket_number; Type: TRIGGER; Schema: public; Owner: dtg_user
--

CREATE TRIGGER trigger_set_ticket_number BEFORE INSERT ON public.tickets FOR EACH ROW EXECUTE FUNCTION public.set_ticket_number();


--
-- Name: ticket_responses trigger_update_ticket_on_response; Type: TRIGGER; Schema: public; Owner: dtg_user
--

CREATE TRIGGER trigger_update_ticket_on_response AFTER INSERT ON public.ticket_responses FOR EACH ROW EXECUTE FUNCTION public.update_ticket_on_response();


--
-- Name: tickets trigger_update_ticket_timestamp; Type: TRIGGER; Schema: public; Owner: dtg_user
--

CREATE TRIGGER trigger_update_ticket_timestamp BEFORE UPDATE ON public.tickets FOR EACH ROW EXECUTE FUNCTION public.update_ticket_timestamp();


--
-- Name: device_tokens update_device_tokens_updated_at; Type: TRIGGER; Schema: public; Owner: dtg_user
--

CREATE TRIGGER update_device_tokens_updated_at BEFORE UPDATE ON public.device_tokens FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: blocked_countries blocked_countries_blocked_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: dtg_user
--

ALTER TABLE ONLY public.blocked_countries
    ADD CONSTRAINT blocked_countries_blocked_by_fkey FOREIGN KEY (blocked_by) REFERENCES public.admin_users(id);


--
-- Name: blocked_ips blocked_ips_blocked_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: dtg_user
--

ALTER TABLE ONLY public.blocked_ips
    ADD CONSTRAINT blocked_ips_blocked_by_fkey FOREIGN KEY (blocked_by) REFERENCES public.admin_users(id);


--
-- Name: device_poll_voters device_poll_voters_poll_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: dtg_user
--

ALTER TABLE ONLY public.device_poll_voters
    ADD CONSTRAINT device_poll_voters_poll_id_fkey FOREIGN KEY (poll_id) REFERENCES public.polls(id) ON DELETE CASCADE;


--
-- Name: device_tokens device_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: dtg_user
--

ALTER TABLE ONLY public.device_tokens
    ADD CONSTRAINT device_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: idempotency_keys idempotency_keys_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: dtg_user
--

ALTER TABLE ONLY public.idempotency_keys
    ADD CONSTRAINT idempotency_keys_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: poll_options poll_options_poll_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: dtg_user
--

ALTER TABLE ONLY public.poll_options
    ADD CONSTRAINT poll_options_poll_id_fkey FOREIGN KEY (poll_id) REFERENCES public.polls(id) ON DELETE CASCADE;


--
-- Name: poll_participants poll_participants_poll_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: dtg_user
--

ALTER TABLE ONLY public.poll_participants
    ADD CONSTRAINT poll_participants_poll_id_fkey FOREIGN KEY (poll_id) REFERENCES public.polls(id) ON DELETE CASCADE;


--
-- Name: poll_participants poll_participants_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: dtg_user
--

ALTER TABLE ONLY public.poll_participants
    ADD CONSTRAINT poll_participants_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: question_options question_options_question_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: dtg_user
--

ALTER TABLE ONLY public.question_options
    ADD CONSTRAINT question_options_question_id_fkey FOREIGN KEY (question_id) REFERENCES public.survey_questions(id) ON DELETE CASCADE;


--
-- Name: regions regions_parent_region_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: dtg_user
--

ALTER TABLE ONLY public.regions
    ADD CONSTRAINT regions_parent_region_id_fkey FOREIGN KEY (parent_region_id) REFERENCES public.regions(id) ON DELETE SET NULL;


--
-- Name: security_events security_events_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: dtg_user
--

ALTER TABLE ONLY public.security_events
    ADD CONSTRAINT security_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: survey_nullifiers survey_nullifiers_poll_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: dtg_user
--

ALTER TABLE ONLY public.survey_nullifiers
    ADD CONSTRAINT survey_nullifiers_poll_id_fkey FOREIGN KEY (poll_id) REFERENCES public.polls(id) ON DELETE CASCADE;


--
-- Name: survey_questions survey_questions_poll_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: dtg_user
--

ALTER TABLE ONLY public.survey_questions
    ADD CONSTRAINT survey_questions_poll_id_fkey FOREIGN KEY (poll_id) REFERENCES public.polls(id) ON DELETE CASCADE;


--
-- Name: survey_responses survey_responses_poll_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: dtg_user
--

ALTER TABLE ONLY public.survey_responses
    ADD CONSTRAINT survey_responses_poll_id_fkey FOREIGN KEY (poll_id) REFERENCES public.polls(id);


--
-- Name: survey_responses survey_responses_question_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: dtg_user
--

ALTER TABLE ONLY public.survey_responses
    ADD CONSTRAINT survey_responses_question_id_fkey FOREIGN KEY (question_id) REFERENCES public.survey_questions(id);


--
-- Name: survey_responses survey_responses_selected_option_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: dtg_user
--

ALTER TABLE ONLY public.survey_responses
    ADD CONSTRAINT survey_responses_selected_option_id_fkey FOREIGN KEY (selected_option_id) REFERENCES public.question_options(id);


--
-- Name: ticket_responses ticket_responses_admin_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: dtg_user
--

ALTER TABLE ONLY public.ticket_responses
    ADD CONSTRAINT ticket_responses_admin_id_fkey FOREIGN KEY (admin_id) REFERENCES public.admin_users(id) ON DELETE SET NULL;


--
-- Name: ticket_responses ticket_responses_ticket_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: dtg_user
--

ALTER TABLE ONLY public.ticket_responses
    ADD CONSTRAINT ticket_responses_ticket_id_fkey FOREIGN KEY (ticket_id) REFERENCES public.tickets(id) ON DELETE CASCADE;


--
-- Name: ticket_responses ticket_responses_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: dtg_user
--

ALTER TABLE ONLY public.ticket_responses
    ADD CONSTRAINT ticket_responses_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: tickets tickets_assigned_admin_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: dtg_user
--

ALTER TABLE ONLY public.tickets
    ADD CONSTRAINT tickets_assigned_admin_id_fkey FOREIGN KEY (assigned_admin_id) REFERENCES public.admin_users(id) ON DELETE SET NULL;


--
-- Name: tickets tickets_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: dtg_user
--

ALTER TABLE ONLY public.tickets
    ADD CONSTRAINT tickets_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: user_rewards user_rewards_poll_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: dtg_user
--

ALTER TABLE ONLY public.user_rewards
    ADD CONSTRAINT user_rewards_poll_id_fkey FOREIGN KEY (poll_id) REFERENCES public.polls(id);


--
-- Name: vote_attestations vote_attestations_vote_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: dtg_user
--

ALTER TABLE ONLY public.vote_attestations
    ADD CONSTRAINT vote_attestations_vote_id_fkey FOREIGN KEY (vote_id) REFERENCES public.votes(id) ON DELETE CASCADE;


--
-- Name: vote_nullifiers vote_nullifiers_poll_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: dtg_user
--

ALTER TABLE ONLY public.vote_nullifiers
    ADD CONSTRAINT vote_nullifiers_poll_id_fkey FOREIGN KEY (poll_id) REFERENCES public.polls(id) ON DELETE CASCADE;


--
-- Name: votes votes_option_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: dtg_user
--

ALTER TABLE ONLY public.votes
    ADD CONSTRAINT votes_option_id_fkey FOREIGN KEY (option_id) REFERENCES public.poll_options(id);


--
-- Name: votes votes_poll_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: dtg_user
--

ALTER TABLE ONLY public.votes
    ADD CONSTRAINT votes_poll_id_fkey FOREIGN KEY (poll_id) REFERENCES public.polls(id);


--
-- Name: whitelisted_ips whitelisted_ips_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: dtg_user
--

ALTER TABLE ONLY public.whitelisted_ips
    ADD CONSTRAINT whitelisted_ips_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.admin_users(id);


--
-- PostgreSQL database dump complete
--

\unrestrict FOfzXunyYxZKd9zOKfGOdaSRTqrgzgctkffZetVmCHqoDalesFfgJDfhpd8WPe0

