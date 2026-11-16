// ── Online Coding Platform — REST API ───────────────────────────────────────
// Mounted under /api/coding by server/index.js.
//
// AUTHORIZATION MODEL: every request's identity is resolved server-side by
// resolveAuthUser() (server/coding/authMiddleware.js), which verifies the
// Firebase ID token sent as `Authorization: Bearer <token>` and looks up the
// role from Firestore itself — the client cannot assert its own role.
//   • Faculty + Admin may create problems; a Faculty member may only edit or
//     delete problems they created, an Admin may manage all of them.
//   • requireAuth() gates run/submit/dashboard so the sandboxed execution
//     service can't be hit anonymously.
//   • Students can only run/submit PUBLISHED problems.
// ─────────────────────────────────────────────────────────────────────────────

import express from 'express'
import { createCodingStore } from './store.js'
import { runTestCases, runTestCasesStreaming, getActiveJudgeInfo, SUPPORTED_LANGUAGES, LANGUAGE_CONFIG } from './judge.js'
import {
  requireAdmin as requireAdminAuth,
  requireFacultyOrAdmin as requireFacultyOrAdminAuth,
  requireAuth,
  attachUserOptional,
} from './authMiddleware.js'
import { callGemini, isRateLimited } from '../gemini.js'
import { generateCodingProblemWithAI } from '../nvidia.js'
import { userRateLimit } from './userLimiter.js'

// ── Limits (protect the sandbox, the JSON store and the LLM budget) ──────────
const MAX_CODE_CHARS = 100_000
const MAX_STDIN_CHARS = 64 * 1024
const MAX_TESTS_PER_GROUP = 100
const MAX_TEST_FIELD_CHARS = 100_000
const MAX_STATEMENT_CHARS = 50_000

const asString = (v) => (Array.isArray(v) ? String(v[0] ?? '') : typeof v === 'string' ? v : v == null ? '' : String(v))
const clampNum = (v, lo, hi, dflt) => {
  const n = Number(v)
  return Number.isFinite(n) ? Math.min(Math.max(Math.round(n), lo), hi) : dflt
}
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7)

export function registerCodingRoutes(app, { serverDir }) {
  const store = createCodingStore(serverDir)
  const router = express.Router()

  const requireAdmin = requireAdminAuth()
  const requireFacultyOrAdmin = requireFacultyOrAdminAuth()
  // Per-user (not per-IP) budget for anything that executes code: a whole lab
  // shares one NAT address, so an IP limit alone punishes honest students.
  const execLimit = userRateLimit({ name: 'exec', limit: 20, windowMs: 60_000, message: 'Too many code runs — please wait a moment.' })

  function isPrivileged(req) {
    const role = (req.authUser?.role || '').toLowerCase()
    return role === 'admin' || role === 'faculty'
  }

  /** Admin can manage everything; Faculty only what they created (or unowned legacy rows). */
  function canModifyProblem(req, problem) {
    const role = (req.authUser?.role || '').toLowerCase()
    if (role === 'admin') return true
    if (role !== 'faculty') return false
    const owner = (problem.createdByEmail || '').toLowerCase()
    return !owner || owner === (req.authUser.email || '').toLowerCase()
  }

  function slugify(title) {
    return (title || '')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')
  }

  // Strips fields students must never see (hidden test cases, admin metadata).
  function toStudentProblem(problem) {
    const { hiddenTests, ...safe } = problem
    return { ...safe, hiddenTestCount: (hiddenTests || []).length }
  }

  // ── Payload validation / normalisation ─────────────────────────────────
  function validateTests(list, label, errors) {
    if (!Array.isArray(list)) {
      errors.push(`${label} must be an array`)
      return
    }
    if (list.length > MAX_TESTS_PER_GROUP) errors.push(`${label} may contain at most ${MAX_TESTS_PER_GROUP} cases`)
    list.forEach((t, i) => {
      if (!t || typeof t !== 'object') return errors.push(`${label}[${i}] must be an object`)
      if (typeof t.input !== 'string' || typeof t.output !== 'string') {
        return errors.push(`${label}[${i}] needs string input and output`)
      }
      if (t.input.length > MAX_TEST_FIELD_CHARS || t.output.length > MAX_TEST_FIELD_CHARS) {
        errors.push(`${label}[${i}] is too large`)
      }
      if (t.explanation !== undefined && typeof t.explanation !== 'string') {
        errors.push(`${label}[${i}].explanation must be a string`)
      }
    })
  }

  function validateProblemPayload(body, { partial = false } = {}) {
    const errors = []
    const has = (k) => body[k] !== undefined && body[k] !== null && body[k] !== ''
    for (const key of ['title', 'statement', 'difficulty']) {
      if (!partial && !has(key)) errors.push(`${key} is required`)
    }
    if (has('title') && (typeof body.title !== 'string' || body.title.length > 200)) errors.push('title must be a string of at most 200 characters')
    if (has('statement') && (typeof body.statement !== 'string' || body.statement.length > MAX_STATEMENT_CHARS)) {
      errors.push(`statement must be a string of at most ${MAX_STATEMENT_CHARS} characters`)
    }
    if (body.difficulty && !['Easy', 'Medium', 'Hard'].includes(body.difficulty)) {
      errors.push('difficulty must be Easy, Medium, or Hard')
    }
    if (body.languages !== undefined) {
      if (!Array.isArray(body.languages) || body.languages.some((l) => typeof l !== 'string')) {
        errors.push('languages must be an array of strings')
      } else {
        const invalid = body.languages.filter((l) => !SUPPORTED_LANGUAGES.includes(l))
        if (invalid.length) errors.push(`unsupported languages: ${invalid.join(', ')}`)
      }
    }
    if (body.topics !== undefined) {
      if (!Array.isArray(body.topics) || body.topics.length > 20 || body.topics.some((t) => typeof t !== 'string' || t.length > 60)) {
        errors.push('topics must be an array of at most 20 short strings')
      }
    }
    if (body.status && !['draft', 'published'].includes(body.status)) {
      errors.push('status must be draft or published')
    }
    if (body.starterCode !== undefined) {
      const sc = body.starterCode
      if (!sc || typeof sc !== 'object' || Array.isArray(sc) || Object.values(sc).some((v) => typeof v !== 'string' || v.length > MAX_CODE_CHARS)) {
        errors.push('starterCode must be an object of strings')
      }
    }
    for (const k of ['constraints', 'inputFormat', 'outputFormat']) {
      if (body[k] !== undefined && body[k] !== null && typeof body[k] !== 'string') errors.push(`${k} must be a string`)
    }
    if (body.sampleTests !== undefined) validateTests(body.sampleTests, 'sampleTests', errors)
    if (body.hiddenTests !== undefined) validateTests(body.hiddenTests, 'hiddenTests', errors)

    if (!partial) {
      if (!Array.isArray(body.sampleTests) || body.sampleTests.length === 0) {
        errors.push('at least one sample test case is required')
      }
      if (body.status === 'published' && (!Array.isArray(body.hiddenTests) || body.hiddenTests.length === 0)) {
        errors.push('at least one hidden test case is required to publish')
      }
    }
    return errors
  }

  // Whitelist of client-writable fields. The old PUT did { ...existing, ...req.body },
  // letting a caller overwrite anything (slug, assignedBy, arbitrary junk keys…).
  const normTests = (list) => (list || []).map((t) => ({ input: t.input, output: t.output, ...(t.explanation ? { explanation: t.explanation } : {}) }))
  function pickProblemFields(body) {
    const out = {}
    const has = (k) => Object.prototype.hasOwnProperty.call(body, k) && body[k] !== undefined
    if (has('title')) out.title = body.title.trim()
    if (has('difficulty')) out.difficulty = body.difficulty
    if (has('topics')) out.topics = body.topics
    if (has('statement')) out.statement = body.statement
    for (const k of ['constraints', 'inputFormat', 'outputFormat']) if (has(k)) out[k] = body[k] || ''
    if (has('sampleTests')) out.sampleTests = normTests(body.sampleTests)
    if (has('hiddenTests')) out.hiddenTests = normTests(body.hiddenTests)
    if (has('timeLimitMs')) out.timeLimitMs = clampNum(body.timeLimitMs, 100, 15000, 2000)
    if (has('memoryLimitMb')) out.memoryLimitMb = clampNum(body.memoryLimitMb, 16, 512, 256)
    if (has('languages')) out.languages = body.languages.length ? body.languages : SUPPORTED_LANGUAGES
    if (has('starterCode')) out.starterCode = body.starterCode
    if (has('status')) out.status = body.status === 'published' ? 'published' : 'draft'
    if (has('targetBranch')) out.targetBranch = body.targetBranch ? asString(body.targetBranch).slice(0, 100) : null
    if (has('dueDate')) out.dueDate = body.dueDate ? asString(body.dueDate).slice(0, 40) : null
    return out
  }

  /** Shared guard for run / submit / review. Returns the problem or sends the error. */
  function loadRunnableProblem(req, res) {
    const problem = store.listProblems().find((p) => p.id === req.params.id)
    // Students must not be able to execute against unpublished drafts (they could
    // otherwise probe a draft's samples/limits by guessing ids).
    if (!problem || (!isPrivileged(req) && problem.status !== 'published')) {
      res.status(404).json({ error: 'Problem not found' })
      return null
    }
    return problem
  }

  function validateCodePayload(body, res) {
    const { code, language } = body || {}
    if (typeof code !== 'string' || !code.trim() || typeof language !== 'string') {
      res.status(400).json({ error: 'code and language are required' })
      return false
    }
    if (code.length > MAX_CODE_CHARS) {
      res.status(413).json({ error: `Code is too large (max ${MAX_CODE_CHARS} characters).` })
      return false
    }
    if (!SUPPORTED_LANGUAGES.includes(language)) {
      res.status(400).json({ error: `Unsupported language: ${language}` })
      return false
    }
    return true
  }

  function allTestsFor(problem) {
    return [
      ...(problem.sampleTests || []).map((t) => ({ ...t, hidden: false })),
      ...(problem.hiddenTests || []).map((t) => ({ ...t, hidden: true })),
    ]
  }

  function buildSubmission({ problem, req, result }) {
    const email = req.authUser.email
    const rawName = req.authUser.name || (typeof req.body.name === 'string' ? req.body.name : '') || email.split('@')[0]
    return {
      id: newId(),
      problemId: problem.id,
      problemTitle: problem.title,
      difficulty: problem.difficulty,
      userEmail: email,
      userName: rawName.trim().slice(0, 80),
      language: req.body.language,
      code: req.body.code,
      type: 'submit',
      verdict: result.verdict,
      passedCount: result.passedCount,
      totalCount: result.totalCount,
      runtimeMs: result.runtimeMs,
      memoryKb: result.memoryKb,
      // Hidden-case bodies are never persisted into the client-visible record.
      testResults: result.testResults.map((r) =>
        r.hidden ? { passed: r.passed, verdict: r.verdict, hidden: true, timeMs: r.timeMs, memoryKb: r.memoryKb } : r,
      ),
      submittedAt: new Date().toISOString(),
    }
  }

  // ── Meta ───────────────────────────────────────────────────────────────
  router.get('/languages', (_req, res) => {
    res.json(SUPPORTED_LANGUAGES.map((id) => ({ id, label: LANGUAGE_CONFIG[id].label })))
  })

  // Admin only: it probes upstream sandboxes and reveals infrastructure details.
  router.get('/judge-status', requireAdmin, async (_req, res) => {
    try {
      res.json(await getActiveJudgeInfo())
    } catch (e) {
      console.error('judge-status failed:', e)
      res.status(500).json({ error: 'Failed to get judge status' })
    }
  })

  // ── Problems ──────────────────────────────────────────────────────────
  router.get('/problems', attachUserOptional(), (req, res) => {
    const difficulty = asString(req.query.difficulty)
    const topic = asString(req.query.topic)
    const search = asString(req.query.search)
    const status = asString(req.query.status)
    const privileged = isPrivileged(req)
    let problems = store.listProblems()

    if (!privileged) {
      problems = problems.filter((p) => p.status === 'published')
    } else if (status && status !== 'All') {
      problems = problems.filter((p) => p.status === status.toLowerCase())
    }
    if (difficulty && difficulty !== 'All') problems = problems.filter((p) => p.difficulty === difficulty)
    if (topic && topic !== 'All') problems = problems.filter((p) => (p.topics || []).includes(topic))
    if (search) {
      const q = search.toLowerCase()
      problems = problems.filter(
        (p) => (p.title || '').toLowerCase().includes(q) || (p.topics || []).some((t) => t.toLowerCase().includes(q)),
      )
    }

    // copy before sorting — sort() mutates, and this array can be the live store
    problems = [...problems].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    res.json(
      problems.map((p) => ({
        id: p.id,
        title: p.title,
        slug: p.slug,
        difficulty: p.difficulty,
        topics: p.topics || [],
        status: p.status,
        languages: p.languages || [],
        targetBranch: p.targetBranch || null,
        dueDate: p.dueDate || null,
        assignedBy: p.assignedBy || null,
      })),
    )
  })

  router.get('/problems/:id', attachUserOptional(), (req, res) => {
    const problem = store.listProblems().find((p) => p.id === req.params.id)
    if (!problem) return res.status(404).json({ error: 'Problem not found' })

    const privileged = isPrivileged(req)
    if (!privileged && problem.status !== 'published') {
      return res.status(404).json({ error: 'Problem not found' })
    }
    res.json(privileged ? problem : toStudentProblem(problem))
  })

  // ── AI Automated Problem Generator (NVIDIA NIM / Gemini Fallback) ──────
  // Takes faculty prompt/difficulty/languages, generates a complete structured
  // problem, and pre-validates the reference solution inside the sandbox.
  router.post('/generate-problem', requireFacultyOrAdmin, async (req, res) => {
    const { topic, difficulty, languages, facultyNotes, model, validateWithSandbox = true } = req.body
    if (!topic || typeof topic !== 'string' || !topic.trim() || topic.length > 500) {
      return res.status(400).json({ error: 'topic is required (max 500 characters)' })
    }
    // Each call costs LLM tokens + sandbox time; it previously had no throttle at all.
    if (isRateLimited(`gen:${req.authUser.uid || req.authUser.email}`)) {
      return res.status(429).json({ error: 'Too many generation requests — please wait a moment and try again.' })
    }

    try {
      const clientApiKey = typeof req.headers['x-gemini-key'] === 'string' ? req.headers['x-gemini-key'] : null
      const generated = await generateCodingProblemWithAI({
        topic: topic.trim(),
        difficulty: ['Easy', 'Medium', 'Hard'].includes(difficulty) ? difficulty : 'Medium',
        languages: Array.isArray(languages) && languages.length ? languages.filter((l) => SUPPORTED_LANGUAGES.includes(l)) : ['python', 'javascript', 'cpp', 'java'],
        facultyNotes: typeof facultyNotes === 'string' ? facultyNotes.slice(0, 4000) : '',
        model: typeof model === 'string' ? model.slice(0, 120) : undefined,
        clientApiKey,
      })

      let preflight = { tested: false, allPassed: true, passedCount: 0, totalCount: 0, details: [] }

      // Sandbox pre-validation of the AI's reference solution. This executes
      // LLM-written code, which is another reason host execution is opt-in only.
      if (validateWithSandbox && generated.referenceSolution?.code) {
        const refLang = generated.referenceSolution.language || 'python'
        const allTests = [
          ...(generated.sampleTests || []).map((t) => ({ ...t, hidden: false })),
          ...(generated.hiddenTests || []).map((t) => ({ ...t, hidden: true })),
        ]

        if (allTests.length > 0 && SUPPORTED_LANGUAGES.includes(refLang)) {
          try {
            const outcome = await runTestCases({
              code: generated.referenceSolution.code,
              language: refLang,
              testCases: allTests,
              timeLimitMs: generated.timeLimitMs || 2000,
              memoryLimitMb: generated.memoryLimitMb || 256,
            })
            const passed = outcome.passedCount ?? (outcome.testResults || []).filter((r) => r.passed).length
            const total = outcome.totalCount || allTests.length
            preflight = {
              tested: true,
              allPassed: outcome.verdict === 'Accepted' || passed === total,
              passedCount: passed,
              totalCount: total,
              verdict: outcome.verdict || (passed === total ? 'Accepted' : 'Wrong Answer'),
              details: outcome.testResults || [],
            }
          } catch (execErr) {
            console.warn('Sandbox pre-validation error (non-fatal):', execErr.message)
            preflight = {
              tested: true,
              allPassed: false,
              passedCount: 0,
              totalCount: allTests.length,
              verdict: 'Sandbox Offline',
              error: 'Sandbox unavailable',
            }
          }
        }
      }

      res.json({ success: true, problem: generated, preflight })
    } catch (err) {
      console.error('AI problem generation failed:', err)
      res.status(500).json({ error: 'Failed to generate coding problem' })
    }
  })

  router.post('/problems', requireFacultyOrAdmin, (req, res) => {
    const errors = validateProblemPayload(req.body)
    if (errors.length) return res.status(400).json({ error: errors.join('; ') })

    const problems = store.listProblems()
    const now = new Date().toISOString()
    const fields = pickProblemFields(req.body)
    const newProblem = {
      id: newId(),
      title: fields.title,
      slug: slugify(fields.title) || newId(),
      difficulty: fields.difficulty,
      topics: fields.topics || [],
      statement: fields.statement,
      constraints: fields.constraints || '',
      inputFormat: fields.inputFormat || '',
      outputFormat: fields.outputFormat || '',
      sampleTests: fields.sampleTests || [],
      hiddenTests: fields.hiddenTests || [],
      timeLimitMs: fields.timeLimitMs ?? 2000,
      memoryLimitMb: fields.memoryLimitMb ?? 256,
      languages: fields.languages?.length ? fields.languages : SUPPORTED_LANGUAGES,
      starterCode: fields.starterCode || {},
      status: fields.status || 'draft',
      targetBranch: fields.targetBranch || null,
      dueDate: fields.dueDate || null,
      // Provenance is stamped from the verified identity, never from the client.
      assignedBy: req.authUser.email || null,
      createdByEmail: req.authUser.email || null,
      createdAt: now,
      updatedAt: now,
    }
    store.saveProblems([...problems, newProblem])
    res.status(201).json({ id: newProblem.id, problem: newProblem })
  })

  router.put('/problems/:id', requireFacultyOrAdmin, (req, res) => {
    const problems = store.listProblems()
    const index = problems.findIndex((p) => p.id === req.params.id)
    if (index === -1) return res.status(404).json({ error: 'Problem not found' })
    if (!canModifyProblem(req, problems[index])) {
      return res.status(403).json({ error: 'You can only edit problems you created.' })
    }

    const payloadErrors = validateProblemPayload(req.body, { partial: true })
    if (payloadErrors.length) return res.status(400).json({ error: payloadErrors.join('; ') })

    const existing = problems[index]
    const merged = { ...existing, ...pickProblemFields(req.body) }
    const errors = validateProblemPayload(merged, { partial: false })
    if (errors.length) return res.status(400).json({ error: errors.join('; ') })

    merged.id = existing.id
    merged.createdAt = existing.createdAt
    merged.createdByEmail = existing.createdByEmail
    merged.updatedAt = new Date().toISOString()
    if (req.body.title) merged.slug = slugify(merged.title) || existing.slug

    const next = problems.slice()
    next[index] = merged
    store.saveProblems(next)
    res.json({ success: true, problem: merged })
  })

  router.delete('/problems/:id', requireFacultyOrAdmin, (req, res) => {
    const problems = store.listProblems()
    const target = problems.find((p) => p.id === req.params.id)
    if (!target) return res.status(404).json({ error: 'Problem not found' })
    if (!canModifyProblem(req, target)) {
      return res.status(403).json({ error: 'You can only delete problems you created.' })
    }
    store.saveProblems(problems.filter((p) => p.id !== req.params.id))
    res.json({ success: true })
  })

  // ── Run / Submit ──────────────────────────────────────────────────────
  // Both require a verified, logged-in user — this protects the sandboxed
  // execution service from anonymous abuse/flooding.
  router.post('/problems/:id/run', requireAuth(), execLimit, async (req, res) => {
    if (!validateCodePayload(req.body, res)) return
    const { code, language, customInput } = req.body
    if (customInput !== undefined && customInput !== null && (typeof customInput !== 'string' || customInput.length > MAX_STDIN_CHARS)) {
      return res.status(400).json({ error: `customInput must be a string of at most ${MAX_STDIN_CHARS} characters` })
    }
    const problem = loadRunnableProblem(req, res)
    if (!problem) return

    try {
      const isCustom = typeof customInput === 'string' && customInput.trim().length > 0
      // Custom runs have no expected output: they are judged only on whether the
      // program ran cleanly (the old code compared against '' so they always showed "Wrong Answer").
      const testCases = isCustom
        ? [{ input: customInput, output: '', hidden: false, custom: true }]
        : (problem.sampleTests || []).map((t) => ({ ...t, hidden: false }))

      const result = await runTestCases({
        code,
        language,
        testCases,
        timeLimitMs: problem.timeLimitMs,
        memoryLimitMb: problem.memoryLimitMb,
      })
      if (result.verdict === 'Sandbox Unavailable') {
        return res.status(503).json({ error: 'The code execution service is temporarily unavailable. Please try again shortly.' })
      }
      res.json(result)
    } catch (err) {
      console.error('Run failed:', err)
      res.status(500).json({ error: 'Failed to execute code.' })
    }
  })

  // ── SSE Streaming Submit (Codeforces-style "Running on test X" progress) ──
  router.post('/problems/:id/submit-stream', requireAuth(), execLimit, async (req, res) => {
    if (!req.authUser.email) return res.status(400).json({ error: 'Your account has no email address.' })
    if (!validateCodePayload(req.body, res)) return
    const problem = loadRunnableProblem(req, res)
    if (!problem) return

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    })

    const send = (obj) => {
      if (!res.writableEnded && !res.destroyed) res.write(`data: ${JSON.stringify(obj)}\n\n`)
    }

    try {
      const result = await runTestCasesStreaming({
        code: req.body.code,
        language: req.body.language,
        testCases: allTestsFor(problem),
        timeLimitMs: problem.timeLimitMs,
        memoryLimitMb: problem.memoryLimitMb,
        onProgress: send,
      })

      // An infrastructure outage is not the student's failed attempt: don't record it.
      if (result.verdict === 'Sandbox Unavailable') {
        send({ type: 'error', error: 'The code execution service is temporarily unavailable. Please try again shortly.' })
        return res.end()
      }

      // Persisted even if the browser disconnected mid-judging.
      const submission = buildSubmission({ problem, req, result })
      store.addSubmission(submission)

      send({ type: 'submission', submission: { ...submission, code: undefined } })
      res.end()
    } catch (err) {
      console.error('Streaming submit failed:', err)
      send({ type: 'error', error: 'Execution failed' })
      if (!res.writableEnded) res.end()
    }
  })

  router.post('/problems/:id/submit', requireAuth(), execLimit, async (req, res) => {
    // Identity comes from the verified token, never from the request body.
    if (!req.authUser.email) return res.status(400).json({ error: 'Your account has no email address.' })
    if (!validateCodePayload(req.body, res)) return
    const problem = loadRunnableProblem(req, res)
    if (!problem) return

    try {
      const result = await runTestCases({
        code: req.body.code,
        language: req.body.language,
        testCases: allTestsFor(problem),
        timeLimitMs: problem.timeLimitMs,
        memoryLimitMb: problem.memoryLimitMb,
      })
      if (result.verdict === 'Sandbox Unavailable') {
        return res.status(503).json({ error: 'The code execution service is temporarily unavailable. Please try again shortly.' })
      }

      const submission = buildSubmission({ problem, req, result })
      store.addSubmission(submission)
      res.json(submission)
    } catch (err) {
      console.error('Submit failed:', err)
      res.status(500).json({ error: 'Failed to execute code.' })
    }
  })

  // ── AI Code Review ────────────────────────────────────────────────────
  router.post('/problems/:id/review', requireAuth(), async (req, res) => {
    if (!validateCodePayload(req.body, res)) return
    const { code, language, verdict, testResults } = req.body
    const problem = loadRunnableProblem(req, res)
    if (!problem) return

    const limitKey = req.authUser.uid || req.authUser.email
    if (isRateLimited(limitKey)) {
      return res.status(429).json({ error: 'Too many AI requests — please wait a moment and try again.' })
    }

    // Client-supplied context is bounded: it goes straight into an LLM prompt.
    const safeVerdict = asString(verdict).slice(0, 40) || 'N/A'
    const safeResults = JSON.stringify(Array.isArray(testResults) ? testResults.slice(0, 20) : []).slice(0, 4000)

    const sys = `You are a senior software engineer doing a code review — honest and specific, not encouraging by default. You're given a coding problem statement, a student's submitted code, and the judge's verdict/test results. Review the code itself, not just whether it passed:
  - Correctness: if it passed all tests, still flag any edge case it got lucky on or would fail under different constraints. If it failed, explain what's actually wrong (referencing the specific line/logic), not just repeating the verdict.
  - Time/space complexity: state the actual Big-O of their solution and whether a better one exists — if there's a more efficient approach, name it (don't just say 'consider a more efficient approach').
  - Code quality: naming, readability, structure — be specific about what to rename or restructure, not generic ('improve readability').
  Return ONLY valid JSON, no markdown:
  {"correctnessNote":"...","complexity":"...","betterApproach":"...","codeQualityNotes":["...","..."],"overallVerdict":"..."}
  Keep each field concise — this is a quick review, not an essay.`

    const prompt = `Problem: ${problem.title} (${problem.difficulty})
Statement: ${problem.statement}
Constraints: ${problem.constraints || 'N/A'}
Difficulty: ${problem.difficulty}
Student code (${language}):
${code}
Judge verdict: ${safeVerdict}
Test results: ${safeResults}`

    try {
      const text = await callGemini(prompt, sys)
      const cleaned = text.replace(/```json|```/g, '').trim()
      let parsed
      try {
        parsed = JSON.parse(cleaned)
      } catch {
        const match = cleaned.match(/\{[\s\S]*\}/)
        if (match) parsed = JSON.parse(match[0])
        else throw new Error('Failed to parse review JSON')
      }
      if (!parsed || typeof parsed !== 'object') throw new Error('Invalid review shape')
      res.json(parsed)
    } catch (err) {
      console.error('Review generation failed:', err)
      return res.status(502).json({ error: 'Review unavailable, try again' })
    }
  })

  // ── Submissions & Dashboard ───────────────────────────────────────────
  const emailOf = (s) => String(s.userEmail || '').toLowerCase()

  router.get('/submissions', requireAuth(), (req, res) => {
    const problemId = asString(req.query.problemId)
    const privileged = isPrivileged(req)
    // Non-privileged users can only ever see their own submissions.
    const email = (privileged && req.query.email ? asString(req.query.email) : req.authUser.email).toLowerCase()
    let submissions = store.listSubmissions().filter((s) => emailOf(s) === email)

    if (problemId) submissions = submissions.filter((s) => s.problemId === problemId)

    submissions = submissions
      .slice()
      .sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt))
      .map(({ code, ...rest }) => rest) // keep list responses light; code fetched via /submissions/:id

    res.json(submissions)
  })

  router.get('/submissions/:id', requireAuth(), (req, res) => {
    const submission = store.listSubmissions().find((s) => s.id === req.params.id)
    if (!submission) return res.status(404).json({ error: 'Submission not found' })

    const privileged = isPrivileged(req)
    if (!privileged && emailOf(submission) !== (req.authUser.email || '').toLowerCase()) {
      return res.status(403).json({ error: 'Not authorized to view this submission' })
    }
    res.json(submission)
  })

  router.get('/dashboard/:email', requireAuth(), (req, res) => {
    const requestedEmail = req.params.email.toLowerCase()
    const privileged = isPrivileged(req)
    if (!privileged && requestedEmail !== (req.authUser.email || '').toLowerCase()) {
      return res.status(403).json({ error: 'Not authorized to view this dashboard' })
    }
    const email = requestedEmail
    const submissions = store
      .listSubmissions()
      .filter((s) => emailOf(s) === email)
      .sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt))

    const problems = store.listProblems().filter((p) => p.status === 'published')
    const problemById = Object.fromEntries(problems.map((p) => [p.id, p]))

    const solvedProblemIds = new Set(submissions.filter((s) => s.verdict === 'Accepted').map((s) => s.problemId))

    const byDifficulty = { Easy: { solved: 0, total: 0 }, Medium: { solved: 0, total: 0 }, Hard: { solved: 0, total: 0 } }
    for (const p of problems) {
      if (byDifficulty[p.difficulty]) byDifficulty[p.difficulty].total += 1
    }
    for (const id of solvedProblemIds) {
      const p = problemById[id]
      if (p && byDifficulty[p.difficulty]) byDifficulty[p.difficulty].solved += 1
    }

    const attemptedProblemIds = [...new Set(submissions.map((s) => s.problemId))]
    const recentAttempts = attemptedProblemIds.slice(0, 8).map((id) => {
      const latest = submissions.find((s) => s.problemId === id)
      return {
        problemId: id,
        problemTitle: latest?.problemTitle || problemById[id]?.title || 'Unknown Problem',
        difficulty: latest?.difficulty || problemById[id]?.difficulty,
        lastVerdict: latest?.verdict,
        lastAttemptAt: latest?.submittedAt,
        solved: solvedProblemIds.has(id),
      }
    })

    res.json({
      solvedCount: solvedProblemIds.size,
      totalPublished: problems.length,
      totalSubmissions: submissions.length,
      byDifficulty,
      recentAttempts,
      submissionHistory: submissions.slice(0, 20).map(({ code, testResults, ...rest }) => rest),
    })
  })

  app.use('/api/coding', router)
}
