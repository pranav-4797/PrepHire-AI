// ── PrepHire AI — Real-Time Live Invigilation & WebRTC Gateway ─────────────
// High-performance, zero-database-cost WebSocket gateway for live invigilation.
// Relays student heartbeats, instant infraction alerts, admin warning messages,
// and WebRTC P2P signaling without touching Firestore or storing video frames.
// ─────────────────────────────────────────────────────────────────────────────

import { WebSocketServer, WebSocket } from 'ws'

export function initProctorWebSocket(httpServer) {
  const wss = new WebSocketServer({ server: httpServer, path: '/ws/proctor' })
  const rooms = new Map() // quizId -> ProctorRoom

  function getOrCreateRoom(quizId) {
    if (!rooms.has(quizId)) {
      rooms.set(quizId, {
        admins: new Set(),
        students: new Map(),
      })
    }
    return rooms.get(quizId)
  }

  function broadcastToAdmins(room, messageObj) {
    const raw = JSON.stringify(messageObj)
    for (const adminWs of room.admins) {
      if (adminWs.readyState === WebSocket.OPEN) {
        adminWs.send(raw)
      }
    }
  }

  wss.on('connection', (ws, req) => {
    let clientRole = null // 'admin' | 'student'
    let clientQuizId = null
    let clientStudentUid = null
    let isAlive = true

    ws.on('pong', () => {
      isAlive = true
    })

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString())
        const { type, quizId } = msg
        if (!quizId) return

        clientQuizId = quizId
        const room = getOrCreateRoom(quizId)

        // ── 1. Admin Join ───────────────────────────────────────────────────
        if (type === 'admin:join') {
          clientRole = 'admin'
          room.admins.add(ws)

          // Send current active student roster to the joining admin
          const studentRoster = []
          for (const [sUid, session] of room.students.entries()) {
            studentRoster.push({
              ...session.info,
              ...session.state,
              studentUid: sUid,
            })
          }

          ws.send(JSON.stringify({
            type: 'admin:init_roster',
            quizId,
            students: studentRoster,
          }))
          return
        }

        // ── 2. Student Join ─────────────────────────────────────────────────
        if (type === 'student:join') {
          clientRole = 'student'
          clientStudentUid = msg.studentUid
          const studentUid = msg.studentUid

          const studentEntry = {
            ws,
            info: {
              studentUid,
              studentName: msg.studentName || 'Candidate',
              studentEmail: msg.studentEmail || '',
              department: msg.department || 'Engineering',
              rollNumber: msg.rollNumber || '',
              totalQuestions: msg.totalQuestions || 0,
              joinedAt: new Date().toISOString(),
            },
            state: {
              currentQuestionIndex: msg.currentQuestionIndex || 0,
              answeredCount: msg.answeredCount || 0,
              elapsedSeconds: msg.elapsedSeconds || 0,
              status: 'active',
              integrityScore: 100,
              lastSeenAt: new Date().toISOString(),
            },
          }

          room.students.set(studentUid, studentEntry)

          // Notify all admins watching this quiz
          broadcastToAdmins(room, {
            type: 'candidate:joined',
            quizId,
            student: {
              ...studentEntry.info,
              ...studentEntry.state,
            },
          })
          return
        }

        // ── 3. Student Pulse (Every ~15-20s or on question advance) ──────────
        if (type === 'student:pulse') {
          const student = room.students.get(msg.studentUid)
          if (student) {
            student.state.currentQuestionIndex = msg.currentQuestionIndex ?? student.state.currentQuestionIndex
            student.state.answeredCount = msg.answeredCount ?? student.state.answeredCount
            student.state.elapsedSeconds = msg.elapsedSeconds ?? student.state.elapsedSeconds
            student.state.lastSeenAt = new Date().toISOString()
            if (msg.status && student.state.status !== 'critical') {
              student.state.status = msg.status
            }

            broadcastToAdmins(room, {
              type: 'candidate:pulsed',
              quizId,
              studentUid: msg.studentUid,
              updates: student.state,
            })
          }
          return
        }

        // ── 4. Student Infraction Flag (Instant alert to Invigilator) ────────
        if (type === 'student:flag') {
          const student = room.students.get(msg.studentUid)
          const isCritical = ['cell_phone', 'multiple_faces'].includes(msg.flagType)
          const severity = isCritical ? 'high' : 'medium'

          if (student) {
            student.state.status = isCritical ? 'critical' : 'warning'
            student.state.lastFlag = {
              type: msg.flagType,
              detail: msg.detail,
              timestamp: msg.timestamp || new Date().toLocaleTimeString(),
            }
            if (msg.snapshot) {
              student.state.recentSnapshot = msg.snapshot
            }
            if (typeof msg.integrityScore === 'number') {
              student.state.integrityScore = msg.integrityScore
            }
          }

          // Broadcast alert to admins immediately
          broadcastToAdmins(room, {
            type: 'candidate:flagged',
            quizId,
            studentUid: msg.studentUid,
            alert: {
              id: `alert_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
              quizId,
              studentUid: msg.studentUid,
              studentName: student?.info?.studentName || 'Candidate',
              type: msg.flagType,
              detail: msg.detail,
              snapshot: msg.snapshot,
              timestamp: msg.timestamp || new Date().toLocaleTimeString(),
              severity,
            },
            status: student ? student.state.status : 'warning',
            recentSnapshot: msg.snapshot,
            integrityScore: student ? student.state.integrityScore : 100,
          })
          return
        }

        // ── 5. Student Completed or Exited Quiz ──────────────────────────────
        if (type === 'student:leave') {
          const sUid = msg.studentUid || clientStudentUid
          if (sUid && room.students.has(sUid)) {
            const s = room.students.get(sUid)
            s.state.status = 'disconnected'
            broadcastToAdmins(room, {
              type: 'candidate:left',
              quizId,
              studentUid: sUid,
              reason: msg.reason || 'completed',
            })
            room.students.delete(sUid)
          }
          return
        }

        // ── 6. Admin Sends Direct Warning Message to Candidate ──────────────
        if (type === 'admin:warn') {
          const targetStudent = room.students.get(msg.studentUid)
          if (targetStudent && targetStudent.ws.readyState === WebSocket.OPEN) {
            targetStudent.ws.send(JSON.stringify({
              type: 'server:warning',
              quizId,
              message: msg.message || 'Please maintain focus on your screen.',
              timestamp: new Date().toLocaleTimeString(),
            }))
          }
          return
        }

        // ── 7. WebRTC P2P Signaling Relay ────────────────────────────────────
        // Routes SDP offers/answers and ICE candidates directly between Admin and Student

        if (type === 'webrtc:request') {
          // Admin requests live video feed from studentUid
          const student = room.students.get(msg.studentUid)
          if (student && student.ws.readyState === WebSocket.OPEN) {
            student.ws.send(JSON.stringify({
              type: 'webrtc:request',
              quizId,
              adminUid: msg.adminUid || 'admin',
            }))
          }
          return
        }

        if (type === 'webrtc:offer') {
          // Student sends offer back to admin(s)
          broadcastToAdmins(room, {
            type: 'webrtc:offer',
            quizId,
            studentUid: msg.studentUid,
            sdp: msg.sdp,
          })
          return
        }

        if (type === 'webrtc:answer') {
          // Admin sends answer back to specific student
          const student = room.students.get(msg.studentUid)
          if (student && student.ws.readyState === WebSocket.OPEN) {
            student.ws.send(JSON.stringify({
              type: 'webrtc:answer',
              quizId,
              sdp: msg.sdp,
            }))
          }
          return
        }

        if (type === 'webrtc:ice-candidate') {
          // Bidirectional ICE candidate exchange
          if (msg.targetRole === 'student') {
            const student = room.students.get(msg.studentUid)
            if (student && student.ws.readyState === WebSocket.OPEN) {
              student.ws.send(JSON.stringify({
                type: 'webrtc:ice-candidate',
                candidate: msg.candidate,
              }))
            }
          } else {
            broadcastToAdmins(room, {
              type: 'webrtc:ice-candidate',
              studentUid: msg.studentUid,
              candidate: msg.candidate,
            })
          }
          return
        }

        if (type === 'webrtc:hangup') {
          const student = room.students.get(msg.studentUid)
          if (student && student.ws.readyState === WebSocket.OPEN) {
            student.ws.send(JSON.stringify({
              type: 'webrtc:hangup',
              quizId,
            }))
          }
          return
        }
      } catch (err) {
        console.error('Proctor WebSocket error parsing message:', err)
      }
    })

    ws.on('close', () => {
      if (clientQuizId && rooms.has(clientQuizId)) {
        const room = rooms.get(clientQuizId)
        if (clientRole === 'admin') {
          room.admins.delete(ws)
        } else if (clientRole === 'student' && clientStudentUid) {
          const student = room.students.get(clientStudentUid)
          if (student && student.ws === ws) {
            student.state.status = 'disconnected'
            broadcastToAdmins(room, {
              type: 'candidate:left',
              quizId: clientQuizId,
              studentUid: clientStudentUid,
              reason: 'connection_closed',
            })
            room.students.delete(clientStudentUid)
          }
        }

        // Clean up empty room if no admins and no students
        if (room.admins.size === 0 && room.students.size === 0) {
          rooms.delete(clientQuizId)
        }
      }
    })
  })

  // ── 25-Second Ping/Pong Health Check ─────────────────────────────────────
  const interval = setInterval(() => {
    for (const [, room] of rooms.entries()) {
      for (const adminWs of room.admins) {
        if (!adminWs.isAlive) {
          adminWs.terminate()
          room.admins.delete(adminWs)
        } else {
          adminWs.isAlive = false
          adminWs.ping()
        }
      }

      for (const [sUid, session] of room.students.entries()) {
        if (!session.ws.isAlive) {
          session.ws.terminate()
          session.state.status = 'disconnected'
          broadcastToAdmins(room, {
            type: 'candidate:left',
            studentUid: sUid,
            reason: 'ping_timeout',
          })
          room.students.delete(sUid)
        } else {
          session.ws.isAlive = false
          session.ws.ping()
        }
      }
    }
  }, 25000)

  wss.on('close', () => {
    clearInterval(interval)
  })

  console.log('✅ Real-Time Live Invigilation & WebRTC Signaling WebSocket server initialized on /ws/proctor')
  return wss
}
