
import { pool } from '../db/client';

const POLL_ID = '6fdc238f-898b-4648-982e-24555ed21ec2';

async function main() {
  try {
    console.log(`Inspecting votes for poll ${POLL_ID}...`);
    const res = await pool.query(
      'SELECT id, demographics_snapshot FROM votes WHERE poll_id = $1',
      [POLL_ID]
    );
    
    console.log(`Found ${res.rows.length} votes.`);
    res.rows.forEach((row, i) => {
      console.log(`Vote ${i + 1}:`, JSON.stringify(row.demographics_snapshot, null, 2));
    });

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await pool.end();
  }
}

main();
