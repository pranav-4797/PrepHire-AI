// ── Verified Identity Middleware ────────────────────────────────────────────
// SECURITY: This is the real authorization boundary for the API. The Firebase
// ID token is verified server-side and the role is looked up from Firestore by
// the server itself — the client never gets to assert its own role.
//
// Fixed in this revision (all were exploitable):
//  1. Forged tokens: when verifyIdToken() REJECTED a token, the old code fell
//     through to a "dev fallback" that base64-decoded the JWT payload WITHOUT
//     checking its signature and then looked up that uid's role. Anyone could
//     hand-craft a token for any uid (e.g. an admin's) and become that user.
//     A rejected token is now simply a 401.
//  2. Fail-open roles: if Firestore was unreachable or not configured the role
//     defaulted to "Faculty" (a privileged role). It now fails closed to
//     "Student".
//  3. Disabled accounts: the `disabled` flag on the user profile was never
//     checked server-side, so a disabled user with a still-valid token kept
//     full API access.
//
// DEV-ONLY ESCAPE HATCH: with no Firebase service account configured, set
// ALLOW_INSECURE_DEV_AUTH=true to trust the (unverified) token payload / legacy
// headers on a developer machine. It is ignored when NODE_ENV=production.
// ─────────────────────────────────────────────────────────────────────────────

import { auth, db } from '../firebase.js'

const roleCache = new Map() // uid -> { role, disabled, expiresAt }
const ROLE_CACHE_TTL_MS = 60 * 1000
const ROLE_CACHE_MAX = 5000

function insecureDevAuth() {
  return process.env.ALLOW_INSECURE_DEV_AUTH === 'true' && process.env.NODE_ENV !== 'production'
}

let warnedDev = false

let warnedRoleError = false

async function lookupProfile(uid) {
  if (!uid) return { role: 'Student', disabled: false }
  const cached = roleCache.get(uid)
  if (cached && cached.expiresAt > Date.now()) return cached

  if (!db) return { role: 'Student', disabled: false } // fail closed

  try {
    const snap = await db.collection('users').doc(uid).get()
    const data = snap.exists ? snap.data() : {}
    const entry = {
      role: data.role || 'Student',
      disabled: data.disabled === true,
      expiresAt: Date.now() + ROLE_CACHE_TTL_MS,
    }
    if (roleCache.size >= ROLE_CACHE_MAX) roleCache.clear()
    roleCache.set(uid, entry)
    return entry
  } catch (e) {
    if (!warnedRoleError) {
      console.warn('⚠️ Failed to resolve user role from Firestore Admin SDK (failing closed to Student):', e.message)
      warnedRoleError = true
    }
    const fallback = { role: 'Student', disabled: false, expiresAt: Date.now() + 30_000 }
    roleCache.set(uid, fallback)
    return fallback
  }
}

/**
 * Attempts to resolve a verified identity for the request.
 * Returns { uid, email, role, disabled, verified } or null if unauthenticated.
 * Never throws.
 */
export async function resolveAuthUser(req) {
  const header = req.headers['authorization'] || ''
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : null

  // ── Production path: cryptographically verified Firebase ID token ──────────
  if (auth) {
    if (!token) return null
    try {
      const decoded = await auth.verifyIdToken(token)
      const profile = await lookupProfile(decoded.uid)
      const effectiveRole = (profile.role === 'Student' && (decoded.role || (decoded.admin ? 'Admin' : null)))
        ? (decoded.role || 'Admin')
        : profile.role
      return {
        uid: decoded.uid,
        email: String(decoded.email || '').toLowerCase(),
        name: decoded.name || '',
        role: effectiveRole,
        disabled: profile.disabled,
        verified: true,
      }
    } catch (e) {
      console.warn('⚠️ Rejected invalid/expired ID token:', e.code || e.message)
      return null // NEVER fall back to trusting an unverified token
    }
  }

  // ── Dev-only path (no service account) ─────────────────────────────────────
  if (!insecureDevAuth()) return null

  if (!warnedDev) {
    warnedDev = true
    console.warn('⚠️ ALLOW_INSECURE_DEV_AUTH=true: identities are NOT verified. Never enable this in production.')
  }

  let email = null
  let uid = null
  if (token) {
    try {
      const parts = token.split('.')
      const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'))
      if (payload.exp && payload.exp * 1000 < Date.now()) return null
      email = payload.email || null
      uid = payload.user_id || payload.sub || null
    } catch {
      /* not a JWT */
    }
  } else {
    email = req.headers['x-user-email'] || null
  }
  if (!uid && !email) return null

  const requested = String(process.env.DEV_AUTH_ROLE || 'Faculty')
  const role = ['Admin', 'Faculty', 'Student'].includes(requested) ? requested : 'Faculty'
  return { uid, email: String(email || '').toLowerCase(), name: '', role, disabled: false, verified: false }
}

/**
 * Builds a middleware that requires a signed-in, enabled user whose role is in
 * `allowedRoles` (lower-case). `null` means "any signed-in user".
 */
function guard(allowedRoles, forbiddenMessage) {
  return async (req, res, next) => {
    const user = await resolveAuthUser(req)
    if (!user) return res.status(401).json({ error: 'Sign in required.' })
    if (user.disabled) return res.status(403).json({ error: 'This account has been disabled.' })
    if (allowedRoles && !allowedRoles.includes((user.role || '').toLowerCase())) {
      return res.status(403).json({ error: forbiddenMessage })
    }
    req.authUser = user
    next()
  }
}

export function requireAuth() {
  return guard(null)
}

export function requireAdmin() {
  return guard(['admin'], 'Only Admin users can perform this action.')
}

/** Gate for Faculty-or-Admin-only writes (e.g. Courses CRUD, Coding Problems). */
export function requireFacultyOrAdmin() {
  return guard(['admin', 'faculty'], 'Only Faculty or Admin users have permission for this action.')
}

/** Non-blocking: attaches req.authUser if resolvable (and enabled), otherwise leaves it undefined. */
export function attachUserOptional() {
  return async (req, _res, next) => {
    const user = await resolveAuthUser(req)
    req.authUser = user && !user.disabled ? user : undefined
    next()
  }
}
