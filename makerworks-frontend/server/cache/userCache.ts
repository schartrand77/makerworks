import type Redis from 'ioredis';
import { CachedUser } from './types';

let redisPromise: Promise<Redis> | null = null;

const getRedis = async (): Promise<Redis> => {
  if (typeof window !== 'undefined') {
    throw new Error('userCache should only run on the server');
  }
  if (!redisPromise) {
    redisPromise = import('./redisClient').then((m) => m.getRedisClient());
  }
  return redisPromise;
};

const USER_TTL_SECONDS = 3600; // 1 hour

/**
 * Get a user from Redis cache.
 */
export async function getUserFromCache(userId: string): Promise<CachedUser | null> {
  const key = `user:${userId}`;
  try {
    const redis = await getRedis();
    const data = await redis.get(key);
    if (!data) return null;

    try {
      return JSON.parse(data) as CachedUser;
    } catch (err) {
      console.error(`[userCache] Failed to parse JSON for ${key}`, err);
      return null;
    }
  } catch (err) {
    console.error(`[userCache] Redis GET failed for ${key}`, err);
    return null;
  }
}

/**
 * Set a user in Redis cache with TTL.
 */
export async function setUserCache(
  userId: string,
  userData: CachedUser,
  ttl: number = USER_TTL_SECONDS
): Promise<void> {
  const key = `user:${userId}`;
  try {
    if (ttl <= 0) {
      console.warn(`[userCache] Invalid TTL (${ttl}) for ${key}, defaulting to ${USER_TTL_SECONDS}`);
      ttl = USER_TTL_SECONDS;
    }

    const redis = await getRedis();
    await redis.set(key, JSON.stringify(userData), 'EX', ttl);
  } catch (err) {
    console.error(`[userCache] Redis SET failed for ${key}`, err);
  }
}

/**
 * Invalidate (delete) a user from Redis cache.
 */
export async function invalidateUserCache(userId: string): Promise<void> {
  const key = `user:${userId}`;
  try {
    const redis = await getRedis();
    await redis.del(key);
  } catch (err) {
    console.error(`[userCache] Redis DEL failed for ${key}`, err);
  }
}
