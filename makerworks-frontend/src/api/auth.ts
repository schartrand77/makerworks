// src/api/auth.ts
import axios from './client'
import { useAuthStore } from '@/store/useAuthStore'

interface CodedError extends Error {
  code?: string
}

export type SignInPayload = {
  /** preferred field; we’ll map to username_or_email for the backend */
  identifier?: string
  /** accepted for compatibility; mapped to identifier */
  email?: string
  /** accepted for compatibility; mapped to identifier */
  username?: string
  password: string
}

export type SignUpPayload = {
  email: string
  username: string
  password: string
}

export type User =
  | {
      id: string
      email: string
      username: string
      name: string | null
      bio?: string | null
      role?: 'user' | 'admin'
      is_verified?: boolean
      avatar_url?: string | null
    }
  | null

/** GET /api/v1/auth/me — returns user or null (401) */
export async function me(): Promise<User> {
  const res = await axios.get<User>('api/v1/auth/me', {
    withCredentials: true,
    validateStatus: (s) => s === 200 || s === 401,
  })

  if (res.status === 200) {
    const user = res.data
    try {
      useAuthStore.getState().setUser(user)
    } catch {}
    return user
  }

  // 401 → unauthenticated state
  try {
    useAuthStore.getState().clear()
  } catch {}
  return null
}

// --- Compatibility aliases so lazy chunks stop crying ---
export const getCurrentUser = me
export const apiGetCurrentUser = me
export const fetchCurrentUser = me

/** POST /api/v1/auth/signin — sets cookies/session; returns user */
export async function signIn(payload: SignInPayload): Promise<User> {
  const username_or_email =
    payload.identifier?.trim() ??
    payload.email?.trim() ??
    payload.username?.trim() ??
    ''

  const password = payload.password?.trim() ?? ''

  if (!username_or_email || !password) {
    const err: CodedError = new Error(
      'Missing credentials: provide identifier/email/username and password.'
    )
    err.code = 'E_BAD_INPUT'
    throw err
  }

  const res = await axios.post<{ user: User }>('api/v1/auth/signin', {
    username_or_email,
    password,
  }, {
    withCredentials: true,
    validateStatus: (s) =>
      (s >= 200 && s < 300) ||
      s === 400 ||
      s === 401 ||
      s === 403 ||
      s === 404 ||
      s === 405 ||
      s === 422,
  })

  // Handle common unhappy paths *cleanly*
  if (res.status === 422) {
    // FastAPI ValidationError shape: { detail: [...] } or { detail: "..." }
    const data = res.data as { detail?: Array<{ msg?: string }> | string }
    const detail =
      (Array.isArray(data.detail) ? data.detail[0]?.msg : data.detail) ??
      'Invalid sign-in payload.'
    const err: CodedError = new Error(String(detail))
    err.code = 'E_VALIDATION'
    throw err
  }

  if (res.status === 401) {
    const err: CodedError = new Error(
      'Invalid email/username or password.'
    )
    err.code = 'E_AUTH'
    throw err
  }

  if (res.status >= 400) {
    const err: CodedError = new Error(`Sign-in failed (${res.status}).`)
    err.code = `E_${res.status}`
    throw err
  }

  const user = res.data.user
  try {
    useAuthStore.getState().setUser(user)
  } catch {}
  return user
}

/** POST /api/v1/auth/signup — creates user & signs in; returns user */
export async function signUp(payload: SignUpPayload): Promise<User> {
  const res = await axios.post<{ user: User }>('api/v1/auth/signup', payload, {
    withCredentials: true,
  })
  const user = res.data.user
  try {
    useAuthStore.getState().setUser(user)
  } catch {}
  return user
}

/**
 * POST /api/v1/auth/signout — best-effort (handles 401/405/etc. quietly)
 * Always clears client state.
 */
export async function signOut(): Promise<void> {
  try {
    await axios.post('api/v1/auth/signout', null, {
      withCredentials: true,
      validateStatus: (s) =>
        (s >= 200 && s < 300) ||
        s === 401 ||
        s === 403 ||
        s === 404 ||
        s === 405 ||
        s === 422,
    })
  } catch {
    // network error? shrug
  } finally {
    try {
      await useAuthStore.getState().logout()
    } catch {}
  }
}

// Also export a “logout” alias because of course someone imported that once.
export const logout = signOut

const authApi = {
  me,
  getCurrentUser,
  apiGetCurrentUser,
  fetchCurrentUser,
  signIn,
  signUp,
  signOut,
  logout,
}
export default authApi
