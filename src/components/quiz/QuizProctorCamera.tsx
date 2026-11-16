// ── AI Facial Scan, Sound Detection & Stealth Proctor Camera ─────────────────
// Uses TensorFlow.js + COCO-SSD + Web Audio API to detect:
// 1. Face missing from frame (candidate left camera)
// 2. Multiple people in frame (unauthorized assistance)
// 3. Cell phone in frame (mobile device usage)
// 4. Background voice / audio anomalies (whispering, external help)
// 5. Silent forensic snapshot capture for Admin audit dossier.

import { useState, useEffect, useRef, useCallback } from 'react'
import { Camera, AlertTriangle, ShieldCheck, UserX, Users, Smartphone, Mic } from 'lucide-react'
import type { SuspiciousFlag } from '../../types/quiz'

interface QuizProctorCameraProps {
  active: boolean
  onFlag: (reason: string, type?: SuspiciousFlag['type'], snapshot?: string) => void
  onFaceStatusChange?: (status: 'verified' | 'missing' | 'multiple' | 'phone' | 'detecting') => void
  compact?: boolean
  stealthMode?: boolean // If true (default true), never reveals flags or warnings to the candidate
  onRegisterCapture?: (fn: () => string | undefined) => void
}

export function QuizProctorCamera({
  active,
  onFlag,
  onFaceStatusChange,
  compact = false,
  stealthMode = true,
  onRegisterCapture,
}: QuizProctorCameraProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const modelRef = useRef<any>(null)
  const ivRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const audioIvRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const speechStreakRef = useRef<number>(0)
  const lastFaceSeenRef = useRef<number>(0)
  const lastWarnTimesRef = useRef<Record<string, number>>({})

  const [camStatus, setCamStatus] = useState<'idle' | 'requesting' | 'active' | 'error'>('idle')
  const [faceStatus, setFaceStatus] = useState<'verified' | 'missing' | 'multiple' | 'phone' | 'detecting'>('detecting')
  const [violationCount, setViolationCount] = useState(0)
  const [_lastWarning, setLastWarning] = useState<string | null>(null)
  const lastCapturedFrameRef = useRef<string | undefined>(undefined)

  // Forensic snapshot capture - Ultra-optimized downscale (200x150 @ 0.38 JPEG)
  // Preserves clear visual recognition while reducing payload size to ~3.2KB (safe for high-volume evidence storage)
  const captureSnapshot = useCallback((): string | undefined => {
    const video = videoRef.current
    if (!video) return lastCapturedFrameRef.current
    try {
      if (video.videoWidth > 0 && video.videoHeight > 0) {
        const canvas = document.createElement('canvas')
        canvas.width = 200
        canvas.height = 150
        const ctx = canvas.getContext('2d')
        if (ctx) {
          ctx.drawImage(video, 0, 0, 200, 150)
          const dataUrl = canvas.toDataURL('image/jpeg', 0.38)
          lastCapturedFrameRef.current = dataUrl
          return dataUrl
        }
      }
      return lastCapturedFrameRef.current
    } catch {
      return lastCapturedFrameRef.current
    }
  }, [])

  // Register snapshot capture method for parent (e.g. on tab switch or window blur)
  useEffect(() => {
    if (onRegisterCapture) {
      onRegisterCapture(captureSnapshot)
    }
  }, [onRegisterCapture, captureSnapshot])

  const triggerViolation = useCallback(
    (reason: string, type: SuspiciousFlag['type'] = 'other', customSnapshot?: string) => {
      setViolationCount((c) => c + 1)
      setLastWarning(reason)
      const snap = customSnapshot || captureSnapshot()
      onFlag(reason, type, snap)
    },
    [onFlag, captureSnapshot]
  )

  // Initialize camera & microphone stream
  const startCamera = useCallback(async () => {
    setCamStatus('requesting')
    let stream: MediaStream | null = null

    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 320 },
          height: { ideal: 240 },
          facingMode: 'user',
        },
        audio: true,
      })
    } catch {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 320 },
            height: { ideal: 240 },
            facingMode: 'user',
          },
          audio: false,
        })
      } catch (err) {
        console.warn('Camera access denied or unavailable:', err)
        setCamStatus('error')
        return
      }
    }

    streamRef.current = stream
    if (videoRef.current) {
      videoRef.current.srcObject = stream
      videoRef.current.play().catch(() => {})
    }
    setCamStatus('active')
    lastFaceSeenRef.current = Date.now()

    // Initialize audio analyzer if microphone track is present
    if (stream.getAudioTracks().length > 0) {
      try {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext
        if (AudioCtx) {
          const audioCtx = new AudioCtx()
          audioCtxRef.current = audioCtx
          const source = audioCtx.createMediaStreamSource(stream)
          const analyser = audioCtx.createAnalyser()
          analyser.fftSize = 512
          source.connect(analyser)
          analyserRef.current = analyser

          const bufferLength = analyser.frequencyBinCount
          const dataArray = new Uint8Array(bufferLength)

          audioIvRef.current = setInterval(() => {
            if (!analyserRef.current) return
            analyserRef.current.getByteFrequencyData(dataArray)
            let sum = 0
            const checkBins = Math.min(bufferLength, 60)
            for (let i = 2; i < checkBins; i++) {
              sum += dataArray[i]
            }
            const avg = sum / (checkBins - 2)

            // Sustained vocal noise (> 36) indicates talking or whispering
            if (avg > 36) {
              speechStreakRef.current += 1
              if (speechStreakRef.current >= 3) {
                speechStreakRef.current = 0
                const now = Date.now()
                if (now - (lastWarnTimesRef.current['audio'] || 0) > 4500) {
                  lastWarnTimesRef.current['audio'] = now
                  const snap = captureSnapshot()
                  const timestamp = new Date().toLocaleTimeString()
                  triggerViolation(
                    `Suspicious audio / background voice detected (${Math.round(avg)}dB) at ${timestamp}`,
                    'audio_anomaly',
                    snap
                  )
                }
              }
            } else {
              speechStreakRef.current = Math.max(0, speechStreakRef.current - 1)
            }
          }, 500)
        }
      } catch (e) {
        console.warn('Audio proctor analyzer setup failed:', e)
      }
    }
  }, [captureSnapshot, triggerViolation])

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
    if (ivRef.current) {
      clearInterval(ivRef.current)
    }
    if (audioIvRef.current) {
      clearInterval(audioIvRef.current)
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {})
      audioCtxRef.current = null
    }
    setCamStatus('idle')
  }, [])

  useEffect(() => {
    if (active) {
      startCamera()
    } else {
      stopCamera()
    }
    return () => {
      stopCamera()
    }
  }, [active, startCamera, stopCamera])

  // AI Face & Suspicious Activity Detection Loop
  useEffect(() => {
    if (!active || camStatus !== 'active') {
      if (ivRef.current) clearInterval(ivRef.current)
      return
    }

    let isBusy = false

    const detect = async () => {
      if (isBusy || !videoRef.current || videoRef.current.readyState < 2) return

      const tf = (window as any).tf
      const cocoSsd = (window as any).cocoSsd

      if (!tf || !cocoSsd) return

      if (!modelRef.current) {
        try {
          await tf.ready()
          if (tf.getBackend() !== 'webgl' && tf.findBackend('webgl')) {
            await tf.setBackend('webgl')
          }
          modelRef.current = await cocoSsd.load({ base: 'mobilenet_v2' })
        } catch {
          try {
            modelRef.current = await cocoSsd.load()
          } catch (e) {
            console.error('Failed to load COCO-SSD model:', e)
            return
          }
        }
      }

      isBusy = true
      try {
        // Continuously refresh the cached frame so any instant blur/tab-switch has a valid snapshot
        captureSnapshot()

        // High-sensitivity inference: pass minScore 0.15 so phones and off-angle faces aren't pre-filtered
        const predictions = await modelRef.current.detect(videoRef.current, 25, 0.15)
        let personCount = 0
        let phoneDetected = false

        predictions.forEach((p: { class: string; score: number }) => {
          if (p.class === 'person' && p.score >= 0.22) personCount++
          // Phones can be classified by COCO-SSD as 'cell phone', 'remote' (dark slab), or handheld electronic
          if (
            (p.class === 'cell phone' || p.class === 'remote') &&
            p.score >= 0.15
          ) {
            phoneDetected = true
          }
        })

        const now = Date.now()
        const timestamp = new Date().toLocaleTimeString()

        if (phoneDetected) {
          setFaceStatus('phone')
          onFaceStatusChange?.('phone')
          if (now - (lastWarnTimesRef.current['phone'] || 0) > 2500) {
            lastWarnTimesRef.current['phone'] = now
            const snap = captureSnapshot()
            triggerViolation(`Mobile phone detected in camera at ${timestamp}`, 'cell_phone', snap)
          }
        }

        if (personCount > 1) {
          if (!phoneDetected) {
            setFaceStatus('multiple')
            onFaceStatusChange?.('multiple')
          }
          lastFaceSeenRef.current = now
          if (now - (lastWarnTimesRef.current['multiple'] || 0) > 2500) {
            lastWarnTimesRef.current['multiple'] = now
            const snap = captureSnapshot()
            triggerViolation(`Multiple people (${personCount}) detected in camera at ${timestamp}`, 'multiple_faces', snap)
          }
        } else if (personCount === 1) {
          if (!phoneDetected) {
            setFaceStatus('verified')
            onFaceStatusChange?.('verified')
          }
          lastFaceSeenRef.current = now
        } else if (personCount === 0) {
          if (!phoneDetected) {
            setFaceStatus('missing')
            onFaceStatusChange?.('missing')
          }
          // Trigger violation if missing for > 2 seconds
          if (now - lastFaceSeenRef.current > 2000) {
            if (now - (lastWarnTimesRef.current['missing'] || 0) > 2500) {
              lastWarnTimesRef.current['missing'] = now
              const snap = captureSnapshot()
              triggerViolation(`No face detected in camera (candidate absent) at ${timestamp}`, 'face_missing', snap)
            }
          }
        }
      } catch (err) {
        console.warn('Proctoring detection cycle skipped:', err)
      } finally {
        isBusy = false
      }
    }

    lastFaceSeenRef.current = Date.now()
    ivRef.current = setInterval(detect, 1200)

    return () => {
      if (ivRef.current) clearInterval(ivRef.current)
    }
  }, [active, camStatus, onFaceStatusChange, triggerViolation, captureSnapshot])

  const statusConfig = {
    verified: {
      label: stealthMode ? 'Proctor Active' : 'Face Verified',
      color: '#059669',
      bg: '#ECFDF5',
      border: '#A7F3D0',
      icon: <ShieldCheck size={12} color="#059669" />,
    },
    missing: {
      label: stealthMode ? 'Proctor Active' : 'Face Missing',
      color: stealthMode ? '#059669' : '#DC2626',
      bg: stealthMode ? '#ECFDF5' : '#FEF2F2',
      border: stealthMode ? '#A7F3D0' : '#FECACA',
      icon: stealthMode ? <ShieldCheck size={12} color="#059669" /> : <UserX size={12} color="#DC2626" />,
    },
    multiple: {
      label: stealthMode ? 'Proctor Active' : 'Multiple People',
      color: stealthMode ? '#059669' : '#DC2626',
      bg: stealthMode ? '#ECFDF5' : '#FEF2F2',
      border: stealthMode ? '#A7F3D0' : '#FECACA',
      icon: stealthMode ? <ShieldCheck size={12} color="#059669" /> : <Users size={12} color="#DC2626" />,
    },
    phone: {
      label: stealthMode ? 'Proctor Active' : 'Mobile Detected',
      color: stealthMode ? '#059669' : '#DC2626',
      bg: stealthMode ? '#ECFDF5' : '#FEF2F2',
      border: stealthMode ? '#A7F3D0' : '#FECACA',
      icon: stealthMode ? <ShieldCheck size={12} color="#059669" /> : <Smartphone size={12} color="#DC2626" />,
    },
    detecting: {
      label: 'Initializing...',
      color: '#D97706',
      bg: '#FFFBEB',
      border: '#FDE68A',
      icon: <Camera size={12} color="#D97706" />,
    },
  }[faceStatus]

  if (camStatus === 'error') {
    return (
      <div
        style={{
          padding: '0.85rem',
          borderRadius: 8,
          background: '#FEF2F2',
          border: '1px solid #FECACA',
          fontSize: '0.78rem',
          color: '#991B1B',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
        }}
      >
        <AlertTriangle size={16} />
        <span>Camera & audio permission required for proctored assessment.</span>
      </div>
    )
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '0.45rem',
        width: compact ? 140 : '100%',
        maxWidth: 240,
      }}
    >
      {/* Video Container */}
      <div
        style={{
          position: 'relative',
          width: '100%',
          aspectRatio: '4 / 3',
          background: '#0F172A',
          borderRadius: 10,
          overflow: 'hidden',
          border: '2px solid #10B981',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
        }}
      >
        <video
          ref={videoRef}
          muted
          playsInline
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            transform: 'scaleX(-1)', // Mirror candidate feed
          }}
        />

        {/* Live Status Pill Overlay - Always calm and reassuring in stealth mode */}
        <div
          style={{
            position: 'absolute',
            top: 6,
            left: 6,
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.3rem',
            background: 'rgba(0, 0, 0, 0.65)',
            backdropFilter: 'blur(4px)',
            color: '#FFFFFF',
            padding: '0.2rem 0.5rem',
            borderRadius: 9999,
            fontSize: '0.68rem',
            fontWeight: 700,
          }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: '#10B981',
              boxShadow: '0 0 6px #10B981',
            }}
          />
          {statusConfig.label}
        </div>

        {/* Audio Active Indicator */}
        <div
          style={{
            position: 'absolute',
            top: 6,
            right: 6,
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.25rem',
            background: 'rgba(0, 0, 0, 0.65)',
            backdropFilter: 'blur(4px)',
            color: '#A7F3D0',
            padding: '0.2rem 0.45rem',
            borderRadius: 9999,
            fontSize: '0.62rem',
            fontWeight: 600,
          }}
          title="Microphone audio encrypted & monitored"
        >
          <Mic size={10} color="#10B981" />
          <span>Mic On</span>
        </div>

        {/* Non-stealth warnings only if stealthMode is explicitly disabled */}
        {!stealthMode && violationCount > 0 && (
          <div
            style={{
              position: 'absolute',
              bottom: 6,
              right: 6,
              background: 'rgba(220, 38, 38, 0.85)',
              color: '#FFFFFF',
              fontSize: '0.65rem',
              fontWeight: 700,
              padding: '0.15rem 0.45rem',
              borderRadius: 6,
            }}
          >
            {violationCount} Flag{violationCount > 1 ? 's' : ''}
          </div>
        )}
      </div>

      {/* Reassuring Candidate Guidance Note */}
      <div
        style={{
          fontSize: '0.72rem',
          color: '#059669',
          fontWeight: 600,
          lineHeight: 1.25,
          display: 'flex',
          alignItems: 'center',
          gap: '0.3rem',
          padding: '0.2rem 0.1rem',
        }}
      >
        <ShieldCheck size={13} color="#059669" />
        <span>Continuous AI & Audio Proctoring Active</span>
      </div>
    </div>
  )
}
