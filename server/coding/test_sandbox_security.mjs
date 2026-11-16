// ── Sandbox security regression tests ───────────────────────────────────────
// Run: node coding/test_sandbox_security.mjs
// Needs no network: remote sandboxes are pointed at a dead port on purpose.
import assert from 'node:assert/strict'

process.env.GEMINI_API_KEY = 'SECRET-SHOULD-NEVER-LEAK'
process.env.JUDGE0_API_URL = 'http://127.0.0.1:1'
process.env.PISTON_API_URL = 'http://127.0.0.1:1'

const { runTestCases } = await import('./judge.js')
const jsEnvDump = `console.error(String(process.env.GEMINI_API_KEY)); console.log(Object.keys(process.env).join(','))`
const t = (name, fn) => fn().then(() => console.log('✅', name), (e) => { console.error('❌', name, '\n   ', e.message); process.exitCode = 1 })

// 1. Default config must NOT fall back to running on the API host.
delete process.env.JUDGE_ALLOW_LOCAL
process.env.JUDGE_PROVIDER = 'auto'
await t('auto mode with no sandbox reachable refuses host execution', async () => {
  const r = await runTestCases({ code: jsEnvDump, language: 'javascript', testCases: [{ input: '', output: 'x' }], timeLimitMs: 1000 })
  assert.equal(r.verdict, 'Sandbox Unavailable')
  assert.ok(!JSON.stringify(r).includes('SECRET-SHOULD-NEVER-LEAK'))
})
await t('explicit JUDGE_PROVIDER=local is also refused without opt-in', async () => {
  process.env.JUDGE_PROVIDER = 'local'
  const r = await runTestCases({ code: jsEnvDump, language: 'javascript', testCases: [{ input: '', output: 'x' }], timeLimitMs: 1000 })
  process.env.JUDGE_PROVIDER = 'auto'
  assert.equal(r.verdict, 'Sandbox Unavailable')
})

// 2. With the explicit dev opt-in, the host runner must still be hardened.
process.env.JUDGE_ALLOW_LOCAL = 'true'
await t('host runner: server secrets are not in the child environment', async () => {
  const r = await runTestCases({ code: jsEnvDump, language: 'javascript', testCases: [{ input: '', output: 'x' }], timeLimitMs: 2000 })
  assert.ok(!JSON.stringify(r).includes('SECRET-SHOULD-NEVER-LEAK'))
})
await t('hidden test input/stderr is never returned', async () => {
  const code = `const s=require('fs').readFileSync(0,'utf8'); console.error('LEAK='+s); console.log('wrong')`
  const r = await runTestCases({ code, language: 'javascript', testCases: [{ input: 'hidden-secret-42', output: 'ok', hidden: true }], timeLimitMs: 2000 })
  assert.ok(!JSON.stringify(r).includes('hidden-secret-42'))
  assert.equal(r.testResults[0].stderr, undefined)
  assert.equal(r.testResults[0].actualOutput, undefined)
})
await t('program that never reads stdin does not crash the server (EPIPE)', async () => {
  const r = await runTestCases({ code: `print('done')`, language: 'python', testCases: [{ input: 'x'.repeat(5_000_000), output: 'done' }], timeLimitMs: 2000 })
  assert.equal(r.verdict, 'Accepted')
})
await t('infinite output is capped, not buffered forever', async () => {
  const r = await runTestCases({ code: `while True: print('x'*1000)`, language: 'python', testCases: [{ input: '', output: '' }], timeLimitMs: 2000 })
  assert.notEqual(r.verdict, 'Accepted')
  assert.ok(JSON.stringify(r).length < 100_000)
})
await t('infinite loop -> TLE and child is killed', async () => {
  const r = await runTestCases({ code: `while True: pass`, language: 'python', testCases: [{ input: '', output: '' }], timeLimitMs: 500 })
  assert.equal(r.verdict, 'Time Limit Exceeded')
})
await t('memory bomb -> Memory Limit Exceeded', async () => {
  if (process.platform === 'win32') return // Windows does not have POSIX ulimit -v
  const r = await runTestCases({ code: `x = bytearray(900*1024*1024)`, language: 'python', testCases: [{ input: '', output: '' }], timeLimitMs: 2000, memoryLimitMb: 64 })
  assert.equal(r.verdict, 'Memory Limit Exceeded')
})
await t('JS cannot read other files or spawn processes', async () => {
  const code = `let o=[];try{require('fs').readFileSync('/etc/passwd');o.push('READ')}catch{o.push('no-read')};try{require('child_process').execSync('id');o.push('EXEC')}catch{o.push('no-exec')};console.log(o.join(','))`
  const r = await runTestCases({ code, language: 'javascript', testCases: [{ input: '', output: 'no-read,no-exec' }], timeLimitMs: 2000 })
  assert.equal(r.verdict, 'Accepted')
})
await t('trailing-whitespace tolerance is identical on the host path', async () => {
  const r = await runTestCases({ code: `print('1   ')\nprint('2')`, language: 'python', testCases: [{ input: '', output: '1\n2' }], timeLimitMs: 2000 })
  assert.equal(r.verdict, 'Accepted')
})
console.log(process.exitCode ? '\nSome security tests FAILED' : '\nAll sandbox security tests passed')
