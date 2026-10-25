import type { CSSProperties, ReactNode } from 'react'
import { AlertCircle, X } from 'lucide-react'
import { T } from '../../theme'

export interface ErrorAlertProps {
  message: string | ReactNode
  id?: string
  style?: CSSProperties
  onDismiss?: () => void
  actionLabel?: string
  onAction?: () => void
}

export function ErrorAlert({
  message,
  id,
  style = {},
  onDismiss,
  actionLabel,
  onAction,
}: ErrorAlertProps) {
  if (!message) return null

  return (
    <div
      id={id}
      role="alert"
      aria-live="polite"
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
        background: '#FEF2F2',
        border: '1px solid #FCA5A5',
        borderRadius: 10,
        padding: '10px 14px',
        fontSize: 13,
        lineHeight: 1.45,
        color: '#991B1B',
        boxShadow: '0 2px 8px rgba(239, 68, 68, 0.08)',
        animation: 'slideIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
        ...style,
      }}
    >
      <AlertCircle
        size={18}
        style={{
          color: '#DC2626',
          flexShrink: 0,
          marginTop: 1,
        }}
      />
      <div style={{ flex: 1, fontWeight: 500 }}>
        {message}
        {actionLabel && onAction && (
          <button
            type="button"
            onClick={onAction}
            style={{
              display: 'inline-block',
              marginLeft: 8,
              background: 'transparent',
              border: 'none',
              color: T.primary,
              fontWeight: 700,
              fontSize: 12,
              textDecoration: 'underline',
              cursor: 'pointer',
              padding: 0,
              fontFamily: 'inherit',
            }}
          >
            {actionLabel}
          </button>
        )}
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss error notification"
          style={{
            background: 'transparent',
            border: 'none',
            color: '#B91C1C',
            cursor: 'pointer',
            padding: 2,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 4,
            transition: 'background 0.15s ease',
          }}
        >
          <X size={15} />
        </button>
      )}
    </div>
  )
}
