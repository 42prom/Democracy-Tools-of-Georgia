import axios from 'axios';
import jwt from 'jsonwebtoken';
import { pool } from '../db/client';
import dotenv from 'dotenv';
dotenv.config();

const API_BASE = 'http://localhost:3000/api/v1';
const JWT_SECRET = process.env.JWT_SECRET || 'CHANGE_ME_IN_PRODUCTION_USE_RANDOM_64_CHAR_STRING';

async function verifyIdempotency() {
  console.log('--- Verifying Idempotency and Nonce logic ---');

  // 1. Get a valid user from DB
  const schemaResult = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'users'");
  const columns = schemaResult.rows.map(r => r.column_name);
  console.log('Available columns in users table:', columns.join(', '));

  const genderCol = columns.find(c => c === 'credential_gender' || c === 'gender') || 'gender';
  const dobCol = columns.find(c => c === 'credential_dob' || c === 'dob' || c === 'birth_date') || 'dob';

  const userResult = await pool.query(`SELECT id, ${genderCol} as gender, ${dobCol} as dob FROM users LIMIT 1`);
  if (userResult.rows.length === 0) {
      console.error('No users in DB');
      return;
  }
  const user = userResult.rows[0];
  console.log(`Using User ID: ${user.id}`);

  // Create valid JWT
  const token = jwt.sign({
    sub: user.id,
    data: {
        gender: user.gender,
        birth_date: user.dob
    }
  }, JWT_SECRET, { expiresIn: '1h' });

  const authHeader = `Bearer ${token}`;

  try {
    // A. Request a challenge
    console.log('1. Requesting challenge...');
    const challengeRes = await axios.post(`${API_BASE}/auth/challenge`, {
      purpose: 'vote',
      deviceId: 'test_device'
    }, {
      headers: { 'Authorization': authHeader }
    });
    const nonce = challengeRes.data.nonce;
    console.log(`   Nonce: ${nonce}`);

    // B. First Submission
    const idempotencyKey = `test-key-${Date.now()}`;
    
    // Get a real poll ID from DB
    const pollResult = await pool.query('SELECT id FROM polls LIMIT 1');
    if (pollResult.rows.length === 0) {
        console.error('No polls in DB');
        return;
    }
    const realPollId = pollResult.rows[0].id;
    const optionResult = await pool.query('SELECT id FROM poll_options WHERE poll_id = $1 LIMIT 1', [realPollId]);
    const realOptionId = optionResult.rows[0].id;

    const voteData = {
      pollId: realPollId,
      optionId: realOptionId,
      nullifier: `test-nullifier-${Date.now()}`,
      nonce: nonce,
      signature: 'test-signature'
    };

    console.log('2. First submit (expected success or already voted)...');
    try {
      const res1 = await axios.post(`${API_BASE}/polls/${realPollId}/vote`, voteData, {
        headers: { 
          'Authorization': authHeader,
          'X-Idempotency-Key': idempotencyKey 
        }
      });
      console.log(`   Status: ${res1.status}`);
    } catch (e: any) {
      console.log(`   Status: ${e.response?.status} - ${JSON.stringify(e.response?.data)}`);
    }

    // C. Second Submission (SAME nonce, SAME key)
    console.log('3. Second submit (expected idempotency HIT)...');
    try {
      const res2 = await axios.post(`${API_BASE}/polls/${realPollId}/vote`, voteData, {
        headers: { 
          'Authorization': authHeader,
          'X-Idempotency-Key': idempotencyKey 
        }
      });
      console.log(`   Status: ${res2.status} (SUCCESS - IDEMPOTENCY WORKING)`);
      console.log(`   Data: ${JSON.stringify(res2.data)}`);
    } catch (e: any) {
      console.error(`   Status: ${e.response?.status} - ${JSON.stringify(e.response?.data)}`);
      const errObj = e.response?.data?.error;
      const errMsg = typeof errObj === 'string' ? errObj : errObj?.message || '';
      if (errMsg.includes('Invalid or expired nonce')) {
          console.error('   FAILED: Idempotency check was bypassed!');
      }
    }

  } catch (error: any) {
    console.error('Error during verification:', error.message);
  } finally {
    await pool.end();
  }
}

verifyIdempotency();
