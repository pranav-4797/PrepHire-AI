import React, { useMemo } from 'react'
import { Volume2, VolumeX, Sparkles, Lightbulb, CheckCircle2, HelpCircle } from 'lucide-react'
import { T } from '../../theme'
import { parseAiMessage } from '../../utils/questionParser'

/**
 * Highlights quoted strings (e.g. "PayTrust") with a clean badge highlight.
 */
function renderHighlightedText(text: string) {
  const parts = text.split(/(".*?"|'.*?'|`.*?`)/g)
  return parts.map((part, idx) => {
    if (/^["'`].+["'`]$/.test(part)) {
      return (
        <span
          key={idx}
          style={{
            fontWeight: 700,
            color: T.primary,
            background: 'rgba(0, 30, 64, 0.06)',
            padding: '1px 6px',
            borderRadius: 4,
            border: '1px solid rgba(0, 30, 64, 0.1)',
          }}
        >
          {part}
        </span>
      )
    }
    return <span key={idx}>{part}</span>
  })
}

interface AiQuestionCardProps {
  text: string
  isSpeaking: boolean
  isLatest: boolean
  qNumber?: number
  onReplayVoice?: (text: string) => void
  onStopVoice?: () => void
}

export const AiQuestionCard: React.FC<AiQuestionCardProps> = ({
  text,
  isSpeaking,
  isLatest,
  qNumber,
  onReplayVoice,
  onStopVoice,
}) => {
  const { prelude, coreQuestion, category } = useMemo(() => parseAiMessage(text), [text])

  return (
    <div
      className="ai-question-card"
      style={{
        maxWidth: '92%',
        width: '100%',
        background: '#ffffff',
        borderRadius: 16,
        border: '1px solid rgba(0, 30, 64, 0.1)',
        boxShadow: isLatest
          ? '0 6px 24px -4px rgba(0, 30, 64, 0.09), 0 2px 6px rgba(0, 30, 64, 0.04)'
          : '0 2px 8px rgba(0, 30, 64, 0.05)',
        overflow: 'hidden',
        animation: 'fadeIn 0.3s ease',
        position: 'relative',
        transition: 'all 0.25s ease',
      }}
    >
      {/* Top accent bar */}
      <div
        style={{
          height: 3,
          width: '100%',
          background: `linear-gradient(90deg, ${T.primary} 0%, ${category.color} 50%, ${T.gold} 100%)`,
        }}
      />

      <div style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* Header bar: Avatar, Name, Equalizer, Category, Replay action */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {/* AI Avatar with speaking ring */}
            <div
              style={{
                width: 34,
                height: 34,
                borderRadius: '50%',
                background: `linear-gradient(135deg, ${T.primary} 0%, #1a365d 100%)`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
                position: 'relative',
                boxShadow: isSpeaking && isLatest
                  ? `0 0 0 3px rgba(254, 166, 25, 0.3), 0 0 12px rgba(0, 30, 64, 0.2)`
                  : '0 2px 5px rgba(0, 30, 64, 0.15)',
                transition: 'box-shadow 0.3s ease',
              }}
            >
              <Sparkles size={16} style={{ color: T.gold }} />
              {/* Verified check badge */}
              <div
                style={{
                  position: 'absolute',
                  bottom: -2,
                  right: -2,
                  background: '#ffffff',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <CheckCircle2 size={12} style={{ color: '#2563eb' }} />
              </div>
            </div>

            {/* Name, Role & Sound Wave */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: T.primary, letterSpacing: '-0.01em' }}>
                  PrepHire AI
                </span>

                {/* Animated Voice Equalizer when speaking */}
                {isSpeaking && isLatest && (
                  <div
                    title="AI voice synthesis is active"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 2.5,
                      marginLeft: 4,
                      padding: '2px 6px',
                      borderRadius: 12,
                      background: 'rgba(254, 166, 25, 0.15)',
                    }}
                  >
                    {[0, 1, 2, 3].map((bar) => (
                      <span
                        key={bar}
                        style={{
                          width: 2.5,
                          height: 10,
                          borderRadius: 2,
                          background: T.onGold,
                          display: 'inline-block',
                          animation: `equalizerBar 0.8s ease-in-out infinite alternate ${bar * 0.18}s`,
                        }}
                      />
                    ))}
                    <span style={{ fontSize: 10, fontWeight: 700, color: T.onGold, marginLeft: 2 }}>Speaking…</span>
                  </div>
                )}
              </div>
              <span style={{ fontSize: 10.5, color: T.txtMut, display: 'block', lineHeight: 1.2 }}>
                MIT AoE Technical Interviewer · Adaptive Engine
              </span>
            </div>
          </div>

          {/* Right badges & controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {/* Category Pill */}
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                fontSize: 11,
                fontWeight: 600,
                color: category.color,
                background: category.bg,
                padding: '3px 9px',
                borderRadius: 20,
                border: `1px solid ${category.color}25`,
              }}
            >
              <span>{category.icon}</span>
              <span>{category.label}</span>
            </div>

            {/* Audio Replay / Stop button */}
            {onReplayVoice && (
              <button
                type="button"
                onClick={() => {
                  if (isSpeaking && onStopVoice) {
                    onStopVoice()
                  } else {
                    onReplayVoice(text)
                  }
                }}
                title={isSpeaking ? 'Stop speaking audio' : 'Replay question audio'}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  fontSize: 11,
                  fontWeight: 600,
                  color: isSpeaking ? T.error : T.txtSec,
                  background: isSpeaking ? '#fee2e2' : 'rgba(0, 30, 64, 0.04)',
                  border: isSpeaking ? '1px solid #fca5a5' : '1px solid rgba(0, 30, 64, 0.08)',
                  borderRadius: 8,
                  padding: '4px 8px',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                }}
              >
                {isSpeaking ? (
                  <>
                    <VolumeX size={12} />
                    <span>Stop</span>
                  </>
                ) : (
                  <>
                    <Volume2 size={12} />
                    <span>Listen</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>

        {/* 1. Conversational Prelude / Transition (if exists) */}
        {prelude && (
          <div
            style={{
              padding: '9px 12px',
              borderRadius: 8,
              background: 'rgba(0, 30, 64, 0.025)',
              borderLeft: `2.5px solid rgba(0, 30, 64, 0.2)`,
              fontSize: 12.5,
              color: T.txtSec,
              lineHeight: 1.55,
            }}
          >
            {renderHighlightedText(prelude)}
          </div>
        )}

        {/* 2. Spotlight Core Question Container */}
        <div
          style={{
            padding: '13px 15px',
            borderRadius: 10,
            background: 'linear-gradient(180deg, #ffffff 0%, rgba(247, 249, 251, 0.8) 100%)',
            border: '1px solid rgba(0, 30, 64, 0.1)',
            borderLeft: `3.5px solid ${category.color}`,
            boxShadow: '0 2px 6px rgba(0, 30, 64, 0.03)',
            display: 'flex',
            flexDirection: 'column',
            gap: 7,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <HelpCircle size={13} style={{ color: category.color }} />
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 800,
                  letterSpacing: '0.06em',
                  color: category.color,
                  textTransform: 'uppercase',
                }}
              >
                Target Question
              </span>
            </div>
            {typeof qNumber === 'number' && (
              <span style={{ fontSize: 10, fontWeight: 700, color: T.txtMut }}>
                Question {qNumber} of 5
              </span>
            )}
          </div>

          <div
            style={{
              fontSize: 13.5,
              fontWeight: 600,
              lineHeight: 1.65,
              color: T.txtPri,
              letterSpacing: '-0.005em',
            }}
          >
            {renderHighlightedText(coreQuestion)}
          </div>
        </div>

        {/* 3. Actionable Coaching Tip Pill */}
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 7,
            padding: '8px 11px',
            borderRadius: 8,
            background: 'rgba(254, 166, 25, 0.08)',
            border: '1px solid rgba(254, 166, 25, 0.22)',
            fontSize: 11.5,
            color: T.onGold,
            lineHeight: 1.45,
          }}
        >
          <Lightbulb size={13} style={{ color: T.gold, marginTop: 1, flexShrink: 0 }} />
          <div>{category.tip}</div>
        </div>
      </div>
    </div>
  )
}

interface CandidateAnswerBubbleProps {
  text: string
  userName?: string
}

export const CandidateAnswerBubble: React.FC<CandidateAnswerBubbleProps> = ({
  text,
  userName = 'Candidate',
}) => {
  const wordCount = useMemo(() => text.split(/\s+/).filter(Boolean).length, [text])

  return (
    <div
      style={{
        maxWidth: '85%',
        width: 'fit-content',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        gap: 4,
        animation: 'fadeIn 0.25s ease',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, paddingRight: 4 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: T.txtSec }}>
          You ({userName})
        </span>
        <span style={{ fontSize: 10, color: T.txtMut }}>· {wordCount} words</span>
      </div>
      <div
        style={{
          padding: '12px 16px',
          borderRadius: '16px 16px 4px 16px',
          background: `linear-gradient(135deg, ${T.primary} 0%, #1a365d 100%)`,
          color: '#ffffff',
          fontSize: 13,
          lineHeight: 1.65,
          boxShadow: '0 3px 10px rgba(0, 30, 64, 0.12)',
          letterSpacing: '-0.005em',
        }}
      >
        {text}
      </div>
    </div>
  )
}
