
import { pool } from '../backend/src/db/client';

async function main() {
    console.log('🌱 Seeding Reward Poll...');
    
    try {
        // 1. Create Poll
        const pollRes = await pool.query(`
            INSERT INTO polls (title, description, status, type, rewards_enabled, reward_amount, reward_token, audience_rules, published_at)
            VALUES ($1, $2, 'active', 'survey', true, 50, 'DTG', '{}', NOW())
            RETURNING id
        `, ['Crypto Reward Test Poll', 'Vote and earn 50 DTG!']);
        
        const pollId = pollRes.rows[0].id;
        console.log(`   Poll Created: ${pollId}`);
        
        // 2. Create Options
        await pool.query(`
            INSERT INTO poll_options (id, poll_id, text, display_order)
            VALUES 
                (gen_random_uuid(), $1, 'Option A (Yes)', 1),
                (gen_random_uuid(), $1, 'Option B (No)', 2)
        `, [pollId]);
        
        console.log('   Options Created');
        console.log('✅ Seed Complete');
        process.exit(0);
    } catch (e) {
        console.error('❌ Seed Failed:', e);
        process.exit(1);
    }
}

main();

