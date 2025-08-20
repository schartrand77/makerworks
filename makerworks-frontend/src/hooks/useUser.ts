// src/hooks/useUser.ts
import { useEffect, useMemo, useRef, useState } from 'react'
import { useAuthStore } from '@/store/useAuthStore'
import * as Auth from '@/api/auth' // optional helpers if present
import axios from '@/api/client'

export interface Upload {
  id: string
  name: string
  created_at: string
}

type AnyUser = Record<string, any>

const sortUploadsDesc = (a: Upload, b: Upload) =>
  new Date(b.created_at).getTime() - new Date(a.created_at).getTime()

/* Broader admin detection that tolerates many backend shapes. */
function computeIsAdmin(user: AnyUser | null, hasRoleFn?: (r: string) => boolean): boolean {
  if (!user) return false

  // role can be string or { name }
  const rawRole = (user as any)?.role
  const roleStr =
    typeof rawRole === 'string'
      ? rawRole.toLowerCase()
      : String((rawRole as any)?.name ?? '').toLowerCase()

  // roles can be array of strings or objects with { name }
  const rolesArr = Array.isArray((user as any)?.roles)
    ? (user as any).roles.map((r: any) => String(r?.name ?? r).toLowerCase())
    : []

  const flags =
    (user as any)?.is_admin === true ||
    (user as any)?.isAdmin === true ||
    (user as any)?.is_staff === true ||
    (user as any)?.is_superuser === true ||
    (user as any)?.isOwner === true

  const roleIdAdmin = Number((user as any)?.role_id) === 1

  const permsAdmin =
    Array.isArray((user as any)?.permissions) &&
    (user as any).permissions.some((p: any) => String(p).toLowerCase().includes('admin'))

  const hasRoleHelper = typeof hasRoleFn === 'function' && hasRoleFn('admin')

  if (
    ['admin', 'owner', 'superuser', 'staff'].includes(roleStr) ||
    rolesArr.includes('admin') ||
    flags ||
    roleIdAdmin ||
    permsAdmin ||
    hasRoleHelper
  ) {
    return true
  }

  // ultra-safe fallback for typical seeds
  const email = String((user as any)?.email ?? '').toLowerCase()
  const username = String((user as any)?.username ?? '').toLowerCase()
  if (email === 'admin@example.com' || username === 'admin') return true

  return false
}

/** Direct call to backend for current user (works even if Auth helpers are missing). */
async function fetchCurrentUserDirect(): Promise<AnyUser | null> {
  const res = await axios.get('/api/v1/auth/me', {
    withCredentials: true,
    validateStatus: s => (s >= 200 && s < 300) || (s >= 400 && s < 500),
  })
  if (res.status === 200) return res.data as AnyUser
  if (res.status === 401) return null
  console.warn('[useUser] unexpected /auth/me status:', res.status, res.data)
  return null
}

/**
 * Try a couple of admin-only endpoints. If any returns 200, you’re an admin.
 * We treat 401/403/404/405/422 as “not admin” (don’t throw).
 */
async function probeAdminMulti(): Promise<boolean> {
  const attempts: Array<() => Promise<number>> = [
    async () =>
      (await axios.get('/api/v1/admin/me', {
        withCredentials: true,
        validateStatus: s => (s >= 200 && s < 300) || (s >= 400 && s < 500),
      })).status,
    async () =>
      (await axios.get('/api/v1/admin/users', {
        withCredentials: true,
        validateStatus: s => (s >= 200 && s < 300) || (s >= 400 && s < 500),
      })).status,
  ]

  for (const go of attempts) {
    try {
      const status = await go()
      if (status === 200) return true
      if (![401, 403, 404, 405, 422].includes(status)) {
        console.warn('[useUser] unexpected admin probe status:', status)
      }
    } catch {
      // network hiccup — ignore and continue
    }
  }
  return false
}

/**
 * Fetch uploads ONLY for admins:
 *   GET /api/v1/admin/users/{user_id}/uploads
 */
async function fetchUploadsForUser(userId: string, isAdmin: boolean): Promise<Upload[]> {
  if (!isAdmin) return []
  const res = await axios.get<Upload[]>(`/api/v1/admin/users/${encodeURIComponent(userId)}/uploads`, {
    withCredentials: true,
    validateStatus: s => (s >= 200 && s < 300) || (s >= 400 && s < 500),
  })
  if (res.status === 200 && Array.isArray(res.data)) {
    return [...res.data].sort(sortUploadsDesc)
  }
  if (![401, 403, 404, 405, 422].includes(res.status)) {
    console.warn('[useUser] unexpected uploads status:', res.status, res.data)
  }
  return []
}

export function useUser() {
  const user = useAuthStore((s) => s.user) as AnyUser | null
  const loading = useAuthStore((s) => s.loading)
  const resolved = useAuthStore((s) => s.resolved)
  const hasRoleFn = useAuthStore((s) => s.hasRole)
  const setUser = useAuthStore((s) => s.setUser)
  const setResolved = useAuthStore((s) => s.setResolved)

  const [error, setError] = useState<string | null>(null)

  // StrictMode guards
  const hydratingRef = useRef(false)
  const didRunOnceRef = useRef(false)
  const mountedRef = useRef(true)
  useEffect(() => () => { mountedRef.current = false }, [])

  const isAdmin = useMemo(() => computeIsAdmin(user, hasRoleFn), [user, hasRoleFn])

  // Resolve an Auth helper if present; otherwise, we’ll fallback.
  const resolveGetCurrentUser = () =>
    (Auth as any).getCurrentUser ??
    (Auth as any).apiGetCurrentUser ??
    (Auth as any).fetchCurrentUser ??
    (Auth as any).me

  const hydrate = async () => {
    if (hydratingRef.current) return
    hydratingRef.current = true
    try {
      console.debug('[useUser] Hydrating user from backend…')

      const getCurrentUserFn = resolveGetCurrentUser()
      let fresh: AnyUser | null = null

      if (typeof getCurrentUserFn === 'function') {
        fresh = (await getCurrentUserFn()) as AnyUser | null
      } else {
        // fallback to direct HTTP call (no more throwing)
        fresh = await fetchCurrentUserDirect()
      }

      if (!fresh) {
        if (!resolved) setResolved(true)
        setError('No user returned from backend.')
        return
      }

      // Persist avatar_url for components that peek into localStorage
      if ((fresh as AnyUser).avatar_url) {
        try { localStorage.setItem('avatar_url', String((fresh as AnyUser).avatar_url)) } catch {}
      }

      // First pass: infer from payload
      let adminNow = computeIsAdmin(fresh as AnyUser, hasRoleFn)

      // If still uncertain, probe admin endpoints (covers odd 422s on /admin/me)
      if (!adminNow) {
        try {
          const ok = await probeAdminMulti()
          if (ok) {
            adminNow = true
            ;(fresh as AnyUser).role = (fresh as AnyUser).role ?? 'admin'
            ;(fresh as AnyUser).is_admin = true
          }
        } catch {
          // ignore; non-admin is fine
        }
      }

      // Only admins may fetch admin-guarded uploads
      ;(fresh as AnyUser).uploads =
        (fresh as AnyUser).id ? await fetchUploadsForUser(String((fresh as AnyUser).id), adminNow) : []

      if (mountedRef.current) {
        setUser(fresh as AnyUser)
        if (!resolved) setResolved(true)
      }
    } catch (err: any) {
      console.warn('[useUser] hydrate() failed:', err)
      if (mountedRef.current) {
        setError(err?.message || 'Failed to fetch user')
        if (!resolved) setResolved(true)
      }
    } finally {
      hydratingRef.current = false
    }
  }

  useEffect(() => {
    if (didRunOnceRef.current) return
    didRunOnceRef.current = true
    void hydrate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const getRecentUploads = (count = 5): Upload[] => (user?.uploads ?? []).slice(0, count)

  return {
    user,
    userId: user?.id as string | undefined,
    loading,
    resolved,
    isAdmin,
    error,
    refresh: hydrate,
    setUser,
    avatar: (user?.avatar_url as string) || null,
    getRecentUploads,
  }
}

export default useUser
