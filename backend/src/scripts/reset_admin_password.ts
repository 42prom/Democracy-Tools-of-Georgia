/**
 * Reset/Create Super Admin User
 *
 * Usage: npx tsx src/scripts/reset_admin_password.ts
 *
 * Creates or updates the super admin user with specified credentials.
 */

import { Pool } from 'pg';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';

dotenv.config();

const SUPER_ADMIN_EMAIL = 'nake.manages@gmail.com';
const SUPER_ADMIN_PASSWORD = 'Mastera91';
const SUPER_ADMIN_NAME = 'Super Admin';

async function resetAdminPassword() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    console.log('Connecting to database...');
    await pool.query('SELECT 1');
    console.log('Connected successfully.');

    // Hash the password
    const saltRounds = 12;
    const passwordHash = await bcrypt.hash(SUPER_ADMIN_PASSWORD, saltRounds);

    // Upsert the admin user
    const result = await pool.query(
      `INSERT INTO admin_users (email, password_hash, role, full_name)
       VALUES ($1, $2, 'superadmin', $3)
       ON CONFLICT (email)
       DO UPDATE SET
         password_hash = $2,
         role = 'superadmin',
         full_name = $3,
         updated_at = NOW()
       RETURNING id, email, role`,
      [SUPER_ADMIN_EMAIL, passwordHash, SUPER_ADMIN_NAME]
    );

    console.log('\n========================================');
    console.log('Super Admin credentials set successfully!');
    console.log('========================================');
    console.log(`Email:    ${SUPER_ADMIN_EMAIL}`);
    console.log(`Password: ${SUPER_ADMIN_PASSWORD}`);
    console.log(`Role:     superadmin`);
    console.log(`ID:       ${result.rows[0].id}`);
    console.log('========================================\n');

  } catch (error: any) {
    console.error('Error:', error.message);

    if (error.message.includes('relation "admin_users" does not exist')) {
      console.error('\nThe admin_users table does not exist.');
      console.error('Run migrations first: npm run migrate');
    } else if (error.message.includes('password authentication failed')) {
      console.error('\nDatabase authentication failed.');
      console.error('Check your DATABASE_URL and ensure PostgreSQL is running.');
      console.error('You may need to reset Docker volumes:');
      console.error('  docker compose down -v');
      console.error('  docker compose up -d');
    }

    process.exit(1);
  } finally {
    await pool.end();
  }
}

resetAdminPassword();
