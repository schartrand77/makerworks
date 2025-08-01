// src/api/auth.ts
import axios from './axios'
import { useAuthStore } from '@/store/useAuthStore'
import { UserOut } from '@/types/auth'

interface SignInResponse {
  user: UserOut
  token?: string // optional session token if backend returns one
}

/**
 * POST /auth/signin
 */
export async function signIn(
  payload: { email_or_username: string; password: string }
): Promise<SignInResponse> {
  const res = await axios.post<SignInResponse>('/auth/signin', payload)
  const { user } = res.data

  // persist user in Zustand + localStorage
  useAuthStore.getState().setUser(user)

  return res.data
}

/**
 * POST /auth/signup
 */
export async function signUp(
  payload: { email: string; username: string; password: string }
): Promise<SignInResponse> {
  const res = await axios.post<SignInResponse>('/auth/signup', payload)
  const { user } = res.data

  // persist user in Zustand + localStorage
  useAuthStore.getState().setUser(user)

  return res.data
}

/**
 * GET /auth/me
 */
export async function getCurrentUser(): Promise<UserOut> {
  const res = await axios.get<UserOut>('/auth/me')
  const user = res.data

  // hydrate store (e.g. during SSR or PWA cold start)
  useAuthStore.getState().setUser(user)

  return user
}

/**
 * Local logout — clears auth state.
 * Optional: also call /auth/signout if backend supports it.
 */
export function logout(): void {
  useAuthStore.getState().logout()
}
