import { createContext } from 'react'
import type { User as FirebaseUser } from 'firebase/auth'
import type { UserProfile, UserRole } from '../services/firestore.service'

export interface AuthContextValue {
  user: FirebaseUser | null
  profile: UserProfile | null
  role: UserRole | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  register: (input: { name: string; email: string; password: string; role?: UserRole; department?: string }) => Promise<void>
  logout: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined)
