import type { ReactNode } from 'react'
import { useRole } from '../../hooks/useRole'
import type { UserRole } from '../../services/firestore.service'

export function RoleGuard({
  allowedRoles,
  children,
  fallback = null,
}: {
  allowedRoles: UserRole[]
  children: ReactNode
  fallback?: ReactNode
}) {
  const { hasRole } = useRole()
  if (!hasRole(allowedRoles)) return <>{fallback}</>
  return <>{children}</>
}
