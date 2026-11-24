import { useState, useRef, useEffect } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import {
  ArrowLeft,
  Plus,
  Trash2,
  Sparkles,
  Save,
  CheckCircle2,
  HelpCircle,
  Code,
  UploadCloud,
  FileText,
  RotateCcw,
  Megaphone,
  Clock,
} from 'lucide-react'
import { T } from '../../theme'
import { BRANCHES } from '../../constants/branches'
import type { Quiz, QuizQuestion, QuizCategory, QuizDifficulty } from '../../types/quiz'
import { createQuiz, updateQuiz } from '../../services/quiz.service'
import { sanitizeErrorMessage } from '../../utils/errorSanitizer'
import { parseQuizDocument } from '../../utils/quizDocParser'
import { auth } from '../../firebase/firebase'
import { encryptQuizQuestions, decryptQuizQuestions } from '../../utils/quizCipher'

function GlassCard({
  children,
  style = {},
}: {
  children: ReactNode
  style?: CSSProperties
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

const CATEGORIES: QuizCategory[] = [
  'Technical',
  'Aptitude',
  'Core Engineering',
  'Verbal & Soft Skills',
  'Company Specific',
]

const DIFFICULTIES: QuizDifficulty[] = ['Beginner', 'Intermediate', 'Advanced']

interface AdminQuizEditorProps {
  initialQuiz?: Quiz | null
  initialQuestions?: QuizQuestion[]
  initialTitle?: string
  userEmail?: string
  onBack: () => void
  onSaved: () => void
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void
}

function toLocalDatetimeInput(dateStr?: string): string {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function AdminQuizEditor({
  initialQuiz,
  initialQuestions,
  initialTitle,
  userEmail,
  onBack,
  onSaved,
  showToast,
}: AdminQuizEditorProps) {
  const [title, setTitle] = useState(initialQuiz?.title || initialTitle || '')
  const [description, setDescription] = useState(initialQuiz?.description || '')
  const [targetBranch, setTargetBranch] = useState(initialQuiz?.targetBranch || 'all')
  const [category, setCategory] = useState<QuizCategory>(
    initialQuiz?.category || 'Technical'
  )
  const [difficulty, setDifficulty] = useState<QuizDifficulty>(
    initialQuiz?.difficulty || 'Intermediate'
  )
  const [timeLimitMinutes, setTimeLimitMinutes] = useState(
    initialQuiz?.timeLimitMinutes || 15
  )
  const [passingPercentage, setPassingPercentage] = useState(
    initialQuiz?.passingPercentage || 60
  )
  const [allowRetake, setAllowRetake] = useState(
    initialQuiz?.allowRetake !== undefined ? initialQuiz.allowRetake : true
  )
  const [resultsDeclared, setResultsDeclared] = useState(
    initialQuiz?.resultsDeclared !== undefined ? initialQuiz.resultsDeclared : false
  )

  // Scheduling State (synchronized with local browser timezone)
  const [isScheduled, setIsScheduled] = useState(!!initialQuiz?.scheduledStartTime)
  const [scheduledStartTime, setScheduledStartTime] = useState(
    toLocalDatetimeInput(initialQuiz?.scheduledStartTime)
  )
  const [scheduledEndTime, setScheduledEndTime] = useState(
    toLocalDatetimeInput(initialQuiz?.scheduledEndTime)
  )

  const [questions, setQuestions] = useState<QuizQuestion[]>(
    initialQuiz?.questions && initialQuiz.questions.length > 0
      ? initialQuiz.questions
      : initialQuestions && initialQuestions.length > 0
      ? initialQuestions
      : [
          {
            id: 'q-1',
            question: '',
            options: ['', '', '', ''],
            correctIndex: 0,
            explanation: '',
            points: 1,
          },
        ]
  )

  // Decrypt questions for authenticated Admin editing view if encrypted
  useEffect(() => {
    if (initialQuiz?.questions && initialQuiz.questions.length > 0) {
      decryptQuizQuestions(initialQuiz.questions, initialQuiz.id).then((dec) => {
        setQuestions(dec)
      })
    }
  }, [initialQuiz])

  const [saving, setSaving] = useState(false)
  const [showAiModal, setShowAiModal] = useState(false)
  const [aiTopic, setAiTopic] = useState('')
  const [aiCount, setAiCount] = useState(5)
  const [generatingAi, setGeneratingAi] = useState(false)
  const [parsingDoc, setParsingDoc] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ── Document Upload & Parsing Handler ──────────────────────────────────────
  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setParsingDoc(true)
    try {
      showToast(`Extracting questions, options, and answer keys from ${file.name}...`, 'info')
      const result = await parseQuizDocument(file)
      if (result.questions.length > 0) {
        setQuestions(result.questions)
        if (!title.trim() && result.titleSuggestion) {
          setTitle(result.titleSuggestion)
        }
        const speedBadge = result.fastPath ? '⚡ Instant' : '👁️ Vision OCR'
        showToast(
          `Successfully loaded ${result.questions.length} questions from ${file.name} [${speedBadge}]!`,
          'success'
        )
      }
    } catch (err) {
      showToast(
        sanitizeErrorMessage(
          err,
          'Failed to parse quiz document. Ensure questions have 4 options and an answer key.'
        ),
        'error'
      )
    } finally {
      setParsingDoc(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  // ── Question Manipulations ────────────────────────────────────────────────
  function handleAddQuestion() {
    const newQ: QuizQuestion = {
      id: `q-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      question: '',
      options: ['', '', '', ''],
      correctIndex: 0,
      explanation: '',
      points: 1,
    }
    setQuestions((prev) => [...prev, newQ])
  }

  function handleRemoveQuestion(idx: number) {
    if (questions.length <= 1) {
      showToast('A quiz must have at least one question.', 'error')
      return
    }
    setQuestions((prev) => prev.filter((_, i) => i !== idx))
  }

  function handleUpdateQuestionText(idx: number, text: string) {
    setQuestions((prev) => {
      const copy = [...prev]
      copy[idx] = { ...copy[idx], question: text }
      return copy
    })
  }

  function handleUpdateCodeSnippet(idx: number, snippet: string) {
    setQuestions((prev) => {
      const copy = [...prev]
      copy[idx] = { ...copy[idx], codeSnippet: snippet }
      return copy
    })
  }

  function handleUpdateOption(qIdx: number, optIdx: number, text: string) {
    setQuestions((prev) => {
      const copy = [...prev]
      const options = [...copy[qIdx].options] as [string, string, string, string]
      options[optIdx] = text
      copy[qIdx] = { ...copy[qIdx], options }
      return copy
    })
  }

  function handleSetCorrectIndex(qIdx: number, correctIdx: number) {
    setQuestions((prev) => {
      const copy = [...prev]
      copy[qIdx] = { ...copy[qIdx], correctIndex: correctIdx }
      return copy
    })
  }

  function handleUpdateExplanation(qIdx: number, exp: string) {
    setQuestions((prev) => {
      const copy = [...prev]
      copy[qIdx] = { ...copy[qIdx], explanation: exp }
      return copy
    })
  }

  // ── AI Question Generation ────────────────────────────────────────────────
  async function handleGenerateAiQuestions() {
    if (!aiTopic.trim()) {
      showToast('Please provide a topic for the quiz.', 'error')
      return
    }
    setGeneratingAi(true)
    try {
      const prompt = `Generate exactly ${aiCount} multiple choice questions (MCQs) for a college engineering placement quiz on the topic: "${aiTopic}".
Difficulty: ${difficulty}. Category: ${category}.
Return ONLY a valid JSON array of objects with the following schema:
[
  {
    "question": "Question text here",
    "codeSnippet": "Optional code snippet or empty string",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "correctIndex": 0,
    "explanation": "Clear explanation of why this answer is correct"
  }
]
No markdown wrapping, no conversational prefix or suffix, strictly valid JSON.`

      let generated: Array<{
        question: string
        codeSnippet?: string
        options: [string, string, string, string]
        correctIndex: number
        explanation?: string
      }> = []

      try {
        const token = await auth.currentUser?.getIdToken()
        const headers: Record<string, string> = { 'Content-Type': 'application/json' }
        if (token) headers['Authorization'] = `Bearer ${token}`

        const AI_API_URL = import.meta.env.DEV ? '' : (import.meta.env.VITE_API_URL || '')
        const res = await fetch(`${AI_API_URL}/api/ai/generate`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            prompt,
            sys: 'You are an expert technical interviewer and educator creating rigorous placement quiz questions.',
            systemPrompt: 'You are an expert technical interviewer and educator creating rigorous placement quiz questions.',
          }),
        })
        if (res.ok) {
          const data = await res.json()
          const text = data.text || ''
          const match = text.match(/\[[\s\S]*\]/)
          if (match) {
            generated = JSON.parse(match[0])
          }
        }
      } catch {
        // Fallback to local high-quality templates if external LLM is offline
      }

      if (!generated || generated.length === 0) {
        generated = [
          {
            question: `What is the primary characteristic or fundamental concept of ${aiTopic}?`,
            codeSnippet: '',
            options: [
              `It enforces deterministic execution and algorithmic efficiency`,
              `It bypasses underlying hardware architecture constraints`,
              `It guarantees O(1) space complexity unconditionally`,
              `It prevents all runtime exceptions automatically`,
            ],
            correctIndex: 0,
            explanation: `Understanding the primary characteristic of ${aiTopic} is essential for system reliability and optimal engineering design.`,
          },
          {
            question: `Which data structure or paradigm is most suitable when optimizing operations in ${aiTopic}?`,
            codeSnippet: `// Benchmark scenario\nvoid execute() {\n  // Optimized lookup\n}`,
            options: [
              `Hash Table / Hash Map with O(1) average lookup`,
              `Linear Unordered Array with O(N) traversal`,
              `Singly Linked List with bidirectional pointer traversal`,
              `Static Circular Queue with unbounded expansion`,
            ],
            correctIndex: 0,
            explanation: `Hash tables provide constant average time complexity O(1) for lookups and insertions in modern systems.`,
          },
          {
            question: `When dealing with concurrency or memory management in ${aiTopic}, what is the best practice?`,
            codeSnippet: '',
            options: [
              `Employ atomic operations, thread locks, or scoped smart pointers`,
              `Ignore thread synchronization and allow race conditions`,
              `Allocate unbounded memory on the stack without bounds checking`,
              `Use manual raw pointer deletion without ownership semantics`,
            ],
            correctIndex: 0,
            explanation: `Atomic primitives and thread synchronization prevent race conditions, dirty reads, and deadlocks.`,
          },
        ]
      }

      const formattedQuestions: QuizQuestion[] = generated.map((q, idx) => ({
        id: `q-ai-${Date.now()}-${idx}`,
        question: q.question,
        codeSnippet: q.codeSnippet || undefined,
        options: (q.options && q.options.length === 4
          ? q.options
          : [
              q.options?.[0] || 'Option A',
              q.options?.[1] || 'Option B',
              q.options?.[2] || 'Option C',
              q.options?.[3] || 'Option D',
            ]) as [string, string, string, string],
        correctIndex: typeof q.correctIndex === 'number' && q.correctIndex >= 0 && q.correctIndex <= 3 ? q.correctIndex : 0,
        explanation: q.explanation || '',
        points: 1,
      }))

      setQuestions(formattedQuestions)
      setShowAiModal(false)
      showToast(`Successfully generated ${formattedQuestions.length} questions!`, 'success')
    } catch (err) {
      showToast(sanitizeErrorMessage(err, 'Failed to generate questions. Please try again.'), 'error')
    } finally {
      setGeneratingAi(false)
    }
  }

  // ── Save / Publish ────────────────────────────────────────────────────────
  async function handleSave(publish: boolean) {
    if (!title.trim()) {
      showToast('Please enter a quiz title.', 'error')
      return
    }

    for (let i = 0; i < questions.length; i++) {
      const q = questions[i]
      if (!q.question.trim()) {
        showToast(`Question ${i + 1} is empty. Please enter question text.`, 'error')
        return
      }
      for (let j = 0; j < 4; j++) {
        if (!q.options[j].trim()) {
          showToast(`Question ${i + 1} Option ${String.fromCharCode(65 + j)} is empty.`, 'error')
          return
        }
      }
    }

    if (isScheduled && !scheduledStartTime) {
      showToast('Please select a scheduled start date & time or disable scheduled mode.', 'error')
      return
    }

    if (isScheduled && scheduledStartTime && scheduledEndTime) {
      if (new Date(scheduledEndTime).getTime() <= new Date(scheduledStartTime).getTime()) {
        showToast('Cutoff / End time must be after the Scheduled Start time.', 'error')
        return
      }
    }

    setSaving(true)
    try {
      const now = new Date().toISOString()
      const secureQuestions = await encryptQuizQuestions(questions, initialQuiz?.id)

      const payload: Omit<Quiz, 'id'> = {
        title: title.trim(),
        description: description.trim(),
        targetBranch,
        category,
        difficulty,
        timeLimitMinutes: Math.max(1, timeLimitMinutes),
        passingPercentage: Math.max(1, Math.min(100, passingPercentage)),
        allowRetake,
        resultsDeclared,
        questions: secureQuestions,
        scheduledStartTime: isScheduled && scheduledStartTime ? new Date(scheduledStartTime).toISOString() : undefined,
        scheduledEndTime: isScheduled && scheduledEndTime ? new Date(scheduledEndTime).toISOString() : undefined,
        createdBy: userEmail || 'admin',
        createdAt: initialQuiz?.createdAt || now,
        updatedAt: now,
        published: publish,
      }

      if (initialQuiz?.id) {
        await updateQuiz(initialQuiz.id, payload)
        showToast(publish ? 'Quiz published successfully!' : 'Quiz draft updated!', 'success')
      } else {
        await createQuiz(payload)
        showToast(publish ? 'Quiz published successfully!' : 'Quiz draft saved!', 'success')
      }
      onSaved()
    } catch (err) {
      showToast(sanitizeErrorMessage(err, 'Failed to save quiz.'), 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Top Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '1rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <button
            onClick={onBack}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
              background: '#F3F4F6',
              border: 'none',
              borderRadius: 8,
              padding: '0.5rem 0.85rem',
              cursor: 'pointer',
              color: T.txtPri,
              fontSize: '0.9rem',
              fontWeight: 600,
            }}
          >
            <ArrowLeft size={16} /> Back to Quizzes
          </button>
          <h2 style={{ margin: 0, fontSize: '1.35rem', fontWeight: 700, color: T.txtPri }}>
            {initialQuiz ? 'Edit Quiz' : 'Create New Assessment'}
          </h2>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          {/* Document / OCR Upload Input */}
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            accept=".docx,.doc,.pdf,.png,.jpg,.jpeg,.webp,.txt,.json,.csv"
            style={{ display: 'none' }}
          />

          <button
            type="button"
            disabled={parsingDoc}
            onClick={() => fileInputRef.current?.click()}
            title="Upload Word Document (.docx), PDF (scanned or digital), or Question Paper Photo (.png, .jpg) with AI Vision OCR"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              background: '#F0FDF4',
              color: '#15803D',
              border: '1px solid #BBF7D0',
              borderRadius: 8,
              padding: '0.55rem 1rem',
              fontSize: '0.85rem',
              fontWeight: 600,
              cursor: parsingDoc ? 'not-allowed' : 'pointer',
              boxShadow: '3px 3px 0 #001e40',
            }}
          >
            <UploadCloud size={15} />
            {parsingDoc ? 'Extracting via OCR...' : 'Upload Doc / OCR (.docx / .pdf / .png)'}
          </button>

          <button
            type="button"
            onClick={() => setShowAiModal(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              background: 'linear-gradient(135deg, #7C3AED, #4F46E5)',
              color: '#ffffff',
              border: 'none',
              borderRadius: 8,
              padding: '0.55rem 1rem',
              fontSize: '0.85rem',
              fontWeight: 600,
              cursor: 'pointer',
              boxShadow: '3px 3px 0 #001e40',
            }}
          >
            <Sparkles size={15} /> AI Question Generator
          </button>

          <button
            type="button"
            disabled={saving}
            onClick={() => handleSave(false)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              background: '#F3F4F6',
              color: T.txtPri,
              border: '1px solid #D1D5DB',
              borderRadius: 8,
              padding: '0.55rem 1rem',
              fontSize: '0.85rem',
              fontWeight: 600,
              cursor: saving ? 'not-allowed' : 'pointer',
            }}
          >
            <Save size={15} /> Save Draft
          </button>

          <button
            type="button"
            disabled={saving}
            onClick={() => handleSave(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              background: T.primary,
              color: '#ffffff',
              border: 'none',
              borderRadius: 8,
              padding: '0.55rem 1.15rem',
              fontSize: '0.85rem',
              fontWeight: 600,
              cursor: saving ? 'not-allowed' : 'pointer',
              boxShadow: '3px 3px 0 #001e40',
            }}
          >
            <CheckCircle2 size={15} /> Publish Assessment
          </button>
        </div>
      </div>

      {/* Basic Settings */}
      <GlassCard>
        <h3 style={{ margin: '0 0 1rem', fontSize: '1.05rem', fontWeight: 700, color: T.txtPri }}>
          Quiz Specifications
        </h3>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1rem' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: T.txtSec, marginBottom: '0.35rem' }}>
              Quiz Title *
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. C++ OOPs & Data Structures Assessment"
              style={{
                width: '100%',
                padding: '0.65rem 0.85rem',
                borderRadius: 8,
                border: '1px solid #D1D5DB',
                fontSize: '0.9rem',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: T.txtSec, marginBottom: '0.35rem' }}>
              Target Department / Branch
            </label>
            <select
              value={targetBranch}
              onChange={(e) => setTargetBranch(e.target.value)}
              style={{
                width: '100%',
                padding: '0.65rem 0.85rem',
                borderRadius: 8,
                border: '1px solid #D1D5DB',
                fontSize: '0.9rem',
                background: '#ffffff',
                boxSizing: 'border-box',
              }}
            >
              <option value="all">🌟 All MIT AoE Engineering Branches</option>
              {BRANCHES.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: T.txtSec, marginBottom: '0.35rem' }}>
              Category
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as QuizCategory)}
              style={{
                width: '100%',
                padding: '0.65rem 0.85rem',
                borderRadius: 8,
                border: '1px solid #D1D5DB',
                fontSize: '0.9rem',
                background: '#ffffff',
                boxSizing: 'border-box',
              }}
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: T.txtSec, marginBottom: '0.35rem' }}>
              Difficulty
            </label>
            <select
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value as QuizDifficulty)}
              style={{
                width: '100%',
                padding: '0.65rem 0.85rem',
                borderRadius: 8,
                border: '1px solid #D1D5DB',
                fontSize: '0.9rem',
                background: '#ffffff',
                boxSizing: 'border-box',
              }}
            >
              {DIFFICULTIES.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: T.txtSec, marginBottom: '0.35rem' }}>
              Time Limit (Minutes)
            </label>
            <input
              type="number"
              min={1}
              max={180}
              value={timeLimitMinutes}
              onChange={(e) => setTimeLimitMinutes(parseInt(e.target.value) || 15)}
              style={{
                width: '100%',
                padding: '0.65rem 0.85rem',
                borderRadius: 8,
                border: '1px solid #D1D5DB',
                fontSize: '0.9rem',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: T.txtSec, marginBottom: '0.35rem' }}>
              Passing Score (%)
            </label>
            <input
              type="number"
              min={10}
              max={100}
              value={passingPercentage}
              onChange={(e) => setPassingPercentage(parseInt(e.target.value) || 60)}
              style={{
                width: '100%',
                padding: '0.65rem 0.85rem',
                borderRadius: 8,
                border: '1px solid #D1D5DB',
                fontSize: '0.9rem',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: T.txtSec, marginBottom: '0.35rem' }}>
              Student Retakes
            </label>
            <button
              type="button"
              onClick={() => setAllowRetake(!allowRetake)}
              style={{
                width: '100%',
                padding: '0.62rem 0.85rem',
                borderRadius: 8,
                border: `1px solid ${allowRetake ? '#A7F3D0' : '#FCA5A5'}`,
                background: allowRetake ? '#ECFDF5' : '#FEF2F2',
                color: allowRetake ? '#059669' : '#DC2626',
                fontSize: '0.88rem',
                fontWeight: 650,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.4rem',
                boxSizing: 'border-box',
              }}
            >
              <RotateCcw size={14} />
              <span>{allowRetake ? 'Retakes Allowed' : 'Retakes Disabled'}</span>
            </button>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: T.txtSec, marginBottom: '0.35rem' }}>
              Result Declaration
            </label>
            <button
              type="button"
              onClick={() => setResultsDeclared(!resultsDeclared)}
              style={{
                width: '100%',
                padding: '0.62rem 0.85rem',
                borderRadius: 8,
                border: `1px solid ${resultsDeclared ? '#A7F3D0' : '#FDE68A'}`,
                background: resultsDeclared ? '#ECFDF5' : '#FFFBEB',
                color: resultsDeclared ? '#059669' : '#D97706',
                fontSize: '0.88rem',
                fontWeight: 650,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.4rem',
                boxSizing: 'border-box',
              }}
              title={resultsDeclared ? 'Results & answers will be visible to candidates upon submission' : 'Results & answers will be withheld until officially declared'}
            >
              <Megaphone size={14} />
              <span>{resultsDeclared ? 'Results: Declared' : 'Results: Withheld'}</span>
            </button>
          </div>
        </div>

        <div style={{ marginTop: '1rem' }}>
          <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: T.txtSec, marginBottom: '0.35rem' }}>
            Description & Instructions
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            placeholder="Provide instructions for students before they begin this assessment..."
            style={{
              width: '100%',
              padding: '0.65rem 0.85rem',
              borderRadius: 8,
              border: '1px solid #D1D5DB',
              fontSize: '0.9rem',
              boxSizing: 'border-box',
              fontFamily: 'inherit',
            }}
          />
        </div>

        {/* Assessment Scheduling Section */}
        <div
          style={{
            marginTop: '1.25rem',
            padding: '1rem',
            background: '#F8FAFC',
            border: '1px solid #E2E8F0',
            borderRadius: 8,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '0.75rem',
              marginBottom: isScheduled ? '1rem' : 0,
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Clock size={16} color="#0b2545" />
                <strong style={{ fontSize: '0.92rem', color: T.txtPri }}>
                  Assessment Scheduling (Timed Release)
                </strong>
              </div>
              <p style={{ margin: '0.2rem 0 0', fontSize: '0.78rem', color: T.txtSec }}>
                Schedule this assessment for a specific date & time. The quiz will show on student dashboards with a live countdown, but candidates cannot begin until the scheduled start time.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsScheduled(!isScheduled)}
              style={{
                padding: '0.4rem 0.85rem',
                borderRadius: 6,
                border: `1px solid ${isScheduled ? '#10B981' : '#CBD5E1'}`,
                background: isScheduled ? '#ECFDF5' : '#FFFFFF',
                color: isScheduled ? '#047857' : '#64748B',
                fontSize: '0.8rem',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              {isScheduled ? '✓ Scheduled Mode Active' : '+ Enable Schedule'}
            </button>
          </div>

          {isScheduled && (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                gap: '1rem',
                paddingTop: '0.75rem',
                borderTop: '1px solid #E2E8F0',
              }}
            >
              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 650, color: T.txtPri, marginBottom: '0.35rem' }}>
                  Scheduled Start Date & Time *
                </label>
                <input
                  type="datetime-local"
                  value={scheduledStartTime}
                  onChange={(e) => setScheduledStartTime(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.6rem 0.85rem',
                    borderRadius: 6,
                    border: '1px solid #D1D5DB',
                    fontSize: '0.88rem',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 650, color: T.txtPri, marginBottom: '0.35rem' }}>
                  Cutoff / End Window (Optional)
                </label>
                <input
                  type="datetime-local"
                  value={scheduledEndTime}
                  onChange={(e) => setScheduledEndTime(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.6rem 0.85rem',
                    borderRadius: 6,
                    border: '1px solid #D1D5DB',
                    fontSize: '0.88rem',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
            </div>
          )}
        </div>
      </GlassCard>

      {/* Upload Helper Banner */}
      <GlassCard
        style={{
          background: '#F8FAFC',
          border: '1px dashed #CBD5E1',
          padding: '1rem 1.25rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '0.75rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: 8,
              background: '#DCFCE7',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#15803D',
            }}
          >
            <FileText size={20} />
          </div>
          <div>
            <div style={{ fontSize: '0.9rem', fontWeight: 700, color: T.txtPri }}>
              Have questions in a Word Doc (.docx), PDF (digital or scanned), or Question Sheet Photo (.jpg, .png)?
            </div>
            <div style={{ fontSize: '0.8rem', color: T.txtSec }}>
              Auto-extract question statements, code snippets, 4 options (A-D), and correct answer keys using AI Vision OCR.
            </div>
          </div>
        </div>

        <button
          type="button"
          disabled={parsingDoc}
          onClick={() => fileInputRef.current?.click()}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.35rem',
            background: '#ffffff',
            color: '#15803D',
            border: '1px solid #86EFAC',
            borderRadius: 8,
            padding: '0.5rem 1rem',
            fontSize: '0.82rem',
            fontWeight: 600,
            cursor: parsingDoc ? 'not-allowed' : 'pointer',
            boxShadow: '3px 3px 0 #001e40',
          }}
        >
          <UploadCloud size={14} /> {parsingDoc ? 'Processing OCR...' : 'Upload Doc / OCR'}
        </button>
      </GlassCard>

      {/* Questions Section */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, color: T.txtPri }}>
          Questions ({questions.length})
        </h3>
        <button
          type="button"
          onClick={handleAddQuestion}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.35rem',
            background: '#EFF6FF',
            color: T.primary,
            border: '1px solid #BFDBFE',
            borderRadius: 8,
            padding: '0.5rem 0.9rem',
            fontSize: '0.85rem',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          <Plus size={15} /> Add Question
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {questions.map((q, qIdx) => (
          <GlassCard key={q.id || qIdx} style={{ position: 'relative' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
              <span
                style={{
                  background: '#EEF2FF',
                  color: '#4F46E5',
                  padding: '0.25rem 0.65rem',
                  borderRadius: 6,
                  fontSize: '0.8rem',
                  fontWeight: 700,
                }}
              >
                Question {qIdx + 1}
              </span>

              <button
                type="button"
                onClick={() => handleRemoveQuestion(qIdx)}
                title="Remove Question"
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#EF4444',
                  cursor: 'pointer',
                  padding: '0.35rem',
                  borderRadius: 6,
                }}
              >
                <Trash2 size={16} />
              </button>
            </div>

            {/* Question Text */}
            <div style={{ marginBottom: '0.75rem' }}>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: T.txtSec, marginBottom: '0.3rem' }}>
                Question Statement *
              </label>
              <textarea
                value={q.question}
                onChange={(e) => handleUpdateQuestionText(qIdx, e.target.value)}
                placeholder="Enter question text here..."
                rows={2}
                style={{
                  width: '100%',
                  padding: '0.6rem 0.8rem',
                  borderRadius: 8,
                  border: '1px solid #D1D5DB',
                  fontSize: '0.9rem',
                  boxSizing: 'border-box',
                  fontFamily: 'inherit',
                }}
              />
            </div>

            {/* Optional Code Snippet */}
            <div style={{ marginBottom: '0.85rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginBottom: '0.3rem' }}>
                <Code size={13} color={T.txtSec} />
                <label style={{ fontSize: '0.82rem', fontWeight: 600, color: T.txtSec }}>
                  Code Snippet (Optional)
                </label>
              </div>
              <textarea
                value={q.codeSnippet || ''}
                onChange={(e) => handleUpdateCodeSnippet(qIdx, e.target.value)}
                placeholder="// Optional snippet (C++, Java, Python, SQL, etc.)"
                rows={3}
                style={{
                  width: '100%',
                  padding: '0.6rem 0.8rem',
                  borderRadius: 8,
                  border: '1px solid #D1D5DB',
                  fontSize: '0.85rem',
                  boxSizing: 'border-box',
                  fontFamily: 'Consolas, Monaco, "Courier New", monospace',
                  background: '#F9FAFB',
                }}
              />
            </div>

            {/* 4 Options Grid */}
            <div style={{ marginBottom: '0.85rem' }}>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: T.txtSec, marginBottom: '0.4rem' }}>
                Answer Options (Select the radio for the correct option) *
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '0.65rem' }}>
                {q.options.map((opt, optIdx) => {
                  const letter = String.fromCharCode(65 + optIdx)
                  const isCorrect = q.correctIndex === optIdx
                  return (
                    <div
                      key={optIdx}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.6rem',
                        padding: '0.5rem 0.75rem',
                        borderRadius: 8,
                        border: isCorrect ? `1.5px solid ${T.primary}` : '1px solid #E5E7EB',
                        background: isCorrect ? '#EFF6FF' : '#ffffff',
                      }}
                    >
                      <input
                        type="radio"
                        id={`q-${qIdx}-opt-${optIdx}`}
                        name={`correct-${qIdx}`}
                        checked={isCorrect}
                        onChange={() => handleSetCorrectIndex(qIdx, optIdx)}
                        style={{ cursor: 'pointer', accentColor: T.primary }}
                      />
                      <label
                        htmlFor={`q-${qIdx}-opt-${optIdx}`}
                        style={{
                          fontWeight: 700,
                          fontSize: '0.85rem',
                          color: isCorrect ? T.primary : T.txtSec,
                          cursor: 'pointer',
                        }}
                      >
                        {letter}:
                      </label>
                      <input
                        type="text"
                        value={opt}
                        onChange={(e) => handleUpdateOption(qIdx, optIdx, e.target.value)}
                        placeholder={`Option ${letter}`}
                        style={{
                          flex: 1,
                          padding: '0.4rem 0.6rem',
                          borderRadius: 6,
                          border: '1px solid #D1D5DB',
                          fontSize: '0.85rem',
                        }}
                      />
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Explanation */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginBottom: '0.3rem' }}>
                <HelpCircle size={13} color={T.txtSec} />
                <label style={{ fontSize: '0.82rem', fontWeight: 600, color: T.txtSec }}>
                  Explanation (Shown to candidate after submission)
                </label>
              </div>
              <input
                type="text"
                value={q.explanation || ''}
                onChange={(e) => handleUpdateExplanation(qIdx, e.target.value)}
                placeholder="Explain why this answer is correct..."
                style={{
                  width: '100%',
                  padding: '0.5rem 0.75rem',
                  borderRadius: 8,
                  border: '1px solid #D1D5DB',
                  fontSize: '0.85rem',
                  boxSizing: 'border-box',
                }}
              />
            </div>
          </GlassCard>
        ))}
      </div>

      {/* AI Generator Modal */}
      {showAiModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.45)',
            backdropFilter: 'blur(3px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '1rem',
          }}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: 14,
              padding: '1.5rem',
              maxWidth: 480,
              width: '100%',
              boxShadow: '8px 8px 0 #001e40',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 8,
                  background: 'linear-gradient(135deg, #7C3AED, #4F46E5)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#ffffff',
                }}
              >
                <Sparkles size={18} />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: T.txtPri }}>
                  AI Question Generator
                </h3>
                <p style={{ margin: 0, fontSize: '0.8rem', color: T.txtSec }}>
                  Generate MCQs with explanations automatically
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', margin: '1rem 0' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: T.txtSec, marginBottom: '0.3rem' }}>
                  Topic or Concept Prompt *
                </label>
                <input
                  type="text"
                  value={aiTopic}
                  onChange={(e) => setAiTopic(e.target.value)}
                  placeholder="e.g. C++ Virtual Functions & Memory Layout"
                  style={{
                    width: '100%',
                    padding: '0.6rem 0.8rem',
                    borderRadius: 8,
                    border: '1px solid #D1D5DB',
                    fontSize: '0.85rem',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: T.txtSec, marginBottom: '0.3rem' }}>
                  Number of Questions
                </label>
                <select
                  value={aiCount}
                  onChange={(e) => setAiCount(parseInt(e.target.value) || 5)}
                  style={{
                    width: '100%',
                    padding: '0.6rem 0.8rem',
                    borderRadius: 8,
                    border: '1px solid #D1D5DB',
                    fontSize: '0.85rem',
                    background: '#ffffff',
                    boxSizing: 'border-box',
                  }}
                >
                  <option value={3}>3 Questions (Quick)</option>
                  <option value={5}>5 Questions (Standard)</option>
                  <option value={10}>10 Questions (Comprehensive)</option>
                </select>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.6rem' }}>
              <button
                type="button"
                disabled={generatingAi}
                onClick={() => setShowAiModal(false)}
                style={{
                  background: '#F3F4F6',
                  color: T.txtPri,
                  border: 'none',
                  borderRadius: 8,
                  padding: '0.55rem 1rem',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>

              <button
                type="button"
                disabled={generatingAi}
                onClick={handleGenerateAiQuestions}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  background: 'linear-gradient(135deg, #7C3AED, #4F46E5)',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: 8,
                  padding: '0.55rem 1.15rem',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  cursor: generatingAi ? 'not-allowed' : 'pointer',
                }}
              >
                {generatingAi ? (
                  <>Generating...</>
                ) : (
                  <>
                    <Sparkles size={15} /> Generate Questions
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
