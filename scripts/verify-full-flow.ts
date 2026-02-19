
import crypto from 'crypto';
import { pool } from '../backend/src/db/client';

const API_URL = 'http://localhost:3000/api/v1';
let USER_TOKEN = '';
let POLL_ID = '';
let OPTION_ID = '';
let ENROLLMENT_SESSION_ID = '';

// Test Data
const PN = '12345678901'; 

// Helper for fetch
async function post(endpoint: string, data: any, token?: string) {
    const headers: any = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    
    const res = await fetch(`${API_URL}${endpoint}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(data)
    });
    
    const body = await res.json();
    if (!res.ok) {
        throw new Error(`${endpoint} failed (${res.status}): ${JSON.stringify(body)}`);
    }
    return body;
}

async function get(endpoint: string, token: string) {
    const headers: any = { 'Authorization': `Bearer ${token}` };
    const res = await fetch(`${API_URL}${endpoint}`, { method: 'GET', headers });
    const body = await res.json();
    if (!res.ok) {
        throw new Error(`${endpoint} failed (${res.status}): ${JSON.stringify(body)}`);
    }
    return body;
}

async function step(name: string, fn: () => Promise<void>) {
    console.log(`\n🔹 Step: ${name}`);
    try {
        await fn();
        console.log(`   ✅ Success`);
    } catch (e: any) {
        console.error(`   ❌ Failed: ${e.message}`);
        process.exit(1);
    }
}

async function main() {
    console.log('🚀 Starting End-to-End System Verification');

    // 1. New User Enrollment
    await step('1. Enroll New User (NFC)', async () => {
        const res = await post('/enrollment/nfc', {
           personalNumber: PN,
           nationality: 'GEO',
           dob: '1990-01-01',
           expiry: '2030-01-01',
           docNumber: 'AA123456',
        });
        ENROLLMENT_SESSION_ID = res.enrollmentSessionId;
        if (res.mode !== 'register') console.warn('   ⚠️ Warning: Expected register mode, got', res.mode);
        console.log('   Session ID:', ENROLLMENT_SESSION_ID);
    });

    await step('1. Enroll New User (Document)', async () => {
        await post('/enrollment/document', {
            enrollmentSessionId: ENROLLMENT_SESSION_ID,
            personalNumber: PN,
            dob: '1990-01-01',
            expiry: '2030-01-01',
            docNumber: 'AA123456', 
            documentPortraitBase64: 'base64...' 
        });
    });

    await step('1. Enroll New User (Liveness)', async () => {
        const res = await post('/enrollment/liveness', {
            enrollmentSessionId: ENROLLMENT_SESSION_ID,
            livenessScore: 0.99,
            selfieBase64: 'base64...'
        });
        USER_TOKEN = res.credentialToken;
        // Verify isNewUser = true ? 
        // Logic might vary if we ran this script before.
        console.log('   User Token Obtained. isNewUser:', res.isNewUser);
    });

    // Clear Rate Limits (Hack for testing back-to-back login)
    await step('Clear Rate Limits', async () => {
        await pool.query('DELETE FROM auth_rate_limits');
    });

    // 2. Existing User Login (Repeat Process)
    await step('2. Login Existing User (NFC)', async () => {
        const res = await post('/enrollment/nfc', {
           personalNumber: PN,
           nationality: 'GEO',
           dob: '1990-01-01',
           expiry: '2030-01-01',
           docNumber: 'AA123456',
        });
        ENROLLMENT_SESSION_ID = res.enrollmentSessionId;
        if (res.mode !== 'login') throw new Error(`Expected login mode, got ${res.mode}`);
        console.log('   Session ID (Login):', ENROLLMENT_SESSION_ID);
    });

    await step('2. Login Existing User (Document)', async () => {
         await post('/enrollment/document', {
            enrollmentSessionId: ENROLLMENT_SESSION_ID,
            personalNumber: PN,
            dob: '1990-01-01',
            expiry: '2030-01-01',
            docNumber: 'AA123456', 
            documentPortraitBase64: 'base64...' 
        });
    });

    await step('2. Login Existing User (Liveness)', async () => {
        const res = await post('/enrollment/liveness', {
            enrollmentSessionId: ENROLLMENT_SESSION_ID,
            livenessScore: 0.99,
            selfieBase64: 'base64...'
        });
        USER_TOKEN = res.credentialToken; // Renewed token
        console.log('   Login Successful. isNewUser:', res.isNewUser);
        if (res.isNewUser) throw new Error('Expected isNewUser=false for login');
    });

    // 3. Vote on Poll
    await step('3. Vote and Earn Reward', async () => {
        const res = await get('/polls', USER_TOKEN);
        const poll = res.polls[0]; 
        if (!poll) throw new Error('No eligible polls found.');
        
        POLL_ID = poll.id;
        OPTION_ID = poll.options[0].id;
        
        console.log(`   Voting on: ${poll.title} (${POLL_ID})`);
        console.log(`   Expected Reward: ${poll.reward_amount} ${poll.reward_token}`);

        const voteRes = await post(`/polls/${POLL_ID}/vote`, {
            pollId: POLL_ID,
            optionId: OPTION_ID,
            nullifier: crypto.createHash('sha256').update('unique_vote_' + Date.now()).digest('hex'),
            nonce: 'mock_nonce',
            signature: 'mock_sig'
        }, USER_TOKEN);
        
        console.log('   Vote Submitted. TX:', voteRes.txHash);
    });

    // 4. Check Rewards
    await step('4. Check Reward Balance', async () => {
        const res = await get('/rewards/balance', USER_TOKEN);
        console.log('   Balances:', res.balances);
        
        const balance = res.balances.find((b: any) => b.token === 'DTG');
        if (!balance || balance.amount <= 0) {
            throw new Error('Reward not received!');
        }
        console.log(`   ✅ Confirmed Reward: ${balance.amount} ${balance.token}`);
        
        await pool.end();
        process.exit(0);
    });
}

main();

