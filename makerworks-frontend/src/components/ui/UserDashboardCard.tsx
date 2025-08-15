// src/components/ui/UserDashboardCard.tsx
import { useNavigate } from 'react-router-dom';
import GlassCard from '@/components/ui/GlassCard';
import { useAuthStore } from '@/store/useAuthStore';
import getAbsoluteUrl from '@/lib/getAbsoluteUrl';
import { useEffect, useMemo, useState } from 'react';

/** Build a reliable avatar URL with cache-busting if updated. */
function buildAvatarUrl(user?: {
  avatar_url?: string | null;
  thumbnail_url?: string | null;
  avatar_updated_at?: string | number | null;
} | null) {
  const cached = typeof window !== 'undefined' ? localStorage.getItem('avatar_url') : null;

  const base =
    (user?.avatar_url && (getAbsoluteUrl(user.avatar_url) || user?.avatar_url)) ||
    (user?.thumbnail_url && (getAbsoluteUrl(user.thumbnail_url) || user?.thumbnail_url)) ||
    (cached && (getAbsoluteUrl(cached) || cached)) ||
    '/default-avatar.png';

  if (!user?.avatar_updated_at || base === '/default-avatar.png') return base;

  const ts = new Date(user.avatar_updated_at as any).getTime();
  return `${base}${base.includes('?') ? '&' : '?'}v=${ts}`;
}

const UserDashboardCard = () => {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  const initial = useMemo(() => buildAvatarUrl(user), [user]);
  const [avatarSrc, setAvatarSrc] = useState<string>(initial);

  useEffect(() => {
    setAvatarSrc(buildAvatarUrl(user));
  }, [user?.avatar_url, user?.thumbnail_url, user?.avatar_updated_at]);

  // React to global avatar updates (from AvatarSection, etc.)
  useEffect(() => {
    const onUpdate = (e: CustomEvent<any>) => {
      // Accept either a fully-busted absolute URL (detail.url) or a raw relative path (detail.raw)
      const fromEvent =
        (e.detail?.url as string | undefined) ||
        (e.detail?.raw && (getAbsoluteUrl(e.detail.raw) || e.detail.raw));

      if (typeof fromEvent === 'string' && fromEvent.length > 0) {
        setAvatarSrc(fromEvent);
      }
    };
    // @ts-expect-error — we know the event detail shape
    window.addEventListener('avatar:updated', onUpdate as any);
    return () => {
      // @ts-expect-error — same
      window.removeEventListener('avatar:updated', onUpdate as any);
    };
  }, []);

  if (!user) return null;

  const handleSignOut = async () => {
    await logout();
    navigate('/');
  };

  const showImg = avatarSrc && !avatarSrc.endsWith('/default-avatar.png') && !avatarSrc.includes('/default-avatar.png');

  return (
    <GlassCard className="w-full max-w-md p-6 text-center flex flex-col items-center gap-4 shadow-[0_8px_20px_rgba(128,128,128,0.15)]">
      <div className="w-20 h-20 rounded-full bg-zinc-300 dark:bg-zinc-700 overflow-hidden shadow-md">
        {showImg ? (
          <img
            src={avatarSrc}
            alt="User avatar"
            className="w-full h-full object-cover rounded-full"
            onError={(e) => {
              if (e.currentTarget.src !== '/default-avatar.png') {
                e.currentTarget.onerror = null;
                e.currentTarget.src = '/default-avatar.png';
              }
            }}
            draggable={false}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center font-semibold text-xl text-white dark:text-zinc-200 select-none">
            {user.username?.[0]?.toUpperCase() ?? 'U'}
          </div>
        )}
      </div>

      <div>
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          {user.username}
        </h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">{user.email}</p>
      </div>

      <div className="mt-4 flex gap-3 justify-center">
        <button
          onClick={() => navigate('/settings')}
          className="px-4 py-1.5 rounded-full bg-brand-red/90 text-zinc-900 dark:text-white shadow-sm hover:bg-brand-red transition text-sm font-medium"
        >
          Edit Profile
        </button>
        <button
          onClick={handleSignOut}
          className="px-4 py-1.5 rounded-full bg-brand-destructive/90 text-white shadow-sm hover:bg-brand-destructive transition text-sm font-medium"
        >
          Log Out
        </button>
      </div>
    </GlassCard>
  );
};

export default UserDashboardCard;
