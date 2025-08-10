// src/lib/resolveAvatar.ts
import getAbsoluteUrl from '@/lib/getAbsoluteUrl';

export function resolveAvatar(user?: { avatar_url?: string; avatar_updated_at?: string | number } | null, cached?: string | null) {
  const url =
    (user?.avatar_url && (getAbsoluteUrl(user.avatar_url) || user.avatar_url)) ||
    (cached && (getAbsoluteUrl(cached) || cached)) ||
    '/default-avatar.png';

  // cache-bust if we have a timestamp
  const ts = user?.avatar_updated_at ? new Date(user.avatar_updated_at).getTime() : undefined;
  return ts ? `${url}${url.includes('?') ? '&' : '?'}v=${ts}` : url;
}
