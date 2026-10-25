import { ArrowLeft, Code, Home, PlayCircle } from 'lucide-react'
import { T } from '../../theme'

interface NotFoundPageProps {
  onNavigateHome: () => void
  onNavigateCoding?: () => void
  onNavigateInterview?: () => void
}

export function NotFoundPage({
  onNavigateHome,
  onNavigateCoding,
  onNavigateInterview,
}: NotFoundPageProps) {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #071327 0%, #0A2540 60%, #081B33 100%)',
        padding: '24px',
        fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 580,
          background: 'rgba(255, 255, 255, 0.96)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          borderRadius: 24,
          padding: '48px 36px',
          textAlign: 'center',
          boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.5), 0 0 45px rgba(0, 195, 255, 0.12)',
          border: '1px solid rgba(255, 255, 255, 0.8)',
          animation: 'fadeIn 0.35s ease',
        }}
      >
        {/* Large 404 Accent */}
        <div
          style={{
            fontSize: 76,
            fontWeight: 900,
            letterSpacing: '-2px',
            lineHeight: 1,
            background: 'linear-gradient(135deg, #0A2540 0%, #00C3FF 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            marginBottom: 12,
          }}
        >
          404
        </div>

        <h1
          style={{
            fontSize: 22,
            fontWeight: 800,
            color: T.primary,
            letterSpacing: '-0.3px',
            margin: '0 0 10px 0',
          }}
        >
          Page Not Found
        </h1>

        <p
          style={{
            fontSize: 14,
            lineHeight: 1.55,
            color: T.txtSec,
            maxWidth: 440,
            margin: '0 auto 32px auto',
          }}
        >
          The page or assessment route you requested does not exist, has been relocated, or requires higher institutional access.
        </p>

        {/* Action Buttons */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 380, margin: '0 auto' }}>
          <button
            onClick={onNavigateHome}
            style={{
              width: '100%',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              padding: '13px 20px',
              borderRadius: 12,
              border: 'none',
              background: T.primary,
              color: '#ffffff',
              fontSize: 14,
              fontWeight: 700,
              cursor: 'pointer',
              boxShadow: '0 4px 16px rgba(10, 37, 64, 0.25)',
              transition: 'all 0.18s ease',
              fontFamily: 'inherit',
            }}
          >
            <Home size={16} /> Return to Dashboard
          </button>

          <div style={{ display: 'flex', gap: 10 }}>
            {onNavigateCoding && (
              <button
                onClick={onNavigateCoding}
                style={{
                  flex: 1,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  padding: '11px 16px',
                  borderRadius: 10,
                  border: `1.5px solid ${T.outlineVar}`,
                  background: T.bgWhite,
                  color: T.primary,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.18s ease',
                  fontFamily: 'inherit',
                }}
              >
                <Code size={15} /> Coding Hub
              </button>
            )}

            {onNavigateInterview && (
              <button
                onClick={onNavigateInterview}
                style={{
                  flex: 1,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  padding: '11px 16px',
                  borderRadius: 10,
                  border: `1.5px solid ${T.outlineVar}`,
                  background: T.bgWhite,
                  color: T.primary,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.18s ease',
                  fontFamily: 'inherit',
                }}
              >
                <PlayCircle size={15} /> Practice Interview
              </button>
            )}
          </div>

          <button
            onClick={() => window.history.back()}
            style={{
              background: 'transparent',
              border: 'none',
              color: T.txtMut,
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              padding: '8px 0',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 4,
              fontFamily: 'inherit',
            }}
          >
            <ArrowLeft size={14} /> Go Back to Previous Page
          </button>
        </div>
      </div>
    </div>
  )
}
