import { initializeApp, getApps } from 'firebase/app'
import { getAnalytics, isSupported } from 'firebase/analytics'
import { getAuth } from 'firebase/auth'
import { getFirestore, initializeFirestore } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
}

// Only these are needed for Auth + Firestore. storageBucket, messagingSenderId and
// measurementId are optional: requiring them made a missing analytics ID throw at
// import time, before React or the ErrorBoundary could render anything (blank page).
const required: Array<keyof typeof firebaseConfig> = ['apiKey', 'authDomain', 'projectId', 'appId']
const missing = required.filter((key) => !firebaseConfig[key])

if (missing.length > 0) {
  throw new Error(`Missing Firebase environment configuration: ${missing.map((k) => `VITE_FIREBASE_${k.replace(/[A-Z]/g, (c) => `_${c}`).toUpperCase()}`).join(', ')}`)
}

export const firebaseApp = getApps().length ? getApps()[0] : initializeApp(firebaseConfig)
export const auth = getAuth(firebaseApp)

// `undefined` field values make Firestore's setDoc/addDoc throw ("Unsupported field
// value: undefined"), which silently broke saving interview sessions/reports that
// contain optional fields. Ignore them instead.
function createDb() {
  try {
    return initializeFirestore(firebaseApp, { ignoreUndefinedProperties: true })
  } catch {
    // Already initialised (e.g. Vite HMR re-evaluating this module).
    return getFirestore(firebaseApp)
  }
}
export const db = createDb()

export const analyticsPromise = isSupported()
  .then((supported) => (supported && firebaseConfig.measurementId ? getAnalytics(firebaseApp) : null))
  .catch(() => null)
