// src/components/auth/RequireAuth.tsx
import React, { PropsWithChildren, useEffect } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuthStore } from '@/store/useAuthStore'

/**
 * RequireAuth
 * - Works with BOTH nested routes (<Route element={<RequireAuth/>}><Route .../></Route>)
 *   and wrapper style (<RequireAuth><Dashboard/></RequireAuth>).
 * - Never gets stuck on "Checking session…" if the store already has a user.
 * - Triggers a single hydration attempt only when the store isn't resolved yet.
 */
export default function RequireAuth({ children }: PropsWithChildren) {
  const location = useLocation()

  const user = useAuthStore((s) => s.user)
  const resolved = useAuthStore((s) => s.resolved)
  const loading = useAuthStore((s) => s.loading)
  const fetchUser = useAuthStore((s) => s.fetchUser)

  // Kick off hydration only when needed
  useEffect(() => {
    if (!resolved && !loading) {
      void fetchUser(false)
    }
  }, [resolved, loading, fetchUser])

  // If we already have a user, render immediately (no spinner stall)
  if (user) {
    return <>{children ?? <Outlet />}</>
  }

  // While hydrating with no user yet, show a tiny placeholder
  if (!resolved) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <p className="text-zinc-500">Checking session…</p>
      </div>
    )
  }

  // Hydration finished and still no user → redirect to sign-in
  return (
    <Navigate
      to="/auth/signin"
      replace
      state={{ from: `${location.pathname}${location.search}` }}
    />
  )
}
