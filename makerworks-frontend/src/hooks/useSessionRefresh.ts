import { useEffect } from 'react';
import { useAuthStore } from '@/store/useAuthStore';

const DEFAULT_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Periodically refreshes the authenticated user's session by
 * calling `fetchUser()` which hits `/auth/me`. This keeps the
 * Redis session alive across the application.
 */
export const useSessionRefresh = (intervalMs: number = DEFAULT_INTERVAL_MS) => {
  const fetchUser = useAuthStore((s) => s.fetchUser);
  const user = useAuthStore((s) => s.user);

  useEffect(() => {
    if (!user) return;

    const id = setInterval(() => {
      fetchUser?.(true).catch((err) => {
        console.warn('[useSessionRefresh] refresh failed:', err);
      });
    }, intervalMs);

    return () => clearInterval(id);
  }, [fetchUser, user, intervalMs]);
};
