import { initializeApp, getApps } from 'firebase/app'
import { getAnalytics, isSupported } from 'firebase/analytics'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

const requiredEnv = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
}

const missing = Object.entries(requiredEnv)
  .filter(([, value]) => !value)
  .map(([key]) => key)

if (missing.length > 0) {
  throw new Error(`Missing Firebase environment configuration: ${missing.join(', ')}`)
}

export const firebaseApp = getApps().length ? getApps()[0] : initializeApp(requiredEnv)
export const auth = getAuth(firebaseApp)
export const db = getFirestore(firebaseApp)
export const analyticsPromise = isSupported().then((supported) =>
  supported && requiredEnv.measurementId ? getAnalytics(firebaseApp) : null,
)
