import { pool } from '../db/client';

const address = '0x418b7d64e99fe1dd3b042d30e39581d0dce8d479'; // Full 42-char address
const key = 'blockchain_dtg_token_address';

async function run() {
  try {
    const result = await pool.query(
      'UPDATE settings SET value = $1 WHERE key = $2',
      [address, key]
    );
    console.log(`Successfully updated ${key} to ${address}`);
    console.log(`Rows updated: ${result.rowCount}`);
  } catch (e) {
    console.error('Failed to update token address:', e);
  } finally {
    await pool.end();
  }
}

run();
