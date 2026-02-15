import { pool } from '../src/db/client';

async function checkBlocks() {
  try {
    const authBlocks = await pool.query(
      'SELECT pn_hash, ip_address, locked_until FROM auth_rate_limits WHERE locked_until > NOW()'
    );

    const bioBlocks = await pool.query(
      'SELECT ip_address, locked_until, lockout_reason FROM ip_biometric_limits WHERE locked_until > NOW()'
    );

    const recentBlocks = await pool.query(
      "SELECT pn_hash, ip_address, result, reason_code, created_at FROM security_events WHERE result = 'BLOCKED' ORDER BY created_at DESC LIMIT 10"
    );

    console.log('--- RESULTS_START ---');
    console.log(JSON.stringify({
      authBlocks: authBlocks.rows,
      bioBlocks: bioBlocks.rows,
      recentBlocks: recentBlocks.rows
    }, null, 2));
    console.log('--- RESULTS_END ---');

  } catch (err) {
    console.error('Error querying blocks:', err);
  } finally {
    await pool.end();
  }
}

checkBlocks();
