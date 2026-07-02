import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from 'firebase/auth'
import { auth } from '../firebase/firebase'
import { createUserProfile } from './firestore.service'
import type { UserProfile, UserRole } from './firestore.service'

export async function loginWithEmail(email: string, password: string) {
  return signInWithEmailAndPassword(auth, email, password)
}

export async function registerWithEmail(input: {
  name: string
  email: string
  password: string
  role?: UserRole
  department?: string
}): Promise<{ credential: Awaited<ReturnType<typeof createUserWithEmailAndPassword>>; profile: UserProfile }> {
  const credential = await createUserWithEmailAndPassword(auth, input.email, input.password)
  await updateProfile(credential.user, { displayName: input.name })
  const profile = await createUserProfile(credential.user.uid, {
    name: input.name,
    email: input.email,
    role: input.role || 'Student',
    department: input.department || 'General',
    disabled: false,
  })
  return { credential, profile }
}

export async function logoutUser() {
  await signOut(auth)
}
