// src/api/auth.ts
import axios from './axios'
import { useAuthStore } from '@/store/useAuthStore'

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
  const res = await axios.get('api/v1/auth/me', {
    withCredentials: true,
    validateStatus: (s) => s === 200 || s === 401,
  })

  if (res.status === 200) {
    const user = res.data as User
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
    const err = new Error('Missing credentials: provide identifier/email/username and password.')
    ;(err as any).code = 'E_BAD_INPUT'
    throw err
  }

  const res = await axios.post(
    'api/v1/auth/signin',
    { username_or_email, password },
    {
      withCredentials: true,
      validateStatus: (s) =>
        (s >= 200 && s < 300) ||
        s === 400 ||
        s === 401 ||
        s === 403 ||
        s === 404 ||
        s === 405 ||
        s === 422,
    }
  )

  // Handle common unhappy paths *cleanly*
  if (res.status === 422) {
    // FastAPI ValidationError shape: { detail: [...] } or { detail: "..." }
    const detail =
      (Array.isArray(res.data?.detail) ? res.data.detail[0]?.msg : res.data?.detail) ??
      'Invalid sign-in payload.'
    const err = new Error(String(detail))
    ;(err as any).code = 'E_VALIDATION'
    throw err
  }

  if (res.status === 401) {
    const err = new Error('Invalid email/username or password.')
    ;(err as any).code = 'E_AUTH'
    throw err
  }

  if (res.status >= 400) {
    const err = new Error(`Sign-in failed (${res.status}).`)
    ;(err as any).code = `E_${res.status}`
    throw err
  }

  const user = (res.data as any)?.user as User
  try {
    useAuthStore.getState().setUser(user)
  } catch {}
  return user
}

/** POST /api/v1/auth/signup — creates user & signs in; returns user */
export async function signUp(payload: SignUpPayload): Promise<User> {
  const res = await axios.post('api/v1/auth/signup', payload, {
    withCredentials: true,
  })
  const user = (res.data as any)?.user as User
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
