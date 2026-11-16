import { useState, useEffect } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import {
  Award,
  BookOpen,
  CheckCircle2,
  Clock,
  HelpCircle,
  Lock,
  Play,
  RotateCcw,
  Search,
  Sparkles,
} from 'lucide-react'
import { T } from '../../theme'
import type { Quiz, QuizAttempt } from '../../types/quiz'
import {
  listQuizzes,
  getStudentQuizAttempts,
} from '../../services/quiz.service'
import { QuizPlayer } from './QuizPlayer'
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

interface StudentQuizHubProps {
  user: {
    uid: string
    email: string
    name?: string
    department?: string
  }
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void
  onActiveQuizChange?: (isActive: boolean) => void
}

export function StudentQuizHub({ user, showToast, onActiveQuizChange }: StudentQuizHubProps) {
  const [quizzes, setQuizzes] = useState<Quiz[]>([])
  const [attempts, setAttempts] = useState<QuizAttempt[]>([])
  const [loading, setLoading] = useState(true)

  // Active Quiz State
  const [activeQuiz, setActiveQuiz] = useState<Quiz | null>(null)
  const [reviewAttempt, setReviewAttempt] = useState<{
    quiz: Quiz
    attempt: QuizAttempt
  } | null>(null)

  useEffect(() => {
    onActiveQuizChange?.(!!activeQuiz)
  }, [activeQuiz, onActiveQuizChange])

  // Filters
  const [search, setSearch] = useState('')
  const [branchOnly, setBranchOnly] = useState(false)
  const [categoryFilter, setCategoryFilter] = useState('All')
  const [statusFilter, setStatusFilter] = useState<'All' | 'Pending' | 'Completed'>('All')

  async function loadData() {
    setLoading(true)
    try {
      const [allQuizzes, myAttempts] = await Promise.all([
        listQuizzes({ publishedOnly: true }),
        getStudentQuizAttempts(user.uid),
      ])
      setQuizzes(allQuizzes)
      setAttempts(myAttempts)
    } catch (err) {
      showToast(sanitizeErrorMessage(err, 'Failed to load quizzes.'), 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.uid])

  // Latest attempt lookup per quiz
  const latestAttemptMap = new Map<string, QuizAttempt>()
  attempts.forEach((att) => {
    if (!latestAttemptMap.has(att.quizId)) {
      latestAttemptMap.set(att.quizId, att)
    }
  })

  // Filtered quizzes
  const filtered = quizzes.filter((q) => {
    // Search
    if (search.trim()) {
      const s = search.toLowerCase()
      const matchTitle = q.title.toLowerCase().includes(s)
      const matchDesc = q.description.toLowerCase().includes(s)
      const matchCat = q.category.toLowerCase().includes(s)
      if (!matchTitle && !matchDesc && !matchCat) return false
    }

    // Branch filter
    if (branchOnly && user.department) {
      if (
        q.targetBranch !== 'all' &&
        q.targetBranch.toLowerCase() !== user.department.toLowerCase()
      ) {
        return false
      }
    }

    // Category
    if (categoryFilter !== 'All' && q.category !== categoryFilter) {
      return false
    }

    // Status
    const hasAttempted = latestAttemptMap.has(q.id)
    if (statusFilter === 'Completed' && !hasAttempted) return false
    if (statusFilter === 'Pending' && hasAttempted) return false

    return true
  })

  // Performance stats
  const completedCount = latestAttemptMap.size
  let totalScoreSum = 0
  latestAttemptMap.forEach((att) => {
    totalScoreSum += att.percentage
  })
  const avgPercentage = completedCount > 0 ? Math.round(totalScoreSum / completedCount) : 0

  if (activeQuiz) {
    return (
      <QuizPlayer
        quiz={activeQuiz}
        user={user}
        onBack={() => {
          setActiveQuiz(null)
          loadData()
        }}
        onCompleted={() => {
          loadData()
        }}
        showToast={showToast}
      />
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Top Banner */}
      <div
        className="dark-theme-banner"
        style={{
          background: 'linear-gradient(135deg, #0A192F 0%, #0F2D59 50%, #1E3A8A 100%)',
          color: '#ffffff',
          borderRadius: 16,
          padding: '1.85rem 2rem',
          boxShadow: '0 10px 30px -5px rgba(10, 25, 47, 0.35)',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Subtle background glow effect */}
        <div
          style={{
            position: 'absolute',
            top: -40,
            right: -40,
            width: 220,
            height: 220,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(56, 189, 248, 0.22) 0%, rgba(56, 189, 248, 0) 70%)',
            pointerEvents: 'none',
          }}
        />

        <div
          style={{
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '1.5rem',
          }}
        >
          <div style={{ flex: '1 1 360px' }}>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.45rem',
                background: 'rgba(250, 204, 21, 0.15)',
                border: '1px solid rgba(250, 204, 21, 0.35)',
                borderRadius: 9999,
                padding: '0.25rem 0.75rem',
                marginBottom: '0.65rem',
              }}
            >
              <Sparkles size={14} color="#FDE047" />
              <span
                style={{
                  fontSize: '0.75rem',
                  fontWeight: 800,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color: '#FEF08A',
                }}
              >
                Assessment Center
              </span>
            </div>

            <h2
              style={{
                margin: 0,
                fontSize: '1.65rem',
                fontWeight: 800,
                color: '#FFFFFF',
                letterSpacing: '-0.02em',
                lineHeight: 1.25,
              }}
            >
              Campus Placement Quizzes & Practice Tests
            </h2>

            <p
              style={{
                margin: '0.45rem 0 0',
                fontSize: '0.92rem',
                color: 'rgba(241, 245, 249, 0.88)',
                maxWidth: 640,
                lineHeight: 1.55,
              }}
            >
              Benchmark your technical depth, domain knowledge, and aptitude with timed tests curated by department faculty and campus recruiters.
            </p>
          </div>

          {/* Stats Cockpit */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '1.5rem',
              background: 'rgba(255, 255, 255, 0.08)',
              border: '1px solid rgba(255, 255, 255, 0.16)',
              backdropFilter: 'blur(16px)',
              WebkitBackdropFilter: 'blur(16px)',
              padding: '0.9rem 1.4rem',
              borderRadius: 14,
              boxShadow: '0 4px 20px rgba(0, 0, 0, 0.2)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 10,
                  background: 'rgba(56, 189, 248, 0.2)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#38BDF8',
                }}
              >
                <CheckCircle2 size={20} />
              </div>
              <div>
                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#FFFFFF', lineHeight: 1.1 }}>
                  {completedCount}
                </div>
                <div
                  style={{
                    fontSize: '0.72rem',
                    fontWeight: 600,
                    color: 'rgba(255, 255, 255, 0.75)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                  }}
                >
                  Completed
                </div>
              </div>
            </div>

            <div style={{ width: 1, height: 36, background: 'rgba(255, 255, 255, 0.18)' }} />

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 10,
                  background: 'rgba(74, 222, 128, 0.2)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#4ADE80',
                }}
              >
                <Award size={20} />
              </div>
              <div>
                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#FFFFFF', lineHeight: 1.1 }}>
                  {avgPercentage}%
                </div>
                <div
                  style={{
                    fontSize: '0.72rem',
                    fontWeight: 600,
                    color: 'rgba(255, 255, 255, 0.75)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                  }}
                >
                  Avg Score
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <GlassCard style={{ padding: '0.85rem 1.25rem' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '0.75rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1, minWidth: 220 }}>
            <Search size={16} color={T.txtSec} />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search quizzes by title, subject, or domain..."
              style={{
                width: '100%',
                border: 'none',
                outline: 'none',
                fontSize: '0.9rem',
                color: T.txtPri,
                background: 'transparent',
              }}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
            <button
              onClick={() => setBranchOnly((prev) => !prev)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem',
                background: branchOnly ? '#EFF6FF' : '#F3F4F6',
                color: branchOnly ? '#2563EB' : T.txtSec,
                border: branchOnly ? '1px solid #2563EB' : '1px solid #D1D5DB',
                borderRadius: 8,
                padding: '0.4rem 0.75rem',
                fontSize: '0.82rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              🏛️ My Department Only
            </button>

            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              style={{
                padding: '0.4rem 0.65rem',
                borderRadius: 8,
                border: '1px solid #D1D5DB',
                fontSize: '0.82rem',
                background: '#ffffff',
                color: T.txtPri,
              }}
            >
              <option value="All">All Categories</option>
              <option value="Technical">Technical</option>
              <option value="Aptitude">Aptitude</option>
              <option value="Core Engineering">Core Engineering</option>
              <option value="Verbal & Soft Skills">Verbal & Soft Skills</option>
              <option value="Company Specific">Company Specific</option>
            </select>

            <div style={{ display: 'flex', gap: '0.2rem', background: '#F3F4F6', padding: '0.2rem', borderRadius: 6 }}>
              {(['All', 'Pending', 'Completed'] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  style={{
                    background: statusFilter === s ? '#ffffff' : 'transparent',
                    color: statusFilter === s ? T.primary : T.txtSec,
                    border: 'none',
                    borderRadius: 4,
                    padding: '0.3rem 0.65rem',
                    fontSize: '0.78rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    boxShadow: statusFilter === s ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>
      </GlassCard>

      {/* Quizzes Grid */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '3.5rem 0', color: T.txtSec, fontSize: '0.9rem' }}>
          Loading available assessments...
        </div>
      ) : filtered.length === 0 ? (
        <GlassCard style={{ textAlign: 'center', padding: '3.5rem 1rem' }}>
          <HelpCircle size={36} color={T.txtSec} style={{ margin: '0 auto 0.75rem', opacity: 0.6 }} />
          <h3 style={{ margin: '0 0 0.4rem', fontSize: '1.05rem', fontWeight: 700, color: T.txtPri }}>
            No Assessments Found
          </h3>
          <p style={{ margin: 0, fontSize: '0.85rem', color: T.txtSec }}>
            {quizzes.length === 0
              ? 'No quizzes have been published by the administration yet. Check back soon!'
              : 'No quizzes match your current search and department filters.'}
          </p>
        </GlassCard>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
            gap: '1.25rem',
          }}
        >
          {filtered.map((q) => {
            const attempt = latestAttemptMap.get(q.id)
            const branchLabel = q.targetBranch === 'all' || !q.targetBranch ? 'All Branches' : q.targetBranch

            return (
              <GlassCard
                key={q.id}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  gap: '1rem',
                  padding: '1.35rem',
                  transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', marginBottom: '0.75rem' }}>
                    <span
                      style={{
                        background: '#EEF2FF',
                        color: '#4F46E5',
                        padding: '0.2rem 0.6rem',
                        borderRadius: 6,
                        fontSize: '0.75rem',
                        fontWeight: 700,
                      }}
                    >
                      {q.category}
                    </span>

                    <span
                      style={{
                        background: '#F3F4F6',
                        color: T.txtSec,
                        padding: '0.2rem 0.55rem',
                        borderRadius: 6,
                        fontSize: '0.75rem',
                        fontWeight: 600,
                      }}
                    >
                      🏛️ {branchLabel}
                    </span>
                  </div>

                  <h3 style={{ margin: '0 0 0.4rem', fontSize: '1.1rem', fontWeight: 700, color: T.txtPri }}>
                    {q.title}
                  </h3>

                  {q.description && (
                    <p
                      style={{
                        margin: '0 0 0.85rem',
                        fontSize: '0.82rem',
                        color: T.txtSec,
                        lineHeight: 1.45,
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                      }}
                    >
                      {q.description}
                    </p>
                  )}

                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', fontSize: '0.78rem', color: T.txtSec }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                      <BookOpen size={13} /> {q.questions?.length || 0} Questions
                    </span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                      <Clock size={13} /> {q.timeLimitMinutes} Mins
                    </span>
                    <span>📊 {q.difficulty}</span>
                  </div>
                </div>

                {/* Bottom Actions & Status */}
                <div
                  style={{
                    paddingTop: '0.85rem',
                    borderTop: '1px solid #F3F4F6',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '0.5rem',
                  }}
                >
                  {attempt ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                      <span
                        style={{
                          padding: '0.25rem 0.55rem',
                          borderRadius: 6,
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          background: attempt.passed ? '#ECFDF5' : '#FEE2E2',
                          color: attempt.passed ? '#059669' : '#DC2626',
                        }}
                      >
                        {attempt.passed ? '✓ Passed' : q.allowRetake === false ? 'Completed' : 'Retake Needed'} ({attempt.percentage}%)
                      </span>
                      <button
                        onClick={() => setReviewAttempt({ quiz: q, attempt })}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: '#2563EB',
                          fontSize: '0.78rem',
                          fontWeight: 600,
                          cursor: 'pointer',
                          padding: '0.2rem 0.4rem',
                        }}
                      >
                        Review
                      </button>
                    </div>
                  ) : (
                    <span style={{ fontSize: '0.78rem', color: T.txtSec, fontStyle: 'italic' }}>
                      Not attempted yet
                    </span>
                  )}

                  {attempt && q.allowRetake === false ? (
                    <button
                      onClick={() => setReviewAttempt({ quiz: q, attempt })}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.35rem',
                        background: '#F3F4F6',
                        color: T.txtSec,
                        border: '1px solid #E5E7EB',
                        borderRadius: 8,
                        padding: '0.5rem 0.85rem',
                        fontSize: '0.82rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                      title="Retakes disabled by admin for this assessment"
                    >
                      <Lock size={12} color={T.txtSec} /> View Result
                    </button>
                  ) : (
                    <button
                      onClick={() => setActiveQuiz(q)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.35rem',
                        background: attempt ? '#F3F4F6' : T.primary,
                        color: attempt ? T.txtPri : '#ffffff',
                        border: attempt ? '1px solid #D1D5DB' : 'none',
                        borderRadius: 8,
                        padding: '0.5rem 1rem',
                        fontSize: '0.82rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        boxShadow: attempt ? 'none' : '0 2px 6px rgba(0, 30, 64, 0.2)',
                      }}
                    >
                      {attempt ? (
                        <>
                          <RotateCcw size={13} /> Retake
                        </>
                      ) : (
                        <>
                          <Play size={13} fill="#ffffff" /> Start Quiz
                        </>
                      )}
                    </button>
                  )}
                </div>
              </GlassCard>
            )
          })}
        </div>
      )}

      {/* Review Modal */}
      {reviewAttempt && (
        <QuizResultModal
          quiz={reviewAttempt.quiz}
          attempt={reviewAttempt.attempt}
          onClose={() => setReviewAttempt(null)}
          onRetake={() => {
            const q = reviewAttempt.quiz
            setReviewAttempt(null)
            setActiveQuiz(q)
          }}
        />
      )}
    </div>
  )
}
