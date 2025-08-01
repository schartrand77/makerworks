// src/components/auth/RequireAuth.tsx
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuthStore } from '@/store/useAuthStore'
import { useEffect, useState } from 'react'

const RequireAuth: React.FC = () => {
  const { resolved, fetchUser } = useAuthStore()
  const location = useLocation()
  const [hydrated, setHydrated] = useState(false)

  // ✅ Access function on each render to avoid stale destructure
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)

  useEffect(() => {
    let mounted = true
    const init = async () => {
      if (!resolved) {
        await fetchUser()
      }
      if (mounted) setHydrated(true)
    }
    init()
    return () => {
      mounted = false
    }
  }, [resolved, fetchUser])

  if (!hydrated || !resolved) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <p className="text-zinc-500">Loading authentication…</p>
      </div>
    )
  }

  // ✅ Guard against undefined
  if (!isAuthenticated || !isAuthenticated()) {
    console.log('[RequireAuth] Redirecting to /auth/signin')
    return <Navigate to="/auth/signin" state={{ from: location }} replace />
  }

  return <Outlet />
}

export default RequireAuth
