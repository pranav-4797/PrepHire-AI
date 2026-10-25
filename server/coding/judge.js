// ── Online Coding Platform — Unified Sandboxed Judge Engine ─────────────────
// Modular code execution service inspired by CodeChef and Codeforces judging standards.
//
// Architecture:
// - Primary: Judge0 (CE / RapidAPI / Self-Hosted Docker) with Base64 protocol,
//   dynamic language detection, microsecond cgroup tracking, and sandboxing.
// - Secondary: Piston (Self-Hosted / Demo) with version cache and resource limits.
// - Fallback: Local toolchains (g++, gcc, python, node) for offline resilience.
// ─────────────────────────────────────────────────────────────────────────────

import { executeJudge0, isJudge0Available } from './adapters/judge0.js'
import { executePiston, isPistonAvailable, PISTON_LANGUAGE_CONFIG } from './adapters/piston.js'
import { executeLocally, isLocalCompilerAvailable, compileAndRunBatchLocally } from './adapters/local.js'

// Maps our internal language IDs to display labels and extensions
export const LANGUAGE_CONFIG = {
  javascript: { pistonLang: 'javascript', ext: 'js', label: 'JavaScript (Node.js)' },
  python: { pistonLang: 'python', ext: 'py', label: 'Python 3' },
  java: { pistonLang: 'java', ext: 'java', label: 'Java (OpenJDK)' },
  cpp: { pistonLang: 'cpp', ext: 'cpp', label: 'C++ (GCC)' },
  c: { pistonLang: 'c', ext: 'c', label: 'C (GCC)' },
}

export const SUPPORTED_LANGUAGES = Object.keys(LANGUAGE_CONFIG)

/**
 * Returns diagnostic metadata about the active judging infrastructure.
 */
export async function getActiveJudgeInfo() {
  const providerConfig = (process.env.JUDGE_PROVIDER || 'auto').toLowerCase()
  const judge0Url = process.env.JUDGE0_API_URL || 'https://ce.judge0.com'
  const pistonUrl = process.env.PISTON_API_URL || 'https://emkc.org/api/v2/piston'

  let activeProvider = providerConfig
  let nativeCompiler = false
  const hasLocalCpp = await isLocalCompilerAvailable('cpp')

  if (providerConfig === 'auto') {
    if (hasLocalCpp) {
      activeProvider = 'native_compiler'
      nativeCompiler = true
    } else {
      const j0Ok = await isJudge0Available()
      if (j0Ok) {
        activeProvider = 'judge0'
      } else {
        const pistonOk = await isPistonAvailable()
        activeProvider = pistonOk ? 'piston' : 'local'
      }
    }
  } else if (providerConfig === 'local') {
    activeProvider = hasLocalCpp ? 'native_compiler' : 'local'
    nativeCompiler = hasLocalCpp
  }

  return {
    provider: activeProvider,
    configuredProvider: providerConfig,
    nativeCompiler,
    judge0Url,
    pistonUrl,
    supportedLanguages: SUPPORTED_LANGUAGES,
  }
}

/**
 * Executes `code` once against a single `stdin` through the configured adapter cascade.
 * Returns { stdout, stderr, timedOut, memoryExceeded, compileError, runtimeError, idlenessError, serviceError, timeMs, memoryKb }
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

  const provider = (process.env.JUDGE_PROVIDER || 'auto').toLowerCase()

  // 1. Explicit Local mode
  if (provider === 'local') {
    return executeLocally({ code, language, stdin, timeLimitMs, memoryLimitMb })
  }

  // 2. Explicit Piston mode
  if (provider === 'piston') {
    const pistonRes = await executePiston({ code, language, stdin, timeLimitMs, memoryLimitMb })
    if (!pistonRes.serviceError) return pistonRes
    console.warn('⚠️ Piston service unavailable, falling back to host toolchain:', pistonRes.stderr)
    return executeLocally({ code, language, stdin, timeLimitMs, memoryLimitMb })
  }

  // 3. Judge0 / Auto mode (Default: CodeChef-grade Judge0 sandbox)
  try {
    const outcome = await executeJudge0({ code, language, stdin, timeLimitMs, memoryLimitMb })
    if (!outcome.serviceError) {
      return outcome
    }
    console.warn('ℹ️ Judge0 service unavailable, attempting fallback:', outcome.stderr)
  } catch (err) {
    console.warn('ℹ️ Judge0 execution error, attempting fallback:', err.message)
  }

  // Fallback A: Try Piston sandbox
  if (process.env.PISTON_API_URL || true) {
    try {
      const pistonRes = await executePiston({ code, language, stdin, timeLimitMs, memoryLimitMb })
      if (!pistonRes.serviceError) return pistonRes
    } catch {}
  }

  // Fallback B: Host compiler/interpreter
  return executeLocally({ code, language, stdin, timeLimitMs, memoryLimitMb })
}

export function normalizeOutput(s) {
  return (s ?? '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/g, ''))
    .join('\n')
    .trim()
}

/**
 * Determines the verdict string for a single test case execution outcome.
 * Priority adheres to competitive programming conventions:
 * Sandbox Unavailable > Compilation Error > Memory Limit Exceeded >
 * Time Limit Exceeded > Idleness Limit Exceeded > Runtime Error >
 * Wrong Answer > Accepted
 */
export function determineVerdict(outcome, expectedOutput, timeLimitMs, language) {
  const multiplier = (language === 'python' || language === 'java' || language === 'javascript') ? 2 : 1
  const effectiveLimitMs = (timeLimitMs || 2000) * multiplier

  if (outcome.serviceError) return 'Sandbox Unavailable'
  if (outcome.compileError) return 'Compilation Error'
  if (outcome.memoryExceeded) return 'Memory Limit Exceeded'
  if (outcome.timedOut || (outcome.timeMs || 0) >= effectiveLimitMs) return 'Time Limit Exceeded'
  if (outcome.idlenessError) return 'Idleness Limit Exceeded'
  if (outcome.runtimeError) return 'Runtime Error'
  if (normalizeOutput(outcome.stdout) !== normalizeOutput(expectedOutput)) return 'Wrong Answer'
  return 'Accepted'
}

/**
 * Helper to process an array with bounded concurrency (e.g. 4 workers in parallel).
 * Guarantees order preservation of the results array.
 */
async function mapConcurrent(items, concurrency, fn) {
  const results = new Array(items.length)
  let nextIdx = 0

  async function worker() {
    while (nextIdx < items.length) {
      const idx = nextIdx++
      results[idx] = await fn(items[idx], idx)
    }
  }

  const workerCount = Math.min(concurrency, items.length)
  const workers = Array.from({ length: workerCount }, () => worker())
  await Promise.all(workers)
  return results
}

/**
 * Runs `code` against a list of test cases in parallel (up to 4 concurrent sandboxes)
 * and returns per-case verdicts plus an aggregate summary with peak runtime and peak memory.
 */
export async function runTestCases({ code, language, testCases, timeLimitMs, memoryLimitMb }) {
  if (!testCases || testCases.length === 0) {
    return { verdict: 'Accepted', passedCount: 0, totalCount: 0, runtimeMs: 0, memoryKb: 0, testResults: [] }
  }

  const provider = (process.env.JUDGE_PROVIDER || 'auto').toLowerCase()
  if (provider === 'auto' || provider === 'local') {
    try {
      const hasLocal = await isLocalCompilerAvailable(language)
      if (hasLocal) {
        return await compileAndRunBatchLocally({ code, language, testCases, timeLimitMs, memoryLimitMb })
      }
    } catch (err) {
      console.warn('⚠️ High-speed native compiler failed, falling back to sandbox cascade:', err.message)
    }
  }

  // Fast check: evaluate test case 0 first to verify compilation and avoid running all tests on syntax errors
  const firstOutcome = await executeOnce({
    code,
    language,
    stdin: testCases[0].input,
    timeLimitMs,
    memoryLimitMb,
  })

  const firstVerdict = determineVerdict(firstOutcome, testCases[0].output, timeLimitMs, language)
  const firstResult = {
    passed: firstVerdict === 'Accepted',
    verdict: firstVerdict,
    input: testCases[0].hidden ? undefined : testCases[0].input,
    expectedOutput: testCases[0].hidden ? undefined : testCases[0].output,
    actualOutput: testCases[0].hidden ? undefined : firstOutcome.stdout,
    stderr: firstOutcome.stderr ? firstOutcome.stderr.slice(0, 2000) : undefined,
    timeMs: firstOutcome.timeMs,
    memoryKb: firstOutcome.memoryKb,
    hidden: !!testCases[0].hidden,
  }

  // Fast abort: If compilation failed or only 1 test, return immediately (zero wasted time!)
  if (firstVerdict === 'Compilation Error' || firstVerdict === 'Sandbox Unavailable' || testCases.length === 1) {
    return {
      verdict: firstVerdict,
      passedCount: firstResult.passed ? 1 : 0,
      totalCount: testCases.length,
      runtimeMs: firstOutcome.timeMs || 0,
      memoryKb: firstOutcome.memoryKb || 0,
      testResults: [firstResult],
    }
  }

  // Run remaining test cases concurrently (4 parallel workers)
  const remainingCases = testCases.slice(1)
  const remainingOutcomes = await mapConcurrent(remainingCases, 4, async (tc) => {
    const outcome = await executeOnce({
      code,
      language,
      stdin: tc.input,
      timeLimitMs,
      memoryLimitMb,
    })
    const verdict = determineVerdict(outcome, tc.output, timeLimitMs, language)
    return {
      passed: verdict === 'Accepted',
      verdict,
      input: tc.hidden ? undefined : tc.input,
      expectedOutput: tc.hidden ? undefined : tc.output,
      actualOutput: tc.hidden ? undefined : outcome.stdout,
      stderr: outcome.stderr ? outcome.stderr.slice(0, 2000) : undefined,
      timeMs: outcome.timeMs,
      memoryKb: outcome.memoryKb,
      hidden: !!tc.hidden,
    }
  })

  const allResults = [firstResult, ...remainingOutcomes]
  let maxTimeMs = firstOutcome.timeMs || 0
  let peakMemoryKb = firstOutcome.memoryKb || 0
  let overallVerdict = firstResult.passed ? 'Accepted' : firstVerdict

  for (const r of remainingOutcomes) {
    maxTimeMs = Math.max(maxTimeMs, r.timeMs || 0)
    peakMemoryKb = Math.max(peakMemoryKb, r.memoryKb || 0)
    if (!r.passed && overallVerdict === 'Accepted') {
      overallVerdict = r.verdict
    }
  }

  const passedCount = allResults.filter((r) => r.passed).length
  return {
    verdict: allResults.length === 0 ? 'Runtime Error' : overallVerdict,
    passedCount,
    totalCount: testCases.length,
    runtimeMs: maxTimeMs,
    memoryKb: peakMemoryKb,
    testResults: allResults,
  }
}

/**
 * Streaming variant of runTestCases — evaluates test cases concurrently while
 * streaming real-time per-test progress events to Server-Sent Events (SSE).
 */
export async function runTestCasesStreaming({ code, language, testCases, timeLimitMs, memoryLimitMb, onProgress }) {
  if (!testCases || testCases.length === 0) {
    const empty = { verdict: 'Accepted', passedCount: 0, totalCount: 0, runtimeMs: 0, memoryKb: 0, testResults: [] }
    onProgress({ type: 'complete', ...empty })
    return empty
  }

  const provider = (process.env.JUDGE_PROVIDER || 'auto').toLowerCase()
  if (provider === 'auto' || provider === 'local') {
    try {
      const hasLocal = await isLocalCompilerAvailable(language)
      if (hasLocal) {
        return await compileAndRunBatchLocally({ code, language, testCases, timeLimitMs, memoryLimitMb, onProgress })
      }
    } catch (err) {
      console.warn('⚠️ High-speed native compiler streaming failed, falling back to sandbox cascade:', err.message)
    }
  }

  // Emit compiling phase
  onProgress({ type: 'compiling' })

  // Fast check: Evaluate case 0 first
  const firstOutcome = await executeOnce({
    code,
    language,
    stdin: testCases[0].input,
    timeLimitMs,
    memoryLimitMb,
  })

  const firstVerdict = determineVerdict(firstOutcome, testCases[0].output, timeLimitMs, language)
  const firstResult = {
    passed: firstVerdict === 'Accepted',
    verdict: firstVerdict,
    input: testCases[0].hidden ? undefined : testCases[0].input,
    expectedOutput: testCases[0].hidden ? undefined : testCases[0].output,
    actualOutput: testCases[0].hidden ? undefined : firstOutcome.stdout,
    stderr: firstOutcome.stderr ? firstOutcome.stderr.slice(0, 2000) : undefined,
    timeMs: firstOutcome.timeMs,
    memoryKb: firstOutcome.memoryKb,
    hidden: !!testCases[0].hidden,
  }

  onProgress({
    type: 'test',
    index: 1,
    total: testCases.length,
    verdict: firstVerdict,
    passed: firstResult.passed,
    timeMs: firstOutcome.timeMs,
    memoryKb: firstOutcome.memoryKb,
  })

  // Fast abort on Compilation Error
  if (firstVerdict === 'Compilation Error' || firstVerdict === 'Sandbox Unavailable' || testCases.length === 1) {
    const finalResult = {
      verdict: firstVerdict,
      passedCount: firstResult.passed ? 1 : 0,
      totalCount: testCases.length,
      runtimeMs: firstOutcome.timeMs || 0,
      memoryKb: firstOutcome.memoryKb || 0,
      testResults: [firstResult],
    }
    onProgress({ type: 'complete', ...finalResult })
    return finalResult
  }

  // Run remaining tests concurrently with 4-way parallelism and stream as each completes
  const remainingCases = testCases.slice(1)
  const allResults = new Array(testCases.length)
  allResults[0] = firstResult

  await mapConcurrent(remainingCases, 4, async (tc, relativeIdx) => {
    const actualIdx = relativeIdx + 1
    const outcome = await executeOnce({
      code,
      language,
      stdin: tc.input,
      timeLimitMs,
      memoryLimitMb,
    })
    const verdict = determineVerdict(outcome, tc.output, timeLimitMs, language)
    const testResult = {
      passed: verdict === 'Accepted',
      verdict,
      input: tc.hidden ? undefined : tc.input,
      expectedOutput: tc.hidden ? undefined : tc.output,
      actualOutput: tc.hidden ? undefined : outcome.stdout,
      stderr: outcome.stderr ? outcome.stderr.slice(0, 2000) : undefined,
      timeMs: outcome.timeMs,
      memoryKb: outcome.memoryKb,
      hidden: !!tc.hidden,
    }
    allResults[actualIdx] = testResult

    // Emit live test progress event immediately when each test finishes
    onProgress({
      type: 'test',
      index: actualIdx + 1,
      total: testCases.length,
      verdict,
      passed: testResult.passed,
      timeMs: outcome.timeMs,
      memoryKb: outcome.memoryKb,
    })
  })

  let maxTimeMs = firstOutcome.timeMs || 0
  let peakMemoryKb = firstOutcome.memoryKb || 0
  let overallVerdict = firstResult.passed ? 'Accepted' : firstVerdict

  for (const r of allResults) {
    if (!r) continue
    maxTimeMs = Math.max(maxTimeMs, r.timeMs || 0)
    peakMemoryKb = Math.max(peakMemoryKb, r.memoryKb || 0)
    if (!r.passed && overallVerdict === 'Accepted') {
      overallVerdict = r.verdict
    }
  }

  const passedCount = allResults.filter((r) => r?.passed).length
  const finalResult = {
    verdict: allResults.length === 0 ? 'Runtime Error' : overallVerdict,
    passedCount,
    totalCount: testCases.length,
    runtimeMs: maxTimeMs,
    memoryKb: peakMemoryKb,
    testResults: allResults,
  }

  // Emit final complete event
  onProgress({ type: 'complete', ...finalResult })
  return finalResult
}
