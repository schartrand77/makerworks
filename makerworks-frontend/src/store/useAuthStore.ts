// src/store/useAuthStore.ts
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import axios from '@/api/client'
import { toast } from 'sonner'
import type { UserOut } from '@/types/auth'
import { isAxiosError } from 'axios'

interface AuthState {
  user: UserOut | null
  loading: boolean
  resolved: boolean
  hadUser: boolean
  lastAuthStatus: number | null

  setUser: (user: UserOut | null) => void
  setAuth: (payload: { user: UserOut }) => void
  setResolved: (val: boolean) => void
  logout: () => Promise<void>
  fetchUser: (force?: boolean) => Promise<UserOut | null>
  isAuthenticated: () => boolean
  hasRole: (role: string) => boolean
  isAdmin: () => boolean
}

// Real API (no trailing slashes)
const API_ME = 'api/v1/auth/me'
const API_SIGNOUT = 'api/v1/auth/signout'

const initialState = (): Pick<
  AuthState,
  'user' | 'loading' | 'resolved' | 'hadUser' | 'lastAuthStatus'
> => ({
  user: null,
  loading: false,
  resolved: false,
  hadUser: false,
  lastAuthStatus: null,
})

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      ...initialState(),

      setUser: (user) => {
        // sticky avatar for components that read from localStorage
        if (user?.avatar_url) {
          localStorage.setItem('avatar_url', user.avatar_url)
        } else {
          localStorage.removeItem('avatar_url')
        }
        set({
          user,
          hadUser: get().hadUser || Boolean(user),
        })
      },

      // token removed — rely on HTTP-only cookies
      setAuth: ({ user }) => {
        if (user?.avatar_url) localStorage.setItem('avatar_url', user.avatar_url)
        else localStorage.removeItem('avatar_url')

        set({
          user,
          resolved: true,
          hadUser: true,
          lastAuthStatus: 200,
        })
      },

      setResolved: (val) => set({ resolved: val }),

      logout: async () => {
        set({ loading: true })
        try {
          // Best-effort; never throw. Treat common codes as "already signed out".
          const res = await axios.post(API_SIGNOUT, null, {
            validateStatus: (s) => (s >= 200 && s < 300) || (s >= 400 && s < 500),
          })
          set({ lastAuthStatus: res.status ?? 200 })
        } catch {
          // network? fine — we still clear client state
        } finally {
          set({
            user: null,
            loading: false,
            resolved: true,
          })
          try {
            localStorage.removeItem('avatar_url')
            localStorage.removeItem('auth-storage')
            sessionStorage.removeItem('auth-storage')
          } catch (err) {
            // eslint-disable-next-line no-console
            console.warn('[useAuthStore] Failed to clear storage:', err)
          }
          toast.info('👋 Signed out.')
        }
      },

      fetchUser: async (force = false) => {
        const { resolved, user } = get()
        if (!force && resolved && user) return user

        set({ loading: true })
        try {
          const res = await axios.get<UserOut>(API_ME, {
            withCredentials: true,
            validateStatus: (s) =>
              (s >= 200 && s < 300) || (s >= 400 && s < 500),
          })

          set({ lastAuthStatus: res.status })

          if (res.status === 200) {
            const fetched = res.data
            // Preserve cached avatar_url if backend omitted it
            const savedAvatar = localStorage.getItem('avatar_url')
            if (!fetched.avatar_url && savedAvatar) {
              fetched.avatar_url = savedAvatar
            } else if (fetched.avatar_url) {
              localStorage.setItem('avatar_url', fetched.avatar_url)
            }

            set({
              user: fetched,
              loading: false,
              resolved: true,
              hadUser: true,
            })
            return fetched
          }

          // Soft failures: 401/403/404/405/422 — do NOT nuke user unless forced
          if ([401, 403, 404, 405, 422].includes(res.status)) {
            if (force || !get().user) {
              set({ user: null, loading: false, resolved: true })
            } else {
              set({ loading: false, resolved: true })
            }
            return null
          }

          // Unexpected status: treat as error
          const detail = (res.data as { detail?: string })?.detail
          throw new Error(detail || 'Failed to fetch user')
        } catch (err: unknown) {
          const code = isAxiosError(err) ? err.response?.status ?? -1 : -1
          // eslint-disable-next-line no-console
          console.warn('[useAuthStore] Failed to fetch user:', code)
          set({
            lastAuthStatus: code,
            user: force ? null : get().user,
            loading: false,
            resolved: true,
          })
          return null
        }
      },

      isAuthenticated: () => {
        const { user, resolved } = get()
        if (!resolved) return false
        return Boolean(user)
      },

      hasRole: (role: string) => {
        const u = get().user
        if (!u) return false
        const target = role.toLowerCase()
        const primary = u.role
        if (Array.isArray(primary)) {
          return primary.some((r) => {
            const name = typeof r === 'string' ? r : r?.name ?? ''
            return name.toLowerCase() === target
          })
        }
        const name = typeof primary === 'string' ? primary : primary?.name ?? ''
        return name.toLowerCase() === target
      },

      // Tolerant admin detection to match varied backend shapes.
      isAdmin: () => {
        const u = get().user
        if (!u) return false

        const roleVal = u.role
        const roleStr = Array.isArray(roleVal)
          ? ''
          : typeof roleVal === 'string'
          ? roleVal
          : roleVal?.name ?? ''

        const rolesArr = Array.isArray(u.roles)
          ? u.roles.map((r) =>
              (typeof r === 'string' ? r : r?.name ?? '')
                .trim()
                .toLowerCase()
            )
          : []

        const permsArr = Array.isArray(u.permissions)
          ? u.permissions.map((p) => p.trim().toLowerCase())
          : []

        const scope = typeof u.scope === 'string' ? u.scope.toLowerCase() : ''

        return (
          u.is_admin === true ||
          u.isAdmin === true ||
          u.role_id === 1 ||
          roleStr.trim().toLowerCase() === 'admin' ||
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
        hadUser: state.hadUser,
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
