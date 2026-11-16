// ── AI Facial Scan & Suspicious Activity Proctor Camera ─────────────────────
// Uses TensorFlow.js + COCO-SSD to detect:
// 1. Face missing from frame (candidate walked away / looking away)
// 2. Multiple people in frame (unauthorized assistance)
// 3. Cell phone in frame (mobile device usage)

import { useState, useEffect, useRef, useCallback } from 'react'
import { Camera, AlertTriangle, ShieldCheck, UserX, Users, Smartphone } from 'lucide-react'

interface QuizProctorCameraProps {
  active: boolean
  onFlag: (reason: string) => void
  onFaceStatusChange?: (status: 'verified' | 'missing' | 'multiple' | 'phone' | 'detecting') => void
  compact?: boolean
}

export function QuizProctorCamera({
  active,
  onFlag,
  onFaceStatusChange,
  compact = false,
}: QuizProctorCameraProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const modelRef = useRef<any>(null)
  const ivRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const lastFaceSeenRef = useRef<number>(0)
  const lastWarnTimesRef = useRef<Record<string, number>>({})

  const [camStatus, setCamStatus] = useState<'idle' | 'requesting' | 'active' | 'error'>('idle')
  const [faceStatus, setFaceStatus] = useState<'verified' | 'missing' | 'multiple' | 'phone' | 'detecting'>('detecting')
  const [violationCount, setViolationCount] = useState(0)
  const [lastWarning, setLastWarning] = useState<string | null>(null)

  const triggerViolation = useCallback(
    (reason: string) => {
      setViolationCount((c) => c + 1)
      setLastWarning(reason)
      onFlag(reason)
    },
    [onFlag]
  )

  // Initialize camera stream
  const startCamera = useCallback(async () => {
    setCamStatus('requesting')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 320 },
          height: { ideal: 240 },
          facingMode: 'user',
        },
        audio: false,
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.play().catch(() => {})
      }
      setCamStatus('active')
      lastFaceSeenRef.current = Date.now()
    } catch (err) {
      console.warn('Camera access denied or unavailable:', err)
      setCamStatus('error')
    }
  }, [])

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
        // High-sensitivity inference: pass minScore 0.18 so phones and off-angle faces aren't pre-filtered
        const predictions = await modelRef.current.detect(videoRef.current, 20, 0.18)
        let personCount = 0
        let phoneDetected = false

        predictions.forEach((p: { class: string; score: number }) => {
          if (p.class === 'person' && p.score >= 0.25) personCount++
          // Phones can be classified as 'cell phone', 'remote' (dark slab), or handheld electronic
          if (
            (p.class === 'cell phone' || p.class === 'remote') &&
            p.score >= 0.18
          ) {
            phoneDetected = true
          }
        })

        const now = Date.now()
        const timestamp = new Date().toLocaleTimeString()

        if (phoneDetected) {
          setFaceStatus('phone')
          onFaceStatusChange?.('phone')
          if (now - (lastWarnTimesRef.current['phone'] || 0) > 3500) {
            lastWarnTimesRef.current['phone'] = now
            triggerViolation(`Mobile phone detected in camera at ${timestamp}`)
          }
        } else if (personCount > 1) {
          setFaceStatus('multiple')
          onFaceStatusChange?.('multiple')
          lastFaceSeenRef.current = now
          if (now - (lastWarnTimesRef.current['multiple'] || 0) > 3500) {
            lastWarnTimesRef.current['multiple'] = now
            triggerViolation(`Multiple people (${personCount}) detected in camera at ${timestamp}`)
          }
        } else if (personCount === 1) {
          setFaceStatus('verified')
          onFaceStatusChange?.('verified')
          lastFaceSeenRef.current = now
        } else if (personCount === 0) {
          setFaceStatus('missing')
          onFaceStatusChange?.('missing')
          // Trigger violation if missing for > 4 seconds
          if (now - lastFaceSeenRef.current > 4000) {
            if (now - (lastWarnTimesRef.current['missing'] || 0) > 4000) {
              lastWarnTimesRef.current['missing'] = now
              triggerViolation(`No face detected in camera at ${timestamp}`)
            }
            lastFaceSeenRef.current = now
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
  }, [active, camStatus, onFaceStatusChange, triggerViolation])

  const statusConfig = {
    verified: {
      label: 'Face Verified',
      color: '#059669',
      bg: '#ECFDF5',
      border: '#A7F3D0',
      icon: <ShieldCheck size={12} color="#059669" />,
    },
    missing: {
      label: 'Face Not in Frame',
      color: '#DC2626',
      bg: '#FEF2F2',
      border: '#FCA5A5',
      icon: <UserX size={12} color="#DC2626" />,
    },
    multiple: {
      label: 'Multiple Faces',
      color: '#DC2626',
      bg: '#FEF2F2',
      border: '#FCA5A5',
      icon: <Users size={12} color="#DC2626" />,
    },
    phone: {
      label: 'Phone Detected!',
      color: '#DC2626',
      bg: '#FEF2F2',
      border: '#FCA5A5',
      icon: <Smartphone size={12} color="#DC2626" />,
    },
    detecting: {
      label: 'Monitoring…',
      color: '#2563EB',
      bg: '#EFF6FF',
      border: '#BFDBFE',
      icon: <Camera size={12} color="#2563EB" />,
    },
  }[faceStatus]

  if (camStatus === 'error') {
    return (
      <div
        style={{
          background: '#FEF2F2',
          border: '1px solid #FCA5A5',
          borderRadius: 10,
          padding: '0.65rem 0.85rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          fontSize: '0.78rem',
          color: '#DC2626',
        }}
      >
        <AlertTriangle size={15} />
        <span>Camera access denied. Please allow camera access for proctored testing.</span>
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
          border: `2px solid ${statusConfig.color}`,
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

        {/* Live Status Pill Overlay */}
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
              background: statusConfig.color,
              boxShadow: `0 0 6px ${statusConfig.color}`,
            }}
          />
          {statusConfig.label}
        </div>

        {/* Violation Count Badge */}
        {violationCount > 0 && (
          <div
            style={{
              position: 'absolute',
              top: 6,
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

        {/* Real-time Video Alert Strip */}
        {(faceStatus === 'phone' || faceStatus === 'multiple' || faceStatus === 'missing') && (
          <div
            style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              background: 'rgba(220, 38, 38, 0.92)',
              color: '#FFFFFF',
              padding: '0.25rem 0.5rem',
              fontSize: '0.68rem',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.3rem',
              textAlign: 'center',
            }}
          >
            <AlertTriangle size={11} />
            <span>
              {faceStatus === 'phone'
                ? 'Mobile Phone Detected'
                : faceStatus === 'multiple'
                ? 'Multiple People Detected'
                : 'Face Missing from Frame'}
            </span>
          </div>
        )}
      </div>

      {/* Warning Alert Note */}
      {lastWarning && (
        <div
          style={{
            fontSize: '0.72rem',
            color: '#DC2626',
            fontWeight: 600,
            lineHeight: 1.25,
            display: 'flex',
            alignItems: 'center',
            gap: '0.3rem',
          }}
        >
          <AlertTriangle size={12} />
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {lastWarning}
          </span>
        </div>
      )}
    </div>
  )
}
