import redisClient, { connectRedis } from '../src/db/redis';

async function checkRedis() {
  try {
    console.log('--- Connecting to Redis ---');
    await connectRedis();
    
    console.log('--- Scanning Redis for Biometric Limits ---');
    const keys = await redisClient.keys('biometric_ip_limit:*');
    console.log(`Found ${keys.length} keys.`);

    const results = [];
    for (const key of keys) {
      const ip = key.split(':')[1];
      const count = await redisClient.zCard(key);
      results.push({ ip, attempts: count });
    }
    
    console.log('--- RESULTS_START ---');
    console.log(JSON.stringify(results, null, 2));
    console.log('--- RESULTS_END ---');

  } catch (err) {
    console.error('Error checking Redis:', err);
  } finally {
    process.exit(0);
  }
}

checkRedis();
