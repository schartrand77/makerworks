import { describe, it, expect, beforeEach, vi } from 'vitest'
vi.mock('@/api/axios', () => ({ default: { post: vi.fn() } }))

function createLocalStorageMock() {
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

describe('useAuthStore.logout', () => {
  let useAuthStore: typeof import('../useAuthStore').useAuthStore

  beforeEach(async () => {
    vi.resetModules()
    vi.stubGlobal('localStorage', createLocalStorageMock())
    vi.stubGlobal('sessionStorage', createLocalStorageMock())
    ;({ useAuthStore } = await import('../useAuthStore'))
    useAuthStore.setState({ user: { id: '1', email: 'e', username: 'u', role: 'user' } })
    localStorage.setItem('auth-storage', JSON.stringify({ state: { user: { id: '1' } } }))
  })

  it('clears auth-storage without stray keys', async () => {
    const before = localStorage.getItem('auth-storage')
    expect(before).toBeTruthy()
    await useAuthStore.getState().logout()
    expect(localStorage.getItem('auth-storage')).toBeNull()
    expect(localStorage.length).toBe(0)
  })
})
