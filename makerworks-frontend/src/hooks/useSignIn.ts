// src/hooks/useSignIn.ts
import { useState, useCallback } from 'react'
import http from '@/api/client'

export type SignInState = 'idle' | 'loading' | 'success' | 'error'

function storeTokenMaybe(data: any) {
  const token = data?.access_token ?? data?.token ?? data?.accessToken ?? null
  if (!token) return
  try {
    localStorage.setItem('token', String(token))
  } catch {
    // ignore storage failures (Safari private mode, etc.)
  }
}

function extractError(err: any): string {
  const resp = err?.response
  const data = resp?.data

  // FastAPI common shapes
  if (typeof data?.detail === 'string') return data.detail
  if (Array.isArray(data?.detail) && data.detail.length) {
    const first = data.detail[0] || {}
    const loc = Array.isArray(first?.loc) ? first.loc.join('.') : ''
    const msg = first?.msg || first?.message || 'Invalid input'
    return [loc, msg].filter(Boolean).join(': ')
  }
  if (data?.message) return String(data.message)

  if (!resp) {
    if (err?.code === 'ECONNABORTED') return 'Login request timed out.'
    if (err?.code === 'ERR_NETWORK') return 'Network error — is the server up?'
    return err?.message || 'Login failed.'
  }

  return `HTTP ${resp.status}${resp.statusText ? ' ' + resp.statusText : ''}`
}

export const useSignIn = () => {
  const [state, setState] = useState<SignInState>('idle')
  const [error, setError] = useState<string | null>(null)

  const signIn = useCallback(async (identifier: string, password: string) => {
    setState('loading')
    setError(null)

    const postJson = (body: Record<string, string>) =>
      http.post('auth/signin', body, {
        withCredentials: true,
        timeout: 15000,
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      })

    const postForm = (pairs: Record<string, string>) => {
      const form = new URLSearchParams()
      for (const [k, v] of Object.entries(pairs)) form.set(k, v)
      return http.post('auth/signin', form, {
        withCredentials: true,
        timeout: 15000,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      })
    }

    // Attempt order:
    // 1) JSON { email_or_username, password }  ← your backend expects this
    // 2) JSON { email, password }
    // 3) JSON { username, password }
    // 4) FORM { email_or_username, password }
    const attempts: Array<() => Promise<any>> = [
      () => postJson({ email_or_username: identifier, password }),
      () => postJson({ email: identifier, password }),
      () => postJson({ username: identifier, password }),
      () => postForm({ email_or_username: identifier, password }),
    ]

    for (const attempt of attempts) {
      try {
        const res = await attempt()
        storeTokenMaybe(res?.data)
        setState('success')
        return true
      } catch (err: any) {
        // If it’s not a 422 (schema mismatch), surface the error immediately.
        const status = err?.response?.status
        if (!status || status !== 422) {
          setError(extractError(err))
          setState('error')
          return false
        }
        // else try the next payload shape
      }
    }

    setError('Bad credentials payload (422). Backend rejected all tested payload shapes.')
    setState('error')
    return false
  }, [])

  return { signIn, state, error }
}

export default useSignIn
