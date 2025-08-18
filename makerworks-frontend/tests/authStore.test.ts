import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('@/api/client', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
  },
}))

function createStorageMock() {
  let store: Record<string, string> = {}
  return {
    getItem: (key: string) => (key in store ? store[key] : null),
    setItem: (key: string, value: string) => {
      store[key] = value
    },
    removeItem: (key: string) => {
      delete store[key]
    },
    clear: () => {
      store = {}
    },
    key: (i: number) => Object.keys(store)[i] || null,
    get length() {
      return Object.keys(store).length
    },
  }
}

describe('useAuthStore state transitions', () => {
  let useAuthStore: typeof import('@/store/useAuthStore').useAuthStore
  let client: {
    get: ReturnType<typeof vi.fn>
    post: ReturnType<typeof vi.fn>
  }

  beforeEach(async () => {
    vi.resetModules()
    vi.clearAllMocks()
    vi.stubGlobal('localStorage', createStorageMock())
    vi.stubGlobal('sessionStorage', createStorageMock())
    ;({ useAuthStore } = await import('@/store/useAuthStore'))
    client = (await import('@/api/client')).default
  })

  it('logs in via setAuth', () => {
    const user = { id: '1', username: 'u', email: 'e', role: 'user' }
    useAuthStore.getState().setAuth({ user })
    const state = useAuthStore.getState()
    expect(state.user).toEqual(user)
    expect(state.resolved).toBe(true)
    expect(state.hadUser).toBe(true)
    expect(state.lastAuthStatus).toBe(200)
  })

  it('logs out and clears state', async () => {
    client.post.mockResolvedValueOnce({ status: 200 })
    useAuthStore.getState().setAuth({ user: { id: '1', username: 'u', email: 'e', role: 'user' } })
    await useAuthStore.getState().logout()
    const state = useAuthStore.getState()
    expect(client.post).toHaveBeenCalled()
    expect(state.user).toBeNull()
    expect(state.loading).toBe(false)
    expect(state.resolved).toBe(true)
  })

  it('refreshes user via fetchUser', async () => {
    const user = { id: '1', username: 'u', email: 'e', role: 'user' }
    client.get.mockResolvedValueOnce({ status: 200, data: user })
    const fetched = await useAuthStore.getState().fetchUser(true)
    expect(client.get).toHaveBeenCalledWith('api/v1/auth/me', expect.anything())
    expect(fetched).toEqual(user)
    expect(useAuthStore.getState().user).toEqual(user)

    client.get.mockResolvedValueOnce({ status: 401, data: { detail: 'unauth' } })
    const res = await useAuthStore.getState().fetchUser(true)
    expect(res).toBeNull()
    expect(useAuthStore.getState().user).toBeNull()
  })
})
