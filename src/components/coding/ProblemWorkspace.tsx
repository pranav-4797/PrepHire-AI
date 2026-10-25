import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode, CSSProperties } from 'react'
import {
  ArrowLeft, Play, Send, Clock, Cpu, Loader2, CheckCircle2, XCircle, History, Sparkles,
  RotateCcw, Copy, Check, Keyboard, HardDrive, Code2,
} from 'lucide-react'
import { T } from '../../theme'
import { DifficultyBadge, VerdictBadge } from './Badges'
import { CodeEditor } from './CodeEditor'
import {
  getProblem, runCode, submitCodeStreaming, listSubmissions,
  loadAutosavedCode, saveAutosavedCode, getCodeReview,
} from '../../services/coding.service'
import type { Problem, RunResult, Submission, LanguageOption, CodeReview, JudgeProgressEvent } from '../../services/coding.service'
import { sanitizeErrorMessage } from '../../utils/errorSanitizer'
import { cleanCppCode, COMPETITIVE_STARTER_TEMPLATES } from '../../utils/codeSanitizer'
import { ErrorAlert } from '../common/ErrorAlert'

function Btn({
  children, onClick, disabled, variant = 'outline', style = {}, title,
}: {
  children: ReactNode
  onClick?: () => void
  disabled?: boolean
  variant?: 'primary' | 'navy' | 'outline' | 'ghost'
  style?: CSSProperties
  title?: string
}) {
  let bg = 'transparent', color = T.primary, border = `1px solid ${T.outlineVar}`
  if (disabled) {
    bg = T.bgMid; color = T.txtMut; border = 'none'
  } else if (variant === 'primary') {
    bg = T.gold; color = T.onGold; border = 'none'
  } else if (variant === 'navy') {
    bg = T.primary; color = '#fff'; border = 'none'
  } else if (variant === 'ghost') {
    bg = T.bgLow; color = T.primary; border = `1px solid ${T.outlineVar}`
  }
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        padding: '9px 18px',
        fontSize: 13,
        fontWeight: 700,
        borderRadius: 10,
        border,
        background: bg,
        color,
        cursor: disabled ? 'not-allowed' : 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        fontFamily: 'inherit',
        whiteSpace: 'nowrap',
        transition: 'opacity 0.15s',
        ...style,
      }}
    >
      {children}
    </button>
  )
}

// ── Copy-to-clipboard button ─────────────────────────────────────────────
function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }, [text])
  return (
    <button
      onClick={handleCopy}
      title="Copy to clipboard"
      style={{
        background: 'none', border: 'none', cursor: 'pointer', padding: 2,
        color: copied ? T.green : T.txtMut, display: 'inline-flex', alignItems: 'center',
        transition: 'color 0.2s',
      }}
    >
      {copied ? <Check size={12} /> : <Copy size={12} />}
    </button>
  )
}

// ── Relative time helper ─────────────────────────────────────────────────
function relativeTime(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days === 1) return 'yesterday'
  if (days < 30) return `${days}d ago`
  return new Date(isoDate).toLocaleDateString()
}

// ── Judge Progress Bar (Codeforces-style "Running on test X") ────────────
function JudgeProgressBar({ events, total }: { events: JudgeProgressEvent[]; total: number }) {
  const lastEvent = events[events.length - 1]
  const isCompiling = lastEvent?.type === 'compiling'
  const testEvents = events.filter(e => e.type === 'test')
  const completedTests = testEvents.length

  return (
    <div style={{ background: T.bgWhite, border: `1px solid ${T.border}`, borderRadius: 12, padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <Loader2 size={16} style={{ animation: 'spin 1s linear infinite', color: T.primary }} />
        <span style={{ fontSize: 13, fontWeight: 700, color: T.primary }}>
          {isCompiling ? 'Compiling…' : `Running on test ${completedTests + 1} of ${total}…`}
        </span>
      </div>

      {/* Progress bar */}
      <div style={{ display: 'flex', gap: 3, marginBottom: 8 }}>
        {Array.from({ length: total }, (_, i) => {
          const testEvent = testEvents[i]
          let bg = T.bgMid // pending
          let borderColor = T.border
          if (testEvent) {
            bg = testEvent.passed ? '#dcfce7' : '#ffdad6'
            borderColor = testEvent.passed ? '#16a34a' : '#dc2626'
          } else if (i === completedTests && !isCompiling) {
            bg = '#dbeafe'
            borderColor = '#3b82f6'
          }
          return (
            <div
              key={i}
              style={{
                flex: 1,
                height: 6,
                borderRadius: 3,
                background: bg,
                border: `1px solid ${borderColor}`,
                transition: 'background 0.3s, border-color 0.3s',
              }}
            />
          )
        })}
      </div>

      {/* Per-test dots */}
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {testEvents.map((e, i) => (
          <span
            key={i}
            title={`Test ${i + 1}: ${e.verdict} (${e.timeMs}ms${e.memoryKb ? `, ${(e.memoryKb! / 1024).toFixed(1)}MB` : ''})`}
            style={{
              width: 18, height: 18, borderRadius: '50%', display: 'inline-flex',
              alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700,
              background: e.passed ? '#dcfce7' : '#ffdad6',
              color: e.passed ? '#16a34a' : '#dc2626',
              border: `1.5px solid ${e.passed ? '#16a34a' : '#dc2626'}`,
            }}
          >
            {e.passed ? '✓' : '✗'}
          </span>
        ))}
      </div>
    </div>
  )
}

export function ProblemWorkspace({
  problemId,
  userEmail,
  userName,
  languages,
  onBack,
  onSolved,
  showToast,
}: {
  problemId: string
  userEmail: string
  userName: string
  languages: LanguageOption[]
  onBack: () => void
  onSolved?: (problemId: string) => void
  showToast?: (msg: string, type?: 'success' | 'error' | 'info') => void
}) {
  const [problem, setProblem] = useState<Problem | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [tab, setTab] = useState<'description' | 'submissions'>('description')
  const [language, setLanguage] = useState<string>('')
  const [code, setCode] = useState('')
  const [running, setRunning] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [runResult, setRunResult] = useState<RunResult | null>(null)
  const [submitResult, setSubmitResult] = useState<Submission | null>(null)
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [loadingSubmissions, setLoadingSubmissions] = useState(false)
  const [review, setReview] = useState<CodeReview | null>(null)
  const [reviewLoading, setReviewLoading] = useState(false)
  const [reviewError, setReviewError] = useState('')
  const [useCustomInput, setUseCustomInput] = useState(false)
  const [customInput, setCustomInput] = useState('')
  const [showResetConfirm, setShowResetConfirm] = useState(false)
  const [judgeProgress, setJudgeProgress] = useState<JudgeProgressEvent[]>([])
  const [judgeTotal, setJudgeTotal] = useState(0)
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const workspaceRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    getProblem(problemId)
      .then((p) => {
        if (cancelled) return
        setProblem(p)
        const defaultLang = p.languages[0] || 'javascript'
        setLanguage(defaultLang)
        const saved = loadAutosavedCode(userEmail, problemId, defaultLang)
        let initialCode = saved ?? p.starterCode?.[defaultLang] ?? COMPETITIVE_STARTER_TEMPLATES[defaultLang] ?? ''
        if (defaultLang === 'cpp') {
          initialCode = cleanCppCode(initialCode)
        }
        setCode(initialCode)
      })
      .catch((err) => !cancelled && setError(sanitizeErrorMessage(err, 'Failed to load problem statement.')))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [problemId])

  // ── Keyboard Shortcuts ──────────────────────────────────────────────────
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault()
        if (e.shiftKey) {
          // Ctrl+Shift+Enter → Submit
          if (!submitting && !running) handleSubmit()
        } else {
          // Ctrl+Enter → Run
          if (!running && !submitting) handleRun()
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, language, running, submitting, problem, useCustomInput, customInput])

  function switchLanguage(nextLang: string) {
    if (!problem) return
    setLanguage(nextLang)
    const saved = loadAutosavedCode(userEmail, problemId, nextLang)
    let nextCode = saved ?? problem.starterCode?.[nextLang] ?? COMPETITIVE_STARTER_TEMPLATES[nextLang] ?? ''
    if (nextLang === 'cpp') {
      nextCode = cleanCppCode(nextCode)
    }
    setCode(nextCode)
    setRunResult(null)
    setSubmitResult(null)
    setReview(null)
    setReviewError('')
    setJudgeProgress([])
  }

  function handleCodeChange(next: string) {
    setCode(next)
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current)
    autosaveTimer.current = setTimeout(() => {
      saveAutosavedCode(userEmail, problemId, language, next)
    }, 600)
  }

  function handleResetToStarter() {
    if (!problem) return
    let starter = problem.starterCode?.[language] ?? COMPETITIVE_STARTER_TEMPLATES[language] ?? ''
    if (language === 'cpp') {
      starter = cleanCppCode(starter)
    }
    setCode(starter)
    saveAutosavedCode(userEmail, problemId, language, starter)
    setShowResetConfirm(false)
    setRunResult(null)
    setSubmitResult(null)
    setReview(null)
    setReviewError('')
    showToast?.('Code reset to problem starter skeleton', 'info')
  }

  function handleResetToCleanTemplate() {
    const clean = COMPETITIVE_STARTER_TEMPLATES[language] || ''
    setCode(clean)
    saveAutosavedCode(userEmail, problemId, language, clean)
    setShowResetConfirm(false)
    setRunResult(null)
    setSubmitResult(null)
    setReview(null)
    setReviewError('')
    showToast?.('Code reset to clean competitive template (solve from scratch)', 'info')
  }

  async function loadSubmissions() {
    setLoadingSubmissions(true)
    try {
      const list = await listSubmissions(problemId)
      setSubmissions(list)
    } catch {
      /* non-fatal */
    } finally {
      setLoadingSubmissions(false)
    }
  }

  useEffect(() => {
    if (tab === 'submissions') loadSubmissions()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab])

  async function handleRun() {
    setRunning(true)
    setSubmitResult(null)
    setReview(null)
    setReviewError('')
    setJudgeProgress([])
    try {
      const result = await runCode(problemId, code, language, useCustomInput ? customInput : undefined)
      setRunResult(result)
    } catch (err) {
      setRunResult({
        verdict: 'Runtime Error',
        passedCount: 0,
        totalCount: 0,
        runtimeMs: 0,
        memoryKb: 0,
        testResults: [{ passed: false, stderr: (err as Error).message, hidden: false }],
      })
    } finally {
      setRunning(false)
    }
  }

  async function handleSubmit() {
    if (!problem) return
    setSubmitting(true)
    setRunResult(null)
    setReview(null)
    setReviewError('')
    setJudgeProgress([])

    // Calculate total tests for progress bar
    const sampleCount = problem.sampleTests?.length || 0
    const hiddenCount = problem.hiddenTestCount || (problem.hiddenTests?.length || 0)
    setJudgeTotal(sampleCount + hiddenCount)

    try {
      const result = await submitCodeStreaming(
        problemId,
        code,
        language,
        userName,
        (event) => {
          setJudgeProgress(prev => [...prev, event])
        },
      )
      setSubmitResult(result)
      setJudgeProgress([]) // Clear progress once complete
      if (result.verdict === 'Accepted') onSolved?.(problemId)
      if (tab === 'submissions') loadSubmissions()
    } catch (err) {
      setJudgeProgress([])
      setSubmitResult({
        id: 'error',
        problemId,
        problemTitle: problem?.title || '',
        userEmail,
        userName,
        language,
        type: 'submit',
        verdict: 'Runtime Error',
        passedCount: 0,
        totalCount: 0,
        runtimeMs: 0,
        memoryKb: 0,
        submittedAt: new Date().toISOString(),
        testResults: [{ passed: false, stderr: (err as Error).message, hidden: false }],
      })
    } finally {
      setSubmitting(false)
    }
  }

  const languageLabel = useMemo(
    () => languages.find((l) => l.id === language)?.label || language,
    [languages, language],
  )

  if (loading) {
    return <div style={{ textAlign: 'center', padding: 60, color: T.txtMut }}>Loading problem…</div>
  }
  if (error || !problem) {
    return (
      <div style={{ maxWidth: 600, margin: '60px auto', padding: '0 20px' }}>
        <ErrorAlert
          message={error || 'The requested coding problem could not be found.'}
          style={{ marginBottom: 16 }}
        />
        <div style={{ textAlign: 'center' }}>
          <Btn onClick={onBack}><ArrowLeft size={14} /> Back to problems</Btn>
        </div>
      </div>
    )
  }

  const availableLanguages = languages.filter((l) => problem.languages.includes(l.id))
  const activeResult = submitResult
    ? { verdict: submitResult.verdict, testResults: submitResult.testResults || [], runtimeMs: submitResult.runtimeMs, memoryKb: submitResult.memoryKb }
    : runResult
      ? { verdict: runResult.verdict, testResults: runResult.testResults, runtimeMs: runResult.runtimeMs, memoryKb: runResult.memoryKb }
      : null

  async function handleReview() {
    if (!activeResult) return
    setReviewLoading(true)
    setReviewError('')
    try {
      const payload = {
        code,
        language,
        verdict: activeResult.verdict,
        testResults: activeResult.testResults,
      }
      const result = await getCodeReview(problemId, payload)
      setReview(result)
    } catch (err) {
      const msg = sanitizeErrorMessage(err, 'Failed to generate AI code review — please try again')
      setReviewError(msg)
      if (showToast) showToast(msg, 'error')
    } finally {
      setReviewLoading(false)
    }
  }

  // ── Calculate summary stats for results panel ──────────────────────────
  const passedTests = activeResult?.testResults.filter(t => t.passed).length || 0
  const totalTests = activeResult?.testResults.length || 0
  const peakTime = activeResult?.runtimeMs || 0
  const peakMemory = activeResult?.memoryKb || 0

  return (
    <div ref={workspaceRef}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <Btn onClick={onBack} variant="ghost"><ArrowLeft size={14} /> All Problems</Btn>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <DifficultyBadge difficulty={problem.difficulty} />
          <span style={{ fontSize: 11, color: T.txtMut, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <Clock size={12} /> {(problem.timeLimitMs / 1000).toFixed(1)}s
          </span>
          <span style={{ fontSize: 11, color: T.txtMut, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <Cpu size={12} /> {problem.memoryLimitMb} MB
          </span>
          {/* Keyboard shortcut hint */}
          <span
            title="Ctrl+Enter = Run · Ctrl+Shift+Enter = Submit"
            style={{ fontSize: 10, color: T.txtMut, display: 'inline-flex', alignItems: 'center', gap: 3, opacity: 0.7 }}
          >
            <Keyboard size={11} /> shortcuts
          </span>
        </div>
      </div>

      <div className="workspace-grid">
        {/* Left: description / submissions */}
        <div style={{ background: T.bgWhite, border: `1px solid ${T.border}`, borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ display: 'flex', borderBottom: `1px solid ${T.border}` }}>
            {(['description', 'submissions'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  flex: 1,
                  padding: '11px 0',
                  border: 'none',
                  background: tab === t ? T.bgLow : 'transparent',
                  color: tab === t ? T.primary : T.txtSec,
                  fontWeight: 700,
                  fontSize: 12,
                  cursor: 'pointer',
                  textTransform: 'capitalize',
                  fontFamily: 'inherit',
                }}
              >
                {t}
              </button>
            ))}
          </div>

          <div style={{ padding: 20, maxHeight: 640, overflowY: 'auto' }}>
            {tab === 'description' ? (
              <>
                <h2 style={{ fontSize: 17, fontWeight: 700, color: T.primary, margin: '0 0 6px' }}>{problem.title}</h2>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
                  {problem.targetBranch && (
                    <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 8, background: T.goldFixed, color: T.onGold, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      🎯 Assigned to: {problem.targetBranch}
                    </span>
                  )}
                  {problem.dueDate && (
                    <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 8, background: T.bgLow, color: T.txtSec }}>
                      ⏰ Due: {new Date(problem.dueDate).toLocaleDateString()}
                    </span>
                  )}
                  {problem.topics.map((t) => (
                    <span key={t} style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 8, background: T.bgLow, color: T.txtSec }}>{t}</span>
                  ))}
                </div>
                <p style={{ fontSize: 13, color: T.txtPri, lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{problem.statement}</p>

                {problem.inputFormat && (
                  <>
                    <h4 style={{ fontSize: 12, fontWeight: 700, color: T.primary, marginTop: 18, marginBottom: 6 }}>Input Format</h4>
                    <p style={{ fontSize: 13, color: T.txtSec, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{problem.inputFormat}</p>
                  </>
                )}
                {problem.outputFormat && (
                  <>
                    <h4 style={{ fontSize: 12, fontWeight: 700, color: T.primary, marginTop: 14, marginBottom: 6 }}>Output Format</h4>
                    <p style={{ fontSize: 13, color: T.txtSec, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{problem.outputFormat}</p>
                  </>
                )}
                {problem.constraints && (
                  <>
                    <h4 style={{ fontSize: 12, fontWeight: 700, color: T.primary, marginTop: 14, marginBottom: 6 }}>Constraints</h4>
                    <p style={{ fontSize: 13, color: T.txtSec, lineHeight: 1.6, whiteSpace: 'pre-wrap', fontFamily: 'monospace' }}>{problem.constraints}</p>
                  </>
                )}

                {/* Sample test cases with copy-to-clipboard */}
                {problem.sampleTests.map((tc, i) => (
                  <div key={i} style={{ marginTop: 18, background: T.bgLow, borderRadius: 10, padding: 14 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: T.primary, marginBottom: 8 }}>Example {i + 1}</div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: T.txtMut }}>Input</span>
                      <CopyBtn text={tc.input} />
                    </div>
                    <pre style={{ fontSize: 12, background: T.bgWhite, padding: 8, borderRadius: 6, margin: '0 0 8px', overflowX: 'auto', border: `1px solid ${T.border}` }}>{tc.input}</pre>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: T.txtMut }}>Output</span>
                      <CopyBtn text={tc.output} />
                    </div>
                    <pre style={{ fontSize: 12, background: T.bgWhite, padding: 8, borderRadius: 6, margin: 0, overflowX: 'auto', border: `1px solid ${T.border}` }}>{tc.output}</pre>
                    {tc.explanation && (
                      <p style={{ fontSize: 12, color: T.txtSec, marginTop: 8, marginBottom: 0 }}>
                        <strong>Explanation:</strong> {tc.explanation}
                      </p>
                    )}
                  </div>
                ))}
              </>
            ) : (
              <div>
                {loadingSubmissions ? (
                  <div style={{ textAlign: 'center', padding: 30, color: T.txtMut }}>Loading submissions…</div>
                ) : submissions.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: 30, color: T.txtMut }}>
                    <History size={22} style={{ marginBottom: 8, opacity: 0.5 }} />
                    <div>No submissions yet. Run your code, then submit!</div>
                  </div>
                ) : (
                  /* ── Enhanced Submission History Table (Codeforces-style) ── */
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                      <thead>
                        <tr style={{ borderBottom: `2px solid ${T.border}` }}>
                          <th style={{ padding: '8px 6px', textAlign: 'left', fontWeight: 700, color: T.txtMut, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.04em' }}>When</th>
                          <th style={{ padding: '8px 6px', textAlign: 'left', fontWeight: 700, color: T.txtMut, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Language</th>
                          <th style={{ padding: '8px 6px', textAlign: 'left', fontWeight: 700, color: T.txtMut, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Verdict</th>
                          <th style={{ padding: '8px 6px', textAlign: 'right', fontWeight: 700, color: T.txtMut, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Time</th>
                          <th style={{ padding: '8px 6px', textAlign: 'right', fontWeight: 700, color: T.txtMut, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Memory</th>
                          <th style={{ padding: '8px 6px', textAlign: 'right', fontWeight: 700, color: T.txtMut, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Tests</th>
                        </tr>
                      </thead>
                      <tbody>
                        {submissions.map((s) => (
                          <tr
                            key={s.id}
                            style={{
                              borderBottom: `1px solid ${T.border}`,
                              transition: 'background 0.15s',
                            }}
                            onMouseEnter={(e) => (e.currentTarget.style.background = T.bgLow)}
                            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                          >
                            <td style={{ padding: '8px 6px', color: T.txtSec, whiteSpace: 'nowrap' }}>
                              {relativeTime(s.submittedAt)}
                            </td>
                            <td style={{ padding: '8px 6px', color: T.txtPri, fontWeight: 600 }}>
                              {languages.find(l => l.id === s.language)?.label || s.language}
                            </td>
                            <td style={{ padding: '8px 6px' }}>
                              <VerdictBadge verdict={s.verdict} size="sm" />
                            </td>
                            <td style={{ padding: '8px 6px', textAlign: 'right', color: T.txtSec, fontFamily: 'monospace' }}>
                              {s.runtimeMs} ms
                            </td>
                            <td style={{ padding: '8px 6px', textAlign: 'right', color: T.txtSec, fontFamily: 'monospace' }}>
                              {s.memoryKb > 0 ? `${(s.memoryKb / 1024).toFixed(1)} MB` : '—'}
                            </td>
                            <td style={{ padding: '8px 6px', textAlign: 'right', color: T.txtSec, fontWeight: 600 }}>
                              <span style={{ color: s.verdict === 'Accepted' ? T.green : T.txtSec }}>
                                {s.passedCount}/{s.totalCount}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right: editor + run/submit + results */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <select
                value={language}
                onChange={(e) => switchLanguage(e.target.value)}
                style={{
                  padding: '8px 12px',
                  borderRadius: 10,
                  border: `1.5px solid ${T.outlineVar}`,
                  fontSize: 12,
                  fontWeight: 600,
                  fontFamily: 'inherit',
                  background: T.bgWhite,
                }}
              >
                {availableLanguages.map((l) => (
                  <option key={l.id} value={l.id}>{l.label}</option>
                ))}
              </select>
              {/* Reset dialog trigger */}
              <Btn
                onClick={() => setShowResetConfirm(true)}
                variant="ghost"
                title="Reset code template"
                style={{ padding: '7px 10px', fontSize: 11 }}
              >
                <RotateCcw size={12} /> Reset
              </Btn>
              {/* Quick clean competitive template (Codeforces-style scratch) */}
              <Btn
                onClick={handleResetToCleanTemplate}
                variant="ghost"
                title="Solve from scratch: load clean Codeforces/CodeChef competitive template"
                style={{ padding: '7px 10px', fontSize: 11 }}
              >
                <Code2 size={12} /> Scratch
              </Btn>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Btn onClick={handleRun} disabled={running || submitting} variant="ghost" title="Run code (Ctrl+Enter)">
                {running ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Play size={14} />} Run
                <kbd style={{ fontSize: 9, padding: '1px 4px', borderRadius: 3, background: T.bgMid, color: T.txtMut, fontFamily: 'inherit', marginLeft: 2 }}>⌃↵</kbd>
              </Btn>
              <Btn onClick={handleSubmit} disabled={running || submitting} variant="navy" title="Submit code (Ctrl+Shift+Enter)">
                {submitting ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Send size={14} />} Submit
                <kbd style={{ fontSize: 9, padding: '1px 4px', borderRadius: 3, background: 'rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.7)', fontFamily: 'inherit', marginLeft: 2 }}>⌃⇧↵</kbd>
              </Btn>
            </div>
          </div>

          <CodeEditor language={language} value={code} onChange={handleCodeChange} height={420} />

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: T.primary, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={useCustomInput}
                  onChange={(e) => setUseCustomInput(e.target.checked)}
                  style={{ cursor: 'pointer', accentColor: T.primary }}
                />
                Test with Custom Input (stdin)
              </label>
              <div style={{ fontSize: 10, color: T.txtMut }}>
                {languageLabel} · autosaving…
              </div>
            </div>

            {useCustomInput && (
              <div style={{ background: T.bgWhite, border: `1px solid ${T.border}`, borderRadius: 8, padding: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: T.txtSec, marginBottom: 4 }}>
                  Custom Standard Input:
                </div>
                <textarea
                  value={customInput}
                  onChange={(e) => setCustomInput(e.target.value)}
                  placeholder="Enter test input data here..."
                  rows={3}
                  style={{
                    width: '100%',
                    boxSizing: 'border-box',
                    padding: 8,
                    borderRadius: 6,
                    border: `1px solid ${T.outlineVar}`,
                    fontSize: 12,
                    fontFamily: 'monospace',
                    background: T.bgLow,
                    color: T.txtPri,
                    resize: 'vertical',
                  }}
                />
              </div>
            )}
          </div>

          {/* Reset confirmation dialog */}
          {showResetConfirm && (
            <div style={{
              background: T.bgWhite, border: `1px solid ${T.border}`, borderRadius: 10, padding: 16,
              display: 'flex', flexDirection: 'column', gap: 10,
              boxShadow: '0 4px 16px rgba(0,0,0,0.06)',
            }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: T.primary }}>Reset Code Template</div>
              <div style={{ fontSize: 12, color: T.txtSec, lineHeight: 1.5 }}>
                Choose how you want to reset your editor. Unsaved changes will be replaced:
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                <Btn onClick={() => setShowResetConfirm(false)} variant="ghost" style={{ padding: '6px 14px', fontSize: 12 }}>
                  Cancel
                </Btn>
                <Btn onClick={handleResetToStarter} variant="outline" title="Reset to the unsolved problem starter stub" style={{ padding: '6px 14px', fontSize: 12 }}>
                  <RotateCcw size={12} /> Problem Stub
                </Btn>
                <Btn onClick={handleResetToCleanTemplate} variant="primary" title="Reset to clean Codeforces/CodeChef competitive template without driver code" style={{ padding: '6px 14px', fontSize: 12 }}>
                  <Code2 size={12} /> Clean Scratch Template
                </Btn>
              </div>
            </div>
          )}

          {/* Judge progress bar (during streaming submission) */}
          {submitting && judgeProgress.length > 0 && (
            <JudgeProgressBar events={judgeProgress} total={judgeTotal} />
          )}

          {/* Results panel */}
          {activeResult && !submitting && (
            <div style={{ background: T.bgWhite, border: `1px solid ${T.border}`, borderRadius: 12, padding: 16 }}>
              {/* Summary bar */}
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8,
                padding: '8px 12px', background: T.bgLow, borderRadius: 8,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <VerdictBadge verdict={activeResult.verdict} />
                  <span style={{ fontSize: 12, fontWeight: 600, color: T.txtSec }}>
                    {passedTests}/{totalTests} passed
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 11, color: T.txtMut }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <Clock size={11} /> Peak: {peakTime} ms
                  </span>
                  {peakMemory > 0 && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <HardDrive size={11} /> {(peakMemory / 1024).toFixed(1)} MB
                    </span>
                  )}
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
                <Btn onClick={handleReview} disabled={reviewLoading} variant="outline" style={{ padding: '6px 12px', fontSize: 11 }}>
                  {reviewLoading ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Sparkles size={12} />} {reviewLoading ? 'Reviewing…' : 'Get AI Review'}
                </Btn>
              </div>

              {/* Per-test-case results */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {activeResult.testResults.map((tr, i) => (
                  <div key={i} style={{ border: `1px solid ${tr.passed ? T.green + '33' : T.error + '33'}`, borderRadius: 8, padding: 10, background: tr.passed ? T.greenBg : T.errCont }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: tr.passed ? T.green : T.error }}>
                        {tr.passed ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
                        {tr.hidden ? `Hidden Test ${i + 1}` : `Test ${i + 1}`} {tr.passed ? 'Passed' : 'Failed'}
                        {tr.verdict && tr.verdict !== 'Accepted' && tr.verdict !== 'Wrong Answer' && (
                          <span style={{ fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 4, background: 'rgba(0,0,0,0.06)', color: T.txtSec, marginLeft: 4 }}>
                            {tr.verdict}
                          </span>
                        )}
                      </div>
                      {/* Per-test time/memory */}
                      <div style={{ fontSize: 10, color: T.txtMut, display: 'flex', gap: 10, fontFamily: 'monospace' }}>
                        {tr.timeMs !== undefined && <span>{tr.timeMs} ms</span>}
                        {tr.memoryKb !== undefined && tr.memoryKb > 0 && <span>{(tr.memoryKb / 1024).toFixed(1)} MB</span>}
                      </div>
                    </div>
                    {!tr.hidden && !tr.passed && (
                      <div style={{ marginTop: 8, fontSize: 11, color: T.txtSec, display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {tr.input !== undefined && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <strong>Input:</strong> <code style={{ flex: 1 }}>{tr.input}</code>
                            <CopyBtn text={tr.input} />
                          </div>
                        )}
                        {tr.expectedOutput !== undefined && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <strong>Expected:</strong> <code style={{ flex: 1 }}>{tr.expectedOutput}</code>
                            <CopyBtn text={tr.expectedOutput} />
                          </div>
                        )}
                        {tr.actualOutput !== undefined && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <strong>Got:</strong> <code style={{ flex: 1 }}>{tr.actualOutput}</code>
                            <CopyBtn text={tr.actualOutput} />
                          </div>
                        )}
                        {tr.stderr && <div style={{ color: T.error }}><strong>Error:</strong> <code>{tr.stderr}</code></div>}
                      </div>
                    )}
                  </div>
                ))}
              </div>
              {reviewError && (
                <div style={{ marginTop: 12, padding: 10, background: T.errCont, border: `1px solid ${T.error}33`, borderRadius: 8, fontSize: 12, color: T.error }}>
                  {reviewError}
                </div>
              )}
              {review && (
                <div style={{ marginTop: 12, background: T.bgWhite, border: `1px solid ${T.border}`, borderRadius: 10, padding: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10, fontSize: 12, fontWeight: 700, color: T.primary }}>
                    <Sparkles size={14} style={{ color: T.primary }} /> AI Code Review
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 12, lineHeight: 1.6 }}>
                    <div><strong style={{ color: T.txtPri }}>Correctness:</strong> <span style={{ color: T.txtSec }}>{review.correctnessNote}</span></div>
                    <div><strong style={{ color: T.txtPri }}>Complexity:</strong> <span style={{ color: T.txtSec }}>{review.complexity}</span></div>
                    <div><strong style={{ color: T.txtPri }}>Better Approach:</strong> <span style={{ color: T.txtSec }}>{review.betterApproach}</span></div>
                    <div>
                      <strong style={{ color: T.txtPri }}>Code Quality:</strong>
                      <ul style={{ margin: '6px 0 0 18px', padding: 0, color: T.txtSec }}>
                        {review.codeQualityNotes.map((n, idx) => <li key={idx} style={{ marginBottom: 4 }}>{n}</li>)}
                      </ul>
                    </div>
                    <div style={{ background: T.bgLow, borderRadius: 8, padding: 10, border: `1px solid ${T.border}` }}>
                      <strong style={{ color: T.primary }}>Overall:</strong> <span style={{ color: T.txtPri }}>{review.overallVerdict}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
