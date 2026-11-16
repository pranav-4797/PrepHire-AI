import { useState, useEffect, useRef } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import {
  Clock,
  ArrowLeft,
  ArrowRight,
  Bookmark,
  AlertTriangle,
  Send,
} from 'lucide-react'
import { T } from '../../theme'
import type { Quiz, QuizAttempt } from '../../types/quiz'
import { submitQuizAttempt } from '../../services/quiz.service'
import { QuizResultModal } from './QuizResultModal'
import { sanitizeErrorMessage } from '../../utils/errorSanitizer'

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
  }
  onBack: () => void
  onCompleted?: (attempt: QuizAttempt) => void
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void
}

export function QuizPlayer({
  quiz,
  user,
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
  const [, setTabSwitchWarnings] = useState(0)

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const startTimeRef = useRef<number>(Date.now())

  const totalQuestions = quiz.questions.length
  const currentQ = quiz.questions[currentIdx]

  // ── Tab Switch Listener (Simulated Proctoring) ────────────────────────────
  useEffect(() => {
    function handleVisibilityChange() {
      if (document.hidden && !completedAttempt) {
        setTabSwitchWarnings((prev) => {
          const next = prev + 1
          showToast(`Warning ${next}: Please do not switch tabs during the assessment.`, 'error')
          return next
        })
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
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
        score,
        maxScore,
        percentage,
        passed,
        answers,
        timeSpentSeconds,
        completedAt: new Date().toISOString(),
      }

      const attemptId = await submitQuizAttempt(attemptPayload)
      const fullAttempt: QuizAttempt = { id: attemptId, ...attemptPayload }

      setCompletedAttempt(fullAttempt)
      setShowConfirmModal(false)

      if (isAuto) {
        showToast('Time expired! Your assessment was submitted automatically.', 'info')
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Top Cockpit Header */}
      <GlassCard
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '1rem',
          padding: '1rem 1.5rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
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
            }}
          >
            <ArrowLeft size={15} /> Exit
          </button>

          <div>
            <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700, color: T.txtPri }}>
              {quiz.title}
            </h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginTop: '0.2rem', fontSize: '0.78rem', color: T.txtSec }}>
              <span>{quiz.category}</span>
              <span>•</span>
              <span>{quiz.difficulty}</span>
              <span>•</span>
              <span>Target: {quiz.passingPercentage}%</span>
            </div>
          </div>
        </div>

        {/* Live Timer & Submit Pill */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.45rem',
              padding: '0.45rem 0.95rem',
              borderRadius: 10,
              background: isUrgent ? '#FEE2E2' : '#EFF6FF',
              color: isUrgent ? '#DC2626' : '#2563EB',
              border: isUrgent ? '1.5px solid #FCA5A5' : '1px solid #BFDBFE',
              fontWeight: 700,
              fontSize: '1.1rem',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            <Clock size={18} />
            <span>
              {mins < 10 ? '0' : ''}
              {mins}:{secs < 10 ? '0' : ''}
              {secs}
            </span>
          </div>

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
        </div>
      </GlassCard>

      {/* Main Grid: Question Card on Left, Palette on Right */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr) 300px',
          gap: '1.25rem',
          alignItems: 'start',
        }}
      >
        {/* Left: Active Question */}
        <GlassCard style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Question Stepper Indicator */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
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
                }}
              >
                <Bookmark size={13} fill={markedForReview[currentQ?.id] ? '#B45309' : 'none'} />
                {markedForReview[currentQ?.id] ? 'Marked for Review' : 'Mark Review'}
              </button>
            </div>
          </div>

          {/* Question Text */}
          <div style={{ fontSize: '1.1rem', fontWeight: 600, color: T.txtPri, lineHeight: 1.6 }}>
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
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
                    padding: '0.9rem 1.15rem',
                    borderRadius: 10,
                    border: isSelected ? '2px solid #2563EB' : '1px solid #E5E7EB',
                    background: isSelected ? '#EFF6FF' : '#ffffff',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    boxShadow: isSelected ? '0 2px 8px rgba(37, 99, 235, 0.12)' : 'none',
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
                      fontSize: '0.95rem',
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

          {/* Navigation Controls */}
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
        </GlassCard>

        {/* Right: Question Palette & Status */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <GlassCard style={{ padding: '1.25rem' }}>
            <h4 style={{ margin: '0 0 0.85rem', fontSize: '0.95rem', fontWeight: 700, color: T.txtPri }}>
              Question Palette
            </h4>

            {/* Grid of 1..N */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '0.5rem', marginBottom: '1.25rem' }}>
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
                    onClick={() => setCurrentIdx(idx)}
                    style={{
                      height: 38,
                      borderRadius: 8,
                      background: bg,
                      color: color,
                      border: border,
                      fontWeight: 700,
                      fontSize: '0.85rem',
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.78rem', color: T.txtSec }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ width: 12, height: 12, borderRadius: 3, background: '#DCFCE7', border: '1px solid #86EFAC' }} />
                <span>Answered ({answeredCount})</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ width: 12, height: 12, borderRadius: 3, background: '#FEF3C7', border: '1px solid #FCD34D' }} />
                <span>Marked for Review ({reviewCount})</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ width: 12, height: 12, borderRadius: 3, background: '#F3F4F6', border: '1px solid #E5E7EB' }} />
                <span>Unanswered ({unansweredCount})</span>
              </div>
            </div>
          </GlassCard>

          {/* Quick Submit Card */}
          <GlassCard style={{ padding: '1.25rem', textAlign: 'center' }}>
            <div style={{ fontSize: '0.85rem', fontWeight: 600, color: T.txtPri, marginBottom: '0.35rem' }}>
              Ready to Finish?
            </div>
            <p style={{ margin: '0 0 1rem', fontSize: '0.78rem', color: T.txtSec }}>
              You have answered {answeredCount} of {totalQuestions} questions.
            </p>
            <button
              onClick={() => setShowConfirmModal(true)}
              style={{
                width: '100%',
                background: T.primary,
                color: '#ffffff',
                border: 'none',
                borderRadius: 8,
                padding: '0.6rem 1rem',
                fontSize: '0.85rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Submit Assessment
            </button>
          </GlassCard>
        </div>
      </div>

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
            startTimeRef.current = Date.now()
          }}
        />
      )}
    </div>
  )
}
