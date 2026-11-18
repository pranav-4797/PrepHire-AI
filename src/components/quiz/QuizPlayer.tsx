import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import {
  Clock,
  ArrowLeft,
  ArrowRight,
  Bookmark,
  AlertTriangle,
  Send,
  Shield,
  Maximize,
  Menu,
  X,
} from 'lucide-react'
import { T } from '../../theme'
import type { Quiz, QuizAttempt, SuspiciousFlag } from '../../types/quiz'
import {
  submitQuizAttempt,
  uploadQuizEvidenceToDrive,
  updateQuizAttemptDriveLink,
} from '../../services/quiz.service'
import { QuizResultModal } from './QuizResultModal'
import { sanitizeErrorMessage } from '../../utils/errorSanitizer'
import { QuizProctorCamera } from './QuizProctorCamera'
import { generateShuffledQuiz, convertDisplayedAnswersToMaster } from '../../utils/quizShuffle'
import { useStudentProctorSocket } from '../../services/proctorSocket.service'

function GlassCard({
  children,
  style = {},
}: {
  children: ReactNode
  style?: CSSProperties
}) {
  return (
    <div
      style={{
        background: '#ffffff',
        border: '1px solid #E5E7EB',
        borderRadius: 12,
        padding: '1.25rem',
        ...style,
      }}
    >
      {children}
    </div>
  )
}

interface QuizPlayerProps {
  quiz: Quiz
  user: {
    uid: string
    email: string
    name?: string
    department?: string
    rollNumber?: string
  }
  isPublic?: boolean
  onBack: () => void
  onCompleted?: (attempt: QuizAttempt) => void
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void
}

export function QuizPlayer({
  quiz,
  user,
  isPublic = false,
  onBack,
  onCompleted,
  showToast,
}: QuizPlayerProps) {
  const [currentIdx, setCurrentIdx] = useState(0)
  const [answers, setAnswers] = useState<Record<string, number>>({})
  const [markedForReview, setMarkedForReview] = useState<Record<string, boolean>>({})

  // Timer: timeLimitMinutes * 60
  const initialSeconds = Math.max(60, (quiz.timeLimitMinutes || 15) * 60)
  const [secondsLeft, setSecondsLeft] = useState(initialSeconds)
  const [submitting, setSubmitting] = useState(false)
  const [showConfirmModal, setShowConfirmModal] = useState(false)
  const [completedAttempt, setCompletedAttempt] = useState<QuizAttempt | null>(null)

  // ── Anti-Cheat & Persistent Forensic Telemetry State ───────────────────────
  const [isFullscreen, setIsFullscreen] = useState(() => {
    if (typeof document === 'undefined') return false
    return !!(document.fullscreenElement || (document as any).webkitFullscreenElement)
  })
  const [, setSuspiciousFlags] = useState<SuspiciousFlag[]>([])

  // Persistent telemetry refs to guarantee 100% data capture fidelity without React closure staleness
  const suspiciousFlagsRef = useRef<SuspiciousFlag[]>([])
  const tabSwitchesCountRef = useRef(0)
  const fullscreenViolationsCountRef = useRef(0)
  const faceMissingCountRef = useRef(0)
  const multipleFacesCountRef = useRef(0)
  const phoneDetectedCountRef = useRef(0)
  const audioAnomaliesCountRef = useRef(0)
  const tamperAttemptsCountRef = useRef(0)
  const totalAwaySecondsRef = useRef(0)
  const blurStartRef = useRef<number | null>(null)
  const snapshotCaptureRef = useRef<(() => string | undefined) | null>(null)

  // Responsive mobile state
  const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' ? window.innerWidth < 860 : false)
  const [mobilePaletteOpen, setMobilePaletteOpen] = useState(false)
  const [paletteFilter, setPaletteFilter] = useState<'all' | 'answered' | 'review' | 'unanswered'>('all')

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const startTimeRef = useRef<number>(Date.now())
  const hasMountedRef = useRef(false)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const [invigilatorWarning, setInvigilatorWarning] = useState<string | null>(null)

  const handleRegisterCapture = useCallback((fn: () => string | undefined) => {
    snapshotCaptureRef.current = fn
  }, [])
  const handleRegisterMediaStream = useCallback((s: MediaStream | null) => {
    mediaStreamRef.current = s
  }, [])

  // ── Anti-Cheating Deterministic Question & Option Shuffling ────────────────
  const { shuffledQuestions, questionMap } = useMemo(() => {
    return generateShuffledQuiz(quiz.questions, `${user.uid}_${quiz.id}`, {
      shuffleQuestions: quiz.shuffleQuestions !== false,
      shuffleOptions: quiz.shuffleOptions !== false,
    })
  }, [quiz.questions, quiz.id, quiz.shuffleQuestions, quiz.shuffleOptions, user.uid])

  const totalQuestions = shuffledQuestions.length
  const currentQ = shuffledQuestions[currentIdx]

  // ── Real-Time Proctoring WebSocket & WebRTC P2P Streamer ───────────────────
  const { sendPulse, sendFlag } = useStudentProctorSocket({
    quizId: quiz.id,
    studentUid: user.uid,
    studentName: user.name || user.email.split('@')[0],
    studentEmail: user.email,
    department: user.department,
    rollNumber: user.rollNumber,
    totalQuestions,
    mediaStreamRef,
    onWarningMessage: (msg) => {
      setInvigilatorWarning(msg)
    },
  })

  // Track window resize for responsive layout
  useEffect(() => {
    function handleResize() {
      setIsMobile(window.innerWidth < 860)
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // ── Fullscreen Request & Listener (Continuous Lockdown & Forensic Tracking) ──
  const enterFullscreen = useCallback(async () => {
    try {
      const el = document.documentElement as any
      if (document.fullscreenElement || (document as any).webkitFullscreenElement) {
        setIsFullscreen(true)
        return
      }
      if (el.requestFullscreen) {
        await el.requestFullscreen()
      } else if (el.webkitRequestFullscreen) {
        await el.webkitRequestFullscreen()
      } else if (el.msRequestFullscreen) {
        await el.msRequestFullscreen()
      }
      setIsFullscreen(true)
    } catch (err) {
      console.warn('Fullscreen request was declined or blocked:', err)
    }
  }, [])

  useEffect(() => {
    const isFsNow = () => !!(document.fullscreenElement || (document as any).webkitFullscreenElement)
    setIsFullscreen(isFsNow())

    // Prompt fullscreen on initial mount
    if (!hasMountedRef.current) {
      hasMountedRef.current = true
      enterFullscreen()
    }

    function handleFsChange() {
      const isFs = isFsNow()
      setIsFullscreen(isFs)

      if (!isFs && !completedAttempt) {
        fullscreenViolationsCountRef.current += 1
        const snap = snapshotCaptureRef.current?.()
        const timestamp = new Date().toLocaleTimeString()
        const flag: SuspiciousFlag = {
          timestamp,
          type: 'fullscreen_exit',
          detail: `Fullscreen mode exited by candidate (Infraction #${fullscreenViolationsCountRef.current}) at ${timestamp}`,
          snapshot: snap,
        }
        suspiciousFlagsRef.current.push(flag)
        setSuspiciousFlags((prev) => [...prev, flag])

        // Live notification to invigilation cockpit
        sendFlag({
          flagType: 'fullscreen_exit',
          detail: flag.detail,
          snapshot: snap,
        })
      }
    }

    document.addEventListener('fullscreenchange', handleFsChange)
    document.addEventListener('webkitfullscreenchange', handleFsChange)
    return () => {
      document.removeEventListener('fullscreenchange', handleFsChange)
      document.removeEventListener('webkitfullscreenchange', handleFsChange)
      const doc = document as any
      if ((doc.fullscreenElement || doc.webkitFullscreenElement) && doc.exitFullscreen) {
        doc.exitFullscreen().catch(() => {})
      }
    }
  }, [completedAttempt, enterFullscreen, sendFlag])

  // ── Tab Switch & Focus Loss Listener (Stealth Duration Tracking) ───────────
  useEffect(() => {
    function handleVisibilityChange() {
      if (completedAttempt) return
      const timestamp = new Date().toLocaleTimeString()

      if (document.hidden) {
        blurStartRef.current = Date.now()
        tabSwitchesCountRef.current += 1
        const snap = snapshotCaptureRef.current?.()
        const flag: SuspiciousFlag = {
          timestamp,
          type: 'tab_switch',
          detail: `Browser tab switch or window minimized (Infraction #${tabSwitchesCountRef.current})`,
          snapshot: snap,
        }
        suspiciousFlagsRef.current.push(flag)
        setSuspiciousFlags((s) => [...s, flag])
      } else {
        // Returned back to test
        if (blurStartRef.current) {
          const awaySec = Math.max(1, Math.round((Date.now() - blurStartRef.current) / 1000))
          totalAwaySecondsRef.current += awaySec
          const snap = snapshotCaptureRef.current?.()
          const flag: SuspiciousFlag = {
            timestamp,
            type: 'focus_loss',
            detail: `Candidate returned to assessment after ${awaySec}s away from window`,
            snapshot: snap,
            durationSeconds: awaySec,
          }
          suspiciousFlagsRef.current.push(flag)
          setSuspiciousFlags((s) => [...s, flag])
          blurStartRef.current = null
        }
      }
    }

    function handleWindowBlur() {
      if (completedAttempt || document.hidden) return
      const timestamp = new Date().toLocaleTimeString()
      blurStartRef.current = Date.now()
      tabSwitchesCountRef.current += 1
      const snap = snapshotCaptureRef.current?.()
      const flag: SuspiciousFlag = {
        timestamp,
        type: 'focus_loss',
        detail: `Window focus lost or candidate switched applications (Infraction #${tabSwitchesCountRef.current})`,
        snapshot: snap,
      }
      suspiciousFlagsRef.current.push(flag)
      setSuspiciousFlags((s) => [...s, flag])
    }

    function handleWindowFocus() {
      if (completedAttempt) return
      if (blurStartRef.current) {
        const timestamp = new Date().toLocaleTimeString()
        const awaySec = Math.max(1, Math.round((Date.now() - blurStartRef.current) / 1000))
        totalAwaySecondsRef.current += awaySec
        const snap = snapshotCaptureRef.current?.()
        const flag: SuspiciousFlag = {
          timestamp,
          type: 'focus_loss',
          detail: `Candidate refocused assessment window after ${awaySec}s away`,
          snapshot: snap,
          durationSeconds: awaySec,
        }
        suspiciousFlagsRef.current.push(flag)
        setSuspiciousFlags((s) => [...s, flag])
        blurStartRef.current = null
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('blur', handleWindowBlur)
    window.addEventListener('focus', handleWindowFocus)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('blur', handleWindowBlur)
      window.removeEventListener('focus', handleWindowFocus)
    }
  }, [completedAttempt])

  // ── Honey-Trap: Silent Intercept of Copy / Context Menu / DevTools ──────────
  useEffect(() => {
    function preventCopy(e: ClipboardEvent) {
      if (!completedAttempt) {
        e.preventDefault()
        const snap = snapshotCaptureRef.current?.()
        const timestamp = new Date().toLocaleTimeString()
        tamperAttemptsCountRef.current += 1
        const flag: SuspiciousFlag = {
          timestamp,
          type: 'tamper_attempt',
          detail: `Clipboard copy/cut/paste attempt intercepted at ${timestamp}`,
          snapshot: snap,
        }
        suspiciousFlagsRef.current.push(flag)
        setSuspiciousFlags((s) => [...s, flag])
      }
    }

    function preventContextMenu(e: MouseEvent) {
      if (!completedAttempt) {
        e.preventDefault()
        const snap = snapshotCaptureRef.current?.()
        const timestamp = new Date().toLocaleTimeString()
        tamperAttemptsCountRef.current += 1
        const flag: SuspiciousFlag = {
          timestamp,
          type: 'tamper_attempt',
          detail: `Right-click inspect context menu attempt at ${timestamp}`,
          snapshot: snap,
        }
        suspiciousFlagsRef.current.push(flag)
        setSuspiciousFlags((s) => [...s, flag])
      }
    }

    document.addEventListener('copy', preventCopy)
    document.addEventListener('cut', preventCopy)
    document.addEventListener('paste', preventCopy)
    document.addEventListener('contextmenu', preventContextMenu)

    return () => {
      document.removeEventListener('copy', preventCopy)
      document.removeEventListener('cut', preventCopy)
      document.removeEventListener('paste', preventCopy)
      document.removeEventListener('contextmenu', preventContextMenu)
    }
  }, [completedAttempt])

  // ── Timer Effect ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (completedAttempt) return

    timerRef.current = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current)
          handleFinalSubmit(true)
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [completedAttempt])

  // ── Option Selection ──────────────────────────────────────────────────────
  const handleSelectOption = useCallback((optIdx: number) => {
    if (!currentQ || completedAttempt) return
    const qKey = currentQ.id || `q-${currentIdx}`
    setAnswers((prev) => ({
      ...prev,
      [qKey]: optIdx,
    }))
  }, [currentQ, currentIdx, completedAttempt])

  const handleToggleReview = useCallback(() => {
    if (!currentQ) return
    const qKey = currentQ.id || `q-${currentIdx}`
    setMarkedForReview((prev) => ({
      ...prev,
      [qKey]: !prev[qKey],
    }))
  }, [currentQ, currentIdx])

  // ── AI Proctor Flag Handler (Silent Forensic Capture) ─────────────────────
  const handleProctorFlag = useCallback(
    (reason: string, type?: SuspiciousFlag['type'], snapshot?: string) => {
      const snap = snapshot || snapshotCaptureRef.current?.()
      const flagType: SuspiciousFlag['type'] =
        type ||
        (reason.includes('No face')
          ? 'face_missing'
          : reason.includes('Multiple people')
          ? 'multiple_faces'
          : reason.includes('Mobile phone') || reason.includes('phone')
          ? 'cell_phone'
          : reason.includes('audio') || reason.includes('voice')
          ? 'audio_anomaly'
          : 'other')

      if (flagType === 'face_missing') {
        faceMissingCountRef.current += 1
      } else if (flagType === 'multiple_faces') {
        multipleFacesCountRef.current += 1
      } else if (flagType === 'cell_phone') {
        phoneDetectedCountRef.current += 1
      } else if (flagType === 'audio_anomaly') {
        audioAnomaliesCountRef.current += 1
      }

      const timestamp = new Date().toLocaleTimeString()
      const newFlag: SuspiciousFlag = {
        timestamp,
        type: flagType,
        detail: reason,
        snapshot: snap,
      }

      suspiciousFlagsRef.current.push(newFlag)
      setSuspiciousFlags((prev) => [...prev, newFlag])

      // Real-time broadcast to Admin Invigilation Cockpit via WebSocket
      sendFlag({
        flagType,
        detail: reason,
        snapshot: snap,
      })

      // Stealth Mode: Candidate is NOT alerted or given toasts,
      // ensuring natural behavior while complete forensic evidence is preserved.
    },
    [sendFlag]
  )

  // Real-time progress pulse to Admin Invigilation Cockpit
  useEffect(() => {
    if (completedAttempt) return
    sendPulse({
      currentQuestionIndex: currentIdx + 1,
      answeredCount: Object.keys(answers).length,
      elapsedSeconds: Math.floor((Date.now() - startTimeRef.current) / 1000),
      status: 'active',
    })
  }, [currentIdx, answers, completedAttempt, sendPulse])

  // ── Keyboard Shortcuts (A/B/C/D, 1/2/3/4, Arrows, M, C, DevTools Trap) ────
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (
        showConfirmModal ||
        completedAttempt ||
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return
      }

      const key = e.key.toLowerCase()

      // Honey-trap: Detect DevTools / Source inspection shortcuts silently
      if (
        e.key === 'F12' ||
        ((e.ctrlKey || e.metaKey) && e.shiftKey && ['i', 'j', 'c'].includes(key)) ||
        ((e.ctrlKey || e.metaKey) && ['u', 'p', 's'].includes(key))
      ) {
        e.preventDefault()
        const snap = snapshotCaptureRef.current?.()
        const timestamp = new Date().toLocaleTimeString()
        tamperAttemptsCountRef.current += 1
        const flag: SuspiciousFlag = {
          timestamp,
          type: 'tamper_attempt',
          detail: `Developer tools / Source inspect attempted: ${e.key}`,
          snapshot: snap,
        }
        suspiciousFlagsRef.current.push(flag)
        setSuspiciousFlags((s) => [...s, flag])
        return
      }

      if (['a', '1'].includes(key) && currentQ?.options?.[0] !== undefined) {
        e.preventDefault()
        handleSelectOption(0)
      } else if (['b', '2'].includes(key) && currentQ?.options?.[1] !== undefined) {
        e.preventDefault()
        handleSelectOption(1)
      } else if (['c', '3'].includes(key) && currentQ?.options?.[2] !== undefined) {
        e.preventDefault()
        handleSelectOption(2)
      } else if (['d', '4'].includes(key) && currentQ?.options?.[3] !== undefined) {
        e.preventDefault()
        handleSelectOption(3)
      } else if (key === 'arrowleft') {
        e.preventDefault()
        setCurrentIdx((prev) => Math.max(0, prev - 1))
      } else if (key === 'arrowright') {
        e.preventDefault()
        setCurrentIdx((prev) => Math.min(totalQuestions - 1, prev + 1))
      } else if (key === 'm') {
        e.preventDefault()
        handleToggleReview()
      } else if (key === 'delete' || key === 'backspace') {
        const qKey = currentQ?.id || `q-${currentIdx}`
        if (answers[qKey] !== undefined) {
          e.preventDefault()
          setAnswers((prev) => {
            const copy = { ...prev }
            delete copy[qKey]
            return copy
          })
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [
    currentQ,
    totalQuestions,
    answers,
    showConfirmModal,
    completedAttempt,
    handleSelectOption,
    handleToggleReview,
    currentIdx,
  ])

  // ── Submission Handler (Transfers Complete Telemetry & Snapshots) ─────────
  async function handleFinalSubmit(isAuto = false) {
    if (submitting || completedAttempt) return
    setSubmitting(true)
    if (timerRef.current) clearInterval(timerRef.current)

    try {
      const timeSpentSeconds = Math.max(
        1,
        Math.floor((Date.now() - startTimeRef.current) / 1000)
      )

      let score = 0
      let maxScore = 0

      shuffledQuestions.forEach((q, idx) => {
        const qPoints = q.points || 1
        maxScore += qPoints
        const ans = (q.id && answers[q.id] !== undefined) ? answers[q.id] : answers[`q-${idx}`]
        if (ans === q.correctIndex) {
          score += qPoints
        }
      })

      const percentage = maxScore > 0 ? Math.round((score / maxScore) * 100) : 0
      const passed = percentage >= (quiz.passingPercentage || 60)

      // Convert displayed option selections back to master question keys for clean Firestore records
      const masterAnswers = convertDisplayedAnswersToMaster(answers, questionMap)

      // Calculate Forensic Integrity Score (0..100)
      let integrityScore = 100
      integrityScore -= tabSwitchesCountRef.current * 12
      integrityScore -= faceMissingCountRef.current * 10
      integrityScore -= multipleFacesCountRef.current * 25
      integrityScore -= phoneDetectedCountRef.current * 30
      integrityScore -= audioAnomaliesCountRef.current * 15
      integrityScore -= tamperAttemptsCountRef.current * 15
      integrityScore -= Math.min(25, Math.floor(totalAwaySecondsRef.current / 5) * 5)
      integrityScore = Math.max(0, Math.min(100, integrityScore))

      // Retain all snapshots with a safety boundary of 25 snapshots.
      // At ~3.2KB per downscaled JPEG, 25 snapshots is only ~80KB (far below Firestore's 1,024KB limit).
      // Every single flag retains its evidence photo.
      const persistedFlags: SuspiciousFlag[] = suspiciousFlagsRef.current.map((flag, idx) => {
        if (idx < 25) return flag
        const { snapshot: _s, ...rest } = flag
        return rest as SuspiciousFlag
      })

      const attemptPayload: Omit<QuizAttempt, 'id'> = {
        quizId: quiz.id,
        quizTitle: quiz.title,
        studentUid: user.uid,
        studentEmail: user.email,
        studentName: user.name || user.email.split('@')[0],
        department: user.department || 'Engineering',
        rollNumber: user.rollNumber,
        isPublicCandidate: !!isPublic,
        score,
        maxScore,
        percentage,
        passed,
        answers: masterAnswers,
        timeSpentSeconds,
        completedAt: new Date().toISOString(),
        suspiciousFlags: persistedFlags,
        tabSwitchesCount: tabSwitchesCountRef.current,
        fullscreenViolationsCount: fullscreenViolationsCountRef.current,
        faceMissingCount: faceMissingCountRef.current,
        multipleFacesCount: multipleFacesCountRef.current,
        audioAnomaliesCount: audioAnomaliesCountRef.current,
        totalAwaySeconds: totalAwaySecondsRef.current,
        integrityScore,
      }

      // ── Step 1: Submit attempt immediately to Firestore (<120ms) ───────────
      // Unblocks candidate UI instantly without waiting on Google Drive or Render cold starts.
      const attemptId = await submitQuizAttempt(attemptPayload)
      const fullAttempt: QuizAttempt = { id: attemptId, ...attemptPayload }

      // ── Step 2: Transition candidate directly to completion view ────────────
      setCompletedAttempt(fullAttempt)
      setShowConfirmModal(false)

      // Exit fullscreen mode on completion so candidate can view report comfortably
      const doc = document as any
      if ((doc.fullscreenElement || doc.webkitFullscreenElement) && doc.exitFullscreen) {
        doc.exitFullscreen().catch(() => {})
      }

      if (isAuto) {
        showToast('Assessment submitted automatically.', 'info')
      } else {
        showToast('Assessment submitted successfully!', 'success')
      }

      if (onCompleted) {
        onCompleted(fullAttempt)
      }

      // ── Step 3: Non-Blocking Background Google Drive Evidence Sync ──────────
      // Runs silently in the background; updates Firestore attempt record with Drive link once done.
      const snapshotsToUpload = suspiciousFlagsRef.current.filter((f) => !!f.snapshot).slice(0, 25)
      if (snapshotsToUpload.length > 0) {
        uploadQuizEvidenceToDrive({
          attemptId,
          quizId: quiz.id,
          quizTitle: quiz.title,
          studentName: user.name || user.email.split('@')[0],
          studentEmail: user.email,
          completedAt: attemptPayload.completedAt,
          snapshots: snapshotsToUpload.map((s) => ({
            timestamp: s.timestamp,
            type: s.type,
            detail: s.detail,
            snapshot: s.snapshot,
          })),
        })
          .then((driveRes) => {
            if (driveRes?.driveFolderLink) {
              updateQuizAttemptDriveLink(attemptId, driveRes.driveFolderLink)
              setCompletedAttempt((prev) =>
                prev ? { ...prev, driveEvidenceFolderLink: driveRes.driveFolderLink } : prev
              )
            }
          })
          .catch((err) => {
            console.warn('Background Drive evidence upload failed:', err)
          })
      }
    } catch (err) {
      showToast(sanitizeErrorMessage(err, 'Failed to submit assessment.'), 'error')
    } finally {
      setSubmitting(false)
    }
  }

  // ── Time Formatter ────────────────────────────────────────────────────────
  const mins = Math.floor(secondsLeft / 60)
  const secs = secondsLeft % 60
  const isUrgent = secondsLeft < 120 // < 2 mins

  // Palette metrics
  const answeredCount = shuffledQuestions.filter((q, idx) => {
    const ans = (q.id && answers[q.id] !== undefined) ? answers[q.id] : answers[`q-${idx}`]
    return ans !== undefined && ans !== null
  }).length
  const reviewCount = shuffledQuestions.filter((q, idx) => {
    return !!((q.id && markedForReview[q.id]) || markedForReview[`q-${idx}`])
  }).length
  const unansweredCount = totalQuestions - answeredCount

  return (
    <>
      {/* ── Mandatory Fullscreen Lockdown Overlay (Outside blur container so it stays 100% crisp) ── */}
      {!isFullscreen && !completedAttempt && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 999999,
            background: 'rgba(15, 23, 42, 0.94)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1.5rem',
            pointerEvents: 'auto',
          }}
        >
          <div
            style={{
              maxWidth: 500,
              width: '100%',
              background: '#ffffff',
              borderRadius: 16,
              padding: '2.5rem 2rem',
              textAlign: 'center',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.45)',
              border: '1px solid #E2E8F0',
            }}
          >
            <div
              style={{
                width: 64,
                height: 64,
                borderRadius: '50%',
                background: fullscreenViolationsCountRef.current > 0 ? '#FEF2F2' : '#EFF6FF',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '1.25rem',
                border: fullscreenViolationsCountRef.current > 0 ? '2px solid #FCA5A5' : '2px solid #BFDBFE',
              }}
            >
              {fullscreenViolationsCountRef.current > 0 ? (
                <AlertTriangle size={32} color="#DC2626" />
              ) : (
                <Maximize size={32} color="#2563EB" />
              )}
            </div>

            <h2
              style={{
                fontSize: '1.35rem',
                fontWeight: 800,
                color: '#0F172A',
                margin: '0 0 0.5rem',
                letterSpacing: '-0.02em',
              }}
            >
              {fullscreenViolationsCountRef.current > 0
                ? 'Assessment Paused: Fullscreen Exited'
                : 'Fullscreen Mode Required'}
            </h2>

            <p
              style={{
                fontSize: '0.88rem',
                color: '#475569',
                lineHeight: 1.55,
                margin: '0 0 1.25rem',
              }}
            >
              {fullscreenViolationsCountRef.current > 0
                ? 'You have exited fullscreen mode. All questions and choices are frozen and obscured until you return to fullscreen. This infraction has been logged in your proctoring dossier.'
                : 'PrepHire AI requires all proctored assessments to remain in continuous fullscreen mode. Questions and answers are obscured in windowed mode to preserve academic integrity.'}
            </p>

            {fullscreenViolationsCountRef.current > 0 && (
              <div
                style={{
                  background: '#FFF1F2',
                  border: '1px solid #FECDD3',
                  borderRadius: 8,
                  padding: '0.65rem 0.85rem',
                  marginBottom: '1.25rem',
                  fontSize: '0.78rem',
                  color: '#9F1239',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.4rem',
                }}
              >
                <AlertTriangle size={14} color="#E11D48" />
                <span>
                  Infraction #{fullscreenViolationsCountRef.current} recorded · Timer continues running
                </span>
              </div>
            )}

            <button
              onClick={enterFullscreen}
              style={{
                width: '100%',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem',
                background: '#2563EB',
                color: '#ffffff',
                border: 'none',
                borderRadius: 10,
                padding: '0.85rem 1.5rem',
                fontSize: '0.95rem',
                fontWeight: 700,
                cursor: 'pointer',
                boxShadow: '0 4px 12px rgba(37, 99, 235, 0.28)',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#1D4ED8'
                e.currentTarget.style.transform = 'translateY(-1px)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = '#2563EB'
                e.currentTarget.style.transform = 'translateY(0)'
              }}
            >
              <Maximize size={18} />
              <span>
                {fullscreenViolationsCountRef.current > 0
                  ? 'Return to Fullscreen & Resume'
                  : 'Enter Fullscreen & Begin Assessment'}
              </span>
            </button>

            <div
              style={{
                marginTop: '1rem',
                fontSize: '0.72rem',
                color: '#94A3B8',
              }}
            >
              Continuous fullscreen is mandated for this proctored evaluation.
            </div>
          </div>
        </div>
      )}

      {/* ── Main Assessment Container (Blurred only when out of fullscreen) ── */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem',
          userSelect: 'none',
          paddingBottom: isMobile ? '5rem' : '1rem',
          filter: !isFullscreen && !completedAttempt ? 'blur(10px)' : 'none',
          pointerEvents: !isFullscreen && !completedAttempt ? 'none' : 'auto',
          transition: 'filter 0.2s ease',
        }}
      >
      {/* Top Cockpit Header */}
      <GlassCard
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '0.75rem',
          padding: isMobile ? '0.75rem 1rem' : '1rem 1.5rem',
          position: 'sticky',
          top: 0,
          zIndex: 40,
          boxShadow: '0 2px 10px rgba(0,0,0,0.05)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <button
            onClick={() => {
              if (window.confirm('Are you sure you want to exit? Your progress will be lost.')) {
                onBack()
              }
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
              background: '#F3F4F6',
              border: 'none',
              borderRadius: 8,
              padding: '0.45rem 0.85rem',
              cursor: 'pointer',
              color: T.txtPri,
              fontSize: '0.82rem',
              fontWeight: 600,
              minHeight: 38,
            }}
          >
            <ArrowLeft size={15} /> Exit
          </button>

          <div>
            <h2
              style={{
                margin: 0,
                fontSize: isMobile ? '1.05rem' : '1.2rem',
                fontWeight: 700,
                color: T.txtPri,
                lineHeight: 1.3,
              }}
            >
              {quiz.title}
            </h2>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                marginTop: '0.2rem',
                fontSize: '0.75rem',
                color: T.txtSec,
                flexWrap: 'wrap',
              }}
            >
              <span>{quiz.category}</span>
              <span>•</span>
              <span>Target: {quiz.passingPercentage}%</span>
              {user.rollNumber && (
                <>
                  <span>•</span>
                  <span style={{ fontWeight: 600, color: T.primary }}>Roll: {user.rollNumber}</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Live Status Indicators (Timer, Proctoring Pill, Submit) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
          {/* Proctoring Pill (Stealth & Calm for Candidate) */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
              padding: '0.35rem 0.65rem',
              borderRadius: 8,
              background: '#F0FDF4',
              border: '1px solid #86EFAC',
              color: '#15803D',
              fontSize: '0.75rem',
              fontWeight: 700,
            }}
            title="Proctored Assessment Active"
          >
            <Shield size={13} color="#15803D" />
            <span>Proctored Session</span>
          </div>

          {/* Fullscreen Status Pill */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.3rem',
              background: isFullscreen ? '#F0FDF4' : '#FEF2F2',
              color: isFullscreen ? '#166534' : '#991B1B',
              border: isFullscreen ? '1px solid #BBF7D0' : '1px solid #FECACA',
              borderRadius: 8,
              padding: '0.35rem 0.65rem',
              fontSize: '0.72rem',
              fontWeight: 700,
            }}
            title={isFullscreen ? 'Assessment locked in full screen' : 'Fullscreen required'}
          >
            <Maximize size={12} color={isFullscreen ? '#166534' : '#DC2626'} />
            <span>{isFullscreen ? 'Fullscreen Active' : 'Windowed Mode'}</span>
          </div>

          {/* Timer Display */}
          <div
            className={isUrgent ? 'timer-urgent' : ''}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
              padding: '0.4rem 0.75rem',
              borderRadius: 8,
              background: isUrgent ? '#FEE2E2' : '#EFF6FF',
              color: isUrgent ? '#DC2626' : '#2563EB',
              border: isUrgent ? '1.5px solid #FCA5A5' : '1px solid #BFDBFE',
              fontWeight: 700,
              fontSize: isMobile ? '0.95rem' : '1.05rem',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            <Clock size={16} />
            <span>
              {mins < 10 ? '0' : ''}
              {mins}:{secs < 10 ? '0' : ''}
              {secs}
            </span>
          </div>

          {/* Mobile Palette Toggle Button */}
          {isMobile && (
            <button
              onClick={() => setMobilePaletteOpen(!mobilePaletteOpen)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.3rem',
                background: '#F3F4F6',
                color: T.txtPri,
                border: '1px solid #E5E7EB',
                borderRadius: 8,
                padding: '0.4rem 0.65rem',
                fontSize: '0.78rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {mobilePaletteOpen ? <X size={14} /> : <Menu size={14} />}
              <span>{answeredCount}/{totalQuestions}</span>
            </button>
          )}

          {/* Desktop Submit Button */}
          {!isMobile && (
            <button
              onClick={() => setShowConfirmModal(true)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                background: T.primary,
                color: '#ffffff',
                border: 'none',
                borderRadius: 8,
                padding: '0.55rem 1.15rem',
                fontSize: '0.85rem',
                fontWeight: 600,
                cursor: 'pointer',
                boxShadow: '0 2px 8px rgba(0, 30, 64, 0.25)',
              }}
            >
              <Send size={15} /> Submit Assessment
            </button>
          )}
        </div>

        {/* Animated Progress Strip */}
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: 3,
            background: '#E5E7EB',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              height: '100%',
              width: `${Math.round((answeredCount / totalQuestions) * 100)}%`,
              background: 'linear-gradient(90deg, #2563EB, #10B981)',
              transition: 'width 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
            }}
          />
        </div>
      </GlassCard>

      {/* Mobile Persistent AI Proctor Camera (Never unmounted) */}
      {isMobile && (
        <GlassCard style={{ padding: '0.65rem 1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.8rem', fontWeight: 750, color: T.txtPri }}>
              <Shield size={14} color="#059669" /> AI Surveillance Active
            </div>
            <div style={{ fontSize: '0.7rem', color: T.txtSec, marginTop: 2 }}>
              Keep face centered · No mobile devices allowed
            </div>
          </div>
          <QuizProctorCamera
            active={!completedAttempt}
            compact={true}
            stealthMode={true}
            onFlag={handleProctorFlag}
            onRegisterCapture={handleRegisterCapture}
            onRegisterMediaStream={handleRegisterMediaStream}
          />
        </GlassCard>
      )}

      {/* Invigilator Live Warning Banner */}
      {invigilatorWarning && (
        <div
          style={{
            background: '#FEF2F2',
            border: '2px solid #EF4444',
            borderRadius: 12,
            padding: '1rem 1.25rem',
            marginBottom: '1rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '1rem',
            color: '#991B1B',
            boxShadow: '0 4px 14px rgba(239, 68, 68, 0.18)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <AlertTriangle size={24} color="#DC2626" style={{ flexShrink: 0 }} />
            <div>
              <strong style={{ fontSize: '0.92rem', display: 'block' }}>⚠️ Official Notice from Assessment Invigilator:</strong>
              <p style={{ margin: '0.2rem 0 0', fontSize: '0.85rem', fontWeight: 550, color: '#B91C1C' }}>
                {invigilatorWarning}
              </p>
            </div>
          </div>
          <button
            onClick={() => setInvigilatorWarning(null)}
            style={{
              background: '#DC2626',
              color: '#ffffff',
              border: 'none',
              borderRadius: 8,
              padding: '0.45rem 1rem',
              fontSize: '0.8rem',
              fontWeight: 650,
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            I Acknowledge
          </button>
        </div>
      )}

      {/* Main Grid: Question Card on Left, Palette & Proctoring on Right */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : 'minmax(0, 1fr) 280px',
          gap: '1rem',
          alignItems: 'start',
        }}
      >
        {/* Left: Active Question */}
        <GlassCard
          style={{
            padding: isMobile ? '1rem' : '1.5rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '1.25rem',
          }}
        >
          {/* Question Stepper Indicator */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
            <span
              style={{
                background: '#EEF2FF',
                color: '#4F46E5',
                padding: '0.3rem 0.75rem',
                borderRadius: 8,
                fontSize: '0.85rem',
                fontWeight: 700,
              }}
            >
              Question {currentIdx + 1} of {totalQuestions}
            </span>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
              <span style={{ fontSize: '0.8rem', color: T.txtSec, fontWeight: 600 }}>
                +{currentQ?.points || 1} pt
              </span>

              {((currentQ?.id && answers[currentQ.id] !== undefined) || answers[`q-${currentIdx}`] !== undefined) && (
                <button
                  onClick={() => {
                    setAnswers((prev) => {
                      const copy = { ...prev }
                      if (currentQ?.id) delete copy[currentQ.id]
                      delete copy[`q-${currentIdx}`]
                      return copy
                    })
                  }}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#6B7280',
                    fontSize: '0.78rem',
                    cursor: 'pointer',
                    textDecoration: 'underline',
                    padding: '0.2rem 0.4rem',
                  }}
                  title="Clear choice (or press Backspace/Delete)"
                >
                  Clear choice
                </button>
              )}

              <button
                onClick={handleToggleReview}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  background: markedForReview[currentQ?.id] ? '#FEF3C7' : '#F3F4F6',
                  color: markedForReview[currentQ?.id] ? '#B45309' : T.txtSec,
                  border: markedForReview[currentQ?.id] ? '1px solid #FDE68A' : 'none',
                  borderRadius: 6,
                  padding: '0.35rem 0.65rem',
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  minHeight: 34,
                }}
                title="Mark for review (Hot-key: M)"
              >
                <Bookmark size={13} fill={markedForReview[currentQ?.id] ? '#B45309' : 'none'} />
                {markedForReview[currentQ?.id] ? 'Marked' : 'Mark Review'}
              </button>
            </div>
          </div>

          {/* Question Text */}
          <div
            style={{
              fontSize: isMobile ? '1.02rem' : '1.15rem',
              fontWeight: 650,
              color: T.txtPri,
              lineHeight: 1.6,
              letterSpacing: '-0.01em',
            }}
          >
            {currentQ?.question}
          </div>

          {/* Optional Code Snippet */}
          {currentQ?.codeSnippet && (
            <pre
              style={{
                margin: 0,
                padding: '0.85rem 1.15rem',
                borderRadius: 8,
                background: '#1F2937',
                color: '#F9FAFB',
                fontSize: '0.85rem',
                fontFamily: 'Consolas, Monaco, "Courier New", monospace',
                overflowX: 'auto',
                border: '1px solid #374151',
              }}
            >
              <code>{currentQ.codeSnippet}</code>
            </pre>
          )}

          {/* 4 Interactive Option Cards */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
            {currentQ?.options.map((opt, optIdx) => {
              const letter = String.fromCharCode(65 + optIdx)
              const selectedVal =
                (currentQ.id && answers[currentQ.id] !== undefined)
                  ? answers[currentQ.id]
                  : answers[`q-${currentIdx}`]
              const isSelected = selectedVal === optIdx

              return (
                <div
                  key={optIdx}
                  onClick={() => handleSelectOption(optIdx)}
                  className={`quiz-option-card ${isSelected ? 'selected' : ''}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '0.85rem',
                    padding: isMobile ? '0.85rem 1rem' : '0.95rem 1.25rem',
                    borderRadius: 12,
                    border: isSelected ? '2px solid #2563EB' : '1px solid #E5E7EB',
                    background: isSelected ? '#EFF6FF' : '#ffffff',
                    cursor: 'pointer',
                    boxShadow: isSelected ? '0 4px 14px -2px rgba(37, 99, 235, 0.16)' : 'none',
                    minHeight: 52,
                    userSelect: 'none',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', flex: 1 }}>
                    <div
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 8,
                        background: isSelected ? '#2563EB' : '#F1F5F9',
                        color: isSelected ? '#ffffff' : '#475569',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 700,
                        fontSize: '0.88rem',
                        flexShrink: 0,
                        transition: 'all 0.15s ease',
                      }}
                    >
                      {letter}
                    </div>

                    <span
                      style={{
                        fontSize: isMobile ? '0.92rem' : '0.98rem',
                        color: isSelected ? '#1E40AF' : T.txtPri,
                        fontWeight: isSelected ? 600 : 450,
                        lineHeight: 1.5,
                      }}
                    >
                      {opt}
                    </span>
                  </div>

                  {/* Radio Selection Indicator */}
                  <div
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: '50%',
                      border: isSelected ? '6px solid #2563EB' : '2px solid #CBD5E1',
                      background: '#ffffff',
                      flexShrink: 0,
                      transition: 'all 0.15s ease',
                    }}
                  />
                </div>
              )
            })}
          </div>

          {/* Desktop Navigation Controls */}
          {!isMobile && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingTop: '0.85rem',
                borderTop: '1px solid #F3F4F6',
                marginTop: '0.5rem',
              }}
            >
              <button
                disabled={currentIdx === 0}
                onClick={() => setCurrentIdx((prev) => Math.max(0, prev - 1))}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.45rem',
                  background: currentIdx === 0 ? '#F9FAFB' : '#F3F4F6',
                  color: currentIdx === 0 ? '#9CA3AF' : T.txtPri,
                  border: 'none',
                  borderRadius: 8,
                  padding: '0.6rem 1.15rem',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  cursor: currentIdx === 0 ? 'not-allowed' : 'pointer',
                }}
                title="Previous question (Hot-key: ←)"
              >
                <ArrowLeft size={15} /> Previous <span style={{ fontSize: '0.72rem', opacity: 0.65 }}>[←]</span>
              </button>

              {currentIdx < totalQuestions - 1 ? (
                <button
                  onClick={() => setCurrentIdx((prev) => Math.min(totalQuestions - 1, prev + 1))}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.45rem',
                    background: T.primary,
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: 8,
                    padding: '0.6rem 1.35rem',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    boxShadow: '0 2px 8px rgba(0, 30, 64, 0.2)',
                  }}
                  title="Next question (Hot-key: →)"
                >
                  Next <ArrowRight size={15} /> <span style={{ fontSize: '0.72rem', opacity: 0.7 }}>[→]</span>
                </button>
              ) : (
                <button
                  onClick={() => setShowConfirmModal(true)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.45rem',
                    background: '#059669',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: 8,
                    padding: '0.6rem 1.35rem',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    boxShadow: '0 2px 8px rgba(5, 150, 105, 0.25)',
                  }}
                >
                  Review & Submit <Send size={15} />
                </button>
              )}
            </div>
          )}
        </GlassCard>

        {/* Right Sidebar: Facial Scan Proctor Camera & Palette */}
        {(!isMobile || mobilePaletteOpen) && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {/* Embedded AI Proctor Camera (Desktop view) */}
            {!isMobile && (
              <QuizProctorCamera
                active={!completedAttempt}
                stealthMode={true}
                onFlag={handleProctorFlag}
                onRegisterCapture={handleRegisterCapture}
                onRegisterMediaStream={handleRegisterMediaStream}
              />
            )}

            {/* Question Palette */}
            <GlassCard style={{ padding: '1.15rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.85rem' }}>
                <h4 style={{ margin: 0, fontSize: '0.92rem', fontWeight: 700, color: T.txtPri }}>
                  Question Palette
                </h4>
                {isMobile && (
                  <button
                    onClick={() => setMobilePaletteOpen(false)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: T.txtSec,
                      cursor: 'pointer',
                      padding: '0.2rem',
                    }}
                  >
                    <X size={16} />
                  </button>
                )}
              </div>

              {/* Filter Pills */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.3rem',
                  flexWrap: 'wrap',
                  marginBottom: '0.85rem',
                }}
              >
                {[
                  { id: 'all', label: `All (${totalQuestions})` },
                  { id: 'answered', label: `Ans (${answeredCount})` },
                  { id: 'review', label: `Rev (${reviewCount})` },
                  { id: 'unanswered', label: `Left (${unansweredCount})` },
                ].map((f) => (
                  <button
                    key={f.id}
                    onClick={() => setPaletteFilter(f.id as typeof paletteFilter)}
                    style={{
                      padding: '0.2rem 0.5rem',
                      borderRadius: 6,
                      fontSize: '0.72rem',
                      fontWeight: 650,
                      border: 'none',
                      cursor: 'pointer',
                      background: paletteFilter === f.id ? T.primary : '#F1F5F9',
                      color: paletteFilter === f.id ? '#ffffff' : '#64748B',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              {/* Grid of 1..N */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '0.45rem', marginBottom: '1rem' }}>
                {shuffledQuestions.map((q, idx) => {
                  const isCurrent = idx === currentIdx
                  const isAnswered = (q.id && answers[q.id] !== undefined) || answers[`q-${idx}`] !== undefined
                  const isReview = !!((q.id && markedForReview[q.id]) || markedForReview[`q-${idx}`])

                  // Apply filter
                  if (paletteFilter === 'answered' && !isAnswered) return null
                  if (paletteFilter === 'review' && !isReview) return null
                  if (paletteFilter === 'unanswered' && isAnswered) return null

                  let bg = '#F8FAFC'
                  let color = '#475569'
                  let border = '1px solid #E2E8F0'

                  if (isReview) {
                    bg = '#FEF3C7'
                    color = '#B45309'
                    border = '1px solid #FCD34D'
                  } else if (isAnswered) {
                    bg = '#DCFCE7'
                    color = '#15803D'
                    border = '1px solid #86EFAC'
                  }

                  const activeOutline = isCurrent ? `2px solid ${T.primary}` : 'none'

                  return (
                    <button
                      key={q.id || idx}
                      onClick={() => {
                        setCurrentIdx(idx)
                        if (isMobile) setMobilePaletteOpen(false)
                      }}
                      style={{
                        height: 38,
                        borderRadius: 8,
                        background: bg,
                        color: color,
                        border: border,
                        outline: activeOutline,
                        outlineOffset: 1,
                        fontWeight: 700,
                        fontSize: '0.84rem',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        position: 'relative',
                        transition: 'transform 0.15s ease',
                      }}
                      title={`Question ${idx + 1}${isAnswered ? ' (Answered)' : ''}${isReview ? ' (Review)' : ''}`}
                    >
                      {idx + 1}
                      {isReview && (
                        <span
                          style={{
                            position: 'absolute',
                            top: 2,
                            right: 2,
                            width: 5,
                            height: 5,
                            borderRadius: '50%',
                            background: '#D97706',
                          }}
                        />
                      )}
                    </button>
                  )
                })}
              </div>

              {/* Legend */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', fontSize: '0.75rem', color: T.txtSec, paddingTop: '0.5rem', borderTop: '1px solid #F1F5F9' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ width: 10, height: 10, borderRadius: 3, background: '#DCFCE7', border: '1px solid #86EFAC' }} />
                  <span>Answered ({answeredCount})</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ width: 10, height: 10, borderRadius: 3, background: '#FEF3C7', border: '1px solid #FCD34D' }} />
                  <span>Marked for Review ({reviewCount})</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ width: 10, height: 10, borderRadius: 3, background: '#F8FAFC', border: '1px solid #E2E8F0' }} />
                  <span>Unanswered ({unansweredCount})</span>
                </div>
              </div>
            </GlassCard>

            {/* Ready to Finish Summary Card */}
            <GlassCard style={{ padding: '1rem', background: '#F8FAFC', border: '1px solid #E2E8F0' }}>
              <div style={{ fontSize: '0.88rem', fontWeight: 700, color: T.txtPri, marginBottom: '0.25rem' }}>
                Ready to Finish?
              </div>
              <p style={{ margin: '0 0 0.85rem', fontSize: '0.78rem', color: T.txtSec, lineHeight: 1.45 }}>
                You have answered <strong>{answeredCount}</strong> of <strong>{totalQuestions}</strong> questions.
              </p>
              <button
                onClick={() => setShowConfirmModal(true)}
                style={{
                  width: '100%',
                  background: T.primary,
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: 8,
                  padding: '0.65rem 1rem',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.4rem',
                  boxShadow: '0 2px 6px rgba(0, 30, 64, 0.2)',
                }}
              >
                <Send size={14} /> Submit Assessment
              </button>
            </GlassCard>
          </div>
        )}
      </div>

      {/* Mobile Bottom Fixed Navigation Bar */}
      {isMobile && (
        <div
          style={{
            position: 'fixed',
            bottom: 0,
            left: 0,
            right: 0,
            background: '#ffffff',
            borderTop: '1px solid #E5E7EB',
            padding: '0.75rem 1rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '0.5rem',
            zIndex: 50,
            boxShadow: '0 -4px 12px rgba(0, 0, 0, 0.08)',
          }}
        >
          <button
            disabled={currentIdx === 0}
            onClick={() => setCurrentIdx((prev) => Math.max(0, prev - 1))}
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.35rem',
              background: currentIdx === 0 ? '#F9FAFB' : '#F3F4F6',
              color: currentIdx === 0 ? '#9CA3AF' : T.txtPri,
              border: 'none',
              borderRadius: 8,
              height: 44,
              fontSize: '0.85rem',
              fontWeight: 600,
              cursor: currentIdx === 0 ? 'not-allowed' : 'pointer',
            }}
          >
            <ArrowLeft size={15} /> Prev
          </button>

          {currentIdx < totalQuestions - 1 ? (
            <button
              onClick={() => setCurrentIdx((prev) => Math.min(totalQuestions - 1, prev + 1))}
              style={{
                flex: 1.2,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.35rem',
                background: T.primary,
                color: '#ffffff',
                border: 'none',
                borderRadius: 8,
                height: 44,
                fontSize: '0.85rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Next <ArrowRight size={15} />
            </button>
          ) : (
            <button
              onClick={() => setShowConfirmModal(true)}
              style={{
                flex: 1.4,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.35rem',
                background: '#059669',
                color: '#ffffff',
                border: 'none',
                borderRadius: 8,
                height: 44,
                fontSize: '0.85rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Submit <Send size={14} />
            </button>
          )}
        </div>
      )}

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.45)',
            backdropFilter: 'blur(3px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '1rem',
          }}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: 14,
              padding: '1.5rem',
              maxWidth: 420,
              width: '100%',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 8,
                  background: '#EFF6FF',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#2563EB',
                }}
              >
                <AlertTriangle size={18} />
              </div>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: T.txtPri }}>
                Submit Assessment?
              </h3>
            </div>

            <p style={{ margin: '0 0 1rem', fontSize: '0.85rem', color: T.txtSec, lineHeight: 1.45 }}>
              Are you sure you want to finalize your submission? Once submitted, your answers cannot be modified.
            </p>

            <div style={{ background: '#F9FAFB', borderRadius: 8, padding: '0.75rem', marginBottom: '1.25rem', fontSize: '0.82rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              <div>• <strong>Answered:</strong> {answeredCount} / {totalQuestions}</div>
              <div>• <strong>Marked for Review:</strong> {reviewCount}</div>
              {unansweredCount > 0 && (
                <div style={{ color: '#DC2626' }}>
                  • ⚠️ <strong>Unanswered:</strong> {unansweredCount} questions
                </div>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.6rem' }}>
              <button
                disabled={submitting}
                onClick={() => setShowConfirmModal(false)}
                style={{
                  background: '#F3F4F6',
                  color: T.txtPri,
                  border: 'none',
                  borderRadius: 8,
                  padding: '0.55rem 1rem',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Continue Quiz
              </button>

              <button
                disabled={submitting}
                onClick={() => handleFinalSubmit(false)}
                style={{
                  background: T.primary,
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: 8,
                  padding: '0.55rem 1.15rem',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  cursor: submitting ? 'not-allowed' : 'pointer',
                }}
              >
                {submitting ? 'Submitting...' : 'Confirm Submission'}
              </button>
            </div>
          </div>
        </div>
      )}

      </div>

      {/* Result Modal */}
      {completedAttempt && (
        <QuizResultModal
          quiz={quiz}
          attempt={completedAttempt}
          onClose={onBack}
          onRetake={() => {
            setCompletedAttempt(null)
            setAnswers({})
            setMarkedForReview({})
            setCurrentIdx(0)
            setSecondsLeft(initialSeconds)
            setSuspiciousFlags([])
            suspiciousFlagsRef.current = []
            tabSwitchesCountRef.current = 0
            fullscreenViolationsCountRef.current = 0
            faceMissingCountRef.current = 0
            multipleFacesCountRef.current = 0
            phoneDetectedCountRef.current = 0
            audioAnomaliesCountRef.current = 0
            tamperAttemptsCountRef.current = 0
            totalAwaySecondsRef.current = 0
            blurStartRef.current = null
            startTimeRef.current = Date.now()
          }}
        />
      )}
    </>
  )
}
