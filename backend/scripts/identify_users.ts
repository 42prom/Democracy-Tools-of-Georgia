import { pool } from '../src/db/client';

async function identifyUsers() {
  try {
    const logs = await pool.query(`
      SELECT 
        se.pn_hash, 
        se.result, 
        se.reason_code, 
        se.face_match_score,
        se.created_at,
        u.first_name,
        u.last_name
      FROM security_events se
      LEFT JOIN users u ON se.pn_hash = u.pn_hash
      ORDER BY se.created_at DESC
      LIMIT 20
    `);

    const settings = await pool.query(`
      SELECT key, value FROM settings WHERE key LIKE 'verification_facematch_%'
    `);

    console.log('--- RESULTS_START ---');
    console.log(JSON.stringify({
      todayLogs: logs.rows,
      fmSettings: settings.rows
    }, null, 2));
    console.log('--- RESULTS_END ---');

  } catch (err) {
    console.error('Error identifying users:', err);
  } finally {
    await pool.end();
  }
}

identifyUsers();
