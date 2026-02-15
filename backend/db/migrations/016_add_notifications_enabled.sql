-- Migration: Add notifications_enabled to users table
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS notifications_enabled BOOLEAN DEFAULT TRUE;
