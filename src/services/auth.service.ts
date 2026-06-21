import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from 'firebase/auth'
import { auth } from '../firebase/firebase'
import { createUserProfile } from './firestore.service'
import type { UserRole } from './firestore.service'

export async function loginWithEmail(email: string, password: string) {
  return signInWithEmailAndPassword(auth, email, password)
}

export async function registerWithEmail(input: {
  name: string
  email: string
  password: string
  role?: UserRole
  department?: string
}) {
  const credential = await createUserWithEmailAndPassword(auth, input.email, input.password)
  await updateProfile(credential.user, { displayName: input.name })
  await createUserProfile(credential.user.uid, {
    name: input.name,
    email: input.email,
    role: input.role || 'Student',
    department: input.department || 'General',
    disabled: false,
  })
  return credential
}

export async function logoutUser() {
  await signOut(auth)
}
