import { useAuth } from './useAuth'
import type { UserRole } from '../services/firestore.service'

export function useRole() {
  const { role } = useAuth()
  return {
    role,
    isAdmin: role === 'Admin',
    isFaculty: role === 'Faculty',
    isStudent: role === 'Student',
    hasRole: (allowedRoles: UserRole[]) => !!role && allowedRoles.includes(role),
  }
}
