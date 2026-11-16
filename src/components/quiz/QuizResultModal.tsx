import {
  CheckCircle2,
  XCircle,
  Award,
  RotateCcw,
  BookOpen,
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
  const isPassed = attempt.passed
  const totalQuestions = quiz.questions.length
  let correctCount = 0

  quiz.questions.forEach((q) => {
    if (attempt.answers[q.id] === q.correctIndex) {
      correctCount++
    }
  })

  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60)
    const remSecs = secs % 60
    return `${mins}m ${remSecs < 10 ? '0' : ''}${remSecs}s`
  }

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
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          overflow: 'hidden',
        }}
      >
        {/* Banner */}
        <div
          style={{
            padding: '1.5rem 1.75rem',
            background: isPassed
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
              <Award size={26} color="#ffffff" />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 800 }}>
                {isPassed ? 'Assessment Passed! 🎉' : 'Assessment Completed'}
              </h2>
              <p style={{ margin: '0.2rem 0 0', fontSize: '0.85rem', opacity: 0.9 }}>
                {quiz.title} • {quiz.category}
              </p>
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'baseline',
              gap: '0.3rem',
              background: 'rgba(255, 255, 255, 0.2)',
              padding: '0.45rem 1rem',
              borderRadius: 10,
            }}
          >
            <span style={{ fontSize: '1.75rem', fontWeight: 800 }}>
              {attempt.percentage}%
            </span>
            <span style={{ fontSize: '0.85rem', opacity: 0.9 }}>
              ({attempt.score} / {attempt.maxScore} pts)
            </span>
          </div>
        </div>

        {/* Content Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem 1.75rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Quick Metrics */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.85rem' }}>
            <div style={{ padding: '0.85rem', borderRadius: 10, background: '#F9FAFB', border: '1px solid #E5E7EB', textAlign: 'center' }}>
              <div style={{ fontSize: '0.78rem', color: T.txtSec, fontWeight: 600 }}>ACCURACY</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, color: isPassed ? '#059669' : '#DC2626', marginTop: '0.2rem' }}>
                {correctCount} / {totalQuestions} Correct
              </div>
            </div>

            <div style={{ padding: '0.85rem', borderRadius: 10, background: '#F9FAFB', border: '1px solid #E5E7EB', textAlign: 'center' }}>
              <div style={{ fontSize: '0.78rem', color: T.txtSec, fontWeight: 600 }}>TIME SPENT</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, color: T.txtPri, marginTop: '0.2rem' }}>
                {formatTime(attempt.timeSpentSeconds)}
              </div>
            </div>

            <div style={{ padding: '0.85rem', borderRadius: 10, background: '#F9FAFB', border: '1px solid #E5E7EB', textAlign: 'center' }}>
              <div style={{ fontSize: '0.78rem', color: T.txtSec, fontWeight: 600 }}>PASSING TARGET</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, color: T.txtPri, marginTop: '0.2rem' }}>
                {quiz.passingPercentage}% Required
              </div>
            </div>
          </div>

          {/* Detailed Question Review */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.75rem' }}>
              <BookOpen size={16} color={T.primary} />
              <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: T.txtPri }}>
                Detailed Question Review
              </h3>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              {quiz.questions.map((q, idx) => {
                const selectedOpt = attempt.answers[q.id]
                const isCorrect = selectedOpt === q.correctIndex
                const hasAnswered = selectedOpt !== undefined

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
                        const isThisSelected = optIdx === selectedOpt

                        let optBg = '#ffffff'
                        let optBorder = '#E5E7EB'
                        let optColor = T.txtPri

                        if (isThisCorrect) {
                          optBg = '#DCFCE7'
                          optBorder = '#86EFAC'
                          optColor = '#166534'
                        } else if (isThisSelected && !isThisCorrect) {
                          optBg = '#FEE2E2'
                          optBorder = '#FCA5A5'
                          optColor = '#991B1B'
                        }

                        return (
                          <div
                            key={optIdx}
                            style={{
                              padding: '0.4rem 0.65rem',
                              borderRadius: 6,
                              border: `1px solid ${optBorder}`,
                              background: optBg,
                              fontSize: '0.82rem',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.35rem',
                              color: optColor,
                            }}
                          >
                            <span style={{ fontWeight: 700 }}>{letter}.</span>
                            <span>{opt}</span>
                            {isThisCorrect && <span style={{ marginLeft: 'auto', fontSize: '0.72rem', fontWeight: 700 }}>✓ Correct</span>}
                            {isThisSelected && !isThisCorrect && <span style={{ marginLeft: 'auto', fontSize: '0.72rem', fontWeight: 700 }}>✗ Your Choice</span>}
                          </div>
                        )
                      })}
                    </div>

                    {!hasAnswered && (
                      <div style={{ fontSize: '0.78rem', color: '#D97706', fontWeight: 600, marginBottom: '0.45rem' }}>
                        ⚠️ Not answered
                      </div>
                    )}

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
        </div>

        {/* Footer actions */}
        <div
          style={{
            padding: '1rem 1.75rem',
            borderTop: '1px solid #E5E7EB',
            background: '#F9FAFB',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: '0.75rem',
          }}
        >
          {onRetake && (
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
              boxShadow: '0 2px 8px rgba(0, 30, 64, 0.25)',
            }}
          >
            Done & Return to Hub
          </button>
        </div>
      </div>
    </div>
  )
}
