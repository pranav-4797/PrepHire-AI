import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import { AlertOctagon, RotateCcw, Home } from 'lucide-react'
import { T } from '../../theme'
import { sanitizeErrorMessage } from '../../utils/errorSanitizer'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Log to console for debugging without exposing raw details to UI
    console.error('Unhandled interface exception caught by PrepHire ErrorBoundary:', error, errorInfo)
  }

  handleReload = () => {
    window.location.reload()
  }

  handleGoHome = () => {
    window.location.href = '/'
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }

      const friendlyMsg = sanitizeErrorMessage(
        this.state.error?.message,
        'We encountered a temporary interface issue while displaying this page. Your session and records are safe.'
      )

      return (
        <div
          role="alert"
          aria-live="assertive"
          style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'linear-gradient(135deg, #071327 0%, #0A2540 50%, #061122 100%)',
            padding: '24px',
            fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: 520,
              background: 'rgba(255, 255, 255, 0.96)',
              backdropFilter: 'blur(20px)',
              WebkitBackdropFilter: 'blur(20px)',
              borderRadius: 20,
              padding: '40px 32px',
              textAlign: 'center',
              boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.5), 0 0 40px rgba(0, 195, 255, 0.1)',
              border: '1px solid rgba(255, 255, 255, 0.8)',
            }}
          >
            {/* Visual Icon Halo */}
            <div
              style={{
                width: 72,
                height: 72,
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #FEE2E2 0%, #FECACA 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 20px auto',
                boxShadow: '0 8px 24px rgba(239, 68, 68, 0.2)',
              }}
            >
              <AlertOctagon size={36} color="#DC2626" />
            </div>

            <h1
              style={{
                fontSize: 22,
                fontWeight: 800,
                color: T.primary,
                letterSpacing: '-0.4px',
                margin: '0 0 10px 0',
              }}
            >
              Something Unexpected Happened
            </h1>

            <p
              style={{
                fontSize: 14,
                lineHeight: 1.55,
                color: T.txtSec,
                margin: '0 0 28px 0',
              }}
            >
              {friendlyMsg}
            </p>

            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
              <button
                onClick={this.handleReload}
                style={{
                  flex: '1 1 180px',
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
                <RotateCcw size={16} /> Reload Page
              </button>

              <button
                onClick={this.handleGoHome}
                style={{
                  flex: '1 1 180px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  padding: '13px 20px',
                  borderRadius: 12,
                  border: `1.5px solid ${T.outlineVar}`,
                  background: T.bgWhite,
                  color: T.txtPri,
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: 'pointer',
                  transition: 'all 0.18s ease',
                  fontFamily: 'inherit',
                }}
              >
                <Home size={16} /> Return to Home
              </button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
