// src/components/ui/GlassNavbar.tsx
import { Link, useLocation } from 'react-router-dom';
import UserDropdown from '@/components/ui/UserDropdown';
import { useAuthStore } from '@/store/useAuthStore';
import { useEffect, useMemo, useRef, useState } from 'react';
import getAbsoluteUrl from '@/lib/getAbsoluteUrl';

/**
 * Resolve a stable avatar URL with cache-busting based on avatar_updated_at.
 * Falls back to thumbnail, then cached localStorage, then default asset.
 */
function buildAvatarUrl(
  user?: {
    avatar_url?: string | null;
    thumbnail_url?: string | null;
    avatar_updated_at?: string | number | null;
  } | null
) {
  // Avoid hitting localStorage during SSR
  const cached = typeof window !== 'undefined' ? localStorage.getItem('avatar_url') : null;

  const base =
    (user?.avatar_url && (getAbsoluteUrl(user.avatar_url) || user.avatar_url)) ||
    (user?.thumbnail_url && (getAbsoluteUrl(user.thumbnail_url) || user.thumbnail_url)) ||
    (cached && (getAbsoluteUrl(cached) || cached)) ||
    '/default-avatar.png';

  // Never cache-bust the baked-in default
  if (!user?.avatar_updated_at || base === '/default-avatar.png') return base;

  const ts = new Date(user.avatar_updated_at as any).getTime();
  return `${base}${base.includes('?') ? '&' : '?'}v=${ts}`;
}

const GlassNavbar = () => {
  const user = useAuthStore((s) => s.user);
  const isAuthenticatedFn = useAuthStore((s) => s.isAuthenticated);
  const isAuthenticated = typeof isAuthenticatedFn === 'function' ? isAuthenticatedFn() : false;

  const location = useLocation();
  const gearRef = useRef<HTMLSpanElement>(null);

  // Detect PWA standalone mode (iOS and others)
  const isStandalone =
    typeof window !== 'undefined' &&
    (window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone);

  // Local state for live avatar updates
  const [avatarUrl, setAvatarUrl] = useState<string>(() => buildAvatarUrl(user));

  // Update when user in store changes
  useEffect(() => {
    setAvatarUrl(buildAvatarUrl(user));
  }, [user?.avatar_url, user?.thumbnail_url, user?.avatar_updated_at]);

  // Listen for uploads broadcasting a fresh avatar URL
  useEffect(() => {
    const onUpdate = (e: any) => {
      const next: string | undefined = e?.detail?.url;
      if (typeof next === 'string' && next.length > 0) {
        setAvatarUrl(next);
        // Also update Zustand store avatar_url so other components refresh
        useAuthStore.setState((state) => ({
          user: state.user ? { ...state.user, avatar_url: next } : state.user,
        }));
      }
    };
    window.addEventListener('avatar:updated', onUpdate);
    return () => window.removeEventListener('avatar:updated', onUpdate);
  }, []);

  // Gear spin effect
  useEffect(() => {
    const interval = setInterval(() => {
      if (gearRef.current) {
        gearRef.current.classList.add('animate-spin-once');
        setTimeout(() => gearRef.current?.classList.remove('animate-spin-once'), 1000);
      }
    }, Math.random() * 8000 + 3000);
    return () => clearInterval(interval);
  }, []);

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
  );

  const fallbackUser = useMemo(
    () => ({
      username: 'Guest',
      email: 'guest@example.com',
      avatar_url: '/default-avatar.png',
      role: 'guest',
    }),
    []
  );

  // Inject live avatar URL into resolvedUser
  const resolvedUser = useMemo(() => {
    if (!isAuthenticated) return fallbackUser;
    return {
      ...fallbackUser,
      ...user,
      avatar_url: avatarUrl || '/default-avatar.png',
    };
  }, [isAuthenticated, user, avatarUrl, fallbackUser]);

  return (
    <nav
      className={`
        fixed ${isStandalone ? 'bottom-4' : 'top-4'} left-1/2 transform -translate-x-1/2
        flex justify-between items-center gap-6
        px-6 py-2 rounded-full
        bg-white/30 dark:bg-black/30
        backdrop-blur-md shadow-md z-50
      `}
      style={isStandalone ? { paddingBottom: 'env(safe-area-inset-bottom)' } : undefined}
    >
      <div className="flex items-center gap-2">
        <Link to="/" className="text-lg font-bold text-gray-800 dark:text-white">
          MakerW
          <span ref={gearRef} className="gear">⚙️</span>
          rks
        </Link>

        {navRoutes.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <Link
              key={item.path}
              to={item.path}
              className={`
                text-sm px-3 py-1 rounded-full backdrop-blur
                bg-brand-white/40 dark:bg-brand-white/20
                text-brand-black dark:text-brand-white
                border border-brand-white shadow transition
                hover:bg-brand-white/60 dark:hover:bg-brand-white/30
                ${isActive ? 'bg-transparent border-brand-red ring-2 ring-brand-red' : ''}
              `}
            >
              {item.label}
            </Link>
          );
        })}
      </div>

      <div className="flex items-center gap-2">
        {isAuthenticated ? (
          <UserDropdown user={resolvedUser} />
        ) : (
          <Link
            to="/auth/signin"
            className="
              text-sm px-3 py-1 rounded-full backdrop-blur
              bg-brand-white/40 dark:bg-brand-white/20
              text-brand-black dark:text-brand-white
              border border-brand-white shadow transition
              hover:bg-brand-white/60 dark:hover:bg-brand-white/30
            "
          >
            Sign In
          </Link>
        )}
      </div>
    </nav>
  );
};

export default GlassNavbar;

