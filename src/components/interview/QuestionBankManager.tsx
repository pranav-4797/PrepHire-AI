// ── Admin / Faculty Interview Question Bank Manager ────────────────────────
import { useEffect, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import {
  Plus,
  Pencil,
  Trash2,
  Search,
  Sparkles,
  Database,
  BookOpen,
  Archive,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Save,
  X,
  Layers,
} from 'lucide-react'
import { T } from '../../theme'
import { BRANCHES } from '../../constants/branches'
import { auth } from '../../firebase/firebase'
import { sanitizeErrorMessage } from '../../utils/errorSanitizer'
import {
  listQuestions,
  createQuestion,
  updateQuestion,
  deleteQuestion,
  seedDefaultBank,
  QUESTION_DOMAINS,
  QUESTION_LEVELS,
  type QuestionRecord,
  type NewQuestionInput,
} from '../../services/questionBank.service'
import type { InterviewDomain, InterviewLevel } from '../../data/questionBank'

interface QuestionBankManagerProps {
  userEmail?: string
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void
}

function GlassCard({ children, style }: { children: ReactNode; style?: CSSProperties }) {
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

const EMPTY_DRAFT: NewQuestionInput = {
  domain: 'technical',
  level: 'Intermediate',
  department: 'All',
  category: '',
  question: '',
  expectedKeywords: [],
  keyConcepts: [],
  followUpProbing: '',
  followUpAdvanced: '',
  sampleStrongAnswer: '',
  active: true,
  source: 'custom',
  companyTrack: '',
}

const inputStyle: CSSProperties = {
  width: '100%',
  padding: '0.55rem 0.7rem',
  borderRadius: 8,
  border: '1px solid #D1D5DB',
  fontSize: '0.875rem',
  color: T.txtPri,
  background: '#ffffff',
  outline: 'none',
  boxSizing: 'border-box',
}

const labelStyle: CSSProperties = {
  display: 'block',
  fontSize: '0.75rem',
  fontWeight: 600,
  color: T.txtSec,
  marginBottom: '0.3rem',
  textTransform: 'uppercase',
  letterSpacing: '0.02em',
}

export function QuestionBankManager({ userEmail, showToast }: QuestionBankManagerProps) {
  const [questions, setQuestions] = useState<QuestionRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [mode, setMode] = useState<'list' | 'editor'>('list')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<NewQuestionInput>(EMPTY_DRAFT)
  const [saving, setSaving] = useState(false)
  const [seeding, setSeeding] = useState(false)

  // Filters
  const [search, setSearch] = useState('')
  const [domainFilter, setDomainFilter] = useState<InterviewDomain | 'all'>('all')
  const [levelFilter, setLevelFilter] = useState<InterviewLevel | 'all'>('all')
  const [branchFilter, setBranchFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'archived'>('all')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  // AI generation
  const [aiOpen, setAiOpen] = useState(false)
  const [aiTopic, setAiTopic] = useState('')
  const [aiCount, setAiCount] = useState(3)
  const [aiDomain, setAiDomain] = useState<InterviewDomain>('technical')
  const [aiLevel, setAiLevel] = useState<InterviewLevel>('Intermediate')
  const [aiBranch, setAiBranch] = useState('All')
  const [generating, setGenerating] = useState(false)

  async function loadData() {
    setLoading(true)
    try {
      const data = await listQuestions({ forceRefresh: true })
      setQuestions(data)
    } catch (err) {
      showToast(sanitizeErrorMessage(err, 'Failed to load the question bank.'), 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function openCreate() {
    setEditingId(null)
    setDraft({ ...EMPTY_DRAFT })
    setMode('editor')
  }

  function openEdit(q: QuestionRecord) {
    setEditingId(q.id)
    setDraft({
      domain: q.domain,
      level: q.level,
      department: q.department ?? 'All',
      category: q.category,
      question: q.question,
      expectedKeywords: q.expectedKeywords ?? [],
      keyConcepts: q.keyConcepts ?? [],
      followUpProbing: q.followUpProbing ?? '',
      followUpAdvanced: q.followUpAdvanced ?? '',
      sampleStrongAnswer: q.sampleStrongAnswer ?? '',
      active: q.active !== false,
      source: q.source ?? 'custom',
      companyTrack: q.companyTrack ?? '',
    })
    setMode('editor')
  }

  async function handleSave() {
    if (!draft.question.trim()) {
      showToast('Question text is required.', 'error')
      return
    }
    if (!draft.category.trim()) {
      showToast('A category helps students and filters — please add one.', 'error')
      return
    }
    setSaving(true)
    try {
      const payload: NewQuestionInput = {
        ...draft,
        question: draft.question.trim(),
        category: draft.category.trim(),
        followUpProbing: draft.followUpProbing?.trim?.(),
        followUpAdvanced: draft.followUpAdvanced?.trim?.(),
      }
      if (editingId) {
        await updateQuestion(editingId, payload)
        showToast('Question updated. It will appear in new interviews immediately.', 'success')
      } else {
        await createQuestion({ ...payload, createdBy: userEmail })
        showToast('Question added to the bank.', 'success')
      }
      setMode('list')
      setEditingId(null)
      await loadData()
    } catch (err) {
      showToast(sanitizeErrorMessage(err, 'Failed to save the question.'), 'error')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(q: QuestionRecord) {
    if (!window.confirm(`Permanently delete this question?\n\n"${q.question.slice(0, 90)}..."`)) return
    try {
      await deleteQuestion(q.id)
      setQuestions((prev) => prev.filter((x) => x.id !== q.id))
      showToast('Question deleted.', 'success')
    } catch (err) {
      showToast(sanitizeErrorMessage(err, 'Failed to delete the question.'), 'error')
    }
  }

  async function handleToggleActive(q: QuestionRecord) {
    const next = q.active === false
    try {
      await updateQuestion(q.id, { active: next })
      setQuestions((prev) => prev.map((x) => (x.id === q.id ? { ...x, active: next } : x)))
      showToast(next ? 'Question restored to the live bank.' : 'Question archived — it will not be asked.', 'info')
    } catch (err) {
      showToast(sanitizeErrorMessage(err, 'Failed to update the question.'), 'error')
    }
  }

  async function handleSeed() {
    if (
      !window.confirm(
        'Copy the curated starter bank into Firestore so faculty can edit it?\n\nQuestions already present are skipped.'
      )
    )
      return
    setSeeding(true)
    try {
      const added = await seedDefaultBank(userEmail)
      showToast(
        added > 0
          ? `Seeded ${added} curated question${added === 1 ? '' : 's'} into the live bank.`
          : 'Starter bank is already fully seeded.',
        'success'
      )
      await loadData()
    } catch (err) {
      showToast(sanitizeErrorMessage(err, 'Failed to seed the starter bank.'), 'error')
    } finally {
      setSeeding(false)
    }
  }

  async function handleGenerate() {
    const topic = aiTopic.trim() || (aiBranch !== 'All' ? aiBranch : 'core placement fundamentals')
    setGenerating(true)
    try {
      const token = await auth.currentUser?.getIdToken()
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (token) headers['Authorization'] = `Bearer ${token}`

      const systemPrompt =
        'You are an expert campus placement interviewer. Return ONLY a JSON array. Each element must have: ' +
        'domain (technical|hr|aptitude|group-discussion), level (Beginner|Intermediate|Advanced), category, ' +
        'question, expectedKeywords (array of 4-8 short lowercase phrases), keyConcepts (array of 3-5 concepts), ' +
        'followUpProbing, followUpAdvanced, sampleStrongAnswer. No markdown fences, no commentary.'

      const prompt =
        `Generate ${aiCount} interview question${aiCount === 1 ? '' : 's'} about "${topic}" for ` +
        `${aiLevel} level, domain "${aiDomain}", department "${aiBranch}". ` +
        `Every question must be distinct, interview-realistic, and answerable in 60-120 seconds.`

      const AI_API_URL = import.meta.env.DEV ? '' : (import.meta.env.VITE_API_URL || '')
      const res = await fetch(`${AI_API_URL}/api/ai/generate`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ prompt, systemPrompt }),
      })
      if (!res.ok) throw new Error(`AI generation failed (HTTP ${res.status})`)

      const data = await res.json()
      const text: string = data.text || ''
      const match = text.match(/\[[\s\S]*\]/)
      if (!match) throw new Error('The AI response did not contain a JSON array.')
      const parsed: unknown = JSON.parse(match[0])
      if (!Array.isArray(parsed) || parsed.length === 0) throw new Error('No questions were generated.')

      let created = 0
      for (const raw of parsed) {
        if (!raw || typeof raw !== 'object') continue
        const r = raw as Record<string, unknown>
        const question = String(r.question ?? '').trim()
        if (!question) continue
        const domain = (['technical', 'hr', 'aptitude', 'group-discussion'] as string[]).includes(
          String(r.domain)
        )
          ? (String(r.domain) as InterviewDomain)
          : aiDomain
        const level = (['Beginner', 'Intermediate', 'Advanced'] as string[]).includes(String(r.level))
          ? (String(r.level) as InterviewLevel)
          : aiLevel
        const branch = (['All', ...BRANCHES] as string[]).includes(String(r.department))
          ? (String(r.department) as NewQuestionInput['department'])
          : (aiBranch as NewQuestionInput['department'])

        await createQuestion({
          domain,
          level,
          department: branch,
          category: String(r.category ?? aiTopic ?? 'General').trim() || 'General',
          question,
          expectedKeywords: Array.isArray(r.expectedKeywords)
            ? r.expectedKeywords.map((k) => String(k).trim().toLowerCase()).filter(Boolean)
            : [],
          keyConcepts: Array.isArray(r.keyConcepts)
            ? r.keyConcepts.map((k) => String(k).trim()).filter(Boolean)
            : [],
          followUpProbing: String(r.followUpProbing ?? '').trim(),
          followUpAdvanced: String(r.followUpAdvanced ?? '').trim(),
          sampleStrongAnswer: String(r.sampleStrongAnswer ?? '').trim(),
          active: true,
          source: 'ai',
          companyTrack: '',
        })
        created++
      }

      if (created === 0) throw new Error('No usable questions were generated.')
      showToast(`AI added ${created} question${created === 1 ? '' : 's'} to the live bank.`, 'success')
      setAiOpen(false)
      setAiTopic('')
      await loadData()
    } catch (err) {
      showToast(
        sanitizeErrorMessage(err, 'AI generation is unavailable right now. Try again or write the question manually.'),
        'error'
      )
    } finally {
      setGenerating(false)
    }
  }

  function updateDraft<K extends keyof NewQuestionInput>(key: K, value: NewQuestionInput[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }))
  }

  const filtered = questions.filter((q) => {
    if (domainFilter !== 'all' && q.domain !== domainFilter) return false
    if (levelFilter !== 'all' && q.level !== levelFilter) return false
    if (branchFilter !== 'all' && q.department !== 'All' && q.department !== branchFilter) return false
    if (statusFilter === 'active' && q.active === false) return false
    if (statusFilter === 'archived' && q.active !== false) return false
    if (search.trim()) {
      const s = search.toLowerCase()
      const haystack = [q.question, q.category, q.companyTrack ?? '', ...(q.expectedKeywords ?? [])]
        .join(' ')
        .toLowerCase()
      if (!haystack.includes(s)) return false
    }
    return true
  })

  const activeCount = questions.filter((q) => q.active !== false).length
  const archivedCount = questions.length - activeCount
  const domainCount = new Set(questions.map((q) => q.domain)).size

  if (mode === 'editor') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.35rem', fontWeight: 700, color: T.txtPri }}>
              {editingId ? 'Edit Interview Question' : 'New Interview Question'}
            </h2>
            <p style={{ margin: '0.25rem 0 0', fontSize: '0.85rem', color: T.txtSec }}>
              Live bank questions feed the AI interview engine's offline repository in real time.
            </p>
          </div>
          <button
            onClick={() => setMode('list')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              background: '#ffffff',
              color: T.txtSec,
              border: '1px solid #D1D5DB',
              borderRadius: 8,
              padding: '0.55rem 0.9rem',
              fontSize: '0.85rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <X size={15} /> Cancel
          </button>
        </div>

        <GlassCard>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
            <div>
              <label style={labelStyle}>Domain</label>
              <select
                value={draft.domain}
                onChange={(e) => updateDraft('domain', e.target.value as InterviewDomain)}
                style={inputStyle}
              >
                {QUESTION_DOMAINS.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Difficulty Level</label>
              <select
                value={draft.level}
                onChange={(e) => updateDraft('level', e.target.value as InterviewLevel)}
                style={inputStyle}
              >
                {QUESTION_LEVELS.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Department</label>
              <select
                value={draft.department ?? 'All'}
                onChange={(e) => updateDraft('department', e.target.value as NewQuestionInput['department'])}
                style={inputStyle}
              >
                <option value="All">All Departments</option>
                {BRANCHES.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Category</label>
              <input
                value={draft.category}
                onChange={(e) => updateDraft('category', e.target.value)}
                placeholder="e.g. Data Structures & Algorithms"
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Company Track (optional)</label>
              <input
                value={draft.companyTrack ?? ''}
                onChange={(e) => updateDraft('companyTrack', e.target.value)}
                placeholder="e.g. TCS NQT"
                style={inputStyle}
              />
            </div>
          </div>

          <div style={{ marginTop: '1rem' }}>
            <label style={labelStyle}>Question</label>
            <textarea
              value={draft.question}
              onChange={(e) => updateDraft('question', e.target.value)}
              rows={3}
              placeholder="Ask a crisp, interview-realistic question…"
              style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.5 }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1rem', marginTop: '1rem' }}>
            <div>
              <label style={labelStyle}>Expected Keywords (comma separated)</label>
              <input
                value={(draft.expectedKeywords ?? []).join(', ')}
                onChange={(e) =>
                  updateDraft(
                    'expectedKeywords',
                    e.target.value.split(',').map((k) => k.trim().toLowerCase()).filter(Boolean)
                  )
                }
                placeholder="hash map, o(1), collision"
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Key Concepts (comma separated)</label>
              <input
                value={(draft.keyConcepts ?? []).join(', ')}
                onChange={(e) =>
                  updateDraft(
                    'keyConcepts',
                    e.target.value.split(',').map((k) => k.trim()).filter(Boolean)
                  )
                }
                placeholder="Time complexity, Load factor"
                style={inputStyle}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1rem', marginTop: '1rem' }}>
            <div>
              <label style={labelStyle}>Probing Follow-up</label>
              <textarea
                value={draft.followUpProbing ?? ''}
                onChange={(e) => updateDraft('followUpProbing', e.target.value)}
                rows={2}
                style={{ ...inputStyle, resize: 'vertical' }}
              />
            </div>
            <div>
              <label style={labelStyle}>Advanced Follow-up</label>
              <textarea
                value={draft.followUpAdvanced ?? ''}
                onChange={(e) => updateDraft('followUpAdvanced', e.target.value)}
                rows={2}
                style={{ ...inputStyle, resize: 'vertical' }}
              />
            </div>
          </div>

          <div style={{ marginTop: '1rem' }}>
            <label style={labelStyle}>Sample Strong Answer (optional)</label>
            <textarea
              value={draft.sampleStrongAnswer ?? ''}
              onChange={(e) => updateDraft('sampleStrongAnswer', e.target.value)}
              rows={3}
              style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.5 }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1.25rem', gap: '1rem', flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', color: T.txtSec, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={draft.active !== false}
                onChange={(e) => updateDraft('active', e.target.checked)}
                style={{ width: 16, height: 16 }}
              />
              Active — include this question in live interviews
            </label>

            <button
              onClick={handleSave}
              disabled={saving}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                background: T.primary,
                color: '#ffffff',
                border: 'none',
                borderRadius: 8,
                padding: '0.65rem 1.35rem',
                fontSize: '0.9rem',
                fontWeight: 600,
                cursor: saving ? 'not-allowed' : 'pointer',
                opacity: saving ? 0.7 : 1,
                boxShadow: '3px 3px 0 #001e40',
              }}
            >
              <Save size={16} />
              {saving ? 'Saving…' : editingId ? 'Save Changes' : 'Add to Bank'}
            </button>
          </div>
        </GlassCard>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.35rem', fontWeight: 700, color: T.txtPri }}>
            Interview Question Bank
          </h2>
          <p style={{ margin: '0.25rem 0 0', fontSize: '0.85rem', color: T.txtSec }}>
            Curate the questions the autonomous interview engine draws from — by branch, domain and level
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
          <button
            onClick={handleSeed}
            disabled={seeding}
            title="Copy the curated static starter bank into Firestore (idempotent)"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              background: '#ffffff',
              color: T.txtSec,
              border: '1px solid #D1D5DB',
              borderRadius: 8,
              padding: '0.6rem 1rem',
              fontSize: '0.85rem',
              fontWeight: 600,
              cursor: seeding ? 'not-allowed' : 'pointer',
            }}
          >
            <Database size={15} /> {seeding ? 'Seeding…' : 'Seed Starter Bank'}
          </button>
          <button
            onClick={() => setAiOpen((v) => !v)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              background: '#F5F3FF',
              color: '#6D28D9',
              border: '1px solid #DDD6FE',
              borderRadius: 8,
              padding: '0.6rem 1rem',
              fontSize: '0.85rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <Sparkles size={15} /> AI Generate
          </button>
          <button
            onClick={openCreate}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              background: T.primary,
              color: '#ffffff',
              border: 'none',
              borderRadius: 8,
              padding: '0.6rem 1.15rem',
              fontSize: '0.85rem',
              fontWeight: 600,
              cursor: 'pointer',
              boxShadow: '3px 3px 0 #001e40',
            }}
          >
            <Plus size={16} /> New Question
          </button>
        </div>
      </div>

      {/* AI panel */}
      {aiOpen && (
        <GlassCard style={{ border: '1px solid #DDD6FE', background: '#FAF9FF' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.9rem' }}>
            <Sparkles size={17} color="#6D28D9" />
            <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#5B21B6' }}>
              AI Question Generation
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '0.85rem' }}>
            <div style={{ gridColumn: 'span 2' }}>
              <label style={labelStyle}>Topic / Focus</label>
              <input
                value={aiTopic}
                onChange={(e) => setAiTopic(e.target.value)}
                placeholder="e.g. Dynamic programming, DBMS normalization"
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Domain</label>
              <select value={aiDomain} onChange={(e) => setAiDomain(e.target.value as InterviewDomain)} style={inputStyle}>
                {QUESTION_DOMAINS.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Level</label>
              <select value={aiLevel} onChange={(e) => setAiLevel(e.target.value as InterviewLevel)} style={inputStyle}>
                {QUESTION_LEVELS.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Department</label>
              <select value={aiBranch} onChange={(e) => setAiBranch(e.target.value)} style={inputStyle}>
                <option value="All">All Departments</option>
                {BRANCHES.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label style={labelStyle}>How many?</label>
              <input
                type="number"
                min={1}
                max={15}
                value={aiCount}
                onChange={(e) => setAiCount(Math.max(1, Math.min(15, Number(e.target.value) || 1)))}
                style={inputStyle}
              />
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.6rem', marginTop: '1rem' }}>
            <button
              onClick={() => setAiOpen(false)}
              style={{
                background: 'transparent',
                color: T.txtSec,
                border: 'none',
                fontSize: '0.85rem',
                fontWeight: 600,
                cursor: 'pointer',
                padding: '0.5rem 0.75rem',
              }}
            >
              Close
            </button>
            <button
              onClick={handleGenerate}
              disabled={generating}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                background: '#6D28D9',
                color: '#ffffff',
                border: 'none',
                borderRadius: 8,
                padding: '0.6rem 1.15rem',
                fontSize: '0.85rem',
                fontWeight: 600,
                cursor: generating ? 'not-allowed' : 'pointer',
                opacity: generating ? 0.7 : 1,
              }}
            >
              <Sparkles size={15} /> {generating ? 'Generating…' : `Generate ${aiCount}`}
            </button>
          </div>
        </GlassCard>
      )}

      {/* KPI metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' }}>
        {[
          { label: 'Live Questions', value: activeCount, icon: <CheckCircle2 size={20} />, color: '#059669', bg: '#ECFDF5' },
          { label: 'Archived', value: archivedCount, icon: <Archive size={20} />, color: '#92400E', bg: '#FEF3C7' },
          { label: 'Domains', value: domainCount, icon: <Layers size={20} />, color: '#2563EB', bg: '#EFF6FF' },
          { label: 'Total', value: questions.length, icon: <BookOpen size={20} />, color: T.primary, bg: '#EEF2FF' },
        ].map((k) => (
          <GlassCard key={k.label} style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
            <div
              style={{
                width: 42,
                height: 42,
                borderRadius: 10,
                background: k.bg,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: k.color,
              }}
            >
              {k.icon}
            </div>
            <div>
              <div style={{ fontSize: '1.4rem', fontWeight: 700, color: T.txtPri }}>{k.value}</div>
              <div style={{ fontSize: '0.8rem', color: T.txtSec, fontWeight: 500 }}>{k.label}</div>
            </div>
          </GlassCard>
        ))}
      </div>

      {/* Filters */}
      <GlassCard style={{ display: 'flex', gap: '0.7rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: '1 1 220px', minWidth: 200 }}>
          <Search size={15} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: T.txtMut }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search questions, categories, keywords…"
            style={{ ...inputStyle, paddingLeft: '2rem' }}
          />
        </div>
        <select value={domainFilter} onChange={(e) => setDomainFilter(e.target.value as InterviewDomain | 'all')} style={{ ...inputStyle, width: 'auto' }}>
          <option value="all">All Domains</option>
          {QUESTION_DOMAINS.map((d) => (
            <option key={d.value} value={d.value}>
              {d.label}
            </option>
          ))}
        </select>
        <select value={levelFilter} onChange={(e) => setLevelFilter(e.target.value as InterviewLevel | 'all')} style={{ ...inputStyle, width: 'auto' }}>
          <option value="all">All Levels</option>
          {QUESTION_LEVELS.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
        <select value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)} style={{ ...inputStyle, width: 'auto' }}>
          <option value="all">All Branches</option>
          {BRANCHES.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as 'all' | 'active' | 'archived')} style={{ ...inputStyle, width: 'auto' }}>
          <option value="all">Any Status</option>
          <option value="active">Active</option>
          <option value="archived">Archived</option>
        </select>
      </GlassCard>

      {/* List */}
      {loading ? (
        <GlassCard style={{ textAlign: 'center', color: T.txtSec, fontSize: '0.9rem' }}>
          Loading question bank…
        </GlassCard>
      ) : filtered.length === 0 ? (
        <GlassCard style={{ textAlign: 'center', padding: '2.5rem 1.25rem' }}>
          <BookOpen size={34} color={T.txtMut} style={{ marginBottom: '0.6rem' }} />
          <div style={{ fontSize: '1rem', fontWeight: 600, color: T.txtPri, marginBottom: '0.3rem' }}>
            {questions.length === 0 ? 'The live bank is empty' : 'No questions match your filters'}
          </div>
          <div style={{ fontSize: '0.85rem', color: T.txtSec, marginBottom: '1rem' }}>
            {questions.length === 0
              ? 'Seed the curated starter bank or add your first question to begin.'
              : 'Try clearing the search or widening the filters.'}
          </div>
          {questions.length === 0 && (
            <button
              onClick={handleSeed}
              disabled={seeding}
              style={{
                background: T.primary,
                color: '#ffffff',
                border: 'none',
                borderRadius: 8,
                padding: '0.6rem 1.15rem',
                fontSize: '0.85rem',
                fontWeight: 600,
                cursor: seeding ? 'not-allowed' : 'pointer',
              }}
            >
              {seeding ? 'Seeding…' : 'Seed Starter Bank'}
            </button>
          )}
        </GlassCard>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {filtered.map((q) => {
            const isArchived = q.active === false
            const expanded = expandedId === q.id
            return (
              <GlassCard
                key={q.id}
                style={{
                  padding: '1rem 1.1rem',
                  opacity: isArchived ? 0.65 : 1,
                  borderLeft: `4px solid ${isArchived ? '#C7C9CE' : T.primary}`,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '0.45rem' }}>
                      <span style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.03em', color: '#6D28D9', background: '#F5F3FF', borderRadius: 5, padding: '0.15rem 0.45rem' }}>
                        {q.domain}
                      </span>
                      <span style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.03em', color: '#1D4ED8', background: '#EFF6FF', borderRadius: 5, padding: '0.15rem 0.45rem' }}>
                        {q.level}
                      </span>
                      {q.department && q.department !== 'All' && (
                        <span style={{ fontSize: '0.68rem', fontWeight: 600, color: T.txtSec, background: '#F2F4F6', borderRadius: 5, padding: '0.15rem 0.45rem' }}>
                          {q.department}
                        </span>
                      )}
                      {q.companyTrack ? (
                        <span style={{ fontSize: '0.68rem', fontWeight: 600, color: '#92400E', background: '#FEF3C7', borderRadius: 5, padding: '0.15rem 0.45rem' }}>
                          {q.companyTrack}
                        </span>
                      ) : null}
                      {isArchived && (
                        <span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#6B7280', background: '#F3F4F6', borderRadius: 5, padding: '0.15rem 0.45rem' }}>
                          ARCHIVED
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: '0.92rem', fontWeight: 600, color: T.txtPri, lineHeight: 1.45 }}>
                      {q.question}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: T.txtMut, marginTop: '0.3rem' }}>
                      {q.category} · {q.source === 'ai' ? 'AI generated' : q.source === 'curated' ? 'Curated' : 'Custom'}
                      {q.expectedKeywords?.length ? ` · ${q.expectedKeywords.length} keywords` : ''}
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '0.35rem', flexShrink: 0 }}>
                    <button
                      onClick={() => setExpandedId(expanded ? null : q.id)}
                      title={expanded ? 'Hide details' : 'Show details'}
                      style={iconBtnStyle}
                    >
                      {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </button>
                    <button onClick={() => openEdit(q)} title="Edit" style={iconBtnStyle}>
                      <Pencil size={15} />
                    </button>
                    <button onClick={() => handleToggleActive(q)} title={isArchived ? 'Restore' : 'Archive'} style={iconBtnStyle}>
                      {isArchived ? <CheckCircle2 size={16} /> : <Archive size={16} />}
                    </button>
                    <button onClick={() => handleDelete(q)} title="Delete permanently" style={{ ...iconBtnStyle, color: T.error }}>
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>

                {expanded && (
                  <div style={{ marginTop: '0.85rem', borderTop: '1px solid #EDEFF2', paddingTop: '0.85rem', display: 'grid', gap: '0.6rem', fontSize: '0.82rem', color: T.txtSec }}>
                    {(q.expectedKeywords?.length ?? 0) > 0 && (
                      <div>
                        <strong style={{ color: T.txtPri }}>Expected keywords:</strong> {q.expectedKeywords.join(', ')}
                      </div>
                    )}
                    {q.keyConcepts?.length > 0 && (
                      <div>
                        <strong style={{ color: T.txtPri }}>Key concepts:</strong> {q.keyConcepts.join(', ')}
                      </div>
                    )}
                    {q.followUpProbing && (
                      <div>
                        <strong style={{ color: T.txtPri }}>Probing follow-up:</strong> {q.followUpProbing}
                      </div>
                    )}
                    {q.followUpAdvanced && (
                      <div>
                        <strong style={{ color: T.txtPri }}>Advanced follow-up:</strong> {q.followUpAdvanced}
                      </div>
                    )}
                    {q.sampleStrongAnswer && (
                      <div>
                        <strong style={{ color: T.txtPri }}>Sample strong answer:</strong> {q.sampleStrongAnswer}
                      </div>
                    )}
                  </div>
                )}
              </GlassCard>
            )
          })}
        </div>
      )}
    </div>
  )
}

const iconBtnStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 32,
  height: 32,
  borderRadius: 7,
  border: '1px solid #E5E7EB',
  background: '#ffffff',
  color: T.txtSec,
  cursor: 'pointer',
}

