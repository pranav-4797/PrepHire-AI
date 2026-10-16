import React, { useEffect, useRef } from 'react'

interface AudioVisualizerProps {
  isListening: boolean
  isSpeaking: boolean
  stream?: MediaStream | null
  barCount?: number
  height?: number
  width?: number | string
}

export const AudioVisualizer: React.FC<AudioVisualizerProps> = ({
  isListening,
  isSpeaking,
  stream,
  barCount = 28,
  height = 48,
  width = '100%',
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const animationFrameRef = useRef<number | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null)

  useEffect(() => {
    if (!stream) {
      if (sourceRef.current) {
        sourceRef.current.disconnect()
        sourceRef.current = null
      }
      return
    }

    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      if (!AudioCtx) return

      const ctx = new AudioCtx()
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 64
      analyser.smoothingTimeConstant = 0.8

      const source = ctx.createMediaStreamSource(stream)
      source.connect(analyser)

      audioContextRef.current = ctx
      analyserRef.current = analyser
      sourceRef.current = source
    } catch (e) {
      console.warn('AudioVisualizer Web Audio API notice:', e)
    }

    return () => {
      if (sourceRef.current) {
        sourceRef.current.disconnect()
        sourceRef.current = null
      }
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close().catch(() => {})
      }
    }
  }, [stream])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let phase = 0

    const render = () => {
      const w = canvas.width
      const h = canvas.height
      ctx.clearRect(0, 0, w, h)

      const spacing = 3
      const totalBarWidth = (w - (barCount - 1) * spacing) / barCount
      const barWidth = Math.max(2, totalBarWidth)

      const freqData = analyserRef.current
        ? new Uint8Array(analyserRef.current.frequencyBinCount)
        : null

      if (analyserRef.current && freqData && isListening) {
        analyserRef.current.getByteFrequencyData(freqData)
      }

      phase += 0.08

      for (let i = 0; i < barCount; i++) {
        let normalizedHeight = 0.1

        if (isSpeaking) {
          // Synthetic speech pattern for AI voice playback
          const wave1 = Math.sin(phase + i * 0.35)
          const wave2 = Math.cos(phase * 1.5 + i * 0.2)
          normalizedHeight = Math.max(0.15, Math.abs((wave1 + wave2) / 2) * 0.85)
        } else if (isListening && freqData && freqData.length > 0) {
          // Real microphone audio frequency
          const dataIndex = Math.min(Math.floor((i / barCount) * freqData.length), freqData.length - 1)
          const value = freqData[dataIndex] || 0
          normalizedHeight = Math.max(0.08, value / 255)
        } else if (isListening) {
          // Simulated ambient mic pulse
          normalizedHeight = 0.12 + Math.sin(phase + i * 0.4) * 0.08
        }

        const barH = Math.max(3, normalizedHeight * (h - 6))
        const x = i * (barWidth + spacing)
        const y = (h - barH) / 2

        // Gradient styling matching PrepHire palette
        const gradient = ctx.createLinearGradient(0, y, 0, y + barH)
        if (isSpeaking) {
          gradient.addColorStop(0, '#A855F7') // Purple
          gradient.addColorStop(1, '#6366F1') // Indigo
        } else if (isListening) {
          gradient.addColorStop(0, '#06B6D4') // Cyan
          gradient.addColorStop(1, '#3B82F6') // Blue
        } else {
          gradient.addColorStop(0, 'rgba(148, 163, 184, 0.3)')
          gradient.addColorStop(1, 'rgba(100, 116, 139, 0.2)')
        }

        ctx.fillStyle = gradient
        ctx.beginPath()
        ctx.roundRect(x, y, barWidth, barH, 2)
        ctx.fill()
      }

      animationFrameRef.current = requestAnimationFrame(render)
    }

    render()

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [isListening, isSpeaking, barCount])

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '6px 12px',
        borderRadius: '12px',
        background: 'rgba(15, 23, 42, 0.65)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        backdropFilter: 'blur(8px)',
        width: typeof width === 'number' ? `${width}px` : width,
        boxSizing: 'border-box',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
        <div
          style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            background: isSpeaking ? '#A855F7' : isListening ? '#06B6D4' : '#64748B',
            boxShadow: isSpeaking
              ? '0 0 8px #A855F7'
              : isListening
              ? '0 0 8px #06B6D4'
              : 'none',
            transition: 'all 0.3s ease',
          }}
        />
        <span
          style={{
            fontSize: '11px',
            fontWeight: 600,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            color: isSpeaking ? '#C084FC' : isListening ? '#38BDF8' : '#94A3B8',
          }}
        >
          {isSpeaking ? 'AI Speaking' : isListening ? 'Listening to You...' : 'Audio Standby'}
        </span>
      </div>
      <canvas
        ref={canvasRef}
        width={300}
        height={height}
        style={{ width: '100%', height: `${height}px`, display: 'block' }}
      />
    </div>
  )
}
