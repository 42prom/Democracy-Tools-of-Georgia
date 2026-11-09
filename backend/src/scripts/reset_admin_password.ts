import { pool } from '../db/client';
import dotenv from 'dotenv';
import path from 'path';
import { hashAdminPassword, validateAdminPassword } from '../services/adminPassword';

// ensure env vars are loaded
dotenv.config({ path: path.join(__dirname, '../../.env') });

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'nake.manages@gmail.com';
const DEFAULT_PASSWORD = process.env.ADMIN_PASSWORD;
if (!DEFAULT_PASSWORD && !process.argv[2]) {
  console.error('FATAL: pass the password as an argument or set ADMIN_PASSWORD.');
  process.exit(1);
}

async function resetAdminPassword() {
  console.log('--- Admin Password Reset Tool ---');

  const email = ADMIN_EMAIL;
  const password = process.argv[2] || DEFAULT_PASSWORD;
  if (!password) {
    console.error('FATAL: Password must be provided as an argument or in environment.');
    process.exit(1);
  }

  console.log(`Target Email: ${email}`);
  const passwordError = validateAdminPassword(password, email);
  if (passwordError) {
    console.error(`FATAL: ${passwordError}`);
    process.exit(1);
  }

  try {
    const passwordHash = await hashAdminPassword(password);

    const result = await pool.query(
      `INSERT INTO admin_users (email, password_hash, role, full_name, updated_at)
       VALUES ($1, $2, 'superadmin', 'Admin User', NOW())
       ON CONFLICT (email) 
       DO UPDATE SET password_hash = $2, is_active = true,
                     failed_login_attempts = 0, locked_until = NULL,
                     password_changed_at = NOW(), updated_at = NOW()
       RETURNING id`,
      [email, passwordHash]
    );

    console.log('✓ Admin user updated successfully.');
    console.log(`✓ ID: ${result.rows[0].id}`);
    await pool.query(
      'UPDATE admin_sessions SET revoked_at = COALESCE(revoked_at, NOW()) WHERE admin_user_id = $1 AND revoked_at IS NULL',
      [result.rows[0].id]
    );
    console.log('✓ Existing sessions revoked.');
    console.log('IMPORTANT: the password was not printed; transfer it through your approved secret channel.');

    process.exit(0);
  } catch (error) {
    console.error('❌ Failed to reset admin password:', error);
    process.exit(1);
  }
}

resetAdminPassword();
