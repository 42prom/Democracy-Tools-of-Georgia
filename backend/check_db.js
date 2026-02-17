
const { Pool } = require('pg');
const pool = new Pool({
  connectionString: 'postgresql://dtg_user:dtg_dev_password@localhost:5432/dtg'
});

async function check() {
  try {
    const res = await pool.query('SELECT poll_id, COUNT(*) FROM survey_responses GROUP BY poll_id;');
    console.log('Survey Response Counts:', JSON.stringify(res.rows, null, 2));
    
    const polls = await pool.query('SELECT id, title, type FROM polls WHERE type = \'survey\';');
    console.log('Survey Polls:', JSON.stringify(polls.rows, null, 2));
  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}

check();
