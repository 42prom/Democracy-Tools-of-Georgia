-- Tickets System Migration
-- Supports help/support ticket functionality

-- Ticket status enum
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ticket_status') THEN
    CREATE TYPE ticket_status AS ENUM ('open', 'in_progress', 'waiting_user', 'resolved', 'closed');
  END IF;
END $$;

-- Ticket priority enum
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ticket_priority') THEN
    CREATE TYPE ticket_priority AS ENUM ('low', 'medium', 'high', 'urgent');
  END IF;
END $$;

-- Ticket category enum
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ticket_category') THEN
    CREATE TYPE ticket_category AS ENUM ('general', 'account', 'voting', 'technical', 'verification', 'rewards', 'other');
  END IF;
END $$;

-- Main tickets table
CREATE TABLE IF NOT EXISTS tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  ticket_number VARCHAR(20) UNIQUE NOT NULL,
  subject VARCHAR(200) NOT NULL,
  message TEXT NOT NULL,
  category ticket_category DEFAULT 'general',
  priority ticket_priority DEFAULT 'medium',
  status ticket_status DEFAULT 'open',
  assigned_admin_id UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  user_email VARCHAR(255),
  user_device_info JSONB,
  attachments JSONB DEFAULT '[]'::jsonb,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ
);

-- Ticket responses/messages table
CREATE TABLE IF NOT EXISTS ticket_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  admin_id UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  is_admin BOOLEAN DEFAULT FALSE,
  message TEXT NOT NULL,
  attachments JSONB DEFAULT '[]'::jsonb,
  is_internal_note BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_tickets_user_id ON tickets(user_id);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);
CREATE INDEX IF NOT EXISTS idx_tickets_priority ON tickets(priority);
CREATE INDEX IF NOT EXISTS idx_tickets_category ON tickets(category);
CREATE INDEX IF NOT EXISTS idx_tickets_created_at ON tickets(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tickets_assigned_admin ON tickets(assigned_admin_id);
CREATE INDEX IF NOT EXISTS idx_ticket_responses_ticket_id ON ticket_responses(ticket_id);

-- Function to generate ticket number
CREATE OR REPLACE FUNCTION generate_ticket_number()
RETURNS TEXT AS $$
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
$$ LANGUAGE plpgsql;

-- Trigger to auto-generate ticket number
CREATE OR REPLACE FUNCTION set_ticket_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.ticket_number IS NULL OR NEW.ticket_number = '' THEN
    NEW.ticket_number := generate_ticket_number();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_set_ticket_number ON tickets;
CREATE TRIGGER trigger_set_ticket_number
  BEFORE INSERT ON tickets
  FOR EACH ROW
  EXECUTE FUNCTION set_ticket_number();

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_ticket_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_ticket_timestamp ON tickets;
CREATE TRIGGER trigger_update_ticket_timestamp
  BEFORE UPDATE ON tickets
  FOR EACH ROW
  EXECUTE FUNCTION update_ticket_timestamp();

-- Update timestamp when response is added
CREATE OR REPLACE FUNCTION update_ticket_on_response()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE tickets SET updated_at = NOW() WHERE id = NEW.ticket_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_ticket_on_response ON ticket_responses;
CREATE TRIGGER trigger_update_ticket_on_response
  AFTER INSERT ON ticket_responses
  FOR EACH ROW
  EXECUTE FUNCTION update_ticket_on_response();
