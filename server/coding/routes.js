// ── Online Coding Platform — REST API ───────────────────────────────────────
// Mounted under /api/coding by server/index.js.
//
// AUTHORIZATION MODEL: every request's identity is resolved server-side by
// resolveAuthUser() (server/coding/authMiddleware.js), which verifies the
// Firebase ID token sent as `Authorization: Bearer <token>` and looks up the
// role from Firestore itself — the client cannot assert its own role.
// requireAdmin() is the single choke point for admin-only actions
// (create/edit/delete/publish problems), matching the requirement that only
// Admins manage the question bank. requireAuth() gates run/submit/dashboard
// so the sandboxed execution service can't be hit anonymously.
// ─────────────────────────────────────────────────────────────────────────────

import express from 'express'
import { createCodingStore } from './store.js'
import { runTestCases, SUPPORTED_LANGUAGES, LANGUAGE_CONFIG } from './judge.js'
import { requireAdmin as requireAdminAuth, requireAuth, attachUserOptional } from './authMiddleware.js'

export function registerCodingRoutes(app, { serverDir }) {
  const store = createCodingStore(serverDir)
  const router = express.Router()

  const requireAdmin = requireAdminAuth()

  function isPrivileged(req) {
    const role = (req.authUser?.role || '').toLowerCase()
    return role === 'admin' || role === 'faculty'
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

  function validateProblemPayload(body, { partial = false } = {}) {
    const errors = []
    const req = (key) => {
      if (!partial && (body[key] === undefined || body[key] === null || body[key] === '')) {
        errors.push(`${key} is required`)
      }
    }
    req('title')
    req('statement')
    req('difficulty')
    if (body.difficulty && !['Easy', 'Medium', 'Hard'].includes(body.difficulty)) {
      errors.push('difficulty must be Easy, Medium, or Hard')
    }
    if (body.languages) {
      const invalid = body.languages.filter((l) => !SUPPORTED_LANGUAGES.includes(l))
      if (invalid.length) errors.push(`unsupported languages: ${invalid.join(', ')}`)
    }
    if (body.status && !['draft', 'published'].includes(body.status)) {
      errors.push('status must be draft or published')
    }
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

  // ── Meta ───────────────────────────────────────────────────────────────
  router.get('/languages', (_req, res) => {
    res.json(
      SUPPORTED_LANGUAGES.map((id) => ({ id, label: LANGUAGE_CONFIG[id].label })),
    )
  })

  // ── Problems ──────────────────────────────────────────────────────────
  router.get('/problems', attachUserOptional(), (req, res) => {
    const { difficulty, topic, search, status } = req.query
    const privileged = isPrivileged(req)
    let problems = store.listProblems()

    if (!privileged) {
      problems = problems.filter((p) => p.status === 'published')
    } else if (status && status !== 'All') {
      problems = problems.filter((p) => p.status === status.toLowerCase())
    }

    if (difficulty && difficulty !== 'All') {
      problems = problems.filter((p) => p.difficulty === difficulty)
    }
    if (topic && topic !== 'All') {
      problems = problems.filter((p) => (p.topics || []).includes(topic))
    }
    if (search) {
      const q = search.toLowerCase()
      problems = problems.filter(
        (p) =>
          p.title.toLowerCase().includes(q) ||
          (p.topics || []).some((t) => t.toLowerCase().includes(q)),
      )
    }

    problems = problems.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    const listView = problems.map((p) => ({
      id: p.id,
      title: p.title,
      slug: p.slug,
      difficulty: p.difficulty,
      topics: p.topics || [],
      status: p.status,
      languages: p.languages || [],
    }))
    res.json(listView)
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

  router.post('/problems', requireAdmin, (req, res) => {
    const errors = validateProblemPayload(req.body)
    if (errors.length) return res.status(400).json({ error: errors.join('; ') })

    const problems = store.listProblems()
    const now = new Date().toISOString()
    const newProblem = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      title: req.body.title,
      slug: slugify(req.body.title) || Date.now().toString(36),
      difficulty: req.body.difficulty,
      topics: req.body.topics || [],
      statement: req.body.statement,
      constraints: req.body.constraints || '',
      inputFormat: req.body.inputFormat || '',
      outputFormat: req.body.outputFormat || '',
      sampleTests: req.body.sampleTests || [],
      hiddenTests: req.body.hiddenTests || [],
      timeLimitMs: Number(req.body.timeLimitMs) || 2000,
      memoryLimitMb: Number(req.body.memoryLimitMb) || 256,
      languages: req.body.languages?.length ? req.body.languages : SUPPORTED_LANGUAGES,
      starterCode: req.body.starterCode || {},
      status: req.body.status === 'published' ? 'published' : 'draft',
      createdByEmail: req.authUser?.email || null,
      createdAt: now,
      updatedAt: now,
    }
    problems.push(newProblem)
    store.saveProblems(problems)
    res.status(201).json({ id: newProblem.id, problem: newProblem })
  })

  router.put('/problems/:id', requireAdmin, (req, res) => {
    const problems = store.listProblems()
    const index = problems.findIndex((p) => p.id === req.params.id)
    if (index === -1) return res.status(404).json({ error: 'Problem not found' })

    const merged = { ...problems[index], ...req.body }
    const errors = validateProblemPayload(merged, { partial: false })
    if (errors.length) return res.status(400).json({ error: errors.join('; ') })

    merged.id = problems[index].id
    merged.createdAt = problems[index].createdAt
    merged.createdByEmail = problems[index].createdByEmail
    merged.updatedAt = new Date().toISOString()
    if (req.body.title) merged.slug = slugify(req.body.title)

    problems[index] = merged
    store.saveProblems(problems)
    res.json({ success: true, problem: merged })
  })

  router.delete('/problems/:id', requireAdmin, (req, res) => {
    const problems = store.listProblems()
    const exists = problems.some((p) => p.id === req.params.id)
    if (!exists) return res.status(404).json({ error: 'Problem not found' })
    store.saveProblems(problems.filter((p) => p.id !== req.params.id))
    res.json({ success: true })
  })

  // ── Run / Submit ──────────────────────────────────────────────────────
  // Both require a verified, logged-in user — this protects the sandboxed
  // execution service from anonymous abuse/flooding.
  router.post('/problems/:id/run', requireAuth(), async (req, res) => {
    const { code, language } = req.body
    if (!code || !language) return res.status(400).json({ error: 'code and language are required' })

    const problem = store.listProblems().find((p) => p.id === req.params.id)
    if (!problem) return res.status(404).json({ error: 'Problem not found' })
    if (!SUPPORTED_LANGUAGES.includes(language)) {
      return res.status(400).json({ error: `Unsupported language: ${language}` })
    }

    try {
      const result = await runTestCases({
        code,
        language,
        testCases: (problem.sampleTests || []).map((t) => ({ ...t, hidden: false })),
        timeLimitMs: problem.timeLimitMs,
        memoryLimitMb: problem.memoryLimitMb,
      })
      res.json(result)
    } catch (err) {
      console.error('Run failed:', err)
      res.status(500).json({ error: 'Failed to execute code.' })
    }
  })

  router.post('/problems/:id/submit', requireAuth(), async (req, res) => {
    const { code, language, name } = req.body
    // Identity comes from the verified token, never from the request body —
    // otherwise a user could submit (and appear on the dashboard/leaderboard
    // logic) as someone else just by editing the JSON payload.
    const email = req.authUser.email
    if (!code || !language || !email) {
      return res.status(400).json({ error: 'code, language are required and you must be signed in' })
    }

    const problem = store.listProblems().find((p) => p.id === req.params.id)
    if (!problem) return res.status(404).json({ error: 'Problem not found' })
    if (!SUPPORTED_LANGUAGES.includes(language)) {
      return res.status(400).json({ error: `Unsupported language: ${language}` })
    }

    try {
      const allTests = [
        ...(problem.sampleTests || []).map((t) => ({ ...t, hidden: false })),
        ...(problem.hiddenTests || []).map((t) => ({ ...t, hidden: true })),
      ]
      const result = await runTestCases({
        code,
        language,
        testCases: allTests,
        timeLimitMs: problem.timeLimitMs,
        memoryLimitMb: problem.memoryLimitMb,
      })

      const submissions = store.listSubmissions()
      const submission = {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
        problemId: problem.id,
        problemTitle: problem.title,
        difficulty: problem.difficulty,
        userEmail: email,
        userName: name || email.split('@')[0],
        language,
        code,
        type: 'submit',
        verdict: result.verdict,
        passedCount: result.passedCount,
        totalCount: result.totalCount,
        runtimeMs: result.runtimeMs,
        memoryKb: result.memoryKb,
        // Store only sample-case detail; hidden case bodies are never persisted
        // back to the client-visible submission record either.
        testResults: result.testResults.map((r) => (r.hidden ? { passed: r.passed, hidden: true, timeMs: r.timeMs } : r)),
        submittedAt: new Date().toISOString(),
      }
      submissions.push(submission)
      store.saveSubmissions(submissions)

      res.json(submission)
    } catch (err) {
      console.error('Submit failed:', err)
      res.status(500).json({ error: 'Failed to execute code.' })
    }
  })

  // ── Submissions & Dashboard ───────────────────────────────────────────
  router.get('/submissions', requireAuth(), (req, res) => {
    const { problemId } = req.query
    const privileged = isPrivileged(req)
    // Non-privileged users can only ever see their own submissions — the
    // query param is only honored (to filter by a *different* user) for
    // Admin/Faculty; anyone else's `email` query param is ignored.
    const email = privileged && req.query.email ? String(req.query.email) : req.authUser.email
    let submissions = store.listSubmissions().filter((s) => s.userEmail.toLowerCase() === email.toLowerCase())

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
    if (!privileged && submission.userEmail.toLowerCase() !== req.authUser.email.toLowerCase()) {
      return res.status(403).json({ error: 'Not authorized to view this submission' })
    }
    res.json(submission)
  })

  router.get('/dashboard/:email', requireAuth(), (req, res) => {
    const requestedEmail = req.params.email.toLowerCase()
    const privileged = isPrivileged(req)
    if (!privileged && requestedEmail !== req.authUser.email.toLowerCase()) {
      return res.status(403).json({ error: 'Not authorized to view this dashboard' })
    }
    const email = requestedEmail
    const submissions = store
      .listSubmissions()
      .filter((s) => s.userEmail.toLowerCase() === email)
      .sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt))

    const problems = store.listProblems().filter((p) => p.status === 'published')
    const problemById = Object.fromEntries(problems.map((p) => [p.id, p]))

    const solvedProblemIds = new Set(
      submissions.filter((s) => s.verdict === 'Accepted').map((s) => s.problemId),
    )

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
