import { createClient } from 'redis';
import { getRedisUrl } from '../config/secrets';

const redisClient = createClient({
  url: getRedisUrl(),
  socket: {
    // Reconnect strategy with exponential backoff
    reconnectStrategy: (retries) => {
      if (retries > 10) {
        console.error('[Redis] Max reconnection attempts reached. Giving up.');
        return new Error('Redis reconnection failed');
      }
      // Exponential backoff: 50ms, 100ms, 200ms, 400ms, ..., max 5s
      const delay = Math.min(50 * Math.pow(2, retries), 5000);
      // Add jitter (±20%)
      const jitter = delay * 0.2 * (Math.random() - 0.5);
      const finalDelay = Math.floor(delay + jitter);
      console.log(`[Redis] Reconnecting in ${finalDelay}ms (attempt ${retries + 1}/10)...`);
      return finalDelay;
    },
    // Command timeout: 5 seconds
    connectTimeout: 10000,
  },
});

redisClient.on('error', (err) => {
  console.error('[Redis] Client Error:', err.message);
  if (err.message.includes('closed')) {
    console.error('[Redis] Warning: Client is in CLOSED state. Operations will fail.');
  }
});

redisClient.on('connect', () => {
  console.log('✓ Redis client connected');
});

redisClient.on('reconnecting', () => {
  console.log('[Redis] Attempting to reconnect...');
});

redisClient.on('ready', () => {
  console.log('✓ Redis client ready');
});

/**
 * Connect to Redis
 */
export async function connectRedis(): Promise<void> {
  if (!redisClient.isOpen) {
    await redisClient.connect();
  }
}

/**
 * Check Redis connection health
 */
export async function checkRedisHealth(): Promise<boolean> {
  try {
    const pong = await redisClient.ping();
    return pong === 'PONG';
  } catch (error) {
    console.error('Redis health check failed', error);
    return false;
  }
}

/**
 * Close Redis connection (for graceful shutdown)
 */
export async function closeRedis(): Promise<void> {
  if (redisClient.isOpen) {
    await redisClient.quit();
  }
}

export default redisClient;
