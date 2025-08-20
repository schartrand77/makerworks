// src/components/ui/MobileDrawer.tsx
import React from 'react'
import { useAuthStore } from '@/store/useAuthStore'

interface MobileDrawerProps {
  open: boolean
  onClose: () => void
}

function hasAdminPrivileges(u: any): boolean {
  if (!u) return false
  const roleStr = String(u.role ?? '').toLowerCase()
  if (['admin', 'owner', 'superuser', 'staff'].includes(roleStr)) return true
  if (u.is_admin === true || u.is_staff === true || u.is_superuser === true || u.isOwner === true) return true
  if (Number(u.role_id) === 1) return true // tolerate "1" (string) too
  if (Array.isArray(u.permissions) && u.permissions.some((p: any) => String(p).toLowerCase().includes('admin'))) {
    return true
  }
  return false
}

function coerceIsAdmin(val: unknown): boolean {
  // store may expose a fn or a boolean
  if (typeof val === 'function') {
    try {
      const out = (val as () => unknown)()
      return !!out
    } catch {
      return false
    }
  }
  return !!val
}

export default function MobileDrawer({ open, onClose }: MobileDrawerProps) {
  // Single source of truth: the auth store (already hydrated by App.tsx)
  const storeUser = useAuthStore((s: any) => s.user)
  const storeIsAdmin = useAuthStore((s: any) => s.isAdmin)
  const logout = useAuthStore((s: any) => s.logout)

  const isAdminUser = React.useMemo(() => {
    const flag = coerceIsAdmin(storeIsAdmin)
    if (flag) return true
    return hasAdminPrivileges(storeUser)
  }, [storeIsAdmin, storeUser])

  if (!open) return null

  const handleAuthClick = () => {
    if (storeUser) {
      console.info('[MobileDrawer] Signing out...')
      logout?.()
      window.location.href = '/'
    } else {
      console.info('[MobileDrawer] Navigating to Sign In...')
      onClose()
      window.location.href = '/auth/signin'
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex justify-center items-center"
      onClick={onClose}
    >
      <div
        className="
          backdrop-blur-xl
          bg-white/20
          dark:bg-zinc-900/20
          shadow-xl
          w-72 max-w-full p-4
          rounded-full
          flex flex-col items-center space-y-3
          border border-white/20 dark:border-zinc-700/30
        "
        onClick={(e) => e.stopPropagation()}
      >
        <a
          href="/settings"
          className="
            w-full text-center py-2 px-4 text-sm rounded-full
            backdrop-blur
            bg-white/20 dark:bg-zinc-800/30
            border border-white/20 dark:border-zinc-700/30
            text-gray-900 dark:text-gray-100
            shadow
            hover:bg-white/30 dark:hover:bg-zinc-700/50
            hover:shadow-md
            transition
          "
        >
          Account Settings
        </a>

        {isAdminUser && (
          <a
            href="/admin"
            data-testid="admin-link"
            className="
              w-full text-center py-2 px-4 text-sm rounded-full
              backdrop-blur
              bg-red-500/20 dark:bg-red-700/30
              border border-red-500/30 dark:border-red-700/40
              text-red-800 dark:text-red-200
              shadow
              hover:bg-red-500/30 dark:hover:bg-red-700/50
              hover:shadow-md
              transition
            "
          >
            Admin Panel
          </a>
        )}

        {storeUser && (
          <div
            className="
              mt-2 text-xs text-center text-gray-700 dark:text-zinc-300
              truncate max-w-[180px] px-2
            "
            title={(storeUser as any)?.email}
          >
            {(storeUser as any)?.email}
          </div>
        )}

        <button
          onClick={handleAuthClick}
          className="
            w-full py-2 px-4 text-sm rounded-full
            backdrop-blur
            bg-zinc-900/30 dark:bg-zinc-700/30
            border border-zinc-300/20 dark:border-zinc-600/30
            text-white
            shadow
            hover:bg-zinc-900/50 dark:hover:bg-zinc-700/50
            hover:shadow-md
            transition
          "
        >
          {storeUser ? 'Sign Out' : 'Sign In'}
        </button>
      </div>
    </div>
  )
}
