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

const AVATAR_UPLOAD_PATH = '/api/v1/users/avatar'; // ✅ correct backend route

export default function AvatarSection({ currentAvatar, onAvatarUpdate }: AvatarSectionProps) {
  const { user, token, fetchUser, setUser } = useAuthStore();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  // Make sure we have a user loaded if we already have a token
  useEffect(() => {
    if (!user && token) {
      fetchUser();
    }
  }, [user, token, fetchUser]);

  // Build the avatar src with graceful fallbacks
  const cachedAvatar = typeof window !== 'undefined' ? localStorage.getItem('avatar_url') : null;
  const avatarSrc =
    currentAvatar ||
    (user?.avatar_url ? getAbsoluteUrl(user.avatar_url) || user.avatar_url : null) ||
    (user?.thumbnail_url ? getAbsoluteUrl(user.thumbnail_url) || user.thumbnail_url : null) ||
    (cachedAvatar ? getAbsoluteUrl(cachedAvatar) || cachedAvatar : null) ||
    '/default-avatar.png';

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);

    try {
      // Basic client-side guardrails
      if (!file.type.startsWith('image/')) {
        toast.error('❌ Please select an image file.');
        return;
      }
      // 5 MB soft cap—tune to your backend max
      const FIVE_MB = 5 * 1024 * 1024;
      if (file.size > FIVE_MB) {
        toast.error('❌ File too large (max 5MB).');
        return;
      }

      const formData = new FormData();
      formData.append('file', file, file.name); // ✅ backend expects "file"

      // Let the browser set multipart boundary; don’t force Content-Type
      const res = await axios.post(
        AVATAR_UPLOAD_PATH,
        formData,
        {
          withCredentials: true,
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        }
      );

      const newUrlRaw: string | undefined = res.data?.avatar_url;
      if (!newUrlRaw) {
        toast.error('❌ Upload failed: no avatar URL returned');
        return;
      }

      const newUrl = getAbsoluteUrl(newUrlRaw) || newUrlRaw;

      // Update Zustand store and localStorage immediately
      if (user) {
        const updatedUser = { ...user, avatar_url: newUrl };
        setUser(updatedUser as any);
      }
      try {
        localStorage.setItem('avatar_url', newUrl);
      } catch {
        /* non-fatal */
      }

      // Notify parent
      onAvatarUpdate?.(newUrl);

      // Sync from backend (force refresh)
      await fetchUser(true);

      toast.success('✅ Avatar updated!');
    } catch (err: any) {
      // Better diagnostics
      const status = err?.response?.status;
      const detail = err?.response?.data?.detail;
      if (status === 404) {
        toast.error('❌ Avatar endpoint not found. Check proxy & route: POST /api/v1/users/avatar');
      } else if (status === 401) {
        toast.error('🔒 Unauthorized. Please sign in again.');
      } else if (status === 413) {
        toast.error('❌ File too large for server.');
      } else {
        toast.error(`❌ Avatar upload failed${detail ? `: ${String(detail)}` : ''}`);
      }
      // eslint-disable-next-line no-console
      console.error('[Avatar Upload Error]', err);
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
