// src/components/auth/AuthGate.tsx
import { Navigate, useLocation } from 'react-router-dom'
import { useEffect, ReactNode, useState } from 'react'
import { useAuthStore } from '@/store/useAuthStore'

type AuthGateProps = {
  children: ReactNode
  requiredRoles?: string[]
  fallback?: ReactNode
}

export default function AuthGate({
  children,
  requiredRoles,
  fallback
}: AuthGateProps): JSX.Element | null {
  const { user, resolved, isAuthenticated, fetchUser } = useAuthStore()
  const location = useLocation()
  const [checking, setChecking] = useState(!resolved)

  useEffect(() => {
    if (!resolved) {
      fetchUser().finally(() => setChecking(false))
    } else {
      setChecking(false)
    }
  }, [resolved, fetchUser])

  useEffect(() => {
    console.debug('[AuthGate] Auth state resolved:', resolved)
    console.debug('[AuthGate] User:', user)
    console.debug('[AuthGate] Required roles:', requiredRoles)
  }, [resolved, user, requiredRoles])

  if (checking) {
    return (
      fallback || (
        <div className="flex items-center justify-center h-screen">
          <div className="text-lg font-medium text-muted-foreground animate-pulse">
            Checking your access…
          </div>
        </div>
      )
    )
  }

  if (!isAuthenticated()) {
    console.warn(
      '[AuthGate] No user session → redirecting to /auth/signin',
      { from: location.pathname }
    )
    return (
      <Navigate
        to="/auth/signin"
        state={{ from: location }}
        replace
      />
    )
  }

  const groups = Array.isArray(user?.groups) ? user.groups : []
  if (requiredRoles && !requiredRoles.some((r) => groups.includes(r))) {
    console.warn(
      `[AuthGate] User groups ${JSON.stringify(groups)} lack required roles [${requiredRoles.join(
        ', '
      )}] → redirecting to /unauthorized`,
      { from: location.pathname }
    )
    return <Navigate to="/unauthorized" replace />
  }

  return <>{children}</>
}
