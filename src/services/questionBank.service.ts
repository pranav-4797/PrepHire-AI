// ── Interview Question Bank Firestore Service ──────────────────────────────
// Faculty/Admin-authored question bank on top of the curated static bank.
// The static QUESTION_BANK stays as the offline seed + fallback so the
// autonomous interview engine never depends on a network round-trip.

import {
  collection,
  doc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
} from 'firebase/firestore'
import { db } from '../firebase/firebase'
import {
  QUESTION_BANK,
  type QuestionNode,
  type InterviewDomain,
} from '../data/questionBank'

const QUESTIONS_COLL = 'interview_questions'

export interface QuestionRecord extends QuestionNode {
  active: boolean
  createdAt: string
  updatedAt: string
  createdBy?: string
  companyTrack?: string
  source?: 'curated' | 'custom' | 'ai'
}

export type NewQuestionInput = Omit<QuestionRecord, 'id' | 'createdAt' | 'updatedAt'>

// ── In-Memory Cache (Free Tier Quota Protection) ───────────────────────────
const BANK_CACHE_TTL_MS = 120_000

let bankCache: QuestionRecord[] | null = null
let bankCacheAt = 0
let hydration: Promise<QuestionRecord[]> | null = null

export function invalidateQuestionBankCache() {
  bankCache = null
  bankCacheAt = 0
}

function isCacheFresh() {
  return bankCache !== null && Date.now() - bankCacheAt < BANK_CACHE_TTL_MS
}

function mapDoc(id: string, data: Record<string, unknown>): QuestionRecord {
  return { id, ...(data as Omit<QuestionRecord, 'id'>) }
}

/**
 * Load every active question into the module cache.
 * Safe to call repeatedly; concurrent calls share one request.
 */
export async function hydrateQuestionBank(forceRefresh = false): Promise<QuestionRecord[]> {
  if (!forceRefresh && isCacheFresh()) return bankCache as QuestionRecord[]
  if (hydration) return hydration

  hydration = (async () => {
    try {
      const snapshot = await getDocs(collection(db, QUESTIONS_COLL))
      const records = snapshot.docs
        .map((d) => mapDoc(d.id, d.data() as Record<string, unknown>))
      bankCache = records
      bankCacheAt = Date.now()
      return records.filter((r) => r.active !== false)
    } catch (err) {
      console.error('Failed to hydrate interview question bank:', err)
      return bankCache ?? []
    } finally {
      hydration = null
    }
  })()

  return hydration
}

/**
 * Synchronous bank view used by the offline interview engine.
 * Falls back to the curated static bank until Firestore hydration lands.
 * Kicks off a background hydration on first call so callers never block.
 */
export function getActiveBankQuestions(): QuestionNode[] {
  if (bankCache && bankCache.length > 0) return bankCache.filter((r) => r.active !== false)
  if (!bankCache && !hydration) void hydrateQuestionBank()
  return QUESTION_BANK
}

/**
 * Mirror of getQuestionsForSession() from data/questionBank.ts, but over the
 * hydrated Firestore bank so faculty additions immediately reach interviews.
 */
export function getSessionQuestions(
  domain: string,
  department?: string,
  level?: string,
  resumeSkills: string[] = []
): QuestionNode[] {
  const bank = getActiveBankQuestions()
  const normDomain = domain.toLowerCase()
  const normLevel = level ? level.charAt(0).toUpperCase() + level.slice(1).toLowerCase() : 'Intermediate'

  let candidates = bank.filter((q) => q.domain === normDomain)
  if (candidates.length === 0) {
    candidates = bank.filter((q) => q.domain === 'technical')
  }

  if (normDomain === 'technical' && department) {
    const deptMatches = candidates.filter((q) => q.department === department || q.department === 'All')
    if (deptMatches.length >= 3) candidates = deptMatches
  }

  const levelMatches = candidates.filter((q) => q.level === normLevel)
  if (levelMatches.length >= 3) candidates = levelMatches

  if (resumeSkills.length > 0) {
    const scored = candidates.map((q) => {
      const matchScore = q.expectedKeywords.filter((kw) =>
        resumeSkills.some(
          (skill) =>
            skill.toLowerCase().includes(kw.toLowerCase()) ||
            kw.toLowerCase().includes(skill.toLowerCase())
        )
      ).length
      return { question: q, score: matchScore }
    })
    scored.sort((a, b) => b.score - a.score)
    return scored.map((s) => s.question)
  }

  return candidates
}

/** Find a question by its bank ID across the live bank, then the static seed. */
export function findQuestionByIdFromBank(id: string): QuestionNode | undefined {
  return getActiveBankQuestions().find((q) => q.id === id) || QUESTION_BANK.find((q) => q.id === id)
}

/**
 * Match a live interview question back to its bank node (offline evaluation).
 * Uses the same 30-character prefix heuristic as the legacy evaluator.
 */
export function findQuestionByQuestionText(question: string): QuestionNode | undefined {
  const needle = question.toLowerCase()
  return getActiveBankQuestions().find((node) =>
    needle.includes(node.question.toLowerCase().slice(0, 30))
  )
}

// ── Admin / Faculty CRUD ───────────────────────────────────────────────────

/** List every question (including inactive) for the management console. */
export async function listQuestions(options?: { forceRefresh?: boolean }): Promise<QuestionRecord[]> {
  if (!options?.forceRefresh && isCacheFresh()) {
    return bankCache as QuestionRecord[]
  }

  try {
    const snapshot = await getDocs(collection(db, QUESTIONS_COLL))
    const list = snapshot.docs
      .map((d) => mapDoc(d.id, d.data() as Record<string, unknown>))
      .sort((a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime())

    bankCache = list
    bankCacheAt = Date.now()
    return list
  } catch (err) {
    console.error('Failed to list interview questions:', err)
    return bankCache ?? []
  }
}

export async function createQuestion(input: NewQuestionInput): Promise<string> {
  invalidateQuestionBankCache()
  const newDoc = doc(collection(db, QUESTIONS_COLL))
  const now = new Date().toISOString()
  await setDoc(newDoc, {
    ...input,
    active: input.active !== false,
    createdAt: now,
    updatedAt: now,
  })
  return newDoc.id
}

export async function updateQuestion(id: string, updates: Partial<QuestionRecord>): Promise<void> {
  invalidateQuestionBankCache()
  await updateDoc(doc(db, QUESTIONS_COLL, id), {
    ...updates,
    updatedAt: new Date().toISOString(),
  })
}

export async function deleteQuestion(id: string): Promise<void> {
  invalidateQuestionBankCache()
  await deleteDoc(doc(db, QUESTIONS_COLL, id))
}

/**
 * Copy the curated static bank into Firestore exactly once.
 * Uses the legacy question id as the document id, so re-running is idempotent.
 */
export async function seedDefaultBank(createdBy?: string): Promise<number> {
  const snapshot = await getDocs(collection(db, QUESTIONS_COLL))
  const existing = new Set(snapshot.docs.map((d) => d.id))
  const now = new Date().toISOString()
  const pending = QUESTION_BANK.filter((q) => !existing.has(q.id))

  await Promise.all(
    pending.map((q) =>
      setDoc(doc(db, QUESTIONS_COLL, q.id), {
        ...q,
        active: true,
        source: 'curated',
        createdBy,
        createdAt: now,
        updatedAt: now,
      })
    )
  )

  invalidateQuestionBankCache()
  await hydrateQuestionBank(true)
  return pending.length
}

export const QUESTION_DOMAINS: { value: InterviewDomain; label: string }[] = [
  { value: 'technical', label: 'Technical' },
  { value: 'hr', label: 'HR / Behavioural' },
  { value: 'aptitude', label: 'Aptitude' },
  { value: 'group-discussion', label: 'Group Discussion' },
]

export const QUESTION_LEVELS = ['Beginner', 'Intermediate', 'Advanced'] as const
