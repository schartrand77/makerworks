// src/pages/Settings.tsx
import { useState, useEffect } from 'react';
import AvatarSection from '@/components/settings/AvatarSection';
import ProfileSection from '@/components/settings/ProfileSection';
import AccountSection from '@/components/settings/AccountSection';
import ThemeSection from '@/components/settings/ThemeSection';
import { useAuthStore } from '@/store/useAuthStore';
import getAbsoluteUrl from '@/lib/getAbsoluteUrl';

export default function Settings() {
  const [activeTab, setActiveTab] = useState<'profile' | 'account' | 'avatar' | 'theme'>('profile');
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);

  const cachedAvatar = localStorage.getItem('avatar_url');
  const avatarSrc =
    getAbsoluteUrl(user?.avatar_url) ||
    getAbsoluteUrl(user?.thumbnail_url) ||
    (cachedAvatar ? getAbsoluteUrl(cachedAvatar) : null) ||
    '/default-avatar.png';

  const handleAvatarUpdate = (newUrl: string) => {
    const updatedUser = { ...user, avatar_url: newUrl };
    setUser(updatedUser as any);
    localStorage.setItem('avatar_url', newUrl);
  };

  useEffect(() => {
    if (!user?.avatar_url && cachedAvatar) {
      setUser({ ...(user as any), avatar_url: cachedAvatar });
    }
  }, []);

  return (
    <div className="max-w-3xl mx-auto p-6">
      {/* Outer card wrapping the entire settings UI */}
      <div className="bg-white/70 dark:bg-gray-800/60 backdrop-blur-lg rounded-2xl shadow-xl p-6 border border-white/20">
        {/* Tab buttons */}
        <div className="flex gap-4 mb-6">
          <button
            onClick={() => setActiveTab('profile')}
            className={`
              px-4 py-2 rounded-lg transition border bg-transparent
              text-brand-black dark:text-brand-white
              ${activeTab === 'profile' ? 'border-brand-red' : 'border-transparent'}
            `}
          >
            Profile
          </button>
          <button
            onClick={() => setActiveTab('account')}
            className={`
              px-4 py-2 rounded-lg transition border bg-transparent
              text-brand-black dark:text-brand-white
              ${activeTab === 'account' ? 'border-brand-red' : 'border-transparent'}
            `}
          >
            Account
          </button>
          <button
            onClick={() => setActiveTab('avatar')}
            className={`
              px-4 py-2 rounded-lg transition border bg-transparent
              text-brand-black dark:text-brand-white
              ${activeTab === 'avatar' ? 'border-brand-red' : 'border-transparent'}
            `}
          >
            Avatar
          </button>
          <button
            onClick={() => setActiveTab('theme')}
            className={`
              px-4 py-2 rounded-lg transition border bg-transparent
              text-brand-black dark:text-brand-white
              ${activeTab === 'theme' ? 'border-brand-red' : 'border-transparent'}
            `}
          >
            Theme
          </button>
        </div>

        {/* Content area inside the same card */}
        <div className="mt-4">
          {activeTab === 'profile' && <ProfileSection />}
          {activeTab === 'account' && <AccountSection />}
          {activeTab === 'avatar' && (
            <AvatarSection currentAvatar={avatarSrc} onAvatarUpdate={handleAvatarUpdate} />
          )}
          {activeTab === 'theme' && <ThemeSection />}
        </div>
      </div>
    </div>
  );
}
