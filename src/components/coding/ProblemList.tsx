import { useEffect, useMemo, useState } from 'react'
import { Search, Code2, CheckCircle2 } from 'lucide-react'
import { T } from '../../theme'
import { DifficultyBadge } from './Badges'
import { listProblems } from '../../services/coding.service'
import type { ProblemSummary } from '../../services/coding.service'

const DIFFICULTIES = ['All', 'Easy', 'Medium', 'Hard']

export function ProblemList({
  onSelectProblem,
  solvedProblemIds,
}: {
  onSelectProblem: (id: string) => void
  solvedProblemIds?: Set<string>
}) {
  const [problems, setProblems] = useState<ProblemSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [difficulty, setDifficulty] = useState('All')
  const [topic, setTopic] = useState('All')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    listProblems({ status: 'Published' })
      .then((list) => {
        if (!cancelled) setProblems(list)
      })
      .catch((err) => !cancelled && setError(err.message || 'Failed to load problems'))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [])

  const allTopics = useMemo(() => {
    const s = new Set<string>()
    problems.forEach((p) => p.topics.forEach((t) => s.add(t)))
    return ['All', ...Array.from(s).sort()]
  }, [problems])

  const filtered = useMemo(() => {
    return problems.filter((p) => {
      if (difficulty !== 'All' && p.difficulty !== difficulty) return false
      if (topic !== 'All' && !p.topics.includes(topic)) return false
      if (search && !p.title.toLowerCase().includes(search.toLowerCase())) return false
      return true
    })
  }, [problems, difficulty, topic, search])

  return (
    <div>
      {/* Filters */}
      <div
        style={{
          display: 'flex',
          gap: 12,
          flexWrap: 'wrap',
          alignItems: 'center',
          marginBottom: 16,
        }}
      >
        <div style={{ position: 'relative', flex: '1 1 240px', minWidth: 200 }}>
          <Search size={15} style={{ position: 'absolute', left: 12, top: 10, color: T.txtMut }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search problems…"
            style={{
              width: '100%',
              boxSizing: 'border-box',
              padding: '9px 12px 9px 34px',
              borderRadius: 10,
              border: `1.5px solid ${T.outlineVar}`,
              fontSize: 13,
              fontFamily: 'inherit',
            }}
          />
        </div>

        <div style={{ display: 'flex', gap: 6 }}>
          {DIFFICULTIES.map((d) => (
            <button
              key={d}
              onClick={() => setDifficulty(d)}
              style={{
                padding: '6px 14px',
                borderRadius: 20,
                border: `1.5px solid ${difficulty === d ? T.primary : T.outlineVar}`,
                background: difficulty === d ? T.primary : 'transparent',
                color: difficulty === d ? '#fff' : T.txtSec,
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              {d}
            </button>
          ))}
        </div>

        <select
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          style={{
            padding: '8px 12px',
            borderRadius: 10,
            border: `1.5px solid ${T.outlineVar}`,
            fontSize: 12,
            fontFamily: 'inherit',
            background: T.bgWhite,
          }}
        >
          {allTopics.map((t) => (
            <option key={t} value={t}>
              {t === 'All' ? 'All Topics' : t}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: T.txtMut }}>Loading problems…</div>
      ) : error ? (
        <div style={{ textAlign: 'center', padding: 40, color: T.error }}>{error}</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: T.txtMut }}>
          No problems match your filters.
        </div>
      ) : (
        <div
          style={{
            background: T.bgWhite,
            border: `1px solid ${T.border}`,
            borderRadius: 12,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '40px 1fr 110px 1fr',
              padding: '10px 16px',
              fontSize: 10,
              fontWeight: 700,
              color: T.txtMut,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              borderBottom: `1px solid ${T.border}`,
              background: T.bgLow,
            }}
          >
            <span></span>
            <span>Title</span>
            <span>Difficulty</span>
            <span>Topics</span>
          </div>
          {filtered.map((p) => (
            <div
              key={p.id}
              onClick={() => onSelectProblem(p.id)}
              style={{
                display: 'grid',
                gridTemplateColumns: '40px 1fr 110px 1fr',
                alignItems: 'center',
                padding: '13px 16px',
                fontSize: 13,
                borderBottom: `1px solid ${T.border}`,
                cursor: 'pointer',
                transition: 'background 0.12s',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = T.bgLow)}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              <span>
                {solvedProblemIds?.has(p.id) ? (
                  <CheckCircle2 size={16} style={{ color: T.green }} />
                ) : (
                  <Code2 size={16} style={{ color: T.outlineVar }} />
                )}
              </span>
              <span style={{ fontWeight: 600, color: T.txtPri }}>{p.title}</span>
              <DifficultyBadge difficulty={p.difficulty} />
              <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {p.topics.slice(0, 3).map((t) => (
                  <span
                    key={t}
                    style={{
                      fontSize: 10,
                      fontWeight: 600,
                      padding: '2px 8px',
                      borderRadius: 8,
                      background: T.bgLow,
                      color: T.txtSec,
                    }}
                  >
                    {t}
                  </span>
                ))}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
