// ── Online Coding Platform — Local Toolchain Adapter ────────────────────────
// Executes code locally using available host compilers/interpreters
// (g++, gcc, python, node, javac/java) as an offline resilience layer when
// external sandbox APIs (Judge0, Piston) are network-restricted or offline.
// ─────────────────────────────────────────────────────────────────────────────

import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

export async function executeLocally({ code, language, stdin, timeLimitMs }) {
  const timeoutMs = Math.min(Math.max(timeLimitMs || 2000, 500), 10000)
  const tmpDir = os.tmpdir()
  const uid = 'prephire_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7)

  // ── C++ and C ───────────────────────────────────────────────────────────
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
          runtimeError: false,
          timedOut: false,
          memoryExceeded: false,
          idlenessError: false,
          serviceError: false,
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
            memoryExceeded: false,
            idlenessError: false,
            serviceError: false,
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
            timedOut: false,
            memoryExceeded: false,
            idlenessError: false,
            serviceError: false,
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
      return { stdout: '', stderr: e.message, runtimeError: true, compileError: false, timedOut: false, memoryExceeded: false, idlenessError: false, serviceError: false, timeMs: 0, memoryKb: 0 }
    }
  }

  // ── Python ──────────────────────────────────────────────────────────────
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
            memoryExceeded: false,
            idlenessError: false,
            serviceError: false,
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
            timedOut: false,
            memoryExceeded: false,
            idlenessError: false,
            serviceError: false,
            memoryKb: 0,
          })
        })
      })
      try { await fs.promises.unlink(srcFile) } catch {}
      return runRes
    } catch (e) {
      try { await fs.promises.unlink(srcFile) } catch {}
      return { stdout: '', stderr: e.message, runtimeError: true, compileError: false, timedOut: false, memoryExceeded: false, idlenessError: false, serviceError: false, timeMs: 0, memoryKb: 0 }
    }
  }

  // ── JavaScript ──────────────────────────────────────────────────────────
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
            memoryExceeded: false,
            idlenessError: false,
            serviceError: false,
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
            timedOut: false,
            memoryExceeded: false,
            idlenessError: false,
            serviceError: false,
            memoryKb: 0,
          })
        })
      })
      try { await fs.promises.unlink(srcFile) } catch {}
      return runRes
    } catch (e) {
      try { await fs.promises.unlink(srcFile) } catch {}
      return { stdout: '', stderr: e.message, runtimeError: true, compileError: false, timedOut: false, memoryExceeded: false, idlenessError: false, serviceError: false, timeMs: 0, memoryKb: 0 }
    }
  }

  // ── Java (Host Fallback) ────────────────────────────────────────────────
  if (language === 'java') {
    const javaDir = path.join(tmpDir, uid)
    try {
      await fs.promises.mkdir(javaDir, { recursive: true })
      // Extract class name or default to Main
      const classMatch = code.match(/public\s+class\s+([A-Za-z0-9_]+)/)
      const className = classMatch ? classMatch[1] : 'Main'
      const srcFile = path.join(javaDir, `${className}.java`)
      await fs.promises.writeFile(srcFile, code, 'utf8')

      // Compile step
      const compileRes = await new Promise((resolve) => {
        const cp = spawn('javac', [srcFile], { timeout: 10000 })
        let stderr = ''
        cp.stderr.on('data', (d) => { stderr += d })
        cp.on('close', (exitCode) => resolve({ success: exitCode === 0, stderr }))
        cp.on('error', (err) => resolve({ success: false, stderr: `Compiler javac not available: ${err.message}` }))
      })

      if (!compileRes.success) {
        try { await fs.promises.rm(javaDir, { recursive: true, force: true }) } catch {}
        return {
          stdout: '',
          stderr: compileRes.stderr || 'Compilation failed.',
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

      // Execute step
      const started = Date.now()
      const runRes = await new Promise((resolve) => {
        const cp = spawn('java', ['-cp', javaDir, className], { timeout: timeoutMs })
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
            memoryExceeded: false,
            idlenessError: false,
            serviceError: false,
            memoryKb: 0,
          })
        })
        cp.on('error', (err) => {
          resolve({
            stdout: '',
            stderr: `Java execution failed: ${err.message}`,
            timeMs: Date.now() - started,
            runtimeError: true,
            compileError: false,
            timedOut: false,
            memoryExceeded: false,
            idlenessError: false,
            serviceError: false,
            memoryKb: 0,
          })
        })
      })

      try { await fs.promises.rm(javaDir, { recursive: true, force: true }) } catch {}
      return runRes
    } catch (e) {
      try { await fs.promises.rm(javaDir, { recursive: true, force: true }) } catch {}
      return { stdout: '', stderr: e.message, runtimeError: true, compileError: false, timedOut: false, memoryExceeded: false, idlenessError: false, serviceError: false, timeMs: 0, memoryKb: 0 }
    }
  }

  return {
    stdout: '',
    stderr: `Unsupported local execution runner for ${language}`,
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
