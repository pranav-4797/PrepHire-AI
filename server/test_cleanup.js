import 'dotenv/config'
import { runCleanup } from './cleanupService.js'
import { db } from './firebase.js'

async function test() {
  console.log('--- Starting Cleanup Test Script ---')
  if (!db) {
    console.error('Firebase Admin SDK is not initialized. Please verify your service account.')
    process.exit(1)
  }
  
  // Set test mode environment variables for this test run
  process.env.CLEANUP_TEST_MODE = 'true'
  process.env.VIDEO_RETENTION_DAYS = '1'
  
  // Create a mock session that is older than 1 minute to test cleanup
  const testSessionId = 'test-cleanup-session-' + Date.now().toString(36)
  const ninetySecAgo = new Date(Date.now() - 90 * 1000) // 90 seconds ago
  
  console.log(`Creating test session document: ${testSessionId}`)
  await db.collection('sessions').doc(testSessionId).set({
    studentName: 'Test Student',
    studentEmail: 'test@example.com',
    domain: 'General',
    level: 'Intermediate',
    score: 85,
    warnings: 0,
    date: new Date().toISOString().split('T')[0],
    driveLink: 'https://drive.google.com/file/d/mock-cleanup-file-id/view?usp=drivesdk',
    driveFileId: 'mock-cleanup-file-id',
    driveUploadAt: ninetySecAgo,
    createdAt: ninetySecAgo,
  })

  console.log('Running cleanup service in mock mode...')
  // We pass null as the drive client to run in mock mode
  await runCleanup(null)

  // Check if the document was deleted
  const docSnap = await db.collection('sessions').doc(testSessionId).get()
  if (!docSnap.exists) {
    console.log('✅ Success! The test session document was deleted from Firestore after cleanup.')
  } else {
    console.error('❌ Error: The test session document still exists in Firestore.')
  }
  process.exit(0)
}

test().catch(console.error)
