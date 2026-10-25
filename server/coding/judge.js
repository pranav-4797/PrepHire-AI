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
import { executeLocally } from './adapters/local.js'

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
  if (providerConfig === 'auto' || providerConfig === 'judge0') {
    const j0Ok = await isJudge0Available()
    if (j0Ok) {
      activeProvider = 'judge0'
    } else {
      const pistonOk = await isPistonAvailable()
      activeProvider = pistonOk ? 'piston' : 'local'
    }
  }

  return {
    provider: activeProvider,
    configuredProvider: providerConfig,
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

  // Fallback A: Try Piston if configured
  if (process.env.PISTON_API_URL && !process.env.PISTON_API_URL.includes('emkc.org')) {
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
 * Runs `code` against a list of test cases and returns per-case verdicts plus
 * an aggregate summary with peak runtime and peak memory.
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

    const verdict = determineVerdict(outcome, tc.output, timeLimitMs, language)
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

    // Stop early on compile error — same code will not compile for subsequent cases
    if (verdict === 'Compilation Error' || verdict === 'Sandbox Unavailable') break
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

    const verdict = determineVerdict(outcome, tc.output, timeLimitMs, language)
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

    // Stop early on compile or service error
    if (verdict === 'Compilation Error' || verdict === 'Sandbox Unavailable') break
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
