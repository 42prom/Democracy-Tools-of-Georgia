/**
 * Test mobile app enrollment endpoints
 * Run: npx tsx backend/test_mobile_enrollment.ts
 */

import axios from 'axios';

const BASE_URL = 'http://localhost:3000/api/v1';

async function testEndpoint(method: string, url: string, data?: any, headers?: any) {
  try {
    const response = await axios({
      method,
      url: `${BASE_URL}${url}`,
      data,
      headers: headers || { 'Content-Type': 'application/json' },
      timeout: 5000,
    });
    console.log(`   ✅ ${method} ${url} - Status: ${response.status}`);
    console.log(`      Response: ${JSON.stringify(response.data).substring(0, 150)}...\n`);
    return response.data;
  } catch (error: any) {
    if (error.response) {
      console.log(`   ❌ ${method} ${url} - Status: ${error.response.status}`);
      console.log(`      Error: ${JSON.stringify(error.response.data).substring(0, 200)}\n`);
    } else {
      console.log(`   ❌ ${method} ${url} - Error: ${error.message}\n`);
    }
    return null;
  }
}

async function testMobileEnrollment() {
  console.log('🧪 Testing Mobile App Enrollment Flow\n');
  console.log('='.repeat(60));

  // 1. Test health endpoint
  console.log('\n1️⃣ Health Check');
  await testEndpoint('GET', '/../');

  // 2. Test GET regions
  console.log('\n2️⃣ Get Regions (GET /enrollment/regions)');
  await testEndpoint('GET', '/enrollment/regions');

  // 3. Test enrollment status
  console.log('\n3️⃣ Check Enrollment Status (POST /enrollment/status)');
  await testEndpoint('POST', '/enrollment/status', {
    enrollmentSessionId: 'test-session-id'
  });

  // 4. Test create profile
  console.log('\n4️⃣ Create Profile (POST /enrollment/profile)');
  await testEndpoint('POST', '/enrollment/profile', {
    enrollmentSessionId: 'test-session-id',
    firstName: 'Test',
    lastName: 'User'
  });

  // 5. Test NFC submission
  console.log('\n5️⃣ Submit NFC Data (POST /enrollment/nfc)');
  await testEndpoint('POST', '/enrollment/nfc', {
    enrollmentSessionId: 'test-session-id',
    nfcPayload: {
      personalNumber: '01024054729',
      nationality: 'GEO',
      dob: '01-01-1991',
      gender: 'M'
    }
  });

  // 6. Test document submission
  console.log('\n6️⃣ Submit Document (POST /enrollment/document)');
  await testEndpoint('POST', '/enrollment/document', {
    enrollmentSessionId: 'test-session-id',
    personalNumber: '01024054729',
    dob: '01-01-1991'
  });

  // 7. Test verify biometrics
  console.log('\n7️⃣ Verify Biometrics (POST /enrollment/verify-biometrics)');
  await testEndpoint('POST', '/enrollment/verify-biometrics', {
    enrollmentSessionId: 'test-session-id',
    livenessScore: 0.95,
    faceMatchScore: 0.92
  });

  // 8. Test polls endpoint (requires auth)
  console.log('\n8️⃣ Get Polls (GET /polls) - should fail without auth');
  await testEndpoint('GET', '/polls');

  // 9. Test auth challenge
  console.log('\n9️⃣ Get Auth Challenge (POST /auth/challenge)');
  const challenge = await testEndpoint('POST', '/auth/challenge', {
    deviceId: 'test-device-123',
    purpose: 'vote'
  });

  console.log('\n' + '='.repeat(60));
  console.log('✅ Mobile enrollment endpoint test complete');
  console.log('='.repeat(60));
}

testMobileEnrollment().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
