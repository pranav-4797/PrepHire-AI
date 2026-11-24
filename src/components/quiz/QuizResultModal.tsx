import {
  CheckCircle2,
  XCircle,
  Award,
  RotateCcw,
  BookOpen,
  Lock,
  Clock,
  ShieldCheck,
} from 'lucide-react'
import { T } from '../../theme'
import type { Quiz, QuizAttempt } from '../../types/quiz'

interface QuizResultModalProps {
  quiz: Quiz
  attempt: QuizAttempt
  onClose: () => void
  onRetake?: () => void
}

export function QuizResultModal({
  quiz,
  attempt,
  onClose,
  onRetake,
}: QuizResultModalProps) {
  const resultsDeclared = quiz.resultsDeclared === true
  const isPassed = attempt.passed
  const totalQuestions = quiz.questions.length
  let correctCount = 0

  quiz.questions.forEach((q, idx) => {
    const ans = attempt.answers?.[q.id] ?? attempt.answers?.[`q-${idx}`] ?? attempt.answers?.[String(idx)] ?? attempt.answers?.[idx]
    if (ans === q.correctIndex) {
      correctCount++
    }
  })

  const answeredCount = Object.keys(attempt.answers || {}).length

  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60)
    const remSecs = secs % 60
    return `${mins}m ${remSecs < 10 ? '0' : ''}${remSecs}s`
  }

  const retakeAllowed = quiz.allowRetake !== false

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.5)',
        backdropFilter: 'blur(4px)',
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
          borderRadius: 16,
          maxWidth: 780,
          width: '100%',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '8px 8px 0 #001e40',
          overflow: 'hidden',
        }}
      >
        {/* Banner */}
        <div
          style={{
            padding: '1.5rem 1.75rem',
            background: !resultsDeclared
              ? 'linear-gradient(135deg, #1E3A8A, #2563EB)'
              : isPassed
              ? 'linear-gradient(135deg, #059669, #10B981)'
              : 'linear-gradient(135deg, #DC2626, #EF4444)',
            color: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '1rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: 12,
                background: 'rgba(255, 255, 255, 0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {!resultsDeclared ? (
                <ShieldCheck size={26} color="#ffffff" />
              ) : (
                <Award size={26} color="#ffffff" />
              )}
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 800 }}>
                {!resultsDeclared
                  ? 'Assessment Submitted! 🎉'
                  : isPassed
                  ? 'Assessment Passed! 🎉'
                  : 'Assessment Completed'}
              </h2>
              <p style={{ margin: '0.2rem 0 0', fontSize: '0.85rem', opacity: 0.9 }}>
                {quiz.title} • {quiz.category}
              </p>
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-end',
              background: 'rgba(255, 255, 255, 0.2)',
              padding: '0.45rem 1rem',
              borderRadius: 10,
            }}
          >
            {resultsDeclared ? (
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.3rem' }}>
                <span style={{ fontSize: '1.75rem', fontWeight: 800 }}>
                  {attempt.percentage}%
                </span>
                <span style={{ fontSize: '0.85rem', opacity: 0.9 }}>
                  ({attempt.score} / {attempt.maxScore} pts)
                </span>
              </div>
            ) : (
              <div style={{ textAlign: 'right' }}>
                <span style={{ fontSize: '0.92rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  ⏳ Results Pending
                </span>
                <div style={{ fontSize: '0.72rem', opacity: 0.9 }}>
                  Responses Registered
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Content Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem 1.75rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Quick Metrics */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.85rem' }}>
            <div style={{ padding: '0.85rem', borderRadius: 10, background: '#F9FAFB', border: '1px solid #E5E7EB', textAlign: 'center' }}>
              <div style={{ fontSize: '0.78rem', color: T.txtSec, fontWeight: 600 }}>
                {resultsDeclared ? 'ACCURACY' : 'QUESTIONS ANSWERED'}
              </div>
              <div
                style={{
                  fontSize: '1.25rem',
                  fontWeight: 700,
                  color: resultsDeclared ? (isPassed ? '#059669' : '#DC2626') : '#2563EB',
                  marginTop: '0.2rem',
                }}
              >
                {resultsDeclared
                  ? `${correctCount} / ${totalQuestions} Correct`
                  : `${answeredCount} / ${totalQuestions} Attempted`}
              </div>
            </div>

            <div style={{ padding: '0.85rem', borderRadius: 10, background: '#F9FAFB', border: '1px solid #E5E7EB', textAlign: 'center' }}>
              <div style={{ fontSize: '0.78rem', color: T.txtSec, fontWeight: 600 }}>TIME SPENT</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, color: T.txtPri, marginTop: '0.2rem' }}>
                {formatTime(attempt.timeSpentSeconds)}
              </div>
            </div>

            <div style={{ padding: '0.85rem', borderRadius: 10, background: '#F9FAFB', border: '1px solid #E5E7EB', textAlign: 'center' }}>
              <div style={{ fontSize: '0.78rem', color: T.txtSec, fontWeight: 600 }}>
                {resultsDeclared ? 'PASSING TARGET' : 'PROCTORING STATUS'}
              </div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, color: resultsDeclared ? T.txtPri : '#059669', marginTop: '0.2rem' }}>
                {resultsDeclared ? `${quiz.passingPercentage}% Required` : 'Verified & Synced'}
              </div>
            </div>
          </div>

          {/* Conditional View: When results are withheld, hide answers & question review */}
          {!resultsDeclared ? (
            <div
              style={{
                background: '#F0F9FF',
                border: '1px solid #BAE6FD',
                borderRadius: 12,
                padding: '1.5rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.85rem',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Lock size={20} color="#0284C7" />
                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: '#0369A1' }}>
                  Results Awaiting Institutional Declaration
                </h3>
              </div>

              <p style={{ margin: 0, fontSize: '0.88rem', color: '#0C4A6E', lineHeight: 1.6 }}>
                Your assessment responses, telemetry, and forensic verification logs have been successfully submitted to the department examination cell.
              </p>

              <div
                style={{
                  background: '#ffffff',
                  border: '1px solid #E0F2FE',
                  borderRadius: 8,
                  padding: '0.85rem 1rem',
                  fontSize: '0.82rem',
                  color: '#0369A1',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.6rem',
                }}
              >
                <Clock size={16} color="#0284C7" style={{ flexShrink: 0 }} />
                <span>
                  <strong>Why aren't answers shown yet?</strong> To preserve academic integrity while other students complete the assessment, correct answers and detailed scores are withheld. Once the administrator declares results, your score and detailed answer review will be accessible on your dashboard.
                </span>
              </div>
            </div>
          ) : (
            /* Detailed Question Review (Shown ONLY when resultsDeclared is true) */
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.75rem' }}>
                <BookOpen size={16} color={T.primary} />
                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: T.txtPri }}>
                  Detailed Question Review
                </h3>
              </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              {quiz.questions.map((q, idx) => {
                const selectedOpt = attempt.answers?.[q.id] ?? attempt.answers?.[`q-${idx}`] ?? attempt.answers?.[String(idx)] ?? attempt.answers?.[idx]
                const hasAnswered = selectedOpt !== undefined && selectedOpt !== null
                const isCorrect = hasAnswered && selectedOpt === q.correctIndex

                return (
                  <div
                    key={q.id || idx}
                    style={{
                      borderRadius: 10,
                      border: `1px solid ${isCorrect ? '#A7F3D0' : '#FECACA'}`,
                      background: isCorrect ? '#F0FDF4' : '#FEF2F2',
                      padding: '1rem',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.75rem', marginBottom: '0.5rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        {isCorrect ? (
                          <CheckCircle2 size={18} color="#059669" />
                        ) : (
                          <XCircle size={18} color="#DC2626" />
                        )}
                        <span style={{ fontWeight: 700, fontSize: '0.9rem', color: isCorrect ? '#065F46' : '#991B1B' }}>
                          Question {idx + 1}
                        </span>
                      </div>
                      <span
                        style={{
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          padding: '0.15rem 0.5rem',
                          borderRadius: 6,
                          background: isCorrect ? '#D1FAE5' : '#FEE2E2',
                          color: isCorrect ? '#065F46' : '#991B1B',
                        }}
                      >
                        {isCorrect ? `+${q.points} pts` : '0 pts'}
                      </span>
                    </div>

                    <p style={{ margin: '0 0 0.65rem', fontSize: '0.9rem', fontWeight: 600, color: T.txtPri, lineHeight: 1.45 }}>
                      {q.question}
                    </p>

                    {q.codeSnippet && (
                      <pre
                        style={{
                          margin: '0 0 0.65rem',
                          padding: '0.6rem 0.85rem',
                          borderRadius: 6,
                          background: '#1F2937',
                          color: '#F9FAFB',
                          fontSize: '0.8rem',
                          fontFamily: 'Consolas, Monaco, "Courier New", monospace',
                          overflowX: 'auto',
                        }}
                      >
                        <code>{q.codeSnippet}</code>
                      </pre>
                    )}

                    {/* Options list */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.45rem', marginBottom: '0.65rem' }}>
                      {q.options.map((opt, optIdx) => {
                        const letter = String.fromCharCode(65 + optIdx)
                        const isThisCorrect = optIdx === q.correctIndex
                        const isThisSelected = hasAnswered && optIdx === selectedOpt

                        let optBg = '#ffffff'
                        let optBorder = '1px solid #E5E7EB'
                        let optColor = T.txtPri

                        if (isThisCorrect && isThisSelected) {
                          // Correct & Chosen by candidate
                          optBg = '#DCFCE7'
                          optBorder = '2px solid #059669'
                          optColor = '#065F46'
                        } else if (isThisSelected && !isThisCorrect) {
                          // Incorrect choice by candidate -> Bold Red
                          optBg = '#FEE2E2'
                          optBorder = '2px solid #DC2626'
                          optColor = '#991B1B'
                        } else if (isThisCorrect) {
                          // Correct Answer that candidate missed
                          optBg = '#F0FDF4'
                          optBorder = '1.5px dashed #059669'
                          optColor = '#047857'
                        }

                        return (
                          <div
                            key={optIdx}
                            style={{
                              padding: '0.45rem 0.75rem',
                              borderRadius: 8,
                              border: optBorder,
                              background: optBg,
                              fontSize: '0.83rem',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.4rem',
                              color: optColor,
                              fontWeight: isThisSelected || isThisCorrect ? 600 : 400,
                              boxShadow: isThisSelected ? '0 1px 4px rgba(0,0,0,0.06)' : 'none',
                            }}
                          >
                            <span style={{ fontWeight: 700 }}>{letter}.</span>
                            <span style={{ flex: 1 }}>{opt}</span>

                            {isThisCorrect && isThisSelected && (
                              <span
                                style={{
                                  fontSize: '0.72rem',
                                  fontWeight: 700,
                                  background: '#059669',
                                  color: '#ffffff',
                                  padding: '0.15rem 0.45rem',
                                  borderRadius: 4,
                                }}
                              >
                                ✓ Correct
                              </span>
                            )}

                            {isThisSelected && !isThisCorrect && (
                              <span
                                style={{
                                  fontSize: '0.72rem',
                                  fontWeight: 700,
                                  background: '#DC2626',
                                  color: '#ffffff',
                                  padding: '0.15rem 0.45rem',
                                  borderRadius: 4,
                                }}
                              >
                                ✗ Your Choice
                              </span>
                            )}

                            {isThisCorrect && !isThisSelected && (
                              <span
                                style={{
                                  fontSize: '0.72rem',
                                  fontWeight: 700,
                                  background: '#D1FAE5',
                                  color: '#065F46',
                                  padding: '0.15rem 0.45rem',
                                  borderRadius: 4,
                                }}
                              >
                                ✓ Correct Answer
                              </span>
                            )}
                          </div>
                        )
                      })}
                    </div>

                    {/* Candidate Choice & Correct Answer Summary Pill */}
                    <div
                      style={{
                        padding: '0.45rem 0.75rem',
                        borderRadius: 6,
                        fontSize: '0.8rem',
                        fontWeight: 600,
                        marginBottom: '0.45rem',
                        background: isCorrect ? '#ECFDF5' : hasAnswered ? '#FEF2F2' : '#FFFBEB',
                        color: isCorrect ? '#065F46' : hasAnswered ? '#991B1B' : '#B45309',
                        border: `1px solid ${isCorrect ? '#A7F3D0' : hasAnswered ? '#FCA5A5' : '#FDE68A'}`,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.4rem',
                      }}
                    >
                      {(() => {
                        const correctLabel =
                          typeof q.correctIndex === 'number' && q.options[q.correctIndex]
                            ? `Option ${String.fromCharCode(65 + q.correctIndex)} (${q.options[q.correctIndex]})`
                            : 'Recorded securely'
                        return isCorrect ? (
                          <>
                            <CheckCircle2 size={14} /> You answered correctly: Option {String.fromCharCode(65 + (selectedOpt as number))} ({q.options[selectedOpt as number]})
                          </>
                        ) : hasAnswered ? (
                          <>
                            <XCircle size={14} /> You chose: Option {String.fromCharCode(65 + (selectedOpt as number))} ({q.options[selectedOpt as number]}) — Correct was: {correctLabel}
                          </>
                        ) : (
                          <>
                            <span>⚠️ Not answered — Correct was: {correctLabel}</span>
                          </>
                        )
                      })()}
                    </div>

                    {/* Explanation */}
                    {q.explanation && (
                      <div
                        style={{
                          background: 'rgba(255, 255, 255, 0.7)',
                          borderLeft: `3px solid ${T.primary}`,
                          padding: '0.45rem 0.75rem',
                          borderRadius: '0 6px 6px 0',
                          fontSize: '0.8rem',
                          color: T.txtSec,
                          lineHeight: 1.4,
                        }}
                      >
                        <strong style={{ color: T.txtPri }}>Explanation:</strong> {q.explanation}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
          )}
        </div>

        {/* Footer actions */}
        <div
          style={{
            padding: '1rem 1.75rem',
            borderTop: '1px solid #E5E7EB',
            background: '#F9FAFB',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '0.75rem',
          }}
        >
          <div>
            {!retakeAllowed && (
              <span
                style={{
                  fontSize: '0.78rem',
                  color: '#64748B',
                  background: '#F1F5F9',
                  border: '1px solid #E2E8F0',
                  padding: '0.3rem 0.6rem',
                  borderRadius: 6,
                  fontWeight: 600,
                }}
              >
                🔒 Retakes disabled by institutional setting
              </span>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            {onRetake && retakeAllowed && (
              <button
                onClick={onRetake}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  background: '#ffffff',
                  border: '1px solid #D1D5DB',
                  borderRadius: 8,
                  padding: '0.55rem 1rem',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  color: T.txtPri,
                  cursor: 'pointer',
                }}
              >
                <RotateCcw size={15} /> Retake Assessment
              </button>
            )}

            <button
              onClick={onClose}
              style={{
                background: T.primary,
                color: '#ffffff',
                border: 'none',
                borderRadius: 8,
                padding: '0.55rem 1.25rem',
                fontSize: '0.85rem',
                fontWeight: 600,
                cursor: 'pointer',
                boxShadow: '3px 3px 0 #001e40',
              }}
            >
              Done & Return to Hub
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
