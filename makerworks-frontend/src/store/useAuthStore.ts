// src/store/useAuthStore.ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import axios from '@/api/axios';
import { toast } from 'sonner';
import type { UserOut } from '@/types/auth';

interface AuthState {
  user: UserOut | null;
  token: string | null;
  loading: boolean;
  resolved: boolean;

  setUser: (user: UserOut | null) => void;
  setToken: (token: string | null) => void;
  setAuth: (payload: { user: UserOut; token: string }) => void;
  setResolved: (val: boolean) => void;
  logout: () => Promise<void>;
  fetchUser: (force?: boolean) => Promise<UserOut | null>;
  isAuthenticated: () => boolean;
  hasRole: (role: string) => boolean;
}

const initialState = (): Pick<AuthState, 'user' | 'token' | 'loading' | 'resolved'> => ({
  user: null,
  token: null,
  loading: false,
  resolved: false,
});

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      ...initialState(),

      setUser: (user) => {
        if (user?.avatar_url) {
          localStorage.setItem('avatar_url', user.avatar_url);
        } else {
          localStorage.removeItem('avatar_url');
        }
        set({ user });
      },

      setToken: (token) => {
        if (token) {
          localStorage.setItem('token', token);
        } else {
          localStorage.removeItem('token');
        }
        set({ token });
      },

      setAuth: ({ user, token }) => {
        localStorage.setItem('token', token);
        if (user?.avatar_url) {
          localStorage.setItem('avatar_url', user.avatar_url);
        } else {
          localStorage.removeItem('avatar_url');
        }
        set({ user, token, resolved: true });
      },

      setResolved: (val) => set({ resolved: val }),

      logout: async () => {
        set({ loading: true });
        try {
          const token = get().token;
          if (token) {
            await axios.post(
              '/auth/signout',
              {},
              {
                headers: { Authorization: `Bearer ${token}` },
              }
            );
          }
          toast.info('👋 Signed out successfully.');
        } catch (err) {
          console.error('[useAuthStore] signout error:', err);
          toast.warning('⚠️ Could not fully sign out on server.');
        } finally {
          set({
            user: null,
            token: null,
            loading: false,
            resolved: true,
          });

          try {
            localStorage.removeItem('avatar_url');
            localStorage.removeItem('token');
            localStorage.removeItem('auth-storage');
            sessionStorage.removeItem('auth-storage');
          } catch (err) {
            console.warn('[useAuthStore] Failed to clear storage:', err);
          }
        }
      },

      fetchUser: async (force = false) => {
        const { resolved, user } = get();
        if (!force && resolved) return user;

        set({ loading: true });

        try {
          const res = await axios.get<UserOut>('/auth/me', { withCredentials: true });
          const fetchedUser = res.data;

          const savedAvatar = localStorage.getItem('avatar_url');
          if (!fetchedUser.avatar_url && savedAvatar) {
            fetchedUser.avatar_url = savedAvatar;
          } else if (fetchedUser.avatar_url) {
            localStorage.setItem('avatar_url', fetchedUser.avatar_url);
          }

          set({ user: fetchedUser, loading: false, resolved: true });
          return fetchedUser;
        } catch (err: any) {
          console.warn('[useAuthStore] Failed to fetch user:', err?.response?.status);
          set({
            user: null,
            token: null,
            loading: false,
            resolved: true,
          });
          return null;
        }
      },

      isAuthenticated: () => {
        const { token, user, resolved } = get();
        if (!resolved) return false;
        return Boolean(token && user);
      },

      hasRole: (role: string) => {
        const user = get().user;
        if (!user) return false;
        const target = role.toLowerCase();
        if (Array.isArray(user.role)) {
          return user.role.some((r) => r.toLowerCase() === target);
        }
        return user.role?.toLowerCase() === target;
      },
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        user: state.user,
        token: state.token,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.resolved = true;
        }
        const saved = localStorage.getItem('avatar_url');
        if (saved && state?.user && !state.user.avatar_url) {
          state.user.avatar_url = saved;
        }
      },
    }
  )
);
