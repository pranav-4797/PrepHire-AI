// ── Real-Time Proctoring WebSocket & WebRTC P2P Client Service ─────────────
// Zero-database-cost real-time telemetry, instant infraction alerts,
// administrative warning messaging, and 1-click WebRTC peer video streaming.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState, useCallback } from 'react'
import type { LiveCandidateSession, ProctorRealtimeAlert, SuspiciousFlag } from '../types/quiz'

const BACKEND_URL = (import.meta.env.VITE_BACKEND_URL as string) || 'http://localhost:3001'
const WS_BASE_URL = BACKEND_URL.replace(/^http/, 'ws') + '/ws/proctor'

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ],
}

// ─────────────────────────────────────────────────────────────────────────────
// STUDENT HOOK: useStudentProctorSocket
// ─────────────────────────────────────────────────────────────────────────────

interface StudentProctorOptions {
  quizId: string
  studentUid: string
  studentName: string
  studentEmail?: string
  department?: string
  rollNumber?: string
  totalQuestions: number
  mediaStreamRef?: React.RefObject<MediaStream | null>
  onWarningMessage?: (msg: string) => void
}

export function useStudentProctorSocket(options: StudentProctorOptions) {
  const {
    quizId,
    studentUid,
    studentName,
    studentEmail,
    department,
    rollNumber,
    totalQuestions,
    mediaStreamRef,
    onWarningMessage,
  } = options

  const wsRef = useRef<WebSocket | null>(null)
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const isMountedRef = useRef(true)

  // ── WebRTC Handlers (Student Peer Streamer) ───────────────────────────────
  const closePeerConnection = useCallback(() => {
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close()
      peerConnectionRef.current = null
    }
  }, [])

  const handleWebRTCRequest = useCallback(async () => {
    try {
      closePeerConnection()

      const stream = mediaStreamRef?.current
      if (!stream) {
        console.warn('No active camera mediaStream available for WebRTC call')
        return
      }

      const pc = new RTCPeerConnection(ICE_SERVERS)
      peerConnectionRef.current = pc

      // Add local video & audio tracks
      stream.getTracks().forEach((track) => {
        pc.addTrack(track, stream)
      })

      // Send local ICE candidates to Admin
      pc.onicecandidate = (event) => {
        if (event.candidate && wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(
            JSON.stringify({
              type: 'webrtc:ice-candidate',
              quizId,
              studentUid,
              targetRole: 'admin',
              candidate: event.candidate,
            })
          )
        }
      }

      // Create and send SDP Offer
      const offer = await pc.createOffer({
        offerToReceiveAudio: false,
        offerToReceiveVideo: false,
      })
      await pc.setLocalDescription(offer)

      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({
            type: 'webrtc:offer',
            quizId,
            studentUid,
            sdp: offer,
          })
        )
      }
    } catch (err) {
      console.error('Failed to handle WebRTC camera request:', err)
    }
  }, [quizId, studentUid, mediaStreamRef, closePeerConnection])

  // ── Establish WebSocket Connection ────────────────────────────────────────
  useEffect(() => {
    isMountedRef.current = true
    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null

    function connect() {
      if (!isMountedRef.current) return
      try {
        const ws = new WebSocket(WS_BASE_URL)
        wsRef.current = ws

        ws.onopen = () => {
          if (!isMountedRef.current) return
          setIsConnected(true)
          // Register student with quiz room
          ws.send(
            JSON.stringify({
              type: 'student:join',
              quizId,
              studentUid,
              studentName,
              studentEmail,
              department,
              rollNumber,
              totalQuestions,
            })
          )
        }

        ws.onmessage = async (evt) => {
          try {
            const data = JSON.parse(evt.data)

            // 1. Invigilator sent direct warning message
            if (data.type === 'server:warning') {
              onWarningMessage?.(data.message)
              return
            }

            // 2. Invigilator requested 1-click live camera stream
            if (data.type === 'webrtc:request') {
              handleWebRTCRequest()
              return
            }

            // 3. Invigilator sent SDP Answer
            if (data.type === 'webrtc:answer') {
              if (peerConnectionRef.current && data.sdp) {
                await peerConnectionRef.current.setRemoteDescription(
                  new RTCSessionDescription(data.sdp)
                )
              }
              return
            }

            // 4. Invigilator sent ICE Candidate
            if (data.type === 'webrtc:ice-candidate') {
              if (peerConnectionRef.current && data.candidate) {
                await peerConnectionRef.current.addIceCandidate(
                  new RTCIceCandidate(data.candidate)
                ).catch(() => {})
              }
              return
            }

            // 5. Invigilator stopped live camera view
            if (data.type === 'webrtc:hangup') {
              closePeerConnection()
              return
            }
          } catch (e) {
            console.warn('Student proctor socket message parse error:', e)
          }
        }

        ws.onclose = () => {
          if (!isMountedRef.current) return
          setIsConnected(false)
          reconnectTimeout = setTimeout(connect, 4000)
        }

        ws.onerror = () => {
          ws.close()
        }
      } catch (err) {
        console.warn('Proctor WS connect failed:', err)
        reconnectTimeout = setTimeout(connect, 5000)
      }
    }

    connect()

    return () => {
      isMountedRef.current = false
      if (reconnectTimeout) clearTimeout(reconnectTimeout)
      closePeerConnection()
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({
            type: 'student:leave',
            quizId,
            studentUid,
            reason: 'unmount',
          })
        )
        wsRef.current.close()
      }
    }
  }, [
    quizId,
    studentUid,
    studentName,
    studentEmail,
    department,
    rollNumber,
    totalQuestions,
    onWarningMessage,
    handleWebRTCRequest,
    closePeerConnection,
  ])

  // ── Telemetry Pulse Emitter ───────────────────────────────────────────────
  const sendPulse = useCallback(
    (params: {
      currentQuestionIndex: number
      answeredCount: number
      elapsedSeconds: number
      status?: 'active' | 'warning' | 'critical'
    }) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({
            type: 'student:pulse',
            quizId,
            studentUid,
            ...params,
          })
        )
      }
    },
    [quizId, studentUid]
  )

  // ── Real-Time Infraction Flag Emitter ─────────────────────────────────────
  const sendFlag = useCallback(
    (flag: {
      flagType: SuspiciousFlag['type']
      detail: string
      snapshot?: string
      integrityScore?: number
    }) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({
            type: 'student:flag',
            quizId,
            studentUid,
            ...flag,
            timestamp: new Date().toLocaleTimeString(),
          })
        )
      }
    },
    [quizId, studentUid]
  )

  return {
    isConnected,
    sendPulse,
    sendFlag,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN HOOK: useAdminProctorSocket
// ─────────────────────────────────────────────────────────────────────────────

interface AdminProctorHookResult {
  isConnected: boolean
  students: LiveCandidateSession[]
  alerts: ProctorRealtimeAlert[]
  liveStream: MediaStream | null
  activeStreamingUid: string | null
  startLiveCamera: (studentUid: string) => void
  stopLiveCamera: () => void
  sendWarning: (studentUid: string, message: string) => void
  clearAlerts: () => void
}

export function useAdminProctorSocket(quizId: string): AdminProctorHookResult {
  const wsRef = useRef<WebSocket | null>(null)
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null)
  const activeStreamingUidRef = useRef<string | null>(null)

  const [isConnected, setIsConnected] = useState(false)
  const [students, setStudents] = useState<LiveCandidateSession[]>([])
  const [alerts, setAlerts] = useState<ProctorRealtimeAlert[]>([])
  const [liveStream, setLiveStream] = useState<MediaStream | null>(null)
  const [activeStreamingUid, setActiveStreamingUid] = useState<string | null>(null)
  const isMountedRef = useRef(true)

  // ── Audio Alert Synthesizer (Chime) ───────────────────────────────────────
  const playAlertChime = useCallback((severity: 'medium' | 'high' = 'medium') => {
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      if (!AudioCtx) return
      const ctx = new AudioCtx()
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()

      osc.type = severity === 'high' ? 'sawtooth' : 'sine'
      osc.frequency.setValueAtTime(severity === 'high' ? 880 : 587.33, ctx.currentTime) // A5 or D5
      osc.frequency.exponentialRampToValueAtTime(
        severity === 'high' ? 440 : 880,
        ctx.currentTime + 0.25
      )

      gain.gain.setValueAtTime(0.12, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3)

      osc.connect(gain)
      gain.connect(ctx.destination)

      osc.start()
      osc.stop(ctx.currentTime + 0.3)
    } catch {
      // AudioContext autoplay restrictions handled safely
    }
  }, [])

  // ── WebRTC Admin Handlers ─────────────────────────────────────────────────
  const handleWebRTCOffer = useCallback(
    async (studentUid: string, sdp: RTCSessionDescriptionInit) => {
      try {
        if (peerConnectionRef.current) {
          peerConnectionRef.current.close()
        }

        const pc = new RTCPeerConnection(ICE_SERVERS)
        peerConnectionRef.current = pc

        pc.ontrack = (event) => {
          if (event.streams && event.streams[0]) {
            setLiveStream(event.streams[0])
          }
        }

        pc.onicecandidate = (event) => {
          if (event.candidate && wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(
              JSON.stringify({
                type: 'webrtc:ice-candidate',
                quizId,
                studentUid,
                targetRole: 'student',
                candidate: event.candidate,
              })
            )
          }
        }

        await pc.setRemoteDescription(new RTCSessionDescription(sdp))
        const answer = await pc.createAnswer()
        await pc.setLocalDescription(answer)

        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(
            JSON.stringify({
              type: 'webrtc:answer',
              quizId,
              studentUid,
              sdp: answer,
            })
          )
        }
      } catch (err) {
        console.error('Failed to handle incoming WebRTC offer:', err)
      }
    },
    [quizId]
  )

  const stopLiveCamera = useCallback(() => {
    const streamingUid = activeStreamingUidRef.current
    if (streamingUid && wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'webrtc:hangup',
          quizId,
          studentUid: streamingUid,
        })
      )
    }

    if (peerConnectionRef.current) {
      peerConnectionRef.current.close()
      peerConnectionRef.current = null
    }

    activeStreamingUidRef.current = null
    setLiveStream(null)
    setActiveStreamingUid(null)
  }, [quizId])

  const startLiveCamera = useCallback(
    (studentUid: string) => {
      activeStreamingUidRef.current = studentUid
      setActiveStreamingUid(studentUid)
      setLiveStream(null)

      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({
            type: 'webrtc:request',
            quizId,
            studentUid,
            adminUid: 'admin',
          })
        )
      }
    },
    [quizId]
  )

  // ── Admin WebSocket Connection ────────────────────────────────────────────
  useEffect(() => {
    isMountedRef.current = true
    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null

    function connect() {
      if (!isMountedRef.current) return
      try {
        const ws = new WebSocket(WS_BASE_URL)
        wsRef.current = ws

        ws.onopen = () => {
          if (!isMountedRef.current) return
          setIsConnected(true)
          ws.send(JSON.stringify({ type: 'admin:join', quizId }))
        }

        ws.onmessage = async (evt) => {
          try {
            const data = JSON.parse(evt.data)

            // 1. Initial Roster
            if (data.type === 'admin:init_roster') {
              setStudents(data.students || [])
              return
            }

            // 2. Candidate Joined
            if (data.type === 'candidate:joined') {
              setStudents((prev) => {
                const filtered = prev.filter((s) => s.studentUid !== data.student.studentUid)
                return [...filtered, data.student]
              })
              return
            }

            // 3. Candidate Pulsed Updates
            if (data.type === 'candidate:pulsed') {
              setStudents((prev) =>
                prev.map((s) =>
                  s.studentUid === data.studentUid ? { ...s, ...data.updates } : s
                )
              )
              return
            }

            // 4. Candidate Infraction Alert
            if (data.type === 'candidate:flagged') {
              const alert: ProctorRealtimeAlert = data.alert
              setAlerts((prev) => [alert, ...prev].slice(0, 50))
              playAlertChime(alert.severity === 'high' ? 'high' : 'medium')

              setStudents((prev) =>
                prev.map((s) => {
                  if (s.studentUid !== data.studentUid) return s
                  return {
                    ...s,
                    status: data.status || s.status,
                    recentSnapshot: data.recentSnapshot || s.recentSnapshot,
                    integrityScore: data.integrityScore ?? s.integrityScore,
                    lastFlag: {
                      timestamp: alert.timestamp,
                      type: alert.type,
                      detail: alert.detail,
                      snapshot: alert.snapshot,
                    },
                  }
                })
              )
              return
            }

            // 5. Candidate Left / Disconnected
            if (data.type === 'candidate:left') {
              setStudents((prev) =>
                prev.map((s) =>
                  s.studentUid === data.studentUid ? { ...s, status: 'disconnected' } : s
                )
              )
              return
            }

            // 6. WebRTC Offer from Candidate
            if (data.type === 'webrtc:offer') {
              handleWebRTCOffer(data.studentUid, data.sdp)
              return
            }

            // 7. WebRTC ICE Candidate from Candidate
            if (data.type === 'webrtc:ice-candidate') {
              if (peerConnectionRef.current && data.candidate) {
                await peerConnectionRef.current
                  .addIceCandidate(new RTCIceCandidate(data.candidate))
                  .catch(() => {})
              }
              return
            }
          } catch (e) {
            console.warn('Admin proctor socket parse error:', e)
          }
        }

        ws.onclose = () => {
          if (!isMountedRef.current) return
          setIsConnected(false)
          reconnectTimeout = setTimeout(connect, 3000)
        }

        ws.onerror = () => {
          ws.close()
        }
      } catch (err) {
        console.warn('Admin proctor connect error:', err)
        reconnectTimeout = setTimeout(connect, 4000)
      }
    }

    connect()

    return () => {
      isMountedRef.current = false
      if (reconnectTimeout) clearTimeout(reconnectTimeout)
      stopLiveCamera()
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.close()
      }
    }
  }, [quizId, playAlertChime, handleWebRTCOffer, stopLiveCamera])

  const sendWarning = useCallback(
    (studentUid: string, message: string) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({
            type: 'admin:warn',
            quizId,
            studentUid,
            message,
          })
        )
      }
    },
    [quizId]
  )

  const clearAlerts = useCallback(() => {
    setAlerts([])
  }, [])

  return {
    isConnected,
    students,
    alerts,
    liveStream,
    activeStreamingUid,
    startLiveCamera,
    stopLiveCamera,
    sendWarning,
    clearAlerts,
  }
}
