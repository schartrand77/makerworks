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

  /**
   * Shared pill classes — glass base + thin inner orange halo (before)
   * AND a matching soft outer halo (after). Hover/focus fade them in.
   */
  const pillBase =
    // layout + glass base
    'relative overflow-visible inline-flex h-9 items-center justify-center rounded-full px-3 text-sm ' +
    'backdrop-blur-xl bg-white/60 dark:bg-white/10 ' +
    // subtle baseline border + ring + top highlight
    'border border-white/30 dark:border-white/15 ring-1 ring-black/5 dark:ring-white/15 ' +
    'shadow-[inset_0_1px_0_rgba(255,255,255,0.65)] ' +
    // text & base hover
    'text-zinc-900 dark:text-zinc-100 transition hover:bg-white/65 dark:hover:bg-white/15 ' +
    // warm the border slightly on hover
    'hover:border-amber-300/40 ' +
    // INNER halo (before): thin, soft, stays off the label
    'before:content-[""] before:absolute before:inset-[1px] before:rounded-[999px] before:pointer-events-none ' +
    'before:opacity-0 hover:before:opacity-100 focus-visible:before:opacity-100 before:transition-opacity ' +
    'before:shadow-[inset_0_0_6px_rgba(251,146,60,0.18),inset_0_0_10px_rgba(251,146,60,0.12)] ' +
    // OUTER halo (after): soft orange aura around the pill, balanced with inner
    'after:content-[""] after:absolute after:inset-0 after:rounded-[999px] after:pointer-events-none ' +
    'after:opacity-0 hover:after:opacity-100 focus-visible:after:opacity-100 after:transition-opacity ' +
    'after:shadow-[0_0_0_1px_rgba(251,146,60,0.16),0_0_10px_rgba(251,146,60,0.14),0_0_18px_rgba(251,146,60,0.10)] ' +
    // a11y: keep focus ring internal to the pill glows
    'focus-visible:outline-none focus-visible:ring-0'

  /**
   * Active tab gets the same glow TURNED UP and ALWAYS ON.
   * We bump ring/border a touch, force before/after visible, and slightly increase glow strength.
   */
  const pillActive =
    'ring-2 ring-amber-400/55 border-amber-300/60 ' +
    'before:opacity-100 after:opacity-100 ' +
    'before:shadow-[inset_0_0_8px_rgba(251,146,60,0.26),inset_0_0_16px_rgba(251,146,60,0.16)] ' +
    'after:shadow-[0_0_0_1px_rgba(251,146,60,0.22),0_0_14px_rgba(251,146,60,0.18),0_0_26px_rgba(251,146,60,0.14)]'

  return (
    <nav
      className={`
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
          const classes = [pillBase, isActive ? pillActive : ''].join(' ')
          return (
            <Link
              key={item.path}
              to={item.path}
              className={classes}
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
          <Link to="/auth/signin" className={pillBase}>
            Sign In
          </Link>
        )}
      </div>
    </nav>
  )
}

export default GlassNavbar
