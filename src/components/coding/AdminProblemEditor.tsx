import { useEffect, useState } from 'react'
import type { ReactNode, CSSProperties } from 'react'
import { Plus, Trash2, Save, UploadCloud, Sparkles, CheckCircle2, AlertTriangle, Loader2, X, Cpu } from 'lucide-react'
import { T } from '../../theme'
import { createProblem, updateProblem, listLanguages, generateProblemWithAI } from '../../services/coding.service'
import type { Problem, TestCase, LanguageOption, Difficulty, GenerateProblemPreflight } from '../../services/coding.service'
import { BRANCHES } from '../../constants/branches'
import { sanitizeErrorMessage } from '../../utils/errorSanitizer'

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
  targetBranch: null,
  dueDate: null,
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
  const [showAiModal, setShowAiModal] = useState(false)
  const [aiGenerating, setAiGenerating] = useState(false)
  const [aiTopic, setAiTopic] = useState('')
  const [aiDifficulty, setAiDifficulty] = useState<Difficulty>('Medium')
  const [aiLangs, setAiLangs] = useState<string[]>(['python', 'javascript', 'cpp', 'java'])
  const [aiNotes, setAiNotes] = useState('')
  const [aiModel, setAiModel] = useState('qwen/qwen2.5-coder-32b-instruct')
  const [aiValidateSandbox, setAiValidateSandbox] = useState(true)
  const [preflightStatus, setPreflightStatus] = useState<GenerateProblemPreflight | null>(null)

  useEffect(() => {
    listLanguages().then((list) => {
      setLanguages(list)
      if (!starterLangTab && list.length) setStarterLangTab(list[0].id)
    }).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!showAiModal) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !aiGenerating) {
        setShowAiModal(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [showAiModal, aiGenerating])

  function set<K extends keyof Problem>(key: K, value: Problem[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function toggleLanguage(id: string) {
    const current = form.languages || []
    const next = current.includes(id) ? current.filter((l) => l !== id) : [...current, id]
    set('languages', next)
    if (!starterLangTab && next.length) setStarterLangTab(next[0])
  }

  function toggleAiLang(id: string) {
    setAiLangs((prev) => (prev.includes(id) ? prev.filter((l) => l !== id) : [...prev, id]))
  }

  async function handleAiGenerate() {
    if (!aiTopic.trim()) {
      showToast('Please enter a problem topic or concept.', 'error')
      return
    }
    if (aiLangs.length === 0) {
      showToast('Select at least one target programming language.', 'error')
      return
    }
    setAiGenerating(true)
    try {
      const res = await generateProblemWithAI({
        topic: aiTopic.trim(),
        difficulty: aiDifficulty,
        languages: aiLangs,
        facultyNotes: aiNotes.trim() || undefined,
        model: aiModel,
        validateWithSandbox: aiValidateSandbox,
      })

      const p = res.problem
      setForm((prev) => ({
        ...prev,
        title: p.title || prev.title,
        difficulty: p.difficulty || prev.difficulty,
        statement: p.statement || prev.statement,
        inputFormat: p.inputFormat || prev.inputFormat,
        outputFormat: p.outputFormat || prev.outputFormat,
        constraints: p.constraints || prev.constraints,
        timeLimitMs: p.timeLimitMs || prev.timeLimitMs || 2000,
        memoryLimitMb: p.memoryLimitMb || prev.memoryLimitMb || 256,
        languages: p.languages || aiLangs,
        starterCode: p.starterCode || prev.starterCode || {},
        sampleTests: p.sampleTests || prev.sampleTests || [],
        hiddenTests: p.hiddenTests || prev.hiddenTests || [],
      }))

      if (p.topics && Array.isArray(p.topics)) {
        setTopicsInput(p.topics.join(', '))
      }
      if (p.languages && p.languages.length > 0) {
        setStarterLangTab(p.languages[0])
      }

      setPreflightStatus(res.preflight)
      setShowAiModal(false)

      if (res.preflight?.allPassed) {
        showToast(`AI problem generated and pre-validated! (${res.preflight.passedCount}/${res.preflight.totalCount} tests passed in sandbox)`, 'success')
      } else if (res.preflight?.tested) {
        showToast(`AI problem generated with warnings (${res.preflight.passedCount}/${res.preflight.totalCount} tests passed)`, 'info')
      } else {
        showToast('AI problem generated successfully! Review and edit before saving.', 'success')
      }
    } catch (err) {
      showToast(sanitizeErrorMessage(err, 'Failed to generate problem with AI. Please try again.'), 'error')
    } finally {
      setAiGenerating(false)
    }
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
      showToast(sanitizeErrorMessage(err, 'Failed to save problem. Please try again.'), 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ background: T.bgWhite, border: `1px solid ${T.border}`, borderRadius: 12, padding: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: T.primary, margin: 0 }}>
          {problem ? 'Edit Problem' : 'Create New Problem'}
        </h2>
        <button
          type="button"
          onClick={() => setShowAiModal(true)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '7px 14px',
            borderRadius: 8,
            border: `1.5px solid ${T.outlineVar}`,
            background: T.bgLow,
            color: T.primary,
            fontSize: 12,
            fontWeight: 700,
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          <Sparkles size={14} /> Generate
        </button>
      </div>

      {preflightStatus && (
        <div
          style={{
            marginBottom: 16,
            padding: '10px 14px',
            borderRadius: 8,
            border: `1px solid ${preflightStatus.allPassed ? '#86efac' : '#fde047'}`,
            background: preflightStatus.allPassed ? '#f0fdf4' : '#fefce8',
            color: preflightStatus.allPassed ? '#166534' : '#854d0e',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            fontSize: 13,
          }}
        >
          {preflightStatus.allPassed ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
          <div>
            <strong>{preflightStatus.allPassed ? 'Sandbox Pre-Validation Passed:' : 'Sandbox Pre-Validation Notice:'}</strong>{' '}
            {preflightStatus.passedCount} of {preflightStatus.totalCount} test cases verified against the AI reference solution in Piston sandbox ({preflightStatus.verdict}).
          </div>
        </div>
      )}

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

        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12, background: T.bgLow, padding: 12, borderRadius: 10, border: `1px dashed ${T.outlineVar}` }}>
          <Field label="🎯 CodeTantra-Style Assignment: Target Branch">
            <select
              style={inputStyle}
              value={form.targetBranch || ''}
              onChange={(e) => set('targetBranch', e.target.value ? e.target.value : null)}
            >
              <option value="">All Branches / Open Practice</option>
              {BRANCHES.map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          </Field>
          <Field label="⏰ Submission Due Date (Optional)">
            <input
              type="date"
              style={inputStyle}
              value={form.dueDate ? form.dueDate.split('T')[0] : ''}
              onChange={(e) => set('dueDate', e.target.value ? new Date(e.target.value).toISOString() : null)}
            />
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

      {showAiModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.7)',
            backdropFilter: 'blur(6px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: 16,
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget && !aiGenerating) setShowAiModal(false)
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="ai-generator-modal-title"
            style={{
              width: '100%',
              maxWidth: 580,
              background: '#ffffff',
              borderRadius: 16,
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
              border: `1px solid ${T.border}`,
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              maxHeight: '90vh',
            }}
          >
            {/* Header */}
            <div
              style={{
                padding: '18px 24px',
                background: 'linear-gradient(135deg, #1E3A8A 0%, #3B82F6 100%)',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    background: 'rgba(255, 255, 255, 0.2)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Cpu size={20} />
                </div>
                <div>
                  <h3 id="ai-generator-modal-title" style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Generate Problem</h3>
                  <div style={{ fontSize: 11, opacity: 0.9 }}>
                    Draft problem statement, starter code, and verified test cases.
                  </div>
                </div>
              </div>
              <button
                type="button"
                disabled={aiGenerating}
                onClick={() => setShowAiModal(false)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#fff',
                  cursor: aiGenerating ? 'not-allowed' : 'pointer',
                  padding: 4,
                  borderRadius: 6,
                }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Body */}
            <div style={{ padding: 22, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={labelStyle}>Problem Concept / Statement Prompt *</label>
                <textarea
                  disabled={aiGenerating}
                  rows={3}
                  value={aiTopic}
                  onChange={(e) => setAiTopic(e.target.value)}
                  placeholder="e.g. Find all unique triplets in an array that sum to zero (3Sum), ensuring no duplicate triplets in the output."
                  style={{ ...inputStyle, resize: 'vertical' }}
                />
                <div style={{ fontSize: 11, color: T.txtMut, marginTop: 4 }}>
                  Tip: Mention specific edge cases, bounds, or desired algorithm patterns.
                </div>
              </div>

              <div>
                <label style={labelStyle}>NVIDIA AI Engine</label>
                <select
                  disabled={aiGenerating}
                  value={aiModel}
                  onChange={(e) => setAiModel(e.target.value)}
                  style={inputStyle}
                >
                  <option value="qwen/qwen2.5-coder-32b-instruct">
                    Qwen 2.5 Coder 32B (Recommended — Best Code Accuracy & Multi-Language Stubs)
                  </option>
                  <option value="nvidia/llama-3.1-nemotron-70b-instruct">
                    NVIDIA Llama 3.1 Nemotron 70B (Best Problem Pedagogy & Edge Cases)
                  </option>
                  <option value="meta/llama-3.3-70b-instruct">
                    Meta Llama 3.3 70B Instruct (General Reasoning & Algorithmic Design)
                  </option>
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={labelStyle}>Target Difficulty</label>
                  <select
                    disabled={aiGenerating}
                    value={aiDifficulty}
                    onChange={(e) => setAiDifficulty(e.target.value as Difficulty)}
                    style={inputStyle}
                  >
                    <option value="Easy">Easy</option>
                    <option value="Medium">Medium</option>
                    <option value="Hard">Hard</option>
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Faculty Guidance (Optional)</label>
                  <input
                    disabled={aiGenerating}
                    value={aiNotes}
                    onChange={(e) => setAiNotes(e.target.value)}
                    placeholder="e.g. Max array length 3000, O(N^2)"
                    style={inputStyle}
                  />
                </div>
              </div>

              <div>
                <label style={labelStyle}>Generate Starter Code For</label>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {languages.map((l) => {
                    const checked = aiLangs.includes(l.id)
                    return (
                      <label
                        key={l.id}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          fontSize: 12,
                          padding: '5px 10px',
                          borderRadius: 6,
                          border: `1.5px solid ${checked ? T.primary : T.outlineVar}`,
                          background: checked ? T.primaryFix : 'transparent',
                          cursor: aiGenerating ? 'not-allowed' : 'pointer',
                        }}
                      >
                        <input
                          type="checkbox"
                          disabled={aiGenerating}
                          checked={checked}
                          onChange={() => toggleAiLang(l.id)}
                          style={{ margin: 0 }}
                        />
                        {l.label}
                      </label>
                    )
                  })}
                </div>
              </div>

              <label
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 8,
                  fontSize: 12,
                  color: T.txtPri,
                  background: T.bgLow,
                  padding: 10,
                  borderRadius: 8,
                  cursor: aiGenerating ? 'not-allowed' : 'pointer',
                }}
              >
                <input
                  type="checkbox"
                  disabled={aiGenerating}
                  checked={aiValidateSandbox}
                  onChange={(e) => setAiValidateSandbox(e.target.checked)}
                  style={{ marginTop: 2 }}
                />
                <div>
                  <strong>Pre-validate test cases in Piston sandbox</strong>
                  <div style={{ fontSize: 11, color: T.txtMut, marginTop: 2 }}>
                    Executes the AI reference solution against all generated test cases inside the sandbox before returning to guarantee zero erroneous cases.
                  </div>
                </div>
              </label>
            </div>

            {/* Footer */}
            <div
              style={{
                padding: '14px 22px',
                borderTop: `1px solid ${T.border}`,
                display: 'flex',
                justifyContent: 'flex-end',
                alignItems: 'center',
                gap: 10,
                background: T.bgLow,
              }}
            >
              <button
                type="button"
                disabled={aiGenerating}
                onClick={() => setShowAiModal(false)}
                style={{
                  padding: '8px 16px',
                  borderRadius: 8,
                  border: `1px solid ${T.outlineVar}`,
                  background: 'transparent',
                  color: T.txtSec,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: aiGenerating ? 'not-allowed' : 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={aiGenerating}
                onClick={handleAiGenerate}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '9px 20px',
                  borderRadius: 8,
                  border: 'none',
                  background: T.primary,
                  color: '#fff',
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: aiGenerating ? 'not-allowed' : 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                {aiGenerating ? (
                  <>
                    <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} />
                    Generating...
                  </>
                ) : (
                  <>
                    <Sparkles size={15} />
                    Generate
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
