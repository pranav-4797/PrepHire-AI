import type { ReactNode } from 'react'
import { useAuth } from '../../hooks/useAuth'

export function ProtectedRoute({
  children,
  fallback = null,
}: {
  children: ReactNode
  fallback?: ReactNode
}) {
  const { user, loading } = useAuth()
  if (loading) return <>{fallback}</>
  if (!user) return <>{fallback}</>
  return <>{children}</>
}
