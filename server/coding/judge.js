// ── Online Coding Platform — Secure Code Execution Service ─────────────────
// Student/admin submitted code is executed inside container sandboxes via Piston
// (https://github.com/engineer-man/piston) with an integrated local compilation
// fallback (g++, python, node) for high-performance offline resilience.
// ─────────────────────────────────────────────────────────────────────────────

import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

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
 * Executes code locally using available host toolchains (g++, python, node)
 * as an automatic fallback when Piston sandbox API is unavailable, rate-limited,
 * or restricted (e.g. public Piston API whitelist policy).
 */
async function executeLocally({ code, language, stdin, timeLimitMs }) {
  const timeoutMs = Math.min(Math.max(timeLimitMs || 2000, 500), 10000)
  const tmpDir = os.tmpdir()
  const uid = 'prephire_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7)

  if (language === 'cpp' || language === 'c') {
    const isCpp = language === 'cpp'
    const compiler = isCpp ? 'g++' : 'gcc'
    const srcFile = path.join(tmpDir, `${uid}.${isCpp ? 'cpp' : 'c'}`)
    const exeFile = path.join(tmpDir, `${uid}${process.platform === 'win32' ? '.exe' : ''}`)

    try {
      await fs.promises.writeFile(srcFile, code, 'utf8')

      // Compile step
      const compileRes = await new Promise((resolve) => {
        const cp = spawn(compiler, ['-O2', srcFile, '-o', exeFile], { timeout: 10000 })
        let stderr = ''
        cp.stderr.on('data', (d) => { stderr += d })
        cp.on('close', (exitCode) => resolve({ success: exitCode === 0, stderr }))
        cp.on('error', (err) => resolve({ success: false, stderr: `Compiler ${compiler} not available: ${err.message}` }))
      })

      if (!compileRes.success) {
        try { await fs.promises.unlink(srcFile) } catch {}
        return {
          stdout: '',
          stderr: compileRes.stderr || 'Compilation failed.',
          compileError: true,
          timeMs: 0,
          memoryKb: 0,
        }
      }

      // Execute step
      const started = Date.now()
      const runRes = await new Promise((resolve) => {
        const cp = spawn(exeFile, [], { timeout: timeoutMs })
        let stdout = ''
        let stderr = ''
        cp.stdout.on('data', (d) => { stdout += d })
        cp.stderr.on('data', (d) => { stderr += d })

        if (stdin) {
          cp.stdin.write(stdin)
        }
        cp.stdin.end()

        cp.on('close', (exitCode, signal) => {
          const timeMs = Date.now() - started
          const timedOut = signal === 'SIGTERM' || signal === 'SIGKILL' || timeMs >= timeoutMs
          resolve({
            stdout,
            stderr,
            timeMs,
            timedOut,
            runtimeError: !timedOut && exitCode !== 0,
            compileError: false,
            memoryKb: 0,
          })
        })
        cp.on('error', (err) => {
          resolve({
            stdout: '',
            stderr: `Execution failed: ${err.message}`,
            timeMs: Date.now() - started,
            runtimeError: true,
            compileError: false,
            memoryKb: 0,
          })
        })
      })

      try { await fs.promises.unlink(srcFile) } catch {}
      try { await fs.promises.unlink(exeFile) } catch {}
      return runRes
    } catch (e) {
      try { await fs.promises.unlink(srcFile) } catch {}
      try { await fs.promises.unlink(exeFile) } catch {}
      return { stdout: '', stderr: e.message, runtimeError: true, timeMs: 0, memoryKb: 0 }
    }
  }

  if (language === 'python') {
    const srcFile = path.join(tmpDir, `${uid}.py`)
    try {
      await fs.promises.writeFile(srcFile, code, 'utf8')
      const started = Date.now()
      const pyCmd = process.platform === 'win32' ? 'python' : 'python3'
      const runRes = await new Promise((resolve) => {
        const cp = spawn(pyCmd, [srcFile], { timeout: timeoutMs })
        let stdout = ''
        let stderr = ''
        cp.stdout.on('data', (d) => { stdout += d })
        cp.stderr.on('data', (d) => { stderr += d })

        if (stdin) {
          cp.stdin.write(stdin)
        }
        cp.stdin.end()

        cp.on('close', (exitCode, signal) => {
          const timeMs = Date.now() - started
          const timedOut = signal === 'SIGTERM' || signal === 'SIGKILL' || timeMs >= timeoutMs
          resolve({
            stdout,
            stderr,
            timeMs,
            timedOut,
            runtimeError: !timedOut && exitCode !== 0,
            compileError: false,
            memoryKb: 0,
          })
        })
        cp.on('error', (err) => {
          resolve({
            stdout: '',
            stderr: `Python execution failed: ${err.message}`,
            timeMs: Date.now() - started,
            runtimeError: true,
            compileError: false,
            memoryKb: 0,
          })
        })
      })
      try { await fs.promises.unlink(srcFile) } catch {}
      return runRes
    } catch (e) {
      try { await fs.promises.unlink(srcFile) } catch {}
      return { stdout: '', stderr: e.message, runtimeError: true, timeMs: 0, memoryKb: 0 }
    }
  }

  if (language === 'javascript') {
    const srcFile = path.join(tmpDir, `${uid}.js`)
    try {
      await fs.promises.writeFile(srcFile, code, 'utf8')
      const started = Date.now()
      const runRes = await new Promise((resolve) => {
        const cp = spawn('node', [srcFile], { timeout: timeoutMs })
        let stdout = ''
        let stderr = ''
        cp.stdout.on('data', (d) => { stdout += d })
        cp.stderr.on('data', (d) => { stderr += d })

        if (stdin) {
          cp.stdin.write(stdin)
        }
        cp.stdin.end()

        cp.on('close', (exitCode, signal) => {
          const timeMs = Date.now() - started
          const timedOut = signal === 'SIGTERM' || signal === 'SIGKILL' || timeMs >= timeoutMs
          resolve({
            stdout,
            stderr,
            timeMs,
            timedOut,
            runtimeError: !timedOut && exitCode !== 0,
            compileError: false,
            memoryKb: 0,
          })
        })
        cp.on('error', (err) => {
          resolve({
            stdout: '',
            stderr: `Node.js execution failed: ${err.message}`,
            timeMs: Date.now() - started,
            runtimeError: true,
            compileError: false,
            memoryKb: 0,
          })
        })
      })
      try { await fs.promises.unlink(srcFile) } catch {}
      return runRes
    } catch (e) {
      try { await fs.promises.unlink(srcFile) } catch {}
      return { stdout: '', stderr: e.message, runtimeError: true, timeMs: 0, memoryKb: 0 }
    }
  }

  return { stdout: '', stderr: `Unsupported execution runner for ${language}`, serviceError: true, timeMs: 0, memoryKb: 0 }
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
    // If Piston is offline or network fails, seamlessly fall back to local compiler runner
    return executeLocally({ code, language, stdin, timeLimitMs, memoryLimitMb })
  }

  const timeMs = Date.now() - started

  if (!res.ok) {
    // If Piston returned 401 (whitelist only) or 5xx, fall back to local compiler runner
    return executeLocally({ code, language, stdin, timeLimitMs, memoryLimitMb })
  }

  const data = await res.json()

  // If Piston returned a notice message (e.g. whitelist notice) without run details
  if (data.message && !data.run && !data.compile) {
    return executeLocally({ code, language, stdin, timeLimitMs, memoryLimitMb })
  }

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
  if (outcome.serviceError) return 'Sandbox Unavailable'
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
