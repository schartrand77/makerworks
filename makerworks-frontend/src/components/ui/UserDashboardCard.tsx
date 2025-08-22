// src/components/ui/UserDashboardCard.tsx
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/store/useAuthStore';
import getAbsoluteUrl from '@/lib/getAbsoluteUrl';
import { useEffect, useMemo, useState } from 'react';

/** Build a reliable avatar URL with cache-busting if updated. */
function buildAvatarUrl(
  user?:
    | {
        avatar_url?: string | null;
        thumbnail_url?: string | null;
        avatar_updated_at?: string | number | null;
      }
    | null
) {
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

  // React to global avatar updates
  useEffect(() => {
    const onUpdate = (e: CustomEvent<any>) => {
      const fromEvent =
        (e.detail?.url as string | undefined) ||
        (e.detail?.raw && (getAbsoluteUrl(e.detail.raw) || e.detail.raw));

      if (typeof fromEvent === 'string' && fromEvent.length > 0) {
        setAvatarSrc(fromEvent);
      }
    };
    // @ts-expect-error custom event typing
    window.addEventListener('avatar:updated', onUpdate as any);
    return () => {
      // @ts-expect-error custom event typing
      window.removeEventListener('avatar:updated', onUpdate as any);
    };
  }, []);

  if (!user) return null;

  const handleSignOut = async () => {
    await logout();
    navigate('/');
  };

  const showImg =
    avatarSrc &&
    !avatarSrc.endsWith('/default-avatar.png') &&
    !avatarSrc.includes('/default-avatar.png');

  return (
    <div
      /* EXACT same shell as Cart/Browse cards: grey glass, amber ring, glossy top highlight,
         plus mw-led to halo green only when a .mw-enter button inside is hovered. */
      className={[
        'mw-dashboard-card',
        'relative overflow-visible rounded-2xl mw-led',
        'bg-white/60 dark:bg-white/10 backdrop-blur-xl',
        'border border-amber-300/45 ring-1 ring-amber-300/40 hover:ring-amber-400/55',
        'shadow-[inset_0_1px_0_rgba(255,255,255,0.65)]',
        'before:content-[""] before:absolute before:inset-0 before:rounded-2xl before:pointer-events-none',
        'before:opacity-0 hover:before:opacity-100 before:transition-opacity',
        'before:shadow-[0_0_0_1px_rgba(251,146,60,0.12),0_0_12px_rgba(251,146,60,0.10),0_0_20px_rgba(251,146,60,0.08)]',
        'w-full max-w-md p-6 text-center flex flex-col items-center gap-4',
      ].join(' ')}
    >
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
        {/* LED buttons (green ring) to match the system */}
        <button
          type="button"
          onClick={() => navigate('/settings')}
          className="mw-enter mw-btn-sm rounded-full font-medium text-gray-800 dark:text-gray-200 inline-flex"
        >
          Edit Profile
        </button>

        {/* 🔴 Sign out: red ring, NO glow until hover; glows on hover */}
        <button
          type="button"
          onClick={handleSignOut}
          className="mw-danger mw-btn-sm rounded-full font-medium text-gray-800 dark:text-gray-200 inline-flex"
        >
          Sign out
        </button>
      </div>

      {/* Scoped LED styles */}
      <style>{`
        /* --- RED BUTTON: ring always red; no glow until hover --- */
        .mw-dashboard-card .mw-danger{
          border: 1px solid rgba(239,68,68,0.65);
          box-shadow: none; /* no glow at rest */
          transition: box-shadow .18s ease, transform .12s ease, border-color .18s ease;
        }
        .mw-dashboard-card .mw-danger:hover{
          transform: translateY(-0.5px);
          border-color: rgba(239,68,68,0.85);
          box-shadow:
            inset 0 0 12px 3px rgba(239,68,68,0.70),
            0 0 18px 8px rgba(239,68,68,0.70),
            0 0 44px 18px rgba(239,68,68,0.28);
        }
        .mw-dashboard-card .mw-danger:focus-visible{
          outline: none;
          box-shadow:
            0 0 0 2px rgba(239,68,68,0.45),
            inset 0 0 0 1px rgba(239,68,68,0.55);
        }

        /* --- CARD RED HALO (mirrors green .mw-enter logic), ONLY while hovering the red button --- */
        .mw-dashboard-card:has(.mw-danger:hover){
          border-color: rgba(239,68,68,0.60) !important; /* a bit stronger rim tint */
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.68);
        }
        .mw-dashboard-card:has(.mw-danger:hover)::before{
          opacity: 1 !important;
          /* stronger under-card red glow */
          box-shadow:
            0 0 0 1px rgba(239,68,68,0.26),
            0 2px 20px rgba(239,68,68,0.22),
            0 8px 42px rgba(239,68,68,0.20),
            0 12px 68px rgba(239,68,68,0.16);
        }

        /* 🔦 Extra oomph on black: dark theme gets a touch more spread/blur */
        .dark .mw-dashboard-card:has(.mw-danger:hover){
          border-color: rgba(239,68,68,0.70) !important;
        }
        .dark .mw-dashboard-card:has(.mw-danger:hover)::before{
          box-shadow:
            0 0 0 1px rgba(239,68,68,0.34),
            0 0 24px rgba(239,68,68,0.28),
            0 0 56px rgba(239,68,68,0.24),
            0 0 96px rgba(239,68,68,0.18);
        }
      `}</style>
    </div>
  );
};

export default UserDashboardCard;
