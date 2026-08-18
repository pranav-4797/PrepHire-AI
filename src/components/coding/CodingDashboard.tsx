import { useEffect, useState } from 'react'
import type { ReactNode, CSSProperties } from 'react'
import { Trophy, Target, History, Flame } from 'lucide-react'
import { T } from '../../theme'
import { DifficultyBadge, VerdictBadge } from './Badges'
import { getDashboardStats } from '../../services/coding.service'
import type { DashboardStats, Difficulty } from '../../services/coding.service'

function GlassCard({ children, style = {} }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div style={{ background: '#ffffff', border: '1px solid #E5E7EB', borderRadius: 12, padding: '1.25rem', ...style }}>
      {children}
    </div>
  )
}

const DIFFICULTY_BAR_COLOR: Record<Difficulty, string> = {
  Easy: '#10B981',
  Medium: '#F59E0B',
  Hard: '#EF4444',
}

export function CodingDashboard({
  userEmail,
  onOpenProblem,
}: {
  userEmail: string
  onOpenProblem: (problemId: string) => void
}) {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    getDashboardStats(userEmail)
      .then((s) => !cancelled && setStats(s))
      .catch((err) => !cancelled && setError(err.message || 'Failed to load dashboard'))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [userEmail])

  if (loading) return <div style={{ textAlign: 'center', padding: 40, color: T.txtMut }}>Loading dashboard…</div>
  if (error || !stats) return <div style={{ textAlign: 'center', padding: 40, color: T.error }}>{error}</div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
        <GlassCard style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: T.txtMut, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Trophy size={13} /> Solved
          </span>
          <span style={{ fontSize: 26, fontWeight: 800, color: T.primary }}>
            {stats.solvedCount}<span style={{ fontSize: 14, fontWeight: 600, color: T.txtMut }}> / {stats.totalPublished}</span>
          </span>
        </GlassCard>
        <GlassCard style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: T.txtMut, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Target size={13} /> Submissions
          </span>
          <span style={{ fontSize: 26, fontWeight: 800, color: T.primary }}>{stats.totalSubmissions}</span>
        </GlassCard>
        {(['Medium', 'Hard'] as Difficulty[]).map((d) => (
          <GlassCard key={d} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: T.txtMut, textTransform: 'uppercase' }}>{d} Solved</span>
            <span style={{ fontSize: 22, fontWeight: 800, color: DIFFICULTY_BAR_COLOR[d] }}>
              {stats.byDifficulty[d].solved}<span style={{ fontSize: 12, fontWeight: 600, color: T.txtMut }}> / {stats.byDifficulty[d].total}</span>
            </span>
          </GlassCard>
        ))}
      </div>

      {/* Progress by difficulty */}
      <GlassCard>
        <div style={{ fontSize: 12, fontWeight: 700, color: T.primary, marginBottom: 16, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: 6 }}>
          <Flame size={14} /> Progress by Difficulty
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {(['Easy', 'Medium', 'Hard'] as Difficulty[]).map((d) => {
            const { solved, total } = stats.byDifficulty[d]
            const pct = total > 0 ? Math.round((solved / total) * 100) : 0
            return (
              <div key={d}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 600, marginBottom: 5 }}>
                  <DifficultyBadge difficulty={d} />
                  <span style={{ color: T.txtMut }}>{solved} / {total} solved</span>
                </div>
                <div style={{ height: 8, background: T.bgLow, borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${pct}%`, background: DIFFICULTY_BAR_COLOR[d], borderRadius: 4, transition: 'width 0.4s ease' }} />
                </div>
              </div>
            )
          })}
        </div>
      </GlassCard>

      {/* Recently attempted */}
      <GlassCard>
        <div style={{ fontSize: 12, fontWeight: 700, color: T.primary, marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Recently Attempted
        </div>
        {stats.recentAttempts.length === 0 ? (
          <div style={{ fontSize: 12, color: T.txtMut, padding: '12px 0' }}>No attempts yet — solve your first problem!</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {stats.recentAttempts.map((a) => (
              <div
                key={a.problemId}
                onClick={() => onOpenProblem(a.problemId)}
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: T.bgLow, borderRadius: 10, cursor: 'pointer' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {a.difficulty && <DifficultyBadge difficulty={a.difficulty} size="sm" />}
                  <span style={{ fontSize: 13, fontWeight: 600, color: T.txtPri }}>{a.problemTitle}</span>
                </div>
                {a.lastVerdict && <VerdictBadge verdict={a.lastVerdict} size="sm" />}
              </div>
            ))}
          </div>
        )}
      </GlassCard>

      {/* Submission history */}
      <GlassCard>
        <div style={{ fontSize: 12, fontWeight: 700, color: T.primary, marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: 6 }}>
          <History size={14} /> Submission History
        </div>
        {stats.submissionHistory.length === 0 ? (
          <div style={{ fontSize: 12, color: T.txtMut, padding: '12px 0' }}>No submissions yet.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${T.border}`, color: T.txtMut, fontSize: 10, fontWeight: 700, textTransform: 'uppercase' }}>
                  <th style={{ padding: '8px' }}>Problem</th>
                  <th style={{ padding: '8px' }}>Language</th>
                  <th style={{ padding: '8px' }}>Verdict</th>
                  <th style={{ padding: '8px' }}>Runtime</th>
                  <th style={{ padding: '8px' }}>When</th>
                </tr>
              </thead>
              <tbody>
                {stats.submissionHistory.map((s) => (
                  <tr key={s.id} onClick={() => onOpenProblem(s.problemId)} style={{ borderBottom: `1px solid ${T.border}`, fontSize: 12, cursor: 'pointer' }}>
                    <td style={{ padding: '8px', fontWeight: 600 }}>{s.problemTitle}</td>
                    <td style={{ padding: '8px', color: T.txtSec }}>{s.language}</td>
                    <td style={{ padding: '8px' }}><VerdictBadge verdict={s.verdict} size="sm" /></td>
                    <td style={{ padding: '8px', color: T.txtSec }}>{s.runtimeMs} ms</td>
                    <td style={{ padding: '8px', color: T.txtMut }}>{new Date(s.submittedAt).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </GlassCard>
    </div>
  )
}
