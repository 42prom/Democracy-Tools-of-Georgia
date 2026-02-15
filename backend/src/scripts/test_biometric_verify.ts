import axios from 'axios';


// Simple red and blue 1x1 pixel base64 (valid enough for decode test)
const redPixel = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const bluePixel = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mPs/w8AAwIBAD91I64AAAAASUVORK5CYII=';

async function test() {
  const url = 'http://localhost:8000/verify';
  console.log(`Testing POST /verify at: ${url}`);
  try {
    const response = await axios.post(url, {
      image1_base64: redPixel,
      image2_base64: bluePixel
    }, { timeout: 10000 });
    
    console.log('SUCCESS!');
    console.log('Data:', JSON.stringify(response.data, null, 2));
  } catch (error: any) {
    console.error('VERIFY FAILED!');
    console.error('Message:', error.message);
    if (error.response) {
      console.error('Response Status:', error.response.status);
      console.error('Response Data:', error.response.data);
    }
  }
}

test();
