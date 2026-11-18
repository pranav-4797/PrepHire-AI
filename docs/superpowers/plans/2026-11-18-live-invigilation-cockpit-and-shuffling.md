# Live Invigilation Cockpit (WebRTC P2P) & Anti-Cheating Shuffling Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Provide bulletproof anti-cheating protection for college lab exams via deterministic question & option shuffling, coupled with a real-time Admin Invigilation Cockpit featuring 1-click live WebRTC camera streaming and instant cheating alerts without exceeding Render (512MB RAM) or Firebase Spark quotas.

**Architecture:** 
1. **Shuffling Engine**: Deterministic pseudo-random seed generator (Mulberry32) keyed by `studentUid + quizId` to randomize question order and option positions (A, B, C, D) per student, with automatic bidirectional mapping to master keys on submission.
2. **Real-Time Signaling & Proctoring Gateway**: Zero-database-cost Node.js WebSocket gateway (`server/proctorSocket.js` using `ws`) maintaining in-memory quiz rooms for student pulses, infraction broadcasts, and WebRTC SDP/ICE signaling.
3. **P2P Live Video (WebRTC)**: Direct browser-to-browser `RTCPeerConnection` using Google's public STUN servers for 1-click HD camera feeds of flagged students without relaying video bytes through Node or Firestore.
4. **Admin Invigilation Cockpit**: High-fidelity dashboard (`AdminLiveInvigilationModal.tsx`) showing real-time candidate cards, status pills, audio chime alerts, and on-demand live video inspection with instant warning messaging.

**Tech Stack:** React 19, TypeScript, Node.js, `ws` (native WebSockets), WebRTC (`RTCPeerConnection`), Web Audio API (chime synthesizer), Tailwind design tokens (`src/theme.ts`).

---

## Proposed Changes & File Boundaries

### Backend (Server)
#### [server/package.json](file:///server/package.json)
- Add `"ws": "^8.18.0"` dependency for zero-overhead, ultra-fast WebSocket server.

#### [server/proctorSocket.js](file:///server/proctorSocket.js) (NEW)
- Manages active quiz rooms: `Map<quizId, { admins: Set<WebSocket>, students: Map<studentUid, StudentLiveSession> }>`.
- Handlers for:
  - `student:join` / `student:pulse` / `student:leave`
  - `student:flag` (relays instant alert + snapshot to admins)
  - `webrtc:request` / `webrtc:offer` / `webrtc:answer` / `webrtc:ice-candidate`
  - `admin:send-warning` (pushes warning toast to candidate's screen)
- 30-second ping/pong heartbeat to clean up abandoned connections.

#### [server/index.js](file:///server/index.js)
- Attach the `proctorSocket` WebSocket server to the existing Express HTTP server on the path `/ws/proctor`.

---

### Frontend Core & Services
#### [src/types/quiz.ts](file:///src/types/quiz.ts)
- Add optional quiz configuration properties:
  - `shuffleQuestions?: boolean` (default: true)
  - `shuffleOptions?: boolean` (default: true)
- Add `LiveCandidateState` and `ProctorAlert` types for live invigilation.

#### [src/utils/quizShuffle.ts](file:///src/utils/quizShuffle.ts) (NEW)
- Deterministic PRNG (`mulberry32`) hashing `studentUid + quizId`.
- `shuffleQuizQuestions(questions, seed)`: Produces shuffled questions where options are randomized and each option stores its `originalIndex`.
- `mapAnswersToMaster(shuffledAnswers, shuffleMap)`: Maps candidate selected displayed keys back to original option keys.

#### [src/services/proctorSocket.service.ts](file:///src/services/proctorSocket.service.ts) (NEW)
- Manages client-side WebSocket lifecycle with automatic reconnection and exponential backoff.
- Emits pulses and infraction alerts to server.
- Handles on-demand WebRTC peer connection creation using the candidate's existing camera `MediaStream`.

---

### UI Components
#### [src/components/quiz/AdminLiveInvigilationModal.tsx](file:///src/components/quiz/AdminLiveInvigilationModal.tsx) (NEW)
- Fullscreen/modal Invigilation Cockpit:
  - Header: Quiz title, live candidates count, active alerts count, and filter pills (`All`, `Clean`, `Flagged`, `Disconnected`).
  - Candidate Grid: Student avatar, name, branch, roll number, current question index, status pill (`🟢 Focused`, `🟡 Tab Switched`, `🔴 Phone Detected`, `⚫ Disconnected`), and recent snapshot thumbnail.
  - Action Controls:
    - **`▶ Live Camera` Button**: Opens WebRTC video stream in modal overlay.
    - **`⚠️ Send Warning` Button**: Sends instant warning prompt to candidate.
  - Live Audio Alert Synthesizer: Synthesizes a clean two-tone alert chime (`Web Audio API`) when a red flag occurs.

#### [src/components/quiz/AdminQuizManager.tsx](file:///src/components/quiz/AdminQuizManager.tsx)
- Add **`🔴 Live Invigilation`** action button on published quiz cards.
- Wire up `AdminLiveInvigilationModal`.

#### [src/components/quiz/QuizPlayer.tsx](file:///src/components/quiz/QuizPlayer.tsx)
- Integrate question & option shuffling on initial load.
- Initialize `proctorSocket` connection on test start with cleanup on submission.
- Listen for `admin:warning` to display immediate invigilator warning banner/toast.
- Expose camera `MediaStream` to WebRTC handler for 1-click live peer streaming.

---

## Step-by-Step Implementation Tasks

### Task 1: Question & Option Shuffling Engine
- [ ] Create `src/utils/quizShuffle.ts` with Mulberry32 PRNG and deterministic Fisher-Yates shuffle.
- [ ] Add `shuffleQuestions` and `shuffleOptions` flags to `Quiz` interface in `src/types/quiz.ts`.
- [ ] Update `QuizPlayer.tsx` to shuffle questions and options upon exam start.
- [ ] Ensure score evaluation and answer submission accurately resolve back to master question keys.

### Task 2: Backend WebSocket Proctoring Gateway
- [ ] Install `ws` in `server/package.json`.
- [ ] Create `server/proctorSocket.js` with room state, message dispatching, and WebRTC signaling exchange.
- [ ] Mount WebSocket server onto the HTTP server in `server/index.js`.
- [ ] Verify clean disconnects, ping/pong health checks, and error boundaries.

### Task 3: Client WebSocket & WebRTC P2P Service
- [ ] Create `src/services/proctorSocket.service.ts` managing connection state, heartbeats, and alert broadcasts.
- [ ] Implement `initiateWebRTCOffer` and `handleWebRTCAnswer` using Google's public STUN servers (`stun:stun.l.google.com:19302`).
- [ ] Wire student pulse and telemetry events into `QuizPlayer.tsx` and `QuizProctorCamera.tsx`.

### Task 4: Admin Live Invigilation Cockpit UI
- [ ] Create `src/components/quiz/AdminLiveInvigilationModal.tsx` with candidate grid, real-time status pills, audio chime alerts, and WebRTC video receiver.
- [ ] Add 1-click live camera modal view with video playback, mute/unmute, and snapshot capture.
- [ ] Add "Send Warning Message" modal to broadcast instant messages to specific candidates.
- [ ] Add `🔴 Live Invigilation` button to `AdminQuizManager.tsx`.

### Task 5: End-to-End Verification, Build & Deployment
- [ ] Verify TypeScript types and run `npm run lint`.
- [ ] Verify production build with `npm run build`.
- [ ] Commit all changes to Git and push to `origin/main`.
- [ ] Deploy hosting and Firestore rules via Firebase CLI.
- [ ] Update `README.md` and `AGENTS.md` with release notes.
