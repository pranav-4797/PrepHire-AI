import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode, CSSProperties } from 'react'
import {
  ArrowLeft, Play, Send, Clock, Cpu, Loader2, CheckCircle2, XCircle, History,
} from 'lucide-react'
import { T } from '../../theme'
import { DifficultyBadge, VerdictBadge } from './Badges'
import { CodeEditor } from './CodeEditor'
import {
  getProblem, runCode, submitCode, listSubmissions,
  loadAutosavedCode, saveAutosavedCode,
} from '../../services/coding.service'
import type { Problem, RunResult, Submission, LanguageOption } from '../../services/coding.service'

function Btn({
  children, onClick, disabled, variant = 'outline', style = {},
}: {
  children: ReactNode
  onClick?: () => void
  disabled?: boolean
  variant?: 'primary' | 'navy' | 'outline' | 'ghost'
  style?: CSSProperties
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
        ...style,
      }}
    >
      {children}
    </button>
  )
}

export function ProblemWorkspace({
  problemId,
  userEmail,
  userName,
  languages,
  onBack,
  onSolved,
}: {
  problemId: string
  userEmail: string
  userName: string
  languages: LanguageOption[]
  onBack: () => void
  onSolved?: (problemId: string) => void
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
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

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
        setCode(saved ?? p.starterCode?.[defaultLang] ?? '')
      })
      .catch((err) => !cancelled && setError(err.message || 'Failed to load problem'))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [problemId])

  function switchLanguage(nextLang: string) {
    if (!problem) return
    setLanguage(nextLang)
    const saved = loadAutosavedCode(userEmail, problemId, nextLang)
    setCode(saved ?? problem.starterCode?.[nextLang] ?? '')
    setRunResult(null)
    setSubmitResult(null)
  }

  function handleCodeChange(next: string) {
    setCode(next)
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current)
    autosaveTimer.current = setTimeout(() => {
      saveAutosavedCode(userEmail, problemId, language, next)
    }, 600)
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
    try {
      const result = await runCode(problemId, code, language)
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
    setSubmitting(true)
    setRunResult(null)
    try {
      const result = await submitCode(problemId, code, language, userName)
      setSubmitResult(result)
      if (result.verdict === 'Accepted') onSolved?.(problemId)
      if (tab === 'submissions') loadSubmissions()
    } catch (err) {
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
      <div style={{ textAlign: 'center', padding: 60, color: T.error }}>
        {error || 'Problem not found'}
        <div style={{ marginTop: 12 }}>
          <Btn onClick={onBack}><ArrowLeft size={14} /> Back to problems</Btn>
        </div>
      </div>
    )
  }

  const availableLanguages = languages.filter((l) => problem.languages.includes(l.id))
  const activeResult = submitResult
    ? { verdict: submitResult.verdict, testResults: submitResult.testResults || [], runtimeMs: submitResult.runtimeMs }
    : runResult
      ? { verdict: runResult.verdict, testResults: runResult.testResults, runtimeMs: runResult.runtimeMs }
      : null

  return (
    <div>
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
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.15fr)', gap: 16, alignItems: 'start' }}>
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
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
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

                {problem.sampleTests.map((tc, i) => (
                  <div key={i} style={{ marginTop: 18, background: T.bgLow, borderRadius: 10, padding: 14 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: T.primary, marginBottom: 8 }}>Example {i + 1}</div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: T.txtMut, marginBottom: 2 }}>Input</div>
                    <pre style={{ fontSize: 12, background: T.bgWhite, padding: 8, borderRadius: 6, margin: '0 0 8px', overflowX: 'auto', border: `1px solid ${T.border}` }}>{tc.input}</pre>
                    <div style={{ fontSize: 11, fontWeight: 700, color: T.txtMut, marginBottom: 2 }}>Output</div>
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
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {submissions.map((s) => (
                      <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', border: `1px solid ${T.border}`, borderRadius: 8 }}>
                        <div>
                          <VerdictBadge verdict={s.verdict} size="sm" />
                          <div style={{ fontSize: 11, color: T.txtMut, marginTop: 4 }}>
                            {new Date(s.submittedAt).toLocaleString()} · {s.language}
                          </div>
                        </div>
                        <div style={{ fontSize: 11, color: T.txtSec, textAlign: 'right' }}>
                          <div>{s.passedCount}/{s.totalCount} passed</div>
                          <div>{s.runtimeMs} ms</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right: editor + run/submit + results */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
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
            <div style={{ display: 'flex', gap: 8 }}>
              <Btn onClick={handleRun} disabled={running || submitting} variant="ghost">
                {running ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Play size={14} />} Run
              </Btn>
              <Btn onClick={handleSubmit} disabled={running || submitting} variant="navy">
                {submitting ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Send size={14} />} Submit
              </Btn>
            </div>
          </div>

          <CodeEditor language={language} value={code} onChange={handleCodeChange} height={420} />
          <div style={{ fontSize: 10, color: T.txtMut, textAlign: 'right' }}>
            {languageLabel} · autosaving…
          </div>

          {/* Results panel */}
          {activeResult && (
            <div style={{ background: T.bgWhite, border: `1px solid ${T.border}`, borderRadius: 12, padding: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <VerdictBadge verdict={activeResult.verdict} />
                <span style={{ fontSize: 11, color: T.txtMut }}>Runtime: {activeResult.runtimeMs} ms</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {activeResult.testResults.map((tr, i) => (
                  <div key={i} style={{ border: `1px solid ${tr.passed ? T.green + '33' : T.error + '33'}`, borderRadius: 8, padding: 10, background: tr.passed ? T.greenBg : T.errCont }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: tr.passed ? T.green : T.error }}>
                      {tr.passed ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
                      {tr.hidden ? `Hidden Test ${i + 1}` : `Test ${i + 1}`} {tr.passed ? 'Passed' : 'Failed'}
                    </div>
                    {!tr.hidden && !tr.passed && (
                      <div style={{ marginTop: 8, fontSize: 11, color: T.txtSec, display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {tr.input !== undefined && <div><strong>Input:</strong> <code>{tr.input}</code></div>}
                        {tr.expectedOutput !== undefined && <div><strong>Expected:</strong> <code>{tr.expectedOutput}</code></div>}
                        {tr.actualOutput !== undefined && <div><strong>Got:</strong> <code>{tr.actualOutput}</code></div>}
                        {tr.stderr && <div style={{ color: T.error }}><strong>Error:</strong> <code>{tr.stderr}</code></div>}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
