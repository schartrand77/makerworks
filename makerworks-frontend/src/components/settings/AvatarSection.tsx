// src/components/settings/AvatarSection.tsx
import { useRef, useState, useEffect, useMemo } from 'react';
import { useAuthStore } from '@/store/useAuthStore';
import axios from '@/api/client';
import { toast } from 'sonner';
import getAbsoluteUrl from '@/lib/getAbsoluteUrl';

interface AvatarSectionProps {
  currentAvatar?: string;
  onAvatarUpdate?: (newUrl: string) => void;
}

// Swagger says: POST /api/v1/avatar/
// Our axios instance baseURL is http://localhost:8000/api/v1
const AVATAR_UPLOAD_PATH = '/avatar/';

export default function AvatarSection({ currentAvatar, onAvatarUpdate }: AvatarSectionProps) {
  const { user, fetchUser, setUser } = useAuthStore();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  // Ensure user profile is loaded
  useEffect(() => {
    if (!user) fetchUser();
  }, [user, fetchUser]);

  // Build the base avatar URL
  const avatarBase = useMemo(() => {
    const cached = typeof window !== 'undefined' ? localStorage.getItem('avatar_url') : null;
    const resolved =
      currentAvatar ||
      (user?.avatar_url ? getAbsoluteUrl(user.avatar_url) || user.avatar_url : null) ||
      (user?.thumbnail_url ? getAbsoluteUrl(user.thumbnail_url) || user.thumbnail_url : null) ||
      (cached ? getAbsoluteUrl(cached) || cached : null);

    return resolved || '/default-avatar.png';
  }, [currentAvatar, user?.avatar_url, user?.thumbnail_url]);

  // Cache-bust if we have a timestamp
  const avatarSrc = useMemo(() => {
    if (!avatarBase || avatarBase === '/default-avatar.png') return '/default-avatar.png';
    const ts = user?.avatar_updated_at
      ? new Date(user.avatar_updated_at as any).getTime()
      : undefined;
    return ts
      ? `${avatarBase}${avatarBase.includes('?') ? '&' : '?'}v=${ts}`
      : avatarBase;
  }, [avatarBase, user?.avatar_updated_at]);

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
      const FIVE_MB = 5 * 1024 * 1024;
      if (file.size > FIVE_MB) {
        toast.error('❌ File too large (max 5MB).');
        return;
      }

      const formData = new FormData();
      formData.append('file', file, file.name);

      console.log('[avatar] POST', (axios as any).defaults?.baseURL || '(no baseURL)', AVATAR_UPLOAD_PATH);

      const res = await axios.post(AVATAR_UPLOAD_PATH, formData, {
        withCredentials: true,
      });

      // backend returns a relative path like /uploads/users/<id>/avatars/<file>.png
      const newUrlRaw: string | undefined = res.data?.avatar_url;
      const serverUpdatedAt: string | number | undefined =
        res.data?.uploaded_at || res.data?.avatar_updated_at;

      if (!newUrlRaw) {
        toast.error('❌ Upload failed: no avatar URL returned');
        return;
      }

      const newUrlAbs = getAbsoluteUrl(newUrlRaw) || newUrlRaw;
      const updatedAt = serverUpdatedAt
        ? new Date(serverUpdatedAt).getTime()
        : Date.now();

      // Update Zustand store
      if (user) {
        setUser({
          ...user,
          avatar_url: newUrlRaw,
          avatar_updated_at: updatedAt,
        } as any);
      }

      // Persist raw relative URL for next sessions
      try {
        localStorage.setItem('avatar_url', newUrlRaw);
      } catch {
        /* non-fatal */
      }

      // Notify parent if provided
      onAvatarUpdate?.(newUrlAbs);

      // Broadcast global event for navbar/cards
      const busted = `${newUrlAbs}${newUrlAbs.includes('?') ? '&' : '?'}v=${updatedAt}`;
      window.dispatchEvent(
        new CustomEvent('avatar:updated', {
          detail: { url: busted, raw: newUrlAbs, ts: updatedAt },
        })
      );

      // Refetch user to sync
      await fetchUser(true);

      toast.success('✅ Avatar updated!');
    } catch (err: any) {
      const status = err?.response?.status;
      const detail = err?.response?.data?.detail;
      if (status === 404) {
        toast.error('❌ Avatar endpoint not found. Check proxy & route: POST /api/v1/avatar/');
      } else if (status === 401) {
        toast.error('🔒 Unauthorized. Please sign in again.');
      } else if (status === 413) {
        toast.error('❌ File too large for server.');
      } else {
        toast.error(`❌ Avatar upload failed${detail ? `: ${String(detail)}` : ''}`);
      }
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
        src={avatarSrc}
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
