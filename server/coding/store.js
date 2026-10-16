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
import { db } from '../firebase.js'

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
    try {
      fs.writeFileSync(file, JSON.stringify(data, null, 2))
    } catch (e) {
      console.warn('⚠️ Failed to write local JSON backup:', e.message)
    }
  }

  let memoryProblems = readJson(problemsFile)
  let memorySubmissions = readJson(submissionsFile)

  // Initialize Firestore synchronization if db is connected
  if (db) {
    ;(async () => {
      try {
        const probSnap = await db.collection('codingProblems').get()
        if (!probSnap.empty) {
          memoryProblems = probSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }))
          writeJson(problemsFile, memoryProblems)
          console.log(`✅ Loaded ${memoryProblems.length} coding problems from Firestore`)
        } else if (memoryProblems.length > 0) {
          // Seed Firestore with initial JSON problems
          console.log(`ℹ️ Seeding ${memoryProblems.length} initial coding problems into Firestore...`)
          const batch = db.batch()
          for (const p of memoryProblems) {
            const ref = db.collection('codingProblems').doc(p.id)
            batch.set(ref, p)
          }
          await batch.commit()
          console.log('✅ Successfully seeded coding problems to Firestore')
        }

        const subSnap = await db.collection('codingSubmissions').limit(500).get()
        if (!subSnap.empty) {
          memorySubmissions = subSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }))
          writeJson(submissionsFile, memorySubmissions)
          console.log(`✅ Loaded ${memorySubmissions.length} coding submissions from Firestore`)
        }
      } catch (err) {
        console.warn('⚠️ Firestore coding store sync notice:', err.message)
      }
    })()
  }

  async function syncProblemToFirestore(problem) {
    if (!db || !problem?.id) return
    try {
      await db.collection('codingProblems').doc(problem.id).set(problem, { merge: true })
    } catch (e) {
      console.warn('⚠️ Failed to sync problem to Firestore:', e.message)
    }
  }

  async function syncSubmissionToFirestore(submission) {
    if (!db || !submission?.id) return
    try {
      await db.collection('codingSubmissions').doc(submission.id).set(submission, { merge: true })
    } catch (e) {
      console.warn('⚠️ Failed to sync submission to Firestore:', e.message)
    }
  }

  return {
    listProblems: () => memoryProblems,
    saveProblems: (problems) => {
      memoryProblems = problems
      writeJson(problemsFile, problems)
      if (db) {
        // Sync any new or modified problems in background
        for (const p of problems) {
          syncProblemToFirestore(p)
        }
      }
    },
    listSubmissions: () => memorySubmissions,
    saveSubmissions: (submissions) => {
      memorySubmissions = submissions
      writeJson(submissionsFile, submissions)
      if (db && submissions.length > 0) {
        const latest = submissions[submissions.length - 1]
        syncSubmissionToFirestore(latest)
      }
    },
  }
}

