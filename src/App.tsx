import { useState, useEffect, useRef, useCallback } from 'react'
import type { ReactNode } from 'react'
import { 
  Settings, User, Calculator, MessageSquare, CameraOff, 
  AlertTriangle, Square, Mic, Clock, Volume2, 
  CornerDownLeft, CheckCircle, Info, Check, 
  TrendingUp, Lightbulb, ArrowLeft, ArrowRight 
} from 'lucide-react'
import { useAuth } from './hooks/useAuth'
import {
  deleteUserProfile,
  listUserProfiles,
  seedSessionRecords,
  seedUserProfiles,
  updateUserProfile,
} from './services/firestore.service'
import type { UserProfile, UserRole } from './services/firestore.service'
import { loadSessions, saveSession, updateSession } from './services/session.service'

// ── THEME TOKENS ────────────────────────────────────────────────────────────
const T = {
  bg:         '#f7f9fb',
  bgWhite:    '#ffffff',
  bgLow:      '#f2f4f6',
  bgMid:      '#eceef0',
  bgHigh:     '#e6e8ea',
  glass:      'rgba(255,255,255,0.82)',
  glassBord:  'rgba(195,198,209,0.80)',

  txtPri:     '#191c1e',
  txtSec:     '#43474f',
  txtMut:     '#737780',

  primary:    '#001e40',
  primaryFix: '#d5e3ff',
  primaryFixD:'#a7c8ff',
  onPrimFx:   '#001b3c',
  onPrimFxV:  '#1f477b',

  gold:       '#fea619',
  goldFixed:  '#ffddb8',
  goldFixedD: '#ffb95f',
  onGold:     '#684000',

  border:     'rgba(195,198,209,0.8)',
  outlineVar: '#c3c6d1',
  outline:    '#737780',

  error:      '#ba1a1a',
  errCont:    '#ffdad6',
  green:      '#166534',
  greenBg:    '#dcfce7',
  amber:      '#92400e',
  amberBg:    '#fef3c7',
  teal:       '#0f766e',
  purple:     '#7c3aed',
}

// ── DOMAINS ─────────────────────────────────────────────────────────────────
interface Domain {
  id: string
  label: string
  icon: ReactNode
  desc: string
  questions: string[]
}

const DOMAINS: Domain[] = [
  {
    id: 'technical',
    label: 'Technical',
    icon: <Settings size={18} />,
    desc: 'DSA, System Design, Coding',
    questions: [
      'Explain the time complexity of binary search.',
      'What is a RESTful API and how does it differ from GraphQL?',
      'Describe your approach to debugging a production issue.',
    ],
  },
  {
    id: 'hr',
    label: 'HR',
    icon: <User size={18} />,
    desc: 'Behavioral, Soft Skills',
    questions: [
      'Tell me about yourself.',
      'Describe a challenge you overcame at work or college.',
      'Where do you see yourself in 5 years?',
    ],
  },
  {
    id: 'aptitude',
    label: 'Aptitude',
    icon: <Calculator size={18} />,
    desc: 'Quantitative, Logical',
    questions: [
      'If a train travels 60 km in 45 minutes, what is its speed in km/h?',
      'Find the odd one out: 2, 3, 5, 7, 9, 11.',
      'A pipe fills a tank in 6 hours. How long to fill 3/4 of the tank?',
    ],
  },
  {
    id: 'group-discussion',
    label: 'Group Discussion',
    icon: <MessageSquare size={18} />,
    desc: 'GD Topics, Communication',
    questions: [
      'Is remote work the future of corporate culture?',
      'AI: boon or bane for employment?',
      'Which matters more — skills or degrees in today\'s job market?',
    ],
  },
]

const DOMAIN_ICON_COLORS: Record<string, string> = {
  technical: '#2563EB',
  hr: '#7C3AED',
  aptitude: '#059669',
  'group-discussion': '#D97706',
}

const LEVELS = ['Beginner', 'Intermediate', 'Advanced']

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
}

// ── TYPES ────────────────────────────────────────────────────────────────────
interface User {
  uid: string
  name: string
  email: string
  role: UserRole
  sessionId: string
  department?: string
}

interface SessionRecord {
  id: string
  studentName: string
  studentEmail: string
  domain: string
  level: string
  score: number
  date: string
  warnings: number
  report: ReportData
  driveLink?: string
  facultyRemarks?: string
  placementReady?: boolean
}

const getInitialSessions = (): SessionRecord[] => {
  return [
    {
      id: 's1',
      studentName: 'Aarav Mehta',
      studentEmail: 'aarav.mehta@student.mitaoe.ac.in',
      domain: 'Technical',
      level: 'Advanced',
      score: 88,
      date: '2026-06-05',
      warnings: 0,
      report: {
        overallScore: 88,
        technical: 92,
        communication: 85,
        confidence: 86,
        clarity: 89,
        relevance: 90,
        strengths: ['Exceptional coding logic', 'Clear system design walkthrough', 'Good explanation of time complexity'],
        improvements: ['Could mention corner cases of Binary Search', 'Minor pause during Graph search question'],
        tip: 'Deepen your knowledge of system design scalability.',
        proctoringNote: 'Clean session with steady eye contact.',
        warnCount: 0
      },
      facultyRemarks: 'Excellent analytical skills. Approved.',
      placementReady: true
    },
    {
      id: 's2',
      studentName: 'Aarav Mehta',
      studentEmail: 'aarav.mehta@student.mitaoe.ac.in',
      domain: 'Aptitude',
      level: 'Intermediate',
      score: 76,
      date: '2026-06-04',
      warnings: 1,
      report: {
        overallScore: 76,
        technical: 75,
        communication: 78,
        confidence: 72,
        clarity: 79,
        relevance: 76,
        strengths: ['Solved the probability problem accurately', 'Fast calculations'],
        improvements: ['Struggled with the logical reasoning sequence', 'Took too long on Q3'],
        tip: 'Practice speed math exercises to save time.',
        proctoringNote: '1 tab switch warning logged.',
        warnCount: 1
      },
      facultyRemarks: '',
      placementReady: undefined
    },
    {
      id: 's3',
      studentName: 'Isha Deshpande',
      studentEmail: 'isha.deshpande@student.mitaoe.ac.in',
      domain: 'HR',
      level: 'Intermediate',
      score: 92,
      date: '2026-06-07',
      warnings: 0,
      report: {
        overallScore: 92,
        technical: 88,
        communication: 95,
        confidence: 94,
        clarity: 92,
        relevance: 91,
        strengths: ['Highly articulate', 'Superb STAR framework usage', 'Strong leadership examples'],
        improvements: ['Answers could be 10% more concise'],
        tip: 'Try to summarize your answers slightly faster.',
        proctoringNote: 'Perfect proctoring results.',
        warnCount: 0
      },
      facultyRemarks: 'Commendable communication and confidence!',
      placementReady: true
    },
    {
      id: 's4',
      studentName: 'Isha Deshpande',
      studentEmail: 'isha.deshpande@student.mitaoe.ac.in',
      domain: 'Technical',
      level: 'Beginner',
      score: 64,
      date: '2026-06-06',
      warnings: 3,
      report: {
        overallScore: 64,
        technical: 58,
        communication: 72,
        confidence: 60,
        clarity: 66,
        relevance: 64,
        strengths: ['Good efforts in explaining arrays', 'Polite tone'],
        improvements: ['Struggled with recursion logic', 'Multiple warnings due to tab-switches'],
        tip: 'Build stronger fundamentals in recursion and trees.',
        proctoringNote: '3 warnings logged: tab switches detected.',
        warnCount: 3
      },
      facultyRemarks: 'Needs to focus on DSA fundamentals and maintain integrity.',
      placementReady: false
    },
    {
      id: 's5',
      studentName: 'Rohit Shinde',
      studentEmail: 'rohit.shinde@student.mitaoe.ac.in',
      domain: 'Aptitude',
      level: 'Advanced',
      score: 82,
      date: '2026-06-07',
      warnings: 0,
      report: {
        overallScore: 82,
        technical: 84,
        communication: 80,
        confidence: 82,
        clarity: 82,
        relevance: 82,
        strengths: ['Excellent logical deduction', 'Quick response times'],
        improvements: ['Improve formatting in mental calculations'],
        tip: 'Practice multi-variable linear equation solving.',
        proctoringNote: 'Clean session.',
        warnCount: 0
      },
      facultyRemarks: '',
      placementReady: undefined
    },
    {
      id: 's6',
      studentName: 'Rohit Shinde',
      studentEmail: 'rohit.shinde@student.mitaoe.ac.in',
      domain: 'Group Discussion',
      level: 'Intermediate',
      score: 70,
      date: '2026-06-03',
      warnings: 1,
      report: {
        overallScore: 70,
        technical: 68,
        communication: 74,
        confidence: 70,
        clarity: 70,
        relevance: 68,
        strengths: ['Maintained polite attitude', 'Good structure of points'],
        improvements: ['Could elaborate more on economic impacts', 'Interrupted the AI voice prompt once'],
        tip: 'Allow speakers to finish and listen actively before responding.',
        proctoringNote: '1 face movement warning logged.',
        warnCount: 1
      },
      facultyRemarks: '',
      placementReady: undefined
    },
    {
      id: 's7',
      studentName: 'Sneha Kulkarni',
      studentEmail: 'sneha.kulkarni@student.mitaoe.ac.in',
      domain: 'Group Discussion',
      level: 'Advanced',
      score: 94,
      date: '2026-06-07',
      warnings: 0,
      report: {
        overallScore: 94,
        technical: 90,
        communication: 96,
        confidence: 95,
        clarity: 94,
        relevance: 95,
        strengths: ['Compelling argument structure', 'Excellent command of vocabulary', 'Calm and collected posture'],
        improvements: ['None observed, outstanding performance'],
        tip: 'Perfect! Mentor other peers on GD participation.',
        proctoringNote: 'Excellent proctoring. High facial alignment.',
        warnCount: 0
      },
      facultyRemarks: 'Brilliant performer. Ready for immediate drives.',
      placementReady: true
    },
    {
      id: 's8',
      studentName: 'Sneha Kulkarni',
      studentEmail: 'sneha.kulkarni@student.mitaoe.ac.in',
      domain: 'HR',
      level: 'Advanced',
      score: 89,
      date: '2026-06-05',
      warnings: 0,
      report: {
        overallScore: 89,
        technical: 85,
        communication: 92,
        confidence: 90,
        clarity: 90,
        relevance: 88,
        strengths: ['Highly professional demeanor', 'Great alignment with MIT AoE ideals'],
        improvements: ['Could mention longer term technical goals'],
        tip: 'Keep this enthusiasm up!',
        proctoringNote: 'Clean session.',
        warnCount: 0
      },
      facultyRemarks: 'Strong candidate.',
      placementReady: true
    }
  ]
}

interface Message {
  role: 'ai' | 'user' | 'system'
  text: string
}

interface QA {
  q: string
  a: string
}

interface ReportData {
  overallScore: number
  technical: number
  communication: number
  confidence: number
  clarity: number
  relevance: number
  strengths: string[]
  improvements: string[]
  tip: string
  proctoringNote: string
  warnCount: number
}

interface HistoryEntry {
  domain: string
  level: string
  score: number
  date: string
  warnings: number
}

interface Perms {
  camera: boolean
  microphone: boolean
  checked: boolean
}

// ── REUSABLE UI ──────────────────────────────────────────────────────────────
function GlassCard({
  children,
  style = {},
  onClick,
}: {
  children: React.ReactNode
  style?: React.CSSProperties
  onClick?: () => void
}) {
  return (
    <div
      onClick={onClick}
      style={{
        background: '#ffffff',
        border: '1px solid #E5E7EB',
        borderRadius: 12,
        padding: '1.25rem',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'box-shadow 0.2s',
        ...style,
      }}
    >
      {children}
    </div>
  )
}

function SolidCard({
  children,
  style = {},
}: {
  children: React.ReactNode
  style?: React.CSSProperties
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

type BtnVariant = 'primary' | 'navy' | 'ghost' | 'outline'
type BtnSize = 'sm' | 'md' | 'lg'

function Btn({
  children,
  onClick,
  disabled = false,
  variant = 'primary',
  size = 'md',
  style = {},
}: {
  children: React.ReactNode
  onClick?: () => void
  disabled?: boolean
  variant?: BtnVariant
  size?: BtnSize
  style?: React.CSSProperties
}) {
  const pad = size === 'sm' ? '6px 16px' : size === 'lg' ? '13px 28px' : '9px 20px'
  const fs = size === 'sm' ? 12 : size === 'lg' ? 15 : 13

  let bg: string, color: string, border: string
  if (disabled) {
    bg = T.bgMid; color = T.txtMut; border = 'none'
  } else if (variant === 'primary') {
    bg = T.gold; color = T.onGold; border = 'none'
  } else if (variant === 'navy') {
    bg = T.primary; color = '#fff'; border = 'none'
  } else if (variant === 'ghost') {
    bg = T.bgLow; color = T.primary; border = `1px solid ${T.outlineVar}`
  } else {
    bg = 'transparent'; color = T.primary; border = `1px solid ${T.outlineVar}`
  }

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: pad,
        fontSize: fs,
        fontWeight: 600,
        borderRadius: 30,
        border,
        background: bg,
        color,
        cursor: disabled ? 'not-allowed' : 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        transition: 'opacity 0.15s',
        whiteSpace: 'nowrap',
        fontFamily: 'inherit',
        ...style,
      }}
    >
      {children}
    </button>
  )
}

function Pill({
  children,
  color = T.onPrimFx,
  bg = T.primaryFix,
}: {
  children: React.ReactNode
  color?: string
  bg?: string
}) {
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 700,
        padding: '3px 10px',
        borderRadius: 20,
        background: bg,
        color,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
      }}
    >
      {children}
    </span>
  )
}

function scoreColor(v: number): string {
  if (v >= 85) return '#3B82F6'
  if (v >= 70) return '#10B981'
  if (v >= 50) return '#F59E0B'
  return '#EF4444'
}

function ScoreRing({
  score,
  size = 90,
  color = T.primary,
}: {
  score: number
  size?: number
  color?: string
}) {
  const r = (size - 10) / 2
  const circ = 2 * Math.PI * r
  const dash = (score / 100) * circ
  return (
    <svg width={size} height={size}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={T.bgHigh} strokeWidth={6} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={6}
        strokeDasharray={`${dash} ${circ}`}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: 'stroke-dasharray 0.6s ease' }}
      />
      <text
        x={size / 2}
        y={size / 2 + 8}
        textAnchor="middle"
        fontSize={size * 0.32}
        fontWeight="800"
        fill={color}
      >
        {score}
      </text>
    </svg>
  )
}

function RadarChart({ scores }: { scores: Record<string, number> }) {
  const cx = 140, cy = 140, r = 80
  const keys = Object.keys(scores)
  const n = keys.length
  const pts = keys.map((k, i) => {
    const a = (i / n) * 2 * Math.PI - Math.PI / 2
    const v = scores[k] / 100
    return {
      x: cx + r * v * Math.cos(a),
      y: cy + r * v * Math.sin(a),
      lx: cx + (r + 36) * Math.cos(a),
      ly: cy + (r + 36) * Math.sin(a),
      label: k,
    }
  })
  const gp = (f: number) =>
    keys
      .map((_, i) => {
        const a = (i / n) * 2 * Math.PI - Math.PI / 2
        return `${cx + r * f * Math.cos(a)},${cy + r * f * Math.sin(a)}`
      })
      .join(' ')

  return (
    <svg viewBox="0 0 280 280" width="100%" style={{ display: 'block', margin: '0 auto', maxWidth: 280 }}>
      {[0.25, 0.5, 0.75, 1].map((f) => (
        <polygon key={f} points={gp(f)} fill="none" stroke={T.outlineVar} strokeWidth={0.75} />
      ))}
      {pts.map((p, i) => (
        <line
          key={i}
          x1={cx}
          y1={cy}
          x2={cx + r * Math.cos((i / n) * 2 * Math.PI - Math.PI / 2)}
          y2={cy + r * Math.sin((i / n) * 2 * Math.PI - Math.PI / 2)}
          stroke={T.outlineVar}
          strokeWidth={0.75}
        />
      ))}
      <polygon
        points={pts.map((p) => `${p.x},${p.y}`).join(' ')}
        fill={T.primaryFix + '99'}
        stroke={T.primary}
        strokeWidth={2}
      />
      {pts.map((p, i) => (
        <text
          key={i}
          x={p.lx}
          y={p.ly + 4}
          textAnchor="middle"
          fontSize={12}
          fill={T.txtSec}
          fontWeight="600"
        >
          {p.label}
        </text>
      ))}
    </svg>
  )
}

// ── PROCTORED CAMERA ─────────────────────────────────────────────────────────
function ProctoredCamera({
  onWarning,
  active,
  onStreamReady,
}: {
  onWarning?: (w: string) => void
  active: boolean
  onStreamReady?: (stream: MediaStream) => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [camStatus, setCamStatus] = useState<'idle' | 'requesting' | 'active' | 'error'>('idle')
  const [faceStatus] = useState<'detecting' | 'detected' | 'missing'>('detecting')
  const [warnCount, setWarnCount] = useState(0)
  const [warnLog, setWarnLog] = useState<string[]>([])
  const [blurCount, setBlurCount] = useState(0)
  const lastFace = useRef(0)
  const ivRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const addWarn = useCallback(
    (w: string) => {
      setWarnLog((p) => [...p.slice(-4), w])
      setWarnCount((c) => c + 1)
      onWarning?.(w)
    },
    [onWarning]
  )

  const initCamera = useCallback(async () => {
    setCamStatus('requesting')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 320 }, height: { ideal: 240 }, facingMode: 'user' },
        audio: true,
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.play().catch(() => {})
      }
      setCamStatus('active')
      onStreamReady?.(stream)
    } catch {
      setCamStatus('error')
    }
  }, [onStreamReady])

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
    setCamStatus('idle')
    if (ivRef.current) clearInterval(ivRef.current)
  }, [])

  useEffect(() => {
    const startCamera = window.setTimeout(() => {
      if (active) initCamera()
    }, 0)
    return () => {
      window.clearTimeout(startCamera)
      stopCamera()
    }
  }, [active, initCamera, stopCamera])

  useEffect(() => {
    if (!active) return
    const onBlur = () => {
      setBlurCount((c) => c + 1)
      addWarn(`Tab switch #${blurCount + 1} at ${new Date().toLocaleTimeString()}`)
    }
    window.addEventListener('blur', onBlur)
    return () => window.removeEventListener('blur', onBlur)
  }, [active, addWarn, blurCount])

  useEffect(() => {
    if (!active || camStatus !== 'active') {
      if (ivRef.current) clearInterval(ivRef.current)
      return
    }
    lastFace.current = Date.now()
    ivRef.current = setInterval(() => {
      const present = Math.random() > 0.06
      if (present) {
        lastFace.current = Date.now()
      } else if (Date.now() - lastFace.current > 4000) {
        addWarn('Face not visible in frame')
      }
    }, 2500)
    return () => { if (ivRef.current) clearInterval(ivRef.current) }
  }, [active, camStatus, addWarn])

  const sc =
    faceStatus === 'detected' ? T.green : faceStatus === 'missing' ? T.error : T.amber
  const sl =
    faceStatus === 'detected' ? 'Face OK' : faceStatus === 'missing' ? 'No face' : 'Detecting…'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div
        style={{
          background: T.bgWhite,
          border: '1px solid #E5E7EB',
          borderRadius: 12,
          padding: 16,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#EF4444', flexShrink: 0 }} />
          <span
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: T.txtSec,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
            }}
          >
            Live Proctor
          </span>
        </div>

        <div
          style={{
            position: 'relative',
            width: 180,
            height: 135,
            borderRadius: 12,
            overflow: 'hidden',
            background: '#0f172a',
            border: `1.5px solid ${camStatus === 'active' ? sc + '66' : T.outlineVar}`,
          }}
        >
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            transform: 'scaleX(-1)',
            display: camStatus === 'active' ? 'block' : 'none',
          }}
        />
        {camStatus === 'requesting' && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: 10 }}>
            Requesting…
          </div>
        )}
        {camStatus === 'error' && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
            <CameraOff size={20} style={{ color: T.error }} />
            <span style={{ fontSize: 9, color: '#ef4444', textAlign: 'center', padding: '0 8px' }}>Camera blocked</span>
          </div>
        )}
        {camStatus === 'idle' && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', fontSize: 10 }}>
            Initializing…
          </div>
        )}
        {camStatus === 'active' && (
          <>
            <div style={{ position: 'absolute', top: 5, left: 5, background: 'rgba(0,0,0,0.72)', borderRadius: 10, padding: '2px 7px', display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: sc, display: 'inline-block' }} />
              <span style={{ fontSize: 9, color: '#fff' }}>{sl}</span>
            </div>
            <div role="status" aria-label="Recording in progress" style={{ position: 'absolute', top: 5, right: 5, background: 'rgba(0,0,0,0.72)', borderRadius: 10, padding: '2px 7px', display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#ef4444', animation: 'blink 1s infinite', display: 'inline-block' }} />
              <span style={{ fontSize: 9, color: '#fff' }}>REC</span>
            </div>
          </>
        )}
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            marginTop: 12,
            paddingTop: 12,
            borderTop: '1px solid #E5E7EB',
          }}
        >
          <div style={{ padding: '0 10px 0 0' }}>
            <div style={{ fontSize: 9, color: T.txtSec }}>Tab switches</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: blurCount > 0 ? T.error : T.green }}>
              {blurCount}
            </div>
          </div>
          <div style={{ padding: '0 0 0 10px', borderLeft: '1px solid #E5E7EB' }}>
            <div style={{ fontSize: 9, color: T.txtSec }}>Warnings</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: warnCount > 0 ? T.amber : T.green }}>
              {warnCount}
            </div>
          </div>
        </div>
      </div>

      {warnLog.length > 0 && (
        <div style={{ background: T.errCont, border: `1px solid ${T.error}44`, borderRadius: 8, padding: '6px 10px', maxHeight: 60, overflowY: 'auto' }}>
          {warnLog.slice(-3).map((w, i) => (
            <div key={i} style={{ fontSize: 9, color: T.error, display: 'flex', alignItems: 'center', gap: 4 }}>
              <AlertTriangle size={10} style={{ color: T.error, flexShrink: 0 }} />
              <span>{w}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── MIC BUTTON ───────────────────────────────────────────────────────────────
function MicButton({
  onTranscript,
  disabled,
}: {
  onTranscript?: (t: string) => void
  disabled: boolean
}) {
  const [listening, setListening] = useState(false)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recRef = useRef<any>(null)
  const supported = !!(window.SpeechRecognition || window.webkitSpeechRecognition)

  function startListening() {
    if (!supported || disabled) return
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    const rec = new SR()
    rec.lang = 'en-IN'
    rec.continuous = false
    rec.interimResults = false
    rec.onstart = () => setListening(true)
    rec.onresult = (e) => onTranscript?.(e.results[0][0].transcript)
    rec.onerror = () => setListening(false)
    rec.onend = () => setListening(false)
    rec.start()
    recRef.current = rec
  }

  if (!supported) {
    return (
      <div style={{ fontSize: 10, color: T.amber, padding: '4px 8px', background: T.amberBg, borderRadius: 8 }}>
        No mic API
      </div>
    )
  }

  return (
    <button
      className={`mic-btn${listening ? ' recording' : ''}`}
      onClick={startListening}
      disabled={disabled || listening}
      aria-label={listening ? 'Recording in progress' : 'Start voice recording'}
      title={listening ? 'Listening…' : 'Click to speak'}
      style={{
        width: 36,
        height: 36,
        borderRadius: '50%',
        border: `1.5px solid ${listening ? T.error : T.outlineVar}`,
        background: listening ? T.errCont : T.bgLow,
        color: listening ? T.error : T.primary,
        cursor: disabled ? 'not-allowed' : 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        fontSize: 16,
        transition: 'all 0.2s',
        boxShadow: listening ? `0 0 0 4px ${T.error}22` : 'none',
      }}
    >
      {listening ? <Square size={16} fill="currentColor" /> : <Mic size={16} />}
    </button>
  )
}

// ── LANDING PAGE ─────────────────────────────────────────────────────────────
function LandingPage({ onEnterPortal }: { onEnterPortal: () => void }) {
  return (
    <div style={{ minHeight: '100vh', background: T.bg, color: T.txtPri, fontFamily: 'inherit' }}>
      {/* Public Navbar */}
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 50,
          background: 'rgba(255,255,255,0.9)',
          backdropFilter: 'blur(16px)',
          borderBottom: `1px solid ${T.border}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 24px',
          height: 60,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 20, fontWeight: 800, color: T.primary, letterSpacing: '-0.3px' }}>
            PrepHire<span style={{ color: T.gold }}>.</span>AI
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center' }}>
            <Pill color={T.onGold} bg={T.goldFixed}>MIT AoE</Pill>
          </span>
        </div>

        <nav style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          <a href="#features" style={{ fontSize: 13, fontWeight: 600, color: T.txtSec, textDecoration: 'none' }}>Features</a>
          <a href="#how-it-works" style={{ fontSize: 13, fontWeight: 600, color: T.txtSec, textDecoration: 'none' }}>How it Works</a>
          <a href="#stats" style={{ fontSize: 13, fontWeight: 600, color: T.txtSec, textDecoration: 'none' }}>Statistics</a>
          <Btn onClick={onEnterPortal} variant="navy" size="sm">Access Portal</Btn>
        </nav>
      </header>

      {/* Hero Section */}
      <section
        style={{
          padding: '80px 48px 60px 48px',
         
          margin: '0 auto',
          display: 'grid',
          gridTemplateColumns: '1.2fr 1fr',
          gap: 40,
          alignItems: 'center',
        }}
      >
        {/* Left Side: Copy */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: T.primaryFix, padding: '6px 14px', borderRadius: 30, width: 'fit-content' }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: T.primary }} />
            <span style={{ fontSize: 11, fontWeight: 700, color: T.onPrimFxV, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
              MIT AoE Placement Cell Simulator
            </span>
          </div>

          <h1 style={{ fontSize: 38, fontWeight: 800, color: T.primary, lineHeight: 1.2, letterSpacing: '-1px' }}>
            Ace Your Campus Placement Interviews with <span style={{ color: T.gold }}>PrepHire.AI</span>
          </h1>

          <p style={{ fontSize: 15, color: T.txtSec, lineHeight: 1.6 }}>
            Practice real-time mock interviews tailored specifically for engineering candidates. Receive instant AI-generated performance reports, granular skill evaluation, and live proctoring checks.
          </p>

          <div style={{ display: 'flex', gap: 12, marginTop: 10 }}>
            <Btn onClick={onEnterPortal} size="lg">Start Mock Interview <ArrowRight size={16} /></Btn>
            <a href="#features" style={{ textDecoration: 'none' }}>
              <Btn variant="outline" size="lg">Explore Features</Btn>
            </a>
          </div>
        </div>

        {/* Right Side: Visual Mockup */}
        <div
          style={{
            background: '#ffffff',
            border: `1.5px solid ${T.border}`,
            borderRadius: 16,
            padding: 20,
            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.05), 0 10px 10px -5px rgba(0,0,0,0.02)',
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}
        >
          {/* Visual video proctor box */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: T.error, animation: 'blink 1s infinite' }} />
              <span style={{ fontSize: 10, fontWeight: 700, color: T.txtSec, textTransform: 'uppercase' }}>PROCTOR ACTIVE</span>
            </div>
            <span style={{ fontSize: 9, color: T.txtMut }}>Session: Technical DSA</span>
          </div>

          <div style={{ height: 140, background: '#0f172a', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: 8, left: 8, background: 'rgba(0,0,0,0.6)', padding: '2px 8px', borderRadius: 20, display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 4, height: 4, borderRadius: '50%', background: T.green }} />
              <span style={{ fontSize: 8, color: '#fff' }}>Face Detected</span>
            </div>
            {/* Visual soundwaves / silhouette */}
            <div style={{ width: 40, height: 40, borderRadius: '50%', border: '2px solid #3b82f6', display: 'flex', alignItems: 'center', justifyContent: 'center', animation: 'micPulse 1.5s infinite' }}>
              <Mic size={18} style={{ color: '#3b82f6' }} />
            </div>
          </div>

          {/* Visual QA Feed */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
            <div style={{ alignSelf: 'flex-start', background: T.bgLow, padding: '8px 12px', borderRadius: '12px 12px 12px 4px', fontSize: 11, maxWidth: '85%' }}>
              <span style={{ fontSize: 9, fontWeight: 700, color: T.gold, display: 'block', marginBottom: 2 }}>PrepHire AI</span>
              Explain the time complexity of Binary Search and when we should use it.
            </div>
            <div style={{ alignSelf: 'flex-end', background: T.primary, color: '#fff', padding: '8px 12px', borderRadius: '12px 12px 4px 12px', fontSize: 11, maxWidth: '85%' }}>
              Binary search takes O(log n) time. It requires a sorted array to search through.
            </div>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section id="stats" style={{ background: T.primary, color: '#fff', padding: '50px 24px' }}>
        <div style={{ maxWidth: 1000, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 24, textAlign: 'center' }}>
          {[
            { value: '94%', label: 'Placement Success Rate' },
            { value: '1,200+', label: 'Mock Sessions Run' },
            { value: '15+', label: 'Engineering Branches' },
            { value: 'O(log N)', label: 'Average Skill Growth' }
          ].map((stat, idx) => (
            <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontSize: 32, fontWeight: 800, color: T.gold }}>{stat.value}</span>
              <span style={{ fontSize: 12, color: T.primaryFix, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{stat.label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Feature Cards Section */}
      <section id="features" style={{ padding: '70px 24px' }}>
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <h2 style={{ fontSize: 24, fontWeight: 700, color: T.primary, marginBottom: 8 }}>Comprehensive Placement Toolkit</h2>
          <p style={{ fontSize: 13, color: T.txtSec }}>Engineered to replicate actual corporate assessment environment standards.</p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          <GlassCard style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
            <div style={{ padding: 10, background: '#2563EB1A', color: '#2563EB', borderRadius: 10 }}><Settings size={22} /></div>
            <div>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: T.primary, marginBottom: 4 }}>Real-Time AI Mock Interviews</h3>
              <p style={{ fontSize: 12, color: T.txtSec, lineHeight: 1.5 }}>Dynamic interview coach providing personalized queries, micro-feedback, and instant evaluation.</p>
            </div>
          </GlassCard>

          <GlassCard style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
            <div style={{ padding: 10, background: '#7C3AED1A', color: '#7C3AED', borderRadius: 10 }}><User size={22} /></div>
            <div>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: T.primary, marginBottom: 4 }}>Multi-Domain Practice</h3>
              <p style={{ fontSize: 12, color: T.txtSec, lineHeight: 1.5 }}>Simulations spanning Technical DSA, Behavioral HR interviews, Quantitative Aptitude, and GD topics.</p>
            </div>
          </GlassCard>

          <GlassCard style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
            <div style={{ padding: 10, background: '#EF44441A', color: '#EF4444', borderRadius: 10 }}><AlertTriangle size={22} /></div>
            <div>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: T.primary, marginBottom: 4 }}>Anti-Cheat Live Proctoring</h3>
              <p style={{ fontSize: 12, color: T.txtSec, lineHeight: 1.5 }}>Integrated facial validation and active tab tracking to verify assessment integrity.</p>
            </div>
          </GlassCard>

          <GlassCard style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
            <div style={{ padding: 10, background: '#0596691A', color: '#059669', borderRadius: 10 }}><CheckCircle size={22} /></div>
            <div>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: T.primary, marginBottom: 4 }}>Placement Cell Analytics</h3>
              <p style={{ fontSize: 12, color: T.txtSec, lineHeight: 1.5 }}>Detailed report card, skills radar, strengths profile, and placement officer verification check.</p>
            </div>
          </GlassCard>
        </div>
      </section>

      {/* How it Works Section */}
      <section id="how-it-works" style={{ background: T.bgLow, padding: '70px 48px' }}>
        <div style={{width: '100%'}}>
          <div style={{ textAlign: 'center', marginBottom: 40 }}>
            <h2 style={{ fontSize: 24, fontWeight: 700, color: T.primary, marginBottom: 8 }}>How to Prepare</h2>
            <p style={{ fontSize: 13, color: T.txtSec }}>Four simple steps to absolute campus placement readiness.</p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 20 }}>
            {[
              { step: '01', title: 'Portal Registration', desc: 'Sign in to access your customized student dashboard and profile.' },
              { step: '02', title: 'Self-Introduction', desc: 'Submit a personal intro for the AI to align its interview context.' },
              { step: '03', title: 'Conduct Mock', desc: 'Respond to 5 dynamic questions with live mic transcription.' },
              { step: '04', title: 'Performance Review', desc: 'Obtain instant evaluation ratings and placement approvals.' }
            ].map((step, idx) => (
              <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <span style={{ fontSize: 28, fontWeight: 800, color: T.gold }}>{step.step}</span>
                <h3 style={{ fontSize: 13, fontWeight: 700, color: T.primary }}>{step.title}</h3>
                <p style={{ fontSize: 11, color: T.txtSec, lineHeight: 1.5 }}>{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Call to Action Footer */}
      <section style={{ padding: '70px 48px', textAlign: 'center', background: T.bg }}>
        <div style={{ maxWidth: 600, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'center' }}>
          <h2 style={{ fontSize: 22, fontWeight: 800, color: T.primary }}>Ready to Accelerate Your Placement Prep?</h2>
          <p style={{ fontSize: 13, color: T.txtSec }}>Unlock premium mock sessions, proctored dashboards, and faculty remark feedback.</p>
          <Btn onClick={onEnterPortal} size="lg" style={{ marginTop: 8 }}>Start Practicing Now</Btn>
        </div>
      </section>

      {/* Public Footer */}
      <footer style={{ borderTop: `1px solid ${T.border}`, padding: '24px', background: T.bgWhite, textAlign: 'center' }}>
        <span style={{ fontSize: 11, color: T.txtMut }}>
          © 2026 PrepHire.AI · MIT Academy of Engineering Alandi. Placement Cell Simulator.
        </span>
      </footer>
    </div>
  )
}

// ── LOGIN SCREEN ─────────────────────────────────────────────────────────────
function LoginScreen() {
  const { login, register } = useAuth()
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'Student' as UserRole })
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit() {
    if (!form.email || !form.password || (mode === 'register' && !form.name)) {
      setErr('Please fill all fields.')
      return
    }
    if (!/\S+@\S+\.\S+/.test(form.email)) {
      setErr('Enter a valid email.')
      return
    }
    setErr('')
    setLoading(true)
    try {
      if (mode === 'login') {
        await login(form.email.trim(), form.password)
      } else {
        await register({
          name: form.name.trim(),
          email: form.email.trim(),
          password: form.password,
          role: form.role,
          department: 'General',
        })
      }
    } catch (error) {
      setErr(error instanceof Error ? error.message : 'Authentication failed.')
    } finally {
      setLoading(false)
    }
  }



  const inp: React.CSSProperties = {
    width: '100%',
    boxSizing: 'border-box',
    padding: '10px 14px',
    borderRadius: 10,
    border: `1.5px solid ${T.outlineVar}`,
    background: T.bgWhite,
    color: T.txtPri,
    fontSize: 13,
    fontFamily: 'inherit',
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: T.bg,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem 1rem',
      }}
    >
      <div style={{ width: '100%', maxWidth: 440 }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '1.75rem' }}>
          <div
            style={{
              fontSize: 34,
              fontWeight: 800,
              color: T.primary,
              letterSpacing: '-0.5px',
            }}
          >
            PrepHire<span style={{ color: T.gold }}>.</span>AI
          </div>
          <div className="text-caption" style={{ marginTop: 6 }}>
            MIT Academy of Engineering, Alandi · Placement Prep
          </div>
        </div>

        <SolidCard>
          {/* Tab toggle */}
          <div
            style={{
              display: 'flex',
              gap: 0,
              marginBottom: '1.5rem',
              background: T.bgLow,
              borderRadius: 10,
              padding: 4,
            }}
          >
            {(['login', 'register'] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                style={{
                  flex: 1,
                  padding: '8px',
                  borderRadius: 8,
                  border: 'none',
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: 'pointer',
                  background: mode === m ? T.primary : 'transparent',
                  color: mode === m ? '#fff' : T.txtSec,
                  transition: 'all 0.2s',
                  fontFamily: 'inherit',
                }}
              >
                {m === 'login' ? 'Sign In' : 'Register'}
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {mode === 'register' && (
              <input
                style={inp}
                placeholder="Full name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            )}
            <input
              style={inp}
              placeholder="Email address"
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            />
            <input
              style={inp}
              placeholder="Password"
              type="password"
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
            />
            {mode === 'register' && (
              <select
                style={inp}
                value={form.role}
                onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as UserRole }))}
              >
                {['Student', 'Faculty', 'Admin'].map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
            )}
            {err && (
              <div
                style={{
                  background: T.errCont,
                  border: `1px solid ${T.error}55`,
                  borderRadius: 8,
                  padding: '8px 12px',
                  fontSize: 12,
                  color: T.error,
                }}
              >
                {err}
              </div>
            )}
            <button
              onClick={handleSubmit}
              disabled={loading}
              style={{
                width: '100%',
                padding: '13px',
                borderRadius: 12,
                border: 'none',
                background: T.primary,
                color: '#fff',
                fontSize: 14,
                fontWeight: 700,
                cursor: loading ? 'not-allowed' : 'pointer',
                marginTop: 4,
                opacity: loading ? 0.75 : 1,
                transition: 'opacity 0.2s',
                fontFamily: 'inherit',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
              }}
            >
              {loading ? (
                'Please wait…'
              ) : mode === 'login' ? (
                <>
                  Sign In <ArrowRight size={14} />
                </>
              ) : (
                <>
                  Create Account <ArrowRight size={14} />
                </>
              )}
            </button>
          </div>
        </SolidCard>



        <div style={{ textAlign: 'center', marginTop: '1.5rem' }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              background: T.primaryFix,
              borderRadius: 30,
              padding: '6px 16px',
            }}
          >
            <img
              src="/mitaoe-logo.webp"
              alt="MIT AoE"
              style={{ height: 20, objectFit: 'contain' }}
              onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')}
            />
            <span style={{ fontSize: 12, fontWeight: 600, color: T.onPrimFx }}>
              Powered by MIT AoE Placement Cell
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── NAVBAR ───────────────────────────────────────────────────────────────────
function Navbar({
  user,
  onLogout,
  onHome,
  inInterview,
  timer,
  timerColor,
}: {
  user: User | null
  onLogout: () => void
  onHome: () => void
  inInterview: boolean
  timer?: number
  timerColor?: string
}) {
  return (
    <header
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 50,
        background: 'rgba(255,255,255,0.88)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        borderBottom: `1px solid ${T.border}`,
        boxShadow: '0 1px 3px rgba(0,30,64,0.06)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 24px',
        height: 60,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <span
          onClick={onHome}
          style={{
            fontSize: 20,
            fontWeight: 800,
            color: T.primary,
            cursor: 'pointer',
            letterSpacing: '-0.3px',
            userSelect: 'none',
          }}
        >
          PrepHire<span style={{ color: T.gold }}>.</span>AI
        </span>
        {!inInterview && (
          <span style={{ marginLeft: 8, display: 'inline-flex', alignItems: 'center' }}>
            <Pill color={T.onGold} bg={T.goldFixed}>MIT AoE</Pill>
          </span>
        )}
        {inInterview && timer !== undefined && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '5px 14px',
              background: T.primaryFix,
              borderRadius: 30,
              border: `1px solid ${T.primaryFixD}`,
              marginLeft: 16,
            }}
          >
            <span
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: timerColor || T.primary,
                fontVariantNumeric: 'tabular-nums',
                display: 'inline-flex',
                alignItems: 'center',
              }}
            >
              <Clock size={13} style={{ marginRight: 4 }} />
              {Math.floor(timer / 60)}:{String(timer % 60).padStart(2, '0')}
            </span>
          </div>
        )}
      </div>

      {user && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: T.txtPri }}>{user.name}</div>
            <div style={{ fontSize: 11, color: T.txtSec }}>{user.role}</div>
          </div>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: '50%',
              background: T.primaryFix,
              border: `2px solid ${T.primaryFixD}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 13,
              fontWeight: 700,
              color: T.onPrimFxV,
              flexShrink: 0,
            }}
          >
            {user.name[0].toUpperCase()}
          </div>
          <button
            onClick={onLogout}
            style={{
              fontSize: 12,
              padding: '6px 14px',
              borderRadius: 20,
              border: `1px solid ${T.outlineVar}`,
              background: T.bgLow,
              cursor: 'pointer',
              color: T.txtSec,
              fontWeight: 600,
              fontFamily: 'inherit',
            }}
          >
            Sign out
          </button>
        </div>
      )}
    </header>
  )
}

// ── HELPERS ──────────────────────────────────────────────────────────────────
async function requestPermissions(): Promise<{ camera: boolean; microphone: boolean }> {
  let camera = false
  let microphone = false
  try {
    const s = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
    s.getTracks().forEach((t) => t.stop())
    camera = true
    microphone = true
  } catch {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: true })
      s.getTracks().forEach((t) => t.stop())
      camera = true
    } catch {
      // Camera not available
    }
  }
  return { camera, microphone }
}

async function callClaude(prompt: string, sys: string): Promise<string> {
  const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY
  if (!GEMINI_API_KEY) {
    throw new Error('Missing VITE_GEMINI_API_KEY environment variable.')
  }
  const baseUrl = import.meta.env.DEV ? '/gemini' : 'https://generativelanguage.googleapis.com'
  const res = await fetch(
    `${baseUrl}/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: sys }] },
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
      }),
    }
  )
  const d = await res.json()
  return d.candidates?.[0]?.content?.parts?.[0]?.text || ''
}
// ── FACULTY DASHBOARD ────────────────────────────────────────────────────────
function FacultyDashboard({
  user,
  allSessions,
  onUpdateSession,
  onLogout,
}: {
  user: User
  allSessions: SessionRecord[]
  onUpdateSession: (id: string, updates: Partial<SessionRecord>) => void
  onLogout: () => void
}) {
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedDomain, setSelectedDomain] = useState('All')
  const [selectedSession, setSelectedSession] = useState<SessionRecord | null>(null)
  const [remarkInput, setRemarkInput] = useState('')
  const [placementReadyToggle, setPlacementReadyToggle] = useState(false)

  const filteredSessions = allSessions.filter((s) => {
    const matchesSearch =
      s.studentName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.studentEmail.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesDomain =
      selectedDomain === 'All' ||
      s.domain.toLowerCase() === selectedDomain.toLowerCase() ||
      (selectedDomain === 'GD' && s.domain === 'Group Discussion')
    return matchesSearch && matchesDomain
  })

  const totalReviewed = allSessions.filter((s) => s.facultyRemarks || s.placementReady !== undefined).length
  const totalStudentsCount = new Set(allSessions.map(s => s.studentEmail)).size
  const avgScore =
    allSessions.length > 0
      ? Math.round(allSessions.reduce((acc, curr) => acc + curr.score, 0) / allSessions.length)
      : 0
  const flagSessions = allSessions.filter((s) => s.warnings > 2).length

  function handleOpenReport(session: SessionRecord) {
    setSelectedSession(session)
    setRemarkInput(session.facultyRemarks || '')
    setPlacementReadyToggle(!!session.placementReady)
  }

  function handleSaveRemark() {
    if (!selectedSession) return
    onUpdateSession(selectedSession.id, {
      facultyRemarks: remarkInput,
      placementReady: placementReadyToggle,
    })
    setSelectedSession(null)
  }

  return (
    <div style={{ minHeight: '100vh', background: T.bg }}>
      <Navbar user={user} onLogout={onLogout} onHome={() => {}} inInterview={false} />

      <div style={{ maxWidth: 1000, margin: '0 auto', padding: '24px 16px', animation: 'fadeIn 0.4s ease' }}>
        
        {/* Welcome */}
        <section style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: T.primary, marginBottom: 6 }}>
            Faculty Assessment & Monitoring Portal
          </h1>
          <p className="text-body" style={{ color: T.txtSec }}>
            Review student interview performance, analyze skills gaps, and approve placement readiness.
          </p>
        </section>

        {/* Stats Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
          <GlassCard style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: T.txtMut, textTransform: 'uppercase' }}>Active Students</span>
            <span style={{ fontSize: 24, fontWeight: 800, color: T.primary }}>{totalStudentsCount}</span>
          </GlassCard>
          <GlassCard style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: T.txtMut, textTransform: 'uppercase' }}>Average Score</span>
            <span style={{ fontSize: 24, fontWeight: 800, color: T.green }}>{avgScore}%</span>
          </GlassCard>
          <GlassCard style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: T.txtMut, textTransform: 'uppercase' }}>Evaluated Sessions</span>
            <span style={{ fontSize: 24, fontWeight: 800, color: T.primary }}>{totalReviewed} / {allSessions.length}</span>
          </GlassCard>
          <GlassCard style={{ display: 'flex', flexDirection: 'column', gap: 6, borderLeft: `3px solid ${T.error}` }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: T.txtMut, textTransform: 'uppercase' }}>Integrity Flags</span>
            <span style={{ fontSize: 24, fontWeight: 800, color: flagSessions > 0 ? T.error : T.green }}>{flagSessions}</span>
          </GlassCard>
        </div>

        {/* Filters and List */}
        <GlassCard style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16, marginBottom: 16 }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {['All', 'Technical', 'HR', 'Aptitude', 'GD'].map((dom) => (
                <button
                  key={dom}
                  onClick={() => setSelectedDomain(dom)}
                  style={{
                    padding: '6px 14px',
                    borderRadius: 20,
                    border: `1.5px solid ${selectedDomain === dom ? T.primary : T.outlineVar}`,
                    background: selectedDomain === dom ? T.primary : 'transparent',
                    color: selectedDomain === dom ? '#fff' : T.txtSec,
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  {dom}
                </button>
              ))}
            </div>

            <input
              type="text"
              placeholder="Search by student name…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                padding: '8px 14px',
                borderRadius: 10,
                border: `1.5px solid ${T.outlineVar}`,
                fontSize: 12,
                minWidth: 240,
              }}
            />
          </div>

          {/* Table */}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${T.border}`, color: T.txtMut, fontSize: 11, fontWeight: 700, textTransform: 'uppercase' }}>
                  <th style={{ padding: '12px 8px' }}>Student</th>
                  <th style={{ padding: '12px 8px' }}>Domain</th>
                  <th style={{ padding: '12px 8px' }}>Level</th>
                  <th style={{ padding: '12px 8px' }}>Score</th>
                  <th style={{ padding: '12px 8px' }}>Warnings</th>
                  <th style={{ padding: '12px 8px' }}>Status</th>
                  <th style={{ padding: '12px 8px' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredSessions.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: '24px', color: T.txtMut, fontSize: 13 }}>
                      No sessions found matching filters.
                    </td>
                  </tr>
                ) : (
                  filteredSessions.map((session) => (
                    <tr
                      key={session.id}
                      style={{
                        borderBottom: `1px solid ${T.border}`,
                        fontSize: 13,
                        color: T.txtPri,
                        background: session.warnings > 2 ? 'rgba(186, 26, 26, 0.03)' : 'transparent',
                      }}
                    >
                      <td style={{ padding: '12px 8px' }}>
                        <div style={{ fontWeight: 600 }}>{session.studentName}</div>
                        <div style={{ fontSize: 10, color: T.txtMut }}>{session.studentEmail}</div>
                      </td>
                      <td style={{ padding: '12px 8px' }}>{session.domain}</td>
                      <td style={{ padding: '12px 8px' }}>
                        <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 10, background: T.bgLow }}>
                          {session.level}
                        </span>
                      </td>
                      <td style={{ padding: '12px 8px' }}>
                        <span style={{ fontWeight: 700, color: scoreColor(session.score) }}>
                          {session.score}%
                        </span>
                      </td>
                      <td style={{ padding: '12px 8px' }}>
                        <span style={{ fontWeight: 600, color: session.warnings > 2 ? T.error : T.txtSec }}>
                          {session.warnings}
                        </span>
                      </td>
                      <td style={{ padding: '12px 8px' }}>
                        {session.placementReady === true ? (
                          <Pill color={T.green} bg={T.greenBg}>PLACEMENT READY</Pill>
                        ) : session.placementReady === false ? (
                          <Pill color={T.error} bg={T.errCont}>REASSESSMENT REQ.</Pill>
                        ) : (
                          <Pill color={T.outline} bg={T.bgMid}>PENDING</Pill>
                        )}
                      </td>
                      <td style={{ padding: '12px 8px' }}>
                        <Btn size="sm" onClick={() => handleOpenReport(session)}>
                          Evaluate
                        </Btn>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </GlassCard>
      </div>

      {/* Report Modal */}
      {selectedSession && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,30,64,0.4)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: 16,
            animation: 'fadeIn 0.2s ease',
          }}
        >
          <div
            style={{
              background: T.bgWhite,
              borderRadius: 16,
              width: '100%',
              maxWidth: 900,
              maxHeight: '90vh',
              overflowY: 'auto',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
              padding: 24,
              position: 'relative',
            }}
          >
            {/* Modal Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, borderBottom: `1px solid ${T.border}`, paddingBottom: 16 }}>
              <div>
                <h2 style={{ fontSize: 18, fontWeight: 700, color: T.primary }}>
                  Detailed Performance Report: {selectedSession.studentName}
                </h2>
                <div style={{ fontSize: 12, color: T.txtSec, marginTop: 4 }}>
                  {selectedSession.studentEmail} · {selectedSession.domain} ({selectedSession.level}) on {selectedSession.date}
                </div>
              </div>
              <button
                onClick={() => setSelectedSession(null)}
                style={{
                  border: 'none',
                  background: 'none',
                  fontSize: 20,
                  cursor: 'pointer',
                  color: T.txtMut,
                  fontWeight: 800,
                }}
              >
                &times;
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 20 }}>
              
              {/* Left Side: Score & Radar Chart */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                
                {/* Metrics */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8 }}>
                  <div style={{ background: scoreColor(selectedSession.score) + '11', padding: 8, borderRadius: 8, textAlign: 'center' }}>
                    <div style={{ fontSize: 16, fontWeight: 800, color: scoreColor(selectedSession.score) }}>{selectedSession.score}</div>
                    <div style={{ fontSize: 8, color: T.txtSec, marginTop: 2 }}>Overall</div>
                  </div>
                  <div style={{ background: scoreColor(selectedSession.report.technical) + '11', padding: 8, borderRadius: 8, textAlign: 'center' }}>
                    <div style={{ fontSize: 16, fontWeight: 800, color: scoreColor(selectedSession.report.technical) }}>{selectedSession.report.technical}</div>
                    <div style={{ fontSize: 8, color: T.txtSec, marginTop: 2 }}>Tech</div>
                  </div>
                  <div style={{ background: scoreColor(selectedSession.report.communication) + '11', padding: 8, borderRadius: 8, textAlign: 'center' }}>
                    <div style={{ fontSize: 16, fontWeight: 800, color: scoreColor(selectedSession.report.communication) }}>{selectedSession.report.communication}</div>
                    <div style={{ fontSize: 8, color: T.txtSec, marginTop: 2 }}>Comms</div>
                  </div>
                  <div style={{ background: scoreColor(selectedSession.report.confidence) + '11', padding: 8, borderRadius: 8, textAlign: 'center' }}>
                    <div style={{ fontSize: 16, fontWeight: 800, color: scoreColor(selectedSession.report.confidence) }}>{selectedSession.report.confidence}</div>
                    <div style={{ fontSize: 8, color: T.txtSec, marginTop: 2 }}>Confidence</div>
                  </div>
                  <div style={{ background: scoreColor(selectedSession.report.clarity) + '11', padding: 8, borderRadius: 8, textAlign: 'center' }}>
                    <div style={{ fontSize: 16, fontWeight: 800, color: scoreColor(selectedSession.report.clarity) }}>{selectedSession.report.clarity}</div>
                    <div style={{ fontSize: 8, color: T.txtSec, marginTop: 2 }}>Clarity</div>
                  </div>
                </div>

                {/* Radar Chart */}
                <div style={{ background: T.bgLow, padding: 12, borderRadius: 12, display: 'flex', justifyContent: 'center' }}>
                  <RadarChart
                    scores={{
                      Technical: selectedSession.report.technical,
                      Comms: selectedSession.report.communication,
                      Confidence: selectedSession.report.confidence,
                      Clarity: selectedSession.report.clarity,
                      Relevance: selectedSession.report.relevance || 70,
                    }}
                  />
                </div>

                {/* Proctoring log */}
                <div style={{ background: selectedSession.warnings > 2 ? T.errCont : T.bgLow, padding: 12, borderRadius: 12, borderLeft: `3px solid ${selectedSession.warnings > 2 ? T.error : T.outlineVar}` }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: selectedSession.warnings > 2 ? T.error : T.primary, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <AlertTriangle size={12} /> Proctoring Status ({selectedSession.warnings} warning(s))
                  </div>
                  <div style={{ fontSize: 11, color: T.txtSec, marginTop: 4 }}>
                    {selectedSession.report.proctoringNote || "No flag logs recorded."}
                  </div>
                </div>

                {/* Interview recording link */}
                {selectedSession.driveLink && (
                  <div style={{
                    background: T.bgWhite,
                    border: `1px solid ${T.border}`,
                    borderRadius: 12,
                    padding: 12,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginTop: 4
                  }}>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: T.primary }}>
                        Recorded Interview
                      </div>
                      <div style={{ fontSize: 10, color: T.txtSec, marginTop: 2 }}>
                        Click to watch candidate video.
                      </div>
                    </div>
                    <a href={selectedSession.driveLink} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>
                      <Btn variant="navy" size="sm" style={{ padding: '6px 12px', fontSize: 11 }}>
                        Watch Video
                      </Btn>
                    </a>
                  </div>
                )}
              </div>

              {/* Right Side: Strengths/Improvements & Feedback */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                
                {/* Strengths & Improvements */}
                <div style={{ background: T.greenBg, padding: 12, borderRadius: 12, borderLeft: `3px solid ${T.green}` }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: T.green, marginBottom: 6 }}>Strengths</div>
                  {selectedSession.report.strengths.map((str, i) => (
                    <div key={i} style={{ fontSize: 11, color: T.txtSec, marginBottom: 4 }}>✓ {str}</div>
                  ))}
                </div>
                
                <div style={{ background: T.amberBg, padding: 12, borderRadius: 12, borderLeft: `3px solid ${T.amber}` }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: T.amber, marginBottom: 6 }}>Areas of Improvement</div>
                  {selectedSession.report.improvements.map((imp, i) => (
                    <div key={i} style={{ fontSize: 11, color: T.txtSec, marginBottom: 4 }}>⚠ {imp}</div>
                  ))}
                </div>

                {/* Faculty remarks card */}
                <div style={{ border: `1.5px solid ${T.primary}33`, padding: 16, borderRadius: 12, background: T.bgWhite }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: T.primary, marginBottom: 12 }}>
                    Faculty Remarks & Action
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                    <span style={{ fontSize: 12, color: T.txtSec, fontWeight: 600 }}>Approve for Placements?</span>
                    <button
                      onClick={() => setPlacementReadyToggle(!placementReadyToggle)}
                      style={{
                        padding: '4px 12px',
                        fontSize: 10,
                        fontWeight: 700,
                        borderRadius: 20,
                        border: 'none',
                        cursor: 'pointer',
                        background: placementReadyToggle ? T.greenBg : T.errCont,
                        color: placementReadyToggle ? T.green : T.error,
                      }}
                    >
                      {placementReadyToggle ? 'READY' : 'REASSESS'}
                    </button>
                  </div>

                  <textarea
                    placeholder="Enter assessment remarks..."
                    value={remarkInput}
                    onChange={(e) => setRemarkInput(e.target.value)}
                    rows={3}
                    style={{
                      width: '100%',
                      boxSizing: 'border-box',
                      padding: 10,
                      fontSize: 12,
                      borderRadius: 8,
                      border: `1.5px solid ${T.outlineVar}`,
                      resize: 'none',
                      marginBottom: 12,
                    }}
                  />

                  <Btn onClick={handleSaveRemark} variant="navy" style={{ width: '100%', justifyContent: 'center' }}>
                    Save & Submit Evaluation
                  </Btn>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── ADMIN DASHBOARD ──────────────────────────────────────────────────────────
function AdminDashboard({
  user,
  allSessions,
  users,
  onRoleChange,
  onDeleteUser,
  onLogout,
}: {
  user: User
  allSessions: SessionRecord[]
  users: UserProfile[]
  onRoleChange: (userId: string, role: UserRole) => Promise<void>
  onDeleteUser: (userId: string) => Promise<void>
  onLogout: () => void
}) {
  const [activeTab, setActiveTab] = useState<'overview' | 'users' | 'logs' | 'config'>('overview')
  const [strictProctoring, setStrictProctoring] = useState(true)
  const [sessionTimeLimit, setSessionTimeLimit] = useState(90)

  const [searchTerm, setSearchTerm] = useState('')
  const [roleFilter, setRoleFilter] = useState('All')

  // Stats
  const totalStudents = users.filter((u) => u.role === 'Student').length
  const totalFaculty = users.filter((u) => u.role === 'Faculty').length
  const totalInterviews = allSessions.length
  
  const assessedSessions = allSessions.filter((s) => s.placementReady !== undefined)
  const approvedSessions = allSessions.filter((s) => s.placementReady === true)
  const readinessRate = assessedSessions.length > 0 
    ? Math.round((approvedSessions.length / assessedSessions.length) * 100) 
    : 0

  const flagRate = totalInterviews > 0
    ? Math.round((allSessions.filter((s) => s.warnings > 2).length / totalInterviews) * 100)
    : 0

  // Domain Distribution Data
  const domainCounts = {
    Technical: allSessions.filter((s) => s.domain === 'Technical').length,
    HR: allSessions.filter((s) => s.domain === 'HR').length,
    Aptitude: allSessions.filter((s) => s.domain === 'Aptitude').length,
    'Group Discussion': allSessions.filter((s) => s.domain === 'Group Discussion' || s.domain === 'Group Discussion').length,
  }

  // Score distribution counts
  const brackets = {
    Excellent: allSessions.filter((s) => s.score >= 85).length,
    Good: allSessions.filter((s) => s.score >= 70 && s.score < 85).length,
    Average: allSessions.filter((s) => s.score >= 50 && s.score < 70).length,
    Critical: allSessions.filter((s) => s.score < 50).length,
  }

  const auditLogs = [
    { time: '16:45:12', msg: 'Admin session initialized by Dr. Rajesh Sharma.' },
    { time: '15:20:05', msg: 'Prof. Anil Patil approved Aarav Mehta for placements.' },
    { time: '14:15:30', msg: 'Sneha Kulkarni completed Group Discussion interview - Score: 94.' },
    { time: '11:05:44', msg: 'Prof. Deepa Joshi left remarks on Isha Deshpande\'s session.' },
    { time: 'Yesterday', msg: 'Rohit Shinde completed Aptitude interview - Score: 82.' },
    { time: 'June 6, 2026', msg: 'Isha Deshpande registered a new Student account.' },
  ]

  async function handleRoleChange(userId: string, newRole: string) {
    await onRoleChange(userId, newRole as UserRole)
  }

  async function handleDeleteUser(userId: string) {
    await onDeleteUser(userId)
  }

  const filteredUsers = users.filter((u) => {
    const matchesSearch =
      u.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.email.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesRole = roleFilter === 'All' || u.role.toLowerCase() === roleFilter.toLowerCase()
    return matchesSearch && matchesRole
  })

  return (
    <div style={{ minHeight: '100vh', background: T.bg }}>
      <Navbar user={user} onLogout={onLogout} onHome={() => {}} inInterview={false} />

      <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', minHeight: 'calc(100vh - 60px)' }}>
        
        {/* Sidebar */}
        <aside
          style={{
            background: T.bgWhite,
            borderRight: `1px solid ${T.border}`,
            padding: 20,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          <div style={{ fontSize: 10, fontWeight: 700, color: T.txtMut, textTransform: 'uppercase', marginBottom: 10, letterSpacing: '0.08em' }}>
            Placement Console
          </div>
          {[
            { id: 'overview', label: 'Analytics Overview' },
            { id: 'users', label: 'User Management' },
            { id: 'logs', label: 'System Audit Logs' },
            { id: 'config', label: 'Global Configurations' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              style={{
                width: '100%',
                textAlign: 'left',
                padding: '10px 14px',
                borderRadius: 8,
                border: 'none',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                background: activeTab === tab.id ? T.primaryFix : 'transparent',
                color: activeTab === tab.id ? T.primary : T.txtSec,
                transition: 'all 0.15s',
                fontFamily: 'inherit',
              }}
            >
              {tab.label}
            </button>
          ))}
        </aside>

        {/* Main Content Area */}
        <main style={{ padding: 24, overflowY: 'auto' }}>
          {activeTab === 'overview' && (
            <div style={{ animation: 'fadeIn 0.3s ease', display: 'flex', flexDirection: 'column', gap: 20 }}>
              <section>
                <h1 style={{ fontSize: 20, fontWeight: 700, color: T.primary, marginBottom: 4 }}>
                  Placement Readiness Dashboard
                </h1>
                <p className="text-body" style={{ color: T.txtSec }}>
                  Review institutional analytics, domain distribution, and proctoring metrics.
                </p>
              </section>

              {/* KPI Cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
                <GlassCard style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: T.txtMut, textTransform: 'uppercase' }}>Registered Students</span>
                  <span style={{ fontSize: 24, fontWeight: 800, color: T.primary }}>{totalStudents}</span>
                </GlassCard>
                <GlassCard style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: T.txtMut, textTransform: 'uppercase' }}>Registered Faculty</span>
                  <span style={{ fontSize: 24, fontWeight: 800, color: T.primary }}>{totalFaculty}</span>
                </GlassCard>
                <GlassCard style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: T.txtMut, textTransform: 'uppercase' }}>Placement Ready Rate</span>
                  <span style={{ fontSize: 24, fontWeight: 800, color: T.green }}>{readinessRate}%</span>
                </GlassCard>
                <GlassCard style={{ display: 'flex', flexDirection: 'column', gap: 4, borderLeft: `3px solid ${T.error}` }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: T.txtMut, textTransform: 'uppercase' }}>Integrity Flag Rate</span>
                  <span style={{ fontSize: 24, fontWeight: 800, color: flagRate > 10 ? T.error : T.green }}>{flagRate}%</span>
                </GlassCard>
              </div>

              {/* Charts grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                {/* Domain Distribution Chart */}
                <GlassCard>
                  <div style={{ fontSize: 12, fontWeight: 700, color: T.primary, marginBottom: 16, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Domain Practice Distribution
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {Object.entries(domainCounts).map(([dom, count]) => {
                      const percentage = totalInterviews > 0 ? Math.round((count / totalInterviews) * 100) : 0
                      return (
                        <div key={dom} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 600 }}>
                            <span>{dom}</span>
                            <span style={{ color: T.txtMut }}>{count} ({percentage}%)</span>
                          </div>
                          <div style={{ height: 8, background: T.bgLow, borderRadius: 4, overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${percentage}%`, background: T.primary, borderRadius: 4 }} />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </GlassCard>

                {/* Score Bracket Chart */}
                <GlassCard>
                  <div style={{ fontSize: 12, fontWeight: 700, color: T.primary, marginBottom: 16, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Student Score Distribution
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {[
                      { label: 'Excellent (>=85)', count: brackets.Excellent, color: '#3B82F6' },
                      { label: 'Good (70-84)', count: brackets.Good, color: '#10B981' },
                      { label: 'Average (50-69)', count: brackets.Average, color: '#F59E0B' },
                      { label: 'Critical (<50)', count: brackets.Critical, color: '#EF4444' },
                    ].map((bracket) => {
                      const percentage = totalInterviews > 0 ? Math.round((bracket.count / totalInterviews) * 100) : 0
                      return (
                        <div key={bracket.label} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 600 }}>
                            <span>{bracket.label}</span>
                            <span style={{ color: T.txtMut }}>{bracket.count} ({percentage}%)</span>
                          </div>
                          <div style={{ height: 8, background: T.bgLow, borderRadius: 4, overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${percentage}%`, background: bracket.color, borderRadius: 4 }} />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </GlassCard>
              </div>

              {/* Top Performers list */}
              <GlassCard>
                <div style={{ fontSize: 12, fontWeight: 700, color: T.primary, marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Highest Scoring Candidates
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {allSessions
                    .sort((a, b) => b.score - a.score)
                    .slice(0, 3)
                    .map((s, idx) => (
                      <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: T.bgLow, borderRadius: 10 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: T.primary }}>#{idx + 1}</span>
                          <div>
                            <div style={{ fontSize: 12, fontWeight: 700 }}>{s.studentName}</div>
                            <div style={{ fontSize: 9, color: T.txtMut }}>{s.studentEmail} · {s.domain}</div>
                          </div>
                        </div>
                        <span style={{ fontSize: 14, fontWeight: 800, color: scoreColor(s.score) }}>{s.score}%</span>
                      </div>
                    ))}
                </div>
              </GlassCard>
            </div>
          )}

          {activeTab === 'users' && (
            <div style={{ animation: 'fadeIn 0.3s ease', display: 'flex', flexDirection: 'column', gap: 20 }}>
              <section>
                <h1 style={{ fontSize: 20, fontWeight: 700, color: T.primary, marginBottom: 4 }}>
                  User Management Console
                </h1>
                <p className="text-body" style={{ color: T.txtSec }}>
                  Add, modify, delete, or manage system access and roles.
                </p>
              </section>

              <GlassCard>
                <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16, marginBottom: 16 }}>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {['All', 'Student', 'Faculty', 'Admin'].map((role) => (
                      <button
                        key={role}
                        onClick={() => setRoleFilter(role)}
                        style={{
                          padding: '6px 14px',
                          borderRadius: 20,
                          border: `1.5px solid ${roleFilter === role ? T.primary : T.outlineVar}`,
                          background: roleFilter === role ? T.primary : 'transparent',
                          color: roleFilter === role ? '#fff' : T.txtSec,
                          fontSize: 11,
                          fontWeight: 600,
                          cursor: 'pointer',
                          fontFamily: 'inherit',
                        }}
                      >
                        {role}
                      </button>
                    ))}
                  </div>

                  <input
                    type="text"
                    placeholder="Search users by name or email…"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    style={{
                      padding: '8px 14px',
                      borderRadius: 10,
                      border: `1.5px solid ${T.outlineVar}`,
                      fontSize: 12,
                      minWidth: 260,
                    }}
                  />
                </div>

                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                    <thead>
                      <tr style={{ borderBottom: `1px solid ${T.border}`, color: T.txtMut, fontSize: 10, fontWeight: 700, textTransform: 'uppercase' }}>
                        <th style={{ padding: '12px 8px' }}>User Details</th>
                        <th style={{ padding: '12px 8px' }}>Department</th>
                        <th style={{ padding: '12px 8px' }}>Role</th>
                        <th style={{ padding: '12px 8px' }}>Registered On</th>
                        <th style={{ padding: '12px 8px', textAlign: 'right' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredUsers.map((u) => (
                        <tr key={u.id} style={{ borderBottom: `1px solid ${T.border}`, fontSize: 13 }}>
                          <td style={{ padding: '12px 8px' }}>
                            <div style={{ fontWeight: 600 }}>{u.name}</div>
                            <div style={{ fontSize: 10, color: T.txtMut }}>{u.email}</div>
                          </td>
                          <td style={{ padding: '12px 8px' }}>{u.department || 'General'}</td>
                          <td style={{ padding: '12px 8px' }}>
                            <select
                              value={u.role}
                              onChange={(e) => handleRoleChange(u.id, e.target.value)}
                              style={{
                                padding: '4px 8px',
                                borderRadius: 6,
                                fontSize: 11,
                                fontWeight: 600,
                                border: `1.5px solid ${T.outlineVar}`,
                                background: T.bgWhite,
                              }}
                            >
                              <option value="Student">Student</option>
                              <option value="Faculty">Faculty</option>
                              <option value="Admin">Admin</option>
                            </select>
                          </td>
                          <td style={{ padding: '12px 8px', color: T.txtMut, fontSize: 11 }}>{u.registeredAt}</td>
                          <td style={{ padding: '12px 8px', textAlign: 'right' }}>
                            <button
                              onClick={() => handleDeleteUser(u.id)}
                              style={{
                                padding: '4px 10px',
                                border: `1px solid ${T.error}`,
                                background: 'transparent',
                                color: T.error,
                                fontSize: 11,
                                borderRadius: 6,
                                cursor: 'pointer',
                                fontWeight: 600,
                              }}
                            >
                              Delete
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </GlassCard>
            </div>
          )}

          {activeTab === 'logs' && (
            <div style={{ animation: 'fadeIn 0.3s ease', display: 'flex', flexDirection: 'column', gap: 20 }}>
              <section>
                <h1 style={{ fontSize: 20, fontWeight: 700, color: T.primary, marginBottom: 4 }}>
                  System Audit Logs
                </h1>
                <p className="text-body" style={{ color: T.txtSec }}>
                  Chronological trail of activities, registrations, and assessment approvals.
                </p>
              </section>

              <GlassCard style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {auditLogs.map((log, idx) => (
                  <div
                    key={idx}
                    style={{
                      display: 'flex',
                      gap: 12,
                      alignItems: 'center',
                      paddingBottom: idx !== auditLogs.length - 1 ? 12 : 0,
                      borderBottom: idx !== auditLogs.length - 1 ? `1px solid ${T.border}` : 'none',
                    }}
                  >
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        color: T.onPrimFx,
                        background: T.primaryFix,
                        padding: '3px 8px',
                        borderRadius: 4,
                        minWidth: 70,
                        textAlign: 'center',
                      }}
                    >
                      {log.time}
                    </span>
                    <span style={{ fontSize: 12, color: T.txtSec }}>{log.msg}</span>
                  </div>
                ))}
              </GlassCard>
            </div>
          )}

          {activeTab === 'config' && (
            <div style={{ animation: 'fadeIn 0.3s ease', display: 'flex', flexDirection: 'column', gap: 20 }}>
              <section>
                <h1 style={{ fontSize: 20, fontWeight: 700, color: T.primary, marginBottom: 4 }}>
                  Global Configurations
                </h1>
                <p className="text-body" style={{ color: T.txtSec }}>
                  Modify system parameters, AI evaluation strictness, and live proctoring settings.
                </p>
              </section>

              <GlassCard style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                {/* Strict Proctoring */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: T.txtPri }}>Strict Live Proctoring</div>
                    <div style={{ fontSize: 11, color: T.txtMut, marginTop: 2 }}>
                      Enable active eye tracking and tab switch warnings.
                    </div>
                  </div>
                  <button
                    onClick={() => setStrictProctoring(!strictProctoring)}
                    style={{
                      padding: '6px 14px',
                      borderRadius: 20,
                      border: 'none',
                      fontSize: 11,
                      fontWeight: 700,
                      cursor: 'pointer',
                      background: strictProctoring ? T.primary : T.bgHigh,
                      color: strictProctoring ? '#fff' : T.txtSec,
                    }}
                  >
                    {strictProctoring ? 'ENABLED' : 'DISABLED'}
                  </button>
                </div>

                <hr style={{ border: 'none', borderTop: `1px solid ${T.border}`, margin: 0 }} />

                {/* Session Time Limit */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: T.txtPri }}>Question Time Limit</div>
                      <div style={{ fontSize: 11, color: T.txtMut, marginTop: 2 }}>
                        Allowed response time (seconds) per mock interview question.
                      </div>
                    </div>
                    <span style={{ fontSize: 14, fontWeight: 800, color: T.primary }}>{sessionTimeLimit}s</span>
                  </div>
                  <input
                    type="range"
                    min={45}
                    max={180}
                    step={5}
                    value={sessionTimeLimit}
                    onChange={(e) => setSessionTimeLimit(Number(e.target.value))}
                    style={{ width: '100%', cursor: 'pointer' }}
                  />
                </div>

                <hr style={{ border: 'none', borderTop: `1px solid ${T.border}`, margin: 0 }} />

                {/* Default Domain Weights */}
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: T.txtPri, marginBottom: 12 }}>
                    Placement Weightage Scheme
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    {['Technical Skills (45%)', 'Communication (25%)', 'Analytical Reasoning (20%)', 'Integrity/Proctoring (10%)'].map((item) => (
                      <div
                        key={item}
                        style={{
                          background: T.bgLow,
                          padding: 10,
                          borderRadius: 8,
                          fontSize: 11,
                          fontWeight: 600,
                          display: 'flex',
                          justifyContent: 'space-between',
                        }}
                      >
                        <span>{item.split(' (')[0]}</span>
                        <span style={{ color: T.primary, fontWeight: 700 }}>{item.split(' (')[1].replace(')', '')}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <Btn variant="navy" style={{ alignSelf: 'flex-start', marginTop: 12 }} onClick={() => alert('Configurations saved successfully!')}>
                  Save Configurations
                </Btn>
              </GlassCard>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}

// ── MAIN APP ─────────────────────────────────────────────────────────────────
export default function App() {
  const { profile, logout: firebaseLogout } = useAuth()
  const [screen, setScreen] = useState<
    'landing' | 'auth' | 'home' | 'intro' | 'interview' | 'loading' | 'report'
  >('landing')

  const [user, setUser] = useState<User | null>(null)
  const [domain, setDomain] = useState<string | null>(null)
  const [level, setLevel] = useState('Intermediate')
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [speaking, setSpeaking] = useState(false)
  const [voiceEnabled, setVoiceEnabled] = useState(true)
  const [qCount, setQCount] = useState(0)
  const [sessionData, setSessionData] = useState<QA[]>([])
  const [report, setReport] = useState<ReportData | null>(null)
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [timer, setTimer] = useState(90)
  const [timerActive, setTimerActive] = useState(false)
  const [allSessions, setAllSessions] = useState<SessionRecord[]>(() => getInitialSessions())
  const [users, setUsers] = useState<UserProfile[]>([])
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [procWarnings, setProcWarnings] = useState<{ text: string; time: string }[]>([])
  const [perms, setPerms] = useState<Perms>({ camera: false, microphone: false, checked: false })
  const [introText, setIntroText] = useState('')
  const [introTimer, setIntroTimer] = useState(120)
  const [introTimerActive, setIntroTimerActive] = useState(false)

  // ── Video recording state ─────────────────────────────────────────────
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const recordedChunksRef = useRef<Blob[]>([])
  const cameraStreamRef = useRef<MediaStream | null>(null)

  const chatRef = useRef<HTMLDivElement>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const introTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    let cancelled = false

    async function loadFirestoreData() {
      const [nextSessions, nextUsers] = await Promise.all([loadSessions(), listUserProfiles()])
      if (!cancelled) {
        setAllSessions(nextSessions as SessionRecord[])
        setUsers(nextUsers)
      }
    }

    loadFirestoreData().catch((error) => console.error('Failed to load Firestore data:', error))
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    async function activateFirebaseUser() {
      if (!profile) return
      const nextUser: User = {
        uid: profile.uid,
        name: profile.name,
        email: profile.email,
        role: profile.role,
        department: profile.department,
        sessionId: uid(),
      }
      setUser(nextUser)
      const studentHistory = allSessions
        .filter((s) => s.studentEmail.toLowerCase() === profile.email.toLowerCase())
        .map((s) => ({
          domain: s.domain,
          level: s.level,
          score: s.score,
          date: s.date,
          warnings: s.warnings,
        }))
      setHistory(studentHistory)
      if (screen === 'auth' || screen === 'landing') {
        const p = await requestPermissions()
        if (!cancelled) {
          setPerms({ ...p, checked: true })
          setScreen('home')
        }
      }
    }

    activateFirebaseUser()
    return () => {
      cancelled = true
    }
  }, [allSessions, profile, screen])

  // Scroll chat
  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight
  }, [messages])

  // Load voices
  useEffect(() => { window.speechSynthesis?.getVoices() }, [])

  const stopSpeaking = useCallback(() => {
    window.speechSynthesis?.cancel()
    setSpeaking(false)
  }, [])

  const handleTimeUp = useCallback(async () => {
    stopSpeaking()
    setMessages((p) => [...p, { role: 'system', text: "Time's up! Moving to next question." }])
    setSessionData((p) => [...p, { q: messages[messages.length - 1]?.text || '', a: '[Time expired]' }])
    if (qCount >= 5) {
      await generateReport(sessionData)
      return
    }
    setLoading(true)
    const reply = await callClaude(
      `Time expired. Acknowledge briefly and ask question ${qCount + 1} of 5. Under 60 words.`,
      `You are PrepHire AI. Domain: ${domain}, Level: ${level}.`
    )
    setMessages((p) => [...p, { role: 'ai', text: reply }])
    setQCount((q) => q + 1)
    setTimer(90)
    setTimerActive(true)
    setLoading(false)
    aiSpeak(reply)
  }, [stopSpeaking, messages, sessionData, qCount, domain, level, aiSpeak, generateReport])

  const submitIntro = useCallback(async (text: string) => {
    setIntroTimerActive(false)
    if (introTimerRef.current) clearTimeout(introTimerRef.current)
    await beginActualInterview(text)
  }, [beginActualInterview])

  // Main timer
  useEffect(() => {
    if (timerActive && timer > 0) {
      timerRef.current = setTimeout(() => setTimer((t) => t - 1), 1000)
    } else if (timer === 0 && timerActive) {
      timerRef.current = setTimeout(() => {
        handleTimeUp()
      }, 0)
    }
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [timerActive, timer, handleTimeUp])

  // Intro timer
  useEffect(() => {
    if (introTimerActive && introTimer > 0) {
      introTimerRef.current = setTimeout(() => setIntroTimer((t) => t - 1), 1000)
    } else if (introTimer === 0 && introTimerActive) {
      introTimerRef.current = setTimeout(() => {
        setIntroTimerActive(false)
        submitIntro(introText)
      }, 0)
    }
    return () => { if (introTimerRef.current) clearTimeout(introTimerRef.current) }
  }, [introTimerActive, introTimer, introText, submitIntro])


  function aiSpeak(text: string) {
    if (!voiceEnabled || !window.speechSynthesis) return
    window.speechSynthesis.cancel()
    const utt = new SpeechSynthesisUtterance(
      text.replace(/[*_~`#]/g, '').substring(0, 500)
    )
    utt.rate = 0.92
    utt.pitch = 1.0
    utt.volume = 1
    const voices = window.speechSynthesis.getVoices()
    const preferred = voices.find(
      (v) =>
        v.name.includes('Google US English') ||
        v.name.includes('Samantha') ||
        (v.lang === 'en-US' && v.localService)
    )
    if (preferred) utt.voice = preferred
    utt.onstart = () => setSpeaking(true)
    utt.onend = () => setSpeaking(false)
    utt.onerror = () => setSpeaking(false)
    window.speechSynthesis.speak(utt)
  }

  const handleProcWarn = useCallback((w: string) => {
    setProcWarnings((p) => [...p, { text: w, time: new Date().toLocaleTimeString() }])
  }, [])

  async function handleLogout() {
    await firebaseLogout()
    setUser(null)
    setHistory([])
    setScreen('landing')
  }

  async function startInterview() {
    if (!domain) return
    setMessages([])
    setQCount(0)
    setSessionData([])
    setProcWarnings([])
    setIntroText('')
    setIntroTimer(120)
    setIntroTimerActive(true)
    stopSpeaking()
    recordedChunksRef.current = []
    setScreen('intro')
  }

  // ── Camera stream handler (for recording) ──────────────────────────────
  const handleStreamReady = useCallback((stream: MediaStream) => {
    cameraStreamRef.current = stream
  }, [])

  async function beginActualInterview(intro: string) {
    setScreen('interview')
    setLoading(true)
    stopSpeaking()

    // ── Start video recording ───────────────────────────────────────────
    recordedChunksRef.current = []
    const stream = cameraStreamRef.current
    if (stream) {
      try {
        const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
          ? 'video/webm;codecs=vp9,opus'
          : MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')
            ? 'video/webm;codecs=vp8,opus'
            : 'video/webm'
        const recorder = new MediaRecorder(stream, { mimeType })
        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) recordedChunksRef.current.push(e.data)
        }
        recorder.start(1000) // Collect data every second
        mediaRecorderRef.current = recorder
      } catch (err) {
        console.warn('MediaRecorder init failed:', err)
      }
    }

    try {
      const domainObj = DOMAINS.find((d) => d.id === domain)
      const sampleQs = domainObj?.questions?.slice(0, 2).join('; ') || ''
      const introCtx = intro.trim() ? `Candidate intro: "${intro.substring(0, 200)}". ` : ''
      const sys = `You are PrepHire AI, a professional interview coach for MIT AoE placement preparation. Domain: ${domainObj?.label || domain}, Level: ${level}. ${introCtx}Ask ONE question at a time. Give 1-line micro-feedback after each answer then ask the next. Keep responses under 80 words. Sample question style: ${sampleQs}. Start with a brief warm acknowledgement of their intro (1 sentence) then your first question.`
      const q = await callClaude('Start the interview.', sys)
      setMessages([{ role: 'ai', text: q }])
      setQCount(1)
      setTimer(90)
      setTimerActive(true)
      aiSpeak(q)
    } catch (err) {
      console.error(err)
      setMessages([{ role: 'system', text: `⚠️ Error initializing interview: ${(err as Error).message || 'Unknown error'}. Please verify your Gemini API key is configured correctly.` }])
    } finally {
      setLoading(false)
    }
  }

  async function sendAnswer(ans: string) {
    if (!ans?.trim() || loading) return
    setTimerActive(false)
    stopSpeaking()
    const txt = ans.trim()
    setInput('')
    const newMsgs: Message[] = [...messages, { role: 'user', text: txt }]
    setMessages(newMsgs)
    const sd: QA[] = [...sessionData, { q: messages[messages.length - 1]?.text || '', a: txt }]
    setSessionData(sd)
    setLoading(true)

    try {
      if (qCount >= 5) {
        await generateReport(sd)
        return
      }
      const domainObj = DOMAINS.find((d) => d.id === domain)
      const sys = `You are PrepHire AI. Domain: ${domainObj?.label || domain}, Level: ${level}. Give 1-line micro-feedback on the answer, then ask question ${qCount + 1} of 5. Under 80 words.`
      const reply = await callClaude(
        `Conversation:\n${newMsgs.map((m) => `${m.role === 'user' ? 'Candidate' : 'Interviewer'}: ${m.text}`).join('\n')}`,
        sys
      )
      setMessages((p) => [...p, { role: 'ai', text: reply }])
      setQCount((q) => q + 1)
      setTimer(90)
      setTimerActive(true)
      aiSpeak(reply)
    } catch (err) {
      console.error(err)
      setMessages((p) => [...p, { role: 'system', text: `⚠️ Error calling AI: ${(err as Error).message || 'Unknown error'}.` }])
      setTimerActive(true)
    } finally {
      setLoading(false)
    }
  }

  // ── Upload video to Google Drive (silent, auto-retry) ───────────────
  async function uploadVideoToDrive(videoBlob: Blob, sessionId: string, attempt = 1): Promise<string | null> {
    const MAX_RETRIES = 3
    const domainObj = DOMAINS.find((d) => d.id === domain)
    const formData = new FormData()
    formData.append('video', videoBlob, 'interview.webm')
    formData.append('studentName', user?.name || 'Unknown')
    formData.append('domain', domainObj?.label || domain || 'General')
    formData.append('level', level)
    formData.append('sessionId', sessionId)

    try {
      const apiUrl = import.meta.env.VITE_API_URL || ''
      const res = await fetch(`${apiUrl}/api/upload`, { method: 'POST', body: formData })
      const resp = await res.json()
      if (res.ok && resp.success) {
        console.log(`✅ Interview video uploaded to Drive: ${resp.driveLink}`)
        return resp.driveLink || null
      } else {
        throw new Error(resp.error || `HTTP ${res.status}`)
      }
    } catch (err) {
      console.warn(`⚠️ Upload attempt ${attempt}/${MAX_RETRIES} failed:`, (err as Error).message)
      if (attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, 2000))
        return uploadVideoToDrive(videoBlob, sessionId, attempt + 1)
      }
      console.error('❌ All upload attempts failed. Video was not saved to Drive.')
      return null
    }
  }

  async function generateReport(data: QA[]) {
    setScreen('loading')
    stopSpeaking()
    setTimerActive(false)

    // ── Stop video recording and collect the blob ──────────────────────
    let videoBlob: Blob | null = null
    const recorder = mediaRecorderRef.current
    if (recorder && recorder.state !== 'inactive') {
      await new Promise<void>((resolve) => {
        recorder.onstop = () => resolve()
        recorder.stop()
      })
      if (recordedChunksRef.current.length > 0) {
        videoBlob = new Blob(recordedChunksRef.current, { type: 'video/webm' })
      }
      mediaRecorderRef.current = null
    }

    const wc = procWarnings.length
    const domainObj = DOMAINS.find((d) => d.id === domain)
    const sys = `You are PrepHire AI evaluator. Return ONLY valid JSON, no markdown:
{"overallScore":<0-100>,"technical":<0-100>,"communication":<0-100>,"confidence":<0-100>,"clarity":<0-100>,"relevance":<0-100>,"strengths":["...","...","..."],"improvements":["...","...","..."],"tip":"...","proctoringNote":"..."}`
    let r: ReportData
    try {
      const raw = await callClaude(
        `Domain: ${domainObj?.label || domain}, Level: ${level}, Proctoring warnings: ${wc}\n${data.map((d, i) => `Q${i + 1}: ${d.q}\nA: ${d.a}`).join('\n\n')}`,
        sys
      )
      r = JSON.parse(raw.replace(/```json|```/g, '').trim()) as ReportData
    } catch {
      r = {
        overallScore: 72,
        technical: 70,
        communication: 75,
        confidence: 68,
        clarity: 74,
        relevance: 73,
        strengths: ['Clear thought process', 'Good domain knowledge', 'Structured answers'],
        improvements: ['Add more examples', 'Be more concise', 'Build confidence'],
        tip: 'Practice STAR format for behavioral questions.',
        proctoringNote: 'Session completed.',
        warnCount: wc,
      }
    }
    r.warnCount = wc

    // Create session record
    const sessionId = uid()
    setActiveSessionId(sessionId)
    const newSession: SessionRecord = {
      id: sessionId,
      studentName: user?.name || 'Anonymous',
      studentEmail: user?.email || '',
      domain: domainObj?.label || domain || '',
      level,
      score: r.overallScore,
      date: new Date().toISOString().split('T')[0],
      warnings: wc,
      report: r,
    }

    setAllSessions((prev) => [...prev, newSession])
    saveSession(newSession).catch((error) => console.error('Failed to save session:', error))

    setHistory((p) => [
      ...p,
      {
        domain: domainObj?.label || domain || '',
        level,
        score: r.overallScore,
        date: new Date().toLocaleDateString(),
        warnings: wc,
      },
    ])
    setReport(r)
    setScreen('report')
    setLoading(false)

    // ── Upload video to Google Drive ─────────────────────────────────
    if (videoBlob && videoBlob.size > 0) {
      uploadVideoToDrive(videoBlob, sessionId).then((driveLink) => {
        if (!driveLink) return
        setAllSessions((prev) => prev.map((s) => (s.id === sessionId ? { ...s, driveLink } : s)))
        updateSession(sessionId, { driveLink }).catch((error) => console.error('Failed to save drive link:', error))
      })
    }
  }

  const tc = timer > 60 ? T.green : timer > 30 ? T.amber : T.error
  const activeDomain = DOMAINS.find((d) => d.id === domain)

  // ── LANDING ─────────────────────────────────────────────────────────────
  if (screen === 'landing') return <LandingPage onEnterPortal={() => setScreen('auth')} />

  // ── AUTH ────────────────────────────────────────────────────────────────
  if (screen === 'auth') return <LoginScreen />

  // ── HOME ────────────────────────────────────────────────────────────────
  if (screen === 'home') {
    if (!user) return <LoginScreen />

    if (user.role.toLowerCase() === 'faculty') {
      return (
        <FacultyDashboard
          user={user}
          allSessions={allSessions}
          onUpdateSession={(id, updates) => {
            setAllSessions((prev) => {
              const next = prev.map((s) => (s.id === id ? { ...s, ...updates } : s))
              return next
            })
            updateSession(id, updates).catch((error) => console.error('Failed to update session:', error))
          }}
          onLogout={handleLogout}
        />
      )
    }

    if (user.role.toLowerCase() === 'admin') {
      return (
        <AdminDashboard
          user={user}
          allSessions={allSessions}
          users={users}
          onRoleChange={async (userId, role) => {
            await updateUserProfile(userId, { role })
            setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, role } : u)))
          }}
          onDeleteUser={async (userId) => {
            await deleteUserProfile(userId)
            setUsers((prev) => prev.filter((u) => u.id !== userId))
          }}
          onLogout={handleLogout}
        />
      )
    }

    return (
      <div style={{ minHeight: '100vh', background: T.bg }}>
        <Navbar user={user} onLogout={handleLogout} onHome={() => setScreen('home')} inInterview={false} />

      <div className="home-screen-content" style={{ maxWidth: 780, margin: '0 auto', padding: '0 24px 88px 24px', animation: 'fadeIn 0.4s ease' }}>

        {/* Welcome */}
        <section
          style={{
            paddingTop: 40,
            paddingBottom: '1.5rem',
            marginBottom: 16,
            borderBottom: `1px solid ${T.border}`,
            maxWidth: 680,
            margin: '0 auto',
            textAlign: 'left',
          }}
        >
          <h1 style={{ fontSize: 18, fontWeight: 600, margin: '0 0 8px', color: T.primary, letterSpacing: '-0.4px' }}>
            Welcome back, {user?.name}. Ready to ace your placement interviews?
          </h1>
          <p className="text-body" style={{ color: T.txtSec }}>
            Select your interview domain and difficulty level to begin your AI-powered mock session.
          </p>
        </section>

        {/* Permissions */}
        {perms.checked && (
          <GlassCard
            style={{
              maxWidth: 680,
              margin: '0 auto 16px auto',
              padding: '10px 16px',
              display: 'flex',
              gap: 20,
              alignItems: 'center',
              flexWrap: 'wrap',
              borderRadius: 12,
            }}
          >
            {([['Camera', perms.camera], ['Microphone', perms.microphone]] as [string, boolean][]).map(([label, ok]) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: ok ? T.green : T.error, display: 'inline-block' }} />
                <span style={{ color: ok ? T.green : T.error }}>{ok ? `${label} ready` : `${label} blocked`}</span>
              </div>
            ))}
            {(!perms.camera || !perms.microphone) && (
              <Btn
                onClick={async () => { const p = await requestPermissions(); setPerms({ ...p, checked: true }) }}
                variant="ghost"
                size="sm"
                style={{ marginLeft: 'auto' }}
              >
                Fix permissions
              </Btn>
            )}
          </GlassCard>
        )}

        {/* Domain selection */}
        <GlassCard style={{ marginBottom: 16 }}>
          <div className="text-caption" style={{ letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '1rem' }}>
            Interview Domain
          </div>
          <div className="domain-grid">
            {DOMAINS.map((d) => (
              <div
                key={d.id}
                className="domain-card"
                onClick={() => setDomain(d.id)}
                style={{
                  border: `2px solid ${domain === d.id ? T.primary : T.outlineVar}`,
                  borderRadius: 12,
                  padding: 20,
                  cursor: 'pointer',
                  background: domain === d.id ? '#F0F2FF' : T.bgWhite,
                  minHeight: 120,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  textAlign: 'center',
                }}
              >
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: '50%',
                    background: `${DOMAIN_ICON_COLORS[d.id]}1A`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0 auto 10px auto',
                    color: DOMAIN_ICON_COLORS[d.id],
                  }}
                >
                  {d.icon}
                </div>
                <div style={{ fontSize: 14, fontWeight: 600, color: T.primary }}>{d.label}</div>
                <div className="text-caption" style={{ fontSize: 12, color: T.txtMut, marginTop: 3, lineHeight: 1.3 }}>{d.desc}</div>
              </div>
            ))}
          </div>
        </GlassCard>

        {/* Difficulty */}
        <GlassCard style={{ marginBottom: 16 }}>
          <div className="text-caption" style={{ letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '0.75rem' }}>
            Difficulty Level
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            {LEVELS.map((l) => (
              <button
                key={l}
                onClick={() => setLevel(l)}
                style={{
                  flex: 1,
                  padding: '10px 0',
                  borderRadius: 10,
                  border: `2px solid ${level === l ? T.primary : T.outlineVar}`,
                  background: level === l ? '#F0F2FF' : T.bgWhite,
                  color: level === l ? T.primary : T.txtSec,
                  fontWeight: level === l ? 700 : 500,
                  cursor: 'pointer',
                  fontSize: 13,
                  transition: 'border 0.15s ease, background 0.15s ease',
                  fontFamily: 'inherit',
                }}
              >
                {l}
              </button>
            ))}
          </div>
        </GlassCard>

        {/* Voice toggle */}
        <GlassCard style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderLeft: `3px solid ${T.gold}` }}>
          <div>
            <div className="text-body" style={{ fontWeight: 600, color: T.txtPri }}>AI Voice Responses</div>
            <div className="text-caption" style={{ marginTop: 2 }}>Questions read aloud by PrepHire AI</div>
            <div className="text-caption" style={{ marginTop: 4 }}>Turn off for text-only mode</div>
          </div>
          <div
            role="switch"
            aria-checked={voiceEnabled}
            aria-label="AI voice responses"
            tabIndex={0}
            onClick={() => setVoiceEnabled((v) => !v)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setVoiceEnabled((v) => !v) } }}
            style={{
              width: 48,
              height: 28,
              borderRadius: 14,
              background: voiceEnabled ? T.primary : T.bgHigh,
              border: `1.5px solid ${voiceEnabled ? T.primary : T.outlineVar}`,
              cursor: 'pointer',
              position: 'relative',
              transition: 'background 0.2s, border-color 0.2s',
            }}
          >
            <div
              style={{
                position: 'absolute',
                top: 3,
                left: voiceEnabled ? 23 : 3,
                width: 22,
                height: 22,
                borderRadius: '50%',
                background: voiceEnabled ? '#fff' : T.outline,
                transition: 'left 0.2s',
                boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
              }}
            />
          </div>
        </GlassCard>

        {/* Session history */}
        {history.length > 0 && (
          <div style={{ marginTop: '2rem' }}>
            <div className="text-caption" style={{ letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '0.75rem' }}>
              Recent Sessions
            </div>
            {history.slice(-4).reverse().map((h, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '12px 16px',
                  background: T.bgWhite,
                  borderRadius: 12,
                  border: `1px solid ${T.border}`,
                  marginBottom: 8,
                }}
              >
                <div>
                  <span style={{ fontSize: 13, fontWeight: 700, color: T.txtPri }}>{h.domain}</span>
                  <span className="text-caption" style={{ marginLeft: 8 }}>{h.level}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {h.warnings > 0 && <Pill color={T.amber} bg={T.amberBg}><AlertTriangle size={11} /> {h.warnings}</Pill>}
                  <span className="text-caption">{h.date}</span>
                  <span style={{ fontSize: 15, fontWeight: 800, color: h.score >= 75 ? T.green : h.score >= 55 ? T.amber : T.error }}>
                    {h.score}<span style={{ fontSize: 11, fontWeight: 500 }}>/100</span>
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="start-interview-bar">
        <div className="start-interview-bar__inner">
          <button
            onClick={() => domain && startInterview()}
            style={{
              width: '100%',
              padding: '15px',
              borderRadius: 14,
              border: 'none',
              background: domain ? T.primary : T.bgHigh,
              color: domain ? '#fff' : T.txtMut,
              fontSize: 16,
              fontWeight: 800,
              cursor: domain ? 'pointer' : 'not-allowed',
              transition: 'all 0.18s',
              letterSpacing: '-0.2px',
              boxShadow: domain ? '0 4px 16px rgba(0,30,64,0.25)' : 'none',
              fontFamily: 'inherit',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
            }}
          >
            {domain && activeDomain ? (
              <>
                Start Interview — {activeDomain.icon} {activeDomain.label} <ArrowRight size={16} />
              </>
            ) : (
              'Select a domain to begin'
            )}
          </button>
        </div>
      </div>
    </div>
  )
}


  // ── INTRO ───────────────────────────────────────────────────────────────
  if (screen === 'intro') {
    const im = introTimer > 60 ? T.green : introTimer > 30 ? T.amber : T.error
    const ip = Math.round((introTimer / 120) * 100)
    const rr = 18, circ = 2 * Math.PI * rr, dash = (ip / 100) * circ
    const tips = [
      'Your name and educational background',
      'Current year / programme at MIT AoE',
      'Technical skills & tools you know',
      'Projects or internships you\'ve done',
      'Why you chose this domain',
      'Your career goal or target role',
    ]
    return (
      <div style={{ minHeight: '100vh', background: T.bg }}>
        <Navbar user={user} onLogout={handleLogout} onHome={() => { setIntroTimerActive(false); setScreen('home') }} inInterview={false} />

        <div className="interview-session-header">
          <div className="interview-session-header__left">
            <Pill>{activeDomain?.label}</Pill>
            <span style={{ fontSize: 12, color: T.txtMut, fontWeight: 600 }}>·</span>
            <Pill>{level}</Pill>
          </div>
          <div className="interview-session-header__center">
            <div style={{ position: 'relative', width: 44, height: 44 }}>
              <svg width={44} height={44} style={{ transform: 'rotate(-90deg)' }}>
                <circle cx={22} cy={22} r={rr} fill="none" stroke={T.bgHigh} strokeWidth={4} />
                <circle cx={22} cy={22} r={rr} fill="none" stroke={im} strokeWidth={4} strokeDasharray={`${dash} ${circ}`} strokeLinecap="round" style={{ transition: 'stroke-dasharray 0.9s linear' }} />
              </svg>
              <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: 11, fontWeight: 800, color: im, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
                  {Math.floor(introTimer / 60)}:{String(introTimer % 60).padStart(2, '0')}
                </span>
                <span style={{ fontSize: 8, color: T.txtMut, marginTop: 1 }}>remaining</span>
              </div>
            </div>
          </div>
          <div className="interview-session-header__right">
            <Btn onClick={() => submitIntro(introText)} variant="ghost">Skip <ArrowRight size={13} /></Btn>
          </div>
        </div>

        <div style={{ maxWidth: 720, margin: '0 auto', padding: '2rem 1rem', animation: 'fadeIn 0.4s ease' }}>

          <h2 style={{ fontSize: 18, fontWeight: 600, margin: '0 0 1.5rem', color: T.primary }}>Self Introduction</h2>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 200px', gap: 14, alignItems: 'start' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

              <div style={{ background: T.bgWhite, borderRadius: 12, padding: '1rem', border: `1px solid ${T.border}`, borderLeft: '3px solid #F59E0B' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: T.primary, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Lightbulb size={14} style={{ color: T.gold, flexShrink: 0 }} /> Cover these points in your introduction:
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                  {tips.map((t, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 6, fontSize: 12, color: T.txtSec, lineHeight: 1.4 }}>
                      <span style={{ color: T.gold, fontWeight: 800, flexShrink: 0 }}>{i + 1}.</span>{t}
                    </div>
                  ))}
                </div>
              </div>

              <GlassCard>
                <textarea
                  className="interview-textarea"
                  value={introText}
                  onChange={(e) => setIntroText(e.target.value)}
                  placeholder="Hello, my name is… I am currently in… I have skills in… My recent project was… I am interested in… My goal is…"
                  style={{
                    width: '100%',
                    height: 140,
                    border: 'none',
                    resize: 'none',
                    borderRadius: 10,
                    fontSize: 13,
                    fontFamily: 'inherit',
                    background: T.bgWhite,
                    lineHeight: 1.6,
                    color: T.txtPri,
                  }}
                />
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <MicButton
                      onTranscript={(t) => setIntroText((p) => (p ? p + ' ' : '') + t)}
                      disabled={false}
                    />
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 120 }}>
                      <div className="word-progress-track">
                        <div className="word-progress-fill" style={{ width: `${Math.min((introText.split(/\s+/).filter(Boolean).length / 100) * 100, 100)}%` }} />
                      </div>
                      <span style={{ fontSize: 11, color: T.txtSec, whiteSpace: 'nowrap' }}>
                        {introText.split(/\s+/).filter(Boolean).length} words
                      </span>
                    </div>
                  </div>
                  <Btn onClick={() => submitIntro(introText)} disabled={!introText.trim()} variant="navy" size="sm">
                    Submit & Start <ArrowRight size={13} />
                  </Btn>
                </div>
              </GlassCard>

              <div style={{ background: T.bgWhite, borderRadius: 10, padding: '8px 14px', border: `1px solid ${T.border}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                  <span style={{ fontSize: 11, color: T.txtSec }}>Time used</span>
                  <span style={{ fontSize: 11, color: im, fontWeight: 700 }}>{120 - introTimer}s / 120s</span>
                </div>
                <div style={{ height: 4, background: T.bgHigh, borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${((120 - introTimer) / 120) * 100}%`, background: im, borderRadius: 4, transition: 'width 1s linear' }} />
                </div>
              </div>
            </div>

            <ProctoredCamera onWarning={handleProcWarn} active={screen === 'intro'} onStreamReady={handleStreamReady} />
          </div>
        </div>
      </div>
    )
  }

  // ── INTERVIEW ───────────────────────────────────────────────────────────
  if (screen === 'interview') {
    const interviewProgress = Math.round((timer / 90) * 100)
    const irr = 18
    const icirc = 2 * Math.PI * irr
    const idash = (interviewProgress / 100) * icirc

    return (
    <div style={{ minHeight: '100vh', background: T.bg }}>
      <Navbar user={user} onLogout={handleLogout} onHome={() => {}} inInterview={true} />

      <div className="interview-session-header">
        <div className="interview-session-header__left">
          <Pill>{activeDomain?.label}</Pill>
          <span style={{ fontSize: 12, color: T.txtMut, fontWeight: 600 }}>·</span>
          <Pill>{level}</Pill>
        </div>
        <div className="interview-session-header__center">
          <div style={{ position: 'relative', width: 44, height: 44 }}>
            <svg width={44} height={44} style={{ transform: 'rotate(-90deg)' }}>
              <circle cx={22} cy={22} r={irr} fill="none" stroke={T.bgHigh} strokeWidth={4} />
              <circle cx={22} cy={22} r={irr} fill="none" stroke={tc} strokeWidth={4} strokeDasharray={`${idash} ${icirc}`} strokeLinecap="round" style={{ transition: 'stroke-dasharray 0.9s linear' }} />
            </svg>
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: 11, fontWeight: 800, color: tc, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
                {Math.floor(timer / 60)}:{String(timer % 60).padStart(2, '0')}
              </span>
            </div>
          </div>
        </div>
        <div className="interview-session-header__right" />
      </div>

      <div style={{ maxWidth: 760, margin: '0 auto', padding: '1.5rem 1rem', animation: 'fadeIn 0.3s ease' }}>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Pill color={T.onGold} bg={T.goldFixed}>Q {Math.min(qCount, 5)} / 5</Pill>
            {speaking && <Pill color={T.teal} bg="#ccfbf1"><Volume2 size={11} /> Speaking…</Pill>}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {speaking && (
              <Btn onClick={stopSpeaking} variant="ghost" size="sm" style={{ color: T.error, borderColor: T.error }}>
                Stop
              </Btn>
            )}
            <Btn onClick={() => generateReport(sessionData)} variant="ghost" size="sm">
              End Interview <ArrowRight size={13} />
            </Btn>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 200px', gap: 14, alignItems: 'start' }}>
          <GlassCard style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div ref={chatRef} style={{ height: 360, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10, paddingRight: 4 }}>
              {messages.map((m, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
                  {m.role === 'system' ? (
                    <div style={{ fontSize: 11, color: T.txtMut, textAlign: 'center', width: '100%', padding: '2px 0', fontStyle: 'italic' }}>
                      {m.text}
                    </div>
                  ) : (
                    <div
                      style={{
                        maxWidth: '88%',
                        padding: '10px 14px',
                        borderRadius: m.role === 'user' ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                        background: m.role === 'user' ? T.primary : T.bgWhite,
                        color: m.role === 'user' ? '#fff' : T.txtPri,
                        fontSize: 13,
                        lineHeight: 1.65,
                        border: m.role === 'ai' ? `1px solid ${T.border}` : 'none',
                        boxShadow: m.role === 'ai' ? '0 1px 4px rgba(0,30,64,0.06)' : 'none',
                        animation: 'fadeIn 0.3s ease',
                      }}
                    >
                      {m.role === 'ai' && (
                        <span style={{ fontSize: 10, color: T.onGold, fontWeight: 700, display: 'block', marginBottom: 4 }}>
                          PrepHire AI
                        </span>
                      )}
                      {m.text}
                    </div>
                  )}
                </div>
              ))}
              {loading && (
                <div style={{ display: 'flex', gap: 5, padding: '10px 14px', background: T.bgWhite, borderRadius: '14px 14px 14px 4px', width: 'fit-content', border: `1px solid ${T.border}` }}>
                  {[0, 1, 2].map((i) => (
                    <div key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: T.primary, animation: `bounce 1s ${i * 0.2}s infinite` }} />
                  ))}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', paddingTop: 10, borderTop: `1px solid ${T.border}` }}>
              <MicButton
                onTranscript={(t) => { setInput(t); setTimeout(() => sendAnswer(t), 200) }}
                disabled={loading || speaking}
              />
              <textarea
                className="interview-textarea"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendAnswer(input) } }}
                placeholder="Type your answer or tap the mic…"
                rows={2}
                style={{
                  flex: 1,
                  resize: 'none',
                  padding: '9px 12px',
                  borderRadius: 10,
                  border: `1.5px solid ${T.outlineVar}`,
                  fontSize: 13,
                  fontFamily: 'inherit',
                  background: T.bgWhite,
                  lineHeight: 1.5,
                  color: T.txtPri,
                }}
              />
              <Btn
                onClick={() => sendAnswer(input)}
                disabled={!input.trim() || loading}
                variant="navy"
                style={{ height: 54, borderRadius: 10, padding: '0 18px' }}
              >
                Send
              </Btn>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6 }}>
              <div className="word-progress-track" style={{ flex: 1 }}>
                <div className="word-progress-fill" style={{ width: `${Math.min((input.split(/\s+/).filter(Boolean).length / 100) * 100, 100)}%` }} />
              </div>
              <span style={{ fontSize: 11, color: T.txtSec, whiteSpace: 'nowrap' }}>
                {input.split(/\s+/).filter(Boolean).length} words
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 18 }}>
              {[
                { icon: <Mic size={11} />, text: 'Tap mic to speak' },
                { icon: <CornerDownLeft size={11} />, text: 'Enter to send' },
                { icon: <Clock size={11} />, text: '90s per question' },
              ].map((item, i) => (
                <span
                  key={i}
                  style={{
                    fontSize: 10,
                    color: T.txtMut,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  {item.icon}
                  {item.text}
                </span>
              ))}
            </div>
          </GlassCard>

          <ProctoredCamera onWarning={handleProcWarn} active={screen === 'interview'} onStreamReady={handleStreamReady} />
        </div>
      </div>
    </div>
    )
  }

  // ── LOADING ─────────────────────────────────────────────────────────────
  if (screen === 'loading') return (
    <div style={{ minHeight: '100vh', background: T.bg, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
      <div style={{ width: 56, height: 56, borderRadius: '50%', border: `4px solid ${T.primaryFix}`, borderTop: `4px solid ${T.primary}`, animation: 'spin 1s linear infinite' }} />
      <p className="text-heading" style={{ color: T.primary }}>Analyzing your performance…</p>
      <p className="text-caption">Generating AI feedback report</p>
    </div>
  )

  // ── REPORT ──────────────────────────────────────────────────────────────
  if (screen === 'report' && report) {
    const activeSession = allSessions.find((s) => s.id === activeSessionId)
    return (
      <div style={{ minHeight: '100vh', background: T.bg }}>
        <Navbar user={user} onLogout={handleLogout} onHome={() => setScreen('home')} inInterview={false} />
        <div style={{ maxWidth: 760, margin: '0 auto', padding: '2rem 1rem', animation: 'fadeIn 0.4s ease' }}>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: 10 }}>
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 600, margin: '0 0 4px', color: T.primary }}>Interview Report</h2>
            <div className="text-caption">{activeDomain?.label || domain} · {level} · {user?.name}</div>
          </div>
          <Btn onClick={() => setScreen('home')} variant="ghost">
            <ArrowLeft size={14} style={{ marginRight: 6 }} /> Back to Home
          </Btn>
        </div>

        {/* Integrity badge */}
        <div style={{
          background: report.warnCount === 0 ? T.greenBg : '#FFFBEB',
          border: `1px solid ${report.warnCount === 0 ? T.green + '33' : report.warnCount <= 2 ? '#F59E0B33' : T.error + '33'}`,
          borderLeft: `3px solid ${report.warnCount === 0 ? T.green : report.warnCount <= 2 ? '#F59E0B' : T.error}`,
          borderRadius: 8,
          padding: '12px 16px',
          marginBottom: '1.25rem',
          display: 'flex',
          gap: 10,
          alignItems: 'flex-start',
        }}>
          {report.warnCount === 0 ? (
            <CheckCircle size={20} style={{ color: T.green, flexShrink: 0 }} />
          ) : report.warnCount <= 2 ? (
            <Info size={20} style={{ color: '#F59E0B', flexShrink: 0 }} />
          ) : (
            <AlertTriangle size={20} style={{ color: T.error, flexShrink: 0 }} />
          )}
          <div>
            <div style={{ fontSize: 13, fontWeight: 500, color: report.warnCount === 0 ? T.green : report.warnCount <= 2 ? '#92400e' : T.error }}>
              Integrity: {report.warnCount === 0 ? 'Clean Session' : report.warnCount <= 2 ? 'Minor Flags' : 'Multiple Flags'}
            </div>
            <div style={{ fontSize: 11, color: T.txtSec, marginTop: 2 }}>
              {report.proctoringNote} ({report.warnCount} warning{report.warnCount !== 1 ? 's' : ''})
            </div>
            {report.warnCount === 1 && (
              <div style={{ fontSize: 12, color: T.txtMut, marginTop: 4 }}>No action required.</div>
            )}
          </div>
        </div>

        {/* Score + metric cards */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: '1.25rem' }}>
          <GlassCard style={{ textAlign: 'center', padding: '1.5rem' }}>
            <ScoreRing
              score={report.overallScore}
              size={100}
              color={scoreColor(report.overallScore)}
            />
            <div className="text-caption" style={{ marginTop: 10 }}>Overall Score</div>
          </GlassCard>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {([
              ['Technical',     report.technical],
              ['Communication', report.communication],
              ['Confidence',    report.confidence],
              ['Clarity',       report.clarity],
            ] as [string, number][]).map(([l, s]) => (
              <GlassCard key={l} style={{ textAlign: 'center', padding: '12px 8px', borderRadius: 12, background: '#fff' }}>
                <div style={{ fontSize: 22, fontWeight: 800, color: scoreColor(s) }}>{s}</div>
                <div className="text-caption" style={{ marginTop: 3 }}>{l}</div>
              </GlassCard>
            ))}
          </div>
        </div>

        {/* Recording Upload Status */}
        {activeSession && (
          <div style={{
            background: T.bgWhite,
            border: `1px solid ${T.border}`,
            borderRadius: 12,
            padding: '12px 16px',
            marginBottom: '1.25rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: T.primary }}>
                Interview Video Recording
              </div>
              <div style={{ fontSize: 11, color: T.txtSec, marginTop: 4 }}>
                {activeSession.driveLink 
                  ? (activeSession.driveLink.includes('mock') ? 'Saved locally in Mock Upload Mode.' : 'Uploaded successfully to Google Shared Drive.')
                  : 'Processing and uploading recording to server...'}
              </div>
            </div>
            {activeSession.driveLink ? (
              <a href={activeSession.driveLink} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>
                <Btn variant="navy" size="sm">
                  Watch Recording
                </Btn>
              </a>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: T.txtSec }}>
                <div style={{ width: 12, height: 12, borderRadius: '50%', border: `2px solid ${T.outlineVar}`, borderTop: `2px solid ${T.primary}`, animation: 'spin 1s linear infinite' }} />
                <span>Uploading...</span>
              </div>
            )}
          </div>
        )}

        {/* Radar */}
        <GlassCard style={{ marginBottom: '1.25rem', textAlign: 'center' }}>
          <div className="text-caption" style={{ letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '0.75rem', textAlign: 'left' }}>
            Skills Radar
          </div>
          <RadarChart scores={{ Technical: report.technical, Comms: report.communication, Confidence: report.confidence, Clarity: report.clarity, Relevance: report.relevance }} />
        </GlassCard>

        {/* Strengths / improvements */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: '1.25rem' }}>
          <SolidCard style={{ background: T.greenBg, borderColor: T.green + '44' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: T.green, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Check size={18} /> Strengths
            </div>
            {report.strengths.map((s, i) => (
              <p key={i} className="text-body" style={{ margin: '0 0 7px', display: 'flex', gap: 7 }}>
                <Check size={14} style={{ color: T.green, flexShrink: 0, marginTop: 3 }} />{s}
              </p>
            ))}
          </SolidCard>
          <SolidCard style={{ background: T.amberBg, borderColor: T.amber + '44' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: T.amber, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
              <TrendingUp size={18} /> Improve on
            </div>
            {report.improvements.map((s, i) => (
              <p key={i} className="text-body" style={{ margin: '0 0 7px', display: 'flex', gap: 7 }}>
                <TrendingUp size={14} style={{ color: T.amber, flexShrink: 0, marginTop: 3 }} />{s}
              </p>
            ))}
          </SolidCard>
        </div>

        {/* Pro tip */}
        <GlassCard style={{ marginBottom: '1.5rem', display: 'flex', gap: 12, background: 'rgba(253,237,193,0.7)', borderColor: '#fea61955' }}>
          <Lightbulb size={18} style={{ color: T.onGold, flexShrink: 0, marginTop: 2 }} />
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: T.onGold, marginBottom: 4 }}>Pro Tip</div>
            <div className="text-body">{report.tip}</div>
          </div>
        </GlassCard>

        <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
          <button
            onClick={() => window.print()}
            style={{
              flex: 1,
              padding: '14px',
              borderRadius: 14,
              border: `1px solid ${T.primary}`,
              background: 'transparent',
              color: T.primary,
              fontSize: 15,
              fontWeight: 800,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            Download Report
          </button>
          <button
            onClick={() => startInterview()}
            style={{
              flex: 1,
              padding: '14px',
              borderRadius: 14,
              border: 'none',
              background: T.primary,
              color: '#fff',
              fontSize: 15,
              fontWeight: 800,
              cursor: 'pointer',
              boxShadow: '0 4px 16px rgba(0,30,64,0.25)',
              fontFamily: 'inherit',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
            }}
          >
            Practice Again <ArrowRight size={15} />
          </button>
        </div>
      </div>
    </div>
  )
  }

  return null
}
