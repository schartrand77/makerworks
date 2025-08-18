import { describe, it, expect, vi, beforeEach } from 'vitest'
import axios from '@/api/axios'
import { uploadAvatar, updateUserProfile, deleteAccount } from '../users'
import { useAuthStore } from '@/store/useAuthStore'

vi.mock('@/api/axios')

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

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubGlobal('localStorage', createStorageMock())
  vi.stubGlobal('sessionStorage', createStorageMock())
  useAuthStore.setState({
    user: { id: '1', email: 'e', username: 'u', role: 'user' } as any,
    fetchUser: vi.fn().mockResolvedValue(null)
  })
  ;(axios.get as any).mockResolvedValue({ data: { id: '1', email: 'e' } })
})

describe('users.ts', () => {
  it('uploads avatar', async () => {
    const fakeRes = { data: { status: 'ok', avatar_url: 'x', thumbnail_url: 'y', uploaded_at: 'now' } }
    ;(axios.post as any).mockResolvedValue(fakeRes)

    const file = new File([''], 'avatar.png')
    const result = await uploadAvatar(file)

    expect(result?.status).toBe('ok')
    expect(axios.post).toHaveBeenCalledWith(
      '/avatar',
      expect.any(FormData),
      expect.any(Object)
    )
    expect(useAuthStore.getState().fetchUser).toHaveBeenCalledWith(true)
  })

  it('updates user profile', async () => {
    (axios.patch as any).mockResolvedValue({})

    await expect(
      updateUserProfile({ username: 'valid', email: 'test@example.com' })
    ).resolves.not.toThrow()

    expect(axios.patch).toHaveBeenCalledWith(
      '/users/me',
      expect.objectContaining({ username: 'valid' })
    )
  })

  it('throws on invalid profile', async () => {
    await expect(
      updateUserProfile({ email: 'not-an-email' })
    ).rejects.toThrow()
  })

  it('deletes account', async () => {
    (axios.delete as any).mockResolvedValue({})

    await expect(deleteAccount()).resolves.not.toThrow()

    expect(axios.delete).toHaveBeenCalledWith('/users/me')
  })
})
