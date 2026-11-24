// ── PrepHire AI — Google Drive Upload Server ────────────────────────────────
// Minimal Express backend that accepts interview video uploads and stores them
// in a Google Shared Drive using a Service Account.
// ─────────────────────────────────────────────────────────────────────────────

import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import multer from 'multer'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { execFile, execSync } from 'node:child_process'
import { google } from 'googleapis'
import ffmpegStatic from 'ffmpeg-static'
import { fileURLToPath } from 'node:url'
import { db, FieldValue } from './firebase.js'
import { initCleanup } from './cleanupService.js'
import { registerCodingRoutes } from './coding/routes.js'
import { requireAuth, requireFacultyOrAdmin } from './coding/authMiddleware.js'
import { callGemini, streamGemini, isRateLimited } from './gemini.js'
import { initDriveQueue } from './driveQueue.js'

// ── Configuration ───────────────────────────────────────────────────────────

const PORT = Number(process.env.PORT) || 3001
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:5173'

// Dynamic ffmpeg path check: prefer system-level ffmpeg in Docker container, fallback to static
let ffmpegPath = ffmpegStatic
try {
  execSync('ffmpeg -version', { stdio: 'ignore' })
  ffmpegPath = 'ffmpeg'
  console.log('✅ Using system-installed ffmpeg')
} catch (e) {
  console.log('ℹ️ System ffmpeg not found, using ffmpeg-static at:', ffmpegPath)
}

// Gemini key lives server-side only now — never shipped to the browser bundle.
const GEMINI_API_KEY = process.env.GEMINI_API_KEY
if (!GEMINI_API_KEY) {
  console.warn('⚠️ GEMINI_API_KEY is not set — resume parsing and interview question generation will fail.')
}

const SA_PATH = process.env.GOOGLE_SERVICE_ACCOUNT_PATH || './service-account.json'
const SA_JSON = process.env.GOOGLE_SERVICE_ACCOUNT
const FOLDER_ID = process.env.GOOGLE_SHARED_DRIVE_FOLDER_ID
const serverDir = path.dirname(fileURLToPath(import.meta.url))

function readServiceAccount() {
  if (SA_JSON) {
    try {
      const raw = SA_JSON.trim().startsWith('{')
        ? SA_JSON
        : Buffer.from(SA_JSON, 'base64').toString('utf8')
      return JSON.parse(raw)
    } catch (e) {
      console.error('❌ Failed to parse GOOGLE_SERVICE_ACCOUNT env variable:', e.message)
      return null
    }
  }

  const saAbsolute = path.resolve(serverDir, SA_PATH)
  if (fs.existsSync(saAbsolute)) {
    return { keyFile: saAbsolute }
  }

  // Fallback for Render Secret Files
  const renderSecretPath = '/etc/secrets/service-account.json'
  if (fs.existsSync(renderSecretPath)) {
    console.log('✅ Found Google Service Account in Render secrets at:', renderSecretPath)
    return { keyFile: renderSecretPath }
  }

  console.warn('⚠️ GOOGLE_SERVICE_ACCOUNT is required for production Google Drive integration.')
  console.warn(`   Local fallback file was not found at: ${saAbsolute} or ${renderSecretPath}`)
  console.warn('   The server will run in MOCK UPLOAD mode (saved files will remain local).')
  return null
}

// ── Google Drive Auth ───────────────────────────────────────────────────────

const serviceAccount = readServiceAccount()
// Only required when Drive is actually configured — mock/dev mode (no service
// account) used to exit(1) here, contradicting the documented mock-upload mode.
if (serviceAccount && !FOLDER_ID) {
  console.error('❌ GOOGLE_SHARED_DRIVE_FOLDER_ID is required when a Google service account is configured')
  process.exit(1)
}
let auth = null
let drive = null

if (serviceAccount) {
  try {
    auth = new google.auth.GoogleAuth({
      ...(serviceAccount.keyFile ? { keyFile: serviceAccount.keyFile } : { credentials: serviceAccount }),
      scopes: ['https://www.googleapis.com/auth/drive'],
    })
    drive = google.drive({ version: 'v3', auth })
    console.log('✅ Google Drive API initialized successfully.')
  } catch (e) {
    console.error('❌ Failed to initialize Google Drive client:', e.message)
  }
} else {
  console.log('ℹ️ Running in Mock Upload mode. Uploaded videos will not be pushed to Google Drive.')
}

// Initialize scheduled video cleanup service
initCleanup(drive)

// ── Express Setup ───────────────────────────────────────────────────────────

const app = express()

// Behind Render/Cloud Run/nginx every request arrives from the proxy's IP.
// Without this, all users share ONE rate-limit bucket (and express-rate-limit
// logs ERR_ERL_UNEXPECTED_X_FORWARDED_FOR). Set TRUST_PROXY=0 if exposed directly.
app.set('trust proxy', Number(process.env.TRUST_PROXY ?? 1))

const IS_PROD = process.env.NODE_ENV === 'production'
const allowedOrigins = [
  'https://prephire-ai.web.app',
  'https://prephire-ai.firebaseapp.com',
  'http://localhost:5173',
  'http://localhost:3000',
  'http://localhost:3001'
]
if (CORS_ORIGIN && !allowedOrigins.includes(CORS_ORIGIN)) {
  allowedOrigins.push(CORS_ORIGIN)
}

app.use(cors({
  origin: (origin, callback) => {
    // Arbitrary http://localhost:* origins are a dev convenience only.
    const devLocalhost = !IS_PROD && /^http:\/\/localhost:\d+$/.test(origin || '')
    if (!origin || allowedOrigins.includes(origin) || devLocalhost) {
      callback(null, true)
    } else {
      const err = new Error('Origin not allowed by CORS policy')
      err.status = 403
      callback(err)
    }
  },
  credentials: true
}))

// Security headers. This process only ever serves JSON/API responses (the
// frontend is hosted separately, e.g. Firebase Hosting), so we disable CSP
// (irrelevant for an API and easy to get wrong) and explicitly allow
// cross-origin resource loading so the separately-hosted SPA can fetch it.
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}))

app.use(express.json({ limit: '25mb' }))

// Baseline abuse/DoS guard on every route. Calibrated for a cohort of 30-50 concurrent students
// sharing a single campus Wi-Fi or lab NAT router.
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 2500,
  standardHeaders: true,
  legacyHeaders: false,
})
app.use(generalLimiter)

const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many video uploads from this network. Please wait a few minutes.' },
})

// IP-level flood guard only; per-user limits (userRateLimit) do the fine-grained work.
const codingExecLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many code runs from this network. Please wait a moment.' },
})

// Multer: store uploads temporarily in server/uploads/ before sending to Drive
const uploadsDir = path.resolve(serverDir, 'uploads')
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true })
}

const upload = multer({
  dest: uploadsDir,
  limits: {
    fileSize: 500 * 1024 * 1024, // 500 MB max
  },
  fileFilter: (_req, file, cb) => {
    // Accept video MIME types only
    if (file.mimetype.startsWith('video/')) {
      cb(null, true)
    } else {
      const err = new Error('Invalid file type. Only video files are accepted.')
      err.status = 400
      cb(err)
    }
  },
})

// ── WebM → MP4 Conversion ──────────────────────────────────────────────────

function convertToMp4(inputPath) {
  return new Promise((resolve, reject) => {
    const outputPath = inputPath + '.mp4'
    const args = [
      // Only ever read the local file: blocks http/tcp/etc. protocol tricks that a
      // crafted "video" (e.g. an HLS playlist) can use to make ffmpeg read local
      // files or call out to internal hosts.
      '-protocol_whitelist', 'file',
      '-i', inputPath,
      '-c:v', 'libx264',
      '-preset', 'ultrafast',
      '-crf', '28',
      '-threads', '0',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-movflags', '+faststart',
      '-y',
      outputPath,
    ]
    console.log(`🔄 Fast converting to MP4: ${path.basename(inputPath)}`)
    execFile(ffmpegPath, args, { timeout: 300_000 }, (err) => {
      if (err) {
        // Clean up partial output on failure
        try { fs.unlinkSync(outputPath) } catch {}
        return reject(err)
      }
      resolve(outputPath)
    })
  })
}

// The client-declared MIME type / filename are attacker-controlled. Sniff the real
// container: Matroska/WebM start with EBML magic, MP4/MOV have 'ftyp' at byte 4.
function sniffVideoContainer(filePath) {
  let fd
  try {
    fd = fs.openSync(filePath, 'r')
    const buf = Buffer.alloc(12)
    fs.readSync(fd, buf, 0, 12, 0)
    if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) return 'webm'
    if (buf.toString('ascii', 4, 8) === 'ftyp') return 'mp4'
    return null
  } catch {
    return null
  } finally {
    if (fd !== undefined) try { fs.closeSync(fd) } catch {}
  }
}

const SESSION_ID_RE = /^[A-Za-z0-9_-]{4,64}$/

// Routes ──────────────────────────────────────────────────────────────────

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// ── AI Proxy (Gemini) ──────────────────────────────────────────────────────
// The client used to call generativelanguage.googleapis.com directly with the
// API key embedded in the bundle (VITE_GEMINI_API_KEY) — anyone could pull it
// from devtools/Network tab and run up the bill on our key. The key now lives
// only in this process's environment; the browser talks to /api/ai/generate,
// which requires a verified, signed-in user (same as the coding platform) and
// forwards the request server-side.

// Per-user AI rate limiting lives in gemini.js (single shared budget).
const MAX_PROMPT_CHARS = 60_000
const MAX_SYS_CHARS = 20_000
const validAiBody = (b) => {
  if (!b || typeof b.prompt !== 'string' || b.prompt.length === 0 || b.prompt.length > MAX_PROMPT_CHARS) return false
  const sysVal = b.sys ?? b.systemPrompt ?? b.system
  if (sysVal !== undefined && sysVal !== null && (typeof sysVal !== 'string' || sysVal.length > MAX_SYS_CHARS)) return false
  if (b.images !== undefined && b.images !== null) {
    if (!Array.isArray(b.images) || b.images.length > 10) return false
    for (const img of b.images) {
      if (!img || typeof img.mimeType !== 'string' || typeof img.data !== 'string') return false
      if (!/^(image\/(jpeg|png|webp|gif)|application\/pdf)$/.test(img.mimeType)) return false
      // Cap individual inline base64 payloads to ~15MB
      if (img.data.length > 20_000_000) return false
    }
  }
  return true
}

app.post('/api/ai/generate', requireAuth(), async (req, res) => {
  if (!validAiBody(req.body)) {
    return res.status(400).json({ error: 'prompt is required (string, max 60k chars), optional sys, or valid images' })
  }
  const prompt = req.body.prompt
  const sys = req.body.sys ?? req.body.systemPrompt ?? req.body.system ?? ''
  const images = req.body.images || null

  const limitKey = req.authUser.uid || req.authUser.email
  if (isRateLimited(limitKey)) {
    return res.status(429).json({ error: 'Too many AI requests — please wait a moment and try again.' })
  }

  try {
    const text = await callGemini(prompt, sys, null, images)
    res.json({ text })
  } catch (err) {
    const status = err.status || 502
    if (status === 500) {
      return res.status(500).json({ error: err.message })
    }
    console.error('❌ Gemini proxy call failed:', err.message || err)
    res.status(status).json({ error: status === 502 ? 'AI generation service unavailable.' : err.message })
  }
})

// Real-Time SSE AI Streaming Endpoint (Low-Latency First-Token Pipeline)
app.post('/api/ai/stream', requireAuth(), async (req, res) => {
  if (!validAiBody(req.body)) {
    return res.status(400).json({ error: 'prompt is required (string, max 60k chars)' })
  }
  const prompt = req.body.prompt
  const sys = req.body.sys ?? req.body.systemPrompt ?? req.body.system ?? ''

  const limitKey = req.authUser.uid || req.authUser.email
  if (isRateLimited(limitKey)) {
    return res.status(429).json({ error: 'Too many AI requests — please wait a moment and try again.' })
  }

  // Stop paying for tokens nobody is reading once the browser disconnects.
  const abort = new AbortController()
  res.on('close', () => abort.abort())

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders?.()

  try {
    await streamGemini(prompt, sys, (chunk) => {
      if (!res.writableEnded) res.write(`data: ${JSON.stringify({ text: chunk })}\n\n`)
    }, null, abort.signal)
    if (!res.writableEnded) {
      res.write('data: [DONE]\n\n')
      res.end()
    }
  } catch (err) {
    console.error('❌ Gemini streaming proxy failed:', err.message || err)
    if (!res.writableEnded) {
      res.write(`data: ${JSON.stringify({ error: err.status === 500 ? err.message : 'Streaming service error' })}\n\n`)
      res.end()
    }
  }
})

// A client-chosen sessionId used to be written straight into sessions/{id}
// with the Admin SDK (which bypasses Firestore rules), so any signed-in user
// could overwrite another student's driveLink/driveFileId. Only write when the
// session already exists AND belongs to the authenticated user.
const rawSessionIdOk = (id) => typeof id === 'string' && SESSION_ID_RE.test(id)

async function attachUploadToSession(reqOrAuthUser, sessionId, fields) {
  if (!db || !rawSessionIdOk(sessionId)) return
  try {
    const ref = db.collection('sessions').doc(sessionId)
    const snap = await ref.get()
    if (!snap.exists) {
      console.warn(`ℹ️ Session ${sessionId} not found; skipping upload metadata write.`)
      return
    }
    const authUser = reqOrAuthUser?.authUser || reqOrAuthUser
    const owner = String(snap.data().studentEmail || '').toLowerCase()
    if (!owner || owner !== String(authUser?.email || '').toLowerCase()) {
      console.warn(`⚠️ Refused to attach upload to session ${sessionId}: not owned by caller.`)
      return
    }
    await ref.set({ ...fields, driveUploadAt: FieldValue.serverTimestamp() }, { merge: true })
  } catch (dbErr) {
    console.error(`⚠️ Failed to save upload metadata for session ${sessionId}:`, dbErr.message)
  }
}

// ── Unified Google Drive Upload Queue ───────────────────────────────────────
// Protects Render free-tier (512MB RAM) and Google Drive rate limits by serializing
// ffmpeg transcoding and throttling snapshot evidence uploads.
const driveQueue = initDriveQueue({
  drive,
  serviceAccount,
  FOLDER_ID,
  uploadsDir,
  convertToMp4,
  attachUploadToSession,
})

// Upload interview video to Google Shared Drive (converts to MP4)
app.post('/api/upload', uploadLimiter, requireAuth(), upload.single('video'), async (req, res) => {
  const file = req.file

  if (!file) {
    return res.status(400).json({ error: 'No video file provided. Use form field name "video".' })
  }

  // Build the file name from metadata or fallback
  const userIdentifier = req.authUser?.email?.split('@')[0] || req.authUser?.uid || 'user'
  const studentName = (req.body.studentName || userIdentifier).replace(/[^a-zA-Z0-9_-]/g, '-')
  const domain = (req.body.domain || 'General').replace(/[^a-zA-Z0-9_-]/g, '-')
  const level = (req.body.level || 'Intermediate').replace(/[^a-zA-Z0-9_-]/g, '-')
  const rawSessionId = typeof req.body.sessionId === 'string' ? req.body.sessionId : ''
  const sessionId = SESSION_ID_RE.test(rawSessionId) ? rawSessionId : Date.now().toString(36)
  const date = new Date().toISOString().split('T')[0]

  const container = sniffVideoContainer(file.path)
  if (!container) {
    try { fs.unlinkSync(file.path) } catch {}
    return res.status(400).json({ error: 'Unsupported or corrupt video file. Only WebM and MP4 recordings are accepted.' })
  }
  const isMp4 = container === 'mp4'
  const fileName = `${studentName}_${domain}_${level}_${date}.mp4`

  try {
    const result = await driveQueue.enqueueVideoAndWait({
      filePath: file.path,
      fileName,
      studentName,
      domain,
      level,
      sessionId,
      userIdentifier,
      reqAuthUser: req.authUser,
      isMp4,
    })

    return res.json(result)
  } catch (err) {
    console.error('❌ Drive upload failed:', err.message || err)

    // Provide actionable error messages
    if (err.code === 404) {
      return res.status(500).json({
        error: 'Shared Drive folder not found. Check GOOGLE_SHARED_DRIVE_FOLDER_ID.',
      })
    }
    if (err.code === 403) {
      return res.status(500).json({
        error: 'Permission denied. Ensure the service account has access to the Shared Drive.',
      })
    }

    return res.status(500).json({ error: 'Failed to upload video to Google Drive.' })
  }
})

// ── Google Drive Upload Queue Health & Diagnostics Endpoint ──────────────────
app.get('/api/drive/queue-status', (_req, res) => {
  res.json({
    success: true,
    ...driveQueue.getQueueStats(),
  })
})

// ── Cryptographic Quiz Submission Evaluation ─────────────────────────────────
// Allows zero-trust server-side evaluation of candidate attempts without leaking
// correct answers to client DevTools or network inspections.
const MASTER_QUIZ_SALT = 'PrepHire_MIT_AoE_Encrypted_Quiz_Secret_2026_x89'

async function decryptAnswerServer(cipherToken, quizId) {
  if (!cipherToken) return null
  if (cipherToken.startsWith('enc:v1:')) {
    try {
      const parts = cipherToken.split(':')
      if (parts.length < 4) return null
      const iv = Buffer.from(parts[2], 'base64')
      const cipherData = Buffer.from(parts[3], 'base64')
      const enc = new TextEncoder()
      const seed = `${MASTER_QUIZ_SALT}:${quizId || 'global'}`
      const subtle = crypto.webcrypto?.subtle || crypto.subtle
      const keyHash = await subtle.digest('SHA-256', enc.encode(seed))
      const key = await subtle.importKey('raw', keyHash, { name: 'AES-GCM' }, false, ['decrypt'])
      const decrypted = await subtle.decrypt({ name: 'AES-GCM', iv }, key, cipherData)
      const dec = new TextDecoder()
      return JSON.parse(dec.decode(decrypted))
    } catch (e) {
      console.warn('⚠️ Server answer decryption failed:', e.message)
      return null
    }
  }
  if (cipherToken.startsWith('enc:v0:')) {
    try {
      const b64 = cipherToken.replace('enc:v0:', '')
      return JSON.parse(Buffer.from(b64, 'base64').toString('utf8'))
    } catch {
      return null
    }
  }
  return null
}

app.post('/api/quiz/evaluate', express.json(), async (req, res) => {
  try {
    const { quizId, answers = {} } = req.body
    if (!quizId) {
      return res.status(400).json({ error: 'quizId is required' })
    }

    if (!db) {
      return res.status(503).json({ error: 'Firestore is not initialized on server' })
    }

    const quizDoc = await db.collection('quizzes').doc(quizId).get()
    if (!quizDoc.exists) {
      return res.status(404).json({ error: 'Quiz not found' })
    }

    const quizData = quizDoc.data()
    const questions = quizData.questions || []

    let score = 0
    let maxScore = 0

    for (let idx = 0; idx < questions.length; idx++) {
      const q = questions[idx]
      const qPoints = q.points || 1
      maxScore += qPoints

      let correctIndex = q.correctIndex
      if (typeof correctIndex !== 'number' && q.answerCipher) {
        const dec = await decryptAnswerServer(q.answerCipher, quizId)
        if (dec && typeof dec.correctIndex === 'number') {
          correctIndex = dec.correctIndex
        }
      }

      const candidateChoice =
        q.id && answers[q.id] !== undefined
          ? answers[q.id]
          : answers[`q-${idx}`]

      if (candidateChoice !== undefined && candidateChoice === correctIndex) {
        score += qPoints
      }
    }

    const percentage = maxScore > 0 ? Math.round((score / maxScore) * 100) : 0
    const passed = percentage >= (quizData.passingPercentage || 60)

    return res.json({
      success: true,
      score,
      maxScore,
      percentage,
      passed,
    })
  } catch (err) {
    console.error('❌ Failed to evaluate quiz submission:', err.message || err)
    return res.status(500).json({ error: 'Failed to evaluate quiz submission.' })
  }
})

// ── Courses CRUD API ──────────────────────────────────────────────────────────

// --- Hybrid Courses Database (Firestore with local JSON file fallback) ---
const coursesFile = path.resolve(serverDir, 'uploads', 'courses.json')
function readCoursesFromFile() {
  if (!fs.existsSync(coursesFile)) return []
  try {
    return JSON.parse(fs.readFileSync(coursesFile, 'utf8'))
  } catch (e) {
    return []
  }
}
function writeCoursesToFile(courses) {
  try {
    fs.writeFileSync(coursesFile, JSON.stringify(courses, null, 2))
  } catch (e) {
    console.warn('⚠️ Failed to write courses JSON backup:', e.message)
  }
}

async function getCoursesList() {
  if (db) {
    try {
      const snap = await db.collection('courses').get()
      if (!snap.empty) {
        const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }))
        writeCoursesToFile(list)
        return list
      }
    } catch (e) {
      console.warn('⚠️ Firestore read courses failed, using file backup:', e.message)
    }
  }
  return readCoursesFromFile()
}

async function saveCourseToDb(course) {
  if (db && course.id) {
    try {
      await db.collection('courses').doc(course.id).set(course, { merge: true })
    } catch (e) {
      console.warn('⚠️ Firestore course write failed:', e.message)
    }
  }
}

async function deleteCourseFromDb(id) {
  if (db && id) {
    try {
      await db.collection('courses').doc(id).delete()
    } catch (e) {
      console.warn('⚠️ Firestore course delete failed:', e.message)
    }
  }
}

app.get('/api/courses', requireAuth(), async (req, res) => {
  const courses = await getCoursesList()
  res.json(courses.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)))
})

app.get('/api/courses/:id', requireAuth(), async (req, res) => {
  const courses = await getCoursesList()
  const course = courses.find(c => c.id === req.params.id)
  if (!course) return res.status(404).json({ error: 'Course not found' })
  res.json(course)
})

// Fields a client may write. The old handlers spread req.body straight into the
// record, which let a caller overwrite `id`, `createdAt`, `createdByEmail` (take
// over any course) and — worse — set `status: 'approved'` on their own course,
// bypassing the Admin approval workflow entirely.
function pickCourseFields(body) {
  const out = {}
  const b = body && typeof body === 'object' ? body : {}
  if (typeof b.name === 'string') out.name = b.name.slice(0, 200)
  if (typeof b.description === 'string') out.description = b.description.slice(0, 5000)
  if (b.hours !== undefined && Number.isFinite(Number(b.hours))) out.hours = Math.min(Math.max(Number(b.hours), 0), 10000)
  if (Array.isArray(b.chapters) && JSON.stringify(b.chapters).length < 500_000) out.chapters = b.chapters
  if (typeof b.externalUrl === 'string' && (b.externalUrl === '' || /^https?:\/\//i.test(b.externalUrl))) out.externalUrl = b.externalUrl.slice(0, 2000)
  return out
}
const sameEmail = (a, b) => String(a || '').toLowerCase() === String(b || '').toLowerCase()
const isAdminUser = (u) => (u?.role || '').toLowerCase() === 'admin'
const COURSE_STATUSES = ['approved', 'pending', 'rejected']

app.post('/api/courses', requireFacultyOrAdmin(), async (req, res) => {
  const fields = pickCourseFields(req.body)
  if (!fields.name) return res.status(400).json({ error: 'Course name is required.' })
  const courses = await getCoursesList()
  const newCourse = {
    ...fields,
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
    createdAt: new Date().toISOString(),
    createdByEmail: req.authUser.email || null,
    // Faculty submissions always start as pending; only an Admin can pre-approve.
    status: isAdminUser(req.authUser) && COURSE_STATUSES.includes(req.body?.status) ? req.body.status : 'pending',
  }
  courses.push(newCourse)
  writeCoursesToFile(courses)
  await saveCourseToDb(newCourse)
  res.json({ id: newCourse.id })
})

app.put('/api/courses/:id', requireFacultyOrAdmin(), async (req, res) => {
  const courses = await getCoursesList()
  const index = courses.findIndex((c) => c.id === req.params.id)
  if (index === -1) return res.status(404).json({ error: 'Course not found' })

  const course = courses[index]
  // Admin can edit anything. Faculty can edit if they are the creator or it has no creator.
  const isAuthorized = isAdminUser(req.authUser) || !course.createdByEmail || sameEmail(course.createdByEmail, req.authUser.email)
  if (!isAuthorized) return res.status(403).json({ error: 'Unauthorized to edit this course' })

  const updatedCourse = { ...course, ...pickCourseFields(req.body) }
  if (isAdminUser(req.authUser)) {
    // Approval decisions are Admin-only.
    if (COURSE_STATUSES.includes(req.body?.status)) updatedCourse.status = req.body.status
  } else {
    // A faculty edit puts the course back into review.
    updatedCourse.status = 'pending'
  }
  // Never changeable from the client:
  updatedCourse.id = course.id
  updatedCourse.createdAt = course.createdAt
  if (course.createdByEmail) updatedCourse.createdByEmail = course.createdByEmail

  courses[index] = updatedCourse
  writeCoursesToFile(courses)
  await saveCourseToDb(updatedCourse)
  res.json({ success: true })
})

app.delete('/api/courses/:id', requireFacultyOrAdmin(), async (req, res) => {
  const courses = await getCoursesList()
  const course = courses.find((c) => c.id === req.params.id)
  if (!course) return res.status(404).json({ error: 'Course not found' })

  const isAuthorized = isAdminUser(req.authUser) || !course.createdByEmail || sameEmail(course.createdByEmail, req.authUser.email)
  if (!isAuthorized) return res.status(403).json({ error: 'Unauthorized to delete this course' })

  writeCoursesToFile(courses.filter((c) => c.id !== req.params.id))
  await deleteCourseFromDb(req.params.id)
  res.json({ success: true })
})

// ── Online Coding Platform API (Problems, Run/Submit, Submissions, Dashboard) ─
// IP-level guard for the routes that execute code. The old pattern ended in
// (run|submit)$ and therefore NEVER matched /submit-stream — the endpoint that
// runs the full hidden-test suite — leaving it completely unthrottled.
app.use((req, res, next) => {
  if (req.method === 'POST' && /^\/api\/coding\/(problems\/[^/]+\/(run|submit|submit-stream)|generate-problem)$/.test(req.path)) {
    return codingExecLimiter(req, res, next)
  }
  next()
})
registerCodingRoutes(app, { serverDir })

// ── Error Handling ──────────────────────────────────────────────────────────

// Central error handler. Previously EVERY error (including genuine server bugs and
// Firestore failures) was returned as HTTP 400 with the raw internal message, and a
// handler that fired after headers were sent (SSE) threw a second exception.
app.use((err, _req, res, next) => {
  if (res.headersSent) return next(err)
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'File too large. Maximum size is 500 MB.' })
    return res.status(400).json({ error: 'Upload rejected.' })
  }
  if (err?.type === 'entity.too.large') return res.status(413).json({ error: 'Request body too large.' })
  if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: 'Malformed JSON body.' })

  const status = Number.isInteger(err?.status) && err.status >= 400 && err.status < 600 ? err.status : 500
  if (status >= 500) console.error('❌ Unhandled error:', err)
  // Client-facing errors (e.g. the upload file filter) keep their message; 5xx never leak internals.
  res.status(status).json({ error: status >= 500 ? 'Internal server error.' : (err.expose || status === 403 || status === 400 ? err.message : 'Request failed.') })
})

process.on('unhandledRejection', (reason) => {
  console.error('❌ Unhandled promise rejection:', reason)
})

// ── Start ───────────────────────────────────────────────────────────────────

const server = app.listen(PORT, () => {
  console.log(`🚀 PrepHire Upload Server running on http://localhost:${PORT}`)
  console.log(`   Drive folder: ${FOLDER_ID || '(mock mode — Drive not configured)'}`)
  console.log(`   CORS origin:  ${CORS_ORIGIN}`)
})
