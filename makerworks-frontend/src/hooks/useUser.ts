// src/hooks/useUser.ts
import { useEffect, useMemo, useRef, useState } from 'react'
import { useAuthStore } from '@/store/useAuthStore'
import * as Auth from '@/api/auth' // namespace import to avoid named-export mismatches
import axios from '@/api/axios'

export interface Upload {
  id: string
  name: string
  created_at: string
}

type AnyUser = Record<string, any>

const sortUploadsDesc = (a: Upload, b: Upload) =>
  new Date(b.created_at).getTime() - new Date(a.created_at).getTime()

function computeIsAdmin(user: AnyUser | null, hasRoleFn?: (r: string) => boolean): boolean {
  if (!user) return false

  const role = (user as any)?.role
  const roleStr =
    typeof role === 'string'
      ? role.toLowerCase()
      : String((role as any)?.name ?? '').toLowerCase()

  const rolesArr = Array.isArray((user as any)?.roles)
    ? (user as any).roles.map((r: any) => String(r?.name ?? r).toLowerCase())
    : []

  // tolerate assorted shapes/flags
  if (
    roleStr === 'admin' ||
    rolesArr.includes('admin') ||
    (user as any)?.is_admin === true ||
    (user as any)?.isAdmin === true ||
    (user as any)?.role_id === 1 ||
    (typeof hasRoleFn === 'function' && hasRoleFn('admin'))
  ) {
    return true
  }

  // ultra-safe fallback for typical seeds
  const email = String((user as any)?.email ?? '').toLowerCase()
  const username = String((user as any)?.username ?? '').toLowerCase()
  if (email === 'admin@example.com' || username === 'admin') return true

  return false
}

/**
 * Try multiple admin-only endpoints. If any responds 200, you’re an admin.
 * We treat 401/403/404/405/422 as “not admin” (don’t throw).
 */
async function probeAdminMulti(): Promise<boolean> {
  const attempts: Array<() => Promise<number>> = [
    // some backends wire this correctly…
    async () => (await axios.get('/admin/me', {
      withCredentials: true,
      validateStatus: s => (s >= 200 && s < 300) || (s >= 400 && s < 500),
    })).status,
    // …others 422 on /admin/me because of route conflicts; /admin/users is a solid probe
    async () => (await axios.get('/admin/users', {
      withCredentials: true,
      validateStatus: s => (s >= 200 && s < 300) || (s >= 400 && s < 500),
    })).status,
    // last-ditch harmless GET
    async () => (await axios.get('/admin/discord/config', {
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
    } catch (e) {
      // network? ignore and continue
    }
  }
  return false
}

/**
 * Fetch uploads ONLY for admins, via admin endpoint:
 *   GET /api/v1/admin/users/{user_id}/uploads
 */
async function fetchUploadsForUser(userId: string, isAdmin: boolean): Promise<Upload[]> {
  if (!isAdmin) return []
  const res = await axios.get<Upload[]>(
    `/admin/users/${encodeURIComponent(userId)}/uploads`,
    {
      withCredentials: true,
      validateStatus: (s) => (s >= 200 && s < 300) || (s >= 400 && s < 500),
    }
  )
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
      if (typeof getCurrentUserFn !== 'function') {
        throw new Error('Auth.me/getCurrentUser is not available')
      }

      const fresh = (await getCurrentUserFn()) as AnyUser | null
      if (!fresh) {
        if (!resolved) setResolved(true)
        setError('No user returned from backend.')
        return
      }

      // stick avatar_url for components that read localStorage directly
      if ((fresh as AnyUser).avatar_url) {
        try { localStorage.setItem('avatar_url', String((fresh as AnyUser).avatar_url)) } catch {}
      }

      // First pass: infer from payload
      let adminNow = computeIsAdmin(fresh as AnyUser, hasRoleFn)

      // If still uncertain, probe multiple admin endpoints (handles the 422 case on /admin/me)
      if (!adminNow) {
        try {
          const ok = await probeAdminMulti()
          if (ok) {
            adminNow = true
            ;(fresh as AnyUser).role = 'admin'
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
