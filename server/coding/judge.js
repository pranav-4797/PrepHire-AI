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
 * Returns { stdout, stderr, timedOut, compileError, runtimeError, timeMs }
 */
async function executeOnce({ code, language, stdin, timeLimitMs, memoryLimitMb }) {
  const cfg = LANGUAGE_CONFIG[language]
  if (!cfg) {
    return { stdout: '', stderr: `Unsupported language: ${language}`, compileError: true }
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
    }
  }

  const timeMs = Date.now() - started

  if (!res.ok) {
    return { stdout: '', stderr: `Execution service error (HTTP ${res.status})`, runtimeError: true, timeMs }
  }

  const data = await res.json()

  if (data.compile && data.compile.code !== 0) {
    return {
      stdout: '',
      stderr: data.compile.stderr || data.compile.output || 'Compilation failed.',
      compileError: true,
      timeMs,
    }
  }

  const run = data.run || {}
  const timedOut = run.signal === 'SIGKILL' || run.code === null
  return {
    stdout: run.stdout || '',
    stderr: run.stderr || '',
    timedOut: !!timedOut && !!run.stderr === false && run.code !== 0 && run.signal === 'SIGKILL',
    runtimeError: !timedOut && run.code !== 0,
    timeMs,
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
 * Runs `code` against a list of test cases and returns per-case verdicts plus
 * an overall summary. Used for both "Run" (sample only) and "Submit" (hidden).
 */
export async function runTestCases({ code, language, testCases, timeLimitMs, memoryLimitMb }) {
  const results = []
  let overallVerdict = 'Accepted'
  let maxTimeMs = 0

  for (const tc of testCases) {
    const outcome = await executeOnce({
      code,
      language,
      stdin: tc.input,
      timeLimitMs,
      memoryLimitMb,
    })

    maxTimeMs = Math.max(maxTimeMs, outcome.timeMs || 0)

    let verdict = 'Accepted'
    if (outcome.compileError) {
      verdict = 'Compilation Error'
    } else if ((outcome.timeMs || 0) >= (timeLimitMs || 2000)) {
      verdict = 'Time Limit Exceeded'
    } else if (outcome.runtimeError) {
      verdict = 'Runtime Error'
    } else if (normalizeOutput(outcome.stdout) !== normalizeOutput(tc.output)) {
      verdict = 'Wrong Answer'
    }

    const passed = verdict === 'Accepted'
    results.push({
      passed,
      verdict,
      input: tc.hidden ? undefined : tc.input,
      expectedOutput: tc.hidden ? undefined : tc.output,
      actualOutput: tc.hidden ? undefined : outcome.stdout,
      stderr: outcome.stderr ? outcome.stderr.slice(0, 2000) : undefined,
      timeMs: outcome.timeMs,
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
    memoryKb: 0, // Piston's public API does not report peak memory; kept for schema completeness.
    testResults: results,
  }
}
