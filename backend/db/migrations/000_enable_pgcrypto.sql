-- Ensure UUID helper exists BEFORE any gen_random_uuid usage
CREATE EXTENSION IF NOT EXISTS pgcrypto;
