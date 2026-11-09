import dotenv from 'dotenv';
import { pool } from '../db/client';

dotenv.config();

async function main(): Promise<void> {
  const email = (process.argv[2] || process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  if (!email) throw new Error('Pass the existing admin email as the first argument');

  const result = await pool.query(
    `SELECT admin.email,
            admin.mfa_secret_encrypted IS NOT NULL AS provisioned,
            admin.mfa_enabled AS enabled,
            admin.mfa_enrolled_at AS enrolled_at,
            (SELECT COUNT(*)
               FROM admin_sessions session
              WHERE session.admin_user_id = admin.id
                AND session.revoked_at IS NULL
                AND session.idle_expires_at > NOW()
                AND session.absolute_expires_at > NOW()) AS active_sessions
       FROM admin_users admin
      WHERE lower(admin.email) = $1`,
    [email]
  );
  if (!result.rows[0]) throw new Error('Admin account not found');
  console.log(JSON.stringify(result.rows[0], null, 2));
}

main()
  .then(async () => { await pool.end(); })
  .catch(async error => {
    console.error(error instanceof Error ? error.message : String(error));
    await pool.end();
    process.exitCode = 1;
  });
