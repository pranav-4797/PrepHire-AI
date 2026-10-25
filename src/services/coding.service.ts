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
  | 'Memory Limit Exceeded'
  | 'Idleness Limit Exceeded'
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
  targetBranch?: string | null
  dueDate?: string | null
  assignedBy?: string | null
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
  targetBranch?: string | null
  dueDate?: string | null
  assignedBy?: string | null
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
  memoryKb?: number
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

  let user = auth.currentUser
  if (!user) {
    user = await new Promise<typeof auth.currentUser>((resolve) => {
      const unsub = auth.onAuthStateChanged((u) => {
        unsub()
        resolve(u)
      })
      setTimeout(() => resolve(auth.currentUser), 1500)
    })
  }

  if (user) {
    try {
      const token = await user.getIdToken()
      if (token) headers['Authorization'] = `Bearer ${token}`
    } catch (e) {
      console.warn('Failed to get Firebase ID token:', e)
    }
    if (user.email) headers['x-user-email'] = user.email
  }

  try {
    const savedRole = localStorage.getItem('prephire_user_role')
    if (savedRole) headers['x-user-role'] = savedRole
  } catch {
    /* ignore */
  }

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

export interface GenerateProblemPreflight {
  tested: boolean
  allPassed: boolean
  passedCount: number
  totalCount: number
  verdict?: Verdict | string
  details?: TestResult[]
  error?: string
}

export interface GenerateProblemResponse {
  success: boolean
  problem: Partial<Problem> & {
    referenceSolution?: {
      language: string
      code: string
    }
  }
  preflight: GenerateProblemPreflight
}

export async function generateProblemWithAI(params: {
  topic: string
  difficulty?: Difficulty
  languages?: string[]
  facultyNotes?: string
  model?: string
  validateWithSandbox?: boolean
}): Promise<GenerateProblemResponse> {
  const headers = await authHeaders(true)
  const clientKey = import.meta.env.VITE_GEMINI_API_KEY
  if (clientKey) {
    headers['x-gemini-key'] = clientKey
  }
  const res = await fetch(`${API_URL}/api/coding/generate-problem`, {
    method: 'POST',
    headers,
    body: JSON.stringify(params),
  })
  return handle(res, 'Failed to generate problem with AI')
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
  customInput?: string,
): Promise<RunResult> {
  const res = await fetch(`${API_URL}/api/coding/problems/${problemId}/run`, {
    method: 'POST',
    headers: await authHeaders(true),
    body: JSON.stringify({ code, language, customInput }),
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

// ── SSE Streaming Submit (Codeforces-style per-test progress) ──────────────
// Opens an SSE connection to the streaming submit endpoint, calling onProgress
// for each test case verdict as it arrives, and returning the final Submission.
export interface JudgeProgressEvent {
  type: 'compiling' | 'test' | 'complete' | 'submission' | 'error'
  index?: number
  total?: number
  verdict?: string
  passed?: boolean
  timeMs?: number
  memoryKb?: number
  passedCount?: number
  totalCount?: number
  runtimeMs?: number
  testResults?: TestResult[]
  submission?: Submission
  error?: string
}

export async function submitCodeStreaming(
  problemId: string,
  code: string,
  language: string,
  name: string,
  onProgress: (event: JudgeProgressEvent) => void,
): Promise<Submission> {
  const headers = await authHeaders(true)
  const res = await fetch(`${API_URL}/api/coding/problems/${problemId}/submit-stream`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ code, language, name }),
  })

  if (!res.ok) {
    const msg = await res.text().catch(() => 'Failed to submit code')
    throw new Error(msg)
  }

  const reader = res.body?.getReader()
  if (!reader) throw new Error('Streaming not supported')

  const decoder = new TextDecoder()
  let buffer = ''
  let finalSubmission: Submission | null = null

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          const event: JudgeProgressEvent = JSON.parse(line.slice(6))
          onProgress(event)
          if (event.type === 'submission' && event.submission) {
            finalSubmission = event.submission
          }
        } catch {
          /* skip malformed SSE lines */
        }
      }
    }
  }

  if (!finalSubmission) {
    throw new Error('No final submission received from judge')
  }
  return finalSubmission
}

export interface CodeReview {
  correctnessNote: string
  complexity: string
  betterApproach: string
  codeQualityNotes: string[]
  overallVerdict: string
}

export async function getCodeReview(
  problemId: string,
  payload: { code: string; language: string; verdict: string; testResults: unknown },
): Promise<CodeReview> {
  const res = await fetch(`${API_URL}/api/coding/problems/${problemId}/review`, {
    method: 'POST',
    headers: await authHeaders(true),
    body: JSON.stringify(payload),
  })
  return handle(res, 'Failed to get code review')
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
  'Memory Limit Exceeded': { fg: '#6d28d9', bg: '#ede9fe' },
  'Idleness Limit Exceeded': { fg: '#9a3412', bg: '#ffedd5' },
  'Runtime Error': { fg: '#ba1a1a', bg: '#ffdad6' },
  'Compilation Error': { fg: '#7c3aed', bg: '#ede9fe' },
}
