import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/store/useAuthStore';
import api from '@/api/client';
import clsx from 'clsx';

/**
 * Robustly detect admin across varied user payloads.
 */
function useIsAdmin(user: any) {
  return useMemo(() => {
    if (!user) return false;
    const roleLike =
      user.role === 'admin' ||
      (Array.isArray(user.roles) && user.roles.includes('admin')) ||
      (Array.isArray(user.permissions) && user.permissions.includes('admin')) ||
      (Array.isArray(user.claims) && user.claims.includes('admin'));
    const flags = Boolean(user.is_admin || user.isAdmin || user.admin === true);
    return Boolean(roleLike || flags);
  }, [user]);
}

export default function UserDropdown() {
  const { user, setUser } = useAuthStore();
  const isAdmin = useIsAdmin(user);
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!open) return;
      const t = e.target as Node;
      if (menuRef.current?.contains(t) || btnRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  useEffect(() => {
    // helpful gating log
    // eslint-disable-next-line no-console
    console.debug('[UserDropdown] gate', {
      hasUser: !!user,
      id: user?.id,
      username: user?.username,
      role: user?.role,
      roles: user?.roles,
      is_admin: user?.is_admin,
      isAdminProp: user?.isAdmin,
      adminBool: user?.admin,
      resolvedIsAdmin: isAdmin,
    });
  }, [user, isAdmin]);

  const handleSignOut = async () => {
    try {
      await api.post('/api/v1/auth/signout');
    } catch (e) {
      // ignore; we’ll clear client state regardless
    } finally {
      setUser(null);
      navigate('/signin');
    }
  };

  const avatarUrl =
    user?.avatar_url ||
    user?.avatar ||
    '/static/default-avatar.png';

  return (
    <div className="relative">
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={clsx(
          'inline-flex items-center gap-2 rounded-full px-2 py-1.5',
          'border border-white/20 dark:border-white/20',
          'bg-white/20 dark:bg-black/20 backdrop-blur-sm',
          'text-brand-text dark:text-white',
          'hover:shadow-[0_0_12px_rgba(255,122,26,.22),0_0_36px_rgba(255,122,26,.08)]',
          'transition'
        )}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <img
          src={avatarUrl}
          alt="avatar"
          className="w-7 h-7 rounded-full object-cover"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).src = '/static/default-avatar.png';
          }}
        />
        <span className="text-sm font-semibold">{user?.username ?? 'Account'}</span>
        <svg width="16" height="16" viewBox="0 0 24 24" className="opacity-70">
          <path d="M7 10l5 5 5-5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      {open && (
        <div
          ref={menuRef}
          role="menu"
          className={clsx(
            'absolute right-0 mt-2 w-56 z-50',
            'rounded-xl border border-white/20 dark:border-white/20',
            'bg-white/70 dark:bg-zinc-900/80 backdrop-blur-md',
            'shadow-xl p-1.5'
          )}
        >
          <div className="px-2 py-2">
            <div className="text-[12px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Account</div>
          </div>

          <Link
            to="/profile"
            role="menuitem"
            className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-white/50 dark:hover:bg-white/10 transition text-sm text-brand-text"
            onClick={() => setOpen(false)}
          >
            Profile
            <span className="text-[11px] text-zinc-500">{user?.email}</span>
          </Link>

          {isAdmin && (
            <Link
              to="/admin"
              role="menuitem"
              className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-white/50 dark:hover:bg-white/10 transition text-sm text-brand-text"
              onClick={() => setOpen(false)}
            >
              <span className="inline-block w-2 h-2 rounded-full bg-orange-400 shadow-[0_0_8px_rgba(255,122,26,.6)]" />
              Admin
            </Link>
          )}

          <div className="h-px my-1 bg-white/30 dark:bg-white/10" />

          <button
            role="menuitem"
            onClick={handleSignOut}
            className="w-full text-left px-3 py-2 rounded-lg hover:bg-white/50 dark:hover:bg-white/10 transition text-sm text-brand-text"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
