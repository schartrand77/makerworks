import { useEffect, ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useUser } from '@/hooks/useUser'
import PageLayout from '@/components/layout/PageLayout'

interface ProtectedLayoutProps {
  children: ReactNode
  role?: string // optional: role required to access
}

/**
 * Wrapper for protected routes.
 * - Ensures user is authenticated.
 * - Optionally checks for required role.
 * - Shows loading state if auth state is still resolving.
 * - Redirects to signin or shows forbidden message when needed.
 */
export default function ProtectedLayout({ children, role }: ProtectedLayoutProps) {
  const { user, isAuthenticated, loading, hasRole } = useUser()
  const location = useLocation()

  useEffect(() => {
    console.debug('[ProtectedLayout] mount', {
      user,
      loading,
      authenticated: isAuthenticated(),
      requiredRole: role,
    })
  }, [user, loading, role, isAuthenticated])

  if (loading) {
    console.info('[ProtectedLayout] Waiting for user state to resolve…')
    return (
      <PageLayout title="Loading">
        <p className="text-muted-foreground">Loading your session…</p>
      </PageLayout>
    )
  }

  if (!isAuthenticated()) {
    console.warn('[ProtectedLayout] User not authenticated → redirecting to /auth/signin')
    return <Navigate to="/auth/signin" state={{ from: location }} replace />
  }

  if (role && !hasRole(role)) {
    console.warn(`[ProtectedLayout] User lacks required role: ${role}`)
    return (
      <PageLayout title="Forbidden">
        <p className="text-red-600 dark:text-red-400">
          🚫 You do not have permission to access this page.
        </p>
      </PageLayout>
    )
  }

  console.debug('[ProtectedLayout] Access granted')
  return <>{children}</>
}
