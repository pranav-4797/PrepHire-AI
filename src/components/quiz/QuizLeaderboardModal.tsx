// ── Quiz Leaderboard & Submissions Dossier Modal ────────────────────────────
// Presents assessment submissions in a high-fidelity competitive leaderboard format
// with Top 3 Podium, ranks (🥇 🥈 🥉), cohort analytics, search/filter controls,
// CSV gradebook export, and comprehensive forensic proctoring audit dossiers.

import { useState, useMemo, Fragment } from 'react'
import type { ReactNode } from 'react'
import {
  Trophy,
  Crown,
  CheckCircle2,
  XCircle,
  ShieldCheck,
  ShieldAlert,
  Clock,
  ChevronDown,
  ChevronUp,
  Download,
  ExternalLink,
  Search,
  Megaphone,
  Camera,
  X,
  Users,
  RotateCcw,
} from 'lucide-react'
import { T } from '../../theme'
import type { Quiz, QuizAttempt } from '../../types/quiz'

function Pill({
  children,
  color = T.primary,
  bg = '#EFF6FF',
  border,
}: {
  children: ReactNode
  color?: string
  bg?: string
  border?: string
}) {
  return (
    <span
      style={{
        fontSize: '0.72rem',
        fontWeight: 700,
        padding: '0.2rem 0.55rem',
        borderRadius: 999,
        background: bg,
        color,
        border: border ? `1px solid ${border}` : 'none',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.25rem',
        lineHeight: 1.2,
      }}
    >
      {children}
    </span>
  )
}

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
  currentUserEmail?: string
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

function scoreBadgeColor(percentage: number): { text: string; bg: string; border: string } {
  if (percentage >= 85) return { text: '#1D4ED8', bg: '#EFF6FF', border: '#BFDBFE' }
  if (percentage >= 70) return { text: '#047857', bg: '#ECFDF5', border: '#A7F3D0' }
  if (percentage >= 50) return { text: '#B45309', bg: '#FFFBEB', border: '#FDE68A' }
  return { text: '#B91C1C', bg: '#FEF2F2', border: '#FECACA' }
}

export function QuizLeaderboardModal({
  quiz,
  attempts,
  currentUserEmail,
  userRole = 'admin',
  loading = false,
  onClose,
  onToggleDeclareResults,
  onResetAttempt,
  showToast,
}: QuizLeaderboardModalProps) {
  const [searchTerm, setSearchTerm] = useState('')
  const [filterMode, setFilterMode] = useState<'all' | 'passed' | 'retake' | 'flagged' | 'clean'>('all')
  const [sortBy, setSortBy] = useState<'rank' | 'fastest' | 'integrity' | 'latest' | 'lowest'>('rank')
  const [viewLayout, setViewLayout] = useState<'table' | 'cards'>('table')
  const [expandedAttemptId, setExpandedAttemptId] = useState<string | null>(null)
  const [previewSnapshot, setPreviewSnapshot] = useState<{ src: string; caption: string } | null>(null)

  // ── Compute Rankings & Enhanced Telemetry ─────────────────────────────────
  const rankedAttempts = useMemo<RankedAttempt[]>(() => {
    if (!attempts || attempts.length === 0) return []

    // 1. Sort by performance for official rank assignment
    const sorted = [...attempts].sort((a, b) => {
      // Primary: Score points descending
      if (b.score !== a.score) return b.score - a.score
      // Secondary: Percentage descending
      if (b.percentage !== a.percentage) return b.percentage - a.percentage
      // Tertiary: Time spent ascending (faster is ranked higher)
      const aTime = a.timeSpentSeconds || 99999
      const bTime = b.timeSpentSeconds || 99999
      if (aTime !== bTime) return aTime - bTime
      // Quaternary: Integrity descending
      const aInt = a.integrityScore ?? 100
      const bInt = b.integrityScore ?? 100
      if (bInt !== aInt) return bInt - aInt
      // Earlier completedAt
      return new Date(a.completedAt).getTime() - new Date(b.completedAt).getTime()
    })

    // 2. Assign standard ranks and parse telemetry
    return sorted.map((att, idx) => {
      const rawFlags: any[] = Array.isArray(att.suspiciousFlags)
        ? att.suspiciousFlags.map((f) =>
            typeof f === 'string' ? { timestamp: '', type: 'other', detail: f } : f
          )
        : []

      const phoneCount = rawFlags.filter((f) => f.type === 'cell_phone').length
      const tamperCount = rawFlags.filter((f) => f.type === 'tamper_attempt').length
      const audioCount =
        (att.audioAnomaliesCount || 0) || rawFlags.filter((f) => f.type === 'audio_anomaly').length

      const telemetrySum =
        (att.tabSwitchesCount || 0) +
        (att.fullscreenViolationsCount || 0) +
        (att.faceMissingCount || 0) +
        (att.multipleFacesCount || 0) +
        audioCount +
        phoneCount +
        tamperCount

      const violationCount = Math.max(rawFlags.length, telemetrySum)
      const calculatedIntegrity =
        att.integrityScore !== undefined
          ? att.integrityScore
          : Math.max(0, 100 - violationCount * 12)

      const photoEvidence = rawFlags.filter((f) => !!f.snapshot)

      return {
        ...att,
        rank: idx + 1,
        violationCount,
        phoneCount,
        tamperCount,
        audioCount,
        calculatedIntegrity,
        photoEvidence,
      }
    })
  }, [attempts])

  // ── Cohort Summary Analytics ──────────────────────────────────────────────
  const stats = useMemo(() => {
    if (rankedAttempts.length === 0) {
      return { total: 0, high: 0, avg: 0, passRate: 0, avgIntegrity: 100, passed: 0, retake: 0, clean: 0, flagged: 0 }
    }
    const total = rankedAttempts.length
    const high = Math.max(...rankedAttempts.map((a) => a.score))
    const avg = Math.round(rankedAttempts.reduce((s, a) => s + (a.percentage || 0), 0) / total)
    const passed = rankedAttempts.filter((a) => a.passed).length
    const passRate = Math.round((passed / total) * 100)
    const avgIntegrity = Math.round(
      rankedAttempts.reduce((s, a) => s + a.calculatedIntegrity, 0) / total
    )
    const clean = rankedAttempts.filter((a) => a.violationCount === 0).length
    const flagged = total - clean

    return { total, high, avg, passRate, avgIntegrity, passed, retake: total - passed, clean, flagged }
  }, [rankedAttempts])

  // ── Filter & Search Logic ─────────────────────────────────────────────────
  const filteredAndSorted = useMemo(() => {
    let list = [...rankedAttempts]

    // Search filter
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

    // Status filter
    if (filterMode === 'passed') {
      list = list.filter((a) => a.passed)
    } else if (filterMode === 'retake') {
      list = list.filter((a) => !a.passed)
    } else if (filterMode === 'flagged') {
      list = list.filter((a) => a.violationCount > 0)
    } else if (filterMode === 'clean') {
      list = list.filter((a) => a.violationCount === 0)
    }

    // Sort
    if (sortBy === 'rank') {
      list.sort((a, b) => a.rank - b.rank)
    } else if (sortBy === 'fastest') {
      list.sort((a, b) => (a.timeSpentSeconds || 99999) - (b.timeSpentSeconds || 99999))
    } else if (sortBy === 'integrity') {
      list.sort((a, b) => b.calculatedIntegrity - a.calculatedIntegrity)
    } else if (sortBy === 'latest') {
      list.sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime())
    } else if (sortBy === 'lowest') {
      list.sort((a, b) => a.score - b.score)
    }

    return list
  }, [rankedAttempts, searchTerm, filterMode, sortBy])

  // ── CSV Gradebook Export ──────────────────────────────────────────────────
  function handleExportCSV() {
    if (rankedAttempts.length === 0) return

    const headers = [
      'Rank',
      'Student Name',
      'Email',
      'Department',
      'Roll Number',
      'Score',
      'Max Score',
      'Percentage',
      'Verdict',
      'Time Spent (Seconds)',
      'Formatted Time',
      'Integrity Score',
      'Violations Count',
      'Drive Evidence Folder',
      'Submission Timestamp',
    ]

    const rows = rankedAttempts.map((a) => [
      a.rank,
      `"${(a.studentName || a.studentEmail.split('@')[0] || '').replace(/"/g, '""')}"`,
      `"${a.studentEmail.replace(/"/g, '""')}"`,
      `"${(a.department || 'General').replace(/"/g, '""')}"`,
      `"${(a.rollNumber || '').replace(/"/g, '""')}"`,
      a.score,
      a.maxScore,
      `${a.percentage}%`,
      a.passed ? 'PASSED' : 'NEEDS_RETAKE',
      a.timeSpentSeconds,
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
    link.setAttribute('href', url)
    link.setAttribute(
      'download',
      `${(quiz.title || 'Assessment').replace(/[^a-zA-Z0-9_-]/g, '_')}_Leaderboard_Gradebook.csv`
    )
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)

    if (showToast) {
      showToast('Assessment gradebook CSV exported successfully!', 'success')
    }
  }

  // Helper for rank medal visual
  const renderRankMedal = (rank: number) => {
    if (rank === 1) {
      return (
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 32,
            height: 32,
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #FDE68A, #F59E0B)',
            color: '#78350F',
            fontSize: '1rem',
            fontWeight: 800,
            boxShadow: '0 2px 6px rgba(245, 158, 11, 0.4)',
          }}
          title="1st Place - Gold Medal"
        >
          🥇
        </span>
      )
    }
    if (rank === 2) {
      return (
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 30,
            height: 30,
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #E2E8F0, #94A3B8)',
            color: '#1E293B',
            fontSize: '0.95rem',
            fontWeight: 800,
            boxShadow: '0 2px 4px rgba(148, 163, 184, 0.4)',
          }}
          title="2nd Place - Silver Medal"
        >
          🥈
        </span>
      )
    }
    if (rank === 3) {
      return (
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 28,
            height: 28,
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #FED7AA, #D97706)',
            color: '#7C2D12',
            fontSize: '0.9rem',
            fontWeight: 800,
            boxShadow: '0 2px 4px rgba(217, 119, 6, 0.3)',
          }}
          title="3rd Place - Bronze Medal"
        >
          🥉
        </span>
      )
    }
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          minWidth: 26,
          height: 26,
          borderRadius: 6,
          background: '#F3F4F6',
          color: T.txtSec,
          fontSize: '0.8rem',
          fontWeight: 700,
        }}
      >
        #{rank}
      </span>
    )
  }

  const top3 = rankedAttempts.slice(0, 3)

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.65)',
        backdropFilter: 'blur(5px)',
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
          maxWidth: 1040,
          width: '100%',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)',
          overflow: 'hidden',
        }}
      >
        {/* ── Modal Header ─────────────────────────────────────────────────── */}
        <div
          style={{
            padding: '1.25rem 1.5rem',
            background: 'linear-gradient(135deg, #001E40, #0F3764)',
            color: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '1rem',
            borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                background: 'rgba(255, 255, 255, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Trophy size={22} color="#FEA619" />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, color: '#ffffff' }}>
                  {quiz.title}
                </h2>
                <Pill color="#ffffff" bg="rgba(255, 255, 255, 0.2)">
                  Official Leaderboard
                </Pill>
              </div>
              <p style={{ margin: '0.2rem 0 0', fontSize: '0.8rem', color: '#CBD5E1' }}>
                {quiz.category ? `${quiz.category} • ` : ''}
                Target: {quiz.passingPercentage || 60}% • Total Submissions: {attempts.length}
              </p>
            </div>
          </div>

          {/* Header Action Buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            {userRole !== 'student' && onToggleDeclareResults && (
              <button
                onClick={() => onToggleDeclareResults(quiz)}
                title={
                  quiz.resultsDeclared
                    ? 'Click to withhold results from candidates'
                    : 'Click to declare and release results and answers to all candidates'
                }
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  background: quiz.resultsDeclared ? '#ECFDF5' : '#FFFBEB',
                  color: quiz.resultsDeclared ? '#047857' : '#B45309',
                  border: `1px solid ${quiz.resultsDeclared ? '#A7F3D0' : '#FDE68A'}`,
                  borderRadius: 8,
                  padding: '0.45rem 0.85rem',
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                <Megaphone size={14} />
                <span>{quiz.resultsDeclared ? 'Results: Live (Declared)' : '📢 Declare Results'}</span>
              </button>
            )}

            <button
              onClick={handleExportCSV}
              disabled={rankedAttempts.length === 0}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem',
                background: 'rgba(255, 255, 255, 0.15)',
                color: '#ffffff',
                border: '1px solid rgba(255, 255, 255, 0.25)',
                borderRadius: 8,
                padding: '0.45rem 0.85rem',
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: rankedAttempts.length === 0 ? 'not-allowed' : 'pointer',
              }}
              title="Download assessment gradebook as CSV"
            >
              <Download size={14} />
              <span>Export CSV</span>
            </button>

            <button
              onClick={onClose}
              style={{
                background: 'rgba(255, 255, 255, 0.2)',
                border: 'none',
                borderRadius: 8,
                padding: '0.45rem 0.65rem',
                color: '#ffffff',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              title="Close Leaderboard"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* ── Scrollable Body ──────────────────────────────────────────────── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem 1.5rem', background: '#F8FAFC' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '3.5rem 0', color: T.txtSec }}>
              <div
                style={{
                  width: 36,
                  height: 36,
                  border: '3px solid #E2E8F0',
                  borderTopColor: T.primary,
                  borderRadius: '50%',
                  margin: '0 auto 1rem',
                  animation: 'spin 0.8s linear infinite',
                }}
              />
              <p style={{ fontWeight: 600, fontSize: '0.92rem' }}>Loading assessment submissions & rankings...</p>
            </div>
          ) : rankedAttempts.length === 0 ? (
            <div
              style={{
                textAlign: 'center',
                padding: '4rem 1rem',
                background: '#ffffff',
                borderRadius: 14,
                border: '1px dashed #CBD5E1',
              }}
            >
              <Users size={44} color="#94A3B8" style={{ marginBottom: '0.75rem' }} />
              <h3 style={{ margin: '0 0 0.35rem', fontSize: '1.1rem', color: T.txtPri }}>No Submissions Yet</h3>
              <p style={{ margin: 0, fontSize: '0.85rem', color: T.txtSec }}>
                Candidates who take and submit this assessment will appear here ranked by score and speed.
              </p>
            </div>
          ) : (
            <>
              {/* ── Top 3 Podium (When 2 or more attempts exist) ─────────────── */}
              {top3.length >= 2 && (
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: top3.length === 2 ? 'repeat(2, 1fr)' : 'repeat(3, 1fr)',
                    gap: '1rem',
                    marginBottom: '1.25rem',
                  }}
                >
                  {/* #2 Silver (Left) */}
                  {top3[1] && (
                    <div
                      style={{
                        background: '#ffffff',
                        border: '1.5px solid #CBD5E1',
                        borderRadius: 14,
                        padding: '1rem',
                        textAlign: 'center',
                        position: 'relative',
                        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)',
                      }}
                    >
                      <div
                        style={{
                          position: 'absolute',
                          top: -12,
                          left: '50%',
                          transform: 'translateX(-50%)',
                          background: 'linear-gradient(135deg, #E2E8F0, #94A3B8)',
                          color: '#0F172A',
                          borderRadius: 20,
                          padding: '0.15rem 0.65rem',
                          fontSize: '0.72rem',
                          fontWeight: 800,
                          boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
                        }}
                      >
                        🥈 2nd Place
                      </div>
                      <div style={{ marginTop: '0.5rem', fontWeight: 700, fontSize: '0.95rem', color: T.txtPri }}>
                        {top3[1].studentName || top3[1].studentEmail.split('@')[0]}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: T.txtSec, marginBottom: '0.5rem' }}>
                        {top3[1].department || 'General'}
                      </div>
                      <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#334155' }}>
                        {top3[1].score}/{top3[1].maxScore}{' '}
                        <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#64748B' }}>
                          ({top3[1].percentage}%)
                        </span>
                      </div>
                      <div style={{ fontSize: '0.75rem', color: T.txtMut, marginTop: '0.25rem' }}>
                        ⏱️ {formatDuration(top3[1].timeSpentSeconds)} • 🛡️ {top3[1].calculatedIntegrity}% Clean
                      </div>
                    </div>
                  )}

                  {/* #1 Gold (Center, Elevated) */}
                  {top3[0] && (
                    <div
                      style={{
                        background: 'linear-gradient(180deg, #FFFBEB 0%, #FFFFFF 100%)',
                        border: '2px solid #F59E0B',
                        borderRadius: 14,
                        padding: '1.2rem 1rem',
                        textAlign: 'center',
                        position: 'relative',
                        boxShadow: '0 8px 16px -2px rgba(245, 158, 11, 0.2)',
                        transform: top3.length === 3 ? 'scale(1.02)' : 'none',
                      }}
                    >
                      <div
                        style={{
                          position: 'absolute',
                          top: -14,
                          left: '50%',
                          transform: 'translateX(-50%)',
                          background: 'linear-gradient(135deg, #FDE68A, #F59E0B)',
                          color: '#78350F',
                          borderRadius: 20,
                          padding: '0.2rem 0.85rem',
                          fontSize: '0.76rem',
                          fontWeight: 800,
                          boxShadow: '0 2px 6px rgba(245, 158, 11, 0.4)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.25rem',
                        }}
                      >
                        <Crown size={13} /> 🥇 1st Place Champion
                      </div>
                      <div style={{ marginTop: '0.4rem', fontWeight: 800, fontSize: '1.05rem', color: '#78350F' }}>
                        {top3[0].studentName || top3[0].studentEmail.split('@')[0]}
                      </div>
                      <div style={{ fontSize: '0.76rem', color: '#92400E', marginBottom: '0.5rem' }}>
                        {top3[0].department || 'General'}
                      </div>
                      <div style={{ fontSize: '1.45rem', fontWeight: 900, color: '#B45309' }}>
                        {top3[0].score}/{top3[0].maxScore}{' '}
                        <span style={{ fontSize: '0.92rem', fontWeight: 800, color: '#D97706' }}>
                          ({top3[0].percentage}%)
                        </span>
                      </div>
                      <div style={{ fontSize: '0.76rem', color: '#78350F', fontWeight: 600, marginTop: '0.25rem' }}>
                        ⚡ {formatDuration(top3[0].timeSpentSeconds)} • 🛡️ {top3[0].calculatedIntegrity}% Integrity
                      </div>
                    </div>
                  )}

                  {/* #3 Bronze (Right) */}
                  {top3[2] && (
                    <div
                      style={{
                        background: '#ffffff',
                        border: '1.5px solid #FED7AA',
                        borderRadius: 14,
                        padding: '1rem',
                        textAlign: 'center',
                        position: 'relative',
                        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)',
                      }}
                    >
                      <div
                        style={{
                          position: 'absolute',
                          top: -12,
                          left: '50%',
                          transform: 'translateX(-50%)',
                          background: 'linear-gradient(135deg, #FED7AA, #D97706)',
                          color: '#7C2D12',
                          borderRadius: 20,
                          padding: '0.15rem 0.65rem',
                          fontSize: '0.72rem',
                          fontWeight: 800,
                          boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
                        }}
                      >
                        🥉 3rd Place
                      </div>
                      <div style={{ marginTop: '0.5rem', fontWeight: 700, fontSize: '0.95rem', color: T.txtPri }}>
                        {top3[2].studentName || top3[2].studentEmail.split('@')[0]}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: T.txtSec, marginBottom: '0.5rem' }}>
                        {top3[2].department || 'General'}
                      </div>
                      <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#9A3412' }}>
                        {top3[2].score}/{top3[2].maxScore}{' '}
                        <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#C2410C' }}>
                          ({top3[2].percentage}%)
                        </span>
                      </div>
                      <div style={{ fontSize: '0.75rem', color: T.txtMut, marginTop: '0.25rem' }}>
                        ⏱️ {formatDuration(top3[2].timeSpentSeconds)} • 🛡️ {top3[2].calculatedIntegrity}% Clean
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ── Cohort Summary Analytics Cards ──────────────────────────── */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
                  gap: '0.75rem',
                  marginBottom: '1.25rem',
                }}
              >
                <div
                  style={{
                    background: '#ffffff',
                    border: '1px solid #E2E8F0',
                    borderRadius: 10,
                    padding: '0.75rem',
                    textAlign: 'center',
                  }}
                >
                  <div style={{ fontSize: '0.72rem', color: T.txtMut, fontWeight: 700, textTransform: 'uppercase' }}>
                    Candidates
                  </div>
                  <div style={{ fontSize: '1.3rem', fontWeight: 800, color: T.txtPri, marginTop: 2 }}>
                    {stats.total}
                  </div>
                  <div style={{ fontSize: '0.7rem', color: T.txtSec }}>100% submitted</div>
                </div>

                <div
                  style={{
                    background: '#ffffff',
                    border: '1px solid #E2E8F0',
                    borderRadius: 10,
                    padding: '0.75rem',
                    textAlign: 'center',
                  }}
                >
                  <div style={{ fontSize: '0.72rem', color: T.txtMut, fontWeight: 700, textTransform: 'uppercase' }}>
                    Top Score
                  </div>
                  <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#047857', marginTop: 2 }}>
                    {stats.high} pts
                  </div>
                  <div style={{ fontSize: '0.7rem', color: T.txtSec }}>Highest achieved</div>
                </div>

                <div
                  style={{
                    background: '#ffffff',
                    border: '1px solid #E2E8F0',
                    borderRadius: 10,
                    padding: '0.75rem',
                    textAlign: 'center',
                  }}
                >
                  <div style={{ fontSize: '0.72rem', color: T.txtMut, fontWeight: 700, textTransform: 'uppercase' }}>
                    Cohort Average
                  </div>
                  <div style={{ fontSize: '1.3rem', fontWeight: 800, color: T.primary, marginTop: 2 }}>
                    {stats.avg}%
                  </div>
                  <div style={{ fontSize: '0.7rem', color: T.txtSec }}>Average grade</div>
                </div>

                <div
                  style={{
                    background: '#ffffff',
                    border: '1px solid #E2E8F0',
                    borderRadius: 10,
                    padding: '0.75rem',
                    textAlign: 'center',
                  }}
                >
                  <div style={{ fontSize: '0.72rem', color: T.txtMut, fontWeight: 700, textTransform: 'uppercase' }}>
                    Pass Rate
                  </div>
                  <div
                    style={{
                      fontSize: '1.3rem',
                      fontWeight: 800,
                      color: stats.passRate >= 60 ? '#047857' : '#DC2626',
                      marginTop: 2,
                    }}
                  >
                    {stats.passRate}%
                  </div>
                  <div style={{ fontSize: '0.7rem', color: T.txtSec }}>
                    {stats.passed} of {stats.total} passed
                  </div>
                </div>

                <div
                  style={{
                    background: '#ffffff',
                    border: '1px solid #E2E8F0',
                    borderRadius: 10,
                    padding: '0.75rem',
                    textAlign: 'center',
                  }}
                >
                  <div style={{ fontSize: '0.72rem', color: T.txtMut, fontWeight: 700, textTransform: 'uppercase' }}>
                    Avg Integrity
                  </div>
                  <div
                    style={{
                      fontSize: '1.3rem',
                      fontWeight: 800,
                      color: stats.avgIntegrity >= 80 ? '#047857' : '#D97706',
                      marginTop: 2,
                    }}
                  >
                    {stats.avgIntegrity}%
                  </div>
                  <div style={{ fontSize: '0.7rem', color: T.txtSec }}>{stats.clean} clean test sessions</div>
                </div>
              </div>

              {/* ── Controls Bar: Filters, Search, Sort & View Toggle ───────── */}
              <div
                style={{
                  background: '#ffffff',
                  border: '1px solid #E2E8F0',
                  borderRadius: 12,
                  padding: '0.85rem 1rem',
                  marginBottom: '1rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '0.75rem',
                }}
              >
                {/* Search */}
                <div style={{ position: 'relative', flex: '1 1 200px', maxWidth: 300 }}>
                  <Search
                    size={15}
                    color="#94A3B8"
                    style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }}
                  />
                  <input
                    type="text"
                    placeholder="Search candidate, email, roll..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.45rem 0.65rem 0.45rem 2rem',
                      borderRadius: 8,
                      border: '1px solid #CBD5E1',
                      fontSize: '0.82rem',
                      color: T.txtPri,
                      boxSizing: 'border-box',
                    }}
                  />
                </div>

                {/* Filter Pills */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
                  {(
                    [
                      { id: 'all', label: `All (${rankedAttempts.length})` },
                      { id: 'passed', label: `Passed (${stats.passed})` },
                      { id: 'retake', label: `Retake (${stats.retake})` },
                      { id: 'flagged', label: `Flagged (${stats.flagged})` },
                      { id: 'clean', label: `Clean (${stats.clean})` },
                    ] as const
                  ).map((f) => (
                    <button
                      key={f.id}
                      onClick={() => setFilterMode(f.id)}
                      style={{
                        padding: '0.35rem 0.65rem',
                        borderRadius: 6,
                        border: filterMode === f.id ? `1.5px solid ${T.primary}` : '1px solid #E2E8F0',
                        background: filterMode === f.id ? T.primary : '#F8FAFC',
                        color: filterMode === f.id ? '#ffffff' : T.txtSec,
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>

                {/* Sort Selector & Layout Toggle */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ fontSize: '0.75rem', color: T.txtMut, fontWeight: 600 }}>Sort:</span>
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                    style={{
                      padding: '0.35rem 0.5rem',
                      borderRadius: 6,
                      border: '1px solid #CBD5E1',
                      fontSize: '0.78rem',
                      fontWeight: 600,
                      color: T.txtPri,
                      background: '#ffffff',
                    }}
                  >
                    <option value="rank">Rank (Highest Score)</option>
                    <option value="fastest">Fastest Completion</option>
                    <option value="integrity">Cleanest Integrity</option>
                    <option value="latest">Latest Submission</option>
                    <option value="lowest">Lowest Score</option>
                  </select>

                  <div style={{ display: 'flex', border: '1px solid #E2E8F0', borderRadius: 6, overflow: 'hidden' }}>
                    <button
                      onClick={() => setViewLayout('table')}
                      title="Leaderboard Table View"
                      style={{
                        padding: '0.35rem 0.55rem',
                        background: viewLayout === 'table' ? '#E2E8F0' : '#ffffff',
                        border: 'none',
                        cursor: 'pointer',
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        color: T.txtPri,
                      }}
                    >
                      Table
                    </button>
                    <button
                      onClick={() => setViewLayout('cards')}
                      title="Cards View"
                      style={{
                        padding: '0.35rem 0.55rem',
                        background: viewLayout === 'cards' ? '#E2E8F0' : '#ffffff',
                        border: 'none',
                        cursor: 'pointer',
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        color: T.txtPri,
                      }}
                    >
                      Cards
                    </button>
                  </div>
                </div>
              </div>

              {/* ── Leaderboard View: Structured Table ───────────────────────── */}
              {viewLayout === 'table' ? (
                <div
                  style={{
                    background: '#ffffff',
                    border: '1px solid #E2E8F0',
                    borderRadius: 14,
                    overflow: 'hidden',
                    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
                  }}
                >
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: 780 }}>
                      <thead>
                        <tr
                          style={{
                            background: '#F1F5F9',
                            borderBottom: '1.5px solid #CBD5E1',
                            color: '#475569',
                            fontSize: '0.72rem',
                            fontWeight: 800,
                            textTransform: 'uppercase',
                            letterSpacing: '0.04em',
                          }}
                        >
                          <th style={{ padding: '0.75rem 0.85rem', width: 60, textAlign: 'center' }}>Rank</th>
                          <th style={{ padding: '0.75rem 0.85rem' }}>Candidate</th>
                          <th style={{ padding: '0.75rem 0.85rem' }}>Score</th>
                          <th style={{ padding: '0.75rem 0.85rem' }}>Accuracy</th>
                          <th style={{ padding: '0.75rem 0.85rem' }}>Time</th>
                          <th style={{ padding: '0.75rem 0.85rem' }}>Integrity</th>
                          <th style={{ padding: '0.75rem 0.85rem' }}>Status</th>
                          {userRole !== 'student' && <th style={{ padding: '0.75rem 0.85rem' }}>Drive Folder</th>}
                          <th style={{ padding: '0.75rem 0.85rem', textAlign: 'right' }}>Dossier</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredAndSorted.length === 0 ? (
                          <tr>
                            <td
                              colSpan={userRole !== 'student' ? 9 : 8}
                              style={{ textAlign: 'center', padding: '2.5rem', color: T.txtMut, fontSize: '0.88rem' }}
                            >
                              No candidates match the selected filters.
                            </td>
                          </tr>
                        ) : (
                          filteredAndSorted.map((att) => {
                            const isSelf = currentUserEmail && att.studentEmail.toLowerCase() === currentUserEmail.toLowerCase()
                            const isExpanded = expandedAttemptId === att.id
                            const scoreColors = scoreBadgeColor(att.percentage)

                            return (
                              <Fragment key={att.id}>
                                <tr
                                  onClick={() => setExpandedAttemptId(isExpanded ? null : att.id)}
                                  style={{
                                    borderBottom: '1px solid #E2E8F0',
                                    background: isSelf
                                      ? '#EFF6FF'
                                      : isExpanded
                                      ? '#F8FAFC'
                                      : 'transparent',
                                    fontSize: '0.82rem',
                                    color: T.txtPri,
                                    cursor: 'pointer',
                                    transition: 'background 0.1s ease',
                                  }}
                                >
                                  {/* Rank */}
                                  <td style={{ padding: '0.85rem 0.75rem', textAlign: 'center' }}>
                                    {renderRankMedal(att.rank)}
                                  </td>

                                  {/* Candidate */}
                                  <td style={{ padding: '0.85rem 0.75rem' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
                                      <span style={{ fontWeight: 700, color: T.txtPri }}>
                                        {att.studentName || att.studentEmail.split('@')[0]}
                                      </span>
                                      {isSelf && <Pill color="#ffffff" bg={T.primary}>You</Pill>}
                                      {att.isPublicCandidate && (
                                        <Pill color="#2563EB" bg="#EFF6FF">
                                          🌐 Public
                                        </Pill>
                                      )}
                                      {att.rollNumber && (
                                        <Pill color="#475569" bg="#F1F5F9">
                                          Roll: {att.rollNumber}
                                        </Pill>
                                      )}
                                    </div>
                                    <div style={{ fontSize: '0.72rem', color: T.txtMut, marginTop: 2 }}>
                                      {att.studentEmail} • {att.department || 'Engineering'}
                                    </div>
                                  </td>

                                  {/* Score Points */}
                                  <td style={{ padding: '0.85rem 0.75rem', fontWeight: 700, fontSize: '0.9rem' }}>
                                    {att.score} / {att.maxScore} pts
                                  </td>

                                  {/* Percentage */}
                                  <td style={{ padding: '0.85rem 0.75rem' }}>
                                    <span
                                      style={{
                                        padding: '0.2rem 0.55rem',
                                        borderRadius: 6,
                                        fontSize: '0.78rem',
                                        fontWeight: 800,
                                        background: scoreColors.bg,
                                        color: scoreColors.text,
                                        border: `1px solid ${scoreColors.border}`,
                                      }}
                                    >
                                      {att.percentage}%
                                    </span>
                                  </td>

                                  {/* Time Spent */}
                                  <td style={{ padding: '0.85rem 0.75rem', color: T.txtSec, fontWeight: 600 }}>
                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                                      <Clock size={12} color="#64748B" />
                                      {formatDuration(att.timeSpentSeconds)}
                                    </span>
                                  </td>

                                  {/* Integrity */}
                                  <td style={{ padding: '0.85rem 0.75rem' }}>
                                    <span
                                      style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '0.25rem',
                                        padding: '0.2rem 0.5rem',
                                        borderRadius: 6,
                                        fontSize: '0.72rem',
                                        fontWeight: 700,
                                        background: att.violationCount > 0 ? '#FEF2F2' : '#ECFDF5',
                                        color: att.violationCount > 0 ? '#DC2626' : '#059669',
                                        border: `1px solid ${att.violationCount > 0 ? '#FCA5A5' : '#A7F3D0'}`,
                                      }}
                                    >
                                      {att.violationCount > 0 ? (
                                        <>
                                          <ShieldAlert size={12} />
                                          {att.violationCount} Flag{att.violationCount > 1 ? 's' : ''} ({att.calculatedIntegrity}%)
                                        </>
                                      ) : (
                                        <>
                                          <ShieldCheck size={12} />
                                          100% Clean
                                        </>
                                      )}
                                    </span>
                                  </td>

                                  {/* Verdict Status */}
                                  <td style={{ padding: '0.85rem 0.75rem' }}>
                                    <span
                                      style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '0.25rem',
                                        padding: '0.2rem 0.55rem',
                                        borderRadius: 6,
                                        fontSize: '0.74rem',
                                        fontWeight: 700,
                                        background: att.passed ? '#ECFDF5' : '#FEF2F2',
                                        color: att.passed ? '#059669' : '#DC2626',
                                      }}
                                    >
                                      {att.passed ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
                                      {att.passed ? 'Passed' : 'Needs Retake'}
                                    </span>
                                  </td>

                                  {/* Drive Link (Admin/Faculty) */}
                                  {userRole !== 'student' && (
                                    <td style={{ padding: '0.85rem 0.75rem' }}>
                                      {att.driveEvidenceFolderLink ? (
                                        <a
                                          href={att.driveEvidenceFolderLink}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          onClick={(e) => e.stopPropagation()}
                                          style={{
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '0.25rem',
                                            padding: '0.25rem 0.55rem',
                                            borderRadius: 6,
                                            background: '#EFF6FF',
                                            color: '#1D4ED8',
                                            fontSize: '0.72rem',
                                            fontWeight: 700,
                                            textDecoration: 'none',
                                            border: '1px solid #BFDBFE',
                                          }}
                                          title="Open student evidence folder in Google Drive"
                                        >
                                          📁 Drive <ExternalLink size={10} />
                                        </a>
                                      ) : (
                                        <span style={{ fontSize: '0.72rem', color: T.txtMut }}>—</span>
                                      )}
                                    </td>
                                  )}

                                  {/* Expand Chevron */}
                                  <td style={{ padding: '0.85rem 0.75rem', textAlign: 'right' }}>
                                    <button
                                      style={{
                                        background: 'none',
                                        border: 'none',
                                        cursor: 'pointer',
                                        color: T.txtSec,
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                      }}
                                    >
                                      {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                    </button>
                                  </td>
                                </tr>

                                {/* Expanded Audit Dossier */}
                                {isExpanded && (
                                  <tr>
                                    <td
                                      colSpan={userRole !== 'student' ? 9 : 8}
                                      style={{
                                        padding: '1.25rem',
                                        background: '#F8FAFC',
                                        borderBottom: '2px solid #E2E8F0',
                                      }}
                                    >
                                      <AuditDossierView
                                        quiz={quiz}
                                        attempt={att}
                                        userRole={userRole}
                                        onResetAttempt={onResetAttempt}
                                        onPreviewSnapshot={(src, caption) =>
                                          setPreviewSnapshot({ src, caption })
                                        }
                                      />
                                    </td>
                                  </tr>
                                )}
                              </Fragment>
                            )
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                /* ── Card Layout View ───────────────────────────────────────── */
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {filteredAndSorted.map((att) => {
                    const isSelf = currentUserEmail && att.studentEmail.toLowerCase() === currentUserEmail.toLowerCase()
                    const isExpanded = expandedAttemptId === att.id

                    return (
                      <div
                        key={att.id}
                        style={{
                          borderRadius: 12,
                          border: isSelf ? `2px solid ${T.primary}` : '1px solid #E2E8F0',
                          background: '#ffffff',
                          overflow: 'hidden',
                          boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                        }}
                      >
                        <div
                          onClick={() => setExpandedAttemptId(isExpanded ? null : att.id)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '1rem',
                            cursor: 'pointer',
                            gap: '0.75rem',
                            flexWrap: 'wrap',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
                            {renderRankMedal(att.rank)}
                            <div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
                                <span style={{ fontWeight: 800, fontSize: '0.95rem', color: T.txtPri }}>
                                  {att.studentName || att.studentEmail.split('@')[0]}
                                </span>
                                {isSelf && <Pill color="#ffffff" bg={T.primary}>You</Pill>}
                                {att.isPublicCandidate && <Pill color="#2563EB" bg="#EFF6FF">🌐 Public Link</Pill>}
                                {att.rollNumber && <Pill color="#475569" bg="#F1F5F9">Roll: {att.rollNumber}</Pill>}
                              </div>
                              <div style={{ fontSize: '0.75rem', color: T.txtMut, marginTop: 2 }}>
                                {att.studentEmail} • {att.department || 'General'} • {new Date(att.completedAt).toLocaleString()}
                              </div>
                            </div>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                            <span
                              style={{
                                padding: '0.25rem 0.65rem',
                                borderRadius: 6,
                                fontSize: '0.8rem',
                                fontWeight: 800,
                                background: att.passed ? '#ECFDF5' : '#FEF2F2',
                                color: att.passed ? '#059669' : '#DC2626',
                              }}
                            >
                              {att.score}/{att.maxScore} ({att.percentage}%)
                            </span>

                            <span
                              style={{
                                padding: '0.25rem 0.55rem',
                                borderRadius: 6,
                                fontSize: '0.74rem',
                                fontWeight: 700,
                                background: att.violationCount > 0 ? '#FEF2F2' : '#ECFDF5',
                                color: att.violationCount > 0 ? '#DC2626' : '#059669',
                              }}
                            >
                              {att.violationCount > 0 ? `🚨 ${att.violationCount} Flags` : '🛡️ Clean'}
                            </span>

                            {isExpanded ? <ChevronUp size={18} color="#64748B" /> : <ChevronDown size={18} color="#64748B" />}
                          </div>
                        </div>

                        {isExpanded && (
                          <div style={{ padding: '1rem', borderTop: '1px solid #E2E8F0', background: '#F8FAFC' }}>
                            <AuditDossierView
                              quiz={quiz}
                              attempt={att}
                              userRole={userRole}
                              onResetAttempt={onResetAttempt}
                              onPreviewSnapshot={(src, caption) =>
                                setPreviewSnapshot({ src, caption })
                              }
                            />
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </>
          )}
        </div>

        {/* ── Modal Footer ─────────────────────────────────────────────────── */}
        <div
          style={{
            padding: '0.85rem 1.5rem',
            background: '#ffffff',
            borderTop: '1px solid #E2E8F0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '0.78rem',
            color: T.txtSec,
          }}
        >
          <div>
            Showing <strong>{filteredAndSorted.length}</strong> of <strong>{rankedAttempts.length}</strong> ranked candidates
          </div>

          <button
            onClick={onClose}
            style={{
              background: '#F1F5F9',
              color: T.txtPri,
              border: 'none',
              borderRadius: 8,
              padding: '0.45rem 1rem',
              fontSize: '0.82rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Close Leaderboard
          </button>
        </div>
      </div>

      {/* ── Lightbox Preview Modal for Photographic Evidence ─────────────── */}
      {previewSnapshot && (
        <div
          onClick={() => setPreviewSnapshot(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.8)',
            backdropFilter: 'blur(6px)',
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
                borderBottom: '1px solid #E2E8F0',
                background: '#F8FAFC',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  fontWeight: 700,
                  fontSize: '0.88rem',
                  color: '#991B1B',
                }}
              >
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

// ── Expanded Candidate Audit Dossier Subcomponent ────────────────────────────
function AuditDossierView({
  quiz,
  attempt,
  userRole,
  onResetAttempt,
  onPreviewSnapshot,
}: {
  quiz: Quiz
  attempt: RankedAttempt
  userRole?: string
  onResetAttempt?: (attemptId: string, candidateName?: string) => Promise<void> | void
  onPreviewSnapshot: (src: string, caption: string) => void
}) {
  const [activeTab, setActiveTab] = useState<'telemetry' | 'answers'>('telemetry')

  return (
    <div>
      {/* Sub-tab navigation */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.85rem' }}>
        <button
          onClick={() => setActiveTab('telemetry')}
          style={{
            padding: '0.35rem 0.75rem',
            borderRadius: 6,
            border: activeTab === 'telemetry' ? `1.5px solid ${T.primary}` : '1px solid #E2E8F0',
            background: activeTab === 'telemetry' ? T.primary : '#ffffff',
            color: activeTab === 'telemetry' ? '#ffffff' : T.txtSec,
            fontSize: '0.76rem',
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          🛡️ Proctoring & Evidence ({attempt.photoEvidence.length} Photos)
        </button>
        <button
          onClick={() => setActiveTab('answers')}
          style={{
            padding: '0.35rem 0.75rem',
            borderRadius: 6,
            border: activeTab === 'answers' ? `1.5px solid ${T.primary}` : '1px solid #E2E8F0',
            background: activeTab === 'answers' ? T.primary : '#ffffff',
            color: activeTab === 'answers' ? '#ffffff' : T.txtSec,
            fontSize: '0.76rem',
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          📝 Answer Review ({attempt.score}/{attempt.maxScore} pts)
        </button>

        {attempt.driveEvidenceFolderLink && (
          <a
            href={attempt.driveEvidenceFolderLink}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              marginLeft: 'auto',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.3rem',
              padding: '0.35rem 0.75rem',
              borderRadius: 6,
              background: '#EFF6FF',
              color: '#1D4ED8',
              fontSize: '0.76rem',
              fontWeight: 700,
              textDecoration: 'none',
              border: '1px solid #BFDBFE',
            }}
          >
            📁 View Google Drive Evidence Folder <ExternalLink size={11} />
          </a>
        )}
      </div>

      {activeTab === 'telemetry' ? (
        <>
          {/* Forensic Metrics Grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
              gap: '0.5rem',
              marginBottom: '0.85rem',
            }}
          >
            <div style={{ background: '#ffffff', border: '1px solid #E2E8F0', borderRadius: 8, padding: '0.6rem' }}>
              <div style={{ fontSize: '0.68rem', color: T.txtMut, textTransform: 'uppercase', fontWeight: 700 }}>
                Tab Switches
              </div>
              <div
                style={{
                  fontSize: '1.05rem',
                  fontWeight: 800,
                  color: (attempt.tabSwitchesCount || 0) > 0 ? '#DC2626' : '#047857',
                }}
              >
                {attempt.tabSwitchesCount || 0}
              </div>
            </div>

            <div style={{ background: '#ffffff', border: '1px solid #E2E8F0', borderRadius: 8, padding: '0.6rem' }}>
              <div style={{ fontSize: '0.68rem', color: T.txtMut, textTransform: 'uppercase', fontWeight: 700 }}>
                Fullscreen Exits
              </div>
              <div
                style={{
                  fontSize: '1.05rem',
                  fontWeight: 800,
                  color: (attempt.fullscreenViolationsCount || 0) > 0 ? '#DC2626' : '#047857',
                }}
              >
                {attempt.fullscreenViolationsCount || 0}
              </div>
            </div>

            <div style={{ background: '#ffffff', border: '1px solid #E2E8F0', borderRadius: 8, padding: '0.6rem' }}>
              <div style={{ fontSize: '0.68rem', color: T.txtMut, textTransform: 'uppercase', fontWeight: 700 }}>
                Mobile Phones
              </div>
              <div style={{ fontSize: '1.05rem', fontWeight: 800, color: attempt.phoneCount > 0 ? '#DC2626' : '#047857' }}>
                {attempt.phoneCount}
              </div>
            </div>

            <div style={{ background: '#ffffff', border: '1px solid #E2E8F0', borderRadius: 8, padding: '0.6rem' }}>
              <div style={{ fontSize: '0.68rem', color: T.txtMut, textTransform: 'uppercase', fontWeight: 700 }}>
                Face Missing
              </div>
              <div
                style={{
                  fontSize: '1.05rem',
                  fontWeight: 800,
                  color: (attempt.faceMissingCount || 0) > 0 ? '#DC2626' : '#047857',
                }}
              >
                {attempt.faceMissingCount || 0}
              </div>
            </div>

            <div style={{ background: '#ffffff', border: '1px solid #E2E8F0', borderRadius: 8, padding: '0.6rem' }}>
              <div style={{ fontSize: '0.68rem', color: T.txtMut, textTransform: 'uppercase', fontWeight: 700 }}>
                Multiple People
              </div>
              <div
                style={{
                  fontSize: '1.05rem',
                  fontWeight: 800,
                  color: (attempt.multipleFacesCount || 0) > 0 ? '#DC2626' : '#047857',
                }}
              >
                {attempt.multipleFacesCount || 0}
              </div>
            </div>

            <div style={{ background: '#ffffff', border: '1px solid #E2E8F0', borderRadius: 8, padding: '0.6rem' }}>
              <div style={{ fontSize: '0.68rem', color: T.txtMut, textTransform: 'uppercase', fontWeight: 700 }}>
                Audio Anomalies
              </div>
              <div style={{ fontSize: '1.05rem', fontWeight: 800, color: attempt.audioCount > 0 ? '#DC2626' : '#047857' }}>
                {attempt.audioCount}
              </div>
            </div>
          </div>

          {/* Photographic Evidence Gallery */}
          <div style={{ background: '#ffffff', border: '1px solid #E2E8F0', borderRadius: 10, padding: '0.85rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.65rem' }}>
              <div style={{ fontWeight: 700, fontSize: '0.82rem', color: T.txtPri }}>
                📸 Forensic Photo Evidence Gallery ({attempt.photoEvidence.length} Snapshots Saved)
              </div>
              {attempt.driveEvidenceFolderLink && (
                <span style={{ fontSize: '0.72rem', color: '#047857', fontWeight: 600 }}>
                  ✓ Synced to Google Drive
                </span>
              )}
            </div>

            {attempt.photoEvidence.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '1.5rem', color: '#047857', fontSize: '0.82rem' }}>
                🛡️ 100% Clean Session: No infractions detected, zero suspicious snapshots captured.
              </div>
            ) : (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))',
                  gap: '0.6rem',
                }}
              >
                {attempt.photoEvidence.map((flag, snapIdx) => (
                  <div
                    key={snapIdx}
                    onClick={() =>
                      onPreviewSnapshot(
                        flag.snapshot!,
                        `${flag.detail || flag.type} at ${flag.timestamp}`
                      )
                    }
                    style={{
                      borderRadius: 8,
                      border: '1.5px solid #FCA5A5',
                      background: '#000000',
                      overflow: 'hidden',
                      cursor: 'pointer',
                      transition: 'transform 0.15s ease',
                      position: 'relative',
                    }}
                  >
                    <img
                      src={flag.snapshot}
                      alt={`Infraction ${snapIdx + 1}`}
                      style={{
                        width: '100%',
                        height: 95,
                        objectFit: 'cover',
                        display: 'block',
                      }}
                    />
                    <div
                      style={{
                        padding: '0.25rem 0.4rem',
                        background: '#FEF2F2',
                        fontSize: '0.68rem',
                        color: '#991B1B',
                        fontWeight: 600,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        borderTop: '1px solid #FECACA',
                      }}
                    >
                      {flag.detail || flag.type}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Admin/Faculty Action: Allow Retake */}
          {userRole !== 'student' && onResetAttempt && (
            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                marginTop: '0.75rem',
                paddingTop: '0.65rem',
                borderTop: '1px solid #E2E8F0',
              }}
            >
              <button
                onClick={() =>
                  onResetAttempt(
                    attempt.id,
                    attempt.studentName || attempt.studentEmail.split('@')[0]
                  )
                }
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  background: '#FFFBEB',
                  color: '#B45309',
                  border: '1px solid #FDE68A',
                  borderRadius: 6,
                  padding: '0.35rem 0.75rem',
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
                title="Reset this attempt record so the student can re-take the assessment"
              >
                <RotateCcw size={13} /> Allow Candidate Retake
              </button>
            </div>
          )}
        </>
      ) : (
        /* Answer Review Tab */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
          {quiz.questions.map((q, qIdx) => {
            const chosenAns =
              attempt.answers?.[q.id] ?? attempt.answers?.[String(qIdx)] ?? attempt.answers?.[qIdx]
            const isCorrect = chosenAns === q.correctIndex
            const isAnswered = chosenAns !== undefined && chosenAns !== null

            return (
              <div
                key={q.id || qIdx}
                style={{
                  background: '#ffffff',
                  border: `1px solid ${isCorrect ? '#A7F3D0' : '#FECACA'}`,
                  borderRadius: 10,
                  padding: '0.75rem 1rem',
                  fontSize: '0.82rem',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                  <div style={{ fontWeight: 700, color: T.txtPri }}>
                    Q{qIdx + 1}. {q.question}
                  </div>
                  <span
                    style={{
                      padding: '0.15rem 0.45rem',
                      borderRadius: 4,
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      background: isCorrect ? '#ECFDF5' : '#FEF2F2',
                      color: isCorrect ? '#047857' : '#DC2626',
                    }}
                  >
                    {isCorrect ? `+${q.points || 1} pt` : '0 pts'}
                  </span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.4rem', marginTop: '0.5rem' }}>
                  {q.options.map((opt, optIdx) => {
                    const isCandidateChoice = chosenAns === optIdx
                    const isActualCorrect = q.correctIndex === optIdx

                    let optBg = '#F8FAFC'
                    let optColor = T.txtSec
                    let optBorder = '#E2E8F0'

                    if (isActualCorrect) {
                      optBg = '#ECFDF5'
                      optColor = '#047857'
                      optBorder = '#6EE7B7'
                    } else if (isCandidateChoice && !isCorrect) {
                      optBg = '#FEF2F2'
                      optColor = '#DC2626'
                      optBorder = '#FCA5A5'
                    }

                    return (
                      <div
                        key={optIdx}
                        style={{
                          padding: '0.4rem 0.6rem',
                          borderRadius: 6,
                          background: optBg,
                          color: optColor,
                          border: `1px solid ${optBorder}`,
                          fontSize: '0.76rem',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                        }}
                      >
                        <span>
                          <strong>{String.fromCharCode(65 + optIdx)}.</strong> {opt}
                        </span>
                        {isCandidateChoice && (
                          <span style={{ fontSize: '0.68rem', fontWeight: 700, marginLeft: 4 }}>
                            (Chosen)
                          </span>
                        )}
                        {isActualCorrect && (
                          <span style={{ fontSize: '0.68rem', fontWeight: 700, marginLeft: 4 }}>
                            ✓ Correct
                          </span>
                        )}
                      </div>
                    )
                  })}
                </div>

                {!isAnswered && (
                  <div style={{ marginTop: '0.4rem', fontSize: '0.72rem', color: '#D97706', fontWeight: 600 }}>
                    ⚠️ Not answered by candidate
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
