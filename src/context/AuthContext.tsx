import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import type { User as FirebaseUser } from 'firebase/auth'
import { auth } from '../firebase/firebase'
import { loginWithEmail, logoutUser, registerWithEmail } from '../services/auth.service'
import { ensureUserProfile } from '../services/firestore.service'
import type { UserProfile } from '../services/firestore.service'
import { AuthContext } from './auth-context-state'
import type { AuthContextValue } from './auth-context-state'

// localStorage can throw (Safari private mode, storage disabled by policy).
const safeStorage = {
  get: (key: string): string | null => {
    try { return localStorage.getItem(key) } catch { return null }
  },
  set: (key: string, value: string) => {
    try { localStorage.setItem(key, value) } catch { /* ignore */ }
  },
  remove: (key: string) => {
    try { localStorage.removeItem(key) } catch { /* ignore */ }
  },
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<FirebaseUser | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const pendingRegistrationEmailRef = useRef<string | null>(null)

  useEffect(() => {
    // Each auth event gets a sequence number so a slow profile fetch for a PREVIOUS
    // user can never overwrite state after the user logged out / switched account
    // (stale-role leak), and so an error can't leave the app stuck on the spinner.
    let seq = 0
    const unsubscribe = onAuthStateChanged(auth, async (nextUser) => {
      const mySeq = ++seq
      setLoading(true)
      setUser(nextUser)
      if (!nextUser?.email) {
        setProfile(null)
        safeStorage.remove('prephire_user_role')
        setLoading(false)
        return
      }
      if (pendingRegistrationEmailRef.current === nextUser.email.toLowerCase()) {
        return // register() is creating the profile itself and will clear loading
      }
      try {
        const nextProfile = await ensureUserProfile(nextUser.uid, nextUser.email, nextUser.displayName)
        if (mySeq !== seq) return
        if (nextProfile?.disabled) {
          safeStorage.remove('prephire_user_role')
          setUser(null)
          setProfile(null)
          await logoutUser()
          return
        }
        setProfile(nextProfile)
        if (nextProfile?.role) safeStorage.set('prephire_user_role', nextProfile.role)
      } catch (error) {
        console.error('[Auth] Failed to load user profile:', error)
        if (mySeq !== seq) return
        setProfile(null)
      } finally {
        if (mySeq === seq) setLoading(false)
      }
    })
    return () => {
      seq += 1
      unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!user) return

    const TIMEOUT_MS = 30 * 60 * 1000 // 30 minutes
    const LAST_ACTIVE_KEY = 'prephire_last_active'
    const events = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart']

    // The cleanup used to be returned from inside a .then() callback, where React
    // never sees it: listeners and timers leaked on every login/logout and the old
    // timer could later sign out a DIFFERENT user. Cleanup is now registered
    // synchronously.
    let cancelled = false
    let timeoutId: number | undefined

    const expire = async () => {
      if (cancelled) return
      console.log('[Auth] User inactive for more than 30 minutes. Auto-logging out.')
      safeStorage.remove(LAST_ACTIVE_KEY)
      await logoutUser()
    }

    const resetTimer = () => {
      if (cancelled) return
      if (timeoutId) window.clearTimeout(timeoutId)
      const last = Number(safeStorage.get(LAST_ACTIVE_KEY))
      const now = Date.now()
      if (!last || now - last > 5000) safeStorage.set(LAST_ACTIVE_KEY, String(now))
      timeoutId = window.setTimeout(expire, TIMEOUT_MS)
    }

    const lastActive = Number(safeStorage.get(LAST_ACTIVE_KEY))
    if (lastActive && Date.now() - lastActive >= TIMEOUT_MS) {
      void expire()
    } else {
      safeStorage.set(LAST_ACTIVE_KEY, String(Date.now()))
      events.forEach((event) => window.addEventListener(event, resetTimer, { passive: true }))
      resetTimer()
    }

    return () => {
      cancelled = true
      if (timeoutId) window.clearTimeout(timeoutId)
      events.forEach((event) => window.removeEventListener(event, resetTimer))
    }
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
        pendingRegistrationEmailRef.current = input.email.toLowerCase()
        setLoading(true)
        try {
          const { credential, profile: nextProfile } = await registerWithEmail(input)
          setUser(credential.user)
          setProfile(nextProfile)
          if (nextProfile?.role) safeStorage.set('prephire_user_role', nextProfile.role)
        } finally {
          setTimeout(() => {
            pendingRegistrationEmailRef.current = null
          }, 1500)
          setLoading(false)
        }
      },
      logout: async () => {
        safeStorage.remove('prephire_user_role')
        await logoutUser()
      },
    }),
    [loading, profile, user],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
