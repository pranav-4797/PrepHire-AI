import { initializeApp, cert } from 'firebase-admin/app'
import { getFirestore, FieldValue, FieldPath } from 'firebase-admin/firestore'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const serverDir = path.dirname(fileURLToPath(import.meta.url))
const SA_PATH = process.env.GOOGLE_SERVICE_ACCOUNT_PATH || './service-account.json'
const SA_JSON = process.env.GOOGLE_SERVICE_ACCOUNT

function readServiceAccount() {
  if (SA_JSON) {
    try {
      const raw = SA_JSON.trim().startsWith('{')
        ? SA_JSON
        : Buffer.from(SA_JSON, 'base64').toString('utf8')
      return JSON.parse(raw)
    } catch (e) {
      console.error('❌ Failed to parse GOOGLE_SERVICE_ACCOUNT env variable in firebase:', e.message)
      return null
    }
  }

  const saAbsolute = path.resolve(serverDir, SA_PATH)
  if (fs.existsSync(saAbsolute)) {
    try {
      return JSON.parse(fs.readFileSync(saAbsolute, 'utf8'))
    } catch (e) {
      console.error('❌ Failed to read or parse local service account file:', e.message)
      return null
    }
  }

  // Fallback for Render Secret Files
  const renderSecretPath = '/etc/secrets/service-account.json'
  if (fs.existsSync(renderSecretPath)) {
    try {
      return JSON.parse(fs.readFileSync(renderSecretPath, 'utf8'))
    } catch (e) {
      console.error('❌ Failed to read or parse Render secret service account file:', e.message)
      return null
    }
  }

  return null
}

const serviceAccount = readServiceAccount()
let db = null

if (serviceAccount) {
  try {
    const credential = cert(serviceAccount)
    
    // Project ID: check VITE_FIREBASE_PROJECT_ID, FIREBASE_PROJECT_ID, or fall back to service account's project_id
    const projectId = process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID || serviceAccount.project_id
    
    initializeApp({
      credential,
      projectId
    })
    
    db = getFirestore()
    console.log(`✅ Firebase Admin SDK initialized successfully for project: ${projectId}`)
  } catch (e) {
    console.error('❌ Failed to initialize Firebase Admin SDK:', e.message)
  }
} else {
  console.log('ℹ️ Running Firebase Admin in mock mode (no service account).')
}

export { db, FieldValue, FieldPath }
