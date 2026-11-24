// ── Quiz & Assessment Types ──────────────────────────────────────────────────

export interface QuizQuestion {
  id: string
  question: string
  codeSnippet?: string
  options: [string, string, string, string] // Exactly 4 options: A, B, C, D
  correctIndex?: number // 0, 1, 2, or 3 (optional if encrypted)
  answerCipher?: string // AES-256-GCM encrypted correct answer + explanation token
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
  resultsDeclared?: boolean // Whether assessment results & correct answers are released to students (default: false)
  shuffleQuestions?: boolean // Randomize question order per student (default: true)
  shuffleOptions?: boolean // Randomize option positions (A,B,C,D) per question (default: true)
  scheduledStartTime?: string // Optional ISO string for scheduled quiz start
  scheduledEndTime?: string // Optional ISO string for quiz end window
}

export interface LiveCandidateSession {
  studentUid: string
  studentName: string
  studentEmail?: string
  department?: string
  rollNumber?: string
  quizId: string
  currentQuestionIndex: number
  totalQuestions: number
  answeredCount: number
  elapsedSeconds: number
  status: 'active' | 'warning' | 'critical' | 'disconnected'
  lastFlag?: SuspiciousFlag
  recentSnapshot?: string
  integrityScore: number
  joinedAt: string
  lastSeenAt: string
}

export interface ProctorRealtimeAlert {
  id: string
  quizId: string
  studentUid: string
  studentName: string
  type: SuspiciousFlag['type']
  detail: string
  snapshot?: string
  timestamp: string
  severity: 'low' | 'medium' | 'high'
}

export interface SuspiciousFlag {
  timestamp: string
  type:
    | 'tab_switch'
    | 'fullscreen_exit'
    | 'face_missing'
    | 'multiple_faces'
    | 'cell_phone'
    | 'focus_loss'
    | 'audio_anomaly'
    | 'tamper_attempt'
    | 'other'
  detail: string
  snapshot?: string // Data URL: image/jpeg snapshot of evidence
  durationSeconds?: number
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
  suspiciousFlags?: SuspiciousFlag[]
  tabSwitchesCount?: number
  fullscreenViolationsCount?: number
  faceMissingCount?: number
  multipleFacesCount?: number
  audioAnomaliesCount?: number
  integrityScore?: number // 0..100 forensic score
  totalAwaySeconds?: number
  driveEvidenceFolderLink?: string
}
