import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore'
import { db } from '../firebase/firebase'

export type UserRole = 'Admin' | 'Faculty' | 'Student'

export interface UserProfile {
  id: string
  uid: string
  name: string
  email: string
  role: UserRole
  department: string
  createdAt?: unknown
  registeredAt?: string
  disabled?: boolean
}

export interface SessionRecordData {
  id: string
  studentName: string
  studentEmail: string
  domain: string
  level: string
  score: number
  warnings: number
  date: string
  report: unknown
  driveLink?: string
  facultyRemarks?: string
  placementReady?: boolean
  createdAt?: unknown
}

export function normalizeRole(role?: string): UserRole {
  if (role === 'Admin' || role === 'Faculty') return role
  return 'Student'
}

export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  const snap = await getDoc(doc(db, 'users', uid))
  if (!snap.exists()) return null
  const data = snap.data() as Omit<UserProfile, 'id' | 'uid'>
  return { ...data, id: uid, uid, role: normalizeRole(data.role) }
}

export async function createUserProfile(
  uid: string,
  profile: Omit<UserProfile, 'id' | 'uid' | 'createdAt' | 'registeredAt'>,
) {
  const registeredAt = new Date().toISOString().split('T')[0]
  const next = {
    name: profile.name,
    email: profile.email,
    role: normalizeRole(profile.role),
    department: profile.department || 'General',
    disabled: !!profile.disabled,
    registeredAt,
    createdAt: serverTimestamp(),
  }
  await setDoc(doc(db, 'users', uid), next, { merge: true })
  return { ...next, id: uid, uid }
}

export async function ensureUserProfile(
  uid: string,
  email: string,
  name?: string | null,
): Promise<UserProfile> {
  const existing = await getUserProfile(uid)
  if (existing) return existing
  return createUserProfile(uid, {
    name: name || email.split('@')[0],
    email,
    role: 'Student',
    department: 'General',
    disabled: false,
  })
}

export async function listUserProfiles(): Promise<UserProfile[]> {
  const snap = await getDocs(query(collection(db, 'users'), orderBy('createdAt', 'desc')))
  return snap.docs.map((item) => {
    const data = item.data() as Omit<UserProfile, 'id' | 'uid'>
    return { ...data, id: item.id, uid: item.id, role: normalizeRole(data.role) }
  })
}

export async function seedUserProfiles(
  profiles: Array<Omit<UserProfile, 'id' | 'uid' | 'createdAt' | 'registeredAt'>>,
) {
  const existing = await getDocs(collection(db, 'users'))
  if (!existing.empty) return
  await Promise.all(
    profiles.map((profile) => {
      const stableId = profile.email.toLowerCase().replace(/[^a-z0-9]/g, '_')
      return createUserProfile(stableId, profile)
    }),
  )
}

export async function updateUserProfile(uid: string, updates: Partial<UserProfile>) {
  const safeUpdates = { ...updates }
  delete safeUpdates.id
  delete safeUpdates.uid
  delete safeUpdates.createdAt
  await updateDoc(doc(db, 'users', uid), safeUpdates)
}

export async function deleteUserProfile(uid: string) {
  await deleteDoc(doc(db, 'users', uid))
}

export async function listSessions(): Promise<SessionRecordData[]> {
  const snap = await getDocs(query(collection(db, 'sessions'), orderBy('createdAt', 'desc')))
  return snap.docs.map((item) => ({ ...(item.data() as Omit<SessionRecordData, 'id'>), id: item.id }))
}

export async function listSessionsForStudent(email: string): Promise<SessionRecordData[]> {
  const snap = await getDocs(
    query(collection(db, 'sessions'), where('studentEmail', '==', email), orderBy('createdAt', 'desc')),
  )
  return snap.docs.map((item) => ({ ...(item.data() as Omit<SessionRecordData, 'id'>), id: item.id }))
}

export async function addSessionRecord(session: Omit<SessionRecordData, 'createdAt'>) {
  const { id, ...payload } = session
  const ref = id ? doc(db, 'sessions', id) : doc(collection(db, 'sessions'))
  await setDoc(ref, { ...payload, createdAt: serverTimestamp() }, { merge: true })
  return ref.id
}

export async function seedSessionRecords(sessions: SessionRecordData[]) {
  const existing = await getDocs(collection(db, 'sessions'))
  if (!existing.empty) return
  await Promise.all(sessions.map((session) => addSessionRecord(session)))
}

export async function updateSessionRecord(id: string, updates: Partial<SessionRecordData>) {
  await updateDoc(doc(db, 'sessions', id), updates)
}

export async function deleteSessionRecord(id: string) {
  await deleteDoc(doc(db, 'sessions', id))
}
