// ── Online Coding Platform — Piston Execution Adapter ───────────────────────
// Connects to Piston sandbox API (https://github.com/engineer-man/piston)
// Supports self-hosted Piston instances (e.g. http://piston:2000/api/v2) and
// the public demo instance.
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_PISTON_URL = 'https://emkc.org/api/v2/piston'

export const PISTON_LANGUAGE_CONFIG = {
  javascript: { pistonLang: 'javascript', ext: 'js', label: 'JavaScript' },
  python: { pistonLang: 'python', ext: 'py', label: 'Python 3' },
  java: { pistonLang: 'java', ext: 'java', label: 'Java' },
  cpp: { pistonLang: 'cpp', ext: 'cpp', label: 'C++' },
  c: { pistonLang: 'c', ext: 'c', label: 'C' },
}

let runtimeCache = null
let runtimeCacheAt = 0
let runtimeFailedAt = 0
const RUNTIME_CACHE_TTL_MS = 60 * 60 * 1000 // 1 hour
const RUNTIME_RETRY_BACKOFF_MS = 30 * 1000 // don't re-probe a dead Piston on every test case
const MAX_OUTPUT_CHARS = 1024 * 1024

function getPistonApiUrl() {
  return (process.env.PISTON_API_URL || DEFAULT_PISTON_URL).replace(/\/+$/, '')
}

export async function getPistonRuntimeVersion(pistonLang) {
  const apiUrl = getPistonApiUrl()
  const now = Date.now()
  const stale = !runtimeCache || now - runtimeCacheAt > RUNTIME_CACHE_TTL_MS
  if (stale && now - runtimeFailedAt > RUNTIME_RETRY_BACKOFF_MS) {
    try {
      const res = await fetch(`${apiUrl}/runtimes`, { signal: AbortSignal.timeout(5000) })
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
      } else {
        runtimeFailedAt = now
      }
    } catch (e) {
      runtimeFailedAt = now // non-fatal fallback to version '*'
    }
  }
  return runtimeCache?.[pistonLang] || '*'
}

/**
 * Checks if Piston API is reachable and accepting jobs.
 */
export async function isPistonAvailable() {
  try {
    const apiUrl = getPistonApiUrl()
    const res = await fetch(`${apiUrl}/runtimes`, { signal: AbortSignal.timeout(3000) })
    return res.ok
  } catch {
    return false
  }
}

/**
 * Executes code against a single stdin using Piston.
 * Returns standard execution outcome:
 * { stdout, stderr, timedOut, memoryExceeded, compileError, runtimeError, idlenessError, serviceError, timeMs, memoryKb }
 */
export async function executePiston({ code, language, stdin, timeLimitMs, memoryLimitMb }) {
  const cfg = PISTON_LANGUAGE_CONFIG[language]
  if (!cfg) {
    return {
      stdout: '',
      stderr: `Unsupported language: ${language}`,
      compileError: true,
      timeMs: 0,
      memoryKb: 0,
      serviceError: false,
    }
  }

  const apiUrl = getPistonApiUrl()
  const version = await getPistonRuntimeVersion(cfg.pistonLang)
  const runTimeout = Math.min(Math.max(timeLimitMs || 2000, 500), 15000)
  const memoryLimitBytes = Math.min(Math.max(memoryLimitMb || 256, 16), 512) * 1024 * 1024

  const started = Date.now()
  let res
  try {
    res = await fetch(`${apiUrl}/execute`, {
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
      stderr: `Piston connection error: ${err.message}`,
      serviceError: true,
      timeMs: 0,
      memoryKb: 0,
    }
  }

  const roundTripMs = Date.now() - started

  if (!res.ok) {
    return {
      stdout: '',
      stderr: `Piston HTTP ${res.status}`,
      serviceError: true,
      timeMs: 0,
      memoryKb: 0,
    }
  }

  let data
  try {
    data = await res.json()
  } catch {
    return { stdout: '', stderr: 'Piston returned an invalid response.', serviceError: true, timeMs: 0, memoryKb: 0 }
  }

  // Notice messages without run/compile (e.g. whitelist notice)
  if (data.message && !data.run && !data.compile) {
    return {
      stdout: '',
      stderr: data.message,
      serviceError: true,
      timeMs: 0,
      memoryKb: 0,
    }
  }

  // ── Compilation Error ──────────────────────────────────────────────────
  if (data.compile && data.compile.code !== 0) {
    return {
      stdout: '',
      stderr: data.compile.stderr || data.compile.output || 'Compilation failed.',
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

  const run = data.run || {}
  // Use the sandbox's own measurement. The old code used the HTTP round-trip
  // (network + queueing + compile), so a slow Java compile or a laggy network
  // could turn any non-zero exit into a bogus "Time Limit Exceeded".
  const measured = Number(run.wall_time ?? run.cpu_time)
  const hasRealTiming = Number.isFinite(measured) && measured >= 0
  const timeMs = hasRealTiming ? Math.round(measured) : roundTripMs
  const memoryBytes = run.memory || 0
  const memoryKb = memoryBytes > 0 ? Math.round(memoryBytes / 1024) : 0

  // ── Memory Limit Exceeded ─────────────────────────────────────────────
  const memoryExceeded = (
    memoryBytes > 0 && memoryBytes >= memoryLimitBytes * 0.95
  ) || (
    run.signal === 'SIGKILL' && run.code === null && memoryBytes > memoryLimitBytes * 0.8
  )

  // ── Time Limit Exceeded ───────────────────────────────────────────────
  const timedOut = (
    run.signal === 'SIGKILL' && !memoryExceeded
  ) || (
    hasRealTiming && timeMs >= runTimeout && run.code !== 0
  )

  // ── Idleness Limit Exceeded ───────────────────────────────────────────
  const idlenessError = (
    !timedOut && !memoryExceeded && run.code === 0 &&
    (run.stdout || '').trim() === '' &&
    (run.stderr || '').trim() === '' &&
    hasRealTiming && timeMs > (runTimeout * 0.8)
  )

  // ── Runtime Error ─────────────────────────────────────────────────────
  const runtimeError = !timedOut && !memoryExceeded && !idlenessError && run.code !== 0

  return {
    stdout: String(run.stdout || '').slice(0, MAX_OUTPUT_CHARS),
    stderr: String(run.stderr || '').slice(0, 64 * 1024),
    timedOut: !!timedOut,
    memoryExceeded: !!memoryExceeded,
    idlenessError: !!idlenessError,
    compileError: false,
    runtimeError: !!runtimeError,
    serviceError: false,
    timeMs,
    memoryKb,
  }
}
