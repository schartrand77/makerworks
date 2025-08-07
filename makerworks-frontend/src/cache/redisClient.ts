import Redis from 'ioredis';

const redis = new Redis({
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD || undefined,
  db: parseInt(process.env.REDIS_DB || '0', 10),
  lazyConnect: true, // only connect when .connect() is called
  tls: process.env.REDIS_TLS === 'true' ? {} : undefined, // support secured redis
});

redis.on('connect', () => console.log('[Redis] ✅ Connected'));
redis.on('ready', () => console.log('[Redis] 🔄 Ready'));
redis.on('error', (err) => console.error('[Redis] ❌ Error', err));
redis.on('close', () => console.warn('[Redis] 🚪 Connection closed'));
redis.on('reconnecting', () => console.log('[Redis] 🔄 Reconnecting…'));
redis.on('end', () => console.warn('[Redis] 🛑 Connection ended'));

export const connectRedis = async (): Promise<void> => {
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
  if (redis.status === 'ready' || redis.status === 'connecting') {
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

export default redis;
