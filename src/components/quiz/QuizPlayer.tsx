import { useState, useEffect, useRef, useCallback } from 'react'
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
import { submitQuizAttempt } from '../../services/quiz.service'
import { QuizResultModal } from './QuizResultModal'
import { sanitizeErrorMessage } from '../../utils/errorSanitizer'
import { QuizProctorCamera } from './QuizProctorCamera'

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

  // ── Anti-Cheat & Proctoring State ─────────────────────────────────────────
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [showFsWarning, setShowFsWarning] = useState(false)
  const [tabSwitchesCount, setTabSwitchesCount] = useState(0)
  const [fullscreenViolationsCount, setFullscreenViolationsCount] = useState(0)
  const [faceMissingCount, setFaceMissingCount] = useState(0)
  const [multipleFacesCount, setMultipleFacesCount] = useState(0)
  const [suspiciousFlags, setSuspiciousFlags] = useState<SuspiciousFlag[]>([])

  // Responsive mobile state
  const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' ? window.innerWidth < 860 : false)
  const [mobilePaletteOpen, setMobilePaletteOpen] = useState(false)

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const startTimeRef = useRef<number>(Date.now())
  const hasMountedRef = useRef(false)

  const totalQuestions = quiz.questions.length
  const currentQ = quiz.questions[currentIdx]

  // Track window resize for responsive layout
  useEffect(() => {
    function handleResize() {
      setIsMobile(window.innerWidth < 860)
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // ── Fullscreen Request & Listener ─────────────────────────────────────────
  const enterFullscreen = useCallback(async () => {
    try {
      if (document.documentElement.requestFullscreen && !document.fullscreenElement) {
        await document.documentElement.requestFullscreen()
        setIsFullscreen(true)
        setShowFsWarning(false)
      }
    } catch (err) {
      console.warn('Fullscreen request was declined or blocked:', err)
    }
  }, [])

  useEffect(() => {
    // Prompt fullscreen on initial mount
    if (!hasMountedRef.current) {
      hasMountedRef.current = true
      enterFullscreen()
    }

    function handleFsChange() {
      const isFs = !!document.fullscreenElement
      setIsFullscreen(isFs)

      if (!isFs && !completedAttempt) {
        setFullscreenViolationsCount((c) => c + 1)
        const timestamp = new Date().toLocaleTimeString()
        setSuspiciousFlags((prev) => [
          ...prev,
          {
            timestamp,
            type: 'fullscreen_exit',
            detail: `Fullscreen mode exited at ${timestamp}`,
          },
        ])
        setShowFsWarning(true)
        showToast('⚠️ Fullscreen mode exited. Please return to fullscreen.', 'error')
      }
    }

    document.addEventListener('fullscreenchange', handleFsChange)
    return () => {
      document.removeEventListener('fullscreenchange', handleFsChange)
      if (document.fullscreenElement && document.exitFullscreen) {
        document.exitFullscreen().catch(() => {})
      }
    }
  }, [completedAttempt, enterFullscreen, showToast])

  // ── Tab Switch & Focus Loss Listener ──────────────────────────────────────
  useEffect(() => {
    function handleVisibilityChange() {
      if (document.hidden && !completedAttempt) {
        const timestamp = new Date().toLocaleTimeString()
        setTabSwitchesCount((prev) => {
          const next = prev + 1
          setSuspiciousFlags((s) => [
            ...s,
            {
              timestamp,
              type: 'tab_switch',
              detail: `Browser tab switch or window minimized (Violation #${next})`,
            },
          ])

          if (next >= 4) {
            showToast(`Excessive tab switches (${next}/4). Submitting assessment automatically...`, 'error')
            handleFinalSubmit(true)
          } else {
            showToast(`⚠️ Warning ${next}/4: Do not switch tabs during the assessment!`, 'error')
          }
          return next
        })
      }
    }

    function handleWindowBlur() {
      if (!completedAttempt && !document.hidden) {
        const timestamp = new Date().toLocaleTimeString()
        setTabSwitchesCount((prev) => {
          const next = prev + 1
          setSuspiciousFlags((s) => [
            ...s,
            {
              timestamp,
              type: 'focus_loss',
              detail: `Window focus lost or candidate switched applications (Violation #${next})`,
            },
          ])
          showToast(`⚠️ Warning ${next}/4: Window focus lost. Please stay focused on the assessment.`, 'error')
          return next
        })
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('blur', handleWindowBlur)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('blur', handleWindowBlur)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [completedAttempt, showToast])

  // ── Anti-Cheat: Block Copy / Paste / Context Menu ─────────────────────────
  useEffect(() => {
    function preventCopy(e: ClipboardEvent) {
      if (!completedAttempt) {
        e.preventDefault()
        showToast('Clipboard actions (copy/cut/paste) are disabled during this assessment.', 'error')
      }
    }

    function preventContextMenu(e: MouseEvent) {
      if (!completedAttempt) {
        e.preventDefault()
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
  }, [completedAttempt, showToast])

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
  function handleSelectOption(optIdx: number) {
    if (!currentQ || completedAttempt) return
    setAnswers((prev) => ({
      ...prev,
      [currentQ.id]: optIdx,
    }))
  }

  function handleToggleReview() {
    if (!currentQ) return
    setMarkedForReview((prev) => ({
      ...prev,
      [currentQ.id]: !prev[currentQ.id],
    }))
  }

  // ── Submission Handler ────────────────────────────────────────────────────
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

      quiz.questions.forEach((q) => {
        const qPoints = q.points || 1
        maxScore += qPoints
        if (answers[q.id] === q.correctIndex) {
          score += qPoints
        }
      })

      const percentage = maxScore > 0 ? Math.round((score / maxScore) * 100) : 0
      const passed = percentage >= (quiz.passingPercentage || 60)

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
        answers,
        timeSpentSeconds,
        completedAt: new Date().toISOString(),
        suspiciousFlags,
        tabSwitchesCount,
        fullscreenViolationsCount,
        faceMissingCount,
        multipleFacesCount,
      }

      const attemptId = await submitQuizAttempt(attemptPayload)
      const fullAttempt: QuizAttempt = { id: attemptId, ...attemptPayload }

      setCompletedAttempt(fullAttempt)
      setShowConfirmModal(false)

      if (isAuto) {
        showToast('Assessment submitted automatically.', 'info')
      } else {
        showToast('Assessment submitted successfully!', 'success')
      }

      if (onCompleted) {
        onCompleted(fullAttempt)
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
  const answeredCount = Object.keys(answers).length
  const reviewCount = Object.values(markedForReview).filter(Boolean).length
  const unansweredCount = totalQuestions - answeredCount
  const totalViolations = suspiciousFlags.length

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '1rem',
        userSelect: 'none',
        paddingBottom: isMobile ? '5rem' : '1rem',
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
          {/* Proctoring Pill */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
              padding: '0.35rem 0.65rem',
              borderRadius: 8,
              background: totalViolations > 0 ? '#FEF2F2' : '#F0FDF4',
              border: `1px solid ${totalViolations > 0 ? '#FCA5A5' : '#86EFAC'}`,
              color: totalViolations > 0 ? '#DC2626' : '#15803D',
              fontSize: '0.75rem',
              fontWeight: 700,
            }}
            title={totalViolations > 0 ? `${totalViolations} integrity flag(s) detected` : 'Proctored Assessment Active'}
          >
            <Shield size={13} />
            <span>{totalViolations > 0 ? `${totalViolations} Flags` : 'Secure'}</span>
          </div>

          {/* Fullscreen Button */}
          {!isFullscreen && (
            <button
              onClick={enterFullscreen}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.3rem',
                background: '#EFF6FF',
                color: '#2563EB',
                border: '1px solid #BFDBFE',
                borderRadius: 8,
                padding: '0.35rem 0.65rem',
                fontSize: '0.75rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              <Maximize size={12} /> Fullscreen
            </button>
          )}

          {/* Timer Display */}
          <div
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
      </GlassCard>

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

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '0.8rem', color: T.txtSec, fontWeight: 600 }}>
                +{currentQ?.points || 1} pt
              </span>

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
              >
                <Bookmark size={13} fill={markedForReview[currentQ?.id] ? '#B45309' : 'none'} />
                {markedForReview[currentQ?.id] ? 'Marked' : 'Mark Review'}
              </button>
            </div>
          </div>

          {/* Question Text */}
          <div
            style={{
              fontSize: isMobile ? '1rem' : '1.1rem',
              fontWeight: 600,
              color: T.txtPri,
              lineHeight: 1.6,
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
              const isSelected = answers[currentQ.id] === optIdx

              return (
                <div
                  key={optIdx}
                  onClick={() => handleSelectOption(optIdx)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.85rem',
                    padding: isMobile ? '0.75rem 1rem' : '0.9rem 1.15rem',
                    borderRadius: 10,
                    border: isSelected ? '2px solid #2563EB' : '1px solid #E5E7EB',
                    background: isSelected ? '#EFF6FF' : '#ffffff',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    boxShadow: isSelected ? '0 2px 8px rgba(37, 99, 235, 0.12)' : 'none',
                    minHeight: 48,
                  }}
                >
                  <div
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 8,
                      background: isSelected ? '#2563EB' : '#F3F4F6',
                      color: isSelected ? '#ffffff' : T.txtSec,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 700,
                      fontSize: '0.85rem',
                      flexShrink: 0,
                    }}
                  >
                    {letter}
                  </div>

                  <span
                    style={{
                      fontSize: isMobile ? '0.9rem' : '0.95rem',
                      color: isSelected ? '#2563EB' : T.txtPri,
                      fontWeight: isSelected ? 600 : 400,
                      lineHeight: 1.45,
                    }}
                  >
                    {opt}
                  </span>
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
                paddingTop: '0.75rem',
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
                  gap: '0.35rem',
                  background: currentIdx === 0 ? '#F9FAFB' : '#F3F4F6',
                  color: currentIdx === 0 ? '#9CA3AF' : T.txtPri,
                  border: 'none',
                  borderRadius: 8,
                  padding: '0.55rem 1.1rem',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  cursor: currentIdx === 0 ? 'not-allowed' : 'pointer',
                }}
              >
                <ArrowLeft size={15} /> Previous
              </button>

              {currentIdx < totalQuestions - 1 ? (
                <button
                  onClick={() => setCurrentIdx((prev) => Math.min(totalQuestions - 1, prev + 1))}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                    background: T.primary,
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: 8,
                    padding: '0.55rem 1.25rem',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    boxShadow: '0 2px 8px rgba(0, 30, 64, 0.2)',
                  }}
                >
                  Next <ArrowRight size={15} />
                </button>
              ) : (
                <button
                  onClick={() => setShowConfirmModal(true)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                    background: '#059669',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: 8,
                    padding: '0.55rem 1.25rem',
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
            {/* Embedded AI Proctor Camera */}
            <QuizProctorCamera
              active={!completedAttempt}
              onFlag={(reason) => {
                const type = reason.includes('No face')
                  ? 'face_missing'
                  : reason.includes('Multiple people')
                  ? 'multiple_faces'
                  : reason.includes('Mobile phone')
                  ? 'cell_phone'
                  : 'other'

                if (type === 'face_missing') setFaceMissingCount((c) => c + 1)
                if (type === 'multiple_faces') setMultipleFacesCount((c) => c + 1)

                const timestamp = new Date().toLocaleTimeString()
                setSuspiciousFlags((prev) => [
                  ...prev,
                  {
                    timestamp,
                    type: type as any,
                    detail: reason,
                  },
                ])
                showToast(`⚠️ Proctor Flag: ${reason}`, 'error')
              }}
            />

            {/* Question Palette */}
            <GlassCard style={{ padding: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
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
                    }}
                  >
                    <X size={16} />
                  </button>
                )}
              </div>

              {/* Grid of 1..N */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '0.45rem', marginBottom: '1rem' }}>
                {quiz.questions.map((q, idx) => {
                  const isCurrent = idx === currentIdx
                  const isAnswered = answers[q.id] !== undefined
                  const isReview = markedForReview[q.id]

                  let bg = '#F3F4F6'
                  let color = T.txtPri
                  let border = '1px solid transparent'

                  if (isReview) {
                    bg = '#FEF3C7'
                    color = '#B45309'
                    border = '1px solid #FCD34D'
                  } else if (isAnswered) {
                    bg = '#DCFCE7'
                    color = '#15803D'
                    border = '1px solid #86EFAC'
                  }

                  if (isCurrent) {
                    border = `2px solid ${T.primary}`
                  }

                  return (
                    <button
                      key={q.id || idx}
                      onClick={() => {
                        setCurrentIdx(idx)
                        if (isMobile) setMobilePaletteOpen(false)
                      }}
                      style={{
                        height: 36,
                        borderRadius: 8,
                        background: bg,
                        color: color,
                        border: border,
                        fontWeight: 700,
                        fontSize: '0.82rem',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      {idx + 1}
                    </button>
                  )
                })}
              </div>

              {/* Legend */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', fontSize: '0.75rem', color: T.txtSec }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                  <span style={{ width: 10, height: 10, borderRadius: 2, background: '#DCFCE7', border: '1px solid #86EFAC' }} />
                  <span>Answered ({answeredCount})</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                  <span style={{ width: 10, height: 10, borderRadius: 2, background: '#FEF3C7', border: '1px solid #FCD34D' }} />
                  <span>Marked for Review ({reviewCount})</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                  <span style={{ width: 10, height: 10, borderRadius: 2, background: '#F3F4F6', border: '1px solid #E5E7EB' }} />
                  <span>Unanswered ({unansweredCount})</span>
                </div>
              </div>
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

      {/* Fullscreen Required Lockdown Modal */}
      {showFsWarning && !completedAttempt && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.85)',
            backdropFilter: 'blur(6px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
            padding: '1.5rem',
          }}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: 16,
              padding: '2rem',
              maxWidth: 460,
              width: '100%',
              textAlign: 'center',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
            }}
          >
            <div
              style={{
                width: 52,
                height: 52,
                borderRadius: '50%',
                background: '#FEF2F2',
                color: '#DC2626',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 1rem',
              }}
            >
              <AlertTriangle size={28} />
            </div>

            <h3 style={{ margin: '0 0 0.5rem', fontSize: '1.25rem', fontWeight: 800, color: T.txtPri }}>
              Assessment Lockdown Active
            </h3>

            <p style={{ margin: '0 0 1.25rem', fontSize: '0.88rem', color: T.txtSec, lineHeight: 1.5 }}>
              This proctored assessment requires full-screen mode at all times. Switching tabs or exiting full-screen has been recorded in your integrity log.
            </p>

            <button
              onClick={enterFullscreen}
              style={{
                width: '100%',
                background: T.primary,
                color: '#ffffff',
                border: 'none',
                borderRadius: 10,
                padding: '0.75rem 1rem',
                fontSize: '0.95rem',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.45rem',
              }}
            >
              <Maximize size={16} /> Return to Fullscreen
            </button>
          </div>
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
              {totalViolations > 0 && (
                <div style={{ color: '#B45309' }}>
                  • ⚠️ <strong>Proctoring Flags:</strong> {totalViolations} flags recorded
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
            setTabSwitchesCount(0)
            setFullscreenViolationsCount(0)
            setFaceMissingCount(0)
            setMultipleFacesCount(0)
            startTimeRef.current = Date.now()
          }}
        />
      )}
    </div>
  )
}
