import { useState } from 'react';
import { useAuthStore } from '@/store/useAuthStore';
import { useNavigate } from 'react-router-dom';
import axiosInstance from '@/api/client';
import { toast } from 'sonner';

type SignOutButtonProps = {
  className?: string;
  redirectTo?: string; // where to redirect after logout
  confirm?: boolean;   // whether to show a confirmation modal
};

/**
 * Logs the user out locally & requests backend to revoke session.
 * Ensures store is always cleared regardless of backend result.
 */
export default function SignOutButton({
  className = '',
  redirectTo = '/',
  confirm = false,
}: SignOutButtonProps) {
  const [loading, setLoading] = useState(false);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();

  const handleSignOut = async () => {
    if (loading) return;

    if (confirm) {
      const confirmed = window.confirm('Are you sure you want to sign out?');
      if (!confirmed) return;
    }

    setLoading(true);

    try {
      const res = await axiosInstance.post('/auth/signout');

      if (res.status === 200) {
        toast.success('✅ Signed out successfully.');
      } else {
        console.warn('[SignOutButton] Unexpected sign-out status:', res.status);
        toast.warning('⚠️ Backend returned unexpected status. Session cleared locally.');
      }
    } catch (err: any) {
      console.error('[SignOutButton] Backend sign-out error:', err);
      toast.error(
        `⚠️ Sign-out error: ${err?.response?.data?.detail || err?.message || 'unknown error'}`
      );
    } finally {
      logout();
      setLoading(false);
      navigate(redirectTo);
    }
  };

  return (
    <button
      onClick={handleSignOut}
      disabled={loading}
      className={`px-4 py-2 text-sm rounded-xl backdrop-blur bg-white/20 dark:bg-black/20 hover:bg-white/30 dark:hover:bg-black/30 border border-white/10 text-zinc-800 dark:text-white disabled:opacity-50 shadow transition ${className}`}
      aria-busy={loading}
    >
      {loading ? 'Signing out…' : 'Sign Out'}
    </button>
  );
}
