// src/api/axios.ts
import axios from 'axios'
import { useAuthStore } from '@/store/useAuthStore'

// Base URL rules:
// - Prefer VITE_API_BASE_URL (e.g. http://localhost:8000)
// - Fallback to VITE_API_URL
// - Final fallback: http://localhost:8000
// NOTE: Do NOT include /api/v1 here — callers should pass full paths like `/api/v1/auth/me`
const rawBase =
  (import.meta.env as any)?.VITE_API_BASE_URL ??
  (import.meta.env as any)?.VITE_API_URL ??
  'http://localhost:8000'

// strip trailing slashes for consistency
const base = String(rawBase).replace(/\/+$/, '')

const instance = axios.create({
  baseURL: base,
  withCredentials: true, // send cookies by default
  headers: {
    Accept: 'application/json',
  },
})

// Optional debug logging (enabled in dev unless VITE_AXIOS_DEBUG=0; or force with =1)
const DEBUG_AXIOS =
  ((import.meta.env as any)?.DEV && (import.meta.env as any)?.VITE_AXIOS_DEBUG !== '0') ||
  (import.meta.env as any)?.VITE_AXIOS_DEBUG === '1'

instance.interceptors.request.use(
  (config) => {
    // Attach Bearer token if present (works alongside cookie sessions)
    try {
      const token = useAuthStore.getState().token
      if (token) {
        config.headers = config.headers || {}
        ;(config.headers as any).Authorization = `Bearer ${token}`
      }
    } catch {
      // store not available (SSR/tests) — ignore
    }

    if (DEBUG_AXIOS) {
      try {
        const finalUrl = new URL(config.url ?? '', config.baseURL ?? window.location.origin).toString()
        // eslint-disable-next-line no-console
        console.info(`[axios] ${String(config.method || 'GET').toUpperCase()} ${finalUrl}`)
      } catch {
        // eslint-disable-next-line no-console
        console.info(`[axios] ${String(config.method || 'GET').toUpperCase()} ${(config.baseURL || '') + (config.url || '')}`)
      }
    }
    return config
  },
  (error) => Promise.reject(error)
)

export default instance
