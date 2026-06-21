// ── PrepHire AI — Google Drive Upload Server ────────────────────────────────
// Minimal Express backend that accepts interview video uploads and stores them
// in a Google Shared Drive using a Service Account.
// ─────────────────────────────────────────────────────────────────────────────

import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import multer from 'multer'
import fs from 'node:fs'
import path from 'node:path'
import { execFile, execSync } from 'node:child_process'
import { google } from 'googleapis'
import ffmpegStatic from 'ffmpeg-static'
import { fileURLToPath } from 'node:url'

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

  console.warn('⚠️ GOOGLE_SERVICE_ACCOUNT is required for production Google Drive integration.')
  console.warn(`   Local fallback file was not found at: ${saAbsolute}`)
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
app.use(express.json())

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
      '-preset', 'fast',
      '-crf', '23',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-movflags', '+faststart',
      '-y',
      outputPath,
    ]
    console.log(`🔄 Converting to MP4: ${path.basename(inputPath)}`)
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

// Upload interview video to Google Shared Drive (converts WebM → MP4)
app.post('/api/upload', upload.single('video'), async (req, res) => {
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

  const fileName = `${studentName}_${domain}_${level}_${date}.mp4`

  let mp4Path = null

  try {
    // Convert WebM → MP4
    mp4Path = await convertToMp4(file.path)
    console.log(`✅ Converted to MP4: ${path.basename(mp4Path)}`)

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
    if (mp4Path) { try { fs.unlinkSync(mp4Path) } catch {} }
  }
})

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
