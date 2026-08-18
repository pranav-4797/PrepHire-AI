import { useEffect, useState } from 'react'
import type { ReactNode, CSSProperties } from 'react'
import { Plus, Pencil, Trash2, UploadCloud, Archive } from 'lucide-react'
import { T } from '../../theme'
import { DifficultyBadge, StatusPill } from './Badges'
import { AdminProblemEditor } from './AdminProblemEditor'
import { listProblems, getProblem, deleteProblem, updateProblem } from '../../services/coding.service'
import type { ProblemSummary, Problem } from '../../services/coding.service'

function GlassCard({ children, style = {} }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div style={{ background: '#ffffff', border: '1px solid #E5E7EB', borderRadius: 12, padding: '1.25rem', ...style }}>
      {children}
    </div>
  )
}

export function AdminProblemsManager({
  userEmail: _userEmail,
  showToast,
}: {
  userEmail?: string
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void
}) {
  const [problems, setProblems] = useState<ProblemSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<'All' | 'Draft' | 'Published'>('All')
  const [mode, setMode] = useState<'list' | 'create' | 'edit'>('list')
  const [editingProblem, setEditingProblem] = useState<Problem | null>(null)

  async function load() {
    setLoading(true)
    try {
      const list = await listProblems({ status: 'All' })
      setProblems(list)
    } catch (err) {
      showToast((err as Error).message || 'Failed to load problems', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const filtered = problems.filter((p) => {
    if (statusFilter === 'All') return true
    return p.status.toLowerCase() === statusFilter.toLowerCase()
  })

  async function handleEdit(id: string) {
    try {
      const full = await getProblem(id)
      setEditingProblem(full)
      setMode('edit')
    } catch (err) {
      showToast((err as Error).message || 'Failed to load problem', 'error')
    }
  }

  async function handleDelete(id: string, title: string) {
    if (!window.confirm(`Delete "${title}"? This cannot be undone.`)) return
    try {
      await deleteProblem(id)
      showToast('Problem deleted.', 'success')
      load()
    } catch (err) {
      showToast((err as Error).message || 'Failed to delete problem', 'error')
    }
  }

  async function handleToggleStatus(p: ProblemSummary) {
    const nextStatus = p.status === 'published' ? 'draft' : 'published'
    try {
      await updateProblem(p.id, { status: nextStatus })
      showToast(nextStatus === 'published' ? 'Problem published.' : 'Problem moved back to draft.', 'success')
      load()
    } catch (err) {
      showToast((err as Error).message || 'Failed to update status', 'error')
    }
  }

  if (mode === 'create' || mode === 'edit') {
    return (
      <AdminProblemEditor
        problem={mode === 'edit' ? editingProblem : null}
        showToast={showToast}
        onCancel={() => { setMode('list'); setEditingProblem(null) }}
        onSaved={() => { setMode('list'); setEditingProblem(null); load() }}
      />
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <section>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: T.primary, marginBottom: 4 }}>
          Coding Question Bank
        </h1>
        <p className="text-body" style={{ color: T.txtSec }}>
          Create, edit, publish, and retire coding problems for the student judge.
        </p>
      </section>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
        <GlassCard style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: T.txtMut, textTransform: 'uppercase' }}>Total Problems</span>
          <span style={{ fontSize: 24, fontWeight: 800, color: T.primary }}>{problems.length}</span>
        </GlassCard>
        <GlassCard style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: T.txtMut, textTransform: 'uppercase' }}>Published</span>
          <span style={{ fontSize: 24, fontWeight: 800, color: T.green }}>{problems.filter((p) => p.status === 'published').length}</span>
        </GlassCard>
        <GlassCard style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: T.txtMut, textTransform: 'uppercase' }}>Drafts</span>
          <span style={{ fontSize: 24, fontWeight: 800, color: T.amber }}>{problems.filter((p) => p.status === 'draft').length}</span>
        </GlassCard>
        <GlassCard style={{ display: 'flex', flexDirection: 'column', gap: 6, borderLeft: `3px solid ${T.primary}` }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: T.txtMut, textTransform: 'uppercase' }}>Hard Problems</span>
          <span style={{ fontSize: 24, fontWeight: 800, color: T.primary }}>{problems.filter((p) => p.difficulty === 'Hard').length}</span>
        </GlassCard>
      </div>

      <GlassCard>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            {(['All', 'Published', 'Draft'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                style={{
                  padding: '6px 14px',
                  borderRadius: 20,
                  border: `1.5px solid ${statusFilter === s ? T.primary : T.outlineVar}`,
                  background: statusFilter === s ? T.primary : 'transparent',
                  color: statusFilter === s ? '#fff' : T.txtSec,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                {s}
              </button>
            ))}
          </div>
          <button
            onClick={() => { setEditingProblem(null); setMode('create') }}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 10, border: 'none', background: T.primary, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
          >
            <Plus size={15} /> New Problem
          </button>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 30, color: T.txtMut }}>Loading problems…</div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 30, color: T.txtMut }}>No problems found. Create your first one!</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${T.border}`, color: T.txtMut, fontSize: 10, fontWeight: 700, textTransform: 'uppercase' }}>
                  <th style={{ padding: '10px 8px' }}>Title</th>
                  <th style={{ padding: '10px 8px' }}>Difficulty</th>
                  <th style={{ padding: '10px 8px' }}>Topics</th>
                  <th style={{ padding: '10px 8px' }}>Status</th>
                  <th style={{ padding: '10px 8px', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <tr key={p.id} style={{ borderBottom: `1px solid ${T.border}`, fontSize: 13 }}>
                    <td style={{ padding: '10px 8px', fontWeight: 600 }}>{p.title}</td>
                    <td style={{ padding: '10px 8px' }}><DifficultyBadge difficulty={p.difficulty} /></td>
                    <td style={{ padding: '10px 8px' }}>
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        {p.topics.slice(0, 2).map((t) => (
                          <span key={t} style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 8, background: T.bgLow, color: T.txtSec }}>{t}</span>
                        ))}
                      </div>
                    </td>
                    <td style={{ padding: '10px 8px' }}><StatusPill status={p.status} /></td>
                    <td style={{ padding: '10px 8px' }}>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                        <button onClick={() => handleToggleStatus(p)} title={p.status === 'published' ? 'Unpublish' : 'Publish'} style={{ padding: 6, borderRadius: 6, border: `1px solid ${T.outlineVar}`, background: 'transparent', cursor: 'pointer', color: T.primary }}>
                          {p.status === 'published' ? <Archive size={13} /> : <UploadCloud size={13} />}
                        </button>
                        <button onClick={() => handleEdit(p.id)} title="Edit" style={{ padding: 6, borderRadius: 6, border: `1px solid ${T.outlineVar}`, background: 'transparent', cursor: 'pointer', color: T.primary }}>
                          <Pencil size={13} />
                        </button>
                        <button onClick={() => handleDelete(p.id, p.title)} title="Delete" style={{ padding: 6, borderRadius: 6, border: `1px solid ${T.error}`, background: 'transparent', cursor: 'pointer', color: T.error }}>
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
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
