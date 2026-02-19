
import { pool } from '../db/client';

const POLL_ID = '6fdc238f-898b-4648-982e-24555ed21ec2';

async function main() {
  try {
    console.log(`Updating poll ${POLL_ID} min_k_anonymity to 1...`);
    const res = await pool.query(
      'UPDATE polls SET min_k_anonymity = 1 WHERE id = $1 RETURNING id, title, min_k_anonymity',
      [POLL_ID]
    );
    
    if (res.rows.length > 0) {
      console.log('Success:', res.rows[0]);
    } else {
      console.log('Poll not found');
    }
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await pool.end();
  }
}

main();
