// ── Online Coding Platform — Judge0 Execution Adapter ──────────────────────
// Connects to Judge0 API (https://github.com/judge0/judge0) for containerized,
// CodeChef/Codeforces-grade code execution with microsecond timers, strict
// memory tracking, and isolation.
//
// Supports:
// - Self-hosted Judge0 CE / Extra CE via Docker (default port 2358)
// - Judge0 CE Cloud (https://ce.judge0.com)
// - RapidAPI Judge0 (judge0-ce.p.rapidapi.com)
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_JUDGE0_URL = 'https://ce.judge0.com'

// Standard language IDs for Judge0 CE (used when API languages list is cached or unreachable)
const DEFAULT_JUDGE0_LANG_IDS = {
  cpp: 105,        // C++ (GCC 14.1.0) — fallback 54 (GCC 9.2.0)
  c: 103,          // C (GCC 14.1.0) — fallback 50 (GCC 9.2.0)
  python: 100,     // Python (3.12.5) — fallback 71 (Python 3.8.1)
  javascript: 102, // JavaScript (Node.js 22.08.0) — fallback 63 (Node.js 12.14.0)
  java: 91,        // Java (JDK 17.0.6) — fallback 62 (OpenJDK 13.0.1)
}

let cachedLanguages = null
let cachedLanguagesAt = 0
const LANG_CACHE_TTL_MS = 60 * 60 * 1000 // 1 hour

function getJudge0Config() {
  const apiUrl = (process.env.JUDGE0_API_URL || DEFAULT_JUDGE0_URL).replace(/\/+$/, '')
  const apiKey = process.env.JUDGE0_API_KEY || ''
  const apiHost = process.env.JUDGE0_API_HOST || ''
  const authToken = process.env.JUDGE0_AUTH_TOKEN || ''

  const headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  }

  if (apiKey) {
    if (apiHost || apiUrl.includes('rapidapi.com')) {
      headers['X-RapidAPI-Key'] = apiKey
      headers['X-RapidAPI-Host'] = apiHost || 'judge0-ce.p.rapidapi.com'
    } else {
      headers['X-Auth-Token'] = apiKey
    }
  }

  if (authToken && !headers['X-Auth-Token']) {
    headers['X-Auth-Token'] = authToken
  }

  return { apiUrl, headers }
}

function decodeBase64(val) {
  if (!val) return ''
  try {
    return Buffer.from(val, 'base64').toString('utf8')
  } catch {
    return String(val)
  }
}

function encodeBase64(val) {
  return Buffer.from(val ?? '', 'utf8').toString('base64')
}

/**
 * Dynamically resolves the best matching language ID from Judge0's /languages endpoint.
 */
export async function resolveJudge0LanguageId(language) {
  const { apiUrl, headers } = getJudge0Config()
  const now = Date.now()

  if (!cachedLanguages || now - cachedLanguagesAt > LANG_CACHE_TTL_MS) {
    try {
      const res = await fetch(`${apiUrl}/languages`, {
        headers,
        signal: AbortSignal.timeout(5000),
      })
      if (res.ok) {
        cachedLanguages = await res.json()
        cachedLanguagesAt = now
      }
    } catch (e) {
      // Non-fatal: fallback to hardcoded IDs
    }
  }

  if (Array.isArray(cachedLanguages) && cachedLanguages.length > 0) {
    // Pick the newest GCC/OpenJDK/etc. Never pick Clang builds, "Python for ML",
    // test-framework variants (Mockito/JUnit) or FPC-style oddities: the old
    // "highest id wins" regex happily selected Clang 7 over GCC 9 on 1.13.x
    // servers and "Python for ML" over plain Python.
    const EXCLUDE = /clang|for ml|mockito|junit|test|javafx|assembly|bosque|pascal/i
    const pick = (re) =>
      cachedLanguages
        .filter((l) => re.test(l.name) && !EXCLUDE.test(l.name))
        .sort((a, b) => b.id - a.id)[0]?.id
    const patterns = {
      cpp: /^c\+\+ \(gcc/i,
      c: /^c \(gcc/i,
      python: /^python \(3/i,
      javascript: /^javascript \(node/i,
      java: /^java \((jdk|openjdk)/i,
    }
    const match = patterns[language] ? pick(patterns[language]) : null
    if (match) return match
  }

  return DEFAULT_JUDGE0_LANG_IDS[language] || 54
}

/**
 * Checks if Judge0 API is reachable.
 */
export async function isJudge0Available() {
  try {
    const { apiUrl, headers } = getJudge0Config()
    const res = await fetch(`${apiUrl}/about`, {
      headers,
      signal: AbortSignal.timeout(3000),
    })
    return res.ok
  } catch {
    return false
  }
}

/**
 * Executes code against a single stdin using Judge0.
 * Returns standard execution outcome:
 * { stdout, stderr, timedOut, memoryExceeded, compileError, runtimeError, idlenessError, serviceError, timeMs, memoryKb }
 */
export async function executeJudge0({ code, language, stdin, timeLimitMs, memoryLimitMb }) {
  const { apiUrl, headers } = getJudge0Config()
  const languageId = await resolveJudge0LanguageId(language)

  const multiplier = (language === 'python' || language === 'java' || language === 'javascript') ? 2 : 1
  const cpuTimeLimit = Math.max(1.0, Math.min(((timeLimitMs || 2000) * multiplier) / 1000, 15.0))
  const memoryLimitKb = Math.max(16384, Math.min((memoryLimitMb || 256) * 1024, 524288))
  const wallTimeLimit = Math.ceil(cpuTimeLimit * 2 + 5)

  const requestBody = {
    source_code: encodeBase64(code),
    language_id: languageId,
    stdin: encodeBase64(stdin || ''),
    cpu_time_limit: cpuTimeLimit,
    wall_time_limit: wallTimeLimit,
    memory_limit: memoryLimitKb,
  }

  const timeoutMs = (wallTimeLimit + 15) * 1000
  const submit = (wait) =>
    fetch(`${apiUrl}/submissions?base64_encoded=true&wait=${wait}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(timeoutMs),
    })

  let res
  try {
    res = await submit(true)
    // Many Judge0 deployments disable ?wait=true (ENABLE_WAIT_RESULT=false) and
    // answer 400. Fall back to async submit + polling instead of failing every run.
    if (res.status === 400) {
      const body = await res.clone().text().catch(() => '')
      if (/wait/i.test(body)) res = await submit(false)
    }
  } catch (err) {
    return {
      stdout: '',
      stderr: `Judge0 connection error: ${err.message}`,
      serviceError: true,
      timeMs: 0,
      memoryKb: 0,
    }
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    return {
      stdout: '',
      stderr: `Judge0 HTTP ${res.status}: ${errText.slice(0, 300)}`,
      serviceError: true,
      timeMs: 0,
      memoryKb: 0,
    }
  }

  let data
  try {
    data = await res.json()
  } catch {
    return { stdout: '', stderr: 'Invalid response from Judge0', serviceError: true, timeMs: 0, memoryKb: 0 }
  }

  // Async queue mode: status 1 = In Queue, 2 = Processing (or only {token} returned).
  const pending = (d) => !d?.status || d.status.id === 1 || d.status.id === 2
  if (pending(data) && data?.token) {
    const pollDeadline = Date.now() + timeoutMs
    while (Date.now() < pollDeadline && pending(data)) {
      await new Promise((r) => setTimeout(r, 250))
      try {
        const pollRes = await fetch(`${apiUrl}/submissions/${encodeURIComponent(data.token)}?base64_encoded=true`, {
          headers,
          signal: AbortSignal.timeout(5000),
        })
        if (pollRes.ok) {
          const next = await pollRes.json()
          data = { ...next, token: next.token || data.token }
        }
      } catch {
        // Retry until deadline
      }
    }
    if (pending(data)) {
      // Previously an unfinished job fell through and was reported as a Runtime Error.
      return { stdout: '', stderr: 'Judge0 did not finish the submission in time.', serviceError: true, timeMs: 0, memoryKb: 0 }
    }
  }

  if (!data || !data.status) {
    return {
      stdout: '',
      stderr: 'Invalid response from Judge0',
      serviceError: true,
      timeMs: 0,
      memoryKb: 0,
    }
  }

  const statusId = data.status.id
  const stdout = decodeBase64(data.stdout)
  const stderr = decodeBase64(data.stderr)
  const compileOutput = decodeBase64(data.compile_output)
  const message = decodeBase64(data.message)

  const timeSeconds = typeof data.time === 'number' ? data.time : parseFloat(data.time || '0')
  const timeMs = Math.round(timeSeconds * 1000)
  const memoryKb = data.memory ? Math.round(Number(data.memory)) : 0

  // ── Compilation Error (Status 6) ──────────────────────────────────────────
  if (statusId === 6) {
    return {
      stdout: '',
      stderr: compileOutput || stderr || 'Compilation failed.',
      compileError: true,
      runtimeError: false,
      timedOut: false,
      memoryExceeded: false,
      idlenessError: false,
      serviceError: false,
      timeMs: 0,
      memoryKb: 0,
    }
  }

  // ── Memory Limit Exceeded ─────────────────────────────────────────────────
  // Status 10/12 with memory limit message, or memory reported >= 95% limit
  const memoryExceeded = (
    memoryKb >= memoryLimitKb * 0.95 ||
    /memory limit exceeded/i.test(message) ||
    // stderr is program-controlled: only trust it when Judge0 did not call the run a clean success
    (statusId !== 3 && (
      /memory limit exceeded/i.test(stderr) ||
      /std::bad_alloc/i.test(stderr) ||
      /java\.lang\.OutOfMemoryError/i.test(stderr)
    ))
  )

  // ── Time Limit Exceeded (Status 5) ────────────────────────────────────────
  const timedOut = statusId === 5 || (!memoryExceeded && timeSeconds >= cpuTimeLimit)

  // ── Internal Error (Status 13) ────────────────────────────────────────────
  if (statusId === 13) {
    return {
      stdout: '',
      stderr: message || 'Judge0 internal execution error',
      serviceError: true,
      timeMs,
      memoryKb,
    }
  }

  // ── Runtime Error (Status 7-12, 14) ───────────────────────────────────────
  // 7: SIGSEGV, 8: SIGXFSZ, 9: SIGFPE, 10: SIGABRT, 11: NZEC, 12: Other, 14: Exec Format
  const isRuntimeStatus = (statusId >= 7 && statusId <= 12) || statusId === 14
  const runtimeError = !timedOut && !memoryExceeded && (isRuntimeStatus || (data.exit_code !== 0 && statusId !== 3 && statusId !== 4))

  // ── Idleness Limit Exceeded ───────────────────────────────────────────────
  const idlenessError = (
    !timedOut && !memoryExceeded && !runtimeError &&
    statusId === 3 &&
    stdout.trim() === '' && stderr.trim() === '' &&
    timeMs > ((timeLimitMs || 2000) * 0.8)
  )

  const finalStderr = runtimeError
    ? (stderr || message || data.status.description || 'Runtime error occurred.')
    : (stderr || message || '')

  return {
    stdout: stdout.slice(0, 1024 * 1024),
    stderr: finalStderr.slice(0, 64 * 1024),
    compileError: false,
    runtimeError: !!runtimeError,
    timedOut: !!timedOut,
    memoryExceeded: !!memoryExceeded,
    idlenessError: !!idlenessError,
    serviceError: false,
    timeMs,
    memoryKb,
  }
}
