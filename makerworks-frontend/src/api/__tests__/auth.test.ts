import { describe, it, expect, vi, beforeEach } from 'vitest'
import axios from '@/api/client'
import { signIn } from '../auth'
import { useAuthStore } from '@/store/useAuthStore'
import type { AxiosResponse } from 'axios'
import type { User } from '../auth'

vi.mock('@/api/client')

interface AxiosMock {
  post: ReturnType<typeof vi.fn>
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
  useAuthStore.setState({ user: null })
})

describe('auth.signIn', () => {
  it('throws coded error for missing credentials', async () => {
    await expect(signIn({ identifier: '', password: '' })).rejects.toMatchObject({
      code: 'E_BAD_INPUT',
    })
  })

  it('throws coded error for unauthorized', async () => {
    mockedAxios.post.mockResolvedValue({ status: 401, data: {} } as AxiosResponse)
    await expect(
      signIn({ identifier: 'u', password: 'p' })
    ).rejects.toMatchObject({ code: 'E_AUTH' })
  })

  it('returns user on success', async () => {
    const user: User = {
      id: '1',
      email: 'e',
      username: 'u',
      name: null,
      role: 'user',
      is_verified: true,
      avatar_url: null,
    }
    mockedAxios.post.mockResolvedValue({
      status: 200,
      data: { user },
    } as AxiosResponse)
    const result = await signIn({ identifier: 'u', password: 'p' })
    expect(result).toEqual(user)
  })
})
