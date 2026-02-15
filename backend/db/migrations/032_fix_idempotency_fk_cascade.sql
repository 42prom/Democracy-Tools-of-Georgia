-- Fix idempotency_keys foreign key to cascade on user deletion
-- This prevents FK violation errors when deleting users

-- Drop the existing foreign key constraint
ALTER TABLE idempotency_keys
DROP CONSTRAINT IF EXISTS idempotency_keys_user_id_fkey;

-- Re-add with ON DELETE CASCADE
ALTER TABLE idempotency_keys
ADD CONSTRAINT idempotency_keys_user_id_fkey
FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
