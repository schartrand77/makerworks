import type Redis from 'ioredis';

let client: Redis | null = null;

/**
 * Dynamically create (or reuse) a Redis client. Only runs on the server.
 */
export async function getRedisClient(): Promise<Redis> {
  if (client) return client;
  if (typeof window !== 'undefined') {
    throw new Error('Redis client should not be used in the browser');
  }

  const { default: Redis } = await import('ioredis');
  client = new Redis({
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
    db: parseInt(process.env.REDIS_DB || '0', 10),
    lazyConnect: true,
    tls: process.env.REDIS_TLS === 'true' ? {} : undefined,
  });

  client.on('connect', () => console.log('[Redis] ✅ Connected'));
  client.on('ready', () => console.log('[Redis] 🔄 Ready'));
  client.on('error', (err) => console.error('[Redis] ❌ Error', err));
  client.on('close', () => console.warn('[Redis] 🚪 Connection closed'));
  client.on('reconnecting', () => console.log('[Redis] 🔄 Reconnecting…'));
  client.on('end', () => console.warn('[Redis] 🛑 Connection ended'));

  return client;
}

export const connectRedis = async (): Promise<void> => {
  const redis = await getRedisClient();
  if (redis.status === 'ready') {
    console.log('[Redis] Already connected.');
    return;
  }
  if (redis.status === 'connecting') {
    console.log('[Redis] Connection already in progress.');
    return;
  }
  try {
    await redis.connect();
    console.log('[Redis] Connection established.');
  } catch (err) {
    console.error('[Redis] Failed to connect', err);
  }
};

export const disconnectRedis = async (): Promise<void> => {
  const redis = client;
  if (redis && (redis.status === 'ready' || redis.status === 'connecting')) {
    try {
      await redis.quit();
      console.log('[Redis] Disconnected cleanly.');
    } catch (err) {
      console.error('[Redis] Error during disconnect', err);
    }
  } else {
    console.log('[Redis] Not connected; no need to disconnect.');
  }
};

export default getRedisClient;
