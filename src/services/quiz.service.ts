// ── Quiz & Assessment Firestore Service ──────────────────────────────────────

import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  onSnapshot,
} from 'firebase/firestore'
import { db } from '../firebase/firebase'
import type { Quiz, QuizAttempt } from '../types/quiz'

const QUIZZES_COLL = 'quizzes'
const ATTEMPTS_COLL = 'quiz_attempts'

/**
 * List quizzes with optional filtering by branch and publish status.
 */
export async function listQuizzes(options?: {
  branch?: string
  publishedOnly?: boolean
}): Promise<Quiz[]> {
  try {
    const qRef = collection(db, QUIZZES_COLL)
    const constraints = []

    if (options?.publishedOnly) {
      constraints.push(where('published', '==', true))
    }

    const q = query(qRef, ...constraints)
    const snapshot = await getDocs(q)
    let list: Quiz[] = snapshot.docs.map((d) => ({
      id: d.id,
      ...(d.data() as Omit<Quiz, 'id'>),
    }))

    // Filter by branch client-side to allow 'all' branch quizzes + department match
    if (options?.branch && options.branch !== 'all') {
      list = list.filter(
        (quiz) =>
          !quiz.targetBranch ||
          quiz.targetBranch === 'all' ||
          quiz.targetBranch.toLowerCase() === options.branch!.toLowerCase()
      )
    }

    // Sort by createdAt descending
    list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

    return list
  } catch (err) {
    console.error('Failed to list quizzes from Firestore:', err)
    return []
  }
}

/**
 * Subscribe to real-time updates for quizzes.
 */
export function subscribeToQuizzes(
  callback: (quizzes: Quiz[]) => void,
  options?: { branch?: string; publishedOnly?: boolean }
): () => void {
  try {
    const qRef = collection(db, QUIZZES_COLL)
    const constraints = []

    if (options?.publishedOnly) {
      constraints.push(where('published', '==', true))
    }

    const q = query(qRef, ...constraints)
    return onSnapshot(
      q,
      (snapshot) => {
        let list: Quiz[] = snapshot.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<Quiz, 'id'>),
        }))

        if (options?.branch && options.branch !== 'all') {
          list = list.filter(
            (quiz) =>
              !quiz.targetBranch ||
              quiz.targetBranch === 'all' ||
              quiz.targetBranch.toLowerCase() === options.branch!.toLowerCase()
          )
        }

        list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        callback(list)
      },
      (err) => {
        console.error('Quiz subscription error:', err)
        callback([])
      }
    )
  } catch (err) {
    console.error('Failed to setup quiz subscription:', err)
    return () => {}
  }
}

/**
 * Get a single quiz by ID.
 */
export async function getQuizById(quizId: string): Promise<Quiz | null> {
  try {
    const snap = await getDoc(doc(db, QUIZZES_COLL, quizId))
    if (!snap.exists()) return null
    return { id: snap.id, ...(snap.data() as Omit<Quiz, 'id'>) }
  } catch (err) {
    console.error('Failed to fetch quiz by ID:', err)
    return null
  }
}

/**
 * Create a new quiz.
 */
export async function createQuiz(quizData: Omit<Quiz, 'id'>): Promise<string> {
  const qRef = collection(db, QUIZZES_COLL)
  const newDoc = doc(qRef)
  const now = new Date().toISOString()
  const payload = {
    ...quizData,
    createdAt: quizData.createdAt || now,
    updatedAt: now,
  }
  await setDoc(newDoc, payload)
  return newDoc.id
}

/**
 * Update an existing quiz.
 */
export async function updateQuiz(quizId: string, updates: Partial<Quiz>): Promise<void> {
  const docRef = doc(db, QUIZZES_COLL, quizId)
  await updateDoc(docRef, {
    ...updates,
    updatedAt: new Date().toISOString(),
  })
}

/**
 * Delete a quiz.
 */
export async function deleteQuiz(quizId: string): Promise<void> {
  await deleteDoc(doc(db, QUIZZES_COLL, quizId))
}

/**
 * Submit a student's quiz attempt.
 */
export async function submitQuizAttempt(
  attemptData: Omit<QuizAttempt, 'id'>
): Promise<string> {
  const aRef = collection(db, ATTEMPTS_COLL)
  const newDoc = doc(aRef)
  const payload = {
    ...attemptData,
    completedAt: attemptData.completedAt || new Date().toISOString(),
  }
  await setDoc(newDoc, payload)
  return newDoc.id
}

/**
 * Get all quiz attempts for a specific student.
 */
export async function getStudentQuizAttempts(studentUid: string): Promise<QuizAttempt[]> {
  try {
    const qRef = collection(db, ATTEMPTS_COLL)
    const q = query(qRef, where('studentUid', '==', studentUid))
    const snapshot = await getDocs(q)
    const list: QuizAttempt[] = snapshot.docs.map((d) => ({
      id: d.id,
      ...(d.data() as Omit<QuizAttempt, 'id'>),
    }))
    list.sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime())
    return list
  } catch (err) {
    console.error('Failed to fetch student quiz attempts:', err)
    return []
  }
}

/**
 * Delete a specific attempt (to grant a retake or reset submission).
 */
export async function deleteQuizAttempt(attemptId: string): Promise<void> {
  const docRef = doc(db, ATTEMPTS_COLL, attemptId)
  await deleteDoc(docRef)
}

/**
 * Get all attempts for a specific quiz (for admin review).
 */
export async function getQuizAttempts(quizId: string): Promise<QuizAttempt[]> {
  try {
    const qRef = collection(db, ATTEMPTS_COLL)
    const q = query(qRef, where('quizId', '==', quizId))
    const snapshot = await getDocs(q)
    const list: QuizAttempt[] = snapshot.docs.map((d) => ({
      id: d.id,
      ...(d.data() as Omit<QuizAttempt, 'id'>),
    }))
    list.sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime())
    return list
  } catch (err) {
    console.error('Failed to fetch quiz attempts:', err)
    return []
  }
}
