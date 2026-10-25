/**
 * PrepHire.AI — Centralized Error Sanitizer & Humanizer
 * 
 * Transforms technical error codes, internal stack traces, and vendor signatures
 * (Firebase, Piston, Gemini, NVIDIA, Express, Firestore) into clean, friendly,
 * actionable user messages without exposing underlying technologies.
 */

const FIREBASE_AUTH_ERRORS: Record<string, string> = {
  'auth/invalid-credential': 'Incorrect email or password. Please verify your credentials and try again.',
  'auth/wrong-password': 'Incorrect password. Please check your password and try again.',
  'auth/user-not-found': 'No registered account found with this email. Please register to get started.',
  'auth/email-already-in-use': 'An account with this email address already exists. Please sign in instead.',
  'auth/weak-password': 'Password should be at least 6 characters with a combination of letters and numbers.',
  'auth/invalid-email': 'Please enter a valid academic or professional email address.',
  'auth/user-disabled': 'This account has been deactivated. Please contact the MIT AoE placement cell for assistance.',
  'auth/too-many-requests': 'Access temporarily paused due to multiple unsuccessful attempts. Please wait a few minutes before trying again.',
  'auth/network-request-failed': 'Unable to connect to the server. Please verify your internet connection and try again.',
  'auth/requires-recent-login': 'For your security, please sign in again before modifying account settings.',
  'auth/popup-closed-by-user': 'Authentication window was closed before completion. Please try again.',
  'auth/operation-not-allowed': 'This sign-in method is temporarily unavailable. Please contact institutional support.',
  'auth/account-exists-with-different-credential': 'An account already exists with the same email using a different sign-in method.',
  'auth/quota-exceeded': 'The authentication service is experiencing high load. Please try again shortly.',
}

/**
 * Sanitizes any raw error, message, or exception into a clean, human-friendly string.
 * Strips technical jargon, vendor prefixes, and stack details.
 */
export function sanitizeErrorMessage(rawError: unknown, fallbackMessage = 'An unexpected error occurred. Please try again.'): string {
  if (!rawError) return fallbackMessage

  let msg = ''
  if (typeof rawError === 'string') {
    msg = rawError
  } else if (rawError instanceof Error) {
    msg = rawError.message
  } else if (typeof rawError === 'object' && rawError !== null && 'message' in rawError) {
    msg = String((rawError as { message: unknown }).message)
  } else {
    msg = String(rawError)
  }

  const trimmed = msg.trim()
  if (!trimmed) return fallbackMessage

  // 1. Check for known Firebase Auth error codes in parentheses e.g. (auth/invalid-credential)
  const authCodeMatch = trimmed.match(/auth\/[a-z0-9-]+/i)
  if (authCodeMatch) {
    const code = authCodeMatch[0].toLowerCase()
    if (FIREBASE_AUTH_ERRORS[code]) {
      return FIREBASE_AUTH_ERRORS[code]
    }
  }

  // 2. Check for Firebase prefix directly
  if (trimmed.toLowerCase().includes('firebase:')) {
    // If it says "Firebase: Password should be at least 6 characters"
    if (trimmed.toLowerCase().includes('password should be at least')) {
      return 'Password should be at least 6 characters.'
    }
    return 'Authentication failed. Please verify your credentials and try again.'
  }

  // 3. Network and connectivity errors
  if (
    trimmed.toLowerCase().includes('failed to fetch') ||
    trimmed.toLowerCase().includes('networkerror') ||
    trimmed.toLowerCase().includes('network error') ||
    trimmed.toLowerCase().includes('err_connection_refused') ||
    trimmed.toLowerCase().includes('econnrefused')
  ) {
    return 'Unable to reach the server. Please verify your internet connection and try again.'
  }

  // 4. Timeout errors
  if (
    trimmed.toLowerCase().includes('timeout') ||
    trimmed.toLowerCase().includes('timed out') ||
    trimmed.toLowerCase().includes('etimedout')
  ) {
    return 'The operation took longer than expected to complete. Please try again.'
  }

  // 5. Vendor / Stack specific mentions to strip & sanitize
  if (
    trimmed.toLowerCase().includes('gemini') ||
    trimmed.toLowerCase().includes('nvidia') ||
    trimmed.toLowerCase().includes('piston') ||
    trimmed.toLowerCase().includes('openai') ||
    trimmed.toLowerCase().includes('firestore') ||
    trimmed.toLowerCase().includes('mongodb')
  ) {
    if (trimmed.toLowerCase().includes('generate') || trimmed.toLowerCase().includes('problem')) {
      return 'AI Problem Studio is taking longer than expected. Please retry in a few moments.'
    }
    return 'The assessment service is temporarily busy. Please retry in a few moments.'
  }

  // 6. Rate limit / quota errors
  if (
    trimmed.toLowerCase().includes('quota') ||
    trimmed.toLowerCase().includes('rate limit') ||
    trimmed.toLowerCase().includes('429')
  ) {
    return 'Platform capacity is currently at peak load. Please wait a few seconds and try again.'
  }

  // 7. Internal Server 500 errors
  if (
    trimmed.toLowerCase().includes('500') ||
    trimmed.toLowerCase().includes('internal server error')
  ) {
    return 'The server encountered a temporary issue. Please try again shortly.'
  }

  // 8. 401/403 authorization errors
  if (
    trimmed.toLowerCase().includes('401') ||
    trimmed.toLowerCase().includes('unauthorized') ||
    trimmed.toLowerCase().includes('403') ||
    trimmed.toLowerCase().includes('forbidden')
  ) {
    return 'Your session has expired or authorization is required. Please sign in again.'
  }

  // 9. JSON parse / formatting errors
  if (
    trimmed.toLowerCase().includes('unexpected token') ||
    trimmed.toLowerCase().includes('json parse') ||
    trimmed.toLowerCase().includes('syntaxerror')
  ) {
    return 'Received an unexpected response from the server. Please try again.'
  }

  // 10. Strip any remaining file paths or stack pointers
  const cleaned = trimmed
    .replace(/^error:\s*/i, '')
    .replace(/\s*\(at\s+.*?\)/gi, '')
    .trim()

  return cleaned || fallbackMessage
}
