// src/components/ui/GlassNavbar.tsx
import { Link, useLocation } from 'react-router-dom'
import UserDropdown from '@/components/ui/UserDropdown'
import { useAuthStore } from '@/store/useAuthStore'
import { useEffect, useMemo, useRef, useState } from 'react'
import getAbsoluteUrl from '@/lib/getAbsoluteUrl'

/**
 * Resolve a stable avatar URL with cache-busting based on avatar_updated_at.
 * Falls back to thumbnail, then cached localStorage, then default asset.
 */
function buildAvatarUrl(
  user?:
    | {
        avatar_url?: string | null
        thumbnail_url?: string | null
        avatar_updated_at?: string | number | null
      }
    | null
) {
  const cached = typeof window !== 'undefined' ? localStorage.getItem('avatar_url') : null

  const base =
    (user?.avatar_url && (getAbsoluteUrl(user.avatar_url) || user.avatar_url)) ||
    (user?.thumbnail_url && (getAbsoluteUrl(user.thumbnail_url) || user.thumbnail_url)) ||
    (cached && (getAbsoluteUrl(cached) || cached)) ||
    '/default-avatar.png'

  if (!user?.avatar_updated_at || base === '/default-avatar.png') return base
  const ts = new Date(user.avatar_updated_at as any).getTime()
  return `${base}${base.includes('?') ? '&' : '?'}v=${ts}`
}

const HIDE_ON = new Set<string>([
  '/',            // landing
  '/signin',
  '/signup',
  '/auth',
  '/auth/',
])

const GlassNavbar = () => {
  const user = useAuthStore((s) => s.user)
  const isAuthenticatedVal = useAuthStore((s) => s.isAuthenticated)
  const isAuthenticated =
    typeof isAuthenticatedVal === 'function' ? (isAuthenticatedVal as () => boolean)() : !!isAuthenticatedVal

  const location = useLocation()
  const path = location.pathname.toLowerCase()
  const gearRef = useRef<HTMLSpanElement>(null)

  // Hide on landing/auth routes (support both /auth/* and standalone /signin,/signup)
  const hideNav = useMemo(() => {
    if (HIDE_ON.has(path)) return true
    if (path.startsWith('/auth/')) return true
    if (path === '/welcome' || path === '/enter' || path === '/landing') return true
    return false
  }, [path])

  // Detect PWA standalone mode (iOS and others)
  const isStandalone =
    typeof window !== 'undefined' &&
    (window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone)

  // Local state for live avatar updates
  const [avatarUrl, setAvatarUrl] = useState<string>(() => buildAvatarUrl(user))

  // Update when user in store changes
  useEffect(() => {
    setAvatarUrl(buildAvatarUrl(user))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.avatar_url, user?.thumbnail_url, user?.avatar_updated_at])

  // Listen for uploads broadcasting a fresh avatar URL
  useEffect(() => {
    const onUpdate = (e: any) => {
      const next: string | undefined = e?.detail?.url
      if (typeof next === 'string' && next.length > 0) {
        setAvatarUrl(next)
        useAuthStore.setState((state) => ({
          user: state.user ? { ...state.user, avatar_url: next } : state.user,
        }))
      }
    }
    window.addEventListener('avatar:updated', onUpdate)
    return () => window.removeEventListener('avatar:updated', onUpdate)
  }, [])

  // Gentle gear spin (safe when nav hidden; ref will be null)
  useEffect(() => {
    const interval = setInterval(() => {
      if (gearRef.current) {
        gearRef.current.classList.add('animate-spin-once')
        setTimeout(() => gearRef.current?.classList.remove('animate-spin-once'), 1000)
      }
    }, Math.random() * 8000 + 3000)
    return () => clearInterval(interval)
  }, [])

  /** Routes — fixed; NO admin tab, no admin awareness */
  const navRoutes = useMemo(
    () => [
      { path: '/dashboard', label: 'Dashboard' },
      { path: '/browse', label: 'Browse' },
      { path: '/estimate', label: 'Estimate' },
      { path: '/upload', label: 'Upload' },
      { path: '/cart', label: 'Cart' },
      { path: '/checkout', label: 'Checkout' },
    ],
    []
  )

  const fallbackUser = useMemo(
    () => ({
      username: 'Guest',
      email: 'guest@example.com',
      avatar_url: '/default-avatar.png',
      role: 'guest',
    }),
    []
  )

  // For authenticated users, do NOT merge fallback (don’t clobber role/flags); only fix avatar.
  const resolvedUser = useMemo(() => {
    if (!isAuthenticated) return fallbackUser
    const base: any = { ...(user || {}) }
    base.avatar_url = avatarUrl || base.avatar_url || '/default-avatar.png'
    return base
  }, [isAuthenticated, user, avatarUrl, fallbackUser])

  // ✅ Return based on hideNav AFTER all hooks are declared
  if (hideNav) return null

  /** Green-LED button base for navbar items (matches system .mw-enter) */
  const ledBtnBase =
    'mw-enter mw-btn-sm rounded-full font-medium text-gray-800 dark:text-gray-200 inline-flex'

  return (
    <nav
      className={`
        mw-nav
        fixed ${isStandalone ? 'bottom-4' : 'top-4'} left-1/2 -translate-x-1/2
        flex justify-between items-center gap-6
        px-6 py-2 rounded-full
        bg-white/30 dark:bg-black/30
        backdrop-blur-md shadow-md z-50
      `}
      style={isStandalone ? { paddingBottom: 'env(safe-area-inset-bottom)' } : undefined}
      aria-label="Global"
    >
      <div className="flex items-center gap-2">
        <Link to="/" className="text-lg font-bold text-zinc-800 dark:text-white">
          MakerW
          <span ref={gearRef} className="gear">
            ⚙️
          </span>
          rks
        </Link>

        {navRoutes.map((item) => {
          const isActive = path === item.path
          return (
            <Link
              key={item.path}
              to={item.path}
              className={ledBtnBase}
              aria-current={isActive ? 'page' : undefined}
            >
              {item.label}
            </Link>
          )
        })}
      </div>

      <div className="flex items-center gap-2">
        {isAuthenticated ? (
          <UserDropdown user={resolvedUser} />
        ) : (
          <Link to="/auth/signin" className={ledBtnBase}>
            Sign In
          </Link>
        )}
      </div>

      {/* Navbar-local intensifier for the active tab (keeps green LED, just turns it up) */}
      <style>{`
        .mw-nav .mw-enter[aria-current="page"]{
          border-color: #16a34a !important; /* reinforce the ring */
          box-shadow:
            inset 0 0 12px 2.5px rgba(22,163,74,0.60),
            0 0 18px 6px rgba(22,163,74,0.65),
            0 0 36px 14px rgba(22,163,74,0.28);
        }
        .mw-nav .mw-enter[aria-current="page"]:hover{
          transform: none; /* keep it steady when active */
        }
      `}</style>
    </nav>
  )
}

export default GlassNavbar
