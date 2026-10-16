// ── PrepHire-AI Cookie Management & Compliance Utility ─────────────────────
// Comprehensive cookie consent, classification, and secure storage framework.
// Compliant with GDPR, CCPA, and modern browser cookie security standards.
// ─────────────────────────────────────────────────────────────────────────────

export type CookieCategory = 'necessary' | 'preferences' | 'analytics' | 'marketing'

export interface CookieConsentPreferences {
  necessary: boolean // strictly required, always true
  preferences: boolean
  analytics: boolean
  marketing: boolean
  timestamp: string
  version: string
}

export interface CookieDefinition {
  name: string
  category: CookieCategory
  purpose: string
  duration: string
  provider: string
}

export const COOKIE_CONSENT_KEY = 'prephire_cookie_consent'
export const CURRENT_CONSENT_VERSION = '1.0'

export const DEFAULT_CONSENT: CookieConsentPreferences = {
  necessary: true,
  preferences: true,
  analytics: true,
  marketing: false,
  timestamp: '',
  version: CURRENT_CONSENT_VERSION,
}

// ── Cookie Registry & Categorization ─────────────────────────────────────────
export const COOKIE_REGISTRY: Record<CookieCategory, { title: string; description: string; required: boolean; cookies: CookieDefinition[] }> = {
  necessary: {
    title: 'Strictly Necessary Cookies',
    description: 'Essential for the secure operation of PrepHire-AI. These enable core authentication, session verification, proctoring security, and cookie choice preservation. They cannot be deactivated.',
    required: true,
    cookies: [
      {
        name: 'prephire_session',
        category: 'necessary',
        purpose: 'Authenticates and preserves candidate/faculty user session identity across views.',
        duration: 'Session / 30 Days',
        provider: 'PrepHire.AI',
      },
      {
        name: 'prephire_cookie_consent',
        category: 'necessary',
        purpose: 'Stores your cookie categories preferences and consent timestamps.',
        duration: '365 Days',
        provider: 'PrepHire.AI',
      },
      {
        name: 'prephire_sec_token',
        category: 'necessary',
        purpose: 'Proctoring integrity check and CSRF defense during live assessments.',
        duration: 'Session',
        provider: 'PrepHire.AI',
      },
    ],
  },
  preferences: {
    title: 'Preferences & Functional Cookies',
    description: 'Enable enhanced functionality and personalization, such as remembering your AI voice speech synthesis setting, default coding language in Monaco editor, and dashboard layout preferences.',
    required: false,
    cookies: [
      {
        name: 'prephire_voice_enabled',
        category: 'preferences',
        purpose: 'Remembers if AI speech synthesis audio voice is enabled or muted.',
        duration: '180 Days',
        provider: 'PrepHire.AI',
      },
      {
        name: 'prephire_editor_lang',
        category: 'preferences',
        purpose: 'Remembers your last selected programming language in the coding workspace.',
        duration: '180 Days',
        provider: 'PrepHire.AI',
      },
      {
        name: 'prephire_theme_mode',
        category: 'preferences',
        purpose: 'Stores candidate interface contrast and theme mode.',
        duration: '365 Days',
        provider: 'PrepHire.AI',
      },
    ],
  },
  analytics: {
    title: 'Performance & Analytics Cookies',
    description: 'Help us analyze student assessment completion rates, code execution sandboxing latency, and question difficulty distribution to continuously improve academic platform performance.',
    required: false,
    cookies: [
      {
        name: 'prephire_analytics_id',
        category: 'analytics',
        purpose: 'Anonymized identifier to measure aggregate session and report generation latency.',
        duration: '90 Days',
        provider: 'PrepHire.AI',
      },
      {
        name: 'prephire_perf_telemetry',
        category: 'analytics',
        purpose: 'Monitors audio WebRTC latency and Piston execution round-trip times.',
        duration: '30 Days',
        provider: 'PrepHire.AI',
      },
    ],
  },
  marketing: {
    title: 'Placement & Career Opportunities Cookies',
    description: 'Used to provide tailored campus recruitment alerts, college placement drive eligibility notifications, and company-specific interview challenge recommendations.',
    required: false,
    cookies: [
      {
        name: 'prephire_placement_alerts',
        category: 'marketing',
        purpose: 'Tracks eligible corporate hiring drives matching student department & skills.',
        duration: '180 Days',
        provider: 'PrepHire.AI Placement Cell',
      },
      {
        name: 'prephire_career_insights',
        category: 'marketing',
        purpose: 'Tailors recommended coding topics based on current tech hiring trends.',
        duration: '90 Days',
        provider: 'PrepHire.AI Partners',
      },
    ],
  },
}

// ── Cookie Helper Functions ──────────────────────────────────────────────────

/**
 * Retrieves a cookie value by name.
 */
export function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null
  const nameEQ = encodeURIComponent(name) + '='
  const ca = document.cookie.split(';')
  for (let i = 0; i < ca.length; i++) {
    let c = ca[i]
    while (c.charAt(0) === ' ') c = c.substring(1, c.length)
    if (c.indexOf(nameEQ) === 0) {
      return decodeURIComponent(c.substring(nameEQ.length, c.length))
    }
  }
  return null
}

/**
 * Sets a cookie securely with expiration, SameSite, and optional category check.
 */
export function setCookie(
  name: string,
  value: string,
  days = 30,
  category: CookieCategory = 'necessary'
): boolean {
  if (typeof document === 'undefined') return false

  // If non-essential, verify consent is granted
  if (category !== 'necessary' && !hasConsent(category)) {
    return false
  }

  let expires = ''
  if (days) {
    const date = new Date()
    date.setTime(date.getTime() + days * 24 * 60 * 60 * 1000)
    expires = '; expires=' + date.toUTCString()
  }

  const isSecure = typeof window !== 'undefined' && window.location.protocol === 'https:'
  const secureFlag = isSecure ? '; Secure' : ''

  document.cookie = `${encodeURIComponent(name)}=${encodeURIComponent(value)}${expires}; path=/; SameSite=Lax${secureFlag}`
  return true
}

/**
 * Deletes a cookie by name.
 */
export function deleteCookie(name: string): void {
  if (typeof document === 'undefined') return
  document.cookie = `${encodeURIComponent(name)}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; SameSite=Lax`
}

/**
 * Retrieves the stored user cookie preferences.
 */
export function getConsent(): CookieConsentPreferences | null {
  const raw = getCookie(COOKIE_CONSENT_KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as CookieConsentPreferences
    if (parsed && typeof parsed === 'object') {
      return {
        ...DEFAULT_CONSENT,
        ...parsed,
        necessary: true, // Always enforced
      }
    }
  } catch {
    /* fallback */
  }
  return null
}

/**
 * Saves user consent preferences to a strictly necessary cookie.
 */
export function saveConsent(preferences: Partial<CookieConsentPreferences>): CookieConsentPreferences {
  const updated: CookieConsentPreferences = {
    necessary: true,
    preferences: preferences.preferences ?? false,
    analytics: preferences.analytics ?? false,
    marketing: preferences.marketing ?? false,
    timestamp: new Date().toISOString(),
    version: CURRENT_CONSENT_VERSION,
  }

  // Save for 365 days
  setCookie(COOKIE_CONSENT_KEY, JSON.stringify(updated), 365, 'necessary')

  // If user revoked any category, delete its respective cookies
  if (!updated.preferences) {
    for (const c of COOKIE_REGISTRY.preferences.cookies) deleteCookie(c.name)
  }
  if (!updated.analytics) {
    for (const c of COOKIE_REGISTRY.analytics.cookies) deleteCookie(c.name)
  }
  if (!updated.marketing) {
    for (const c of COOKIE_REGISTRY.marketing.cookies) deleteCookie(c.name)
  }

  return updated
}

/**
 * Checks if a specific cookie category has user consent.
 */
export function hasConsent(category: CookieCategory): boolean {
  if (category === 'necessary') return true
  const consent = getConsent()
  if (!consent) return false
  return Boolean(consent[category])
}

/**
 * Triggers the interactive cookie preferences modal from any button/link in the app.
 */
export function openCookiePreferences(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('open-cookie-preferences'))
  }
}
