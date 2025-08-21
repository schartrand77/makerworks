// src/api/auth.ts
// congrats, you pasted a curl into a TypeScript file. here's a real API client instead.

// Import the same axios instance that tests mock
import http from '@/api/client'
import type { AxiosError } from 'axios'

export type ApiUser = {
  id: string
  email: string
  username: string
  name?: string | null
  is_verified: boolean
  is_active: boolean
  created_at?: string
  avatar_url?: string | null
  role?: string | null
  last_login?: string | null
}

// Backwards-compatible alias used by tests and older code
// Minimal user shape used by the frontend store and tests
export interface User {
  id: string
  email: string
  username: string
  name: string | null
  role?: string | null
  is_verified: boolean
  avatar_url: string | null
}

export type SignInBody = {
  /** backend expects this exact key */
  email_or_username: string
  password: string
}

export type SignUpBody = {
  email: string
  username: string
  password: string
}

type SignInResponse = { user: ApiUser }
type SignUpResponse = { user: ApiUser }

// Parameters accepted by the higher-level signIn() helper
export interface SignInParams {
  identifier: string
  password: string
}

/* ---------------------------- tiny runtime guards --------------------------- */

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v)
}

function coerceUser(u: unknown): ApiUser {
  if (!isRecord(u)) throw new Error('Invalid user payload')
  const id = String(u.id ?? '')
  const email = String(u.email ?? '')
  const username = String(u.username ?? '')
  if (!id || !email || !username) throw new Error('Invalid user payload')
  return {
    id,
    email,
    username,
    name: (u.name as string | null | undefined) ?? null,
    is_verified: Boolean(u.is_verified),
    is_active: u.is_active === undefined ? true : Boolean(u.is_active),
    created_at: (u.created_at as string | undefined) ?? undefined,
    avatar_url: (u.avatar_url as string | null | undefined) ?? null,
    role: (u.role as string | null | undefined) ?? null,
    last_login: (u.last_login as string | null | undefined) ?? null,
  }
}

function trim(s: string) {
  return s == null ? '' : String(s).trim()
}

/* --------------------------------- Auth API -------------------------------- */

/** Cookie-session sign in (no JWT endpoint needed). */
export async function apiSignIn(body: SignInBody): Promise<ApiUser> {
  const payload: SignInBody = {
    email_or_username: trim(body.email_or_username),
    password: trim(body.password),
  }
  const res = await http.post<SignInResponse>('auth/signin', payload)
  return coerceUser(res.data.user)
}

/** Create account; backend also sets cookies. */
export async function apiSignUp(body: SignUpBody): Promise<ApiUser> {
  const payload: SignUpBody = {
    email: trim(body.email),
    username: trim(body.username),
    password: trim(body.password),
  }
  const res = await http.post<SignUpResponse>('auth/signup', payload)
  return coerceUser(res.data.user)
}

/** Who am I (uses session cookie). */
export async function apiMe(): Promise<ApiUser> {
  const res = await http.get<ApiUser>('auth/me')
  return coerceUser(res.data)
}

/**
 * Helper used by the app (and tests) that wraps apiSignIn with a friendlier
 * interface and error codes. It accepts an `identifier` field instead of the
 * backend's `email_or_username` and normalises empty credentials / 401s to
 * custom error objects.
 */
export async function signIn({ identifier, password }: SignInParams): Promise<User> {
  const email_or_username = trim(identifier)
  const pwd = trim(password)
  if (!email_or_username || !pwd) {
    throw { code: 'E_BAD_INPUT' }
  }

  const res = await http.post<SignInResponse>('auth/signin', {
    email_or_username,
    password: pwd,
  })

  if (res.status === 401) {
    throw { code: 'E_AUTH' }
  }
  if (res.status !== 200) {
    throw new Error('Failed to sign in')
  }

  const u = coerceUser(res.data.user)
  return {
    id: u.id,
    email: u.email,
    username: u.username,
    name: u.name ?? null,
    role: u.role ?? null,
    is_verified: u.is_verified,
    avatar_url: u.avatar_url ?? null,
  }
}

/** Fetch the current user using the session cookie. */
export async function getCurrentUser(): Promise<User> {
  const res = await http.get<User>('auth/me')
  return res.data
}

/** Sign out; try POST first, fall back to GET on 405/404/422. */
export async function apiSignOut(): Promise<void> {
  try {
    await http.post('auth/signout', {})
  } catch (e: any) {
    const code = e?.response?.status
    if (code === 405 || code === 404 || code === 422) {
      await http.get('auth/signout')
      return
    }
    throw e
  }
}

/* ---------- helpers for nicer error messages ---------- */

export function explainAxiosError(err: any): string {
  // network/timeout first
  if (!err?.response) {
    if (err?.code === 'ERR_NETWORK') return 'Network error — is the server up?'
    if (err?.code === 'ECONNABORTED') return 'Request timed out'
    return err?.message || 'Request failed'
  }

  const r = err.response as AxiosError['response']
  const d = r?.data

  // plain string body
  if (typeof d === 'string') return d

  // FastAPI: {"detail": "some message"}
  if (typeof d?.detail === 'string') return d.detail

  // FastAPI v2: {"detail":"validation_error","errors":[{loc, msg, ...}, ...]}
  if (d?.detail === 'validation_error' && Array.isArray(d?.errors) && d.errors.length) {
    const first = d.errors[0] || {}
    const loc = Array.isArray(first?.loc) ? first.loc.join('.') : ''
    const msg = first?.msg || first?.message || 'Invalid input'
    return [loc, msg].filter(Boolean).join(': ')
  }

  // FastAPI: {"detail":[{loc:[...], msg:"...", type:"..."}]}
  if (Array.isArray(d?.detail) && d.detail.length) {
    const first = d.detail[0] || {}
    const loc = Array.isArray(first?.loc) ? first.loc.join('.') : ''
    const msg = first?.msg || first?.message || 'Invalid input'
    return [loc, msg].filter(Boolean).join(': ')
  }

  // Common HTTPs
  const status = r?.status
  if (status === 401) return 'Invalid credentials'
  if (status === 409) return 'Duplicate resource'
  if (typeof d?.message === 'string') return d.message
  if (status) return `Error ${status}`

  return err?.message || 'Request failed'
}
