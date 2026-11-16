// ── Online Coding Platform — Host Toolchain Adapter (OPT-IN, BEST-EFFORT) ───
// Executes code with compilers/interpreters installed on the SERVER HOST.
//
// ⚠️  THIS IS NOT A SECURITY BOUNDARY.  ⚠️
// Running untrusted student code directly on the API host is only acceptable
// for local development on a throwaway machine. It is therefore DISABLED
// unless JUDGE_ALLOW_LOCAL=true is set explicitly. In production use Judge0 or
// a self-hosted Piston instance (both containerised).
//
// Even when enabled, this adapter applies the mitigations that are possible
// without a container, so that a mistake is not instantly catastrophic:
//   • scrubbed environment — the child never sees GEMINI_API_KEY,
//     GOOGLE_SERVICE_ACCOUNT, NVIDIA_API_KEY etc. (the old version inherited
//     the whole server environment and could print it back to the student)
//   • private 0700 temp dir per run (mkdtemp) instead of predictable names in
//     the shared tmp dir
//   • own process group, killed with SIGKILL as a whole on timeout (the old
//     version only sent SIGTERM to the direct child, so fork()'d children and
//     SIGTERM-ignoring programs survived)
//   • hard caps on captured stdout/stderr (a `while(1) print` used to grow the
//     server's heap until it crashed)
//   • ulimit-based CPU / address-space / file-size / stack limits (POSIX)
//   • Node's permission model for JavaScript (no fs access outside the script,
//     no child_process) where the runtime supports it
//   • stdin errors (EPIPE) are handled — previously a program that exits
//     without reading its input crashed the ENTIRE server process.
// ─────────────────────────────────────────────────────────────────────────────

import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import {
  buildTestResult,
  determineVerdict,
  effectiveTimeLimitMs,
  scrubDiagnostics,
  serviceErrorOutcome,
  summarize,
} from '../verdict.js'

const IS_WIN = process.platform === 'win32'
const NODE_MAJOR = Number(process.versions.node.split('.')[0])
const MAX_STDOUT_BYTES = 1024 * 1024 // 1 MB
const MAX_STDERR_BYTES = 64 * 1024
const STDIN_FILE = '.stdin'
const COMPILE_TIMEOUT_MS = 15_000
const MAX_WALL_MS = 20_000
const MAX_TOTAL_RUN_BUDGET_MS = 60_000 // across all tests of one submission

const DISABLED_MESSAGE =
  'Host code execution is disabled. Configure JUDGE0_API_URL or PISTON_API_URL (recommended), ' +
  'or set JUDGE_ALLOW_LOCAL=true for trusted local development only.'

export function isLocalExecutionAllowed() {
  return process.env.JUDGE_ALLOW_LOCAL === 'true'
}

let warnedAboutProd = false
function warnIfRisky() {
  if (!warnedAboutProd && process.env.NODE_ENV === 'production') {
    warnedAboutProd = true
    console.warn(
      '⚠️  JUDGE_ALLOW_LOCAL=true in production: student code is running directly on the API host. ' +
        'This is NOT sandboxed. Use Judge0/Piston instead.',
    )
  }
}

const clamp = (n, lo, hi) => Math.min(Math.max(n, lo), hi)

// ── Process runner ───────────────────────────────────────────────────────────

function scrubbedEnv(homeDir) {
  const env = {
    PATH: process.env.PATH || '/usr/local/bin:/usr/bin:/bin',
    HOME: homeDir,
    TMPDIR: homeDir,
    LANG: 'C.UTF-8',
    LC_ALL: 'C.UTF-8',
    PYTHONDONTWRITEBYTECODE: '1',
    PYTHONIOENCODING: 'utf-8',
  }
  for (const k of ['JAVA_HOME', 'SystemRoot', 'SYSTEMROOT', 'COMSPEC', 'PATHEXT']) {
    if (process.env[k]) env[k] = process.env[k]
  }
  if (IS_WIN) {
    env.TEMP = homeDir
    env.TMP = homeDir
  }
  return env
}

/** Wraps a command in `sh -c 'ulimit …; exec "$0" "$@"'` on POSIX. */
function withUlimits(cmd, args, limits = {}) {
  if (IS_WIN) return { cmd, args }
  const parts = []
  if (limits.cpuSec) parts.push(`ulimit -t ${Math.ceil(limits.cpuSec)}`)
  if (limits.fsizeKb) parts.push(`ulimit -f ${Math.ceil(limits.fsizeKb)}`)
  if (limits.nofile) parts.push(`ulimit -n ${Math.ceil(limits.nofile)}`)
  if (limits.stackKb) parts.push(`ulimit -s ${Math.ceil(limits.stackKb)}`)
  if (limits.vmKb) parts.push(`ulimit -v ${Math.ceil(limits.vmKb)}`)
  if (parts.length === 0) return { cmd, args }
  // Best-effort: a failing ulimit (e.g. above the hard limit) must not abort the run.
  const script = `${parts.map((p) => `${p} 2>/dev/null`).join('; ')}; exec "$0" "$@"`
  return { cmd: '/bin/sh', args: ['-c', script, cmd, ...args] }
}

/**
 * Spawns a process with hard resource caps and resolves (never rejects) with a
 * plain result object.
 */
function runProcess({ cmd, args = [], cwd, env, stdin = '', timeoutMs, limits }) {
  return new Promise((resolve) => {
    const started = Date.now()
    const outChunks = []
    const errChunks = []
    let outBytes = 0
    let errBytes = 0
    let timedOut = false
    let outputExceeded = false
    let settled = false

    const wrapped = withUlimits(cmd, args, limits)
    // stdin comes from a real file descriptor rather than a pipe/socket:
    //  • no EPIPE if the program never reads its input
    //  • `open('/dev/stdin')` / `readFileSync('/dev/stdin')` work (they fail
    //    with ENXIO when stdin is a socket, which is what spawn() 'pipe' makes)
    let stdinFd = -1
    let cp
    try {
      const stdinPath = path.join(cwd || os.tmpdir(), STDIN_FILE)
      fs.writeFileSync(stdinPath, stdin ?? '', { mode: 0o600 })
      stdinFd = fs.openSync(stdinPath, 'r')
      cp = spawn(wrapped.cmd, wrapped.args, {
        cwd,
        env,
        detached: !IS_WIN, // own process group so we can kill the whole tree
        stdio: [stdinFd, 'pipe', 'pipe'],
        windowsHide: true,
      })
    } catch (e) {
      if (stdinFd >= 0) try { fs.closeSync(stdinFd) } catch { /* ignore */ }
      resolve({ spawnError: e.message, stdout: '', stderr: '', timeMs: 0 })
      return
    }
    try { fs.closeSync(stdinFd) } catch { /* child has its own copy */ }

    const killTree = () => {
      try {
        if (!IS_WIN && cp.pid) process.kill(-cp.pid, 'SIGKILL')
        else cp.kill('SIGKILL')
      } catch {
        /* already gone */
      }
    }

    const timer = setTimeout(() => {
      timedOut = true
      killTree()
    }, timeoutMs)

    const finish = (result) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      killTree() // reap stragglers (background children) of this run
      resolve({
        timeMs: Date.now() - started,
        timedOut,
        outputExceeded,
        stdout: Buffer.concat(outChunks).toString('utf8'),
        stderr: Buffer.concat(errChunks).toString('utf8'),
        ...result,
      })
    }

    cp.stdout.on('data', (d) => {
      outBytes += d.length
      if (outBytes > MAX_STDOUT_BYTES) {
        outputExceeded = true
        killTree()
        return
      }
      outChunks.push(d)
    })
    cp.stderr.on('data', (d) => {
      errBytes += d.length
      if (errBytes <= MAX_STDERR_BYTES) errChunks.push(d)
    })

    cp.on('error', (err) => finish({ spawnError: err.message, exitCode: null, signal: null }))
    cp.on('close', (exitCode, signal) => finish({ exitCode, signal }))
  })
}

// ── Preparation (write source, compile once) ─────────────────────────────────

function pythonCmd() {
  return IS_WIN ? 'python' : 'python3'
}

function nodePermissionFlags(srcFile) {
  // Restrict the JS child to reading its own script + stdin; no child_process,
  // no fs writes, no workers/addons. (Network is not restricted by Node here.)
  const flag = NODE_MAJOR >= 22 ? '--permission' : '--experimental-permission'
  return [flag, `--allow-fs-read=${srcFile}`, `--allow-fs-read=${path.join(path.dirname(srcFile), STDIN_FILE)}`, '--allow-fs-read=/dev/stdin']
}

function compileFailure(stderr, timedOut) {
  return {
    ok: false,
    outcome: {
      stdout: '',
      stderr: timedOut ? 'Compilation timed out.' : scrubDiagnostics(stderr).slice(0, 8000) || 'Compilation failed.',
      compileError: true,
      runtimeError: false,
      timedOut: false,
      memoryExceeded: false,
      idlenessError: false,
      serviceError: false,
      timeMs: 0,
      memoryKb: 0,
    },
  }
}

async function prepare({ code, language, memoryLimitMb }) {
  if (!['cpp', 'c', 'python', 'javascript', 'java'].includes(language)) {
    return { ok: false, outcome: serviceErrorOutcome(`Unsupported local execution runner for ${language}`), dispose: async () => {} }
  }

  let workDir
  try {
    workDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'prephire-'))
  } catch (e) {
    return { ok: false, outcome: serviceErrorOutcome(`Could not create sandbox directory: ${e.code || 'error'}`), dispose: async () => {} }
  }
  const dispose = async () => {
    try {
      await fs.promises.rm(workDir, { recursive: true, force: true })
    } catch {
      /* best effort */
    }
  }

  const env = scrubbedEnv(workDir)
  const memMb = clamp(Number(memoryLimitMb) || 256, 16, 1024)

  try {
    // ── C / C++ ──────────────────────────────────────────────────────────
    if (language === 'cpp' || language === 'c') {
      const isCpp = language === 'cpp'
      const src = path.join(workDir, isCpp ? 'main.cpp' : 'main.c')
      const exe = path.join(workDir, IS_WIN ? 'main.exe' : 'main')
      await fs.promises.writeFile(src, code, 'utf8')
      const compiler = isCpp ? 'g++' : 'gcc'
      const args = isCpp ? ['-O2', '-std=gnu++17', src, '-o', exe] : ['-O2', '-std=gnu11', src, '-o', exe, '-lm']
      const c = await runProcess({
        cmd: compiler,
        args,
        cwd: workDir,
        env,
        timeoutMs: COMPILE_TIMEOUT_MS,
        limits: { cpuSec: 20, fsizeKb: 131072, vmKb: 4 * 1024 * 1024 },
      })
      if (c.spawnError) {
        return { ok: false, outcome: serviceErrorOutcome(`Compiler ${compiler} is not available on this host.`), dispose }
      }
      if (c.exitCode !== 0) return { ...compileFailure(c.stderr, c.timedOut), dispose }
      return {
        ok: true,
        dispose,
        run: {
          cmd: exe,
          args: [],
          cwd: workDir,
          env,
          limits: { vmKb: memMb * 1024 + 98304, stackKb: 65536, fsizeKb: 4096, nofile: 64 },
        },
      }
    }

    // ── Python ───────────────────────────────────────────────────────────
    if (language === 'python') {
      const src = path.join(workDir, 'main.py')
      await fs.promises.writeFile(src, code, 'utf8')
      const c = await runProcess({
        cmd: pythonCmd(),
        args: ['-I', '-B', '-m', 'py_compile', src],
        cwd: workDir,
        env,
        timeoutMs: COMPILE_TIMEOUT_MS,
        limits: { cpuSec: 10 },
      })
      if (c.spawnError) return { ok: false, outcome: serviceErrorOutcome('Python is not available on this host.'), dispose }
      if (c.exitCode !== 0) return { ...compileFailure(c.stderr || 'Python syntax error.', c.timedOut), dispose }
      return {
        ok: true,
        dispose,
        run: {
          cmd: pythonCmd(),
          args: ['-I', '-B', src],
          cwd: workDir,
          env,
          limits: { vmKb: memMb * 1024 + 262144, stackKb: 65536, fsizeKb: 4096, nofile: 64 },
        },
      }
    }

    // ── JavaScript (Node) ────────────────────────────────────────────────
    if (language === 'javascript') {
      const src = path.join(workDir, 'main.js')
      await fs.promises.writeFile(src, code, 'utf8')
      const c = await runProcess({
        cmd: 'node',
        args: ['--check', src],
        cwd: workDir,
        env,
        timeoutMs: COMPILE_TIMEOUT_MS,
        limits: { cpuSec: 10 },
      })
      if (c.spawnError) return { ok: false, outcome: serviceErrorOutcome('Node.js is not available on this host.'), dispose }
      if (c.exitCode !== 0) return { ...compileFailure(c.stderr || 'JavaScript syntax error.', c.timedOut), dispose }
      return {
        ok: true,
        dispose,
        run: {
          cmd: 'node',
          args: [`--max-old-space-size=${memMb}`, ...nodePermissionFlags(src), src],
          cwd: workDir,
          env,
          limits: { fsizeKb: 4096, nofile: 64 },
        },
      }
    }

    // ── Java ─────────────────────────────────────────────────────────────
    const classMatch = code.match(/public\s+(?:final\s+|abstract\s+)*(?:class|interface|enum|record)\s+([A-Za-z_$][\w$]*)/)
    const className = classMatch ? classMatch[1] : 'Main'
    const src = path.join(workDir, `${className}.java`)
    await fs.promises.writeFile(src, code, 'utf8')
    const c = await runProcess({
      cmd: 'javac',
      args: ['-encoding', 'UTF-8', '-J-Xmx512m', '-d', workDir, src],
      cwd: workDir,
      env,
      timeoutMs: COMPILE_TIMEOUT_MS,
      limits: { cpuSec: 20, fsizeKb: 131072 },
    })
    if (c.spawnError) return { ok: false, outcome: serviceErrorOutcome('javac is not available on this host.'), dispose }
    if (c.exitCode !== 0) return { ...compileFailure(c.stderr, c.timedOut), dispose }
    return {
      ok: true,
      dispose,
      run: {
        cmd: 'java',
        args: [`-Xmx${memMb}m`, '-Xss64m', '-XX:+UseSerialGC', '-Xshare:auto', '-cp', workDir, className],
        cwd: workDir,
        env,
        limits: { fsizeKb: 4096, nofile: 128 },
      },
    }
  } catch (e) {
    return { ok: false, outcome: serviceErrorOutcome(`Local sandbox setup failed: ${e.code || e.message}`), dispose }
  }
}

const MEMORY_ERROR_RE =
  /std::bad_alloc|MemoryError|OutOfMemoryError|Cannot allocate memory|heap out of memory|ENOMEM/i

async function runPrepared(prep, { stdin, timeLimitMs, language }) {
  const wallMs = clamp(effectiveTimeLimitMs(clamp(Number(timeLimitMs) || 2000, 100, 15000), language) + 100, 300, MAX_WALL_MS)
  const r = await runProcess({
    cmd: prep.run.cmd,
    args: prep.run.args,
    cwd: prep.run.cwd,
    env: prep.run.env,
    stdin,
    timeoutMs: wallMs,
    limits: { ...prep.run.limits, cpuSec: Math.ceil(wallMs / 1000) + 1 },
  })

  if (r.spawnError) return serviceErrorOutcome(`Execution failed to start: ${r.spawnError}`)

  const cpuKilled = r.signal === 'SIGXCPU'
  const timedOut = r.timedOut || cpuKilled
  const failed = r.exitCode !== 0 || r.signal != null
  const memoryExceeded = !timedOut && !r.outputExceeded && failed && MEMORY_ERROR_RE.test(r.stderr)
  const runtimeError = !timedOut && !memoryExceeded && (failed || r.outputExceeded)

  return {
    stdout: r.stdout,
    stderr: r.outputExceeded ? `${r.stderr}\nOutput limit exceeded (max ${MAX_STDOUT_BYTES / 1024 / 1024} MB).` : r.stderr,
    timeMs: r.timeMs,
    timedOut,
    memoryExceeded,
    runtimeError,
    compileError: false,
    idlenessError: false,
    serviceError: false,
    // Real peak memory can't be measured portably without cgroups; report 0
    // ("unknown") instead of the made-up 1024/2048/4096 KB the old code showed.
    memoryKb: 0,
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

/** Executes code once against one stdin. */
export async function executeLocally({ code, language, stdin, timeLimitMs, memoryLimitMb }) {
  if (!isLocalExecutionAllowed()) return serviceErrorOutcome(DISABLED_MESSAGE)
  warnIfRisky()
  const prep = await prepare({ code, language, memoryLimitMb })
  try {
    if (!prep.ok) return prep.outcome
    return await runPrepared(prep, { stdin, timeLimitMs, language })
  } finally {
    await prep.dispose()
  }
}

const availabilityCache = new Map() // language -> { ok, at }

/** Checks whether the host has the toolchain for `language`. Cached for 60s. */
export async function isLocalCompilerAvailable(language = 'cpp') {
  const cached = availabilityCache.get(language)
  if (cached && Date.now() - cached.at < 60_000) return cached.ok

  const probe = {
    cpp: ['g++', ['--version']],
    c: ['gcc', ['--version']],
    python: [pythonCmd(), ['--version']],
    javascript: ['node', ['--version']],
    java: ['javac', ['-version']],
  }[language]
  let ok = false
  if (probe) {
    const r = await runProcess({
      cmd: probe[0],
      args: probe[1],
      cwd: os.tmpdir(),
      env: { PATH: process.env.PATH || '' },
      timeoutMs: 3000,
    })
    ok = !r.spawnError && r.exitCode === 0
  }
  availabilityCache.set(language, { ok, at: Date.now() })
  return ok
}

/**
 * Compiles ONCE, then runs every test case against the same artefact.
 * Verdicts come from the shared determineVerdict() so they match the remote
 * backends exactly.
 */
export async function compileAndRunBatchLocally({ code, language, testCases, timeLimitMs, memoryLimitMb, onProgress }) {
  if (!isLocalExecutionAllowed()) throw new Error(DISABLED_MESSAGE)
  warnIfRisky()

  onProgress?.({ type: 'compiling' })
  const prep = await prepare({ code, language, memoryLimitMb })
  try {
    if (!prep.ok) {
      const verdict = determineVerdict(prep.outcome, '', timeLimitMs, language, { compare: false })
      const results = testCases.map((tc) => buildTestResult(tc, prep.outcome, verdict))
      const summary = summarize(results, testCases.length)
      onProgress?.({ type: 'complete', ...summary })
      return summary
    }

    const results = []
    let budgetLeft = MAX_TOTAL_RUN_BUDGET_MS
    for (let i = 0; i < testCases.length; i++) {
      const tc = testCases[i]
      let outcome
      if (budgetLeft <= 0) {
        // Protect the server: stop burning CPU once the whole submission has
        // used its wall-clock budget; the remaining tests count as TLE.
        outcome = { ...serviceErrorOutcome(''), serviceError: false, timedOut: true, stderr: 'Total execution budget exceeded.' }
      } else {
        outcome = await runPrepared(prep, { stdin: tc.input, timeLimitMs, language })
        budgetLeft -= outcome.timeMs || 0
      }
      const verdict = determineVerdict(outcome, tc.output, timeLimitMs, language, { compare: !tc.custom })
      results.push(buildTestResult(tc, outcome, verdict))
      onProgress?.({
        type: 'test',
        index: i + 1,
        total: testCases.length,
        verdict,
        passed: verdict === 'Accepted',
        timeMs: outcome.timeMs,
        memoryKb: outcome.memoryKb,
      })
    }
    const summary = summarize(results, testCases.length)
    onProgress?.({ type: 'complete', ...summary })
    return summary
  } finally {
    await prep.dispose()
  }
}
