import redis from './redisClient';
import { CachedUser } from './types';

const USER_TTL_SECONDS = 3600; // 1 hour

/**
 * Get a user from Redis cache.
 */
export async function getUserFromCache(userId: string): Promise<CachedUser | null> {
  const key = `user:${userId}`;
  try {
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
    await redis.del(key);
  } catch (err) {
    console.error(`[userCache] Redis DEL failed for ${key}`, err);
  }
}
