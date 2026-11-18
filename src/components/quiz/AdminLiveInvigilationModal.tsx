// ── PrepHire AI — Live Assessment Invigilation Cockpit ───────────────────────
// Real-time surveillance dashboard with zero database writes.
// Features 1-click live WebRTC camera streaming, real-time infraction chime alerts,
// candidate progress tracking, and instantaneous administrative warning messaging.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useRef, useEffect, useMemo } from 'react'
import {
  X,
  Radio,
  Video,
  AlertTriangle,
  Send,
  Search,
  Users,
  Volume2,
  ShieldCheck,
  Maximize2,
  Minimize2,
} from 'lucide-react'
import type { Quiz } from '../../types/quiz'
import { useAdminProctorSocket } from '../../services/proctorSocket.service'

interface AdminLiveInvigilationModalProps {
  quiz: Quiz
  onClose: () => void
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void
}

export function AdminLiveInvigilationModal({
  quiz,
  onClose,
  showToast,
}: AdminLiveInvigilationModalProps) {
  const {
    isConnected,
    students,
    alerts,
    liveStream,
    activeStreamingUid,
    startLiveCamera,
    stopLiveCamera,
    sendWarning,
    clearAlerts,
  } = useAdminProctorSocket(quiz.id)

  const [searchTerm, setSearchTerm] = useState('')
  const [filter, setFilter] = useState<'all' | 'flagged' | 'clean' | 'disconnected'>('all')
  const [warningModalTarget, setWarningModalTarget] = useState<{ uid: string; name: string } | null>(null)
  const [customWarningText, setCustomWarningText] = useState('')
  const [isAlertsDrawerOpen, setIsAlertsDrawerOpen] = useState(true)
  const [isStreamFullscreen, setIsStreamFullscreen] = useState(false)

  const videoRef = useRef<HTMLVideoElement | null>(null)

  // Attach live WebRTC stream to video element
  useEffect(() => {
    if (videoRef.current && liveStream) {
      videoRef.current.srcObject = liveStream
      videoRef.current.play().catch(() => {})
    }
  }, [liveStream])

  // Aggregate stats
  const totalCount = students.length
  const activeCount = students.filter((s) => s.status !== 'disconnected').length
  const criticalCount = students.filter((s) => s.status === 'critical').length
  const warningCount = students.filter((s) => s.status === 'warning').length
  const cleanCount = students.filter((s) => s.status === 'active').length

  const filteredStudents = useMemo(() => {
    return students.filter((s) => {
      const matchSearch =
        s.studentName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (s.department && s.department.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (s.rollNumber && s.rollNumber.toLowerCase().includes(searchTerm.toLowerCase()))

      if (!matchSearch) return false

      if (filter === 'flagged') return s.status === 'warning' || s.status === 'critical'
      if (filter === 'clean') return s.status === 'active'
      if (filter === 'disconnected') return s.status === 'disconnected'
      return true
    })
  }, [students, searchTerm, filter])

  function handleSendWarning() {
    if (!warningModalTarget || !customWarningText.trim()) return
    sendWarning(warningModalTarget.uid, customWarningText.trim())
    showToast(`Warning sent to ${warningModalTarget.name}`, 'info')
    setWarningModalTarget(null)
    setCustomWarningText('')
  }

  const activeStudentBeingStreamed = students.find((s) => s.studentUid === activeStreamingUid)

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(15, 23, 42, 0.75)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* ── Cockpit Header ─────────────────────────────────────────────────── */}
      <header
        style={{
          background: '#0F172A',
          color: '#ffffff',
          padding: '0.85rem 1.5rem',
          borderBottom: '1px solid #1E293B',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '1rem',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.45rem',
              background: '#DC2626',
              color: '#ffffff',
              padding: '0.3rem 0.75rem',
              borderRadius: 20,
              fontSize: '0.78rem',
              fontWeight: 750,
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
            }}
          >
            <Radio size={14} className="pulse-indicator" /> Live Invigilation
          </div>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, color: '#F8FAFC' }}>
              {quiz.title}
            </h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.75rem', color: '#94A3B8' }}>
              <span>{quiz.category}</span>
              <span>•</span>
              <span>{quiz.targetBranch.toUpperCase()}</span>
              <span>•</span>
              <span style={{ color: isConnected ? '#34D399' : '#F87171' }}>
                {isConnected ? '● Gateway Connected' : '○ Connecting Gateway...'}
              </span>
            </div>
          </div>
        </div>

        {/* Live Metrics Strip */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <div style={{ background: '#1E293B', padding: '0.35rem 0.75rem', borderRadius: 8, fontSize: '0.8rem' }}>
            <span style={{ color: '#94A3B8' }}>Live: </span>
            <strong style={{ color: '#38BDF8' }}>{activeCount}</strong>
            <span style={{ color: '#64748B' }}> / {totalCount}</span>
          </div>

          <div style={{ background: '#064E3B', padding: '0.35rem 0.75rem', borderRadius: 8, fontSize: '0.8rem', color: '#6EE7B7' }}>
            <span>Clean: </span>
            <strong>{cleanCount}</strong>
          </div>

          <div style={{ background: '#78350F', padding: '0.35rem 0.75rem', borderRadius: 8, fontSize: '0.8rem', color: '#FCD34D' }}>
            <span>Warnings: </span>
            <strong>{warningCount}</strong>
          </div>

          <div style={{ background: '#7F1D1D', padding: '0.35rem 0.75rem', borderRadius: 8, fontSize: '0.8rem', color: '#FCA5A5' }}>
            <span>Critical: </span>
            <strong>{criticalCount}</strong>
          </div>

          <button
            onClick={() => setIsAlertsDrawerOpen(!isAlertsDrawerOpen)}
            style={{
              background: isAlertsDrawerOpen ? '#334155' : '#1E293B',
              color: '#F8FAFC',
              border: '1px solid #475569',
              borderRadius: 8,
              padding: '0.4rem 0.8rem',
              fontSize: '0.8rem',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
            }}
          >
            <AlertTriangle size={14} color="#F59E0B" />
            Alerts ({alerts.length})
          </button>

          <button
            onClick={onClose}
            style={{
              background: '#1E293B',
              color: '#94A3B8',
              border: '1px solid #334155',
              borderRadius: 8,
              padding: '0.4rem 0.6rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
            }}
            title="Exit Cockpit"
          >
            <X size={18} />
          </button>
        </div>
      </header>

      {/* ── Main Workspace ─────────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Left Side: Candidates Grid */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#F8FAFC', overflow: 'hidden' }}>
          {/* Controls Bar */}
          <div
            style={{
              padding: '0.85rem 1.5rem',
              background: '#ffffff',
              borderBottom: '1px solid #E2E8F0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '1rem',
              flexWrap: 'wrap',
            }}
          >
            {/* Search Input */}
            <div style={{ position: 'relative', width: 280, maxWidth: '100%' }}>
              <Search size={15} color="#94A3B8" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }} />
              <input
                type="text"
                placeholder="Search candidate, roll, branch..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.45rem 0.75rem 0.45rem 2rem',
                  fontSize: '0.82rem',
                  borderRadius: 8,
                  border: '1px solid #CBD5E1',
                  outline: 'none',
                }}
              />
            </div>

            {/* Filter Pills */}
            <div style={{ display: 'flex', gap: '0.35rem' }}>
              {(['all', 'flagged', 'clean', 'disconnected'] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setFilter(mode)}
                  style={{
                    padding: '0.35rem 0.75rem',
                    fontSize: '0.78rem',
                    fontWeight: 600,
                    borderRadius: 20,
                    border: 'none',
                    cursor: 'pointer',
                    background: filter === mode ? '#0F172A' : '#F1F5F9',
                    color: filter === mode ? '#ffffff' : '#475569',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {mode === 'all' && `All (${totalCount})`}
                  {mode === 'flagged' && `⚠️ Flagged (${warningCount + criticalCount})`}
                  {mode === 'clean' && `🛡️ Clean (${cleanCount})`}
                  {mode === 'disconnected' && `⚫ Disconnected`}
                </button>
              ))}
            </div>
          </div>

          {/* Cards Grid Area */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem' }}>
            {filteredStudents.length === 0 ? (
              <div
                style={{
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#94A3B8',
                  padding: '3rem 1rem',
                  textAlign: 'center',
                }}
              >
                <Users size={48} style={{ opacity: 0.4, marginBottom: '0.75rem' }} />
                <h3 style={{ margin: 0, fontSize: '1rem', color: '#475569' }}>
                  {totalCount === 0 ? 'Waiting for Candidates to Join Exam...' : 'No candidates match your current filter'}
                </h3>
                <p style={{ margin: '0.35rem 0 0', fontSize: '0.82rem' }}>
                  {totalCount === 0
                    ? 'As students open the assessment link, their live cards will appear here in real-time.'
                    : 'Try clearing your search term or selecting "All".'}
                </p>
              </div>
            ) : (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                  gap: '1rem',
                }}
              >
                {filteredStudents.map((candidate) => {
                  const isCritical = candidate.status === 'critical'
                  const isWarning = candidate.status === 'warning'
                  const isDisconnected = candidate.status === 'disconnected'
                  const isStreaming = activeStreamingUid === candidate.studentUid

                  const borderColor = isCritical
                    ? '#EF4444'
                    : isWarning
                    ? '#F59E0B'
                    : isDisconnected
                    ? '#94A3B8'
                    : '#10B981'

                  return (
                    <div
                      key={candidate.studentUid}
                      style={{
                        background: '#ffffff',
                        border: `2px solid ${borderColor}`,
                        borderRadius: 12,
                        padding: '1rem',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.75rem',
                        boxShadow: isCritical
                          ? '0 4px 16px rgba(239, 68, 68, 0.2)'
                          : '0 2px 6px rgba(0, 0, 0, 0.04)',
                        transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                      }}
                    >
                      {/* Candidate Header */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0 }}>
                          <div
                            style={{
                              width: 36,
                              height: 36,
                              borderRadius: '50%',
                              background: '#F1F5F9',
                              border: `2px solid ${borderColor}`,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontWeight: 750,
                              fontSize: '0.85rem',
                              color: '#1E293B',
                              flexShrink: 0,
                            }}
                          >
                            {candidate.studentName.charAt(0).toUpperCase()}
                          </div>
                          <div style={{ minWidth: 0 }}>
                            <strong
                              style={{
                                display: 'block',
                                fontSize: '0.88rem',
                                color: '#0F172A',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                              }}
                              title={candidate.studentName}
                            >
                              {candidate.studentName}
                            </strong>
                            <span style={{ fontSize: '0.72rem', color: '#64748B' }}>
                              {candidate.department || 'Engineering'} {candidate.rollNumber ? `• ${candidate.rollNumber}` : ''}
                            </span>
                          </div>
                        </div>

                        {/* Status Badge */}
                        <span
                          style={{
                            fontSize: '0.7rem',
                            fontWeight: 700,
                            padding: '0.2rem 0.55rem',
                            borderRadius: 12,
                            background: isCritical
                              ? '#FEE2E2'
                              : isWarning
                              ? '#FEF3C7'
                              : isDisconnected
                              ? '#F1F5F9'
                              : '#DCFCE7',
                            color: isCritical
                              ? '#DC2626'
                              : isWarning
                              ? '#B45309'
                              : isDisconnected
                              ? '#64748B'
                              : '#15803D',
                            flexShrink: 0,
                          }}
                        >
                          {isCritical && '🔴 High Risk'}
                          {isWarning && '🟡 Warning'}
                          {isDisconnected && '⚫ Offline'}
                          {!isCritical && !isWarning && !isDisconnected && '🟢 Active'}
                        </span>
                      </div>

                      {/* Snapshot / Camera Preview Frame */}
                      <div
                        style={{
                          height: 140,
                          borderRadius: 8,
                          background: '#0F172A',
                          overflow: 'hidden',
                          position: 'relative',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        {candidate.recentSnapshot ? (
                          <img
                            src={candidate.recentSnapshot}
                            alt="Snapshot Evidence"
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          />
                        ) : (
                          <div style={{ color: '#475569', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.35rem' }}>
                            <Video size={28} />
                            <span style={{ fontSize: '0.7rem' }}>Camera Active</span>
                          </div>
                        )}

                        {/* Infraction Alert Banner on Frame */}
                        {candidate.lastFlag && (
                          <div
                            style={{
                              position: 'absolute',
                              bottom: 0,
                              left: 0,
                              right: 0,
                              background: 'rgba(15, 23, 42, 0.88)',
                              color: isCritical ? '#F87171' : '#FCD34D',
                              padding: '0.3rem 0.5rem',
                              fontSize: '0.68rem',
                              fontWeight: 600,
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.35rem',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                            }}
                          >
                            <AlertTriangle size={12} />
                            <span>{candidate.lastFlag.detail}</span>
                          </div>
                        )}
                      </div>

                      {/* Progress & Integrity */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.75rem', color: '#64748B' }}>
                        <div>
                          <span>Question: </span>
                          <strong style={{ color: '#0F172A' }}>
                            {candidate.currentQuestionIndex || 1} / {candidate.totalQuestions || quiz.questions.length}
                          </strong>
                        </div>

                        <div>
                          <span>Integrity: </span>
                          <strong
                            style={{
                              color:
                                (candidate.integrityScore ?? 100) < 70
                                  ? '#DC2626'
                                  : (candidate.integrityScore ?? 100) < 90
                                  ? '#D97706'
                                  : '#059669',
                            }}
                          >
                            {candidate.integrityScore ?? 100}%
                          </strong>
                        </div>
                      </div>

                      {/* Actions Strip */}
                      <div style={{ display: 'flex', gap: '0.5rem', marginTop: 'auto', paddingTop: '0.25rem' }}>
                        <button
                          onClick={() => {
                            if (isStreaming) {
                              stopLiveCamera()
                            } else {
                              startLiveCamera(candidate.studentUid)
                            }
                          }}
                          style={{
                            flex: 1,
                            background: isStreaming ? '#DC2626' : '#0F172A',
                            color: '#ffffff',
                            border: 'none',
                            borderRadius: 8,
                            padding: '0.45rem',
                            fontSize: '0.78rem',
                            fontWeight: 650,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '0.35rem',
                          }}
                        >
                          <Video size={13} />
                          {isStreaming ? 'Stop Feed' : 'Live Camera'}
                        </button>

                        <button
                          onClick={() =>
                            setWarningModalTarget({
                              uid: candidate.studentUid,
                              name: candidate.studentName,
                            })
                          }
                          style={{
                            background: '#F1F5F9',
                            color: '#B45309',
                            border: '1px solid #CBD5E1',
                            borderRadius: 8,
                            padding: '0.45rem 0.65rem',
                            fontSize: '0.78rem',
                            fontWeight: 650,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.25rem',
                          }}
                          title="Send Warning Message to Candidate"
                        >
                          <Send size={12} /> Warn
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right Side: Real-Time Alerts Drawer */}
        {isAlertsDrawerOpen && (
          <aside
            style={{
              width: 320,
              background: '#0F172A',
              color: '#ffffff',
              borderLeft: '1px solid #1E293B',
              display: 'flex',
              flexDirection: 'column',
              flexShrink: 0,
            }}
          >
            <div
              style={{
                padding: '0.85rem 1rem',
                borderBottom: '1px solid #1E293B',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', fontWeight: 700, color: '#F8FAFC' }}>
                <Volume2 size={16} color="#38BDF8" /> Real-Time Infraction Ticker
              </div>
              {alerts.length > 0 && (
                <button
                  onClick={clearAlerts}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#94A3B8',
                    fontSize: '0.72rem',
                    cursor: 'pointer',
                    textDecoration: 'underline',
                  }}
                >
                  Clear
                </button>
              )}
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
              {alerts.length === 0 ? (
                <div style={{ padding: '2rem 1rem', textAlign: 'center', color: '#64748B', fontSize: '0.8rem' }}>
                  <ShieldCheck size={32} color="#10B981" style={{ margin: '0 auto 0.5rem', opacity: 0.8 }} />
                  <div>No infractions reported</div>
                  <div style={{ fontSize: '0.72rem', marginTop: 4 }}>Cohort is currently taking the test smoothly.</div>
                </div>
              ) : (
                alerts.map((alert) => {
                  const isHigh = alert.severity === 'high'
                  return (
                    <div
                      key={alert.id}
                      style={{
                        background: isHigh ? 'rgba(239, 68, 68, 0.12)' : 'rgba(245, 158, 11, 0.1)',
                        borderLeft: `3px solid ${isHigh ? '#EF4444' : '#F59E0B'}`,
                        borderRadius: 6,
                        padding: '0.65rem 0.75rem',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.35rem',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <strong style={{ fontSize: '0.8rem', color: isHigh ? '#FCA5A5' : '#FDE68A' }}>
                          {alert.studentName}
                        </strong>
                        <span style={{ fontSize: '0.68rem', color: '#94A3B8' }}>{alert.timestamp}</span>
                      </div>

                      <div style={{ fontSize: '0.74rem', color: '#E2E8F0', lineHeight: 1.4 }}>
                        {alert.type === 'cell_phone' && '📱 '}
                        {alert.type === 'multiple_faces' && '👥 '}
                        {alert.type === 'face_missing' && '👤 '}
                        {alert.type === 'tab_switch' && '🖥️ '}
                        {alert.detail}
                      </div>

                      {alert.snapshot && (
                        <div style={{ height: 60, borderRadius: 4, overflow: 'hidden', marginTop: 2 }}>
                          <img
                            src={alert.snapshot}
                            alt="Infraction Evidence"
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          />
                        </div>
                      )}
                    </div>
                  )
                })
              )}
            </div>
          </aside>
        )}
      </div>

      {/* ── 1-Click Live WebRTC Video Stream Overlay ───────────────────────── */}
      {activeStreamingUid && (
        <div
          style={{
            position: 'fixed',
            bottom: isStreamFullscreen ? 0 : 20,
            right: isStreamFullscreen ? 0 : 20,
            width: isStreamFullscreen ? '100vw' : 440,
            height: isStreamFullscreen ? '100vh' : 320,
            zIndex: 10000,
            background: '#0F172A',
            border: isStreamFullscreen ? 'none' : '2px solid #38BDF8',
            borderRadius: isStreamFullscreen ? 0 : 12,
            boxShadow: '0 12px 36px rgba(0, 0, 0, 0.65)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            transition: 'all 0.2s ease',
          }}
        >
          {/* Stream Overlay Header */}
          <div
            style={{
              padding: '0.65rem 1rem',
              background: '#020617',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              borderBottom: '1px solid #1E293B',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0 }}>
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: '#EF4444',
                  boxShadow: '0 0 8px #EF4444',
                }}
              />
              <strong
                style={{
                  fontSize: '0.85rem',
                  color: '#F8FAFC',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                Live Peer Feed: {activeStudentBeingStreamed?.studentName || 'Candidate'}
              </strong>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <button
                onClick={() => setIsStreamFullscreen(!isStreamFullscreen)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#94A3B8',
                  cursor: 'pointer',
                  padding: 4,
                  display: 'flex',
                }}
                title={isStreamFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
              >
                {isStreamFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
              </button>
              <button
                onClick={stopLiveCamera}
                style={{
                  background: '#DC2626',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: 6,
                  padding: '0.25rem 0.6rem',
                  fontSize: '0.74rem',
                  fontWeight: 650,
                  cursor: 'pointer',
                }}
              >
                Close Feed
              </button>
            </div>
          </div>

          {/* Video Player */}
          <div style={{ flex: 1, background: '#000000', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              style={{ width: '100%', height: '100%', objectFit: 'contain' }}
            />
            {!liveStream && (
              <div style={{ position: 'absolute', color: '#94A3B8', fontSize: '0.82rem', textAlign: 'center', padding: '1rem' }}>
                <div style={{ width: 24, height: 24, border: '3px solid #38BDF8', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 0.5rem' }} />
                <span>Handshaking P2P WebRTC Connection...</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Send Warning Modal ─────────────────────────────────────────────── */}
      {warningModalTarget && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 10001,
            background: 'rgba(0, 0, 0, 0.65)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
          }}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: 12,
              padding: '1.5rem',
              width: 440,
              maxWidth: '100%',
              boxShadow: '0 12px 32px rgba(0, 0, 0, 0.25)',
              display: 'flex',
              flexDirection: 'column',
              gap: '1rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#DC2626', fontWeight: 750, fontSize: '1rem' }}>
                <AlertTriangle size={18} /> Send Official Warning
              </div>
              <button
                onClick={() => setWarningModalTarget(null)}
                style={{ background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            <p style={{ margin: 0, fontSize: '0.82rem', color: '#475569', lineHeight: 1.45 }}>
              This warning will immediately pop up in bold red on candidate{' '}
              <strong>{warningModalTarget.name}</strong>'s screen, requiring them to acknowledge before proceeding.
            </p>

            {/* Quick Templates */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              <span style={{ fontSize: '0.74rem', fontWeight: 650, color: '#64748B' }}>Quick Warning Templates:</span>
              {[
                'Please adjust your camera and keep your face centered in the frame.',
                'Unauthorized mobile phone detected. Put away all external devices immediately.',
                'Refrain from switching tabs or opening developer tools.',
                'Secondary person detected in your testing room. Ensure you are alone.',
              ].map((template) => (
                <button
                  key={template}
                  onClick={() => setCustomWarningText(template)}
                  style={{
                    background: '#F8FAFC',
                    border: '1px solid #E2E8F0',
                    borderRadius: 6,
                    padding: '0.35rem 0.65rem',
                    fontSize: '0.74rem',
                    textAlign: 'left',
                    color: '#334155',
                    cursor: 'pointer',
                  }}
                >
                  {template}
                </button>
              ))}
            </div>

            <textarea
              rows={3}
              value={customWarningText}
              onChange={(e) => setCustomWarningText(e.target.value)}
              placeholder="Enter specific warning message..."
              style={{
                width: '100%',
                borderRadius: 8,
                border: '1.5px solid #CBD5E1',
                padding: '0.65rem',
                fontSize: '0.82rem',
                outline: 'none',
                resize: 'none',
                boxSizing: 'border-box',
              }}
            />

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
              <button
                onClick={() => setWarningModalTarget(null)}
                style={{
                  background: '#F1F5F9',
                  border: 'none',
                  borderRadius: 8,
                  padding: '0.5rem 1rem',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  color: '#475569',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleSendWarning}
                disabled={!customWarningText.trim()}
                style={{
                  background: '#DC2626',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: 8,
                  padding: '0.5rem 1.25rem',
                  fontSize: '0.82rem',
                  fontWeight: 650,
                  cursor: customWarningText.trim() ? 'pointer' : 'not-allowed',
                  opacity: customWarningText.trim() ? 1 : 0.6,
                }}
              >
                Transmit Warning
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
