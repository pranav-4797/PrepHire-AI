// ── Automated Test Suite for Upgraded Judging Infrastructure ──────────────
import 'dotenv/config'
import { runTestCases, runTestCasesStreaming, getActiveJudgeInfo } from './judge.js'

async function runSuite() {
  console.log('🧪 Starting Judge Integration Test Suite...\n')

  // Test 1: Check Judge Provider Info
  console.log('--- Test 1: Active Judge Diagnostics ---')
  const info = await getActiveJudgeInfo()
  console.log('Active Judge Info:', info)
  if (!info.provider) throw new Error('No active provider resolved')
  console.log('✅ Test 1 Passed\n')

  // Test 2: Correct C++ Solution (Accepted)
  console.log('--- Test 2: C++ Correct Solution (Accepted) ---')
  const cppAcceptedCode = `#include <iostream>
using namespace std;
int main() {
    long long a, b;
    if (cin >> a >> b) {
        cout << (a + b) << endl;
        cout << (a - b) << endl;
    }
    return 0;
}`
  const sampleTests = [
    { input: '10 5\n', output: '15\n5\n', hidden: false },
    { input: '100 25\n', output: '125\n75\n', hidden: false },
    { input: '-5 12\n', output: '7\n-17\n', hidden: true }
  ]
  const res2 = await runTestCases({
    code: cppAcceptedCode,
    language: 'cpp',
    testCases: sampleTests,
    timeLimitMs: 2000,
    memoryLimitMb: 256,
  })
  console.log(`Verdict: ${res2.verdict}, Passed: ${res2.passedCount}/${res2.totalCount}, Runtime: ${res2.runtimeMs}ms, Memory: ${res2.memoryKb}KB`)
  if (res2.verdict !== 'Accepted') throw new Error(`Expected Accepted, got ${res2.verdict}`)
  if (res2.passedCount !== 3) throw new Error(`Expected 3 passed, got ${res2.passedCount}`)
  // Verify hidden tests didn't leak input/output
  const hiddenTest = res2.testResults[2]
  if (hiddenTest.input !== undefined || hiddenTest.expectedOutput !== undefined) {
    throw new Error('Hidden test leaked input or expectedOutput!')
  }
  console.log('✅ Test 2 Passed\n')

  // Test 3: C++ Wrong Answer
  console.log('--- Test 3: C++ Wrong Answer ---')
  const cppWrongCode = `#include <iostream>
using namespace std;
int main() {
    long long a, b;
    cin >> a >> b;
    cout << (a * b) << endl; // Wrong logic
    cout << (a - b) << endl;
    return 0;
}`
  const res3 = await runTestCases({
    code: cppWrongCode,
    language: 'cpp',
    testCases: sampleTests,
    timeLimitMs: 2000,
    memoryLimitMb: 256,
  })
  console.log(`Verdict: ${res3.verdict}, Passed: ${res3.passedCount}/${res3.totalCount}`)
  if (res3.verdict !== 'Wrong Answer') throw new Error(`Expected Wrong Answer, got ${res3.verdict}`)
  console.log('✅ Test 3 Passed\n')

  // Test 4: C++ Compilation Error
  console.log('--- Test 4: C++ Compilation Error ---')
  const cppCeCode = `#include <iostream>
using namespace std;
int main( { // Syntax error
    return 0;
}`
  const res4 = await runTestCases({
    code: cppCeCode,
    language: 'cpp',
    testCases: sampleTests,
    timeLimitMs: 2000,
    memoryLimitMb: 256,
  })
  console.log(`Verdict: ${res4.verdict}, Passed: ${res4.passedCount}/${res4.totalCount}`)
  if (res4.verdict !== 'Compilation Error') throw new Error(`Expected Compilation Error, got ${res4.verdict}`)
  if (!res4.testResults[0].stderr) throw new Error('Expected compilation error stderr to be populated')
  console.log('✅ Test 4 Passed\n')

  // Test 5: C++ Time Limit Exceeded
  console.log('--- Test 5: C++ Time Limit Exceeded (TLE) ---')
  const cppTleCode = `#include <iostream>
using namespace std;
int main() {
    while(true) {}
    return 0;
}`
  const res5 = await runTestCases({
    code: cppTleCode,
    language: 'cpp',
    testCases: [{ input: '10 5\n', output: '15\n5\n' }],
    timeLimitMs: 1000,
    memoryLimitMb: 256,
  })
  console.log(`Verdict: ${res5.verdict}, Runtime: ${res5.runtimeMs}ms`)
  if (res5.verdict !== 'Time Limit Exceeded') throw new Error(`Expected Time Limit Exceeded, got ${res5.verdict}`)
  console.log('✅ Test 5 Passed\n')

  // Test 6: Python 3 Accepted
  console.log('--- Test 6: Python 3 Solution ---')
  const pyCode = `import sys
lines = sys.stdin.read().split()
if lines:
    a, b = int(lines[0]), int(lines[1])
    print(a + b)
    print(a - b)
`
  const res6 = await runTestCases({
    code: pyCode,
    language: 'python',
    testCases: sampleTests,
    timeLimitMs: 2000,
    memoryLimitMb: 256,
  })
  console.log(`Python Verdict: ${res6.verdict}, Passed: ${res6.passedCount}/${res6.totalCount}`)
  if (res6.verdict !== 'Accepted') throw new Error(`Expected Accepted, got ${res6.verdict}`)
  console.log('✅ Test 6 Passed\n')

  // Test 7: JavaScript Solution
  console.log('--- Test 7: JavaScript Solution ---')
  const jsCode = `const fs = require('fs');
const input = fs.readFileSync(0, 'utf-8').trim().split(/\\s+/);
if (input.length >= 2) {
  const a = parseInt(input[0], 10);
  const b = parseInt(input[1], 10);
  console.log(a + b);
  console.log(a - b);
}
`
  const res7 = await runTestCases({
    code: jsCode,
    language: 'javascript',
    testCases: sampleTests,
    timeLimitMs: 2000,
    memoryLimitMb: 256,
  })
  console.log(`JS Verdict: ${res7.verdict}, Passed: ${res7.passedCount}/${res7.totalCount}`)
  if (res7.verdict !== 'Accepted') throw new Error(`Expected Accepted, got ${res7.verdict}`)
  console.log('✅ Test 7 Passed\n')

  // Test 8: SSE Streaming Progress
  console.log('--- Test 8: SSE Live Judge Streaming Progress ---')
  const streamEvents = []
  const res8 = await runTestCasesStreaming({
    code: cppAcceptedCode,
    language: 'cpp',
    testCases: sampleTests,
    timeLimitMs: 2000,
    memoryLimitMb: 256,
    onProgress: (event) => {
      streamEvents.push(event)
    }
  })
  console.log(`Total SSE Events: ${streamEvents.length}, Event types: ${streamEvents.map(e => e.type).join(' -> ')}`)
  if (!streamEvents.some(e => e.type === 'compiling')) throw new Error('Missing compiling event')
  if (!streamEvents.some(e => e.type === 'test')) throw new Error('Missing test progress event')
  if (!streamEvents.some(e => e.type === 'complete')) throw new Error('Missing complete event')
  if (res8.verdict !== 'Accepted') throw new Error(`Streaming expected Accepted, got ${res8.verdict}`)
  console.log('✅ Test 8 Passed\n')

  // Test 9: Concurrent Submissions
  console.log('--- Test 9: Concurrent Submissions Simulation ---')
  const concurrentRuns = await Promise.all([
    runTestCases({ code: cppAcceptedCode, language: 'cpp', testCases: [sampleTests[0]], timeLimitMs: 2000 }),
    runTestCases({ code: pyCode, language: 'python', testCases: [sampleTests[0]], timeLimitMs: 2000 }),
    runTestCases({ code: jsCode, language: 'javascript', testCases: [sampleTests[0]], timeLimitMs: 2000 })
  ])
  const allConcurrentAccepted = concurrentRuns.every(r => r.verdict === 'Accepted')
  console.log(`Concurrent results: ${concurrentRuns.map(r => r.verdict).join(', ')}`)
  if (!allConcurrentAccepted) throw new Error('Not all concurrent runs passed')
  console.log('✅ Test 9 Passed\n')

  console.log('🎉 ALL 9 TEST SUITE CASES PASSED CLEANLY! Judging engine is fully validated.')
}

runSuite().catch(err => {
  console.error('❌ Test suite failed:', err)
  process.exit(1)
})
