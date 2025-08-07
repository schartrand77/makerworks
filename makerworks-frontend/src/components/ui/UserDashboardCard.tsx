// src/components/ui/UserDashboardCard.tsx
import { useNavigate } from 'react-router-dom';
import GlassCard from '@/components/ui/GlassCard';
import { useAuthStore } from '@/store/useAuthStore';
import getAbsoluteUrl from '@/lib/getAbsoluteUrl';

const UserDashboardCard = () => {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  if (!user) return null;

  const cachedAvatar = localStorage.getItem('avatar_url');
  const avatarSrc =
    getAbsoluteUrl(user.avatar_url) ||
    getAbsoluteUrl(user.thumbnail_url) ||
    (cachedAvatar ? getAbsoluteUrl(cachedAvatar) : null) ||
    '/default-avatar.png';

  const handleSignOut = async () => {
    await logout();
    navigate('/');
  };

  return (
    <GlassCard className="w-full max-w-md p-6 text-center flex flex-col items-center gap-4 shadow-[0_8px_20px_rgba(128,128,128,0.15)]">
      <div className="w-20 h-20 rounded-full bg-zinc-300 dark:bg-zinc-700 overflow-hidden shadow-md">
        {avatarSrc && !avatarSrc.includes('default') ? (
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
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center font-semibold text-xl text-white dark:text-zinc-200">
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
          className="px-4 py-1.5 rounded-full bg-brand-primary/90 text-zinc-900 dark:text-white shadow-sm hover:bg-brand-primary transition text-sm font-medium"
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
