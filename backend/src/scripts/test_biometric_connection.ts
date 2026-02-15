import axios from 'axios';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });

const url = process.env.BIOMETRIC_SERVICE_URL || 'http://localhost:8000';

async function test() {
  console.log(`Testing connection to Biometric Service at: ${url}`);
  try {
    const start = Date.now();
    const response = await axios.get(`${url}/health`, { timeout: 5000 });
    const duration = Date.now() - start;
    console.log('SUCCESS!');
    console.log('Status:', response.status);
    console.log('Data:', response.data);
    console.log(`Latency: ${duration}ms`);
  } catch (error: any) {
    console.error('CONNECTION FAILED!');
    console.error('Message:', error.message);
    if (error.code) console.error('Code:', error.code);
    if (error.response) {
      console.error('Response Status:', error.response.status);
      console.error('Response Data:', error.response.data);
    }
  }
}

test();
