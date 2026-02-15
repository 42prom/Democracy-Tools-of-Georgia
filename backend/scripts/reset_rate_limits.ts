import { pool } from '../src/db/client';

async function resetLimits() {
  try {
    console.log('Resetting rate limits...');
    
    const resAuth = await pool.query('DELETE FROM auth_rate_limits');
    console.log(`Cleared ${resAuth.rowCount} auth rate limit entries.`);

    const resBio = await pool.query('DELETE FROM ip_biometric_limits');
    console.log(`Cleared ${resBio.rowCount} biometric rate limit entries.`);

    console.log('Successfully reset all rate limits.');
  } catch (err) {
    console.error('Error resetting rate limits:', err);
  } finally {
    await pool.end();
  }
}

resetLimits();
