// ── Quiz & Assessment Types ──────────────────────────────────────────────────

export interface QuizQuestion {
  id: string
  question: string
  codeSnippet?: string
  options: [string, string, string, string] // Exactly 4 options: A, B, C, D
  correctIndex: number // 0, 1, 2, or 3
  explanation?: string
  points: number
}

export type QuizCategory =
  | 'Technical'
  | 'Aptitude'
  | 'Core Engineering'
  | 'Verbal & Soft Skills'
  | 'Company Specific'

export type QuizDifficulty = 'Beginner' | 'Intermediate' | 'Advanced'

export interface Quiz {
  id: string
  title: string
  description: string
  targetBranch: string // 'all' or branch code e.g. 'comp', 'it', etc.
  category: QuizCategory
  difficulty: QuizDifficulty
  timeLimitMinutes: number // e.g. 10, 15, 30
  passingPercentage: number // e.g. 60
  questions: QuizQuestion[]
  createdBy: string
  createdByName?: string
  createdAt: string // ISO string
  updatedAt: string // ISO string
  published: boolean
  allowRetake?: boolean // Whether students can retake the quiz (default: true)
}

export interface SuspiciousFlag {
  timestamp: string
  type: 'tab_switch' | 'fullscreen_exit' | 'face_missing' | 'multiple_faces' | 'cell_phone' | 'focus_loss' | 'other'
  detail: string
}

export interface QuizAttempt {
  id: string
  quizId: string
  quizTitle: string
  studentUid: string
  studentEmail: string
  studentName: string
  department: string
  rollNumber?: string
  isPublicCandidate?: boolean
  score: number
  maxScore: number
  percentage: number
  passed: boolean
  answers: Record<string, number> // questionId -> selected option index (0..3)
  timeSpentSeconds: number
  completedAt: string // ISO string
  suspiciousFlags?: (SuspiciousFlag | string)[]
  tabSwitchesCount?: number
  fullscreenViolationsCount?: number
  faceMissingCount?: number
  multipleFacesCount?: number
}
