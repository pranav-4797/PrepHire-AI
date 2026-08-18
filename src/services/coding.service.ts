// ── Online Coding Platform — API client ─────────────────────────────────────
// Talks to the /api/coding/* endpoints on the Express server (server/coding).
// Every authenticated call sends the current Firebase user's ID token as
// `Authorization: Bearer <token>` — the server verifies it and resolves the
// caller's role from Firestore itself. We never ask the server to trust a
// client-supplied role/email; the token is the only source of truth.

import { auth } from '../firebase/firebase'

export type Difficulty = 'Easy' | 'Medium' | 'Hard'
export type ProblemStatus = 'draft' | 'published'
export type Verdict =
  | 'Accepted'
  | 'Wrong Answer'
  | 'Time Limit Exceeded'
  | 'Runtime Error'
  | 'Compilation Error'

export interface TestCase {
  input: string
  output: string
  explanation?: string
}

export interface ProblemSummary {
  id: string
  title: string
  slug: string
  difficulty: Difficulty
  topics: string[]
  status: ProblemStatus
  languages: string[]
}

export interface Problem {
  id: string
  title: string
  slug: string
  difficulty: Difficulty
  topics: string[]
  statement: string
  constraints: string
  inputFormat: string
  outputFormat: string
  sampleTests: TestCase[]
  hiddenTests?: TestCase[] // present only for admin/faculty responses
  hiddenTestCount?: number // present for student responses instead
  timeLimitMs: number
  memoryLimitMb: number
  languages: string[]
  starterCode: Record<string, string>
  status: ProblemStatus
  createdByEmail?: string
  createdAt?: string
  updatedAt?: string
}

export interface TestResult {
  passed: boolean
  verdict?: Verdict
  input?: string
  expectedOutput?: string
  actualOutput?: string
  stderr?: string
  timeMs?: number
  hidden: boolean
}

export interface RunResult {
  verdict: Verdict
  passedCount: number
  totalCount: number
  runtimeMs: number
  memoryKb: number
  testResults: TestResult[]
}

export interface Submission {
  id: string
  problemId: string
  problemTitle: string
  difficulty?: Difficulty
  userEmail: string
  userName: string
  language: string
  code?: string
  type: 'run' | 'submit'
  verdict: Verdict
  passedCount: number
  totalCount: number
  runtimeMs: number
  memoryKb: number
  testResults?: TestResult[]
  submittedAt: string
}

export interface DashboardStats {
  solvedCount: number
  totalPublished: number
  totalSubmissions: number
  byDifficulty: Record<Difficulty, { solved: number; total: number }>
  recentAttempts: Array<{
    problemId: string
    problemTitle: string
    difficulty?: Difficulty
    lastVerdict?: Verdict
    lastAttemptAt?: string
    solved: boolean
  }>
  submissionHistory: Submission[]
}

export interface LanguageOption {
  id: string
  label: string
}

const API_URL = import.meta.env.DEV ? '' : (import.meta.env.VITE_API_URL || '')

async function authHeaders(json = false): Promise<Record<string, string>> {
  const headers: Record<string, string> = {}
  if (json) headers['Content-Type'] = 'application/json'
  const token = await auth.currentUser?.getIdToken()
  if (token) headers['Authorization'] = `Bearer ${token}`
  return headers
}

async function handle<T>(res: Response, fallbackMsg: string): Promise<T> {
  if (!res.ok) {
    let msg = fallbackMsg
    try {
      const data = await res.json()
      msg = data.error || msg
    } catch {
      /* ignore */
    }
    throw new Error(msg)
  }
  return res.json()
}

export async function listLanguages(): Promise<LanguageOption[]> {
  const res = await fetch(`${API_URL}/api/coding/languages`)
  return handle(res, 'Failed to load languages')
}

export async function listProblems(
  filters: { difficulty?: string; topic?: string; search?: string; status?: string } = {},
): Promise<ProblemSummary[]> {
  const params = new URLSearchParams()
  if (filters.difficulty) params.set('difficulty', filters.difficulty)
  if (filters.topic) params.set('topic', filters.topic)
  if (filters.search) params.set('search', filters.search)
  if (filters.status) params.set('status', filters.status)
  const res = await fetch(`${API_URL}/api/coding/problems?${params.toString()}`, {
    headers: await authHeaders(),
  })
  return handle(res, 'Failed to load problems')
}

export async function getProblem(id: string): Promise<Problem> {
  const res = await fetch(`${API_URL}/api/coding/problems/${id}`, {
    headers: await authHeaders(),
  })
  return handle(res, 'Failed to load problem')
}

export async function createProblem(
  payload: Partial<Problem>,
): Promise<{ id: string; problem: Problem }> {
  const res = await fetch(`${API_URL}/api/coding/problems`, {
    method: 'POST',
    headers: await authHeaders(true),
    body: JSON.stringify(payload),
  })
  return handle(res, 'Failed to create problem')
}

export async function updateProblem(
  id: string,
  payload: Partial<Problem>,
): Promise<{ success: boolean; problem: Problem }> {
  const res = await fetch(`${API_URL}/api/coding/problems/${id}`, {
    method: 'PUT',
    headers: await authHeaders(true),
    body: JSON.stringify(payload),
  })
  return handle(res, 'Failed to update problem')
}

export async function deleteProblem(id: string): Promise<void> {
  const res = await fetch(`${API_URL}/api/coding/problems/${id}`, {
    method: 'DELETE',
    headers: await authHeaders(),
  })
  await handle(res, 'Failed to delete problem')
}

export async function runCode(
  problemId: string,
  code: string,
  language: string,
): Promise<RunResult> {
  const res = await fetch(`${API_URL}/api/coding/problems/${problemId}/run`, {
    method: 'POST',
    headers: await authHeaders(true),
    body: JSON.stringify({ code, language }),
  })
  return handle(res, 'Failed to run code')
}

export async function submitCode(
  problemId: string,
  code: string,
  language: string,
  name: string,
): Promise<Submission> {
  const res = await fetch(`${API_URL}/api/coding/problems/${problemId}/submit`, {
    method: 'POST',
    headers: await authHeaders(true),
    body: JSON.stringify({ code, language, name }),
  })
  return handle(res, 'Failed to submit code')
}

export async function listSubmissions(
  problemId?: string,
): Promise<Submission[]> {
  const params = new URLSearchParams()
  if (problemId) params.set('problemId', problemId)
  const res = await fetch(`${API_URL}/api/coding/submissions?${params.toString()}`, {
    headers: await authHeaders(),
  })
  return handle(res, 'Failed to load submissions')
}

export async function getSubmission(id: string): Promise<Submission> {
  const res = await fetch(`${API_URL}/api/coding/submissions/${id}`, {
    headers: await authHeaders(),
  })
  return handle(res, 'Failed to load submission')
}

export async function getDashboardStats(email: string): Promise<DashboardStats> {
  const res = await fetch(`${API_URL}/api/coding/dashboard/${encodeURIComponent(email)}`, {
    headers: await authHeaders(),
  })
  return handle(res, 'Failed to load dashboard stats')
}

// ── Local autosave (per-user, per-problem, per-language draft code) ────────
// Runs entirely client-side; does not touch the backend. Used to satisfy the
// "Save code automatically while solving" requirement without spamming the
// submit/run endpoints.
function autosaveKey(email: string, problemId: string, language: string) {
  return `coding_autosave:${email}:${problemId}:${language}`
}

export function loadAutosavedCode(email: string, problemId: string, language: string): string | null {
  try {
    return localStorage.getItem(autosaveKey(email, problemId, language))
  } catch {
    return null
  }
}

export function saveAutosavedCode(email: string, problemId: string, language: string, code: string) {
  try {
    localStorage.setItem(autosaveKey(email, problemId, language), code)
  } catch {
    /* ignore quota errors */
  }
}

export const DIFFICULTY_COLORS: Record<Difficulty, { fg: string; bg: string }> = {
  Easy: { fg: '#166534', bg: '#dcfce7' },
  Medium: { fg: '#92400e', bg: '#fef3c7' },
  Hard: { fg: '#ba1a1a', bg: '#ffdad6' },
}

export const VERDICT_COLORS: Record<Verdict, { fg: string; bg: string }> = {
  Accepted: { fg: '#166534', bg: '#dcfce7' },
  'Wrong Answer': { fg: '#ba1a1a', bg: '#ffdad6' },
  'Time Limit Exceeded': { fg: '#92400e', bg: '#fef3c7' },
  'Runtime Error': { fg: '#ba1a1a', bg: '#ffdad6' },
  'Compilation Error': { fg: '#7c3aed', bg: '#ede9fe' },
}
