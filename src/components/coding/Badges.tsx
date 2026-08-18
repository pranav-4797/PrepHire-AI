import type { ReactNode } from 'react'
import { T } from '../../theme'
import { DIFFICULTY_COLORS, VERDICT_COLORS } from '../../services/coding.service'
import type { Difficulty, Verdict } from '../../services/coding.service'
import { CheckCircle2, XCircle, Clock, AlertTriangle, FileWarning } from 'lucide-react'

export function DifficultyBadge({ difficulty, size = 'md' }: { difficulty: Difficulty; size?: 'sm' | 'md' }) {
  const c = DIFFICULTY_COLORS[difficulty]
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        fontSize: size === 'sm' ? 10 : 11,
        fontWeight: 700,
        padding: size === 'sm' ? '2px 8px' : '3px 10px',
        borderRadius: 20,
        background: c.bg,
        color: c.fg,
        whiteSpace: 'nowrap',
      }}
    >
      {difficulty}
    </span>
  )
}

const VERDICT_ICON: Record<Verdict, ReactNode> = {
  Accepted: <CheckCircle2 size={13} />,
  'Wrong Answer': <XCircle size={13} />,
  'Time Limit Exceeded': <Clock size={13} />,
  'Runtime Error': <AlertTriangle size={13} />,
  'Compilation Error': <FileWarning size={13} />,
}

export function VerdictBadge({ verdict, size = 'md' }: { verdict: Verdict; size?: 'sm' | 'md' }) {
  const c = VERDICT_COLORS[verdict]
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        fontSize: size === 'sm' ? 10 : 12,
        fontWeight: 700,
        padding: size === 'sm' ? '2px 8px' : '4px 12px',
        borderRadius: 20,
        background: c.bg,
        color: c.fg,
        whiteSpace: 'nowrap',
      }}
    >
      {VERDICT_ICON[verdict]}
      {verdict}
    </span>
  )
}

export function StatusPill({ status }: { status: 'draft' | 'published' }) {
  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 700,
        padding: '2px 8px',
        borderRadius: 20,
        background: status === 'published' ? T.greenBg : T.bgMid,
        color: status === 'published' ? T.green : T.txtSec,
        textTransform: 'uppercase',
        letterSpacing: '0.04em',
      }}
    >
      {status}
    </span>
  )
}
