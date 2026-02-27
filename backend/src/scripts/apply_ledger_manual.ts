import { pool } from '../db/client';
import fs from 'fs';
import path from 'path';

async function run() {
  try {
    console.log('Applying Immutable Ledger Schema manually...');
    
    // Read the SQL file
    const sqlPath = path.join(__dirname, '../../db/migrations/0039_immutable_ledger.sql');
    const sql = fs.readFileSync(sqlPath, 'utf-8');
    
    console.log('Executing SQL...');
    await pool.query(sql);
    
    console.log('✅ Schema applied successfully.');
    
    // Also ensure we record it in migrations table so it doesn't run again or cause issues?
    // actually if it was already recorded (wrongly), we don't need to insert.
    // if it wasn't, we should.
    // Let's just upsert
    await pool.query(`INSERT INTO schema_migrations (version, filename) VALUES (39, '0039_immutable_ledger.sql') ON CONFLICT (version) DO NOTHING`);
    
  } catch (e) {
    console.error('Error applying schema:', e);
  } finally {
    await pool.end();
  }
}

run();
