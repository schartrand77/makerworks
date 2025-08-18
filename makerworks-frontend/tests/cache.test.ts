import { describe, it, expect, beforeEach, vi } from 'vitest'

const mockRedis = {
  get: vi.fn(),
  set: vi.fn(),
  del: vi.fn(),
}

vi.mock('../server/cache/redisClient', () => ({
  getRedisClient: vi.fn().mockResolvedValue(mockRedis),
}))

import { getUserFromCache, setUserCache, invalidateUserCache } from '../server/cache/userCache'
import { getSessionFromCache, setSessionCache, invalidateSessionCache } from '../server/cache/sessionCache'

describe('user cache utilities', () => {
  beforeEach(() => {
    mockRedis.get.mockReset()
    mockRedis.set.mockReset()
    mockRedis.del.mockReset()
  })

  it('sets, retrieves and invalidates user data', async () => {
    const user = { id: '1', username: 't', email: 'e', role: 'user' }
    await setUserCache('1', user, 10)
    expect(mockRedis.set).toHaveBeenCalledWith('user:1', JSON.stringify(user), 'EX', 10)

    mockRedis.get.mockResolvedValueOnce(JSON.stringify(user))
    const cached = await getUserFromCache('1')
    expect(mockRedis.get).toHaveBeenCalledWith('user:1')
    expect(cached).toEqual(user)

    await invalidateUserCache('1')
    expect(mockRedis.del).toHaveBeenCalledWith('user:1')
  })
})

describe('session cache utilities', () => {
  beforeEach(() => {
    mockRedis.get.mockReset()
    mockRedis.set.mockReset()
    mockRedis.del.mockReset()
  })

  it('sets, retrieves and invalidates session data', async () => {
    const session = { userId: '1', username: 'u', email: 'e', role: 'user' }
    await setSessionCache('tok', session, 20)
    expect(mockRedis.set).toHaveBeenCalledWith('session:tok', JSON.stringify(session), 'EX', 20)

    mockRedis.get.mockResolvedValueOnce(JSON.stringify(session))
    const cached = await getSessionFromCache('tok')
    expect(mockRedis.get).toHaveBeenCalledWith('session:tok')
    expect(cached).toEqual(session)

    await invalidateSessionCache('tok')
    expect(mockRedis.del).toHaveBeenCalledWith('session:tok')
  })
})
