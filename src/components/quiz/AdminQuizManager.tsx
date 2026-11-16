import { useState, useEffect, useRef } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import {
  Plus,
  Pencil,
  Trash2,
  CheckCircle2,
  HelpCircle,
  Search,
  Filter,
  Users,
  Archive,
  UploadCloud,
  Share2,
  ShieldCheck,
  ShieldAlert,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  Camera,
  AlertTriangle,
  Smartphone,
  Mic,
  X,
  Folder,
  ExternalLink,
} from 'lucide-react'
import { T } from '../../theme'
import { BRANCHES } from '../../constants/branches'
import type { Quiz, QuizAttempt, QuizQuestion } from '../../types/quiz'
import {
  listQuizzes,
  deleteQuiz,
  updateQuiz,
  getQuizAttempts,
  deleteQuizAttempt,
} from '../../services/quiz.service'
import { AdminQuizEditor } from './AdminQuizEditor'
import { sanitizeErrorMessage } from '../../utils/errorSanitizer'
import { parseQuizDocument } from '../../utils/quizDocParser'

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

interface AdminQuizManagerProps {
  userEmail?: string
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void
}

export function AdminQuizManager({ userEmail, showToast }: AdminQuizManagerProps) {
  const [quizzes, setQuizzes] = useState<Quiz[]>([])
  const [loading, setLoading] = useState(true)
  const [mode, setMode] = useState<'list' | 'create' | 'edit'>('list')
  const [editingQuiz, setEditingQuiz] = useState<Quiz | null>(null)
  const [importedQuestions, setImportedQuestions] = useState<QuizQuestion[] | undefined>(undefined)
  const [importedTitle, setImportedTitle] = useState<string | undefined>(undefined)
  const [importingDoc, setImportingDoc] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Filters
  const [search, setSearch] = useState('')
  const [branchFilter, setBranchFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState<'all' | 'published' | 'draft'>('all')

  // Attempt Inspection Modal
  const [viewingAttemptsQuiz, setViewingAttemptsQuiz] = useState<Quiz | null>(null)
  const [attempts, setAttempts] = useState<QuizAttempt[]>([])
  const [loadingAttempts, setLoadingAttempts] = useState(false)
  const [expandedAttemptId, setExpandedAttemptId] = useState<string | null>(null)
  const [previewSnapshot, setPreviewSnapshot] = useState<{ src: string; caption: string } | null>(null)

  function handleShareLink(quiz: Quiz) {
    const url = `${window.location.origin}/quiz/${quiz.id}`
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url)
      showToast('Assessment link copied! Anyone can open this link to register and take the test.', 'success')
    } else {
      prompt('Copy this link to share the assessment:', url)
    }
  }

  async function handleDocUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setImportingDoc(true)
    try {
      showToast(`Extracting questions from ${file.name}...`, 'info')
      const result = await parseQuizDocument(file)
      if (result.questions.length > 0) {
        setEditingQuiz(null)
        setImportedQuestions(result.questions)
        setImportedTitle(result.titleSuggestion)
        setMode('create')
        const speedBadge = result.fastPath ? '⚡ Instant' : '👁️ Vision OCR'
        showToast(
          `Extracted ${result.questions.length} questions from ${file.name} [${speedBadge}]!`,
          'success'
        )
      }
    } catch (err) {
      showToast(
        sanitizeErrorMessage(
          err,
          'Failed to parse document. Please check the question format.'
        ),
        'error'
      )
    } finally {
      setImportingDoc(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  async function loadData() {
    setLoading(true)
    try {
      const data = await listQuizzes()
      setQuizzes(data)
    } catch (err) {
      showToast(sanitizeErrorMessage(err, 'Failed to load quizzes.'), 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleTogglePublish(quiz: Quiz) {
    try {
      const nextStatus = !quiz.published
      await updateQuiz(quiz.id, { published: nextStatus })
      setQuizzes((prev) =>
        prev.map((q) => (q.id === quiz.id ? { ...q, published: nextStatus } : q))
      )
      showToast(
        nextStatus ? 'Quiz published to students!' : 'Quiz moved to drafts.',
        'success'
      )
    } catch (err) {
      showToast(sanitizeErrorMessage(err, 'Failed to update quiz status.'), 'error')
    }
  }

  async function handleToggleRetake(quiz: Quiz) {
    try {
      const nextRetake = quiz.allowRetake === false ? true : false
      await updateQuiz(quiz.id, { allowRetake: nextRetake })
      setQuizzes((prev) =>
        prev.map((q) => (q.id === quiz.id ? { ...q, allowRetake: nextRetake } : q))
      )
      showToast(
        nextRetake ? 'Student retakes enabled for this assessment.' : 'Student retakes disabled for this assessment.',
        'info'
      )
    } catch (err) {
      showToast(sanitizeErrorMessage(err, 'Failed to update retake permission.'), 'error')
    }
  }

  async function handleResetAttempt(attemptId: string, candidateName: string) {
    if (!window.confirm(`Reset attempt for ${candidateName}? This will remove their current score and allow them to take the assessment again.`)) return
    try {
      await deleteQuizAttempt(attemptId)
      setAttempts((prev) => prev.filter((a) => a.id !== attemptId))
      showToast(`Attempt reset. Candidate ${candidateName} can now retake.`, 'success')
    } catch (err) {
      showToast(sanitizeErrorMessage(err, 'Failed to reset attempt.'), 'error')
    }
  }

  async function handleDelete(quizId: string) {
    if (!window.confirm('Are you sure you want to permanently delete this quiz?')) return
    try {
      await deleteQuiz(quizId)
      setQuizzes((prev) => prev.filter((q) => q.id !== quizId))
      showToast('Quiz deleted successfully.', 'success')
    } catch (err) {
      showToast(sanitizeErrorMessage(err, 'Failed to delete quiz.'), 'error')
    }
  }

  async function handleViewAttempts(quiz: Quiz) {
    setViewingAttemptsQuiz(quiz)
    setLoadingAttempts(true)
    try {
      const list = await getQuizAttempts(quiz.id)
      setAttempts(list)
    } catch (err) {
      showToast(sanitizeErrorMessage(err, 'Failed to load submissions.'), 'error')
    } finally {
      setLoadingAttempts(false)
    }
  }

  // Filtered list
  const filtered = quizzes.filter((q) => {
    if (search.trim()) {
      const s = search.toLowerCase()
      const matchTitle = q.title.toLowerCase().includes(s)
      const matchDesc = q.description.toLowerCase().includes(s)
      const matchCategory = q.category.toLowerCase().includes(s)
      if (!matchTitle && !matchDesc && !matchCategory) return false
    }
    if (branchFilter !== 'all') {
      if (q.targetBranch !== 'all' && q.targetBranch !== branchFilter) return false
    }
    if (statusFilter === 'published' && !q.published) return false
    if (statusFilter === 'draft' && q.published) return false
    return true
  })

  const totalQuizzes = quizzes.length
  const publishedCount = quizzes.filter((q) => q.published).length
  const draftCount = totalQuizzes - publishedCount

  if (mode === 'create' || mode === 'edit') {
    return (
      <AdminQuizEditor
        initialQuiz={editingQuiz}
        initialQuestions={importedQuestions}
        initialTitle={importedTitle}
        userEmail={userEmail}
        onBack={() => {
          setMode('list')
          setEditingQuiz(null)
          setImportedQuestions(undefined)
          setImportedTitle(undefined)
        }}
        onSaved={() => {
          setMode('list')
          setEditingQuiz(null)
          setImportedQuestions(undefined)
          setImportedTitle(undefined)
          loadData()
        }}
        showToast={showToast}
      />
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Hidden File Input */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleDocUpload}
        accept=".docx,.doc,.pdf,.png,.jpg,.jpeg,.webp,.txt,.json,.csv"
        style={{ display: 'none' }}
      />

      {/* Top Banner & Action */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '1rem',
        }}
      >
        <div>
          <h2 style={{ margin: 0, fontSize: '1.35rem', fontWeight: 700, color: T.txtPri }}>
            Quizzes & Assessments Studio
          </h2>
          <p style={{ margin: '0.2rem 0 0', fontSize: '0.85rem', color: T.txtSec }}>
            Design, schedule, and publish timed multiple-choice assessments for campus drives
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
          <button
            type="button"
            disabled={importingDoc}
            onClick={() => fileInputRef.current?.click()}
            title="Upload Word Document (.docx), PDF (scanned or digital), or Question Paper Photo (.png, .jpg) with AI Vision OCR"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              background: '#F0FDF4',
              color: '#15803D',
              border: '1px solid #BBF7D0',
              borderRadius: 8,
              padding: '0.6rem 1.05rem',
              fontSize: '0.85rem',
              fontWeight: 600,
              cursor: importingDoc ? 'not-allowed' : 'pointer',
              boxShadow: '0 1px 3px rgba(22, 101, 52, 0.1)',
            }}
          >
            <UploadCloud size={16} />
            {importingDoc ? 'Extracting via OCR...' : 'Upload Doc / OCR (.docx / .pdf / .png)'}
          </button>

          <button
            onClick={() => {
              setEditingQuiz(null)
              setImportedQuestions(undefined)
              setImportedTitle(undefined)
              setMode('create')
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              background: T.primary,
              color: '#ffffff',
              border: 'none',
              borderRadius: 8,
              padding: '0.6rem 1.15rem',
              fontSize: '0.85rem',
              fontWeight: 600,
              cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(0, 30, 64, 0.25)',
            }}
          >
            <Plus size={16} /> Create Assessment
          </button>
        </div>
      </div>

      {/* KPI Metrics */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '1rem',
        }}
      >
        <GlassCard style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
          <div
            style={{
              width: 42,
              height: 42,
              borderRadius: 10,
              background: '#EFF6FF',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#2563EB',
            }}
          >
            <HelpCircle size={20} />
          </div>
          <div>
            <div style={{ fontSize: '1.4rem', fontWeight: 700, color: T.txtPri }}>
              {totalQuizzes}
            </div>
            <div style={{ fontSize: '0.8rem', color: T.txtSec, fontWeight: 500 }}>
              Total Assessments
            </div>
          </div>
        </GlassCard>

        <GlassCard style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
          <div
            style={{
              width: 42,
              height: 42,
              borderRadius: 10,
              background: '#ECFDF5',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#059669',
            }}
          >
            <CheckCircle2 size={20} />
          </div>
          <div>
            <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#059669' }}>
              {publishedCount}
            </div>
            <div style={{ fontSize: '0.8rem', color: T.txtSec, fontWeight: 500 }}>
              Live / Published
            </div>
          </div>
        </GlassCard>

        <GlassCard style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
          <div
            style={{
              width: 42,
              height: 42,
              borderRadius: 10,
              background: '#FFFBEB',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#D97706',
            }}
          >
            <Archive size={20} />
          </div>
          <div>
            <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#D97706' }}>
              {draftCount}
            </div>
            <div style={{ fontSize: '0.8rem', color: T.txtSec, fontWeight: 500 }}>
              Drafts
            </div>
          </div>
        </GlassCard>
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
              placeholder="Search by quiz title, topic, or category..."
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

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <Filter size={14} color={T.txtSec} />
              <select
                value={branchFilter}
                onChange={(e) => setBranchFilter(e.target.value)}
                style={{
                  padding: '0.4rem 0.6rem',
                  borderRadius: 6,
                  border: '1px solid #D1D5DB',
                  fontSize: '0.82rem',
                  background: '#ffffff',
                }}
              >
                <option value="all">All Branches</option>
                {BRANCHES.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', gap: '0.25rem', background: '#F3F4F6', padding: '0.25rem', borderRadius: 6 }}>
              {(['all', 'published', 'draft'] as const).map((s) => (
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
                  {s === 'all' ? 'All' : s === 'published' ? 'Published' : 'Drafts'}
                </button>
              ))}
            </div>
          </div>
        </div>
      </GlassCard>

      {/* Quiz List */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem 0', color: T.txtSec, fontSize: '0.9rem' }}>
          Loading quizzes...
        </div>
      ) : filtered.length === 0 ? (
        <GlassCard style={{ textAlign: 'center', padding: '3.5rem 1rem' }}>
          <HelpCircle size={36} color={T.txtSec} style={{ margin: '0 auto 0.75rem', opacity: 0.6 }} />
          <h3 style={{ margin: '0 0 0.4rem', fontSize: '1.05rem', fontWeight: 700, color: T.txtPri }}>
            No Quizzes Found
          </h3>
          <p style={{ margin: '0 0 1rem', fontSize: '0.85rem', color: T.txtSec }}>
            {quizzes.length === 0
              ? 'Get started by creating your first student assessment.'
              : 'No quizzes match the current search or branch filter.'}
          </p>
          <button
            onClick={() => {
              setEditingQuiz(null)
              setMode('create')
            }}
            style={{
              background: T.primary,
              color: '#ffffff',
              border: 'none',
              borderRadius: 8,
              padding: '0.55rem 1.15rem',
              fontSize: '0.85rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Create Assessment
          </button>
        </GlassCard>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          {filtered.map((q) => {
            const branchLabel = q.targetBranch === 'all' || !q.targetBranch ? 'All Branches' : q.targetBranch

            return (
              <GlassCard key={q.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', flex: 1, minWidth: 260 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <span
                      style={{
                        padding: '0.2rem 0.55rem',
                        borderRadius: 6,
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        background: q.published ? '#ECFDF5' : '#FFFBEB',
                        color: q.published ? '#059669' : '#D97706',
                        border: q.published ? '1px solid #A7F3D0' : '1px solid #FDE68A',
                      }}
                    >
                      {q.published ? '● Live' : 'Draft'}
                    </span>

                    <span
                      style={{
                        background: '#EEF2FF',
                        color: '#4F46E5',
                        padding: '0.2rem 0.55rem',
                        borderRadius: 6,
                        fontSize: '0.75rem',
                        fontWeight: 600,
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

                  <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: T.txtPri }}>
                    {q.title}
                  </h3>

                  {q.description && (
                    <p style={{ margin: 0, fontSize: '0.82rem', color: T.txtSec, lineHeight: 1.4 }}>
                      {q.description}
                    </p>
                  )}

                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginTop: '0.2rem', fontSize: '0.78rem', color: T.txtSec }}>
                    <span>📝 {q.questions?.length || 0} Questions</span>
                    <span>⏱️ {q.timeLimitMinutes} Mins</span>
                    <span>🎯 Passing: {q.passingPercentage}%</span>
                    <span>📊 {q.difficulty}</span>
                  </div>
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
                  <button
                    onClick={() => handleShareLink(q)}
                    title="Share Assessment Link"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                      background: '#EFF6FF',
                      color: '#2563EB',
                      border: '1px solid #BFDBFE',
                      borderRadius: 8,
                      padding: '0.45rem 0.75rem',
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    <Share2 size={14} /> Share Link
                  </button>

                  <button
                    onClick={() => handleToggleRetake(q)}
                    title={q.allowRetake === false ? 'Click to enable retakes' : 'Click to disable retakes'}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                      background: q.allowRetake === false ? '#FEF2F2' : '#EFF6FF',
                      color: q.allowRetake === false ? '#DC2626' : '#2563EB',
                      border: `1px solid ${q.allowRetake === false ? '#FCA5A5' : '#BFDBFE'}`,
                      borderRadius: 8,
                      padding: '0.45rem 0.75rem',
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    <RotateCcw size={13} />
                    <span>{q.allowRetake === false ? 'Retake: OFF' : 'Retake: ON'}</span>
                  </button>

                  <button
                    onClick={() => handleViewAttempts(q)}
                    title="View Submissions"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                      background: '#F3F4F6',
                      color: T.txtPri,
                      border: '1px solid #D1D5DB',
                      borderRadius: 8,
                      padding: '0.45rem 0.75rem',
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    <Users size={14} /> Submissions
                  </button>

                  <button
                    onClick={() => handleTogglePublish(q)}
                    style={{
                      background: q.published ? '#FFFBEB' : '#ECFDF5',
                      color: q.published ? '#B45309' : '#047857',
                      border: 'none',
                      borderRadius: 8,
                      padding: '0.45rem 0.75rem',
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    {q.published ? 'Unpublish' : 'Publish'}
                  </button>

                  <button
                    onClick={() => {
                      setEditingQuiz(q)
                      setMode('edit')
                    }}
                    title="Edit Quiz"
                    style={{
                      background: '#F3F4F6',
                      color: T.txtPri,
                      border: 'none',
                      borderRadius: 8,
                      padding: '0.45rem 0.6rem',
                      cursor: 'pointer',
                    }}
                  >
                    <Pencil size={15} />
                  </button>

                  <button
                    onClick={() => handleDelete(q.id)}
                    title="Delete Quiz"
                    style={{
                      background: '#FEE2E2',
                      color: '#DC2626',
                      border: 'none',
                      borderRadius: 8,
                      padding: '0.45rem 0.6rem',
                      cursor: 'pointer',
                    }}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </GlassCard>
            )
          })}
        </div>
      )}

      {/* Submissions Inspection Modal */}
      {viewingAttemptsQuiz && (
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
              maxWidth: 760,
              width: '100%',
              maxHeight: '85vh',
              overflowY: 'auto',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, color: T.txtPri }}>
                  Submissions: {viewingAttemptsQuiz.title}
                </h3>
                <p style={{ margin: '0.2rem 0 0', fontSize: '0.8rem', color: T.txtSec }}>
                  Total student attempts: {attempts.length}
                </p>
              </div>

              <button
                onClick={() => {
                  setViewingAttemptsQuiz(null)
                  setExpandedAttemptId(null)
                }}
                style={{
                  background: '#F3F4F6',
                  border: 'none',
                  borderRadius: 8,
                  padding: '0.45rem 0.85rem',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Close
              </button>
            </div>

            {loadingAttempts ? (
              <div style={{ textAlign: 'center', padding: '2rem 0', color: T.txtSec }}>
                Loading submission records...
              </div>
            ) : attempts.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2.5rem 0', color: T.txtSec, fontSize: '0.88rem' }}>
                No students have submitted this assessment yet.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {attempts.map((att) => {
                  const isExpanded = expandedAttemptId === att.id

                  const rawFlags: any[] = Array.isArray(att.suspiciousFlags)
                    ? att.suspiciousFlags.map((f) =>
                        typeof f === 'string'
                          ? { timestamp: '', type: 'other', detail: f }
                          : f
                      )
                    : []

                  const phoneCount = rawFlags.filter((f) => f.type === 'cell_phone').length
                  const tamperCount = rawFlags.filter((f) => f.type === 'tamper_attempt').length
                  const audioCount =
                    (att.audioAnomaliesCount || 0) ||
                    rawFlags.filter((f) => f.type === 'audio_anomaly').length

                  const telemetrySum =
                    (att.tabSwitchesCount || 0) +
                    (att.fullscreenViolationsCount || 0) +
                    (att.faceMissingCount || 0) +
                    (att.multipleFacesCount || 0) +
                    audioCount +
                    phoneCount +
                    tamperCount

                  const violationCount = Math.max(rawFlags.length, telemetrySum)
                  const hasViolations = violationCount > 0

                  const integrity =
                    att.integrityScore !== undefined
                      ? att.integrityScore
                      : Math.max(0, 100 - violationCount * 12)

                  const photoEvidence = rawFlags.filter((f) => !!f.snapshot)

                  return (
                    <div
                      key={att.id}
                      style={{
                        borderRadius: 10,
                        border: '1px solid #E5E7EB',
                        background: '#FAFAFA',
                        overflow: 'hidden',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <div
                        onClick={() => setExpandedAttemptId(isExpanded ? null : att.id)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '0.85rem 1rem',
                          cursor: 'pointer',
                          gap: '0.75rem',
                          flexWrap: 'wrap',
                        }}
                      >
                        <div style={{ flex: 1, minWidth: 200 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                            <span style={{ fontWeight: 700, fontSize: '0.92rem', color: T.txtPri }}>
                              {att.studentName || att.studentEmail}
                            </span>
                            {att.isPublicCandidate && (
                              <span
                                style={{
                                  fontSize: '0.72rem',
                                  padding: '0.15rem 0.45rem',
                                  borderRadius: 4,
                                  background: '#EFF6FF',
                                  color: '#2563EB',
                                  fontWeight: 600,
                                }}
                              >
                                🌐 Public Link
                              </span>
                            )}
                            {att.rollNumber && (
                              <span
                                style={{
                                  fontSize: '0.72rem',
                                  padding: '0.15rem 0.45rem',
                                  borderRadius: 4,
                                  background: '#F3F4F6',
                                  color: T.txtPri,
                                  fontWeight: 600,
                                }}
                              >
                                Roll: {att.rollNumber}
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: '0.78rem', color: T.txtSec, marginTop: '0.2rem' }}>
                            {att.studentEmail} • {att.department || 'General'} •{' '}
                            {new Date(att.completedAt).toLocaleDateString()} at{' '}
                            {new Date(att.completedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                          {/* Proctoring Integrity Pill */}
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.35rem',
                              padding: '0.25rem 0.6rem',
                              borderRadius: 6,
                              fontSize: '0.75rem',
                              fontWeight: 700,
                              background: hasViolations ? '#FEF2F2' : '#ECFDF5',
                              color: hasViolations ? '#DC2626' : '#059669',
                              border: `1px solid ${hasViolations ? '#FCA5A5' : '#A7F3D0'}`,
                            }}
                          >
                            {hasViolations ? <ShieldAlert size={12} /> : <ShieldCheck size={12} />}
                            <span>
                              {hasViolations
                                ? `🚨 ${violationCount} Flag${violationCount > 1 ? 's' : ''} (${integrity}% Integrity)`
                                : '🛡️ 100% Clean'}
                            </span>
                          </div>

                          <span
                            style={{
                              padding: '0.25rem 0.6rem',
                              borderRadius: 6,
                              fontSize: '0.78rem',
                              fontWeight: 700,
                              background: att.passed ? '#ECFDF5' : '#FEE2E2',
                              color: att.passed ? '#059669' : '#DC2626',
                            }}
                          >
                            {att.passed ? 'Passed' : 'Needs Retake'} ({att.percentage}%)
                          </span>

                          <span style={{ fontSize: '0.82rem', color: T.txtSec, fontWeight: 600, minWidth: 65, textAlign: 'right' }}>
                            {att.score}/{att.maxScore} pts
                          </span>

                          {isExpanded ? <ChevronUp size={16} color={T.txtSec} /> : <ChevronDown size={16} color={T.txtSec} />}
                        </div>
                      </div>

                      {/* Expanded Integrity Breakdown */}
                      {isExpanded && (
                        <div
                          style={{
                            padding: '0.85rem 1rem',
                            borderTop: '1px solid #E5E7EB',
                            background: '#ffffff',
                            fontSize: '0.82rem',
                          }}
                        >
                          {/* Forensic Integrity Rating Banner */}
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              padding: '0.65rem 0.85rem',
                              borderRadius: 8,
                              background:
                                integrity >= 90
                                  ? '#ECFDF5'
                                  : integrity >= 60
                                  ? '#FFFBEB'
                                  : '#FEF2F2',
                              border: `1px solid ${
                                integrity >= 90
                                  ? '#A7F3D0'
                                  : integrity >= 60
                                  ? '#FDE68A'
                                  : '#FECACA'
                              }`,
                              marginBottom: '0.75rem',
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
                              {integrity >= 90 ? (
                                <ShieldCheck size={20} color="#059669" />
                              ) : integrity >= 60 ? (
                                <AlertTriangle size={20} color="#D97706" />
                              ) : (
                                <ShieldAlert size={20} color="#DC2626" />
                              )}
                              <div>
                                <div
                                  style={{
                                    fontWeight: 750,
                                    fontSize: '0.88rem',
                                    color:
                                      integrity >= 90
                                        ? '#065F46'
                                        : integrity >= 60
                                        ? '#92400E'
                                        : '#991B1B',
                                  }}
                                >
                                  {integrity >= 90
                                    ? 'Verified Authentic Candidate Session'
                                    : integrity >= 60
                                    ? 'Mild Anomalies Detected (Review Recommended)'
                                    : 'Severe Malpractice Flagged (High Risk)'}
                                </div>
                                <div style={{ fontSize: '0.72rem', color: T.txtSec, marginTop: '0.1rem' }}>
                                  Forensic Integrity Rating: <strong>{integrity}%</strong> • Total Recorded Infractions: <strong>{violationCount}</strong>
                                </div>
                              </div>
                            </div>

                            <div
                              style={{
                                fontWeight: 800,
                                fontSize: '1.2rem',
                                color:
                                  integrity >= 90
                                    ? '#059669'
                                    : integrity >= 60
                                    ? '#D97706'
                                    : '#DC2626',
                              }}
                            >
                              {integrity}%
                            </div>
                          </div>

                          {/* 6-Metric Telemetry Grid */}
                          <div
                            style={{
                              display: 'grid',
                              gridTemplateColumns: 'repeat(auto-fit, minmax(115px, 1fr))',
                              gap: '0.45rem',
                              marginBottom: '0.85rem',
                            }}
                          >
                            <div style={{ background: '#F9FAFB', padding: '0.5rem', borderRadius: 6, border: '1px solid #E5E7EB' }}>
                              <span style={{ color: T.txtSec, fontSize: '0.72rem' }}>Tab Switches / Blur:</span>
                              <div style={{ fontWeight: 700, fontSize: '0.95rem', color: (att.tabSwitchesCount || 0) > 0 ? '#DC2626' : '#059669' }}>
                                {att.tabSwitchesCount || 0}
                                {att.totalAwaySeconds ? (
                                  <span style={{ fontSize: '0.68rem', fontWeight: 500, color: '#991B1B', marginLeft: 4 }}>
                                    ({att.totalAwaySeconds}s away)
                                  </span>
                                ) : null}
                              </div>
                            </div>

                            <div style={{ background: '#F9FAFB', padding: '0.5rem', borderRadius: 6, border: '1px solid #E5E7EB' }}>
                              <span style={{ color: T.txtSec, fontSize: '0.72rem' }}>📱 Phone in Frame:</span>
                              <div style={{ fontWeight: 700, fontSize: '0.95rem', color: phoneCount > 0 ? '#DC2626' : '#059669' }}>
                                {phoneCount}
                              </div>
                            </div>

                            <div style={{ background: '#F9FAFB', padding: '0.5rem', borderRadius: 6, border: '1px solid #E5E7EB' }}>
                              <span style={{ color: T.txtSec, fontSize: '0.72rem' }}>👥 Multiple People:</span>
                              <div style={{ fontWeight: 700, fontSize: '0.95rem', color: (att.multipleFacesCount || 0) > 0 ? '#DC2626' : '#059669' }}>
                                {att.multipleFacesCount || 0}
                              </div>
                            </div>

                            <div style={{ background: '#F9FAFB', padding: '0.5rem', borderRadius: 6, border: '1px solid #E5E7EB' }}>
                              <span style={{ color: T.txtSec, fontSize: '0.72rem' }}>👁️ Face Absence:</span>
                              <div style={{ fontWeight: 700, fontSize: '0.95rem', color: (att.faceMissingCount || 0) > 0 ? '#DC2626' : '#059669' }}>
                                {att.faceMissingCount || 0}
                              </div>
                            </div>

                            <div style={{ background: '#F9FAFB', padding: '0.5rem', borderRadius: 6, border: '1px solid #E5E7EB' }}>
                              <span style={{ color: T.txtSec, fontSize: '0.72rem' }}>🎙️ Sound / Voice:</span>
                              <div style={{ fontWeight: 700, fontSize: '0.95rem', color: audioCount > 0 ? '#DC2626' : '#059669' }}>
                                {audioCount}
                              </div>
                            </div>

                            <div style={{ background: '#F9FAFB', padding: '0.5rem', borderRadius: 6, border: '1px solid #E5E7EB' }}>
                              <span style={{ color: T.txtSec, fontSize: '0.72rem' }}>⚠️ Tamper / Shortcuts:</span>
                              <div style={{ fontWeight: 700, fontSize: '0.95rem', color: tamperCount > 0 ? '#DC2626' : '#059669' }}>
                                {tamperCount}
                              </div>
                            </div>
                          </div>

                          {/* Photographic Evidence Gallery (Snapshots Captured at Violation Moments) */}
                          {photoEvidence.length > 0 && (
                            <div style={{ marginBottom: '0.85rem' }}>
                              <div
                                style={{
                                  fontWeight: 700,
                                  color: '#991B1B',
                                  fontSize: '0.8rem',
                                  marginBottom: '0.45rem',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '0.35rem',
                                }}
                              >
                                <Camera size={14} color="#DC2626" />
                                <span>Captured Forensic Evidence ({photoEvidence.length} Snapshots):</span>
                              </div>
                              <div
                                style={{
                                  display: 'grid',
                                  gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
                                  gap: '0.5rem',
                                }}
                              >
                                {photoEvidence.map((snap, sIdx) => (
                                  <div
                                    key={sIdx}
                                    onClick={() =>
                                      setPreviewSnapshot({
                                        src: snap.snapshot!,
                                        caption: `${snap.timestamp || 'Violation'} — ${snap.detail}`,
                                      })
                                    }
                                    style={{
                                      borderRadius: 8,
                                      border: '1px solid #FECACA',
                                      background: '#FEF2F2',
                                      overflow: 'hidden',
                                      cursor: 'pointer',
                                      boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                                      transition: 'all 0.15s ease',
                                    }}
                                    title="Click to zoom forensic evidence photo"
                                  >
                                    <img
                                      src={snap.snapshot}
                                      alt="Evidence snapshot"
                                      style={{
                                        width: '100%',
                                        height: 95,
                                        objectFit: 'cover',
                                        display: 'block',
                                        background: '#0F172A',
                                      }}
                                    />
                                    <div style={{ padding: '0.35rem 0.45rem', fontSize: '0.68rem', color: '#991B1B', lineHeight: 1.25 }}>
                                      <div style={{ fontWeight: 700 }}>⏱️ {snap.timestamp}</div>
                                      <div
                                        style={{
                                          overflow: 'hidden',
                                          textOverflow: 'ellipsis',
                                          whiteSpace: 'nowrap',
                                          marginTop: 2,
                                        }}
                                      >
                                        {snap.detail}
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Chronological Incident Timeline */}
                          {rawFlags.length > 0 ? (
                            <div>
                              <div style={{ fontWeight: 700, color: '#DC2626', marginBottom: '0.35rem', fontSize: '0.78rem' }}>
                                Chronological Infraction Log ({rawFlags.length} Events):
                              </div>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', maxHeight: 150, overflowY: 'auto' }}>
                                {rawFlags.map((flag, fIdx) => {
                                  const time = flag.timestamp || ''
                                  const detail = flag.detail || String(flag)
                                  const fType = flag.type || 'other'

                                  return (
                                    <div
                                      key={fIdx}
                                      style={{
                                        fontSize: '0.74rem',
                                        color: T.txtPri,
                                        padding: '0.3rem 0.55rem',
                                        background: '#FEF2F2',
                                        borderRadius: 6,
                                        borderLeft: '3px solid #DC2626',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        gap: '0.5rem',
                                      }}
                                    >
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                                        {fType === 'cell_phone' ? (
                                          <Smartphone size={13} color="#DC2626" />
                                        ) : fType === 'audio_anomaly' ? (
                                          <Mic size={13} color="#DC2626" />
                                        ) : fType === 'multiple_faces' ? (
                                          <Users size={13} color="#DC2626" />
                                        ) : (
                                          <AlertTriangle size={13} color="#DC2626" />
                                        )}
                                        <div>
                                          {time && <strong>[{time}] </strong>}
                                          <span>{detail}</span>
                                        </div>
                                      </div>
                                      {flag.snapshot && (
                                        <button
                                          onClick={() =>
                                            setPreviewSnapshot({
                                              src: flag.snapshot!,
                                              caption: `${time} — ${detail}`,
                                            })
                                          }
                                          style={{
                                            background: '#ffffff',
                                            border: '1px solid #FECACA',
                                            borderRadius: 4,
                                            padding: '0.15rem 0.4rem',
                                            fontSize: '0.68rem',
                                            color: '#DC2626',
                                            cursor: 'pointer',
                                            fontWeight: 600,
                                            flexShrink: 0,
                                          }}
                                        >
                                          📷 View Photo
                                        </button>
                                      )}
                                    </div>
                                  )
                                })}
                              </div>
                            </div>
                          ) : (
                            <div style={{ color: '#059669', fontSize: '0.78rem' }}>
                              ✓ No suspicious incidents detected during candidate session. Full academic integrity verified.
                            </div>
                          )}

                          {/* Candidate Actions (Drive Folder & Retake) */}
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.6rem', marginTop: '0.75rem', paddingTop: '0.65rem', borderTop: '1px solid #F1F5F9', flexWrap: 'wrap' }}>
                            {att.driveEvidenceFolderLink && (
                              <a
                                href={att.driveEvidenceFolderLink}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '0.35rem',
                                  background: '#F0FDF4',
                                  color: '#15803D',
                                  border: '1px solid #BBF7D0',
                                  borderRadius: 6,
                                  padding: '0.35rem 0.75rem',
                                  fontSize: '0.78rem',
                                  fontWeight: 600,
                                  textDecoration: 'none',
                                }}
                                title="Open Google Drive folder containing all evidence screenshots for this test"
                              >
                                <Folder size={13} color="#15803D" /> Drive Evidence Folder <ExternalLink size={11} />
                              </a>
                            )}

                            <button
                              onClick={() => handleResetAttempt(att.id, att.studentName || att.studentEmail)}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.35rem',
                                background: '#EFF6FF',
                                color: '#2563EB',
                                border: '1px solid #BFDBFE',
                                borderRadius: 6,
                                padding: '0.35rem 0.75rem',
                                fontSize: '0.78rem',
                                fontWeight: 600,
                                cursor: 'pointer',
                              }}
                              title="Reset this attempt so candidate can re-attempt the quiz"
                            >
                              <RotateCcw size={13} /> Allow Candidate Retake
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Forensic Snapshot Lightbox Modal */}
      {previewSnapshot && (
        <div
          onClick={() => setPreviewSnapshot(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(5px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10001,
            padding: '1.5rem',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#ffffff',
              borderRadius: 14,
              overflow: 'hidden',
              maxWidth: 520,
              width: '100%',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.4)',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0.75rem 1rem',
                borderBottom: '1px solid #E5E7EB',
                background: '#FAFAFA',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 700, fontSize: '0.88rem', color: '#991B1B' }}>
                <Camera size={16} color="#DC2626" />
                <span>Forensic Evidence Snapshot</span>
              </div>
              <button
                onClick={() => setPreviewSnapshot(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '0.2rem',
                  color: T.txtSec,
                }}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ padding: '1rem', background: '#0F172A', display: 'flex', justifyContent: 'center' }}>
              <img
                src={previewSnapshot.src}
                alt="Enlarged forensic snapshot"
                style={{
                  maxWidth: '100%',
                  maxHeight: 380,
                  borderRadius: 8,
                  objectFit: 'contain',
                }}
              />
            </div>

            <div style={{ padding: '0.85rem 1rem', fontSize: '0.82rem', color: T.txtPri, background: '#ffffff', lineHeight: 1.4 }}>
              <strong>Infraction Details:</strong>
              <div style={{ color: '#DC2626', marginTop: 3 }}>{previewSnapshot.caption}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
