// ── Online Coding Platform — Secure Code Execution Service ─────────────────
// Student/admin submitted code is NEVER executed in this process. It is sent
// to Piston (https://github.com/engineer-man/piston) — a container-sandboxed,
// language-agnostic execution engine (each run gets a fresh, resource-limited,
// network-isolated sandbox that is destroyed afterwards). This process only
// talks to Piston over HTTP; it never shells out to `eval`, `child_process`,
// or similar on unsanitized user input.
//
// PISTON_API_URL defaults to the public demo instance, but for real
// production traffic you should self-host Piston (a single Docker command)
// and point PISTON_API_URL at your own instance — see server/.env.example.
//
// ── Architecture Notes (inspired by Codeforces / CodeChef / LeetCode) ──────
// • Per-test-case resource tracking: each test returns timeMs + memoryKb
// • 7 verdict types: Accepted, Wrong Answer, TLE, MLE, RE, CE, Idleness LE
// • Short-circuit on Compilation Error (same binary, no point re-running)
// • Streaming mode: `runTestCasesStreaming()` emits per-test events for SSE
// • Memory tracking: Piston may or may not report peak RSS — we parse what
//   is available and fall back to 0 when the public API omits it.
// ─────────────────────────────────────────────────────────────────────────────

const PISTON_API_URL = process.env.PISTON_API_URL || 'https://emkc.org/api/v2/piston'

// Maps our internal language ids (used in problem.languages / starterCode keys)
// to the Piston runtime language + a sensible file extension.
export const LANGUAGE_CONFIG = {
  javascript: { pistonLang: 'javascript', ext: 'js', label: 'JavaScript' },
  python: { pistonLang: 'python', ext: 'py', label: 'Python 3' },
  java: { pistonLang: 'java', ext: 'java', label: 'Java' },
  cpp: { pistonLang: 'cpp', ext: 'cpp', label: 'C++' },
  c: { pistonLang: 'c', ext: 'c', label: 'C' },
}

export const SUPPORTED_LANGUAGES = Object.keys(LANGUAGE_CONFIG)

// Cache of {language -> latest version} resolved from Piston's /runtimes.
let runtimeCache = null
let runtimeCacheAt = 0
const RUNTIME_CACHE_TTL_MS = 60 * 60 * 1000 // 1 hour

async function getRuntimeVersion(pistonLang) {
  const now = Date.now()
  if (!runtimeCache || now - runtimeCacheAt > RUNTIME_CACHE_TTL_MS) {
    try {
      const res = await fetch(`${PISTON_API_URL}/runtimes`)
      if (res.ok) {
        const list = await res.json()
        runtimeCache = {}
        for (const rt of list) {
          runtimeCache[rt.language] = rt.version
          for (const alias of rt.aliases || []) {
            if (!runtimeCache[alias]) runtimeCache[alias] = rt.version
          }
        }
        runtimeCacheAt = now
      }
    } catch (e) {
      console.warn('⚠️ Failed to fetch Piston runtimes, falling back to "*":', e.message)
    }
  }
  return runtimeCache?.[pistonLang] || '*'
}

/**
 * Executes `code` once against a single `stdin`, inside the sandbox.
 * Returns { stdout, stderr, timedOut, memoryExceeded, compileError, runtimeError, idlenessError, timeMs, memoryKb }
 */
async function executeOnce({ code, language, stdin, timeLimitMs, memoryLimitMb }) {
  const cfg = LANGUAGE_CONFIG[language]
  if (!cfg) {
    return { stdout: '', stderr: `Unsupported language: ${language}`, compileError: true, timeMs: 0, memoryKb: 0 }
  }

  const version = await getRuntimeVersion(cfg.pistonLang)
  const runTimeout = Math.min(Math.max(timeLimitMs || 2000, 500), 15000)
  const memoryLimitBytes = Math.min(Math.max((memoryLimitMb || 256), 16), 512) * 1024 * 1024

  const started = Date.now()
  let res
  try {
    res = await fetch(`${PISTON_API_URL}/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        language: cfg.pistonLang,
        version,
        files: [{ name: `main.${cfg.ext}`, content: code }],
        stdin: stdin ?? '',
        compile_timeout: 10000,
        run_timeout: runTimeout,
        run_memory_limit: memoryLimitBytes,
      }),
      signal: AbortSignal.timeout(runTimeout + 15000),
    })
  } catch (err) {
    return {
      stdout: '',
      stderr: `Execution service unavailable: ${err.message}`,
      runtimeError: true,
      timeMs: Date.now() - started,
      memoryKb: 0,
    }
  }

  const timeMs = Date.now() - started

  if (!res.ok) {
    return { stdout: '', stderr: `Execution service error (HTTP ${res.status})`, runtimeError: true, timeMs, memoryKb: 0 }
  }

  const data = await res.json()

  // ── Compilation Error ──────────────────────────────────────────────────
  if (data.compile && data.compile.code !== 0) {
    return {
      stdout: '',
      stderr: data.compile.stderr || data.compile.output || 'Compilation failed.',
      compileError: true,
      timeMs,
      memoryKb: 0,
    }
  }

  const run = data.run || {}

  // ── Parse memory from Piston response ─────────────────────────────────
  // Piston's self-hosted API may report memory usage in `run.memory` (bytes).
  // The public demo instance often omits it — we default to 0.
  const memoryBytes = run.memory || 0
  const memoryKb = memoryBytes > 0 ? Math.round(memoryBytes / 1024) : 0

  // ── Memory Limit Exceeded ─────────────────────────────────────────────
  // Detected when process was killed (SIGKILL) AND memory was near/over limit,
  // OR when Piston explicitly reports memory exceeded via exit signal.
  const memoryExceeded = (
    memoryBytes > 0 && memoryBytes >= memoryLimitBytes * 0.95
  ) || (
    run.signal === 'SIGKILL' && run.code === null && memoryBytes > memoryLimitBytes * 0.8
  )

  // ── Time Limit Exceeded ───────────────────────────────────────────────
  // Piston sends SIGKILL when run_timeout is exceeded. We check the signal
  // and also compare wall-clock time as a fallback.
  const timedOut = (
    run.signal === 'SIGKILL' && !memoryExceeded
  ) || (
    timeMs >= runTimeout && run.code !== 0
  )

  // ── Idleness Limit Exceeded ───────────────────────────────────────────
  // Process exited normally (code 0) but produced no stdout AND consumed
  // significant wall time — likely waiting for stdin that never arrives.
  const idlenessError = (
    !timedOut && !memoryExceeded && run.code === 0 &&
    (run.stdout || '').trim() === '' &&
    (run.stderr || '').trim() === '' &&
    timeMs > (runTimeout * 0.8)
  )

  // ── Runtime Error ─────────────────────────────────────────────────────
  const runtimeError = !timedOut && !memoryExceeded && !idlenessError && run.code !== 0

  return {
    stdout: run.stdout || '',
    stderr: run.stderr || '',
    timedOut: !!timedOut,
    memoryExceeded: !!memoryExceeded,
    idlenessError: !!idlenessError,
    compileError: false,
    runtimeError: !!runtimeError,
    timeMs,
    memoryKb,
  }
}

function normalizeOutput(s) {
  return (s ?? '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/g, ''))
    .join('\n')
    .trim()
}

/**
 * Determines the verdict string for a single test case execution outcome.
 * Verdict priority follows Codeforces convention:
 * CE > MLE > TLE > ILE > RE > WA > AC
 */
function determineVerdict(outcome, expectedOutput, timeLimitMs) {
  if (outcome.compileError) return 'Compilation Error'
  if (outcome.memoryExceeded) return 'Memory Limit Exceeded'
  if (outcome.timedOut || (outcome.timeMs || 0) >= (timeLimitMs || 2000)) return 'Time Limit Exceeded'
  if (outcome.idlenessError) return 'Idleness Limit Exceeded'
  if (outcome.runtimeError) return 'Runtime Error'
  if (normalizeOutput(outcome.stdout) !== normalizeOutput(expectedOutput)) return 'Wrong Answer'
  return 'Accepted'
}

/**
 * Runs `code` against a list of test cases and returns per-case verdicts plus
 * an overall summary. Used for both "Run" (sample only) and "Submit" (hidden).
 *
 * Each test result now includes per-case `timeMs` and `memoryKb` tracking,
 * matching the Codeforces/CodeChef result display pattern.
 */
export async function runTestCases({ code, language, testCases, timeLimitMs, memoryLimitMb }) {
  const results = []
  let overallVerdict = 'Accepted'
  let maxTimeMs = 0
  let peakMemoryKb = 0

  for (const tc of testCases) {
    const outcome = await executeOnce({
      code,
      language,
      stdin: tc.input,
      timeLimitMs,
      memoryLimitMb,
    })

    maxTimeMs = Math.max(maxTimeMs, outcome.timeMs || 0)
    peakMemoryKb = Math.max(peakMemoryKb, outcome.memoryKb || 0)

    const verdict = determineVerdict(outcome, tc.output, timeLimitMs)
    const passed = verdict === 'Accepted'

    results.push({
      passed,
      verdict,
      input: tc.hidden ? undefined : tc.input,
      expectedOutput: tc.hidden ? undefined : tc.output,
      actualOutput: tc.hidden ? undefined : outcome.stdout,
      stderr: outcome.stderr ? outcome.stderr.slice(0, 2000) : undefined,
      timeMs: outcome.timeMs,
      memoryKb: outcome.memoryKb,
      hidden: !!tc.hidden,
    })

    if (!passed && overallVerdict === 'Accepted') {
      overallVerdict = verdict
    }

    // Stop early on compile error — same code, no point re-running it.
    if (verdict === 'Compilation Error') break
  }

  const passedCount = results.filter((r) => r.passed).length
  return {
    verdict: results.length === 0 ? 'Runtime Error' : overallVerdict,
    passedCount,
    totalCount: testCases.length,
    runtimeMs: maxTimeMs,
    memoryKb: peakMemoryKb,
    testResults: results,
  }
}

/**
 * Streaming variant of runTestCases — calls `onProgress(event)` after each
 * test case completes, enabling Server-Sent Events (SSE) real-time progress.
 *
 * Inspired by Codeforces's "Running on test X" live judge display.
 *
 * @param {Function} onProgress - Callback receiving progress events:
 *   { type: 'compiling' }
 *   { type: 'test', index, total, verdict, passed, timeMs, memoryKb }
 *   { type: 'complete', verdict, passedCount, totalCount, runtimeMs, memoryKb, testResults }
 */
export async function runTestCasesStreaming({ code, language, testCases, timeLimitMs, memoryLimitMb, onProgress }) {
  const results = []
  let overallVerdict = 'Accepted'
  let maxTimeMs = 0
  let peakMemoryKb = 0

  // Emit compiling phase
  onProgress({ type: 'compiling' })

  for (let i = 0; i < testCases.length; i++) {
    const tc = testCases[i]
    const outcome = await executeOnce({
      code,
      language,
      stdin: tc.input,
      timeLimitMs,
      memoryLimitMb,
    })

    maxTimeMs = Math.max(maxTimeMs, outcome.timeMs || 0)
    peakMemoryKb = Math.max(peakMemoryKb, outcome.memoryKb || 0)

    const verdict = determineVerdict(outcome, tc.output, timeLimitMs)
    const passed = verdict === 'Accepted'

    const testResult = {
      passed,
      verdict,
      input: tc.hidden ? undefined : tc.input,
      expectedOutput: tc.hidden ? undefined : tc.output,
      actualOutput: tc.hidden ? undefined : outcome.stdout,
      stderr: outcome.stderr ? outcome.stderr.slice(0, 2000) : undefined,
      timeMs: outcome.timeMs,
      memoryKb: outcome.memoryKb,
      hidden: !!tc.hidden,
    }

    results.push(testResult)

    if (!passed && overallVerdict === 'Accepted') {
      overallVerdict = verdict
    }

    // Emit per-test progress event
    onProgress({
      type: 'test',
      index: i + 1,
      total: testCases.length,
      verdict,
      passed,
      timeMs: outcome.timeMs,
      memoryKb: outcome.memoryKb,
    })

    // Stop early on compile error
    if (verdict === 'Compilation Error') break
  }

  const passedCount = results.filter((r) => r.passed).length
  const finalResult = {
    verdict: results.length === 0 ? 'Runtime Error' : overallVerdict,
    passedCount,
    totalCount: testCases.length,
    runtimeMs: maxTimeMs,
    memoryKb: peakMemoryKb,
    testResults: results,
  }

  // Emit final complete event
  onProgress({ type: 'complete', ...finalResult })

  return finalResult
}
