import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import type { User as FirebaseUser } from 'firebase/auth'
import { auth } from '../firebase/firebase'
import { loginWithEmail, logoutUser, registerWithEmail } from '../services/auth.service'
import { ensureUserProfile } from '../services/firestore.service'
import type { UserProfile } from '../services/firestore.service'
import { AuthContext } from './auth-context-state'
import type { AuthContextValue } from './auth-context-state'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<FirebaseUser | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    return onAuthStateChanged(auth, async (nextUser) => {
      setLoading(true)
      setUser(nextUser)
      if (!nextUser?.email) {
        setProfile(null)
        setLoading(false)
        return
      }
      const nextProfile = await ensureUserProfile(nextUser.uid, nextUser.email, nextUser.displayName)
      setProfile(nextProfile)
      setLoading(false)
    })
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      profile,
      role: profile?.role || null,
      loading,
      login: async (email, password) => {
        await loginWithEmail(email, password)
      },
      register: async (input) => {
        await registerWithEmail(input)
      },
      logout: logoutUser,
    }),
    [loading, profile, user],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
