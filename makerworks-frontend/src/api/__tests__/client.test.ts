import { describe, it, expect } from 'vitest'
import { createApiClient } from '@/api/client'
import type { InternalAxiosRequestConfig, AxiosResponse } from 'axios'

function stubAdapter(captured: { config?: InternalAxiosRequestConfig }) {
  return (config: InternalAxiosRequestConfig): Promise<AxiosResponse> => {
    captured.config = config
    return Promise.resolve({
      data: {},
      status: 200,
      statusText: 'OK',
      headers: {},
      config,
    })
  }
}

describe('createApiClient URL rewriting', () => {
  it('rewrites legacy user path', async () => {
    const captured: { config?: InternalAxiosRequestConfig } = {}
    const api = createApiClient()
    api.defaults.adapter = stubAdapter(captured)
    await api.get('/users/me')
    expect(captured.config?.url).toBe('/api/v1/auth/me')
    expect(captured.config?.baseURL).toBe('http://localhost:8000')
  })

  it('rewrites legacy uploads path', async () => {
    const captured: { config?: InternalAxiosRequestConfig } = {}
    const api = createApiClient()
    api.defaults.adapter = stubAdapter(captured)
    await api.get('/users/123/uploads')
    expect(captured.config?.url).toBe('/api/v1/admin/users/123/uploads')
  })

  it('handles absolute same-origin URLs', async () => {
    const captured: { config?: InternalAxiosRequestConfig } = {}
    const api = createApiClient()
    api.defaults.adapter = stubAdapter(captured)
    await api.get('http://localhost:8000/users/me')
    expect(captured.config?.url).toBe('http://localhost:8000/api/v1/auth/me')
  })
})
