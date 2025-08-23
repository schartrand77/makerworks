// src/components/auth/SignOutButton.tsx
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import axiosInstance from '@/api/client';
import { useAuthStore } from '@/store/useAuthStore';

type SignOutButtonProps = {
  className?: string;
  redirectTo?: string; // where to redirect after logout
  confirm?: boolean;   // whether to show a confirmation modal
};

/**
 * Logs the user out locally & asks backend to revoke session.
 * The store is always cleared regardless of backend outcome.
 */
export default function SignOutButton({
  className = '',
  redirectTo = '/',
  confirm = false,
}: SignOutButtonProps) {
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  // pull only what we need to avoid extra rerenders
  const logout = useAuthStore((s) => s.logout);

  // protect against state updates after unmount
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);

  const doLocalLogout = () => {
    try {
      if (typeof logout === 'function') logout();
      else {
        // fallback in case the selector shape changes
        const fn = (useAuthStore as any).getState?.().logout;
        if (typeof fn === 'function') fn();
      }
    } catch (e) {
      // swallow; we still navigate away
      console.warn('[SignOutButton] local logout failed:', e);
    }
  };

  const handleSignOut = async () => {
    if (loading) return;

    if (confirm) {
      const confirmed = window.confirm('Are you sure you want to sign out?');
      if (!confirmed) return;
    }

    if (mounted.current) setLoading(true);

    try {
      const res = await axiosInstance.post(
        '/auth/signout',
        null,
        { timeout: 10000, validateStatus: () => true } // never throw
      );

      // Accept 200 or 204 as success
      if (res.status === 200 || res.status === 204) {
        toast.success('✅ Signed out.');
      } else {
        console.warn('[SignOutButton] Unexpected status:', res.status, res.data);
        toast.warning('⚠️ Session cleared locally.');
      }
    } catch (err: any) {
      console.error('[SignOutButton] Backend sign-out error:', err);
      toast.error(`⚠️ Sign-out error: ${err?.response?.data?.detail || err?.message || 'unknown'}`);
    } finally {
      // Always clear local session and leave the page.
      doLocalLogout();
      if (mounted.current) setLoading(false);
      navigate(redirectTo, { replace: true });

      // Hard fallback in case a router guard blocks navigation
      setTimeout(() => {
        try {
          if (window.location.pathname !== redirectTo) {
            window.location.href = redirectTo;
          }
        } catch { /* noop */ }
      }, 0);
    }
  };

  return (
    <button
      type="button"
      onClick={handleSignOut}
      disabled={loading}
      className={`px-4 py-2 text-sm rounded-xl backdrop-blur bg-white/20 dark:bg-black/20 hover:bg-white/30 dark:hover:bg-black/30 border border-white/10 text-zinc-800 dark:text-white disabled:opacity-50 shadow transition ${className}`}
      aria-busy={loading}
    >
      {loading ? 'Signing out…' : 'Sign Out'}
    </button>
  );
}
