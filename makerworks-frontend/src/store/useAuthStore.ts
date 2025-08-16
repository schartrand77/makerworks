// src/store/useAuthStore.ts
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import axios from '@/api/axios'
import { toast } from 'sonner'
import type { UserOut } from '@/types/auth'

interface AuthState {
  user: UserOut | null
  token: string | null
  loading: boolean
  resolved: boolean

  setUser: (user: UserOut | null) => void
  setToken: (token: string | null) => void
  setAuth: (payload: { user: UserOut; token?: string | null }) => void
  setResolved: (val: boolean) => void
  logout: () => Promise<void>
  fetchUser: (force?: boolean) => Promise<UserOut | null>
  isAuthenticated: () => boolean
  hasRole: (role: string) => boolean
  isAdmin: () => boolean
}

// NOTE: our axios instance should already have baseURL='/api/v1' and withCredentials enabled.
// So we use **relative** paths here to avoid '/api/v1/api/v1/...'
const API_ME = '/users/me'
const API_SIGNOUT = '/auth/signout'

const initialState = (): Pick<AuthState, 'user' | 'token' | 'loading' | 'resolved'> => ({
  user: null,
  token: null,
  loading: false,
  resolved: false,
})

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      ...initialState(),

      setUser: (user) => {
        if (user?.avatar_url) {
          localStorage.setItem('avatar_url', user.avatar_url)
        } else {
          localStorage.removeItem('avatar_url')
        }
        set({ user })
      },

      setToken: (token) => {
        if (token) {
          localStorage.setItem('token', token)
        } else {
          localStorage.removeItem('token')
        }
        set({ token })
      },

      // token is optional because cookie-session backends won't return one
      setAuth: ({ user, token = null }) => {
        if (token) {
          localStorage.setItem('token', token)
        } else {
          localStorage.removeItem('token')
        }
        if (user?.avatar_url) {
          localStorage.setItem('avatar_url', user.avatar_url)
        } else {
          localStorage.removeItem('avatar_url')
        }
        set({ user, token, resolved: true })
      },

      setResolved: (val) => set({ resolved: val }),

      logout: async () => {
        set({ loading: true })
        try {
          // Cookie session or bearer — axios instance sends credentials
          await axios.post(API_SIGNOUT, {})
          toast.info('👋 Signed out successfully.')
        } catch (err) {
          // not fatal; still clear local state
          // eslint-disable-next-line no-console
          console.error('[useAuthStore] signout error:', err)
          toast.warning('⚠️ Could not fully sign out on server.')
        } finally {
          set({
            user: null,
            token: null,
            loading: false,
            resolved: true,
          })
          try {
            localStorage.removeItem('avatar_url')
            localStorage.removeItem('token')
            localStorage.removeItem('auth-storage')
            sessionStorage.removeItem('auth-storage')
          } catch (err) {
            // eslint-disable-next-line no-console
            console.warn('[useAuthStore] Failed to clear storage:', err)
          }
        }
      },

      fetchUser: async (force = false) => {
        const { resolved, user } = get()
        if (!force && resolved && user) return user

        set({ loading: true })
        try {
          // axios instance should already be withCredentials:true, but be explicit
          const res = await axios.get<UserOut>(API_ME, { withCredentials: true })
          const fetchedUser = res.data

          const savedAvatar = localStorage.getItem('avatar_url')
          if (!fetchedUser.avatar_url && savedAvatar) {
            fetchedUser.avatar_url = savedAvatar
          } else if (fetchedUser.avatar_url) {
            localStorage.setItem('avatar_url', fetchedUser.avatar_url)
          }

          set({ user: fetchedUser, loading: false, resolved: true })
          return fetchedUser
        } catch (err: any) {
          // eslint-disable-next-line no-console
          console.warn('[useAuthStore] Failed to fetch user:', err?.response?.status)
          set({
            user: null,
            token: null,
            loading: false,
            resolved: true, // we *did* check — prevents redirect loops during load
          })
          return null
        }
      },

      // Cookie sessions mean `user` can be truthy even if token is null.
      // Don’t gate "authenticated" strictly on token presence.
      isAuthenticated: () => {
        const { token, user, resolved } = get()
        if (!resolved) return false
        return Boolean(user || token)
      },

      hasRole: (role: string) => {
        const u = get().user as any
        if (!u) return false
        const target = role.toLowerCase()
        if (Array.isArray(u.role)) {
          return u.role.some((r: string) => String(r).toLowerCase() === target)
        }
        return String(u.role ?? '').toLowerCase() === target
      },

      // Tolerant admin detection to match varied backend shapes.
      isAdmin: () => {
        const u: any = get().user
        if (!u) return false

        const roleStr = String((u.role && (u.role.name || u.role)) ?? '')
          .trim()
          .toLowerCase()

        const rolesArr = Array.isArray(u.roles)
          ? u.roles.map((r: any) => String(r && (r.name || r)).trim().toLowerCase())
          : []

        const permsArr = Array.isArray(u.permissions)
          ? u.permissions.map((p: any) => String(p).trim().toLowerCase())
          : []

        const scope = typeof u.scope === 'string' ? u.scope.toLowerCase() : ''

        return (
          u.is_admin === true ||
          u.isAdmin === true ||
          u.role_id === 1 ||
          roleStr === 'admin' ||
          rolesArr.includes('admin') ||
          permsArr.includes('admin') ||
          scope.includes('admin')
        )
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
          state.resolved = true
        }
        const saved = localStorage.getItem('avatar_url')
        if (saved && state?.user && !state.user.avatar_url) {
          state.user.avatar_url = saved
        }
      },
    }
  )
)
