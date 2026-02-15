/**
 * Fix Verification Provider Settings
 *
 * Updates the database to use in-house providers instead of mock providers.
 * Run: npx tsx src/scripts/fix_verification_providers.ts
 */

import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

async function fixProviders() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    console.log('Connecting to database...');
    await pool.query('SELECT 1');
    console.log('Connected.\n');

    // Settings to update
    const updates = [
      { key: 'verification_liveness_provider', value: '3d_face_detector' },
      { key: 'verification_facematch_provider', value: 'custom_biometric_matcher' },
      { key: 'verification_nfc_provider', value: 'on_device_georgia' },
      { key: 'verification_document_provider', value: 'ocr' },
    ];

    console.log('Updating verification provider settings...\n');

    for (const { key, value } of updates) {
      const result = await pool.query(
        `INSERT INTO settings (key, value, updated_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (key)
         DO UPDATE SET value = $2, updated_at = NOW()
         RETURNING key, value`,
        [key, value]
      );
      console.log(`  ${key} = ${result.rows[0].value}`);
    }

    // Remove old minScore settings for liveness (no longer used)
    await pool.query(
      `DELETE FROM settings WHERE key = 'verification_liveness_min_score'`
    );
    console.log('\n  Removed: verification_liveness_min_score (no longer needed)');

    console.log('\n========================================');
    console.log('Verification providers updated!');
    console.log('========================================');
    console.log('\nProviders now configured:');
    console.log('  - Liveness: 3d_face_detector (in-house)');
    console.log('  - Face Match: custom_biometric_matcher (InsightFace)');
    console.log('  - NFC: on_device_georgia');
    console.log('  - Document: ocr');
    console.log('========================================\n');

  } catch (error: any) {
    console.error('Error:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

fixProviders();
