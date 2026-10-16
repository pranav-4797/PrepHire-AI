import React, { useState, useEffect } from 'react'
import {
  Cookie, ShieldCheck, Sliders, Check, X,
  ChevronDown, ChevronUp, Lock, ExternalLink
} from 'lucide-react'
import {
  getConsent, saveConsent, COOKIE_REGISTRY,
  type CookieConsentPreferences, type CookieCategory
} from '../../utils/cookieManager'

interface CookieBannerProps {
  onConsentChange?: (consent: CookieConsentPreferences) => void
}

export const CookieBanner: React.FC<CookieBannerProps> = ({ onConsentChange }) => {
  const [showBanner, setShowBanner] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [expandedCategory, setExpandedCategory] = useState<CookieCategory | null>(null)

  const [preferences, setPreferences] = useState<{
    preferences: boolean
    analytics: boolean
    marketing: boolean
  }>({
    preferences: true,
    analytics: true,
    marketing: false,
  })

  useEffect(() => {
    const existing = getConsent()
    if (!existing) {
      setShowBanner(true)
    } else {
      setPreferences({
        preferences: existing.preferences,
        analytics: existing.analytics,
        marketing: existing.marketing,
      })
    }

    const handleOpen = () => setShowModal(true)
    window.addEventListener('open-cookie-preferences', handleOpen)
    return () => window.removeEventListener('open-cookie-preferences', handleOpen)
  }, [])

  const handleAcceptAll = () => {
    const updated = saveConsent({
      necessary: true,
      preferences: true,
      analytics: true,
      marketing: true,
    })
    setPreferences({ preferences: true, analytics: true, marketing: true })
    setShowBanner(false)
    setShowModal(false)
    onConsentChange?.(updated)
  }

  const handleRejectNonEssential = () => {
    const updated = saveConsent({
      necessary: true,
      preferences: false,
      analytics: false,
      marketing: false,
    })
    setPreferences({ preferences: false, analytics: false, marketing: false })
    setShowBanner(false)
    setShowModal(false)
    onConsentChange?.(updated)
  }

  const handleSaveCustom = () => {
    const updated = saveConsent({
      necessary: true,
      preferences: preferences.preferences,
      analytics: preferences.analytics,
      marketing: preferences.marketing,
    })
    setShowBanner(false)
    setShowModal(false)
    onConsentChange?.(updated)
  }

  const toggleCategory = (cat: 'preferences' | 'analytics' | 'marketing') => {
    setPreferences((prev) => ({ ...prev, [cat]: !prev[cat] }))
  }

  return (
    <>
      {/* Main Cookie Banner (First visit) */}
      {showBanner && !showModal && (
        <aside
          aria-label="Cookie consent banner"
          style={{
            position: 'fixed',
            bottom: '24px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 9999,
            width: '92%',
            maxWidth: '820px',
            background: 'rgba(15, 23, 42, 0.95)',
            border: '1px solid rgba(255, 255, 255, 0.14)',
            borderRadius: '16px',
            padding: '20px 24px',
            boxShadow: '0 20px 50px rgba(0, 0, 0, 0.45)',
            backdropFilter: 'blur(16px)',
            color: '#FFFFFF',
            animation: 'fadeIn 0.3s ease-out',
            boxSizing: 'border-box',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px', flexWrap: 'wrap' }}>
            <div
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '10px',
                background: 'rgba(59, 130, 246, 0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <Cookie size={22} style={{ color: '#FCD34D' }} />
            </div>

            <div style={{ flex: 1, minWidth: '260px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: '#FFFFFF' }}>
                  Privacy & Cookie Preferences
                </h3>
                <span
                  style={{
                    fontSize: '10px',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    background: 'rgba(59, 130, 246, 0.2)',
                    color: '#60A5FA',
                    padding: '2px 8px',
                    borderRadius: '12px',
                  }}
                >
                  GDPR / CCPA
                </span>
              </div>
              <p style={{ margin: 0, fontSize: '13px', lineHeight: '1.6', color: '#CBD5E1' }}>
                PrepHire-AI uses strictly necessary cookies for session security and anti-cheating proctoring, along with optional functional, performance, and campus placement cookies to personalize your AI interview practice.
              </p>
            </div>

            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
              <button
                onClick={() => setShowModal(true)}
                style={{
                  padding: '9px 16px',
                  borderRadius: '10px',
                  background: 'rgba(255, 255, 255, 0.08)',
                  color: '#F8FAFC',
                  border: '1px solid rgba(255, 255, 255, 0.16)',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontFamily: 'inherit',
                }}
              >
                <Sliders size={13} /> Customize
              </button>
              <button
                onClick={handleRejectNonEssential}
                style={{
                  padding: '9px 16px',
                  borderRadius: '10px',
                  background: 'transparent',
                  color: '#94A3B8',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                Reject Non-Essential
              </button>
              <button
                onClick={handleAcceptAll}
                style={{
                  padding: '9px 18px',
                  borderRadius: '10px',
                  background: 'linear-gradient(135deg, #2563EB, #1D4ED8)',
                  color: '#FFFFFF',
                  border: 'none',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontFamily: 'inherit',
                  boxShadow: '0 4px 14px rgba(37, 99, 235, 0.4)',
                }}
              >
                <Check size={14} /> Accept All
              </button>
            </div>
          </div>
        </aside>
      )}

      {/* Detailed Cookie Customization Modal */}
      {showModal && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 10000,
            background: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
            animation: 'fadeIn 0.2s ease',
          }}
          onClick={() => setShowModal(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#0F172A',
              color: '#F8FAFC',
              borderRadius: '20px',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              maxWidth: '680px',
              width: '100%',
              maxHeight: '85vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 25px 60px rgba(0, 0, 0, 0.6)',
              overflow: 'hidden',
            }}
          >
            {/* Modal Header */}
            <div
              style={{
                padding: '20px 24px',
                borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div
                  style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '10px',
                    background: 'rgba(59, 130, 246, 0.2)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <ShieldCheck size={20} style={{ color: '#60A5FA' }} />
                </div>
                <div>
                  <h2 style={{ margin: 0, fontSize: '17px', fontWeight: 700, color: '#FFFFFF' }}>
                    Cookie Preferences Center
                  </h2>
                  <span style={{ fontSize: '12px', color: '#94A3B8' }}>
                    Configure how PrepHire-AI uses cookies and storage on your device
                  </span>
                </div>
              </div>
              <button
                onClick={() => setShowModal(false)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#94A3B8',
                  cursor: 'pointer',
                  padding: '6px',
                  borderRadius: '8px',
                }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body: Categories List */}
            <div
              style={{
                padding: '20px 24px',
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column',
                gap: '14px',
              }}
            >
              {/* Category: Necessary */}
              <div
                style={{
                  background: 'rgba(255, 255, 255, 0.04)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '12px',
                  padding: '16px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                      <Lock size={14} style={{ color: '#10B981' }} />
                      <strong style={{ fontSize: '14px', color: '#FFFFFF' }}>{COOKIE_REGISTRY.necessary.title}</strong>
                      <span
                        style={{
                          fontSize: '10px',
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          background: 'rgba(16, 185, 129, 0.2)',
                          color: '#34D399',
                          padding: '2px 8px',
                          borderRadius: '10px',
                        }}
                      >
                        Always Active
                      </span>
                    </div>
                    <p style={{ margin: '0 0 10px', fontSize: '12px', lineHeight: '1.5', color: '#94A3B8' }}>
                      {COOKIE_REGISTRY.necessary.description}
                    </p>
                    <button
                      onClick={() => setExpandedCategory(expandedCategory === 'necessary' ? null : 'necessary')}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: '#60A5FA',
                        fontSize: '11px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        padding: 0,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                    >
                      {expandedCategory === 'necessary' ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                      {expandedCategory === 'necessary' ? 'Hide Details' : 'View Cookies (3)'}
                    </button>
                  </div>
                </div>

                {expandedCategory === 'necessary' && (
                  <div style={{ marginTop: '12px', borderTop: '1px solid rgba(255, 255, 255, 0.08)', paddingTop: '10px' }}>
                    {COOKIE_REGISTRY.necessary.cookies.map((c) => (
                      <div key={c.name} style={{ fontSize: '11px', marginBottom: '8px', color: '#CBD5E1' }}>
                        <code style={{ background: 'rgba(0,0,0,0.4)', padding: '2px 6px', borderRadius: '4px', color: '#93C5FD' }}>{c.name}</code>
                        <span style={{ color: '#64748B' }}> · {c.duration}</span>
                        <div style={{ color: '#94A3B8', marginTop: '2px' }}>{c.purpose}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Category: Preferences */}
              <div
                style={{
                  background: 'rgba(255, 255, 255, 0.04)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '12px',
                  padding: '16px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                      <strong style={{ fontSize: '14px', color: '#FFFFFF' }}>{COOKIE_REGISTRY.preferences.title}</strong>
                    </div>
                    <p style={{ margin: '0 0 10px', fontSize: '12px', lineHeight: '1.5', color: '#94A3B8' }}>
                      {COOKIE_REGISTRY.preferences.description}
                    </p>
                    <button
                      onClick={() => setExpandedCategory(expandedCategory === 'preferences' ? null : 'preferences')}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: '#60A5FA',
                        fontSize: '11px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        padding: 0,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                    >
                      {expandedCategory === 'preferences' ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                      {expandedCategory === 'preferences' ? 'Hide Details' : 'View Cookies (3)'}
                    </button>
                  </div>
                  <label style={{ display: 'inline-flex', alignItems: 'center', cursor: 'pointer', marginTop: '2px' }}>
                    <input
                      type="checkbox"
                      checked={preferences.preferences}
                      onChange={() => toggleCategory('preferences')}
                      style={{
                        width: '18px',
                        height: '18px',
                        cursor: 'pointer',
                        accentColor: '#2563EB',
                      }}
                    />
                  </label>
                </div>

                {expandedCategory === 'preferences' && (
                  <div style={{ marginTop: '12px', borderTop: '1px solid rgba(255, 255, 255, 0.08)', paddingTop: '10px' }}>
                    {COOKIE_REGISTRY.preferences.cookies.map((c) => (
                      <div key={c.name} style={{ fontSize: '11px', marginBottom: '8px', color: '#CBD5E1' }}>
                        <code style={{ background: 'rgba(0,0,0,0.4)', padding: '2px 6px', borderRadius: '4px', color: '#93C5FD' }}>{c.name}</code>
                        <span style={{ color: '#64748B' }}> · {c.duration}</span>
                        <div style={{ color: '#94A3B8', marginTop: '2px' }}>{c.purpose}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Category: Analytics */}
              <div
                style={{
                  background: 'rgba(255, 255, 255, 0.04)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '12px',
                  padding: '16px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                      <strong style={{ fontSize: '14px', color: '#FFFFFF' }}>{COOKIE_REGISTRY.analytics.title}</strong>
                    </div>
                    <p style={{ margin: '0 0 10px', fontSize: '12px', lineHeight: '1.5', color: '#94A3B8' }}>
                      {COOKIE_REGISTRY.analytics.description}
                    </p>
                    <button
                      onClick={() => setExpandedCategory(expandedCategory === 'analytics' ? null : 'analytics')}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: '#60A5FA',
                        fontSize: '11px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        padding: 0,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                    >
                      {expandedCategory === 'analytics' ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                      {expandedCategory === 'analytics' ? 'Hide Details' : 'View Cookies (2)'}
                    </button>
                  </div>
                  <label style={{ display: 'inline-flex', alignItems: 'center', cursor: 'pointer', marginTop: '2px' }}>
                    <input
                      type="checkbox"
                      checked={preferences.analytics}
                      onChange={() => toggleCategory('analytics')}
                      style={{
                        width: '18px',
                        height: '18px',
                        cursor: 'pointer',
                        accentColor: '#2563EB',
                      }}
                    />
                  </label>
                </div>

                {expandedCategory === 'analytics' && (
                  <div style={{ marginTop: '12px', borderTop: '1px solid rgba(255, 255, 255, 0.08)', paddingTop: '10px' }}>
                    {COOKIE_REGISTRY.analytics.cookies.map((c) => (
                      <div key={c.name} style={{ fontSize: '11px', marginBottom: '8px', color: '#CBD5E1' }}>
                        <code style={{ background: 'rgba(0,0,0,0.4)', padding: '2px 6px', borderRadius: '4px', color: '#93C5FD' }}>{c.name}</code>
                        <span style={{ color: '#64748B' }}> · {c.duration}</span>
                        <div style={{ color: '#94A3B8', marginTop: '2px' }}>{c.purpose}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Category: Marketing / Placement */}
              <div
                style={{
                  background: 'rgba(255, 255, 255, 0.04)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '12px',
                  padding: '16px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                      <strong style={{ fontSize: '14px', color: '#FFFFFF' }}>{COOKIE_REGISTRY.marketing.title}</strong>
                    </div>
                    <p style={{ margin: '0 0 10px', fontSize: '12px', lineHeight: '1.5', color: '#94A3B8' }}>
                      {COOKIE_REGISTRY.marketing.description}
                    </p>
                    <button
                      onClick={() => setExpandedCategory(expandedCategory === 'marketing' ? null : 'marketing')}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: '#60A5FA',
                        fontSize: '11px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        padding: 0,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                    >
                      {expandedCategory === 'marketing' ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                      {expandedCategory === 'marketing' ? 'Hide Details' : 'View Cookies (2)'}
                    </button>
                  </div>
                  <label style={{ display: 'inline-flex', alignItems: 'center', cursor: 'pointer', marginTop: '2px' }}>
                    <input
                      type="checkbox"
                      checked={preferences.marketing}
                      onChange={() => toggleCategory('marketing')}
                      style={{
                        width: '18px',
                        height: '18px',
                        cursor: 'pointer',
                        accentColor: '#2563EB',
                      }}
                    />
                  </label>
                </div>

                {expandedCategory === 'marketing' && (
                  <div style={{ marginTop: '12px', borderTop: '1px solid rgba(255, 255, 255, 0.08)', paddingTop: '10px' }}>
                    {COOKIE_REGISTRY.marketing.cookies.map((c) => (
                      <div key={c.name} style={{ fontSize: '11px', marginBottom: '8px', color: '#CBD5E1' }}>
                        <code style={{ background: 'rgba(0,0,0,0.4)', padding: '2px 6px', borderRadius: '4px', color: '#93C5FD' }}>{c.name}</code>
                        <span style={{ color: '#64748B' }}> · {c.duration}</span>
                        <div style={{ color: '#94A3B8', marginTop: '2px' }}>{c.purpose}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div
              style={{
                padding: '16px 24px',
                borderTop: '1px solid rgba(255, 255, 255, 0.1)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '10px',
                background: 'rgba(0, 0, 0, 0.25)',
              }}
            >
              <span style={{ fontSize: '11px', color: '#64748B', display: 'flex', alignItems: 'center', gap: '4px' }}>
                PrepHire-AI Privacy Standards <ExternalLink size={11} />
              </span>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={handleRejectNonEssential}
                  style={{
                    padding: '8px 14px',
                    borderRadius: '8px',
                    background: 'transparent',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    color: '#94A3B8',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Reject All
                </button>
                <button
                  onClick={handleSaveCustom}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '8px',
                    background: 'rgba(59, 130, 246, 0.2)',
                    border: '1px solid rgba(59, 130, 246, 0.4)',
                    color: '#93C5FD',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Save Choices
                </button>
                <button
                  onClick={handleAcceptAll}
                  style={{
                    padding: '8px 18px',
                    borderRadius: '8px',
                    background: '#2563EB',
                    border: 'none',
                    color: '#FFFFFF',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Accept All
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
