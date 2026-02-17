
const { Pool } = require('pg');
const pool = new Pool({
  connectionString: 'postgresql://dtg_user:dtg_dev_password@localhost:5432/dtg'
});

async function check() {
  try {
    const res = await pool.query('SELECT poll_id, count(*) as c FROM survey_responses GROUP BY poll_id;');
    res.rows.forEach(r => console.log(`Poll: ${r.poll_id}, Count: ${r.c}`));
    
    const polls = await pool.query('SELECT id, title FROM polls WHERE type = \'survey\';');
    polls.rows.forEach(p => console.log(`ID: ${p.id}, Title: ${p.title}`));
  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}

check();
