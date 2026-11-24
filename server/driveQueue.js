// ── PrepHire AI — Unified Google Drive Upload Queue ─────────────────────────
// Protects Render Free Tier (512MB RAM) and Google Drive API rate limits (10 req/s)
// by serializing heavy video transcoding & streaming into a resilient FIFO queue.

import fs from 'node:fs'
import path from 'node:path'

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

    // Queue storage
    this.videoQueue = []

    // Running counts
    this.activeVideoCount = 0

    // Observability stats
    this.stats = {
      videoEnqueued: 0,
      videoCompleted: 0,
      videoFailed: 0,
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
      console.log(`🎬 [DRIVE QUEUE] Starting video processing for task ${task.id} (${data.fileName})`)
      mp4Path = await this.convertToMp4(data.filePath)

      if (!this.serviceAccount) {
        // Mock mode — save locally
        const mockFileId = 'mock_' + Date.now().toString(36)
        const mockDriveLink = `https://drive.google.com/file/d/${mockFileId}/view?usp=drivesdk`
        const mockDest = path.resolve(this.uploadsDir, data.fileName)

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
   * Get queue health and statistics.
   */
  getQueueStats() {
    return {
      activeVideoCount: this.activeVideoCount,
      videoQueueLength: this.videoQueue.length,
      stats: { ...this.stats },
    }
  }
}

/**
 * Factory function to initialize the unified DriveUploadQueue.
 */
export function initDriveQueue(config) {
  return new DriveUploadQueue(config)
}
