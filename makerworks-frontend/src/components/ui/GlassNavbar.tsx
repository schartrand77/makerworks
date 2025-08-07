// src/components/ui/GlassNavbar.tsx
import { Link, useLocation } from 'react-router-dom';
import UserDropdown from '@/components/ui/UserDropdown';
import { useAuthStore } from '@/store/useAuthStore';
import { useEffect, useRef } from 'react';
import getAbsoluteUrl from '@/lib/getAbsoluteUrl';

const GlassNavbar = () => {
  const user = useAuthStore((s) => s.user);
  const isAuthenticatedFn = useAuthStore((s) => s.isAuthenticated);
  const isAuthenticated = typeof isAuthenticatedFn === 'function' ? isAuthenticatedFn() : false;
  const location = useLocation();
  const gearRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const interval = setInterval(() => {
      if (gearRef.current) {
        gearRef.current.classList.add('animate-spin-once');
        setTimeout(() => {
          gearRef.current?.classList.remove('animate-spin-once');
        }, 1000);
      }
    }, Math.random() * 8000 + 3000);

    return () => clearInterval(interval);
  }, []);

  const navRoutes = [
    { path: '/dashboard', label: 'Dashboard' },
    { path: '/browse', label: 'Browse' },
    { path: '/estimate', label: 'Estimate' },
    { path: '/upload', label: 'Upload' },
    { path: '/cart', label: 'Cart' },
    { path: '/checkout', label: 'Checkout' }
  ];

  // ✅ Safe URL builder from shared util

  const fallbackUser = {
    username: 'Guest',
    email: 'guest@example.com',
    avatar_url: '/default-avatar.png',
    role: 'guest'
  };

  // ✅ Pull cached avatar_url from localStorage if user exists but avatar_url is missing
  const cachedAvatar = localStorage.getItem('avatar_url');

  const resolvedUser = isAuthenticated
    ? {
        ...fallbackUser,
        ...user,
        avatar_url:
          getAbsoluteUrl(user?.avatar_url) ??
          getAbsoluteUrl(user?.thumbnail_url) ??
          (cachedAvatar ? getAbsoluteUrl(cachedAvatar) : '/default-avatar.png') ??
          '/default-avatar.png'
      }
    : fallbackUser;

  return (
    <nav
      className="
        fixed top-4 left-1/2 transform -translate-x-1/2
        flex justify-between items-center gap-6
        px-6 py-2 rounded-full
        bg-white/30 dark:bg-black/30
        backdrop-blur-md shadow-md z-50
      "
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
                bg-brand-accent/40 dark:bg-brand-accent/20
                text-brand-secondary dark:text-brand-accent
                border border-brand-accent shadow transition
                hover:bg-brand-accent/60 dark:hover:bg-brand-accent/30
                ${isActive ? 'bg-brand-primary text-black' : ''}
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
              bg-brand-accent/40 dark:bg-brand-accent/20
              text-brand-secondary dark:text-brand-accent
              border border-brand-accent shadow transition
              hover:bg-brand-accent/60 dark:hover:bg-brand-accent/30
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
