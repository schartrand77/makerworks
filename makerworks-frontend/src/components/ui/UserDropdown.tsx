// src/components/nav/UserDropdown.tsx
import { useState, useMemo, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/store/useAuthStore'
import { useTheme } from '@/hooks/useTheme'
import { Sun, Moon } from 'lucide-react'
import axiosInstance from '@/api/client'
import { toast } from 'sonner'
import getAbsoluteUrl from '@/lib/getAbsoluteUrl'
import type { UserProfile } from '@/types/UserProfile'

type Props = {
  user: UserProfile
}

/** Ensure the avatar resolves correctly:
 *  - absolute http(s) URL -> as-is
 *  - '/uploads', '/avatar', '/api' -> backend origin via getAbsoluteUrl
 *  - '/default-avatar.png' or anything else -> serve from frontend origin
 */
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

const UserDropdown = ({ user }: Props) => {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  const { theme, setTheme } = useTheme()
  const isDark = theme === 'dark'
  const popoverRef = useRef<HTMLDivElement | null>(null)

  // ✅ Trust the auth store as source of truth
  const {
    user: storeUser,
    fetchUser,
    resolved,
    logout,
    isAdmin: isAdminStore,
  } = useAuthStore() as any

  // On first mount, ensure we have /auth/me loaded (cookie sessions may start without user)
  useEffect(() => {
    if (!resolved) {
      fetchUser().catch(() => {
        /* swallow; UI will show guest */
      })
    }
  }, [resolved, fetchUser])

  const handleSignOut = async () => {
    if (loading) return
    setLoading(true)
    setOpen(false)
    try {
      // Best-effort signout; server may return 200 or a benign 401/405 etc.
      const res = await axiosInstance.post('api/v1/auth/signout', null, {
        validateStatus: (s) => (s >= 200 && s < 300) || (s >= 400 && s < 500),
      })
      if (res.status === 200 || res.status === 204) {
        toast.success('Signed out.')
      } else if ([401, 403, 404, 405, 422].includes(res.status)) {
        // Treat as already signed out
      } else {
        toast.message(`Signout: status ${res.status}`)
      }
    } catch {
      // Network? fine — we’ll still clear local state
    } finally {
      await logout()
      setLoading(false)
      navigate('/auth/signin?signedout=1', { replace: true })
    }
  }

  const handleGoTo = (path: string) => {
    setOpen(false)
    navigate(path)
  }

  const toggleTheme = () => setTheme(isDark ? 'light' : 'dark')

  // 🧹 Only use localStorage for display niceties (never for auth/roles)
  const localUser = useMemo(() => {
    try {
      const raw = localStorage.getItem('mw_user')
      return raw ? JSON.parse(raw) : null
    } catch {
      return null
    }
  }, [])

  // Merge candidates for display (store > prop > local) — purely cosmetic
  const displayUser: UserProfile = useMemo(() => {
    const u = (storeUser as any) ?? (user as any) ?? localUser ?? {}
    return {
      username: u.username || 'Guest',
      email: u.email || 'guest@example.com',
      avatar_url: u.avatar_url || u.thumbnail_url || '/default-avatar.png',
      role: u.role || 'user',
    }
  }, [storeUser, user, localUser])

  const avatarSrc = useMemo(
    () =>
      resolveAvatarUrl(displayUser.avatar_url) ||
      // @ts-ignore: some backends use thumbnail_url
      resolveAvatarUrl((displayUser as any).thumbnail_url) ||
      '/default-avatar.png',
    [displayUser.avatar_url]
  )

  // 🔒 Single source of truth for admin: the store (which reads /auth/me)
  const isAdmin = useMemo(() => {
    try {
      return Boolean(isAdminStore && isAdminStore())
    } catch {
      return false
    }
  }, [isAdminStore, storeUser])

  // close popover on outside click / ESC
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!open) return
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
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
    <div className="relative" ref={popoverRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="rounded-full overflow-hidden border border-white/20 w-10 h-10 bg-white/10 backdrop-blur shadow"
        title={isAdmin ? 'Admin' : 'User'}
      >
        <img
          src={avatarSrc}
          alt={displayUser.username}
          className="w-full h-full object-cover"
          onError={(e) => {
            // Final safety: never re-route default avatar through API
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
            <div className="font-medium">{displayUser.username}</div>
            <div
              className="text-xs text-gray-500 truncate max-w-[12rem]"
              title={displayUser.email}
            >
              {displayUser.email}
            </div>
          </div>

          <hr className="border-gray-300 dark:border-gray-600" />

          <div className="flex items-center gap-1 justify-center text-xs text-gray-700 dark:text-gray-300">
            <Sun className="w-4 h-4" />
            <button
              onClick={toggleTheme}
              className="w-12 h-6 rounded-full p-0.5 flex items-center"
              aria-label="Toggle theme"
            >
              <span
                className="w-5 h-5 rounded-full bg-white shadow transform transition-transform duration-300"
                style={{
                  transform: isDark ? 'translateX(24px)' : 'translateX(0)',
                }}
              />
            </button>
            <Moon className="w-4 h-4" />
          </div>

          <button
            onClick={() => handleGoTo('/settings')}
            className="w-full text-center py-2 px-4 text-sm rounded-full backdrop-blur bg-white/20 dark:bg-zinc-800/30 border border-white/20 dark:border-zinc-700/30 text-blue-800 dark:text-blue-200 shadow hover:bg-white/30 dark:hover:bg-zinc-700/50 hover:shadow-md transition"
          >
            Settings
          </button>

          {isAdmin && (
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
