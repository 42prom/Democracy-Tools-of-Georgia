import dotenv from 'dotenv';
import { pool } from '../db/client';
import { generateMfaSecret, mfaProvisioningUri } from '../services/adminMfa';
import { encryptSensitiveValue } from '../services/secretEncryption';

dotenv.config();

async function main(): Promise<void> {
  const email = (process.argv[2] || process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  if (!email) throw new Error('Pass the existing admin email as the first argument');

  const secret = generateMfaSecret();
  const result = await pool.query(
    `UPDATE admin_users
        SET mfa_secret_encrypted = $2, mfa_enabled = false,
            mfa_enrolled_at = NULL, updated_at = NOW()
      WHERE lower(email) = $1
      RETURNING id, email`,
    [email, encryptSensitiveValue(secret)]
  );
  if (!result.rows[0]) throw new Error('Admin account not found');
  await pool.query(
    'UPDATE admin_sessions SET revoked_at = COALESCE(revoked_at, NOW()) WHERE admin_user_id = $1 AND revoked_at IS NULL',
    [result.rows[0].id]
  );

  console.log('MFA was replaced and all existing sessions were revoked.');
  console.log('Transfer the following one-time values through an approved secret channel:');
  console.log(`Secret: ${secret}`);
  console.log(`URI: ${mfaProvisioningUri(result.rows[0].email, secret)}`);
  console.log('The first successful password + TOTP login completes enrollment.');
}

main()
  .then(async () => { await pool.end(); })
  .catch(async error => {
    console.error(error instanceof Error ? error.message : String(error));
    await pool.end();
    process.exitCode = 1;
  });
