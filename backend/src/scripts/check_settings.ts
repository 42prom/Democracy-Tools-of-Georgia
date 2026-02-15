import { pool } from '../db/client';

async function run() {
  try {
    const res = await pool.query("SELECT key, value FROM settings WHERE key LIKE 'blockchain_%'");
    console.log('--- Blockchain Settings ---');
    res.rows.forEach(row => {
      console.log(`${row.key}: ${row.value}`);
    });
  } catch (e) {
    console.error('Failed to query settings:', e);
  } finally {
    await pool.end();
  }
}

run();
