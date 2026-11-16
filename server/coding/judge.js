// ── Online Coding Platform — Unified Sandboxed Judge Engine ─────────────────
// Backend order (JUDGE_PROVIDER=auto, the default):
//   1. Judge0  (containerised, cgroup limits)           ← primary
//   2. Piston  (containerised)                          ← secondary
//   3. Host toolchain — ONLY if JUDGE_ALLOW_LOCAL=true  ← dev-only last resort
//
// SECURITY NOTE: earlier versions preferred the host toolchain whenever one was
// installed ("native-first"). Because `node` always exists on the API host, every
// JavaScript submission silently bypassed the sandbox and ran inside the API
// server's own environment. The host runner is now strictly opt-in and is never
// chosen ahead of a working remote sandbox.
// ─────────────────────────────────────────────────────────────────────────────

import { executeJudge0, isJudge0Available } from './adapters/judge0.js'
import { executePiston, isPistonAvailable } from './adapters/piston.js'
import {
  executeLocally,
  isLocalCompilerAvailable,
  isLocalExecutionAllowed,
  compileAndRunBatchLocally,
} from './adapters/local.js'
import {
  buildTestResult,
  determineVerdict,
  normalizeOutput,
  serviceErrorOutcome,
  summarize,
} from './verdict.js'

export { determineVerdict, normalizeOutput }

// Maps our internal language IDs to display labels and extensions
export const LANGUAGE_CONFIG = {
  javascript: { pistonLang: 'javascript', ext: 'js', label: 'JavaScript (Node.js)' },
  python: { pistonLang: 'python', ext: 'py', label: 'Python 3' },
  java: { pistonLang: 'java', ext: 'java', label: 'Java (OpenJDK)' },
  cpp: { pistonLang: 'cpp', ext: 'cpp', label: 'C++ (GCC)' },
  c: { pistonLang: 'c', ext: 'c', label: 'C (GCC)' },
}

export const SUPPORTED_LANGUAGES = Object.keys(LANGUAGE_CONFIG)

const CONCURRENCY = 4

function configuredProvider() {
  const p = (process.env.JUDGE_PROVIDER || 'auto').toLowerCase()
  return ['auto', 'judge0', 'piston', 'local'].includes(p) ? p : 'auto'
}

/** Ordered list of backends to try for a single execution. */
function backendOrder() {
  const p = configuredProvider()
  const order = p === 'auto' ? ['judge0', 'piston'] : [p]
  if (isLocalExecutionAllowed() && !order.includes('local')) order.push('local')
  return order
}

function stripCredentials(url) {
  try {
    const u = new URL(url)
    u.username = ''
    u.password = ''
    return u.toString().replace(/\/$/, '')
  } catch {
    return '(invalid url)'
  }
}

let infoCache = null
/**
 * Diagnostic metadata about the judging infrastructure (admin-only endpoint).
 * Probing is cached for 15s so it cannot be used to hammer the sandboxes.
 */
export async function getActiveJudgeInfo() {
  if (infoCache && Date.now() - infoCache.at < 15_000) return infoCache.value

  const providerConfig = configuredProvider()
  const judge0Url = stripCredentials(process.env.JUDGE0_API_URL || 'https://ce.judge0.com')
  const pistonUrl = stripCredentials(process.env.PISTON_API_URL || 'https://emkc.org/api/v2/piston')
  const localAllowed = isLocalExecutionAllowed()

  let activeProvider = 'none'
  for (const backend of backendOrder()) {
    if (backend === 'judge0' && (await isJudge0Available())) { activeProvider = 'judge0'; break }
    if (backend === 'piston' && (await isPistonAvailable())) { activeProvider = 'piston'; break }
    if (backend === 'local' && localAllowed && (await isLocalCompilerAvailable('cpp'))) { activeProvider = 'local'; break }
  }

  const value = {
    provider: activeProvider,
    configuredProvider: providerConfig,
    hostExecutionAllowed: localAllowed,
    judge0Url,
    pistonUrl,
    supportedLanguages: SUPPORTED_LANGUAGES,
  }
  infoCache = { at: Date.now(), value }
  return value
}

/**
 * Executes `code` once against a single `stdin` through the backend cascade.
 * Returns { stdout, stderr, timedOut, memoryExceeded, compileError, runtimeError,
 *           idlenessError, serviceError, timeMs, memoryKb }
 */
export async function executeOnce({ code, language, stdin, timeLimitMs, memoryLimitMb }) {
  if (!SUPPORTED_LANGUAGES.includes(language)) {
    return {
      stdout: '',
      stderr: `Unsupported language: ${language}`,
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

  const args = { code, language, stdin, timeLimitMs, memoryLimitMb }
  let last = serviceErrorOutcome('No execution backend is configured.')

  for (const backend of backendOrder()) {
    try {
      let outcome
      if (backend === 'judge0') outcome = await executeJudge0(args)
      else if (backend === 'piston') outcome = await executePiston(args)
      else outcome = await executeLocally(args)

      if (!outcome.serviceError) return outcome
      last = outcome
      console.warn(`ℹ️ ${backend} unavailable, trying next backend:`, String(outcome.stderr).slice(0, 200))
    } catch (err) {
      last = serviceErrorOutcome(`${backend} error: ${err.message}`)
      console.warn(`ℹ️ ${backend} execution error, trying next backend:`, err.message)
    }
  }
  return last
}

/**
 * Bounded-concurrency map that preserves order and CONTAINS failures: one
 * rejected worker used to reject the whole submission mid-stream.
 */
async function mapConcurrent(items, concurrency, fn) {
  const results = new Array(items.length)
  let nextIdx = 0
  async function worker() {
    while (nextIdx < items.length) {
      const idx = nextIdx++
      try {
        results[idx] = await fn(items[idx], idx)
      } catch (err) {
        results[idx] = { error: err }
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()))
  return results
}

function judgeOne(tc, outcome, timeLimitMs, language) {
  const verdict = determineVerdict(outcome, tc.output, timeLimitMs, language, { compare: !tc.custom })
  return { verdict, result: buildTestResult(tc, outcome, verdict) }
}

/**
 * Judges `code` against all test cases, emitting live progress via `onProgress`.
 * Case 1 runs first so a compile error / dead sandbox aborts immediately, then
 * the rest run with bounded concurrency.
 */
export async function runTestCasesStreaming({ code, language, testCases, timeLimitMs, memoryLimitMb, onProgress }) {
  const emit = typeof onProgress === 'function' ? onProgress : () => {}

  if (!testCases || testCases.length === 0) {
    const empty = { verdict: 'Accepted', passedCount: 0, totalCount: 0, runtimeMs: 0, memoryKb: 0, testResults: [] }
    emit({ type: 'complete', ...empty })
    return empty
  }

  // Explicit host mode: compile once, run everything locally.
  if (configuredProvider() === 'local') {
    if (!isLocalExecutionAllowed()) {
      const outcome = serviceErrorOutcome('Host execution is disabled (set JUDGE_ALLOW_LOCAL=true for local development).')
      const summary = summarize([buildTestResult(testCases[0], outcome, 'Sandbox Unavailable')], testCases.length)
      emit({ type: 'complete', ...summary })
      return summary
    }
    return compileAndRunBatchLocally({ code, language, testCases, timeLimitMs, memoryLimitMb, onProgress: emit })
  }

  emit({ type: 'compiling' })

  const first = await executeOnce({ code, language, stdin: testCases[0].input, timeLimitMs, memoryLimitMb })

  // Remote sandboxes all down but host fallback is explicitly allowed: use the
  // faster compile-once batch path instead of recompiling per test.
  if (first.serviceError && isLocalExecutionAllowed() && (await isLocalCompilerAvailable(language))) {
    return compileAndRunBatchLocally({ code, language, testCases, timeLimitMs, memoryLimitMb, onProgress: emit })
  }

  const { verdict: firstVerdict, result: firstResult } = judgeOne(testCases[0], first, timeLimitMs, language)
  emit({
    type: 'test',
    index: 1,
    total: testCases.length,
    verdict: firstVerdict,
    passed: firstResult.passed,
    timeMs: first.timeMs,
    memoryKb: first.memoryKb,
  })

  if (firstVerdict === 'Compilation Error' || firstVerdict === 'Sandbox Unavailable' || testCases.length === 1) {
    const summary = summarize([firstResult], testCases.length)
    emit({ type: 'complete', ...summary })
    return summary
  }

  const allResults = new Array(testCases.length)
  allResults[0] = firstResult

  await mapConcurrent(testCases.slice(1), CONCURRENCY, async (tc, rel) => {
    const idx = rel + 1
    const outcome = await executeOnce({ code, language, stdin: tc.input, timeLimitMs, memoryLimitMb })
    const { verdict, result } = judgeOne(tc, outcome, timeLimitMs, language)
    allResults[idx] = result
    emit({
      type: 'test',
      index: idx + 1,
      total: testCases.length,
      verdict,
      passed: result.passed,
      timeMs: outcome.timeMs,
      memoryKb: outcome.memoryKb,
    })
  })

  // A worker that threw leaves a hole; surface it as a sandbox failure, not a crash.
  for (let i = 0; i < allResults.length; i++) {
    if (!allResults[i]) {
      allResults[i] = buildTestResult(testCases[i], serviceErrorOutcome('Internal judge error.'), 'Sandbox Unavailable')
    }
  }

  const summary = summarize(allResults, testCases.length)
  emit({ type: 'complete', ...summary })
  return summary
}

/** Non-streaming variant. */
export function runTestCases(opts) {
  return runTestCasesStreaming({ ...opts, onProgress: undefined })
}
