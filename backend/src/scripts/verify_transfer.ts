import { pool } from '../db/client';
import { computePnHash } from '../services/identity';
import { issueCredentialForSubject } from '../services/credentials';
import axios from 'axios';

async function verifyTransfer() {
  console.log('--- DTG Transfer Verification ---');

  const BASE_URL = 'http://localhost:3000/api/v1';
  
  try {
    // 1. Setup Test Users
    const userAPn = '12345678901';
    const userBPn = '98765432109';
    const walletB = '0x1234567890123456789012345678901234567890';

    const pnHashA = computePnHash(userAPn);
    const pnHashB = computePnHash(userBPn);

    // Ensure users exist
    await pool.query('INSERT INTO users (pn_hash) VALUES ($1) ON CONFLICT (pn_hash) DO NOTHING', [pnHashA]);
    await pool.query('INSERT INTO users (pn_hash, wallet_address) VALUES ($1, $2) ON CONFLICT (pn_hash) DO UPDATE SET wallet_address = $2', [pnHashB, walletB]);

    const userARes = await pool.query('SELECT id FROM users WHERE pn_hash = $1', [pnHashA]);
    const userBRes = await pool.query('SELECT id FROM users WHERE pn_hash = $1', [pnHashB]);

    const userIdA = userARes.rows[0].id;
    const userIdB = userBRes.rows[0].id;

    console.log(`User A (Sender): ${userIdA}`);
    console.log(`User B (Recipient): ${userIdB} (Wallet: ${walletB})`);

    // 2. Add some starting rewards for User A
    await pool.query('DELETE FROM user_rewards WHERE device_key_hash IN ($1, $2)', [userIdA, userIdB]);
    await pool.query(
      "INSERT INTO user_rewards (device_key_hash, amount, token_symbol, status) VALUES ($1, 50, 'DTG', 'processed')",
      [userIdA]
    );

    // 3. Issue Credential for User A
    const tokenA = issueCredentialForSubject(userIdA, {
      age_bucket: '25-34',
      gender: 'M',
      region: 'reg_tbilisi',
      region_codes: ['reg_tbilisi'],
      citizenship: 'GEO',
    });

    // 4. Perform Transfer
    console.log('Performing transfer of 10 DTG from A to B...');
    const transferRes = await axios.post(
      `${BASE_URL}/rewards/send`,
      { toAddress: walletB, amount: 10 },
      { headers: { Authorization: `Bearer ${tokenA}` } }
    );

    if (transferRes.data.success) {
      console.log('Transfer API call successful!');
      console.log('Tx ID:', transferRes.data.txId);
      console.log('New Balance (Sender):', transferRes.data.newBalance);
    } else {
      throw new Error('Transfer API call failed');
    }

    // 5. Verify Database
    console.log('Verifying records in user_rewards...');
    
    const rewardsA = await pool.query('SELECT * FROM user_rewards WHERE device_key_hash = $1 ORDER BY created_at DESC', [userIdA]);
    const rewardsB = await pool.query('SELECT * FROM user_rewards WHERE device_key_hash = $1 ORDER BY created_at DESC', [userIdB]);

    console.log(`User A records: ${rewardsA.rows.length}`);
    rewardsA.rows.forEach(r => console.log(`  - ${r.amount} DTG, Status: ${r.status}, To: ${r.transfer_to}`));

    console.log(`User B records: ${rewardsB.rows.length}`);
    rewardsB.rows.forEach(r => console.log(`  - ${r.amount} DTG, Status: ${r.status}, TxHash: ${r.tx_hash}`));

    const balanceBRes = await pool.query('SELECT SUM(amount) as balance FROM user_rewards WHERE device_key_hash = $1', [userIdB]);
    console.log(`User B Balance: ${balanceBRes.rows[0].balance}`);

    if (parseFloat(balanceBRes.rows[0].balance) === 10) {
      console.log('✅ Success: Recipient credited correctly!');
    } else {
      console.log('❌ Failure: Recipient not credited correctly.');
    }

    const rewardB = rewardsB.rows[0];
    if (rewardB && (rewardB.status === 'pending' || (rewardB.status === 'processed' && rewardB.tx_hash))) {
      console.log('✅ Success: Recipient credit was PENDING or already PROCESSED by worker!');
    } else {
      console.log('❌ Failure: Recipient credit has unexpected status or no tx_hash.');
    }

  } catch (error: any) {
    console.error('Verification failed:', error.message);
    if (error.response) console.error('Response data:', error.response.data);
  } finally {
    await pool.end();
  }
}

verifyTransfer();
