// src/components/nav/UserDropdown.tsx
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/store/useAuthStore'
import getAbsoluteUrl from '@/lib/getAbsoluteUrl'

type UserLike = {
  id?: string
  username?: string | null
  email?: string | null
  avatar_url?: string | null
  thumbnail_url?: string | null
  role?: string | null
  is_admin?: boolean
  is_staff?: boolean
  is_superuser?: boolean
  isOwner?: boolean
  permissions?: string[] | null
  roles?: Array<string | { name?: string }>
  role_id?: number | string
}

/** Resolve a stable avatar URL */
function resolveAvatarUrl(path?: string | null): string {
  const p = (path || '').trim()
  if (!p) return '/default-avatar.png'
  if (/^https?:\/\//i.test(p)) return p
  if (p === '/default-avatar.png' || /\/default-avatar\.png$/i.test(p)) return '/default-avatar.png'
  if (p.startsWith('/uploads') || p.startsWith('/avatar') || p.startsWith('/api/')) {
    return getAbsoluteUrl(p)
  }
  return p.startsWith('/') ? p : `/${p}`
}

/** Broad admin check that works across backends */
function hasAdminPrivileges(u: any): boolean {
  if (!u) return false

  // role can be string or object { name }
  const rawRole = u.role
  const role =
    typeof rawRole === 'string'
      ? rawRole.toLowerCase()
      : String(rawRole?.name ?? '').toLowerCase()

  // roles array support
  const rolesArr = Array.isArray(u.roles)
    ? u.roles.map((r: any) => String(r?.name ?? r).toLowerCase())
    : []

  if (['admin', 'owner', 'superuser', 'staff'].includes(role)) return true
  if (rolesArr.includes('admin')) return true

  if (u.is_admin || u.isOwner || u.is_staff || u.is_superuser) return true
  if (Number(u.role_id) === 1) return true

  if (Array.isArray(u.permissions) && u.permissions.some((p: any) => String(p).toLowerCase().includes('admin'))) {
    return true
  }

  return false
}

type Props = { user: UserLike }

const UserDropdown = ({ user }: Props) => {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [adminProbe, setAdminProbe] = useState<boolean | null>(null)
  const popRef = useRef<HTMLDivElement | null>(null)
  const navigate = useNavigate()

  // Zustand store (source of truth)
  const { user: storeUser, logout, isAdmin: isAdminStore, resolved, fetchUser } = useAuthStore() as any

  // Ensure /auth/me is hydrated (cookie-based sessions)
  useEffect(() => {
    if (!resolved) {
      fetchUser?.().catch(() => {})
    }
  }, [resolved, fetchUser])

  // Compute display user (store > prop)
  const displayUser: UserLike = useMemo(() => {
    return (storeUser as UserLike) ?? user ?? {}
  }, [storeUser, user])

  const avatarSrc = useMemo(
    () =>
      resolveAvatarUrl(displayUser.avatar_url) ||
      resolveAvatarUrl(displayUser.thumbnail_url) ||
      '/default-avatar.png',
    [displayUser.avatar_url, displayUser.thumbnail_url]
  )

  // Robust admin detection from store + payload
  const storeAdminFlag: boolean | null = useMemo(() => {
    if (typeof isAdminStore === 'function') {
      try {
        const v = isAdminStore()
        if (typeof v === 'boolean') return v
      } catch {}
      return null
    }
    if (typeof isAdminStore === 'boolean') return isAdminStore
    return null
  }, [isAdminStore])

  const payloadAdmin = useMemo(
    () =>
      hasAdminPrivileges(storeUser) ||
      hasAdminPrivileges(user) ||
      hasAdminPrivileges(displayUser),
    [storeUser, user, displayUser]
  )

  // Seed fallback (dev/demo)
  const seedAdmin = useMemo(() => {
    const email = String(displayUser.email ?? '').toLowerCase()
    const uname = String(displayUser.username ?? '').toLowerCase()
    return email === 'admin@example.com' || uname === 'admin'
  }, [displayUser.email, displayUser.username])

  // If store/payload don’t confirm admin, probe a real admin-only endpoint once
  useEffect(() => {
    const looksAdmin = (storeAdminFlag === true) || payloadAdmin || seedAdmin
    if (looksAdmin) {
      setAdminProbe(true)
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/v1/admin/me', {
          credentials: 'include',
          headers: { 'Accept': 'application/json' },
        })
        if (!cancelled) setAdminProbe(res.status === 200)
      } catch {
        if (!cancelled) setAdminProbe(false)
      }
    })()
    return () => { cancelled = true }
  }, [storeAdminFlag, payloadAdmin, seedAdmin])

  const showAdmin = (storeAdminFlag === true) || payloadAdmin || seedAdmin || adminProbe === true

  const handleSignOut = async () => {
    if (loading) return
    setLoading(true)
    setOpen(false)
    try {
      await fetch('/api/v1/auth/signout', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      }).catch(() => {})
    } finally {
      await logout?.()
      setLoading(false)
      navigate('/auth/signin?signedout=1', { replace: true })
    }
  }

  const handleGoTo = (path: string) => {
    setOpen(false)
    navigate(path)
  }

  // Close on outside click / ESC
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!open) return
      if (popRef.current && !popRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="relative" ref={popRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="rounded-full overflow-hidden border border-white/20 w-10 h-10 bg-white/10 backdrop-blur shadow"
        title={showAdmin ? 'Admin' : 'User'}
      >
        <img
          src={avatarSrc}
          alt={String(displayUser.username || displayUser.email || 'user')}
          className="w-full h-full object-cover"
          onError={(e) => {
            if (!e.currentTarget.src.endsWith('/default-avatar.png')) {
              e.currentTarget.onerror = null
              e.currentTarget.src = '/default-avatar.png'
            }
          }}
        />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-2 w-56 bg-white/80 dark:bg-black/80 backdrop-blur-md rounded-lg shadow-lg z-50 p-2 space-y-2"
        >
          <div className="px-4 py-2 text-sm text-gray-800 dark:text-gray-200">
            <div className="font-medium truncate">{displayUser.username || 'User'}</div>
            {displayUser.email && (
              <div className="text-xs text-gray-500 truncate max-w-[12rem]" title={displayUser.email || ''}>
                {displayUser.email}
              </div>
            )}
          </div>

          <hr className="border-gray-300 dark:border-gray-600" />

          <button
            onClick={() => handleGoTo('/settings')}
            className="w-full text-center py-2 px-4 text-sm rounded-full backdrop-blur bg-white/20 dark:bg-zinc-800/30 border border-white/20 dark:border-zinc-700/30 text-blue-800 dark:text-blue-200 shadow hover:bg-white/30 dark:hover:bg-zinc-700/50 hover:shadow-md transition"
          >
            Settings
          </button>

          {showAdmin && (
            <button
              onClick={() => handleGoTo('/admin')}
              data-testid="admin-link"
              className="w-full text-center py-2 px-4 text-sm rounded-full backdrop-blur bg-red-500/20 dark:bg-red-700/30 border border-red-500/30 dark:border-red-700/40 text-red-800 dark:text-red-200 shadow hover:bg-red-500/30 dark:hover:bg-red-700/50 hover:shadow-md transition"
            >
              Admin Panel
            </button>
          )}

          <hr className="border-gray-300 dark:border-gray-600" />

          <button
            onClick={handleSignOut}
            disabled={loading}
            className={`w-full text-center py-2 px-4 text-sm rounded-full backdrop-blur bg-white/20 dark:bg-zinc-800/30 border border-white/20 dark:border-zinc-700/30 text-red-600 dark:text-red-300 shadow hover:bg-white/30 dark:hover:bg-zinc-700/50 hover:shadow-md transition ${
              loading ? 'opacity-50 cursor-not-allowed' : ''
            }`}
          >
            {loading ? 'Signing out…' : 'Sign Out'}
          </button>
        </div>
      )}
    </div>
  )
}

export default UserDropdown
