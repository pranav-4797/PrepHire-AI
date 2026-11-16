// ── Shared verdict + result-shaping helpers ─────────────────────────────────
// Every execution path (Judge0, Piston, host fallback) goes through the SAME
// functions here. Previously the host fallback had its own copy of the
// comparison logic (plain .trim()) while the remote path used a per-line
// trailing-whitespace normaliser, so identical code could be Accepted on one
// backend and Wrong Answer on another.
// ─────────────────────────────────────────────────────────────────────────────

export const MAX_STDERR_CHARS = 2000
export const MAX_ACTUAL_OUTPUT_CHARS = 10_000

// Languages with slow start-up / JIT warm-up get a 2x wall-clock allowance.
const SLOW_RUNTIME_LANGS = new Set(['python', 'java', 'javascript'])

export function timeMultiplier(language) {
  return SLOW_RUNTIME_LANGS.has(language) ? 2 : 1
}

export function effectiveTimeLimitMs(timeLimitMs, language) {
  const base = Number(timeLimitMs) > 0 ? Number(timeLimitMs) : 2000
  return base * timeMultiplier(language)
}

export function normalizeOutput(s) {
  return String(s ?? '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/g, ''))
    .join('\n')
    .trim()
}

/**
 * Determines the verdict string for a single test-case execution outcome.
 * Priority follows competitive-programming convention:
 * Sandbox Unavailable > Compilation Error > Memory Limit Exceeded >
 * Time Limit Exceeded > Idleness Limit Exceeded > Runtime Error >
 * Wrong Answer > Accepted
 *
 * `compare: false` is used for "custom input" runs, where there is no expected
 * output: the run is judged only on whether it executed cleanly.
 */
export function determineVerdict(outcome, expectedOutput, timeLimitMs, language, { compare = true } = {}) {
  const effectiveLimitMs = effectiveTimeLimitMs(timeLimitMs, language)

  if (outcome.serviceError) return 'Sandbox Unavailable'
  if (outcome.compileError) return 'Compilation Error'
  if (outcome.memoryExceeded) return 'Memory Limit Exceeded'
  if (outcome.timedOut || (outcome.timeMs || 0) >= effectiveLimitMs) return 'Time Limit Exceeded'
  if (outcome.idlenessError) return 'Idleness Limit Exceeded'
  if (outcome.runtimeError) return 'Runtime Error'
  if (compare && normalizeOutput(outcome.stdout) !== normalizeOutput(expectedOutput)) return 'Wrong Answer'
  return 'Accepted'
}

/** Strips absolute temp-dir paths / host details out of compiler & runtime output. */
export function scrubDiagnostics(text) {
  return String(text ?? '')
    .replace(/(?:\/|[A-Za-z]:\\)(?:[\w.\-@]+[\\/])*prephire-[\w-]+[\\/]/g, '')
    .replace(/\u0000/g, '')
}

function truncate(text, max) {
  const s = String(text ?? '')
  return s.length > max ? `${s.slice(0, max)}…[truncated]` : s
}

/**
 * Builds the per-test result object that is sent to the browser.
 *
 * SECURITY: for hidden tests we return ONLY the verdict and resource usage.
 * We deliberately never include stdout *or stderr*. Returning stderr let a
 * student write `print(input(), file=sys.stderr)` and read every hidden test's
 * input straight out of the results panel.
 */
export function buildTestResult(tc, outcome, verdict) {
  const hidden = !!tc.hidden
  const stderr = outcome.stderr ? truncate(scrubDiagnostics(outcome.stderr), MAX_STDERR_CHARS) : ''
  return {
    passed: verdict === 'Accepted',
    verdict,
    input: hidden ? undefined : tc.input,
    expectedOutput: hidden || tc.custom ? undefined : tc.output,
    actualOutput: hidden ? undefined : truncate(outcome.stdout, MAX_ACTUAL_OUTPUT_CHARS),
    stderr: hidden || !stderr ? undefined : stderr,
    timeMs: outcome.timeMs,
    memoryKb: outcome.memoryKb,
    hidden,
    custom: tc.custom ? true : undefined,
  }
}

/** Standard outcome object for "the sandbox itself is not usable". */
export function serviceErrorOutcome(message) {
  return {
    stdout: '',
    stderr: message,
    serviceError: true,
    compileError: false,
    runtimeError: false,
    timedOut: false,
    memoryExceeded: false,
    idlenessError: false,
    timeMs: 0,
    memoryKb: 0,
  }
}

/** Aggregates per-test results into the summary object routes/UI expect. */
export function summarize(testResults, totalCount) {
  let maxTimeMs = 0
  let peakMemoryKb = 0
  let overall = 'Accepted'
  let passedCount = 0
  for (const r of testResults) {
    if (!r) continue
    maxTimeMs = Math.max(maxTimeMs, r.timeMs || 0)
    peakMemoryKb = Math.max(peakMemoryKb, r.memoryKb || 0)
    if (r.passed) passedCount += 1
    else if (overall === 'Accepted') overall = r.verdict
  }
  return {
    verdict: overall,
    passedCount,
    totalCount,
    runtimeMs: maxTimeMs,
    memoryKb: peakMemoryKb,
    testResults,
  }
}
