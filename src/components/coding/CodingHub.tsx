import { useEffect, useState } from 'react'
import { Code2, LayoutDashboard } from 'lucide-react'
import { T } from '../../theme'
import { ProblemList } from './ProblemList'
import { ProblemWorkspace } from './ProblemWorkspace'
import { CodingDashboard } from './CodingDashboard'
import { listLanguages, getDashboardStats } from '../../services/coding.service'
import type { LanguageOption } from '../../services/coding.service'

export function CodingHub({ userEmail, userName }: { userEmail: string; userName: string }) {
  const [tab, setTab] = useState<'problems' | 'dashboard'>('problems')
  const [selectedProblemId, setSelectedProblemId] = useState<string | null>(null)
  const [languages, setLanguages] = useState<LanguageOption[]>([])
  const [solvedIds, setSolvedIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    listLanguages().then(setLanguages).catch(() => setLanguages([]))
  }, [])

  useEffect(() => {
    if (!userEmail) return
    getDashboardStats(userEmail)
      .then((stats) => {
        const ids = new Set(
          stats.recentAttempts.filter((a) => a.solved).map((a) => a.problemId),
        )
        setSolvedIds(ids)
      })
      .catch(() => {})
  }, [userEmail])

  if (selectedProblemId) {
    return (
      <ProblemWorkspace
        problemId={selectedProblemId}
        userEmail={userEmail}
        userName={userName}
        languages={languages}
        onBack={() => setSelectedProblemId(null)}
        onSolved={(id) => setSolvedIds((prev) => new Set(prev).add(id))}
      />
    )
  }

  return (
    <div>
      <section
        style={{
          paddingBottom: '1.25rem',
          marginBottom: 16,
          borderBottom: `1px solid ${T.border}`,
        }}
      >
        <h1 style={{ fontSize: 18, fontWeight: 600, margin: '0 0 8px', color: T.primary, letterSpacing: '-0.4px' }}>
          Coding Platform
        </h1>
        <p className="text-body" style={{ color: T.txtSec }}>
          Sharpen your DSA and problem-solving skills with hands-on coding challenges.
        </p>
      </section>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {([
          { id: 'problems', label: 'Problems', icon: <Code2 size={14} /> },
          { id: 'dashboard', label: 'My Dashboard', icon: <LayoutDashboard size={14} /> },
        ] as const).map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 16px',
              borderRadius: 20,
              border: `1.5px solid ${tab === t.id ? T.primary : T.outlineVar}`,
              background: tab === t.id ? T.primary : 'transparent',
              color: tab === t.id ? '#fff' : T.txtSec,
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {tab === 'problems' ? (
        <ProblemList onSelectProblem={setSelectedProblemId} solvedProblemIds={solvedIds} />
      ) : (
        <CodingDashboard userEmail={userEmail} onOpenProblem={setSelectedProblemId} />
      )}
    </div>
  )
}
