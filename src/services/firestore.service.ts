import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore'
import { auth, db } from '../firebase/firebase'
import type { ResumeProfile } from '../utils/resume'

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
  resumeProfile?: ResumeProfile | null
  resumeNotes?: string
}

export interface SessionRecordData {
  id: string
  studentName: string
  studentEmail: string
  department?: string
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
  const r = role?.toLowerCase()
  if (r === 'admin') return 'Admin'
  if (r === 'faculty') return 'Faculty'
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

export async function deleteSessionsForStudent(email: string) {
  try {
    const snap = await getDocs(
      // sessions store studentEmail lower-cased; an exact-case query missed mixed-case accounts
      query(collection(db, 'sessions'), where('studentEmail', '==', (email || '').trim().toLowerCase()))
    )
    await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)))
  } catch (err) {
    console.warn('Failed to delete student sessions:', err)
  }
}

export async function deleteUserProfile(uid: string, email?: string) {
  await deleteDoc(doc(db, 'users', uid))
  if (email) {
    await deleteSessionsForStudent(email)
  }
}

export async function listSessions(): Promise<SessionRecordData[]> {
  const snap = await getDocs(query(collection(db, 'sessions'), orderBy('createdAt', 'desc')))
  return snap.docs.map((item) => ({ ...(item.data() as Omit<SessionRecordData, 'id'>), id: item.id }))
}

export async function listSessionsForStudent(email: string): Promise<SessionRecordData[]> {
  try {
    const cleanEmail = (email || '').trim().toLowerCase()
    const snap = await getDocs(
      query(collection(db, 'sessions'), where('studentEmail', '==', cleanEmail))
    )
    let docs = snap.docs.map((item) => ({ ...(item.data() as Omit<SessionRecordData, 'id'>), id: item.id }))
    if (docs.length === 0 && email && email.trim() !== cleanEmail) {
      const altSnap = await getDocs(
        query(collection(db, 'sessions'), where('studentEmail', '==', email.trim()))
      )
      docs = altSnap.docs.map((item) => ({ ...(item.data() as Omit<SessionRecordData, 'id'>), id: item.id }))
    }
    return docs.sort((a, b) => {
      const tA = (a.createdAt as any)?.toMillis?.() || (a.date ? new Date(a.date).getTime() : 0)
      const tB = (b.createdAt as any)?.toMillis?.() || (b.date ? new Date(b.date).getTime() : 0)
      return tB - tA
    })
  } catch (err) {
    console.error('Failed to list sessions for student:', err)
    return []
  }
}

export async function addSessionRecord(session: Omit<SessionRecordData, 'createdAt'>) {
  const { id, ...payload } = session
  const cleanPayload = {
    ...payload,
    studentEmail: (payload.studentEmail || '').trim().toLowerCase(),
    createdAt: serverTimestamp(),
  }
  const ref = id ? doc(db, 'sessions', id) : doc(collection(db, 'sessions'))
  await setDoc(ref, cleanPayload, { merge: true })
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

// ===== REAL-TIME MULTI-USER LIVE LISTENERS =====

export function subscribeToUserProfiles(callback: (users: UserProfile[]) => void): () => void {
  const q = collection(db, 'users')
  return onSnapshot(
    q,
    (snap) => {
      const users = snap.docs.map((d) => ({
        id: d.id,
        uid: d.id,
        ...(d.data() as Omit<UserProfile, 'id' | 'uid'>),
        role: normalizeRole(d.data().role),
        department: d.data().department || 'General',
      }))
      callback(users)
    },
    (err) => {
      console.warn('Real-time users listener error:', err)
    }
  )
}

/**
 * Real-time sessions listener.
 *
 * Firestore security rules are NOT filters: Faculty may only read sessions in their own
 * department, so an unfiltered collection query is rejected outright with
 * permission-denied (the listener error was just console.warn'ed, leaving every Faculty
 * dashboard empty). Pass `department` for Faculty so the query itself is provably within
 * what the rules allow. Admins omit it and read everything.
 */
export function subscribeToSessions(
  callback: (sessions: SessionRecordData[]) => void,
  options: { department?: string } = {},
): () => void {
  const q = options.department
    ? query(collection(db, 'sessions'), where('department', '==', options.department))
    : collection(db, 'sessions')
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((d) => ({ ...(d.data() as Omit<SessionRecordData, 'id'>), id: d.id }))
      const sorted = list.sort((a, b) => {
        const tA = (a.createdAt as any)?.toMillis?.() || (a.date ? new Date(a.date).getTime() : 0)
        const tB = (b.createdAt as any)?.toMillis?.() || (b.date ? new Date(b.date).getTime() : 0)
        return tB - tA
      })
      callback(sorted)
    },
    (err) => {
      console.warn('Real-time sessions listener error:', err)
    }
  )
}

export function subscribeToStudentSessions(email: string, callback: (sessions: SessionRecordData[]) => void): () => void {
  const cleanEmail = (email || '').trim().toLowerCase()
  const q = query(collection(db, 'sessions'), where('studentEmail', '==', cleanEmail))
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((d) => ({ ...(d.data() as Omit<SessionRecordData, 'id'>), id: d.id }))
      const sorted = list.sort((a, b) => {
        const tA = (a.createdAt as any)?.toMillis?.() || (a.date ? new Date(a.date).getTime() : 0)
        const tB = (b.createdAt as any)?.toMillis?.() || (b.date ? new Date(b.date).getTime() : 0)
        return tB - tA
      })
      callback(sorted)
    },
    (err) => {
      console.warn('Real-time student sessions listener error:', err)
    }
  )
}

// ===== COURSE OPERATIONS =====

export interface Resource {
  videoTitle: string
  videoUrl: string
  pdfUrl?: string   // optional
}

export interface Chapter {
  name: string
  resources: Resource[]
}

export interface Course {
  id: string
  name: string
  description: string
  hours: number
  chapters: Chapter[]
  externalUrl?: string
  createdAt?: unknown
  status?: 'approved' | 'pending' | 'rejected'
  createdByEmail?: string
}

const API_URL = import.meta.env.DEV ? '' : (import.meta.env.VITE_API_URL || '')

// Every course request sends the current Firebase user's ID token as
// `Authorization: Bearer <token>` — the server verifies it and resolves the
// caller's role from Firestore itself, the same pattern used by the coding
// platform. We never ask the server to trust a client-supplied role/email.
async function courseAuthHeaders(json = false): Promise<Record<string, string>> {
  const headers: Record<string, string> = {}
  if (json) headers['Content-Type'] = 'application/json'
  const token = await auth.currentUser?.getIdToken()
  if (token) headers['Authorization'] = `Bearer ${token}`
  return headers
}

export async function getCourse(id: string): Promise<Course | null> {
  // 1. Direct Firestore read
  try {
    const snap = await getDoc(doc(db, 'courses', id))
    if (snap.exists()) {
      return { id: snap.id, ...(snap.data() as Omit<Course, 'id'>) }
    }
  } catch (err) {
    console.warn('Direct Firestore getCourse failed, attempting server API fallback:', err)
  }

  // 2. Server API fallback
  const headers = await courseAuthHeaders(false)
  const res = await fetch(`${API_URL}/api/courses/${id}`, { headers })
  if (res.status === 404) return null
  if (!res.ok) throw new Error('Failed to fetch course')
  return res.json()
}

export async function listCourses(): Promise<Course[]> {
  // 1. Direct Firestore read (always accessible, instant, zero dependency on server cold boot)
  try {
    const snap = await getDocs(collection(db, 'courses'))
    if (!snap.empty) {
      const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Course, 'id'>) }))
      return list.sort((a, b) => new Date(String(b.createdAt || 0)).getTime() - new Date(String(a.createdAt || 0)).getTime())
    }
  } catch (err) {
    console.warn('Direct Firestore listCourses failed, attempting server API fallback:', err)
  }

  // 2. Server API fallback
  try {
    const headers = await courseAuthHeaders(false)
    const res = await fetch(`${API_URL}/api/courses`, { headers })
    if (res.ok) {
      return await res.json()
    }
  } catch {
    // Return empty list if both fail
  }
  return []
}

export async function createCourse(course: Omit<Course, 'id'>): Promise<string> {
  // 1. Direct Firestore creation (zero dependency on Render server cold-start / service-account)
  try {
    const courseRef = doc(collection(db, 'courses'))
    const newCourseData: Course = {
      ...course,
      id: courseRef.id,
      createdAt: new Date().toISOString(),
      createdByEmail: auth.currentUser?.email || undefined,
      status: 'pending',
    }
    await setDoc(courseRef, newCourseData)

    // Non-blocking background sync to server JSON file backup
    courseAuthHeaders(true).then((headers) => {
      fetch(`${API_URL}/api/courses`, {
        method: 'POST',
        headers,
        body: JSON.stringify(newCourseData),
      }).catch(() => {})
    })

    return courseRef.id
  } catch (firestoreErr: any) {
    console.warn('Direct Firestore course creation failed, attempting server API fallback...', firestoreErr)

    // 2. Server API fallback
    const headers = await courseAuthHeaders(true)
    const res = await fetch(`${API_URL}/api/courses`, {
      method: 'POST',
      headers,
      body: JSON.stringify(course),
    })
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}))
      throw new Error(errData.error || `Failed to create course: ${firestoreErr.message || 'Permission denied'}`)
    }
    const data = await res.json()
    return data.id
  }
}

export async function updateCourse(id: string, updates: Partial<Course>): Promise<void> {
  // 1. Direct Firestore update
  try {
    await updateDoc(doc(db, 'courses', id), updates)

    // Non-blocking sync to server
    courseAuthHeaders(true).then((headers) => {
      fetch(`${API_URL}/api/courses/${id}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify(updates),
      }).catch(() => {})
    })
    return
  } catch (firestoreErr: any) {
    console.warn('Direct Firestore updateCourse failed, attempting server API fallback:', firestoreErr)

    // 2. Server API fallback
    const headers = await courseAuthHeaders(true)
    const res = await fetch(`${API_URL}/api/courses/${id}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify(updates),
    })
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}))
      throw new Error(errData.error || `Failed to update course: ${firestoreErr.message}`)
    }
  }
}

export async function deleteCourse(id: string): Promise<void> {
  // 1. Direct Firestore deletion
  try {
    await deleteDoc(doc(db, 'courses', id))

    // Non-blocking sync to server
    courseAuthHeaders(false).then((headers) => {
      fetch(`${API_URL}/api/courses/${id}`, {
        method: 'DELETE',
        headers,
      }).catch(() => {})
    })
    return
  } catch (firestoreErr: any) {
    console.warn('Direct Firestore deleteCourse failed, attempting server API fallback:', firestoreErr)

    // 2. Server API fallback
    const headers = await courseAuthHeaders(false)
    const res = await fetch(`${API_URL}/api/courses/${id}`, {
      method: 'DELETE',
      headers,
    })
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}))
      throw new Error(errData.error || `Failed to delete course: ${firestoreErr.message}`)
    }
  }
}

// ===== FEEDBACK =====

export interface Feedback {
  id: string
  userEmail: string
  userName: string
  role: string
  category: 'Bug' | 'Confusing' | 'Suggestion' | 'Other'
  message: string
  createdAt?: unknown
  page: string
}

export async function submitFeedback(feedback: Omit<Feedback, 'id' | 'createdAt'>): Promise<string> {
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
  const payload = {
    ...feedback,
    createdAt: serverTimestamp(),
  }
  await setDoc(doc(db, 'feedback', id), payload)
  return id
}

export async function listFeedback(): Promise<Feedback[]> {
  const snap = await getDocs(query(collection(db, 'feedback'), orderBy('createdAt', 'desc')))
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Feedback, 'id'>) }))
}

export function subscribeToFeedback(callback: (items: Feedback[]) => void): () => void {
  const q = query(collection(db, 'feedback'), orderBy('createdAt', 'desc'))
  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Feedback, 'id'>) }))
      callback(items)
    },
    (err) => {
      console.warn('Real-time feedback listener error:', err)
    }
  )
}
