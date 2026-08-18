import { useMemo, useState } from 'react'
import { computeRankings, type RankableSession } from '../utils/ranking'

const T = {
  bg: '#f7f9fb',
  bgWhite: '#ffffff',
  bgLow: '#f2f4f6',
  bgMid: '#eceef0',
  bgHigh: '#e6e8ea',
  txtPri: '#191c1e',
  txtSec: '#43474f',
  txtMut: '#737780',
  primary: '#001e40',
  primaryFix: '#d5e3ff',
  primaryFixD: '#a7c8ff',
  onPrimFx: '#001b3c',
  gold: '#fea619',
  goldFixed: '#ffddb8',
  border: 'rgba(195,198,209,0.8)',
  outlineVar: '#c3c6d1',
  error: '#ba1a1a',
  errCont: '#ffdad6',
  green: '#166534',
  greenBg: '#dcfce7',
  amber: '#92400e',
  amberBg: '#fef3c7',
}

function scoreColor(v: number): string {
  if (v >= 85) return '#3B82F6'
  if (v >= 70) return '#10B981'
  if (v >= 50) return '#F59E0B'
  return '#EF4444'
}

function GlassCard({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
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

function Pill({ children, color = T.onPrimFx, bg = T.primaryFix }: { children: React.ReactNode; color?: string; bg?: string }) {
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

interface LeaderboardProps {
  sessions: RankableSession[]
  currentUserEmail: string
  userRole: 'admin' | 'faculty' | 'student'
  placementReadyMap: Record<string, boolean>
}

export function Leaderboard({ sessions, currentUserEmail, userRole, placementReadyMap }: LeaderboardProps) {
  const [domainFilter, setDomainFilter] = useState('All')
  const [searchTerm, setSearchTerm] = useState('')
  const [sortBy, setSortBy] = useState<'compositeScore' | 'avgScore' | 'peakScore' | 'totalInterviews'>('compositeScore')

  const rankings = useMemo(() => computeRankings(sessions, placementReadyMap), [sessions, placementReadyMap])

  const filtered = useMemo(() => {
    let list = rankings
    if (domainFilter !== 'All') {
      list = list.filter((s) => s.domainNames.includes(domainFilter.toLowerCase()))
    }
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase()
      list = list.filter((s) => s.name.toLowerCase().includes(q) || s.email.toLowerCase().includes(q))
    }
    return [...list].sort((a, b) => b[sortBy] - a[sortBy])
  }, [rankings, domainFilter, searchTerm, sortBy])

  const currentStudent = rankings.find((r) => r.email === currentUserEmail.toLowerCase())

  const rankMedal = (rank: number) => {
    if (rank === 1) return '🥇'
    if (rank === 2) return '🥈'
    if (rank === 3) return '🥉'
    return `#${rank}`
  }

  return (
    <div style={{ animation: 'fadeIn 0.3s ease' }}>
      {/* Title */}
      <section style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: userRole === 'student' ? 18 : 22, fontWeight: 700, color: T.primary, marginBottom: 6 }}>
          Student Rankings
        </h1>
        <p className="text-body" style={{ color: T.txtSec }}>
          {userRole === 'student'
            ? 'See how you stack up against your peers across all interview domains.'
            : 'Overall student leaderboard based on interview performance, consistency, and integrity.'}
        </p>
      </section>

      {/* Current student's rank card (only for students) */}
      {userRole === 'student' && currentStudent && (
        <GlassCard
          style={{
            marginBottom: 24,
            borderLeft: `4px solid ${T.gold}`,
            background: 'rgba(254, 166, 25, 0.04)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: T.txtMut, textTransform: 'uppercase', marginBottom: 4 }}>
                Your Standing
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 28, fontWeight: 800, color: T.primary }}>
                  #{currentStudent.rank}
                </span>
                <span style={{ fontSize: 14, color: T.txtSec }}>of {rankings.length} ranked students</span>
                <Pill color="#684000" bg={T.goldFixed}>{currentStudent.tier}</Pill>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 20, textAlign: 'center' }}>
              <div>
                <div style={{ fontSize: 22, fontWeight: 800, color: scoreColor(currentStudent.compositeScore) }}>
                  {currentStudent.compositeScore}
                </div>
                <div style={{ fontSize: 10, color: T.txtMut, textTransform: 'uppercase' }}>Composite</div>
              </div>
              <div>
                <div style={{ fontSize: 22, fontWeight: 800, color: T.primary }}>{currentStudent.totalInterviews}</div>
                <div style={{ fontSize: 10, color: T.txtMut, textTransform: 'uppercase' }}>Interviews</div>
              </div>
              <div>
                <div style={{ fontSize: 22, fontWeight: 800, color: T.primary }}>{currentStudent.avgScore}%</div>
                <div style={{ fontSize: 10, color: T.txtMut, textTransform: 'uppercase' }}>Avg Score</div>
              </div>
            </div>
          </div>
        </GlassCard>
      )}

      {/* Filters */}
      <GlassCard style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16, marginBottom: 16 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {['All', 'Technical', 'HR', 'Aptitude', 'GD'].map((dom) => (
              <button
                key={dom}
                onClick={() => setDomainFilter(dom)}
                style={{
                  padding: '6px 14px',
                  borderRadius: 20,
                  border: `1.5px solid ${domainFilter === dom ? T.primary : T.outlineVar}`,
                  background: domainFilter === dom ? T.primary : 'transparent',
                  color: domainFilter === dom ? '#fff' : T.txtSec,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                {dom === 'GD' ? 'Group Discussion' : dom}
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
              style={{
                padding: '6px 10px',
                borderRadius: 8,
                border: `1.5px solid ${T.outlineVar}`,
                fontSize: 12,
                fontWeight: 600,
                color: T.txtPri,
                background: T.bgWhite,
                fontFamily: 'inherit',
                cursor: 'pointer',
              }}
            >
              <option value="compositeScore">Composite Score</option>
              <option value="avgScore">Avg Score</option>
              <option value="peakScore">Peak Score</option>
              <option value="totalInterviews">Interviews</option>
            </select>

            <input
              type="text"
              placeholder="Search by name or email…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                padding: '6px 14px',
                borderRadius: 10,
                border: `1.5px solid ${T.outlineVar}`,
                fontSize: 12,
                minWidth: 200,
                fontFamily: 'inherit',
              }}
            />
          </div>
        </div>

        {/* Summary stats */}
        <div style={{ display: 'flex', gap: 20, marginBottom: 16, fontSize: 12, color: T.txtSec }}>
          <span><strong style={{ color: T.txtPri }}>{rankings.length}</strong> ranked students</span>
          <span><strong style={{ color: T.txtPri }}>{sessions.length}</strong> total interviews</span>
        </div>

        {/* Table */}
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${T.border}`, color: T.txtMut, fontSize: 11, fontWeight: 700, textTransform: 'uppercase' }}>
                <th style={{ padding: '12px 8px' }}>Rank</th>
                <th style={{ padding: '12px 8px' }}>Student</th>
                <th style={{ padding: '12px 8px' }}>Domains</th>
                <th style={{ padding: '12px 8px' }}>Interviews</th>
                <th style={{ padding: '12px 8px' }}>Avg Score</th>
                <th style={{ padding: '12px 8px' }}>Peak</th>
                <th style={{ padding: '12px 8px' }}>Integrity</th>
                <th style={{ padding: '12px 8px' }}>Composite</th>
                <th style={{ padding: '12px 8px' }}>Tier</th>
                {userRole !== 'student' && <th style={{ padding: '12px 8px' }}>Ready</th>}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={userRole === 'student' ? 9 : 10} style={{ textAlign: 'center', padding: '24px', color: T.txtMut, fontSize: 13 }}>
                    No ranked students match the current filters.
                  </td>
                </tr>
              ) : (
                filtered.map((student) => {
                  const isSelf = student.email === currentUserEmail.toLowerCase()
                  return (
                    <tr
                      key={student.email}
                      style={{
                        borderBottom: `1px solid ${T.border}`,
                        fontSize: 13,
                        color: T.txtPri,
                        background: isSelf ? 'rgba(0, 30, 64, 0.03)' : 'transparent',
                      }}
                    >
                      <td style={{ padding: '12px 8px', fontWeight: 700, fontSize: 14 }}>
                        {rankMedal(student.rank)}
                      </td>
                      <td style={{ padding: '12px 8px' }}>
                          <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                            {student.name}
                            {isSelf && <Pill color="#fff" bg={T.primary}>You</Pill>}
                          </div>
                      </td>
                      <td style={{ padding: '12px 8px' }}>
                        <span style={{ fontSize: 11, color: T.txtSec }}>
                          {student.domainNames.length}/4
                        </span>
                      </td>
                      <td style={{ padding: '12px 8px', fontWeight: 600 }}>{student.totalInterviews}</td>
                      <td style={{ padding: '12px 8px', fontWeight: 600, color: scoreColor(student.avgScore) }}>
                        {student.avgScore}%
                      </td>
                      <td style={{ padding: '12px 8px', fontWeight: 600 }}>{student.peakScore}%</td>
                      <td style={{ padding: '12px 8px' }}>
                        <span style={{
                          fontSize: 11,
                          fontWeight: 700,
                          color: student.integrityScore >= 80 ? T.green : student.integrityScore >= 50 ? T.amber : T.error,
                        }}>
                          {student.integrityScore}%
                        </span>
                      </td>
                      <td style={{ padding: '12px 8px', fontWeight: 800, fontSize: 15, color: scoreColor(student.compositeScore) }}>
                        {student.compositeScore}
                      </td>
                      <td style={{ padding: '12px 8px' }}>
                        <Pill
                          color="#684000"
                          bg={student.tier === 'Top 1%' || student.tier === 'Top 5%' ? T.goldFixed : T.primaryFix}
                        >
                          {student.tier}
                        </Pill>
                      </td>
                      {userRole !== 'student' && (
                        <td style={{ padding: '12px 8px' }}>
                          <span style={{
                            fontSize: 11,
                            fontWeight: 700,
                            color: student.placementReady ? T.green : T.txtMut,
                          }}>
                            {student.placementReady ? '✅' : '—'}
                          </span>
                        </td>
                      )}
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </GlassCard>

      {/* Weight explanation */}
      <GlassCard style={{ background: T.bgLow, border: `1px solid ${T.border}` }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: T.txtPri, marginBottom: 12 }}>
          How Rankings Are Calculated
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 11, color: T.txtSec }}>
          <div>• <strong>Avg Score (last 5)</strong> — 40%: Average of your most recent 5 interviews</div>
          <div>• <strong>Peak Score</strong> — 15%: Your highest interview score ever</div>
          <div>• <strong>Domain Diversity</strong> — 15%: How many domains you've attempted (out of 4)</div>
          <div>• <strong>Integrity</strong> — 15%: Based on proctoring warnings (fewer = better)</div>
          <div>• <strong>Consistency</strong> — 10%: Low score variance = reliable performer</div>
          <div>• <strong>Frequency</strong> — 5%: Practice volume (caps at 10+ interviews)</div>
        </div>
        <div style={{ marginTop: 10, fontSize: 11, color: T.txtMut }}>
          Minimum <strong>2 interviews</strong> required to appear on the leaderboard.
        </div>
      </GlassCard>
    </div>
  )
}
