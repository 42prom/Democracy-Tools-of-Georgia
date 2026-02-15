-- Admin Authentication Schema
-- Supports RBAC (Role Based Access Control)

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'admin_role') THEN
    CREATE TYPE admin_role AS ENUM ('superadmin', 'admin', 'moderator', 'observer');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS admin_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role admin_role NOT NULL DEFAULT 'admin',
    full_name VARCHAR(100),
    
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- No default admin seeded - use bootstrap script or manual setup
-- For development, run: npm run seed:admin (creates admin with random password printed to console)
-- For production, use the one-time bootstrap flow via ADMIN_BOOTSTRAP_TOKEN env var
