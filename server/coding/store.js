// ── Online Coding Platform — Data Store ─────────────────────────────────────
// Follows the same lightweight JSON-file persistence pattern already used by
// the Courses feature (server/index.js) so the platform can run without
// requiring Firestore IAM/service-account setup in every environment.
//
// ── DATABASE SCHEMA (documented here; mirrors 1:1 onto Firestore collections
//    `codingProblems` / `codingSubmissions` if/when this is migrated) ───────
//
// Problem {
//   id: string
//   title: string
//   slug: string                          // url-safe, unique
//   difficulty: 'Easy' | 'Medium' | 'Hard'
//   topics: string[]                      // tags e.g. ['Arrays', 'Two Pointers']
//   statement: string                     // problem statement (markdown)
//   constraints: string
//   inputFormat: string
//   outputFormat: string
//   sampleTests: TestCase[]               // visible to students, with explanation
//   hiddenTests: TestCase[]               // NEVER sent to students
//   timeLimitMs: number
//   memoryLimitMb: number
//   languages: string[]                   // supported language ids
//   starterCode: Record<languageId, string>
//   status: 'draft' | 'published'
//   createdByEmail: string
//   createdAt: ISOString
//   updatedAt: ISOString
// }
//
// TestCase { input: string, output: string, explanation?: string }
//
// Submission {
//   id: string
//   problemId: string
//   problemTitle: string
//   userEmail: string
//   userName: string
//   language: string
//   code: string
//   type: 'run' | 'submit'                // run = sample-only, submit = graded
//   verdict: 'Accepted' | 'Wrong Answer' | 'Time Limit Exceeded'
//            | 'Runtime Error' | 'Compilation Error'
//   passedCount: number
//   totalCount: number
//   runtimeMs: number
//   memoryKb: number
//   testResults: Array<{ passed, input, expectedOutput, actualOutput, stderr, timeMs, hidden }>
//   submittedAt: ISOString
// }
// ─────────────────────────────────────────────────────────────────────────────

import fs from 'node:fs'
import path from 'node:path'

export function createCodingStore(serverDir) {
  const dataDir = path.resolve(serverDir, 'uploads')
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true })

  const problemsFile = path.join(dataDir, 'coding_problems.json')
  const submissionsFile = path.join(dataDir, 'coding_submissions.json')

  function readJson(file) {
    if (!fs.existsSync(file)) return []
    try {
      return JSON.parse(fs.readFileSync(file, 'utf8'))
    } catch {
      return []
    }
  }

  function writeJson(file, data) {
    fs.writeFileSync(file, JSON.stringify(data, null, 2))
  }

  return {
    listProblems: () => readJson(problemsFile),
    saveProblems: (problems) => writeJson(problemsFile, problems),
    listSubmissions: () => readJson(submissionsFile),
    saveSubmissions: (submissions) => writeJson(submissionsFile, submissions),
  }
}
