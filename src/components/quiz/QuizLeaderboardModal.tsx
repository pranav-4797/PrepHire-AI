// ── Simple & Clean Assessment Leaderboard (Admin Only) ───────────────────────
// Minimalist, high-legibility tabular gradebook with neutral institutional styling.
// Free of distracting neon gradients, flashy podiums, and loud colors.
// Includes search/filtering, CSV export, proctoring telemetry audit, and attempt reset.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useMemo, Fragment } from 'react'
import {
  Download,
  Search,
  Megaphone,
  X,
  Users,
  RotateCcw,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Camera,
  CheckCircle2,
  XCircle,
} from 'lucide-react'
import type { Quiz, QuizAttempt } from '../../types/quiz'

interface RankedAttempt extends QuizAttempt {
  rank: number
  violationCount: number
  phoneCount: number
  tamperCount: number
  audioCount: number
  calculatedIntegrity: number
  photoEvidence: { timestamp?: string; type?: string; detail?: string; snapshot?: string }[]
}

interface QuizLeaderboardModalProps {
  quiz: Quiz
  attempts: QuizAttempt[]
  userRole?: 'admin' | 'faculty' | 'student'
  loading?: boolean
  onClose: () => void
  onToggleDeclareResults?: (quiz: Quiz) => void
  onResetAttempt?: (attemptId: string, candidateName?: string) => Promise<void> | void
  showToast?: (msg: string, type?: 'success' | 'error' | 'info') => void
}

function formatDuration(seconds: number): string {
  if (!seconds || seconds < 1) return '0s'
  const mins = Math.floor(seconds / 60)
  const remSecs = seconds % 60
  if (mins === 0) return `${remSecs}s`
  return `${mins}m ${remSecs < 10 ? '0' : ''}${remSecs}s`
}

export function QuizLeaderboardModal({
  quiz,
  attempts,
  loading = false,
  onClose,
  onToggleDeclareResults,
  onResetAttempt,
  showToast,
}: QuizLeaderboardModalProps) {
  const [searchTerm, setSearchTerm] = useState('')
  const [filterMode, setFilterMode] = useState<'all' | 'passed' | 'failed' | 'flagged'>('all')
  const [sortBy, setSortBy] = useState<'rank' | 'fastest' | 'integrity' | 'latest'>('rank')
  const [expandedAttemptId, setExpandedAttemptId] = useState<string | null>(null)
  const [lightboxImage, setLightboxImage] = useState<string | null>(null)

  // Rank attempts: score desc, time asc
  const rankedAttempts: RankedAttempt[] = useMemo(() => {
    const list = [...attempts].map((att) => {
      const flags = att.suspiciousFlags || []
      const phoneCount = flags.filter((f) => f.type === 'cell_phone').length
      const tamperCount = flags.filter((f) => f.type === 'tamper_attempt').length
      const audioCount = flags.filter((f) => f.type === 'audio_anomaly').length
      const violationCount = flags.length

      const photoEvidence = flags
        .filter((f) => !!f.snapshot)
        .map((f) => ({
          timestamp: f.timestamp,
          type: f.type,
          detail: f.detail,
          snapshot: f.snapshot,
        }))

      return {
        ...att,
        rank: 0,
        violationCount,
        phoneCount,
        tamperCount,
        audioCount,
        calculatedIntegrity: typeof att.integrityScore === 'number' ? att.integrityScore : 100,
        photoEvidence,
      }
    })

    list.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score
      return (a.timeSpentSeconds || 0) - (b.timeSpentSeconds || 0)
    })

    return list.map((item, idx) => ({
      ...item,
      rank: idx + 1,
    }))
  }, [attempts])

  // Summary Metrics
  const stats = useMemo(() => {
    const total = rankedAttempts.length
    if (total === 0) return { total: 0, high: 0, avg: 0, passRate: 0, clean: 0 }
    const high = Math.max(...rankedAttempts.map((a) => a.score))
    const sumScore = rankedAttempts.reduce((acc, a) => acc + (a.percentage || 0), 0)
    const avg = Math.round(sumScore / total)
    const passed = rankedAttempts.filter((a) => a.passed).length
    const passRate = Math.round((passed / total) * 100)
    const clean = rankedAttempts.filter((a) => a.violationCount === 0).length
    return { total, high, avg, passRate, clean, passed }
  }, [rankedAttempts])

  // Filter & Search
  const filteredAndSorted = useMemo(() => {
    let list = [...rankedAttempts]

    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase()
      list = list.filter(
        (a) =>
          (a.studentName || '').toLowerCase().includes(q) ||
          (a.studentEmail || '').toLowerCase().includes(q) ||
          (a.department || '').toLowerCase().includes(q) ||
          (a.rollNumber || '').toLowerCase().includes(q)
      )
    }

    if (filterMode === 'passed') {
      list = list.filter((a) => a.passed)
    } else if (filterMode === 'failed') {
      list = list.filter((a) => !a.passed)
    } else if (filterMode === 'flagged') {
      list = list.filter((a) => a.violationCount > 0 || a.calculatedIntegrity < 80)
    }

    if (sortBy === 'rank') {
      list.sort((a, b) => a.rank - b.rank)
    } else if (sortBy === 'fastest') {
      list.sort((a, b) => (a.timeSpentSeconds || 99999) - (b.timeSpentSeconds || 99999))
    } else if (sortBy === 'integrity') {
      list.sort((a, b) => b.calculatedIntegrity - a.calculatedIntegrity)
    } else if (sortBy === 'latest') {
      list.sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime())
    }

    return list
  }, [rankedAttempts, searchTerm, filterMode, sortBy])

  // CSV Export
  function handleExportCSV() {
    if (rankedAttempts.length === 0) return
    const headers = [
      'Rank',
      'Candidate Name',
      'Email',
      'Department',
      'Roll Number',
      'Score',
      'Max Score',
      'Percentage',
      'Status',
      'Time Spent',
      'Integrity Score',
      'Infraction Count',
      'Drive Evidence Link',
      'Completed At',
    ]

    const rows = rankedAttempts.map((a) => [
      a.rank,
      `"${(a.studentName || a.studentEmail.split('@')[0] || '').replace(/"/g, '""')}"`,
      `"${a.studentEmail.replace(/"/g, '""')}"`,
      `"${(a.department || '').replace(/"/g, '""')}"`,
      `"${(a.rollNumber || '').replace(/"/g, '""')}"`,
      a.score,
      a.maxScore,
      `${a.percentage}%`,
      a.passed ? 'PASSED' : 'FAILED',
      `"${formatDuration(a.timeSpentSeconds)}"`,
      `${a.calculatedIntegrity}%`,
      a.violationCount,
      `"${(a.driveEvidenceFolderLink || '').replace(/"/g, '""')}"`,
      `"${a.completedAt}"`,
    ])

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${(quiz.title || 'Quiz').replace(/[^a-zA-Z0-9_-]/g, '_')}_Leaderboard.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)

    showToast?.('Leaderboard gradebook exported as CSV', 'success')
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(15, 23, 42, 0.6)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.25rem',
      }}
    >
      <div
        style={{
          background: '#ffffff',
          borderRadius: 12,
          maxWidth: 1060,
          width: '100%',
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 40px -15px rgba(0, 0, 0, 0.3)',
          overflow: 'hidden',
          border: '1px solid #CBD5E1',
        }}
      >
        {/* ── Modal Header (Simple Clean Slate) ─────────────────────────────── */}
        <div
          style={{
            padding: '1rem 1.5rem',
            background: '#0F172A',
            color: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '1rem',
            borderBottom: '1px solid #1E293B',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, color: '#F8FAFC' }}>
                {quiz.title}
              </h2>
              <span
                style={{
                  background: '#1E293B',
                  color: '#94A3B8',
                  padding: '0.15rem 0.55rem',
                  borderRadius: 6,
                  fontSize: '0.72rem',
                  fontWeight: 600,
                  border: '1px solid #334155',
                }}
              >
                Leaderboard (Admin View)
              </span>
            </div>
            <p style={{ margin: '0.2rem 0 0', fontSize: '0.78rem', color: '#94A3B8' }}>
              Passing Threshold: {quiz.passingPercentage || 60}% • Total Submissions: {attempts.length}
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {onToggleDeclareResults && (
              <button
                onClick={() => onToggleDeclareResults(quiz)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  background: quiz.resultsDeclared ? '#064E3B' : '#78350F',
                  color: quiz.resultsDeclared ? '#A7F3D0' : '#FDE68A',
                  border: `1px solid ${quiz.resultsDeclared ? '#059669' : '#B45309'}`,
                  borderRadius: 6,
                  padding: '0.4rem 0.75rem',
                  fontSize: '0.78rem',
                  fontWeight: 650,
                  cursor: 'pointer',
                }}
              >
                <Megaphone size={13} />
                <span>{quiz.resultsDeclared ? 'Results: Live' : 'Declare Results'}</span>
              </button>
            )}

            <button
              onClick={handleExportCSV}
              disabled={rankedAttempts.length === 0}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem',
                background: '#1E293B',
                color: '#F8FAFC',
                border: '1px solid #334155',
                borderRadius: 6,
                padding: '0.4rem 0.75rem',
                fontSize: '0.78rem',
                fontWeight: 600,
                cursor: rankedAttempts.length === 0 ? 'not-allowed' : 'pointer',
              }}
            >
              <Download size={13} />
              <span>Export CSV</span>
            </button>

            <button
              onClick={onClose}
              style={{
                background: '#1E293B',
                border: '1px solid #334155',
                borderRadius: 6,
                padding: '0.35rem 0.55rem',
                color: '#94A3B8',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
              }}
              title="Close"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* ── Scrollable Body ──────────────────────────────────────────────── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem', background: '#F8FAFC' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '3rem 0', color: '#64748B', fontSize: '0.85rem' }}>
              Loading assessment records...
            </div>
          ) : rankedAttempts.length === 0 ? (
            <div
              style={{
                background: '#ffffff',
                border: '1px dashed #CBD5E1',
                borderRadius: 8,
                padding: '3rem 1.5rem',
                textAlign: 'center',
                color: '#64748B',
              }}
            >
              <Users size={36} color="#94A3B8" style={{ marginBottom: '0.5rem' }} />
              <h3 style={{ margin: 0, fontSize: '0.95rem', color: '#1E293B' }}>No Submissions Yet</h3>
              <p style={{ margin: '0.25rem 0 0', fontSize: '0.8rem' }}>
                Submissions will appear here once candidates finalize their assessments.
              </p>
            </div>
          ) : (
            <>
              {/* ── Simple Metric Strip (Neutral Styling) ──────────────────── */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                  gap: '0.65rem',
                  marginBottom: '1rem',
                }}
              >
                <div style={{ background: '#ffffff', border: '1px solid #E2E8F0', borderRadius: 8, padding: '0.65rem 0.85rem' }}>
                  <div style={{ fontSize: '0.72rem', color: '#64748B', fontWeight: 600 }}>Total Submissions</div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 750, color: '#0F172A', marginTop: 2 }}>{stats.total}</div>
                </div>

                <div style={{ background: '#ffffff', border: '1px solid #E2E8F0', borderRadius: 8, padding: '0.65rem 0.85rem' }}>
                  <div style={{ fontSize: '0.72rem', color: '#64748B', fontWeight: 600 }}>Top Score</div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 750, color: '#0F172A', marginTop: 2 }}>{stats.high} pts</div>
                </div>

                <div style={{ background: '#ffffff', border: '1px solid #E2E8F0', borderRadius: 8, padding: '0.65rem 0.85rem' }}>
                  <div style={{ fontSize: '0.72rem', color: '#64748B', fontWeight: 600 }}>Cohort Average</div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 750, color: '#0F172A', marginTop: 2 }}>{stats.avg}%</div>
                </div>

                <div style={{ background: '#ffffff', border: '1px solid #E2E8F0', borderRadius: 8, padding: '0.65rem 0.85rem' }}>
                  <div style={{ fontSize: '0.72rem', color: '#64748B', fontWeight: 600 }}>Pass Rate</div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 750, color: '#0F172A', marginTop: 2 }}>{stats.passRate}%</div>
                </div>

                <div style={{ background: '#ffffff', border: '1px solid #E2E8F0', borderRadius: 8, padding: '0.65rem 0.85rem' }}>
                  <div style={{ fontSize: '0.72rem', color: '#64748B', fontWeight: 600 }}>Clean Sessions</div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 750, color: '#0F172A', marginTop: 2 }}>{stats.clean} / {stats.total}</div>
                </div>
              </div>

              {/* ── Search, Filter & Sort Controls ─────────────────────────── */}
              <div
                style={{
                  background: '#ffffff',
                  border: '1px solid #E2E8F0',
                  borderRadius: 8,
                  padding: '0.65rem 0.85rem',
                  marginBottom: '1rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '0.65rem',
                }}
              >
                {/* Search */}
                <div style={{ position: 'relative', width: 260, maxWidth: '100%' }}>
                  <Search size={14} color="#94A3B8" style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)' }} />
                  <input
                    type="text"
                    placeholder="Search candidate, roll, branch..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.4rem 0.65rem 0.4rem 1.85rem',
                      fontSize: '0.8rem',
                      borderRadius: 6,
                      border: '1px solid #CBD5E1',
                      outline: 'none',
                    }}
                  />
                </div>

                {/* Filters */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                  {(['all', 'passed', 'failed', 'flagged'] as const).map((mode) => (
                    <button
                      key={mode}
                      onClick={() => setFilterMode(mode)}
                      style={{
                        padding: '0.3rem 0.65rem',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        borderRadius: 6,
                        border: '1px solid #CBD5E1',
                        cursor: 'pointer',
                        background: filterMode === mode ? '#0F172A' : '#ffffff',
                        color: filterMode === mode ? '#ffffff' : '#475569',
                      }}
                    >
                      {mode === 'all' && `All (${rankedAttempts.length})`}
                      {mode === 'passed' && `Passed (${stats.passed})`}
                      {mode === 'failed' && `Failed (${stats.total - (stats.passed || 0)})`}
                      {mode === 'flagged' && `Flagged (${rankedAttempts.filter((a) => a.violationCount > 0).length})`}
                    </button>
                  ))}

                  {/* Sort */}
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as any)}
                    style={{
                      padding: '0.35rem 0.65rem',
                      fontSize: '0.75rem',
                      borderRadius: 6,
                      border: '1px solid #CBD5E1',
                      background: '#ffffff',
                      color: '#334155',
                      outline: 'none',
                    }}
                  >
                    <option value="rank">Sort by: Rank (Highest Score)</option>
                    <option value="fastest">Sort by: Fastest Time</option>
                    <option value="integrity">Sort by: Highest Integrity</option>
                    <option value="latest">Sort by: Latest Submission</option>
                  </select>
                </div>
              </div>

              {/* ── Simple Clean Table ─────────────────────────────────────── */}
              <div
                style={{
                  background: '#ffffff',
                  border: '1px solid #E2E8F0',
                  borderRadius: 8,
                  overflow: 'hidden',
                }}
              >
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.82rem' }}>
                  <thead>
                    <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', color: '#475569', fontWeight: 650 }}>
                      <th style={{ padding: '0.65rem 0.85rem', width: 60 }}>Rank</th>
                      <th style={{ padding: '0.65rem 0.85rem' }}>Candidate</th>
                      <th style={{ padding: '0.65rem 0.85rem', textAlign: 'center' }}>Score</th>
                      <th style={{ padding: '0.65rem 0.85rem', textAlign: 'center' }}>Duration</th>
                      <th style={{ padding: '0.65rem 0.85rem' }}>Submitted At</th>
                      <th style={{ padding: '0.65rem 0.85rem', textAlign: 'center' }}>Integrity</th>
                      <th style={{ padding: '0.65rem 0.85rem', textAlign: 'center' }}>Status</th>
                      <th style={{ padding: '0.65rem 0.85rem', textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAndSorted.map((attempt) => {
                      const isExpanded = expandedAttemptId === attempt.id
                      return (
                        <Fragment key={attempt.id}>
                          <tr
                            style={{
                              borderBottom: '1px solid #F1F5F9',
                              background: isExpanded ? '#F8FAFC' : '#ffffff',
                              transition: 'background 0.1s ease',
                            }}
                          >
                            {/* Rank */}
                            <td style={{ padding: '0.65rem 0.85rem', fontWeight: 750, color: '#0F172A' }}>
                              #{attempt.rank}
                            </td>

                            {/* Candidate Details */}
                            <td style={{ padding: '0.65rem 0.85rem' }}>
                              <div style={{ fontWeight: 650, color: '#0F172A' }}>
                                {attempt.studentName || attempt.studentEmail.split('@')[0]}
                              </div>
                              <div style={{ fontSize: '0.72rem', color: '#64748B' }}>
                                {attempt.studentEmail} {attempt.rollNumber ? `• ${attempt.rollNumber}` : ''}{' '}
                                {attempt.department ? `(${attempt.department})` : ''}
                              </div>
                            </td>

                            {/* Score */}
                            <td style={{ padding: '0.65rem 0.85rem', textAlign: 'center' }}>
                              <strong style={{ color: '#0F172A' }}>{attempt.score}</strong>
                              <span style={{ color: '#64748B' }}>/{attempt.maxScore}</span>
                              <div style={{ fontSize: '0.72rem', color: '#475569' }}>{attempt.percentage}%</div>
                            </td>

                            {/* Duration */}
                            <td style={{ padding: '0.65rem 0.85rem', textAlign: 'center', color: '#475569' }}>
                              {formatDuration(attempt.timeSpentSeconds)}
                            </td>

                            {/* Submitted At */}
                            <td style={{ padding: '0.65rem 0.85rem' }}>
                              <div style={{ fontWeight: 600, color: '#0F172A', fontSize: '0.78rem' }}>
                                {attempt.completedAt
                                  ? new Date(attempt.completedAt).toLocaleTimeString([], {
                                      hour: '2-digit',
                                      minute: '2-digit',
                                      second: '2-digit',
                                      hour12: true,
                                    })
                                  : '—'}
                              </div>
                              <div style={{ fontSize: '0.7rem', color: '#64748B' }}>
                                {attempt.completedAt
                                  ? new Date(attempt.completedAt).toLocaleDateString([], {
                                      month: 'short',
                                      day: 'numeric',
                                      year: 'numeric',
                                    })
                                  : ''}
                              </div>
                            </td>

                            {/* Integrity */}
                            <td style={{ padding: '0.65rem 0.85rem', textAlign: 'center' }}>
                              {attempt.violationCount > 0 ? (
                                <span
                                  style={{
                                    fontSize: '0.72rem',
                                    fontWeight: 650,
                                    color: '#B45309',
                                    background: '#FEF3C7',
                                    padding: '0.15rem 0.45rem',
                                    borderRadius: 4,
                                    border: '1px solid #FDE68A',
                                  }}
                                >
                                  {attempt.calculatedIntegrity}% ({attempt.violationCount} flags)
                                </span>
                              ) : (
                                <span style={{ fontSize: '0.75rem', color: '#059669', fontWeight: 600 }}>
                                  100% Clean
                                </span>
                              )}
                            </td>

                            {/* Status */}
                            <td style={{ padding: '0.65rem 0.85rem', textAlign: 'center' }}>
                              <span
                                style={{
                                  fontSize: '0.72rem',
                                  fontWeight: 650,
                                  padding: '0.2rem 0.5rem',
                                  borderRadius: 4,
                                  background: attempt.passed ? '#ECFDF5' : '#F1F5F9',
                                  color: attempt.passed ? '#047857' : '#475569',
                                  border: `1px solid ${attempt.passed ? '#A7F3D0' : '#E2E8F0'}`,
                                }}
                              >
                                {attempt.passed ? 'Passed' : 'Failed'}
                              </span>
                            </td>

                            {/* Actions */}
                            <td style={{ padding: '0.65rem 0.85rem', textAlign: 'right' }}>
                              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                                {attempt.driveEvidenceFolderLink && (
                                  <a
                                    href={attempt.driveEvidenceFolderLink}
                                    target="_blank"
                                    rel="noreferrer"
                                    style={{
                                      padding: '0.3rem 0.45rem',
                                      fontSize: '0.74rem',
                                      color: '#2563EB',
                                      border: '1px solid #BFDBFE',
                                      borderRadius: 6,
                                      background: '#EFF6FF',
                                      textDecoration: 'none',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: 3,
                                    }}
                                    title="Open Google Drive Evidence Directory"
                                  >
                                    <ExternalLink size={12} /> Drive
                                  </a>
                                )}

                                <button
                                  onClick={() =>
                                    setExpandedAttemptId(isExpanded ? null : attempt.id)
                                  }
                                  style={{
                                    padding: '0.3rem 0.55rem',
                                    fontSize: '0.74rem',
                                    fontWeight: 600,
                                    color: isExpanded ? '#ffffff' : '#334155',
                                    background: isExpanded ? '#0F172A' : '#F1F5F9',
                                    border: '1px solid #CBD5E1',
                                    borderRadius: 6,
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 3,
                                  }}
                                >
                                  {isExpanded ? 'Hide' : 'Review'}
                                  {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                                </button>

                                {onResetAttempt && (
                                  <button
                                    onClick={() =>
                                      onResetAttempt(
                                        attempt.id,
                                        attempt.studentName || attempt.studentEmail
                                      )
                                    }
                                    style={{
                                      padding: '0.3rem 0.45rem',
                                      fontSize: '0.74rem',
                                      color: '#DC2626',
                                      border: '1px solid #FECACA',
                                      borderRadius: 6,
                                      background: '#FEF2F2',
                                      cursor: 'pointer',
                                    }}
                                    title="Reset attempt and permit retake"
                                  >
                                    <RotateCcw size={12} />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>

                          {/* ── Expanded Audit Dossier Row ─────────────────── */}
                          {isExpanded && (
                            <tr>
                              <td colSpan={8} style={{ padding: '1rem', background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                                  {/* Telemetry Summary */}
                                  <div style={{ display: 'flex', gap: '0.65rem', flexWrap: 'wrap' }}>
                                    <div style={{ background: '#ffffff', border: '1px solid #E2E8F0', borderRadius: 6, padding: '0.4rem 0.65rem', fontSize: '0.75rem' }}>
                                      <span style={{ color: '#64748B' }}>Submitted: </span>
                                      <strong>
                                        {attempt.completedAt
                                          ? new Date(attempt.completedAt).toLocaleString([], {
                                              month: 'short',
                                              day: 'numeric',
                                              year: 'numeric',
                                              hour: '2-digit',
                                              minute: '2-digit',
                                              second: '2-digit',
                                              hour12: true,
                                            })
                                          : '—'}
                                      </strong>
                                    </div>
                                    <div style={{ background: '#ffffff', border: '1px solid #E2E8F0', borderRadius: 6, padding: '0.4rem 0.65rem', fontSize: '0.75rem' }}>
                                      <span style={{ color: '#64748B' }}>Tab Switches: </span>
                                      <strong>{attempt.tabSwitchesCount || 0}</strong>
                                    </div>
                                    <div style={{ background: '#ffffff', border: '1px solid #E2E8F0', borderRadius: 6, padding: '0.4rem 0.65rem', fontSize: '0.75rem' }}>
                                      <span style={{ color: '#64748B' }}>Face Absences: </span>
                                      <strong>{attempt.faceMissingCount || 0}</strong>
                                    </div>
                                    <div style={{ background: '#ffffff', border: '1px solid #E2E8F0', borderRadius: 6, padding: '0.4rem 0.65rem', fontSize: '0.75rem' }}>
                                      <span style={{ color: '#64748B' }}>Phone Detections: </span>
                                      <strong>{attempt.phoneCount || 0}</strong>
                                    </div>
                                    <div style={{ background: '#ffffff', border: '1px solid #E2E8F0', borderRadius: 6, padding: '0.4rem 0.65rem', fontSize: '0.75rem' }}>
                                      <span style={{ color: '#64748B' }}>Total Away Time: </span>
                                      <strong>{attempt.totalAwaySeconds || 0}s</strong>
                                    </div>
                                  </div>

                                  {/* Photographic Evidence Gallery */}
                                  {attempt.photoEvidence.length > 0 && (
                                    <div>
                                      <div style={{ fontSize: '0.75rem', fontWeight: 650, color: '#334155', marginBottom: '0.35rem', display: 'flex', alignItems: 'center', gap: 4 }}>
                                        <Camera size={13} /> Photographic Snapshots ({attempt.photoEvidence.length}):
                                      </div>
                                      <div style={{ display: 'flex', gap: '0.5rem', overflowX: 'auto', paddingBottom: '0.35rem' }}>
                                        {attempt.photoEvidence.map((ev, evIdx) => (
                                          <div
                                            key={evIdx}
                                            onClick={() => ev.snapshot && setLightboxImage(ev.snapshot)}
                                            style={{
                                              width: 100,
                                              height: 75,
                                              borderRadius: 4,
                                              overflow: 'hidden',
                                              border: '1px solid #CBD5E1',
                                              cursor: 'pointer',
                                              flexShrink: 0,
                                              position: 'relative',
                                            }}
                                            title={ev.detail}
                                          >
                                            <img
                                              src={ev.snapshot}
                                              alt="Evidence"
                                              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                            />
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}

                                  {/* Question-by-Question Verification */}
                                  <div>
                                    <div style={{ fontSize: '0.75rem', fontWeight: 650, color: '#334155', marginBottom: '0.35rem' }}>
                                      Question Review:
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', maxHeight: 220, overflowY: 'auto' }}>
                                      {quiz.questions.map((q, qIdx) => {
                                        const candidateChoice = attempt.answers?.[q.id] ?? attempt.answers?.[`q-${qIdx}`] ?? attempt.answers?.[String(qIdx)] ?? attempt.answers?.[qIdx]
                                        const isCorrect = candidateChoice === q.correctIndex
                                        return (
                                          <div
                                            key={q.id || qIdx}
                                            style={{
                                              padding: '0.4rem 0.65rem',
                                              borderRadius: 4,
                                              background: '#ffffff',
                                              border: `1px solid ${isCorrect ? '#E2E8F0' : '#FECACA'}`,
                                              display: 'flex',
                                              alignItems: 'center',
                                              justifyContent: 'space-between',
                                              fontSize: '0.75rem',
                                            }}
                                          >
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                                              {isCorrect ? (
                                                <CheckCircle2 size={13} color="#059669" />
                                              ) : (
                                                <XCircle size={13} color="#DC2626" />
                                              )}
                                              <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: '#1E293B' }}>
                                                Q{qIdx + 1}. {q.question}
                                              </span>
                                            </div>
                                            <div style={{ fontSize: '0.72rem', color: '#64748B', flexShrink: 0 }}>
                                              Selected:{' '}
                                              <strong>
                                                {candidateChoice !== undefined && q.options[candidateChoice]
                                                  ? q.options[candidateChoice]
                                                  : 'Unanswered'}
                                              </strong>
                                              {!isCorrect && typeof q.correctIndex === 'number' && q.options[q.correctIndex] && (
                                                <span style={{ color: '#059669', marginLeft: 6 }}>
                                                  (Correct: {q.options[q.correctIndex]})
                                                </span>
                                              )}
                                            </div>
                                          </div>
                                        )
                                      })}
                                    </div>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Lightbox for Evidence Images */}
      {lightboxImage && (
        <div
          onClick={() => setLightboxImage(null)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 10000,
            background: 'rgba(11, 27, 51, 0.75)',
            backdropFilter: 'blur(6px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1.25rem',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: 480,
              width: '100%',
              background: '#ffffff',
              border: '2px solid #0b1b33',
              borderRadius: 14,
              boxShadow: '6px 6px 0 0 #0b1b33',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              animation: 'modalSlideIn 0.15s ease-out',
            }}
          >
            {/* Header */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0.85rem 1.15rem',
                borderBottom: '2px solid #0b1b33',
                background: '#F8FAFC',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Camera size={18} color="#2563EB" />
                <div>
                  <h4 style={{ margin: 0, fontSize: '0.92rem', fontWeight: 800, color: '#0b1b33' }}>
                    Forensic Photographic Snapshot
                  </h4>
                  <p style={{ margin: 0, fontSize: '0.72rem', color: '#64748B' }}>
                    Automated proctor capture recorded during active exam
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setLightboxImage(null)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  fontSize: '1.15rem',
                  fontWeight: 800,
                  color: '#64748B',
                  cursor: 'pointer',
                  padding: '0.2rem 0.5rem',
                  borderRadius: 6,
                }}
                title="Close"
              >
                ✕
              </button>
            </div>

            {/* Image Preview Viewport */}
            <div
              style={{
                background: '#0B132B',
                padding: '1.25rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <img
                src={lightboxImage}
                alt="Enlarged Forensic Evidence"
                style={{
                  maxWidth: '100%',
                  maxHeight: 320,
                  aspectRatio: '4 / 3',
                  objectFit: 'contain',
                  borderRadius: 8,
                  border: '1px solid #1E293B',
                  boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
                }}
              />
            </div>

            {/* Footer */}
            <div
              style={{
                padding: '0.75rem 1.15rem',
                background: '#ffffff',
                borderTop: '1px solid #E2E8F0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: '0.75rem',
                color: '#64748B',
              }}
            >
              <span>📷 Evidence preserved for academic integrity audit</span>
              <button
                type="button"
                onClick={() => setLightboxImage(null)}
                style={{
                  background: '#0b2545',
                  color: '#ffffff',
                  border: '1px solid #0b1b33',
                  borderRadius: 6,
                  padding: '0.35rem 0.85rem',
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
