// src/components/settings/AvatarSection.tsx
import { useRef, useState, useEffect } from 'react';
import { useAuthStore } from '@/store/useAuthStore';
import axios from '@/api/axios';
import { toast } from 'sonner';
import getAbsoluteUrl from '@/lib/getAbsoluteUrl';

interface AvatarSectionProps {
  currentAvatar?: string;
  onAvatarUpdate?: (newUrl: string) => void;
}

export default function AvatarSection({ currentAvatar, onAvatarUpdate }: AvatarSectionProps) {
  const { user, token, fetchUser, setUser } = useAuthStore();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!user && token) {
      fetchUser();
    }
  }, [user, token, fetchUser]);

  // ✅ Safe URL builder from shared util

  const cachedAvatar = localStorage.getItem('avatar_url');
  const avatarSrc =
    currentAvatar ||
    getAbsoluteUrl(user?.avatar_url) ||
    getAbsoluteUrl(user?.thumbnail_url) ||
    (cachedAvatar ? getAbsoluteUrl(cachedAvatar) : null) ||
    '/default-avatar.png';

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const headers: Record<string, string> = { 'Content-Type': 'multipart/form-data' };
      if (token) headers.Authorization = `Bearer ${token}`;

      const res = await axios.post('/avatar', formData, {
        headers,
        withCredentials: true,
      });

      if (res.data?.avatar_url) {
        const newUrl = getAbsoluteUrl(res.data.avatar_url) || res.data.avatar_url;
        toast.success('✅ Avatar updated!');

        // ✅ Update Zustand store and localStorage immediately
        if (user) {
          const updatedUser = { ...user, avatar_url: newUrl };
          setUser(updatedUser as any);
        }
        localStorage.setItem('avatar_url', newUrl);

        // ✅ Call parent Settings handler if provided
        if (onAvatarUpdate) onAvatarUpdate(newUrl);

        // ✅ Force fetch to sync backend
        await fetchUser(true);
      } else {
        toast.error('❌ Upload failed: no avatar URL returned');
      }
    } catch (err: any) {
      console.error('[Avatar Upload Error]', err);
      toast.error('❌ Avatar upload failed');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleClick = () => fileRef.current?.click();

  return (
    <div className="flex flex-col items-center gap-6">
      <img
        src={avatarSrc || '/default-avatar.png'}
        alt="avatar"
        className="w-28 h-28 rounded-full border border-white/30 shadow-inner object-cover"
        onError={(e) => {
          if (e.currentTarget.src !== '/default-avatar.png') {
            e.currentTarget.onerror = null;
            e.currentTarget.src = '/default-avatar.png';
          }
        }}
      />
      <input
        type="file"
        ref={fileRef}
        accept="image/*"
        onChange={handleFileChange}
        className="hidden"
      />
      <button
        onClick={handleClick}
        disabled={uploading}
        className="px-6 py-2 rounded-full bg-blue-500 hover:bg-blue-600 text-white transition-all disabled:opacity-50"
      >
        {uploading ? 'Uploading…' : 'Change Avatar'}
      </button>
    </div>
  );
}
