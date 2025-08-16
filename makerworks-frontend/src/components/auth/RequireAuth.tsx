// src/components/auth/RequireAuth.tsx
import React, { useEffect, useRef, useState } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuthStore } from '@/store/useAuthStore'

/**
 * Prevents the classic post-login redirect loop by:
 *  - Hydrating from /users/me when we're not authenticated yet (even if `resolved` is true)
 *  - Deferring *any* redirect until we've attempted one hydration pass
 *  - Using a one-shot guard so we don't spam fetches or redirects
 */
const RequireAuth: React.FC = () => {
  const location = useLocation()

  // Pull lightweight, reactive slices from the auth store
  const resolved = useAuthStore((s) => s.resolved)
  const fetchUser = useAuthStore((s) => s.fetchUser)
  const isAuthenticatedFn = useAuthStore((s) => s.isAuthenticated)

  // Compute current auth boolean safely each render
  const authed = Boolean(isAuthenticatedFn && isAuthenticatedFn())

  // Local one-shot gate so we only decide after a hydration attempt
  const [checked, setChecked] = useState(false)
  const hydratedOnceRef = useRef(false)
  const inflightRef = useRef<Promise<any> | null>(null)

  useEffect(() => {
    let cancelled = false

    async function ensureHydratedOnce() {
      // Already hydrated/decided
      if (hydratedOnceRef.current) {
        setChecked(true)
        return
      }

      try {
        // If we're not authenticated yet, or the app hasn't resolved, try to hydrate
        if (!authed || !resolved) {
          if (!inflightRef.current) {
            inflightRef.current = (async () => {
              try {
                // If your store supports a "force" or "withCredentials" flag, pass it here.
                await fetchUser?.()
              } finally {
                inflightRef.current = null
              }
            })()
          }
          await inflightRef.current
        }
      } catch {
        // ignore; decision happens below
      } finally {
        if (!cancelled) {
          hydratedOnceRef.current = true
          setChecked(true)
        }
      }
    }

    ensureHydratedOnce()
    return () => {
      cancelled = true
    }
    // We intentionally *do not* depend on `authed` or `resolved` here,
    // because we only want a single hydration attempt on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchUser])

  // While we haven't made a decision, render a tiny placeholder (no redirects yet).
  if (!checked) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <p className="text-zinc-500">Checking session…</p>
      </div>
    )
  }

  // After one hydration pass, if we're still not authenticated → redirect once.
  if (!authed) {
    console.log('[RequireAuth] Redirecting to /auth/signin')
    return <Navigate to="/auth/signin" state={{ from: location }} replace />
  }

  // Authenticated: render nested routes
  return <Outlet />
}

export default RequireAuth
