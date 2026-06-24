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

  useEffect(() => {
    if (!user) return

    const TIMEOUT_MS = 30 * 60 * 1000 // 30 minutes
    const LAST_ACTIVE_KEY = 'prephire_last_active'

    const checkSession = async () => {
      const lastActive = localStorage.getItem(LAST_ACTIVE_KEY)
      if (lastActive) {
        const timeElapsed = Date.now() - parseInt(lastActive, 10)
        if (timeElapsed >= TIMEOUT_MS) {
          console.log('[Auth] User inactive for more than 30 minutes. Auto-logging out.')
          localStorage.removeItem(LAST_ACTIVE_KEY)
          await logoutUser()
          return true
        }
      }
      return false
    }

    checkSession().then((isLoggedOut) => {
      if (isLoggedOut) return

      localStorage.setItem(LAST_ACTIVE_KEY, Date.now().toString())

      let timeoutId: number

      const resetTimer = () => {
        if (timeoutId) window.clearTimeout(timeoutId)

        const lastActive = localStorage.getItem(LAST_ACTIVE_KEY)
        const now = Date.now()
        if (!lastActive || now - parseInt(lastActive, 10) > 5000) {
          localStorage.setItem(LAST_ACTIVE_KEY, now.toString())
        }

        timeoutId = window.setTimeout(async () => {
          console.log('[Auth] User inactive for 30 minutes. Auto-logging out.')
          localStorage.removeItem(LAST_ACTIVE_KEY)
          await logoutUser()
        }, TIMEOUT_MS)
      }

      const events = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart']
      events.forEach((event) => window.addEventListener(event, resetTimer))

      resetTimer()

      return () => {
        if (timeoutId) window.clearTimeout(timeoutId)
        events.forEach((event) => window.removeEventListener(event, resetTimer))
      }
    })
  }, [user])

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
