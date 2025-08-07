import redis from './redisClient';

const SESSION_TTL_SECONDS = 7200; // 2 hours

// Define a session shape
export interface SessionData {
  userId: string;
  username: string;
  email: string;
  role: string;
  [key: string]: any; // allow extra fields
}

/**
 * Get session from Redis by token.
 */
export async function getSessionFromCache(token: string): Promise<SessionData | null> {
  const key = `session:${token}`;
  try {
    const data = await redis.get(key);
    if (!data) return null;

    try {
      return JSON.parse(data) as SessionData;
    } catch (err) {
      console.error(`[sessionCache] Failed to parse session JSON for ${key}`, err);
      return null;
    }
  } catch (err) {
    console.error(`[sessionCache] Redis GET failed for ${key}`, err);
    return null;
  }
}

/**
 * Set session in Redis with optional TTL.
 */
export async function setSessionCache(
  token: string,
  sessionData: SessionData,
  ttl: number = SESSION_TTL_SECONDS
): Promise<void> {
  const key = `session:${token}`;
  try {
    if (ttl <= 0) {
      console.warn(`[sessionCache] Invalid TTL ${ttl}, defaulting to ${SESSION_TTL_SECONDS}`);
      ttl = SESSION_TTL_SECONDS;
    }
    await redis.set(key, JSON.stringify(sessionData), 'EX', ttl);
  } catch (err) {
    console.error(`[sessionCache] Redis SET failed for ${key}`, err);
  }
}

/**
 * Invalidate (delete) a session from Redis.
 */
export async function invalidateSessionCache(token: string): Promise<void> {
  const key = `session:${token}`;
  try {
    await redis.del(key);
  } catch (err) {
    console.error(`[sessionCache] Redis DEL failed for ${key}`, err);
  }
}
