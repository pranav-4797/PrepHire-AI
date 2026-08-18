import { useEffect, useState } from 'react'
import type { ReactNode, CSSProperties } from 'react'
import { Plus, Trash2, Save, UploadCloud } from 'lucide-react'
import { T } from '../../theme'
import { createProblem, updateProblem, listLanguages } from '../../services/coding.service'
import type { Problem, TestCase, LanguageOption, Difficulty } from '../../services/coding.service'

const inputStyle: CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '9px 12px',
  borderRadius: 8,
  border: `1.5px solid ${T.outlineVar}`,
  fontSize: 13,
  fontFamily: 'inherit',
}

const labelStyle: CSSProperties = {
  display: 'block',
  fontSize: 12,
  fontWeight: 700,
  marginBottom: 6,
  color: T.txtPri,
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      {children}
    </div>
  )
}

function TestCaseEditor({
  title, tests, onChange, includeExplanation,
}: {
  title: string
  tests: TestCase[]
  onChange: (next: TestCase[]) => void
  includeExplanation?: boolean
}) {
  function update(i: number, patch: Partial<TestCase>) {
    onChange(tests.map((t, idx) => (idx === i ? { ...t, ...patch } : t)))
  }
  function add() {
    onChange([...tests, { input: '', output: '', explanation: '' }])
  }
  function remove(i: number) {
    onChange(tests.filter((_, idx) => idx !== i))
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <label style={labelStyle}>{title} ({tests.length})</label>
        <button type="button" onClick={add} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, color: T.primary, background: 'none', border: 'none', cursor: 'pointer' }}>
          <Plus size={13} /> Add Case
        </button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {tests.map((t, i) => (
          <div key={i} style={{ border: `1px solid ${T.border}`, borderRadius: 8, padding: 10, background: T.bgLow }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: T.txtMut }}>Case {i + 1}</span>
              <button type="button" onClick={() => remove(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.error }}>
                <Trash2 size={13} />
              </button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <textarea
                value={t.input}
                onChange={(e) => update(i, { input: e.target.value })}
                placeholder="Input"
                rows={2}
                style={{ ...inputStyle, fontFamily: 'monospace', fontSize: 12, resize: 'vertical' }}
              />
              <textarea
                value={t.output}
                onChange={(e) => update(i, { output: e.target.value })}
                placeholder="Expected Output"
                rows={2}
                style={{ ...inputStyle, fontFamily: 'monospace', fontSize: 12, resize: 'vertical' }}
              />
            </div>
            {includeExplanation && (
              <input
                value={t.explanation || ''}
                onChange={(e) => update(i, { explanation: e.target.value })}
                placeholder="Explanation (optional, shown to students)"
                style={{ ...inputStyle, marginTop: 8, fontSize: 12 }}
              />
            )}
          </div>
        ))}
        {tests.length === 0 && (
          <div style={{ fontSize: 12, color: T.txtMut, padding: '8px 0' }}>No test cases yet.</div>
        )}
      </div>
    </div>
  )
}

const EMPTY_FORM: Partial<Problem> = {
  title: '',
  difficulty: 'Easy',
  topics: [],
  statement: '',
  constraints: '',
  inputFormat: '',
  outputFormat: '',
  sampleTests: [],
  hiddenTests: [],
  timeLimitMs: 2000,
  memoryLimitMb: 256,
  languages: [],
  starterCode: {},
  status: 'draft',
}

export function AdminProblemEditor({
  problem,
  onSaved,
  onCancel,
  showToast,
}: {
  problem: Problem | null
  onSaved: () => void
  onCancel: () => void
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void
}) {
  const [form, setForm] = useState<Partial<Problem>>(problem ? { ...problem } : { ...EMPTY_FORM })
  const [topicsInput, setTopicsInput] = useState((problem?.topics || []).join(', '))
  const [languages, setLanguages] = useState<LanguageOption[]>([])
  const [starterLangTab, setStarterLangTab] = useState<string>(problem?.languages?.[0] || '')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    listLanguages().then((list) => {
      setLanguages(list)
      if (!starterLangTab && list.length) setStarterLangTab(list[0].id)
    }).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function set<K extends keyof Problem>(key: K, value: Problem[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function toggleLanguage(id: string) {
    const current = form.languages || []
    const next = current.includes(id) ? current.filter((l) => l !== id) : [...current, id]
    set('languages', next)
    if (!starterLangTab && next.length) setStarterLangTab(next[0])
  }

  async function save(status: 'draft' | 'published') {
    const topics = topicsInput.split(',').map((t) => t.trim()).filter(Boolean)
    const payload: Partial<Problem> = { ...form, topics, status }

    if (!payload.title || !payload.statement) {
      showToast('Title and problem statement are required.', 'error')
      return
    }
    if (!payload.sampleTests || payload.sampleTests.length === 0) {
      showToast('Add at least one sample test case.', 'error')
      return
    }
    if (status === 'published' && (!payload.hiddenTests || payload.hiddenTests.length === 0)) {
      showToast('Add at least one hidden test case before publishing.', 'error')
      return
    }
    if (!payload.languages || payload.languages.length === 0) {
      showToast('Select at least one supported language.', 'error')
      return
    }

    setSaving(true)
    try {
      if (problem) {
        await updateProblem(problem.id, payload)
        showToast(status === 'published' ? 'Problem updated and published!' : 'Problem updated.', 'success')
      } else {
        await createProblem(payload)
        showToast(status === 'published' ? 'Problem created and published!' : 'Problem saved as draft.', 'success')
      }
      onSaved()
    } catch (err) {
      showToast((err as Error).message || 'Failed to save problem', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ background: T.bgWhite, border: `1px solid ${T.border}`, borderRadius: 12, padding: 20 }}>
      <h2 style={{ fontSize: 18, fontWeight: 700, color: T.primary, margin: '0 0 16px' }}>
        {problem ? 'Edit Problem' : 'Create New Problem'}
      </h2>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
          <Field label="Title">
            <input style={inputStyle} value={form.title || ''} onChange={(e) => set('title', e.target.value)} placeholder="e.g. Two Sum" />
          </Field>
          <Field label="Difficulty">
            <select style={inputStyle} value={form.difficulty || 'Easy'} onChange={(e) => set('difficulty', e.target.value as Difficulty)}>
              {(['Easy', 'Medium', 'Hard'] as Difficulty[]).map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </Field>
        </div>

        <Field label="Topics / Tags (comma-separated)">
          <input style={inputStyle} value={topicsInput} onChange={(e) => setTopicsInput(e.target.value)} placeholder="Arrays, Hash Map, Two Pointers" />
        </Field>

        <Field label="Problem Statement">
          <textarea style={{ ...inputStyle, resize: 'vertical' }} rows={6} value={form.statement || ''} onChange={(e) => set('statement', e.target.value)} placeholder="Describe the problem in detail…" />
        </Field>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Input Format">
            <textarea style={{ ...inputStyle, resize: 'vertical' }} rows={3} value={form.inputFormat || ''} onChange={(e) => set('inputFormat', e.target.value)} />
          </Field>
          <Field label="Output Format">
            <textarea style={{ ...inputStyle, resize: 'vertical' }} rows={3} value={form.outputFormat || ''} onChange={(e) => set('outputFormat', e.target.value)} />
          </Field>
        </div>

        <Field label="Constraints">
          <textarea style={{ ...inputStyle, resize: 'vertical', fontFamily: 'monospace' }} rows={3} value={form.constraints || ''} onChange={(e) => set('constraints', e.target.value)} placeholder={'1 <= n <= 10^5'} />
        </Field>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Time Limit (ms)">
            <input type="number" style={inputStyle} value={form.timeLimitMs ?? 2000} onChange={(e) => set('timeLimitMs', Number(e.target.value))} />
          </Field>
          <Field label="Memory Limit (MB)">
            <input type="number" style={inputStyle} value={form.memoryLimitMb ?? 256} onChange={(e) => set('memoryLimitMb', Number(e.target.value))} />
          </Field>
        </div>

        <Field label="Supported Languages">
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {languages.map((l) => {
              const checked = (form.languages || []).includes(l.id)
              return (
                <label key={l.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, padding: '6px 12px', borderRadius: 8, border: `1.5px solid ${checked ? T.primary : T.outlineVar}`, background: checked ? T.primaryFix : 'transparent', cursor: 'pointer' }}>
                  <input type="checkbox" checked={checked} onChange={() => toggleLanguage(l.id)} style={{ margin: 0 }} />
                  {l.label}
                </label>
              )
            })}
          </div>
        </Field>

        {(form.languages || []).length > 0 && (
          <Field label="Starter Code (per language)">
            <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
              {(form.languages || []).map((id) => {
                const lbl = languages.find((l) => l.id === id)?.label || id
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setStarterLangTab(id)}
                    style={{
                      padding: '5px 12px',
                      borderRadius: 16,
                      border: `1.5px solid ${starterLangTab === id ? T.primary : T.outlineVar}`,
                      background: starterLangTab === id ? T.primary : 'transparent',
                      color: starterLangTab === id ? '#fff' : T.txtSec,
                      fontSize: 11,
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    {lbl}
                  </button>
                )
              })}
            </div>
            {starterLangTab && (
              <textarea
                style={{ ...inputStyle, resize: 'vertical', fontFamily: 'monospace', fontSize: 12 }}
                rows={6}
                value={form.starterCode?.[starterLangTab] || ''}
                onChange={(e) => set('starterCode', { ...(form.starterCode || {}), [starterLangTab]: e.target.value })}
                placeholder={`Starter code shown to students for ${languages.find((l) => l.id === starterLangTab)?.label}`}
              />
            )}
          </Field>
        )}

        <TestCaseEditor
          title="Sample Test Cases (visible to students)"
          tests={form.sampleTests || []}
          onChange={(next) => set('sampleTests', next)}
          includeExplanation
        />

        <TestCaseEditor
          title="Hidden Test Cases (used for grading only — never shown to students)"
          tests={form.hiddenTests || []}
          onChange={(next) => set('hiddenTests', next)}
        />
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 24, paddingTop: 16, borderTop: `1px solid ${T.border}` }}>
        <button
          type="button"
          onClick={onCancel}
          style={{ padding: '9px 18px', borderRadius: 10, border: `1px solid ${T.outlineVar}`, background: 'transparent', color: T.txtSec, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={() => save('draft')}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 18px', borderRadius: 10, border: `1px solid ${T.outlineVar}`, background: T.bgLow, color: T.primary, fontSize: 13, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}
        >
          <Save size={14} /> Save Draft
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={() => save('published')}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 18px', borderRadius: 10, border: 'none', background: T.primary, color: '#fff', fontSize: 13, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}
        >
          <UploadCloud size={14} /> {problem?.status === 'published' ? 'Update & Publish' : 'Publish'}
        </button>
      </div>
    </div>
  )
}
