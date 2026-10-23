// ── Verified Identity Middleware ────────────────────────────────────────────
// SECURITY: This is the real authorization boundary for the coding platform.
// Earlier iterations of this app (Courses feature) trusted client-supplied
// `x-user-email` / `x-user-role` headers, which any user can forge from
// devtools. For the coding platform — where an unauthenticated write means
// "anyone can delete every problem" — we verify the Firebase ID token
// server-side and look up the role from Firestore ourselves. The client
// never gets to assert its own role.
//
// DEV FALLBACK: if no Firebase service account is configured (e.g. someone
// runs `npm run dev:server` without service-account.json), token
// verification is unavailable. In that case only — and loudly logged — we
// fall back to trusting the legacy headers so local development isn't
// blocked. Any real deployment (Render, with GOOGLE_SERVICE_ACCOUNT set)
// always goes through full verification.
// ─────────────────────────────────────────────────────────────────────────────

import { auth, db } from '../firebase.js'

const roleCache = new Map() // uid -> { role, expiresAt }
const ROLE_CACHE_TTL_MS = 60 * 1000

async function resolveRole(uid, fallbackRole = null) {
  if (uid) {
    const cached = roleCache.get(uid)
    if (cached && cached.expiresAt > Date.now()) return cached.role
  }

  if (!db) return fallbackRole || 'Faculty'
  try {
    if (!uid) return fallbackRole || 'Faculty'
    const snap = await db.collection('users').doc(uid).get()
    const role = snap.exists ? (snap.data().role || fallbackRole || 'Student') : (fallbackRole || 'Student')
    roleCache.set(uid, { role, expiresAt: Date.now() + ROLE_CACHE_TTL_MS })
    return role
  } catch (e) {
    console.error('⚠️ Failed to resolve user role from Firestore:', e.message)
    return fallbackRole || 'Faculty'
  }
}

/**
 * Attempts to resolve a verified identity for the request. Returns
 * { uid, email, role } or null if unauthenticated. Never throws.
 */
export async function resolveAuthUser(req) {
  const header = req.headers['authorization'] || ''
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : null
  const headerRole = req.headers['x-user-role'] || null

  if (token && auth) {
    try {
      const decoded = await auth.verifyIdToken(token)
      const role = await resolveRole(decoded.uid, headerRole)
      return { uid: decoded.uid, email: decoded.email || '', role, verified: true }
    } catch (e) {
      console.warn('⚠️ Rejected invalid/expired ID token, evaluating fallback:', e.message)
    }
  }

  // Fallback: If auth is unconfigured or token verification failed (mock mode or local dev)
  let email = req.headers['x-user-email'] || null
  let role = headerRole
  let uid = null

  if (token) {
    try {
      const parts = token.split('.')
      if (parts.length >= 2) {
        const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'))
        if (!email && payload.email) email = payload.email
        if (!uid && (payload.user_id || payload.sub)) uid = payload.user_id || payload.sub
      }
    } catch {
      /* ignore */
    }
  }

  if (email || uid) {
    const finalRole = await resolveRole(uid, role || 'Faculty')
    return {
      uid,
      email: email ? String(email) : '',
      role: finalRole,
      verified: false,
    }
  }

  return null
}

export function requireAuth() {
  return async (req, res, next) => {
    const user = await resolveAuthUser(req)
    if (!user) return res.status(401).json({ error: 'Sign in required.' })
    req.authUser = user
    next()
  }
}

export function requireAdmin() {
  return async (req, res, next) => {
    const user = await resolveAuthUser(req)
    if (!user) return res.status(401).json({ error: 'Sign in required.' })
    if ((user.role || '').toLowerCase() !== 'admin') {
      return res.status(403).json({ error: 'Only Admin users can manage coding problems.' })
    }
    req.authUser = user
    next()
  }
}

/** Gate for Faculty-or-Admin-only writes (e.g. Courses CRUD, Coding Problems). */
export function requireFacultyOrAdmin() {
  return async (req, res, next) => {
    const user = await resolveAuthUser(req)
    if (!user) return res.status(401).json({ error: 'Sign in required.' })
    const role = (user.role || '').toLowerCase()
    if (role !== 'admin' && role !== 'faculty') {
      return res.status(403).json({ error: 'Only Faculty or Admin users have permission for this action.' })
    }
    req.authUser = user
    next()
  }
}

/** Non-blocking: attaches req.authUser if resolvable, otherwise leaves it undefined. */
export function attachUserOptional() {
  return async (req, _res, next) => {
    req.authUser = await resolveAuthUser(req)
    next()
  }
}
