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
import { execFile, execSync } from 'node:child_process'
import { google } from 'googleapis'
import ffmpegStatic from 'ffmpeg-static'
import { fileURLToPath } from 'node:url'
import { db, FieldValue } from './firebase.js'
import { initCleanup } from './cleanupService.js'
import { registerCodingRoutes } from './coding/routes.js'
import { requireAuth, requireFacultyOrAdmin } from './coding/authMiddleware.js'
import { callGemini } from './gemini.js'

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

if (!FOLDER_ID) {
  console.error('❌ GOOGLE_SHARED_DRIVE_FOLDER_ID is required in .env')
  process.exit(1)
}

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
    if (!origin || allowedOrigins.includes(origin) || allowedOrigins.includes('*') || origin.startsWith('http://localhost:')) {
      callback(null, true)
    } else {
      callback(new Error(`CORS policy does not allow access from origin ${origin}`))
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

app.use(express.json({ limit: '1mb' }))

// Baseline abuse/DoS guard on every route. Generous enough for a classroom
// of ~20 concurrent students; tighter, endpoint-specific limiters are added
// below for the expensive routes (AI generation, video upload, code exec).
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 600,
  standardHeaders: true,
  legacyHeaders: false,
})
app.use(generalLimiter)

const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many video uploads from this network. Please wait a few minutes.' },
})

const codingExecLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
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
      cb(new Error(`Invalid file type: ${file.mimetype}. Only video files are accepted.`))
    }
  },
})

// ── WebM → MP4 Conversion ──────────────────────────────────────────────────

function convertToMp4(inputPath) {
  return new Promise((resolve, reject) => {
    const outputPath = inputPath + '.mp4'
    const args = [
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

// ── Routes ──────────────────────────────────────────────────────────────────

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

// Very small per-user rate limit: Gemini calls cost real money per request,
// and this endpoint is behind login but not otherwise throttled.
const aiCallLog = new Map() // uid/email -> array of call timestamps (ms)
const AI_RATE_LIMIT = 12       // max calls...
const AI_RATE_WINDOW_MS = 60_000 // ...per rolling minute

function isRateLimited(key) {
  const now = Date.now()
  const calls = (aiCallLog.get(key) || []).filter((t) => now - t < AI_RATE_WINDOW_MS)
  calls.push(now)
  aiCallLog.set(key, calls)
  return calls.length > AI_RATE_LIMIT
}

app.post('/api/ai/generate', requireAuth(), async (req, res) => {
  const { prompt, sys } = req.body
  if (!prompt || typeof prompt !== 'string') {
    return res.status(400).json({ error: 'prompt is required' })
  }

  const limitKey = req.authUser.uid || req.authUser.email
  if (isRateLimited(limitKey)) {
    return res.status(429).json({ error: 'Too many AI requests — please wait a moment and try again.' })
  }

  try {
    const text = await callGemini(prompt, sys)
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

// Upload interview video to Google Shared Drive (converts to MP4)
app.post('/api/upload', uploadLimiter, upload.single('video'), async (req, res) => {
  const file = req.file

  if (!file) {
    return res.status(400).json({ error: 'No video file provided. Use form field name "video".' })
  }

  // Build the file name from metadata or fallback
  const studentName = (req.body.studentName || 'Unknown').replace(/[^a-zA-Z0-9_-]/g, '-')
  const domain = (req.body.domain || 'General').replace(/[^a-zA-Z0-9_-]/g, '-')
  const level = (req.body.level || 'Intermediate').replace(/[^a-zA-Z0-9_-]/g, '-')
  const sessionId = req.body.sessionId || Date.now().toString(36)
  const date = new Date().toISOString().split('T')[0]

  const isMp4 = file.mimetype === 'video/mp4' || path.extname(file.originalname || '').toLowerCase() === '.mp4'
  const fileName = `${studentName}_${domain}_${level}_${date}.mp4`

  let mp4Path = null

  try {
    if (isMp4) {
      console.log(`✅ File is already MP4, skipping transcoding: ${fileName}`)
      mp4Path = file.path
    } else {
      // Convert to MP4 using optimized fast conversion parameters
      mp4Path = await convertToMp4(file.path)
      console.log(`✅ Converted to MP4: ${path.basename(mp4Path)}`)
    }

    if (!drive || !serviceAccount) {
      const mockFileId = 'mock-file-id-' + sessionId
      const mockDriveLink = `https://drive.google.com/file/d/${mockFileId}/view?usp=drivesdk`
      const mockDest = path.join(uploadsDir, 'mock_' + fileName)
      try {
        fs.copyFileSync(mp4Path, mockDest)
        console.log(`ℹ️ Saved local copy of interview video at: ${mockDest}`)
      } catch (copyErr) {
        console.error('⚠️ Failed to save local copy of mock interview:', copyErr.message)
      }

      if (db && sessionId) {
        try {
          await db.collection('sessions').doc(sessionId).set({
            driveFileId: mockFileId,
            driveUploadAt: FieldValue.serverTimestamp(),
            driveLink: mockDriveLink,
          }, { merge: true })
          console.log(`💾 Saved Mock Drive File ID and upload timestamp to session ${sessionId}`)
        } catch (dbErr) {
          console.error(`⚠️ Failed to save mock upload metadata to DB for session ${sessionId}:`, dbErr.message)
        }
      }

      return res.json({
        success: true,
        fileId: mockFileId,
        driveLink: mockDriveLink,
        fileName,
        mock: true
      })
    }

    const response = await drive.files.create({
      supportsAllDrives: true,
      requestBody: {
        name: fileName,
        parents: [FOLDER_ID],
        mimeType: 'video/mp4',
      },
      media: {
        mimeType: 'video/mp4',
        body: fs.createReadStream(mp4Path),
      },
      fields: 'id, webViewLink',
    })

    const fileId = response.data.id
    const driveLink = response.data.webViewLink

    console.log(`✅ Uploaded: ${fileName} → ${fileId}`)

    if (db && sessionId) {
      try {
        await db.collection('sessions').doc(sessionId).set({
          driveFileId: fileId,
          driveUploadAt: FieldValue.serverTimestamp(),
          driveLink: driveLink,
        }, { merge: true })
        console.log(`💾 Saved Drive File ID and upload timestamp to session ${sessionId}`)
      } catch (dbErr) {
        console.error(`⚠️ Failed to save upload metadata to DB for session ${sessionId}:`, dbErr.message)
      }
    }

    return res.json({
      success: true,
      fileId,
      driveLink,
      fileName,
    })
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

    return res.status(500).json({
      error: 'Failed to upload video to Google Drive.',
      details: err.message || 'Unknown error',
    })
  } finally {
    // Always clean up temporary files
    try { fs.unlinkSync(file.path) } catch {}
    if (mp4Path && mp4Path !== file.path) {
      try { fs.unlinkSync(mp4Path) } catch {}
    }
  }
})

// ── Courses CRUD API ──────────────────────────────────────────────────────────



// --- Local JSON File Database for Courses (Bypass IAM issues) ---
const coursesFile = path.resolve(serverDir, 'uploads', 'courses.json')
function readCourses() {
  if (!fs.existsSync(coursesFile)) return []
  try {
    return JSON.parse(fs.readFileSync(coursesFile, 'utf8'))
  } catch (e) {
    return []
  }
}
function writeCourses(courses) {
  fs.writeFileSync(coursesFile, JSON.stringify(courses, null, 2))
}

app.get('/api/courses', (req, res) => {
  const courses = readCourses()
  res.json(courses.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)))
})

app.get('/api/courses/:id', (req, res) => {
  const courses = readCourses()
  const course = courses.find(c => c.id === req.params.id)
  if (!course) return res.status(404).json({ error: 'Course not found' })
  res.json(course)
})

app.post('/api/courses', requireFacultyOrAdmin(), (req, res) => {
  const courses = readCourses()
  const newCourse = {
    ...req.body,
    id: Date.now().toString(),
    createdAt: new Date().toISOString(),
    createdByEmail: req.authUser.email || null
  }
  courses.push(newCourse)
  writeCourses(courses)
  res.json({ id: newCourse.id })
})

app.put('/api/courses/:id', requireFacultyOrAdmin(), (req, res) => {
  const userEmail = req.authUser.email
  const userRole = req.authUser.role

  const courses = readCourses()
  const index = courses.findIndex(c => c.id === req.params.id)
  if (index === -1) return res.status(404).json({ error: 'Course not found' })

  const course = courses[index]

  // Enforce access control: Admin can edit anything. Faculty can edit if they are the creator or if it has no creator
  const isAuthorized =
    userRole?.toLowerCase() === 'admin' ||
    !course.createdByEmail ||
    course.createdByEmail === userEmail

  if (!isAuthorized) {
    return res.status(403).json({ error: 'Unauthorized to edit this course' })
  }

  // Preserve creator on update if it exists
  const updatedCourse = {
    ...course,
    ...req.body
  }
  if (course.createdByEmail) {
    updatedCourse.createdByEmail = course.createdByEmail
  }

  courses[index] = updatedCourse
  writeCourses(courses)
  res.json({ success: true })
})

app.delete('/api/courses/:id', requireFacultyOrAdmin(), (req, res) => {
  const userEmail = req.authUser.email
  const userRole = req.authUser.role

  const courses = readCourses()
  const course = courses.find(c => c.id === req.params.id)
  if (!course) return res.status(404).json({ error: 'Course not found' })

  const isAuthorized =
    userRole?.toLowerCase() === 'admin' ||
    !course.createdByEmail ||
    course.createdByEmail === userEmail

  if (!isAuthorized) {
    return res.status(403).json({ error: 'Unauthorized to delete this course' })
  }

  const filteredCourses = courses.filter(c => c.id !== req.params.id)
  writeCourses(filteredCourses)
  res.json({ success: true })
})

// ── Online Coding Platform API (Problems, Run/Submit, Submissions, Dashboard) ─
// Rate-limit specifically the two routes that trigger Piston execution —
// these are the ones that can hammer the (rate-limited, possibly public)
// Piston instance if left unthrottled.
app.use((req, res, next) => {
  if (req.method === 'POST' && /^\/api\/coding\/problems\/[^/]+\/(run|submit)$/.test(req.path)) {
    return codingExecLimiter(req, res, next)
  }
  next()
})
registerCodingRoutes(app, { serverDir })

// ── Error Handling ──────────────────────────────────────────────────────────

// Multer error handler (file too large, invalid type, etc.)
app.use((err, _req, res, _next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'File too large. Maximum size is 500 MB.' })
    }
    return res.status(400).json({ error: err.message })
  }
  if (err) {
    return res.status(400).json({ error: err.message })
  }
})

// ── Start ───────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`🚀 PrepHire Upload Server running on http://localhost:${PORT}`)
  console.log(`   Drive folder: ${FOLDER_ID}`)
  console.log(`   CORS origin:  ${CORS_ORIGIN}`)
})
