// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { renderHook, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import axios from '@/api/client'
import { useSignIn } from '../useSignIn'
import { useAuthStore } from '@/store/useAuthStore'

vi.mock('@/api/client')

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
    }
  }
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubGlobal('localStorage', createStorageMock())
  vi.stubGlobal('sessionStorage', createStorageMock())
  useAuthStore.setState({
    user: null,
    setAuth: vi.fn(),
    fetchUser: vi.fn().mockResolvedValue(null)
  })
})

describe('useSignIn', () => {
  it('fetches profile after successful sign in', async () => {
    ;(axios.post as any).mockResolvedValue({
      status: 200,
      data: {
        user: { id: '1', username: 'u', email: 'e', role: 'user' }
      }
    })

    const wrapper = ({ children }: any) => <MemoryRouter>{children}</MemoryRouter>
    const { result } = renderHook(() => useSignIn(), { wrapper })
    await act(async () => {
      await result.current.signIn('u', 'p')
    })

    expect(useAuthStore.getState().setAuth).toHaveBeenCalledWith({
      user: { id: '1', username: 'u', email: 'e', role: 'user' }
    })
    expect(useAuthStore.getState().fetchUser).not.toHaveBeenCalled()
  })
})
