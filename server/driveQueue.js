// ── PrepHire AI — Unified Google Drive Upload Queue ─────────────────────────
// Protects Render Free Tier (512MB RAM) and Google Drive API rate limits (10 req/s)
// by serializing heavy video transcoding & streaming and throttling high-volume
// assessment snapshot evidence uploads into a resilient FIFO queue.

import fs from 'node:fs'
import path from 'node:path'
import { Readable } from 'node:stream'
import { db, FieldValue } from './firebase.js'

/**
 * Executes a Google Drive API operation with exponential backoff and jitter.
 * Automatically retries on 403 (rate limit / quota), 429 (too many requests),
 * 500, 502, 503, and transient network errors.
 */
async function withDriveBackoff(fn, maxRetries = 4, baseDelayMs = 1000) {
  let attempt = 0
  while (true) {
    try {
      return await fn()
    } catch (err) {
      attempt++
      const status = err.status || err.code
      const msg = String(err.message || '').toLowerCase()
      const isRateLimit =
        status === 429 ||
        (status === 403 &&
          (msg.includes('ratelimit') ||
            msg.includes('user rate limit') ||
            msg.includes('quota') ||
            msg.includes('backend error') ||
            msg.includes('concurrent')))
      const isTransient = status >= 500 && status < 600
      const isNetwork = ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'EPIPE'].includes(err.code)

      if ((isRateLimit || isTransient || isNetwork) && attempt <= maxRetries) {
        const jitter = Math.floor(Math.random() * 400)
        const delay = baseDelayMs * Math.pow(2, attempt - 1) + jitter
        console.warn(
          `⚠️ [DRIVE QUEUE] Backoff retry ${attempt}/${maxRetries} after ${delay}ms (status: ${status}, reason: ${msg || err.code})`
        )
        await new Promise((r) => setTimeout(r, delay))
        continue
      }
      throw err
    }
  }
}

export class DriveUploadQueue {
  constructor({
    drive,
    serviceAccount,
    FOLDER_ID,
    uploadsDir,
    convertToMp4,
    attachUploadToSession,
  }) {
    this.drive = drive
    this.serviceAccount = serviceAccount
    this.FOLDER_ID = FOLDER_ID
    this.uploadsDir = uploadsDir
    this.convertToMp4 = convertToMp4
    this.attachUploadToSession = attachUploadToSession

    // Concurrency boundaries tuned for Render free tier (512MB RAM)
    this.MAX_CONCURRENT_VIDEO = 1 // Strict 1-at-a-time for ffmpeg + video stream
    this.MAX_CONCURRENT_EVIDENCE = 1 // Process 1 candidate evidence folder at a time
    this.INTER_SNAPSHOT_DELAY_MS = 40 // Breather between snapshots to prevent Drive bursts

    // Queue storage
    this.videoQueue = []
    this.evidenceQueue = []
    this.evidenceJobs = new Map() // jobId -> status record

    // Running counts
    this.activeVideoCount = 0
    this.activeEvidenceCount = 0

    // Cached Google Drive parent folder id for "PrepHire_Test_Evidences"
    this.cachedParentEvidencesFolderId = null

    // Observability stats
    this.stats = {
      videoEnqueued: 0,
      videoCompleted: 0,
      videoFailed: 0,
      evidenceEnqueued: 0,
      evidenceCompleted: 0,
      evidenceFailed: 0,
      backoffRetries: 0,
    }
  }

  /**
   * Enqueue a video upload task and await its completion.
   * Serializes video transcoding to ensure only 1 ffmpeg instance runs at any time.
   */
  enqueueVideoAndWait(taskData) {
    this.stats.videoEnqueued++
    return new Promise((resolve, reject) => {
      const task = {
        id: 'vid_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6),
        data: taskData,
        resolve,
        reject,
        enqueuedAt: Date.now(),
      }
      this.videoQueue.push(task)
      this.drainVideoQueue()
    })
  }

  /**
   * Enqueue an assessment evidence upload task.
   * Returns immediately with job metadata so the HTTP response is instantaneous (<20ms).
   * The worker uploads snapshots to Drive sequentially in the background and
   * automatically patches the Firestore attempt record with the Drive folder link.
   */
  enqueueEvidenceTask(taskData) {
    this.stats.evidenceEnqueued++
    const jobId = 'ev_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6)
    const sanitizedStudent = (
      taskData.studentName ||
      taskData.studentEmail?.split('@')[0] ||
      'Candidate'
    ).replace(/[^a-zA-Z0-9_-]/g, '_')
    const sanitizedTitle = (taskData.quizTitle || 'Quiz').replace(/[^a-zA-Z0-9_-]/g, '_')
    const timestampStr = new Date(taskData.completedAt || Date.now())
      .toISOString()
      .replace(/[:.]/g, '-')
      .slice(0, 19)
    const folderName = `${sanitizedStudent}_${sanitizedTitle}_${timestampStr}`

    const jobRecord = {
      jobId,
      folderName,
      status: 'queued',
      enqueuedAt: Date.now(),
      snapshotCount: Array.isArray(taskData.snapshots) ? taskData.snapshots.length : 0,
    }

    this.evidenceJobs.set(jobId, jobRecord)

    // Keep job map bounded (max 500 recent records)
    if (this.evidenceJobs.size > 500) {
      const oldestKey = this.evidenceJobs.keys().next().value
      if (oldestKey) this.evidenceJobs.delete(oldestKey)
    }

    const task = {
      id: jobId,
      folderName,
      sanitizedStudent,
      data: taskData,
      enqueuedAt: Date.now(),
    }

    this.evidenceQueue.push(task)
    this.drainEvidenceQueue()

    return {
      jobId,
      folderName,
      queued: true,
      queuePosition: this.evidenceQueue.length,
    }
  }

  /**
   * Drain the video queue respecting MAX_CONCURRENT_VIDEO.
   */
  async drainVideoQueue() {
    if (this.activeVideoCount >= this.MAX_CONCURRENT_VIDEO || this.videoQueue.length === 0) {
      return
    }

    const task = this.videoQueue.shift()
    this.activeVideoCount++

    const { data, resolve, reject } = task
    let mp4Path = null

    try {
      console.log(`[DRIVE QUEUE] Processing video upload task: ${task.id} (${data.fileName})`)

      if (data.isMp4) {
        mp4Path = data.filePath
      } else {
        mp4Path = await this.convertToMp4(data.filePath)
        console.log(`[DRIVE QUEUE] Transcoded to MP4: ${path.basename(mp4Path)}`)
      }

      // ── Mock / Local Fallback Mode (No Service Account or Drive Not Configured)
      if (!this.drive || !this.serviceAccount) {
        const mockFileId = 'mock-file-id-' + data.sessionId
        const mockDriveLink = `https://drive.google.com/file/d/${mockFileId}/view?usp=drivesdk`
        const mockDest = path.join(this.uploadsDir, 'mock_' + data.fileName)
        try {
          fs.copyFileSync(mp4Path, mockDest)
          console.log(`ℹ️ [DRIVE QUEUE] Saved local mock copy of video at: ${mockDest}`)
        } catch (copyErr) {
          console.error('⚠️ [DRIVE QUEUE] Failed to save local copy of mock video:', copyErr.message)
        }

        if (this.attachUploadToSession) {
          await this.attachUploadToSession(data.reqAuthUser, data.sessionId, {
            driveFileId: mockFileId,
            driveLink: mockDriveLink,
          })
        }

        this.stats.videoCompleted++
        resolve({
          success: true,
          fileId: mockFileId,
          driveLink: mockDriveLink,
          fileName: data.fileName,
          mock: true,
        })
        return
      }

      // ── Production Google Drive Upload
      const response = await withDriveBackoff(() =>
        this.drive.files.create({
          supportsAllDrives: true,
          requestBody: {
            name: data.fileName,
            parents: [this.FOLDER_ID],
            mimeType: 'video/mp4',
          },
          media: {
            mimeType: 'video/mp4',
            body: fs.createReadStream(mp4Path),
          },
          fields: 'id, webViewLink',
        })
      )

      const fileId = response.data.id
      const driveLink = response.data.webViewLink
      console.log(`✅ [DRIVE QUEUE] Video uploaded: ${data.fileName} → ${fileId}`)

      if (this.attachUploadToSession) {
        await this.attachUploadToSession(data.reqAuthUser, data.sessionId, {
          driveFileId: fileId,
          driveLink,
        })
      }

      this.stats.videoCompleted++
      resolve({
        success: true,
        fileId,
        driveLink,
        fileName: data.fileName,
      })
    } catch (err) {
      console.error(`❌ [DRIVE QUEUE] Video upload failed for task ${task.id}:`, err.message || err)
      this.stats.videoFailed++
      reject(err)
    } finally {
      // Clean up temporary files on disk
      try {
        if (data.filePath && fs.existsSync(data.filePath)) fs.unlinkSync(data.filePath)
      } catch {}
      try {
        if (mp4Path && mp4Path !== data.filePath && fs.existsSync(mp4Path)) fs.unlinkSync(mp4Path)
      } catch {}

      this.activeVideoCount--
      // Trigger next video in queue
      setImmediate(() => this.drainVideoQueue())
    }
  }

  /**
   * Drain the evidence queue respecting MAX_CONCURRENT_EVIDENCE.
   */
  async drainEvidenceQueue() {
    if (this.activeEvidenceCount >= this.MAX_CONCURRENT_EVIDENCE || this.evidenceQueue.length === 0) {
      return
    }

    const task = this.evidenceQueue.shift()
    this.activeEvidenceCount++

    const jobRecord = this.evidenceJobs.get(task.id)
    if (jobRecord) {
      jobRecord.status = 'processing'
      jobRecord.startedAt = Date.now()
    }

    try {
      console.log(
        `[DRIVE QUEUE] Processing evidence task: ${task.id} (${task.sanitizedStudent}, ${task.folderName})`
      )
      const { data, folderName, sanitizedStudent } = task
      const validSnapshots = (Array.isArray(data.snapshots) ? data.snapshots : []).slice(0, 25)

      if (validSnapshots.length === 0) {
        if (jobRecord) {
          jobRecord.status = 'completed'
          jobRecord.completedAt = Date.now()
        }
        return
      }

      // ── Mock / Local Fallback Mode
      if (!this.drive || !this.serviceAccount) {
        const mockEvidenceDir = path.resolve(this.uploadsDir, 'evidences', folderName)
        fs.mkdirSync(mockEvidenceDir, { recursive: true })

        const savedFiles = []
        validSnapshots.forEach((snap, idx) => {
          const raw = snap.snapshot || snap.base64
          if (!raw) return
          const base64Data = raw.replace(/^data:image\/\w+;base64,/, '')
          const buffer = Buffer.from(base64Data, 'base64')

          const timeLabel = (snap.timestamp || `snap_${idx}`).replace(/[^a-zA-Z0-9_-]/g, '_')
          const typeLabel = (snap.type || 'infraction').replace(/[^a-zA-Z0-9_-]/g, '_')
          const fileName = `${sanitizedStudent}_${timeLabel}_${typeLabel}.jpg`
          const filePath = path.join(mockEvidenceDir, fileName)

          fs.writeFileSync(filePath, buffer)
          savedFiles.push({
            name: fileName,
            driveLink: `https://drive.google.com/file/d/mock-evidence-${folderName}-${idx}/view?usp=drivesdk`,
            type: snap.type,
            detail: snap.detail,
          })
        })

        const mockFolderLink = `https://drive.google.com/drive/folders/mock-evidence-${folderName}`
        console.log(
          `ℹ️ [DRIVE QUEUE] Saved ${savedFiles.length} mock snapshots locally at: ${mockEvidenceDir}`
        )

        // Patch Firestore attempt document if attemptId is present
        if (data.attemptId && db) {
          try {
            const attemptRef = db.collection('quiz_attempts').doc(data.attemptId)
            await attemptRef.set(
              {
                driveEvidenceFolderLink: mockFolderLink,
                driveEvidenceUploadedAt: FieldValue.serverTimestamp(),
              },
              { merge: true }
            )
            console.log(`✅ [DRIVE QUEUE] Attached mock Drive link to attempt ${data.attemptId}`)
          } catch (dbErr) {
            console.warn(`⚠️ [DRIVE QUEUE] Failed to patch attempt ${data.attemptId}:`, dbErr.message)
          }
        }

        if (jobRecord) {
          jobRecord.status = 'completed'
          jobRecord.driveFolderLink = mockFolderLink
          jobRecord.completedAt = Date.now()
        }
        this.stats.evidenceCompleted++
        return
      }

      // ── Production Google Drive Mode
      // 1. Locate or create parent "PrepHire_Test_Evidences" directory inside FOLDER_ID
      let parentFolderId = this.cachedParentEvidencesFolderId
      if (!parentFolderId) {
        try {
          const parentSearch = await withDriveBackoff(() =>
            this.drive.files.list({
              supportsAllDrives: true,
              includeItemsFromAllDrives: true,
              q: `'${this.FOLDER_ID}' in parents and name = 'PrepHire_Test_Evidences' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
              fields: 'files(id, name)',
            })
          )

          if (parentSearch.data.files && parentSearch.data.files.length > 0) {
            parentFolderId = parentSearch.data.files[0].id
          } else {
            const createParent = await withDriveBackoff(() =>
              this.drive.files.create({
                supportsAllDrives: true,
                requestBody: {
                  name: 'PrepHire_Test_Evidences',
                  mimeType: 'application/vnd.google-apps.folder',
                  parents: [this.FOLDER_ID],
                },
                fields: 'id',
              })
            )
            parentFolderId = createParent.data.id
            console.log(
              `✅ [DRIVE QUEUE] Created parent Google Drive evidence folder: ${parentFolderId}`
            )
          }
          this.cachedParentEvidencesFolderId = parentFolderId
        } catch (e) {
          console.warn(
            '⚠️ [DRIVE QUEUE] Could not locate/create PrepHire_Test_Evidences, saving in root FOLDER_ID:',
            e.message
          )
          parentFolderId = this.FOLDER_ID
        }
      }

      // 2. Create the student candidate attempt folder
      const folderRes = await withDriveBackoff(() =>
        this.drive.files.create({
          supportsAllDrives: true,
          requestBody: {
            name: folderName,
            mimeType: 'application/vnd.google-apps.folder',
            parents: [parentFolderId],
          },
          fields: 'id, webViewLink',
        })
      )

      const studentFolderId = folderRes.data.id
      const driveFolderLink =
        folderRes.data.webViewLink ||
        `https://drive.google.com/drive/folders/${studentFolderId}`
      console.log(
        `✅ [DRIVE QUEUE] Created Drive folder for ${sanitizedStudent}: ${studentFolderId}`
      )

      // 3. Sequentially upload snapshots with micro-pause to prevent Drive rate limits
      const uploadedFiles = []
      for (let idx = 0; idx < validSnapshots.length; idx++) {
        const snap = validSnapshots[idx]
        const raw = snap.snapshot || snap.base64
        if (!raw) continue

        const base64Data = raw.replace(/^data:image\/\w+;base64,/, '')
        const buffer = Buffer.from(base64Data, 'base64')

        const timeLabel = (snap.timestamp || `snap_${idx}`).replace(/[^a-zA-Z0-9_-]/g, '_')
        const typeLabel = (snap.type || 'infraction').replace(/[^a-zA-Z0-9_-]/g, '_')
        const fileName = `${sanitizedStudent}_${timeLabel}_${typeLabel}.jpg`

        const fileStream = new Readable()
        fileStream.push(buffer)
        fileStream.push(null)

        const fileRes = await withDriveBackoff(() =>
          this.drive.files.create({
            supportsAllDrives: true,
            requestBody: {
              name: fileName,
              parents: [studentFolderId],
              mimeType: 'image/jpeg',
              description: `Infraction: ${snap.detail || snap.type} at ${snap.timestamp}`,
            },
            media: {
              mimeType: 'image/jpeg',
              body: fileStream,
            },
            fields: 'id, webViewLink',
          })
        )

        uploadedFiles.push({
          name: fileName,
          fileId: fileRes.data.id,
          driveLink: fileRes.data.webViewLink,
          type: snap.type,
          detail: snap.detail,
        })

        // Inter-snapshot breather to avoid tripping per-second rate limits
        if (idx < validSnapshots.length - 1) {
          await new Promise((r) => setTimeout(r, this.INTER_SNAPSHOT_DELAY_MS))
        }
      }

      console.log(
        `✅ [DRIVE QUEUE] Uploaded ${uploadedFiles.length} evidence snapshots for ${sanitizedStudent} -> ${driveFolderLink}`
      )

      // 4. Update Firestore attempt document with the Drive folder link
      if (data.attemptId && db) {
        try {
          const attemptRef = db.collection('quiz_attempts').doc(data.attemptId)
          await attemptRef.set(
            {
              driveEvidenceFolderLink: driveFolderLink,
              driveEvidenceUploadedAt: FieldValue.serverTimestamp(),
            },
            { merge: true }
          )
          console.log(
            `✅ [DRIVE QUEUE] Successfully patched attempt ${data.attemptId} with Drive link`
          )
        } catch (dbErr) {
          console.warn(
            `⚠️ [DRIVE QUEUE] Failed to update Firestore attempt ${data.attemptId}:`,
            dbErr.message
          )
        }
      }

      if (jobRecord) {
        jobRecord.status = 'completed'
        jobRecord.driveFolderLink = driveFolderLink
        jobRecord.fileCount = uploadedFiles.length
        jobRecord.completedAt = Date.now()
      }
      this.stats.evidenceCompleted++
    } catch (err) {
      console.error(
        `❌ [DRIVE QUEUE] Evidence upload failed for task ${task.id}:`,
        err.message || err
      )
      if (jobRecord) {
        jobRecord.status = 'failed'
        jobRecord.error = err.message || 'Unknown error'
        jobRecord.failedAt = Date.now()
      }
      this.stats.evidenceFailed++
    } finally {
      this.activeEvidenceCount--
      // Trigger next evidence item in queue
      setImmediate(() => this.drainEvidenceQueue())
    }
  }

  /**
   * Get queue health and statistics.
   */
  getQueueStats() {
    return {
      activeVideoCount: this.activeVideoCount,
      videoQueueLength: this.videoQueue.length,
      activeEvidenceCount: this.activeEvidenceCount,
      evidenceQueueLength: this.evidenceQueue.length,
      stats: { ...this.stats },
    }
  }

  /**
   * Check status of a specific evidence job.
   */
  getEvidenceJobStatus(jobId) {
    return this.evidenceJobs.get(jobId) || null
  }
}

/**
 * Factory function to initialize the unified DriveUploadQueue.
 */
export function initDriveQueue(config) {
  return new DriveUploadQueue(config)
}
