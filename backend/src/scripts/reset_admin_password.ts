import bcrypt from 'bcrypt';
import { pool } from '../db/client';
import dotenv from 'dotenv';
import path from 'path';

// ensure env vars are loaded
dotenv.config({ path: path.join(__dirname, '../../.env') });

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'nake.manages@gmail.com';
const DEFAULT_PASSWORD = process.env.ADMIN_PASSWORD;
if (!DEFAULT_PASSWORD) {
  console.error('FATAL: ADMIN_PASSWORD environment variable must be set to run this script.');
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
  console.log(`New Password: ${password}`);

  try {
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    const result = await pool.query(
      `INSERT INTO admin_users (email, password_hash, role, full_name, updated_at)
       VALUES ($1, $2, 'superadmin', 'Admin User', NOW())
       ON CONFLICT (email) 
       DO UPDATE SET password_hash = $2, updated_at = NOW()
       RETURNING id`,
      [email, passwordHash]
    );

    console.log('✓ Admin user updated successfully.');
    console.log(`✓ ID: ${result.rows[0].id}`);
    console.log('\nIMPORTANT: Use these credentials to log in to the admin panel.');

    process.exit(0);
  } catch (error) {
    console.error('❌ Failed to reset admin password:', error);
    process.exit(1);
  }
}

resetAdminPassword();
