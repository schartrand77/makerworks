import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/store/useAuthStore';
import axiosInstance from '@/api/axios';
import { toast } from 'sonner';

/**
 * Handles user sign-out process:
 * - Invalidates backend session
 * - Clears local auth state
 * - Redirects to landing page
 * - Handles disabled state for button UX
 */
export const useSignOut = () => {
  const [disabled, setDisabled] = useState(false);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();

  const signOut = async () => {
    if (disabled) {
      console.warn('[useSignOut] Sign-out already in progress — ignoring.');
      return;
    }

    setDisabled(true);
    console.info('[useSignOut] 🔒 Signing out...');

    try {
      await axiosInstance.post('/auth/signout').catch((err) => {
        console.warn(
          '[useSignOut] Backend sign-out failed (continuing anyway):',
          err?.response?.data || err.message
        );
      });

      try {
        logout();
        console.info('[useSignOut] ✅ Local session cleared.');
        toast.success('Signed out successfully.');
      } catch (logoutErr) {
        console.error('[useSignOut] Failed to clear local session:', logoutErr);
        toast.error('⚠️ Local sign-out issue. Please reload.');
      }
    } catch (err) {
      console.error('[useSignOut] Unexpected sign-out error:', err);
      toast.error('❌ Sign-out failed.');
    } finally {
      setDisabled(false);
      navigate('/'); // Always return to home
    }
  };

  return {
    disabled,
    signOut,
  };
};
