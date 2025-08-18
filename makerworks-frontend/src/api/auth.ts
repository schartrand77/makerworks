// src/api/auth.ts
// congrats, you pasted a curl into a TypeScript file. here's a real API client instead.

import http from '@/api/axios'

export type ApiUser = {
  id: string
  email: string
  username: string
  name?: string | null
  is_verified: boolean
  is_active: boolean
  created_at?: string
  avatar_url?: string | null
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

/** Cookie-session sign in (no JWT endpoint needed). */
export async function apiSignIn(body: SignInBody): Promise<ApiUser> {
  const res = await http.post<SignInResponse>('auth/signin', body)
  return res.data.user
}

/** Create account; backend also sets cookies. */
export async function apiSignUp(body: SignUpBody): Promise<ApiUser> {
  const res = await http.post<SignUpResponse>('auth/signup', body)
  return res.data.user
}

/** Who am I (uses session cookie). */
export async function apiMe(): Promise<ApiUser> {
  const res = await http.get<ApiUser>('auth/me')
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
  const r = err?.response
  const d = r?.data
  if (typeof d === 'string') return d
  if (typeof d?.detail === 'string') return d.detail
  if (Array.isArray(d?.detail) && d.detail.length) {
    const first = d.detail[0]
    const loc = Array.isArray(first?.loc) ? first.loc.join('.') : ''
    const msg = first?.msg || first?.message || 'Invalid input'
    return [loc, msg].filter(Boolean).join(': ')
  }
  if (r?.status === 401) return 'Invalid credentials'
  if (r?.status) return `Error ${r.status}`
  return err?.message || 'Request failed'
}
