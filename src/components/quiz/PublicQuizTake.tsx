// ── Public Proctored Quiz Portal (Desktop & Mobile) ─────────────────────────
// Accessible via shareable link: /quiz/:quizId
// Allows any candidate to enter their information, verify device/camera readiness,
// and take a proctored assessment with facial scanning and fullscreen tab protection.

import { useState, useEffect, useRef } from 'react'
import {
  CheckCircle2,
  Clock,
  Shield,
  Sparkles,
  Camera,
  AlertTriangle,
  ArrowRight,
  BookOpen,
  Lock,
} from 'lucide-react'
import { T } from '../../theme'
import type { Quiz } from '../../types/quiz'
import { getQuizById } from '../../services/quiz.service'
import { QuizPlayer } from './QuizPlayer'
import { prewarmProctorModels } from '../../utils/proctorPrewarm'
import { BRANCHES } from '../../constants/branches'
import { auth } from '../../firebase/firebase'

interface PublicQuizTakeProps {
  quizId: string
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void
  onExit?: () => void
}

export function PublicQuizTake({
  quizId,
  showToast,
  onExit,
}: PublicQuizTakeProps) {
  const [quiz, setQuiz] = useState<Quiz | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Candidate Registration State
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [department, setDepartment] = useState('Computer Engineering')
  const [rollNumber, setRollNumber] = useState('')
  const [consentAgreed, setConsentAgreed] = useState(false)

  // Camera Verification State
  const [cameraVerified, setCameraVerified] = useState(false)
  const [testingCamera, setTestingCamera] = useState(false)
  const testVideoRef = useRef<HTMLVideoElement>(null)
  const testStreamRef = useRef<MediaStream | null>(null)

  // Test Session State
  const [started, setStarted] = useState(false)
  const [candidateUid, setCandidateUid] = useState<string>('')

  // Real-time 1-second ticker for scheduled assessment countdowns
  const [now, setNow] = useState<number | null>(null)
  useEffect(() => {
    setNow(Date.now())
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])

  function formatCountdown(ms: number): string {
    if (ms <= 0) return 'Starting now'
    const totalSecs = Math.floor(ms / 1000)
    const days = Math.floor(totalSecs / 86400)
    const hours = Math.floor((totalSecs % 86400) / 3600)
    const mins = Math.floor((totalSecs % 3600) / 60)
    const secs = totalSecs % 60
    if (days > 0) return `${days}d ${hours}h ${mins}m`
    if (hours > 0) return `${hours}h ${mins}m ${secs}s`
    return `${mins}m ${secs}s`
  }

  const isScheduledFuture = Boolean(
    quiz?.scheduledStartTime && now !== null && new Date(quiz.scheduledStartTime).getTime() > now
  )
  const isWindowExpired = Boolean(
    quiz?.scheduledEndTime && now !== null && new Date(quiz.scheduledEndTime).getTime() <= now
  )

  // Pre-fill user information if already signed in
  useEffect(() => {
    const currentUser = auth.currentUser
    if (currentUser) {
      if (currentUser.displayName) setName(currentUser.displayName)
      if (currentUser.email) setEmail(currentUser.email)
    }
  }, [])

  // Load Quiz Data
  useEffect(() => {
    prewarmProctorModels().catch(() => {})
    async function fetchQuiz() {
      setLoading(true)
      try {
        const data = await getQuizById(quizId)
        if (!data) {
          setError('Assessment not found. The link may be expired or incorrect.')
        } else if (!data.published) {
          setError('This assessment is currently in draft mode and not accepting public submissions.')
        } else {
          setQuiz(data)
        }
      } catch (err) {
        console.error('Failed to load public quiz:', err)
        setError('Failed to load assessment. Please check your internet connection.')
      } finally {
        setLoading(false)
      }
    }
    fetchQuiz()
  }, [quizId])

  // Camera Test Handler
  async function handleTestCamera() {
    setTestingCamera(true)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 320 }, height: { ideal: 240 }, facingMode: 'user' },
        audio: false,
      })
      testStreamRef.current = stream
      if (testVideoRef.current) {
        testVideoRef.current.srcObject = stream
        testVideoRef.current.play().catch(() => {})
      }
      setCameraVerified(true)
      showToast('Camera verified successfully!', 'success')
    } catch (err) {
      console.warn('Camera verification failed:', err)
      showToast('Camera access denied. Please grant camera permission to continue.', 'error')
      setCameraVerified(false)
    } finally {
      setTestingCamera(false)
    }
  }

  // Cleanup test stream
  useEffect(() => {
    return () => {
      if (testStreamRef.current) {
        testStreamRef.current.getTracks().forEach((t) => t.stop())
      }
    }
  }, [])

  // Start Assessment Handler
  function handleStartAssessment() {
    if (isScheduledFuture) {
      showToast(`This assessment opens on ${new Date(quiz!.scheduledStartTime!).toLocaleString()}.`, 'info')
      return
    }
    if (isWindowExpired) {
      showToast('The test window for this assessment has closed.', 'error')
      return
    }
    if (!name.trim()) {
      showToast('Please enter your full name.', 'error')
      return
    }
    if (!email.trim() || !email.includes('@')) {
      showToast('Please enter a valid email address.', 'error')
      return
    }
    if (!consentAgreed) {
      showToast('Please acknowledge the proctoring rules before starting.', 'error')
      return
    }

    // Stop test camera before launching player
    if (testStreamRef.current) {
      testStreamRef.current.getTracks().forEach((t) => t.stop())
      testStreamRef.current = null
    }

    setCandidateUid(
      auth.currentUser?.uid || `guest-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`
    )

    try {
      const el = document.documentElement as any
      if (el.requestFullscreen) {
        el.requestFullscreen().catch(() => {})
      } else if (el.webkitRequestFullscreen) {
        el.webkitRequestFullscreen().catch(() => {})
      }
    } catch {
      // Ignored
    }

    setStarted(true)
  }

  // ── Render States ─────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div
        style={{
          minHeight: '80vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '1rem',
          color: T.txtSec,
        }}
      >
        <div
          style={{
            width: 42,
            height: 42,
            border: '3px solid #E2E8F0',
            borderTopColor: T.primary,
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
          }}
        />
        <p style={{ fontSize: '0.95rem', fontWeight: 600 }}>Loading Assessment...</p>
        <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  if (error || !quiz) {
    return (
      <div
        style={{
          minHeight: '80vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1.5rem',
        }}
      >
        <div
          style={{
            maxWidth: 480,
            width: '100%',
            background: '#ffffff',
            borderRadius: 16,
            padding: '2.5rem 2rem',
            textAlign: 'center',
            boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)',
            border: '1px solid #E2E8F0',
          }}
        >
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: '50%',
              background: '#FEE2E2',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#DC2626',
              margin: '0 auto 1.25rem',
            }}
          >
            <AlertTriangle size={28} />
          </div>
          <h2 style={{ margin: '0 0 0.5rem', fontSize: '1.35rem', fontWeight: 800, color: T.txtPri }}>
            Assessment Unavailable
          </h2>
          <p style={{ margin: '0 0 1.5rem', fontSize: '0.9rem', color: T.txtSec, lineHeight: 1.5 }}>
            {error || 'This assessment cannot be loaded.'}
          </p>
          {onExit && (
            <button
              onClick={onExit}
              style={{
                background: T.primary,
                color: '#ffffff',
                border: 'none',
                borderRadius: 8,
                padding: '0.65rem 1.25rem',
                fontSize: '0.88rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Return to Platform
            </button>
          )}
        </div>
      </div>
    )
  }

  // Active Test Mode: Launch QuizPlayer with candidate user object
  if (started) {
    return (
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '1rem' }}>
        <QuizPlayer
          quiz={quiz}
          user={{
            uid: candidateUid || 'guest-candidate',
            email,
            name,
            department,
            rollNumber: rollNumber.trim() || undefined,
          }}
          isPublic={true}
          onBack={() => {
            if (window.confirm('Exiting now will forfeit this assessment. Progress will not be saved.')) {
              setStarted(false)
            }
          }}
          showToast={showToast}
        />
      </div>
    )
  }

  // Assessment Briefing & Registration Screen
  return (
    <div
      style={{
        maxWidth: 820,
        margin: '1.5rem auto',
        padding: '0 1rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '1.5rem',
      }}
    >
      {/* Header Banner */}
      <div
        className="dark-theme-banner"
        style={{
          background: 'linear-gradient(135deg, #0A192F 0%, #0F2D59 50%, #1E3A8A 100%)',
          color: '#ffffff',
          borderRadius: 16,
          padding: '2rem',
          boxShadow: '0 10px 30px -5px rgba(10, 25, 47, 0.35)',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.45rem',
            background: 'rgba(250, 204, 21, 0.15)',
            border: '1px solid rgba(250, 204, 21, 0.35)',
            borderRadius: 9999,
            padding: '0.25rem 0.75rem',
            marginBottom: '0.75rem',
          }}
        >
          <Sparkles size={14} color="#FDE047" />
          <span style={{ fontSize: '0.75rem', fontWeight: 800, letterSpacing: '0.08em', color: '#FEF08A' }}>
            PREPHIRE PROCTORED ASSESSMENT
          </span>
        </div>

        <h1
          style={{
            margin: '0 0 0.5rem',
            fontSize: 'clamp(1.4rem, 3.5vw, 1.85rem)',
            fontWeight: 800,
            color: '#FFFFFF',
            letterSpacing: '-0.02em',
            lineHeight: 1.25,
          }}
        >
          {quiz.title}
        </h1>

        {quiz.description && (
          <p
            style={{
              margin: '0 0 1.25rem',
              fontSize: '0.92rem',
              color: 'rgba(241, 245, 249, 0.9)',
              lineHeight: 1.55,
              maxWidth: 680,
            }}
          >
            {quiz.description}
          </p>
        )}

        {/* Specs Pills */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <span
            style={{
              background: 'rgba(255, 255, 255, 0.12)',
              backdropFilter: 'blur(8px)',
              padding: '0.35rem 0.75rem',
              borderRadius: 8,
              fontSize: '0.8rem',
              fontWeight: 600,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem',
            }}
          >
            <BookOpen size={14} /> {quiz.questions.length} Questions
          </span>
          <span
            style={{
              background: 'rgba(255, 255, 255, 0.12)',
              backdropFilter: 'blur(8px)',
              padding: '0.35rem 0.75rem',
              borderRadius: 8,
              fontSize: '0.8rem',
              fontWeight: 600,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem',
            }}
          >
            <Clock size={14} /> {quiz.timeLimitMinutes} Minutes
          </span>
          <span
            style={{
              background: 'rgba(255, 255, 255, 0.12)',
              backdropFilter: 'blur(8px)',
              padding: '0.35rem 0.75rem',
              borderRadius: 8,
              fontSize: '0.8rem',
              fontWeight: 600,
            }}
          >
            🎯 Pass Criterion: {quiz.passingPercentage}%
          </span>
          <span
            style={{
              background: 'rgba(255, 255, 255, 0.12)',
              backdropFilter: 'blur(8px)',
              padding: '0.35rem 0.75rem',
              borderRadius: 8,
              fontSize: '0.8rem',
              fontWeight: 600,
            }}
          >
            📊 {quiz.difficulty}
          </span>
          {quiz.scheduledStartTime && (
            <span
              style={{
                background: isScheduledFuture
                  ? 'rgba(59, 130, 246, 0.25)'
                  : isWindowExpired
                  ? 'rgba(239, 68, 68, 0.25)'
                  : 'rgba(16, 185, 129, 0.25)',
                border: `1px solid ${
                  isScheduledFuture
                    ? 'rgba(147, 197, 253, 0.5)'
                    : isWindowExpired
                    ? 'rgba(252, 165, 165, 0.5)'
                    : 'rgba(110, 231, 183, 0.5)'
                }`,
                backdropFilter: 'blur(8px)',
                padding: '0.35rem 0.75rem',
                borderRadius: 8,
                fontSize: '0.8rem',
                fontWeight: 600,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
                color: '#ffffff',
              }}
            >
              <Clock size={14} />
              {isScheduledFuture
                ? `Starts in ${formatCountdown(new Date(quiz.scheduledStartTime).getTime() - (now || 0))}`
                : isWindowExpired
                ? 'Window Closed'
                : 'Live Now'}
            </span>
          )}
        </div>
      </div>

      {/* Scheduled Assessment Countdown Banner */}
      {isScheduledFuture && (
        <div
          style={{
            background: '#EFF6FF',
            border: '2px solid #BFDBFE',
            borderRadius: 16,
            padding: '1.5rem',
            textAlign: 'center',
            boxShadow: '0 4px 12px rgba(37, 99, 235, 0.08)',
          }}
        >
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: '50%',
              background: '#DBEAFE',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#1D4ED8',
              margin: '0 auto 0.75rem',
            }}
          >
            <Clock size={24} />
          </div>
          <h3 style={{ margin: '0 0 0.35rem', fontSize: '1.15rem', fontWeight: 800, color: '#1E40AF' }}>
            Assessment Scheduled
          </h3>
          <p style={{ margin: '0 0 0.85rem', fontSize: '0.88rem', color: '#1E3A8A' }}>
            This proctored assessment will unlock on{' '}
            <strong>{new Date(quiz.scheduledStartTime!).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</strong>
          </p>
          <div
            style={{
              display: 'inline-block',
              background: '#1E40AF',
              color: '#ffffff',
              padding: '0.5rem 1.25rem',
              borderRadius: 9999,
              fontSize: '1rem',
              fontWeight: 800,
              letterSpacing: '0.04em',
            }}
          >
            ⏱️ Starts in {formatCountdown(new Date(quiz.scheduledStartTime!).getTime() - (now || 0))}
          </div>
        </div>
      )}

      {isWindowExpired && (
        <div
          style={{
            background: '#FEF2F2',
            border: '2px solid #FECACA',
            borderRadius: 16,
            padding: '1.25rem',
            textAlign: 'center',
            color: '#991B1B',
            fontWeight: 700,
          }}
        >
          Assessment submission window closed on {new Date(quiz.scheduledEndTime!).toLocaleString()}.
        </div>
      )}

      {/* Candidate Form Card */}
      <div
        style={{
          background: '#ffffff',
          borderRadius: 16,
          padding: '1.75rem 2rem',
          boxShadow: '0 2px 10px rgba(0,0,0,0.06)',
          border: '1px solid #E2E8F0',
          display: 'flex',
          flexDirection: 'column',
          gap: '1.5rem',
        }}
      >
        <div>
          <h2 style={{ margin: '0 0 0.35rem', fontSize: '1.25rem', fontWeight: 800, color: T.txtPri }}>
            Candidate Information
          </h2>
          <p style={{ margin: 0, fontSize: '0.85rem', color: T.txtSec }}>
            Please provide your details for identity verification and score reporting.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: T.txtPri, marginBottom: '0.35rem' }}>
              Full Name *
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. John Doe"
              style={{
                width: '100%',
                padding: '0.65rem 0.85rem',
                borderRadius: 8,
                border: '1px solid #CBD5E1',
                fontSize: '0.9rem',
                outline: 'none',
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: T.txtPri, marginBottom: '0.35rem' }}>
              Email Address *
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="e.g. john.doe@mitaoe.ac.in"
              style={{
                width: '100%',
                padding: '0.65rem 0.85rem',
                borderRadius: 8,
                border: '1px solid #CBD5E1',
                fontSize: '0.9rem',
                outline: 'none',
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: T.txtPri, marginBottom: '0.35rem' }}>
              Department / College *
            </label>
            <select
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              style={{
                width: '100%',
                padding: '0.65rem 0.85rem',
                borderRadius: 8,
                border: '1px solid #CBD5E1',
                fontSize: '0.9rem',
                background: '#ffffff',
                outline: 'none',
              }}
            >
              {BRANCHES.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
              <option value="Other Institution">Other Engineering / College</option>
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: T.txtPri, marginBottom: '0.35rem' }}>
              Roll Number / Student PRN (Optional)
            </label>
            <input
              type="text"
              value={rollNumber}
              onChange={(e) => setRollNumber(e.target.value)}
              placeholder="e.g. MIT2024CS101"
              style={{
                width: '100%',
                padding: '0.65rem 0.85rem',
                borderRadius: 8,
                border: '1px solid #CBD5E1',
                fontSize: '0.9rem',
                outline: 'none',
              }}
            />
          </div>
        </div>

        {/* Camera Verification Section */}
        <div
          style={{
            background: '#F8FAFC',
            border: '1px solid #E2E8F0',
            borderRadius: 12,
            padding: '1.25rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '1rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 8,
                  background: cameraVerified ? '#DCFCE7' : '#EFF6FF',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: cameraVerified ? '#15803D' : '#2563EB',
                }}
              >
                <Camera size={18} />
              </div>
              <div>
                <div style={{ fontSize: '0.9rem', fontWeight: 700, color: T.txtPri }}>
                  WebCam & Facial Scan Check
                </div>
                <div style={{ fontSize: '0.8rem', color: T.txtSec }}>
                  {cameraVerified
                    ? 'Camera ready and calibrated for AI proctoring'
                    : 'A functional front-facing camera is required for identity verification.'}
                </div>
              </div>
            </div>

            <button
              type="button"
              disabled={testingCamera}
              onClick={handleTestCamera}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
                background: cameraVerified ? '#ECFDF5' : '#2563EB',
                color: cameraVerified ? '#059669' : '#ffffff',
                border: cameraVerified ? '1px solid #A7F3D0' : 'none',
                borderRadius: 8,
                padding: '0.55rem 1rem',
                fontSize: '0.82rem',
                fontWeight: 600,
                cursor: testingCamera ? 'not-allowed' : 'pointer',
              }}
            >
              {cameraVerified ? (
                <>
                  <CheckCircle2 size={15} /> Camera Calibrated
                </>
              ) : testingCamera ? (
                'Testing Stream…'
              ) : (
                'Test My Camera'
              )}
            </button>
          </div>

          {/* Test Video Preview */}
          {cameraVerified && (
            <div
              style={{
                maxWidth: 240,
                aspectRatio: '4 / 3',
                borderRadius: 8,
                overflow: 'hidden',
                border: '2px solid #059669',
                background: '#0F172A',
              }}
            >
              <video
                ref={testVideoRef}
                muted
                playsInline
                style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }}
              />
            </div>
          )}
        </div>

        {/* Proctoring Rules Checklist */}
        <div
          style={{
            background: '#FFFBEB',
            border: '1px solid #FDE68A',
            borderRadius: 12,
            padding: '1.25rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.65rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 700, color: '#B45309', fontSize: '0.9rem' }}>
            <Shield size={16} /> Examination Integrity & Proctoring Rules
          </div>
          <ul style={{ margin: 0, paddingLeft: '1.25rem', fontSize: '0.82rem', color: '#92400E', lineHeight: 1.6 }}>
            <li>
              <strong>Mandatory Fullscreen:</strong> The assessment will automatically request fullscreen mode. Exiting fullscreen will be logged as a violation.
            </li>
            <li>
              <strong>Tab Switching Disabled:</strong> Minimizing the window, opening new tabs, or switching applications will trigger active proctoring alerts.
            </li>
            <li>
              <strong>Continuous Facial Scanning:</strong> The camera must remain unobstructed. Head absence or multiple people in the frame will be flagged.
            </li>
            <li>
              <strong>No Clipboard / Copy-Paste:</strong> Copying question text to external search engines or AI tools is strictly restricted.
            </li>
          </ul>

          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.65rem',
              marginTop: '0.5rem',
              cursor: 'pointer',
              fontSize: '0.85rem',
              fontWeight: 700,
              color: '#78350F',
            }}
          >
            <input
              type="checkbox"
              checked={consentAgreed}
              onChange={(e) => setConsentAgreed(e.target.checked)}
              style={{ width: 17, height: 17, cursor: 'pointer' }}
            />
            <span>I acknowledge the proctoring rules and agree to take this assessment honestly.</span>
          </label>
        </div>

        {/* Action Button */}
        <button
          onClick={handleStartAssessment}
          disabled={!consentAgreed || !name.trim() || !email.trim() || isScheduledFuture || isWindowExpired}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.5rem',
            background: !consentAgreed || !name.trim() || !email.trim() || isScheduledFuture || isWindowExpired
              ? '#CBD5E1'
              : 'linear-gradient(135deg, #1E40AF 0%, #2563EB 100%)',
            color: !consentAgreed || !name.trim() || !email.trim() || isScheduledFuture || isWindowExpired
              ? '#64748B'
              : '#ffffff',
            border: 'none',
            borderRadius: 10,
            padding: '0.85rem 1.75rem',
            fontSize: '1rem',
            fontWeight: 800,
            cursor: !consentAgreed || !name.trim() || !email.trim() || isScheduledFuture || isWindowExpired ? 'not-allowed' : 'pointer',
            boxShadow: !consentAgreed || !name.trim() || !email.trim() || isScheduledFuture || isWindowExpired
              ? 'none'
              : '0 4px 14px rgba(37, 99, 235, 0.3)',
            transition: 'all 0.15s ease',
          }}
        >
          {isScheduledFuture ? (
            <>
              <Lock size={18} />
              <span>Starts in {formatCountdown(new Date(quiz.scheduledStartTime!).getTime() - (now || 0))}</span>
            </>
          ) : isWindowExpired ? (
            <>
              <Lock size={18} />
              <span>Assessment Window Closed</span>
            </>
          ) : (
            <>
              <span>Begin Proctored Assessment</span>
              <ArrowRight size={18} />
            </>
          )}
        </button>
      </div>
    </div>
  )
}
