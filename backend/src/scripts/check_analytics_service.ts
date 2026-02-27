
import { getPollDemographics } from '../services/analytics';
import { pool } from '../db/client';

const POLL_ID = '6fdc238f-898b-4648-982e-24555ed21ec2';

async function main() {
  try {
    console.log(`Calling getPollDemographics for poll ${POLL_ID}...`);
    const breakdowns = await getPollDemographics(POLL_ID);
    console.log('Result:', JSON.stringify(breakdowns, null, 2));

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await pool.end();
  }
}

main();
