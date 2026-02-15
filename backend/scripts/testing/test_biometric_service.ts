/**
 * Test In-House Biometric Service Integration
 * Run: npx tsx backend/scripts/testing/test_biometric_service.ts
 */

import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';

const BIOMETRIC_SERVICE_URL = process.env.BIOMETRIC_SERVICE_URL || 'http://localhost:8000';

async function testBiometricService() {
  console.log('🧪 Testing In-House Biometric Service Integration\n');
  console.log('='.repeat(60));

  // Test 1: Health Check
  console.log('\n1️⃣ Testing biometric service health...');
  try {
    const healthResponse = await axios.get(`${BIOMETRIC_SERVICE_URL}/health`, {
      timeout: 5000
    });
    console.log(`   ✅ Service is running: ${JSON.stringify(healthResponse.data)}`);
  } catch (error: any) {
    console.log(`   ❌ Service is NOT running!`);
    console.log(`   Error: ${error.message}`);
    console.log(`\n   💡 To start the service:`);
    console.log(`      cd biometric-service`);
    console.log(`      python main.py`);
    process.exit(1);
  }

  // Test 2: Face Verification with Mock Images
  console.log('\n2️⃣ Testing face verification endpoint...');

  // Create simple test images (1x1 pixel PNG)
  // In real testing, you'd use actual face photos
  const mockImage1 = Buffer.from([
    0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, // PNG signature
    0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4,
    0x89, 0x00, 0x00, 0x00, 0x0A, 0x49, 0x44, 0x41,
    0x54, 0x78, 0x9C, 0x63, 0x00, 0x01, 0x00, 0x00,
    0x05, 0x00, 0x01, 0x0D, 0x0A, 0x2D, 0xB4, 0x00,
    0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE,
    0x42, 0x60, 0x82
  ]);

  const mockImage2 = Buffer.from(mockImage1); // Same image for testing

  try {
    const response = await axios.post(`${BIOMETRIC_SERVICE_URL}/verify`, {
      image1_base64: mockImage1.toString('base64'),
      image2_base64: mockImage2.toString('base64')
    }, {
      timeout: 30000  // InsightFace model loading can take time on first run
    });

    console.log(`   Response:`, response.data);

    if (response.data.error) {
      console.log(`   ⚠️  Service returned error: ${response.data.error}`);
      console.log(`   This is expected if no faces are detected in mock images`);
    } else {
      console.log(`   ✅ Match: ${response.data.match}`);
      console.log(`   Score: ${response.data.score?.toFixed(3)}`);
      console.log(`   Threshold: ${response.data.threshold}`);
      console.log(`   Faces detected: ${JSON.stringify(response.data.faces_detected)}`);
    }
  } catch (error: any) {
    console.log(`   ❌ Error calling /verify endpoint`);
    console.log(`   ${error.message}`);
    if (error.response) {
      console.log(`   Status: ${error.response.status}`);
      console.log(`   Data: ${JSON.stringify(error.response.data)}`);
    }
  }

  // Test 3: Provider Factory Integration
  console.log('\n3️⃣ Testing provider factory integration...');
  try {
    const { VerificationProviderFactory } = await import('../../src/services/verification/providerFactory');

    const livenessProvider = VerificationProviderFactory.getLivenessProvider('in_house');
    const faceMatchProvider = VerificationProviderFactory.getFaceMatchProvider('in_house');

    console.log(`   ✅ Liveness provider: ${livenessProvider.constructor.name}`);
    console.log(`   ✅ Face match provider: ${faceMatchProvider.constructor.name}`);

    if (livenessProvider.constructor.name !== 'InHouseLivenessProvider') {
      console.log(`   ❌ WARNING: Expected InHouseLivenessProvider, got ${livenessProvider.constructor.name}`);
    }
    if (faceMatchProvider.constructor.name !== 'InHouseFaceMatchProvider') {
      console.log(`   ❌ WARNING: Expected InHouseFaceMatchProvider, got ${faceMatchProvider.constructor.name}`);
    }
  } catch (error: any) {
    console.log(`   ❌ Error loading providers: ${error.message}`);
  }

  // Test 4: Settings Verification
  console.log('\n4️⃣ Checking verification settings in database...');
  try {
    const { pool } = await import('../../src/db/client');
    const result = await pool.query(
      `SELECT key, value FROM settings WHERE key IN ('verification_liveness_provider', 'verification_facematch_provider')`
    );

    for (const row of result.rows) {
      const status = row.value === 'in_house' ? '✅' : '⚠️ ';
      console.log(`   ${status} ${row.key} = ${row.value}`);

      if (row.value !== 'in_house') {
        console.log(`       💡 Should be 'in_house' to use the biometric service`);
      }
    }
  } catch (error: any) {
    console.log(`   ❌ Error checking settings: ${error.message}`);
  }

  console.log('\n' + '='.repeat(60));
  console.log('✅ Biometric Service Test Complete');
  console.log('='.repeat(60));

  console.log('\n📋 Next Steps:');
  console.log('1. Make sure verification_liveness_provider = in_house');
  console.log('2. Make sure verification_facematch_provider = in_house');
  console.log('3. Restart the backend to pick up provider changes');
  console.log('4. Test enrollment with real photos');
  console.log('\n💡 To update settings:');
  console.log(`   UPDATE settings SET value = 'in_house' WHERE key = 'verification_liveness_provider';`);
  console.log(`   UPDATE settings SET value = 'in_house' WHERE key = 'verification_facematch_provider';`);

  process.exit(0);
}

testBiometricService().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
