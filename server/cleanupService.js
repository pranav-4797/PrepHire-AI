import cron from 'node-cron'
import { db, FieldPath } from './firebase.js'

function extractFileId(driveLink) {
  if (!driveLink) return null
  const match = driveLink.match(/\/file\/d\/([a-zA-Z0-9_-]+)/)
  return match ? match[1] : null
}

function getUploadTime(session) {
  if (session.driveUploadAt) {
    return session.driveUploadAt.toDate ? session.driveUploadAt.toDate() : new Date(session.driveUploadAt)
  }
  if (session.createdAt) {
    return session.createdAt.toDate ? session.createdAt.toDate() : new Date(session.createdAt)
  }
  if (session.date) {
    const d = new Date(session.date)
    if (!isNaN(d.getTime())) return d
  }
  return null
}

export async function runCleanup(drive = null) {
  const retentionDays = Number(process.env.VIDEO_RETENTION_DAYS) || 7
  const testMode = process.env.CLEANUP_TEST_MODE === 'true'
  
  // Calculate threshold time
  const thresholdMs = testMode ? 60 * 1000 : retentionDays * 24 * 60 * 60 * 1000
  const thresholdTime = new Date(Date.now() - thresholdMs)
  
  console.log(`[CLEANUP] Starting cleanup. Test mode: ${testMode}. Retention period: ${testMode ? '1 minute' : `${retentionDays} days`}. Threshold: ${thresholdTime.toISOString()}`)

  if (!db) {
    console.error('[CLEANUP] Firestore database is not initialized. Skipping cleanup.')
    return
  }

  const batchSize = 50
  let lastSeenId = null
  let hasMore = true
  let processedCount = 0
  let deletedCount = 0
  let errorCount = 0

  while (hasMore) {
    try {
      let query = db.collection('sessions')
        .orderBy(FieldPath.documentId())
        .limit(batchSize)
      
      if (lastSeenId) {
        query = query.startAfter(lastSeenId)
      }
      
      const snapshot = await query.get()
      if (snapshot.empty) {
        hasMore = false
        break
      }

      console.log(`[CLEANUP] Processing batch of ${snapshot.size} sessions...`)

      for (const doc of snapshot.docs) {
        lastSeenId = doc.id
        const session = doc.data()
        
        // Only process sessions that have video metadata
        if (!session.driveLink && !session.driveFileId) {
          continue
        }

        processedCount++
        
        const uploadTime = getUploadTime(session)
        if (!uploadTime) {
          console.warn(`[CLEANUP] Session ${doc.id} has video but no valid timestamp. Skipping.`)
          continue
        }

        if (uploadTime < thresholdTime) {
          const fileId = session.driveFileId || extractFileId(session.driveLink)
          
          if (!fileId) {
            console.warn(`[CLEANUP] Could not extract Google Drive File ID for session ${doc.id} (link: ${session.driveLink}). Skipping.`)
            continue
          }

          console.log(`[CLEANUP] Session ${doc.id} is expired (uploaded at ${uploadTime.toISOString()}). Deleting video ${fileId} from Drive...`)

          try {
            if (!drive) {
              console.log(`[CLEANUP] [MOCK MODE] Mock deleted video ${fileId} for session ${doc.id}`)
            } else {
              try {
                await drive.files.delete({
                  fileId: fileId,
                  supportsAllDrives: true
                })
                console.log(`[CLEANUP] Deleted video ${fileId} from Google Drive`)
              } catch (driveErr) {
                // Handle missing files gracefully
                if (driveErr.code === 404) {
                  console.log(`[CLEANUP] Video file ${fileId} was already missing from Google Drive. Treating as success.`)
                } else {
                  // Throw error to trigger catch block and skip deleting the DB record
                  throw driveErr
                }
              }
            }

            // Successful Drive removal (or file missing), delete database record
            await doc.ref.delete()
            console.log(`[CLEANUP] Deleted database record for session ${doc.id}`)
            deletedCount++
          } catch (err) {
            errorCount++
            console.error(`[CLEANUP] Failed to clean up session ${doc.id} (video: ${fileId}):`, err.message || err)
          }
        }
      }

      if (snapshot.size < batchSize) {
        hasMore = false
      }
    } catch (batchErr) {
      console.error('[CLEANUP] Error retrieving batch from database:', batchErr.message || batchErr)
      hasMore = false
    }
  }

  console.log(`[CLEANUP] Cleanup completed. Processed: ${processedCount}, Deleted: ${deletedCount}, Errors: ${errorCount}`)
}

export function initCleanup(drive = null) {
  const testMode = process.env.CLEANUP_TEST_MODE === 'true'
  const cronSchedule = testMode ? '* * * * *' : '0 0 * * *'
  
  console.log(`[CLEANUP] Registering scheduled cleanup job. Cron schedule: "${cronSchedule}"`)
  
  cron.schedule(cronSchedule, async () => {
    try {
      await runCleanup(drive)
    } catch (err) {
      console.error('[CLEANUP] Scheduled job threw an error:', err.message || err)
    }
  })
}
