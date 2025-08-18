import { describe, it, expect, vi, beforeEach } from 'vitest'
import axios from '@/api/client'
import { uploadAvatar, updateUserProfile, deleteAccount } from '../users'
import { useAuthStore } from '@/store/useAuthStore'
import type { UserOut } from '@/types/auth'
import type { AxiosResponse } from 'axios'

vi.mock('@/api/client')

interface AxiosMock {
  get: ReturnType<typeof vi.fn>
  post: ReturnType<typeof vi.fn>
  patch: ReturnType<typeof vi.fn>
  delete: ReturnType<typeof vi.fn>
}

const mockedAxios = axios as unknown as AxiosMock

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
  const fetchUserMock = vi.fn<[], Promise<UserOut | null>>().mockResolvedValue(null)
  useAuthStore.setState({
    user: { id: '1', email: 'e', username: 'u', role: 'user' } as UserOut,
    fetchUser: fetchUserMock,
  })
  mockedAxios.get.mockResolvedValue(
    { data: { id: '1', email: 'e' } } as AxiosResponse
  )
})

describe('users.ts', () => {
  it('uploads avatar', async () => {
    const fakeRes = {
      data: { status: 'ok', avatar_url: 'x', thumbnail_url: 'y', uploaded_at: 'now' },
    }
    mockedAxios.post.mockResolvedValue(fakeRes as AxiosResponse)

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
    mockedAxios.patch.mockResolvedValue({} as AxiosResponse)

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
    mockedAxios.delete.mockResolvedValue({} as AxiosResponse)

    await expect(deleteAccount()).resolves.not.toThrow()

    expect(axios.delete).toHaveBeenCalledWith('/users/me')
  })
})
