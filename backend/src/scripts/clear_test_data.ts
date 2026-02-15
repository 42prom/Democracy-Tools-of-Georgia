import { pool } from '../db/client';
import redisClient from '../db/redis';

async function clearTestData() {
  console.log('--- SYSTEM DATA RESET ---');
  
  try {
    // 1. Clear Postgres Tables
    console.log('Clearing Postgres tables...');
    const tables = [
      'idempotency_keys',
      'security_events',
      'auth_rate_limits',
      'ip_biometric_limits',
      'enrollment_sessions',
      'vote_attestations',
      'vote_nullifiers',
      'votes',
      'users'
    ];

    for (const table of tables) {
      try {
        await pool.query(`TRUNCATE TABLE ${table} RESTART IDENTITY CASCADE`);
        console.log(`  ✓ Cleared ${table}`);
      } catch (e: any) {
        if (e.code === '42P01') {
          console.log(`  ! Table ${table} does not exist, skipping.`);
        } else {
          console.error(`  × Error clearing ${table}:`, e.message);
        }
      }
    }

    // 2. Clear Redis
    console.log('Clearing Redis keys...');
    if (!redisClient.isOpen) {
      await redisClient.connect();
    }
    await redisClient.flushAll();
    console.log('  ✓ Redis flushed');

    console.log('--- RESET COMPLETE ---');
  } catch (err) {
    console.error('CRITICAL: Reset failed', err);
    process.exit(1);
  } finally {
    await pool.end();
    if (redisClient.isOpen) {
      await redisClient.quit();
    }
    process.exit(0);
  }
}

clearTestData();
