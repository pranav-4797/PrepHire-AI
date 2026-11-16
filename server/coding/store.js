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

const MAX_SUBMISSIONS = 20_000 // bound memory + the size of the JSON file rewritten on every submit

// Firestore rejects `undefined` field values ("Cannot use undefined as a
// Firestore value"). Submission test results contain several (hidden tests have
// input/expectedOutput/actualOutput/stderr = undefined), so EVERY submission
// sync used to fail silently. JSON round-tripping drops them.
const clean = (obj) => JSON.parse(JSON.stringify(obj))

export function createCodingStore(serverDir) {
  const dataDir = path.resolve(serverDir, 'uploads')
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true })

  const problemsFile = path.join(dataDir, 'coding_problems.json')
  const submissionsFile = path.join(dataDir, 'coding_submissions.json')

  function readJson(file) {
    if (!fs.existsSync(file)) return []
    try {
      const parsed = JSON.parse(fs.readFileSync(file, 'utf8'))
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }

  // Atomic write: a crash mid-write used to leave a truncated JSON file that
  // readJson() then treated as "empty", silently wiping all problems.
  function writeJson(file, data) {
    try {
      const tmp = `${file}.${process.pid}.tmp`
      fs.writeFileSync(tmp, JSON.stringify(data))
      fs.renameSync(tmp, file)
    } catch (e) {
      console.warn('⚠️ Failed to write local JSON backup:', e.message)
    }
  }

  let memoryProblems = readJson(problemsFile)
  let memorySubmissions = readJson(submissionsFile)
  const syncedProblemHash = new Map() // id -> JSON string last written to Firestore

  // Initialize Firestore synchronization if db is connected
  if (db) {
    ;(async () => {
      try {
        const probSnap = await db.collection('codingProblems').get()
        if (!probSnap.empty) {
          memoryProblems = probSnap.docs.map((doc) => ({ ...doc.data(), id: doc.id }))
          for (const p of memoryProblems) syncedProblemHash.set(p.id, JSON.stringify(clean(p)))
          writeJson(problemsFile, memoryProblems)
          console.log(`✅ Loaded ${memoryProblems.length} coding problems from Firestore`)
        } else if (memoryProblems.length > 0) {
          console.log(`ℹ️ Seeding ${memoryProblems.length} initial coding problems into Firestore...`)
          const batch = db.batch()
          for (const p of memoryProblems) batch.set(db.collection('codingProblems').doc(p.id), clean(p))
          await batch.commit()
          for (const p of memoryProblems) syncedProblemHash.set(p.id, JSON.stringify(clean(p)))
          console.log('✅ Successfully seeded coding problems to Firestore')
        }

        // Newest N, not an arbitrary 500 (a bare limit() has no defined order).
        const subSnap = await db.collection('codingSubmissions').orderBy('submittedAt', 'desc').limit(MAX_SUBMISSIONS).get()
        if (!subSnap.empty) {
          memorySubmissions = subSnap.docs.map((doc) => ({ ...doc.data(), id: doc.id })).reverse() // oldest -> newest
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
    const data = clean(problem)
    const hash = JSON.stringify(data)
    if (syncedProblemHash.get(problem.id) === hash) return // unchanged: skip the write
    try {
      // No { merge: true }: a merge never removes fields, so edits that drop a
      // field (e.g. clearing targetBranch) were silently resurrected on restart.
      await db.collection('codingProblems').doc(problem.id).set(data)
      syncedProblemHash.set(problem.id, hash)
    } catch (e) {
      console.warn('⚠️ Failed to sync problem to Firestore:', e.message)
    }
  }

  async function syncSubmissionToFirestore(submission) {
    if (!db || !submission?.id) return
    try {
      await db.collection('codingSubmissions').doc(submission.id).set(clean(submission))
    } catch (e) {
      console.warn('⚠️ Failed to sync submission to Firestore:', e.message)
    }
  }

  async function deleteProblemFromFirestore(id) {
    if (!db || !id) return
    try {
      await db.collection('codingProblems').doc(id).delete()
      syncedProblemHash.delete(id)
    } catch (e) {
      console.warn('⚠️ Failed to delete problem from Firestore:', e.message)
    }
  }

  return {
    listProblems: () => memoryProblems,
    saveProblems: (problems) => {
      // Deleted problems were never removed from Firestore, so they came back
      // from the dead on the next server restart. Diff and delete them.
      const keep = new Set(problems.map((p) => p.id))
      for (const old of memoryProblems) {
        if (!keep.has(old.id)) deleteProblemFromFirestore(old.id)
      }
      memoryProblems = problems
      writeJson(problemsFile, problems)
      for (const p of problems) syncProblemToFirestore(p) // only changed docs are written
    },
    listSubmissions: () => memorySubmissions,
    addSubmission: (submission) => {
      memorySubmissions.push(submission)
      if (memorySubmissions.length > MAX_SUBMISSIONS) {
        memorySubmissions = memorySubmissions.slice(memorySubmissions.length - MAX_SUBMISSIONS)
      }
      writeJson(submissionsFile, memorySubmissions)
      syncSubmissionToFirestore(submission)
    },
  }
}
