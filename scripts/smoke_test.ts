export {}; // Treat as module
declare const process: any; // Fallback for missing types

const BASE_URL = process.env.API_URL || 'http://localhost:3000/api/v1';

async function runSmokeTest() {
  console.log('🔥 Starting Smoke Test (fetch)...');
  console.log(`Target: ${BASE_URL}`);

  try {
    // 1. Health Check (Root)
    console.log('\n[1] Checking System Health...');
    try {
      const res = await fetch('http://localhost:3000/health');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const health = await res.json();
      console.log('✅ Health Check Passed:', health.status);
    } catch (err: any) {
      console.error('❌ Health Check Failed:', err.message);
    }

    // 2. Admin Login
    console.log('\n[2] Checking Admin Login...');
    let token = '';
    try {
      const res = await fetch(`${BASE_URL}/admin/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: process.env.ADMIN_EMAIL || 'admin@example.com',
          password: process.env.ADMIN_PASSWORD  // Required - no default weak password
        })
      });
      
      if (res.ok) {
        const data = await res.json();
        token = data.token;
        console.log('✅ Admin Login Passed. Token received.');
      } else {
        const errData = await res.json();
        console.error('⚠️ Admin Login Failed:', errData);
         console.log('   (This is expected if database seed has placeholder hash and no ENV override)');
      }
    } catch (err: any) {
      console.error('⚠️ Admin Login Failed (Network):', err.message);
    }

    // 3. Public Endpoints
    console.log('\n[3] Checking Public Polls...');
    try {
      const res = await fetch(`${BASE_URL}/enrollment/regions`);
      if (res.ok) {
         const regions = await res.json();
         console.log(`✅ Regions Fetch Passed. Got ${regions.length} regions.`);
      } else {
         throw new Error(`HTTP ${res.status}`);
      }
    } catch (err: any) {
      console.error('❌ Regions Fetch Failed:', err.message);
    }

    // 4. Rate Limiting Check
    console.log('\n[4] Checking Rate Headers...');
    try {
       const res = await fetch(`${BASE_URL}/enrollment/regions`);
       const headers: any = {};
       res.headers.forEach((v, k) => headers[k] = v);
       
       console.log('   Headers:', {
           'x-ratelimit-limit': headers['x-ratelimit-limit'],
           'x-ratelimit-remaining': headers['x-ratelimit-remaining'],
           'x-request-id': headers['x-request-id']
       });
       if (headers['x-request-id']) {
           console.log('✅ Request ID Header Present');
       } else {
           console.error('❌ Request ID Header Missing');
       }
    } catch (err: any) {
        console.error('❌ Rate Limit Check Failed');
    }

  } catch (error: any) {
    console.error('💥 Smoke Test Crash:', error.message);
    process.exit(1);
  }
}

runSmokeTest();
