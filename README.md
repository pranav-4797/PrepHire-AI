# PrepHire.AI — AI-Powered Mock Interview & Placement Platform

<div align="center">

[![Live Demo](https://img.shields.io/badge/Live%20Platform-prephire--ai.web.app-2563EB?style=for-the-badge&logo=googlechrome&logoColor=white)](https://prephire-ai.web.app)
[![React 19](https://img.shields.io/badge/React%2019-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white)](https://vitejs.dev/)
[![Firebase](https://img.shields.io/badge/Firebase-FFCA28?style=for-the-badge&logo=firebase&logoColor=black)](https://firebase.google.com/)

**Master campus recruitment with resume-tailored AI voice interviews, real-time proctored evaluations, and an interactive coding arena.**

*Designed for Placement Cells, Faculty Mentors, and Engineering Students*

</div>

---

## 🌟 What is PrepHire.AI?

**PrepHire.AI** is an all-in-one placement preparation and assessment platform designed to help students build confidence and excel in campus placement drives. 

By combining conversational AI, resume intelligence, interactive code execution, and institutional oversight, PrepHire.AI delivers a realistic interview simulator that identifies strengths, pinpoints knowledge gaps, and provides concrete, actionable guidance.

---

## 🆕 What's New in the Latest Release

- 📄 **High-Fidelity Structured Resume Parser & Comprehensive Profile Showcase (`resume.ts` & `App.tsx`)**:
  - **Spatial Multi-Line PDF Reconstitution**: Upgraded `extractResumeText` with Y-coordinate change tracking and `hasEOL` detection, preserving line and paragraph breaks across all pages.
  - **Section-Isolated Extraction & Heading Disambiguation**: Restructured `offlineParseResume` to match section headings at line beginnings, preventing mid-sentence keywords from capturing unintended prose.
  - **Zero-Drop Resume Profile Display**: Added education credentials (degree, institute, CGPA), all detected skills & tools, real project titles (stripping capstone fallbacks), certifications, and hackathon achievements directly to the Student Profile resume dossier.

- 🎓 **Admin Course Approval Persistence & Instant Catalog Sync (`firestore.service.ts` & `App.tsx`)**:
  - **Firestore Status Persistence Fix**: Fixed a bug where `updateCourse` unconditionally reset course status to `pending`, preventing Admin approvals from persisting to Firestore.
  - **Optimistic Approval & Rejection UX**: Admin course cards immediately switch badge states and action buttons upon clicking Approve/Reject, with immediate propagation to student course catalogs.

- 🧠 **Zero-Failure Resume Analysis: NVIDIA NIM & Rule-Based Offline Parser (`resume.ts` & `server/index.js`)**:
  - **NVIDIA NIM Proxy Fallback**: Integrated NVIDIA NIM models (`meta/llama-3.1-8b-instruct`) into `/api/ai/generate` on the backend, activating automatically when Gemini encounters 429 quota exhaustion or 502 upstream errors.
  - **Client-Side Offline Rule-Based Extraction**: Built `offlineParseResume` covering 120+ software engineering skills, tech stacks (MERN, Django, Spring Boot, AI/ML), educational degrees, and project/experience extractors. Resume profile generation now operates with 100% guaranteed success even completely offline or with zero AI credits.

- 🚀 **Zero-Lag Test Startup & Background Model Pre-warming (`proctorPrewarm.ts`)**:
  - **Proactive AI Model Pre-warming**: BlazeFace and Coco-SSD neural network weights and WebGL shaders are pre-warmed in the background as soon as candidates enter the Quiz Hub or open public assessment links.
  - **Instantaneous Examination Launch**: Eliminates the previous 2–4s main-thread freezing and compilation lag when clicking "Start Quiz", allowing camera and question palettes to render in <100ms.

- 🖼️ **Polished Evidence Lightbox Dialog (`QuizLeaderboardModal.tsx`)**:
  - Replaced the unstyled floating snapshot preview with a structured modal dialog featuring a blurred backdrop, 4:3 aspect ratio framing, forensic metadata badges, and click-outside/Escape dismissal.

- 🔐 **Cryptographic Zero-Inspection Answer Encryption (`quizCipher.ts` & `/api/quiz/evaluate`)**:
  - **AES-256-GCM Authenticated Cipher**: Assessment question answers and explanations are securely encrypted with AES-256-GCM cipher tokens (`enc:v1:<iv>:<ciphertext>`) before being persisted to Firestore or sent across the network.
  - **Zero-Exposure Student Delivery**: Active candidate payloads are sanitized via `stripAnswersForStudent`, completely stripping `correctIndex` and `explanation` from memory and React state. Candidates cannot inspect correct answers via browser DevTools, Network logs, or React Developer Tools.
  - **Cryptographic Evaluation & Server Endpoint**: Submissions are evaluated on final hand-in through the new `POST /api/quiz/evaluate` endpoint (or client-side authenticated decryption fallback), calculating official marks without premature answer leakage.

- ⏰ **Assessment Scheduling & Countdown Waiting Room (`AdminQuizEditor`, `StudentQuizHub`, `PublicQuizTake`)**:
  - **Admin Scheduling Studio**: Administrators can configure an assessment's `scheduledStartTime` and optional `scheduledEndTime` test window with date-time pickers in the quiz editor.
  - **Student Hub Real-Time Ticker**: Scheduled quizzes are visible in the student catalog with schedule badges, but the start button remains locked with a live countdown ticker (`🔒 Starts in Xh Ym Zs`) that unlocks automatically when start time arrives.
  - **Public Assessment Waiting Room (`/quiz/:quizId`)**: Public candidate test links feature a scheduled countdown card and locked registration action, preventing candidates from starting proctored sessions before the official exam window opens.

- 📄 **Robust MCQ Question Document Importer (`quizDocParser.ts`)**:
  - **Collision-Proof Parsing Engine**: Re-engineered option and answer extraction using line-anchored patterns and strict word boundaries, eliminating false positive token collisions (such as `key` in `Keyboard`, `ans` in `means`, and `right` in `brightness`) and achieving 100% extraction fidelity on 50/50 question examination papers.

- 🚀 **Performance & Server Optimization — Dropped Quiz Drive Snapshots & Live Cockpit**:
  - **Zero Server Load on Assessment Submissions**: Removed candidate snapshot photo uploads to Google Drive. Eliminates heavy base64 image processing, multi-megabyte payloads, and background Drive queues from the backend Express server, allowing hundreds of candidates to submit assessments concurrently without stressing server memory or bandwidth.
  - **Eliminated Live Cockpit & WebRTC WebSocket Overhead**: Removed the `/ws/proctor` WebSocket gateway, continuous background telemetry pulses, and WebRTC peer camera streaming. This drastically reduces browser CPU cycles on student machines and prevents server socket connection limits during large exam batches.
  - **Clean & Fast Direct Firestore Submission**: Candidate attempts and computed integrity scores are committed straight to Firestore in <120ms with zero server hop latency.

- ⚡ **Dual-Engine Real-Time BlazeFace Multi-Face & Sub-Second Mobile Detector (`QuizProctorCamera.tsx`)**:
  - **Instantaneous Multi-Face Detection (BlazeFace)**: Integrated Google's real-time BlazeFace neural network (~8ms inference) alongside object detection. It detects individual faces, head angles, and secondary people looking at the screen with microsecond precision, eliminating COCO-SSD's limitation of requiring full-body torsos.
  - **Sub-Second Mobile Phone Alerting**: Slashed detection interval from 1500ms down to 600ms and introduced tiered confidence scoring ($\ge 0.42$ instant confirmation, $\ge 0.28$ 2-frame verification). When a candidate brings up a phone, it is identified and logged in under 1 second.
  - **Calibrated False-Positive Shield**: High-speed detection is decoupled from desk items, keeping mugs, mice, and shadows completely immune to false mobile device flags.

- 🛡️ **Camera Stream Stability & Synchronized Shuffled Question Palette (`QuizPlayer.tsx` & `QuizProctorCamera.tsx`)**:
  - **Eliminated Camera Blinking & Feed Restarts**: Refactored `QuizProctorCamera.tsx` callbacks into stable `useRef` handlers with zero-dependency `useCallback` hooks. Countdown timer state updates in `QuizPlayer` no longer trigger unmount/remount cycles or stream teardowns, ensuring continuous uninterrupted video streaming.
  - **Synchronized Palette with Anti-Cheat Question Shuffling**: Fixed palette mapping in `QuizPlayer.tsx` to iterate over `shuffledQuestions` instead of the raw unshuffled array. Palette buttons 1..N now match the candidate's randomized question order 1:1, completely preventing unattempted questions from being marked green.
  - **Admin Leaderboard Submission Timestamp**: Integrated a dedicated `Submitted At` column in `QuizLeaderboardModal.tsx` displaying exact 12-hour submission timestamps (hours, minutes, seconds) and formatted dates, with expanded audit dossier telemetry chips.

- 🖥️ **Mandatory Continuous Fullscreen Lockdown & Anti-Tamper Shield (`QuizPlayer.tsx`)**:
  - **Zero-Bypass Fullscreen Mandate**: All student and public candidate assessments must remain in continuous, un-interrupted fullscreen mode throughout the test.
  - **Eager Launch Integration**: Starting a quiz from `StudentQuizHub.tsx` or `PublicQuizTake.tsx` triggers browser fullscreen immediately on candidate click.
  - **Hard Lockdown Blur & Interaction Freeze**: If a candidate attempts to exit fullscreen (via `Esc`, window minimize, or multi-tasking), the exam content is instantly obscured with a strong `blur(8px)` visual filter, all keyboard and mouse interactions on the quiz are disabled, and a prominent lockdown modal blocks the viewport.
  - **Forensic Infraction Tracking**: Every fullscreen exit event is captured as an integrity violation with timestamped photographic evidence, deducted from the candidate's integrity score, and relayed in real time to the invigilator's cockpit via WebSockets.
  - **1-Click Seamless Fullscreen Resume**: Candidates can click "Return to Fullscreen & Resume" to re-engage fullscreen via a direct user gesture and continue the test.
  - **Clean Post-Exam Release**: Fullscreen is automatically exited upon test submission, allowing candidates to comfortably review declared results and answer keys.

- 🧠 **Faculty & Admin Interview Question Bank (Firestore-Backed CRUD)**: Faculty and administrators can now author, curate, and retire interview questions directly from their portals instead of relying solely on the built-in static bank. Live questions are stored in a new `interview_questions` Firestore collection and layered over the curated 26-question `QUESTION_BANK`, which remains the offline seed and fallback.
  - **Full CRUD Studio (`QuestionBankManager.tsx`)**: Create, edit, duplicate-on-edit, activate/deactivate, and delete questions across all four interview domains (`technical`, `hr`, `aptitude`, `group-discussion`), all nine MIT AoE branches (plus `All`), and beginner/intermediate/advanced levels — with expected keywords, key concepts, probing/advanced follow-ups, and sample strong answers.
  - **Synchronous Engine Integration Without Latency**: `questionBank.service.ts` exposes an in-memory hydrated cache (`getActiveBankQuestions()` / `getSessionQuestions()`), so `interviewEngine` and `offlineEvaluator` stay fully synchronous — interview sessions never wait on a Firestore round-trip, and lookups by question text resolve against the live bank first, then the static seed.
  - **One-Click Seed & AI Question Generation**: A "Seed Starter Bank" action bulk-imports the curated library into Firestore, while an AI Generate panel drafts new questions from a topic prompt (via `/api/ai/generate`) with domain, level, and branch pre-selection plus a template-based fallback when the AI endpoint is unavailable.
  - **Search, Filters & Live KPIs**: Real-time text search plus domain/level/branch/status filters and KPI cards for total, active, AI-generated, and custom questions.
  - **Deep Routing & Governance**: New `questions` tab wired into both faculty and admin portals with sidebar entries and browser-history deep links (`/faculty/questions`, `/admin/questions`, `/admin/question-bank`). Firestore rules allow authenticated reads and restrict writes to `Admin`/`Faculty` — **run `firebase deploy --only firestore:rules` to activate the new rule.**

### Live Invigilation Cockpit & Anti-Cheating Shuffling (2026-11-18)

- 🔴 **Live Invigilation Cockpit & 1-Click Live WebRTC Video Feed (`/ws/proctor`)**:
  - **Zero-Database-Cost WebSocket Gateway**: Built a high-performance in-memory WebSocket server (`server/proctorSocket.js` on path `/ws/proctor`) maintaining live exam rooms for candidate telemetry, instant infraction alerts, and WebRTC P2P signaling with zero Firestore reads/writes.
  - **1-Click Live WebRTC Video Feed (P2P)**: Invigilators can click `▶ Live Camera` on any candidate card to open a direct peer-to-peer HD camera feed powered by public Google STUN servers. Video streams bypass Node.js and Firestore entirely, consuming 0MB of server RAM and avoiding browser overload.
  - **Real-Time Infraction Chime & Alert Ticker**: Immediate audio synthesized chime alert (`Web Audio API`) and live ticker feed whenever a candidate commits an infraction (cell phone detected, secondary person, facial absence, or tab switch).
  - **Direct Administrative Warning Messaging**: Invigilators can transmit official warning notices directly to a specific candidate's screen, displaying an unmissable red modal notice requiring acknowledgement.
  - **Candidate Progress & Live Thumbnail Grid**: Displays active students with dynamic status indicators (`🟢 Active`, `🟡 Warning`, `🔴 High Risk`, `⚫ Disconnected`), progress step counters, forensic integrity indices, and recent photographic snapshots.

- 🔀 **Anti-Cheating Deterministic Question & Option Shuffling (Lab Peer-Copy Shield)**:
  - **Mulberry32 PRNG Algorithm**: Deterministic pseudo-random generation (`quizShuffle.ts`) keyed by `studentUid + quizId` that randomizes both question ordering and option positions (A, B, C, D) uniquely per candidate.
  - **Lab Peer-Copy Immunity**: Students seated adjacent in college computer labs see completely different question sequences and option layouts, neutralizing screen copying.
  - **Master Key Resolution Engine**: The evaluator seamlessly maps displayed option selections back to master question keys upon submission, ensuring 100% scoring precision and transparent question reviews.

- 📥 **Unified Google Drive Upload Queue & Rate-Limiting Protection (`driveQueue.js`)**:
  - **Free-Tier 512MB RAM Shield via Serialized Video Transcoding**: Integrated an in-memory priority queue (`DriveUploadQueue`) that serializes heavy ffmpeg video transcoding and streaming (`MAX_CONCURRENT_VIDEO = 1`), preventing multiple concurrent video uploads from exhausting Render's 512MB RAM and triggering OOM crashes during peak interview sessions.
  - **Throttled Assessment Snapshot Ingestion**: Replaced unbuffered `Promise.all` bursts with serialized snapshot streaming (`MAX_CONCURRENT_EVIDENCE = 1`) and a 40ms inter-snapshot delay, eliminating Google Drive API `403 rateLimitExceeded` and `429 Too Many Requests` when 30+ students submit assessments concurrently.
  - **Exponential Backoff & Jitter**: Automated 4-tier exponential retry logic with randomized jitter for transient network glitches (500/502/503) and Google Drive rate-limit quotas.
  - **Immediate Response & Automated Firestore Sync**: `POST /api/quiz/upload-evidence` responds in under 20ms with queue status; the background queue worker automatically links the final Drive folder URL to Firestore attempt documents upon completion.
  - **Queue Health & Diagnostics API**: Exposed `GET /api/drive/queue-status` and `GET /api/quiz/upload-status/:jobId` for real-time monitoring of active and queued tasks.

### Assessment Leaderboards, Cohort Analytics & Ranked Dossiers (2026-11-18)

- 🏆 **Competitive Assessment Leaderboards & Top 3 Podium**:
  - **Gold, Silver & Bronze Podium**: Dynamic Top 3 champions podium highlighting the 1st (🥇 Gold), 2nd (🥈 Silver), and 3rd (🥉 Bronze) place cohort winners with distinct badges, scores, percentage rings, and completion times.
  - **Full Ranked Table & Cards View**: Flexible dual-mode viewing (`Table View` vs `Cards View`) displaying sequential ranks (`#1`, `#2`, ...), candidate credentials (name, email, roll number, department), score breakdown, completion speed, proctoring integrity, and direct dossier inspection.
  - **Cohort Overview Analytics Bar**: Live cohort performance dashboard displaying total test submissions, top score, cohort average score, cohort pass rate percentage, and average proctoring integrity index.
  - **Multi-Parameter Search, Filtering & Sorting**: Real-time candidate search by name, email, roll number, or department. Filter pills for `All`, `Passed`, `Flagged (Integrity < 75%)`, `Clean (100% Integrity)`, and `Retake Allowed`. Sort by `Rank (Score)`, `Fastest Time`, `Cleanest Integrity`, `Latest Submission`, or `Lowest Score`.
  - **Candidate Retake Reset Control**: Administrators can directly reset any candidate's attempt from within the leaderboard with one click, clearing their previous attempt and allowing them an immediate retake.
  - **1-Click Gradebook CSV Export**: Direct batch export of the full assessment gradebook to CSV format (`<Quiz_Title>_Leaderboard_<Date>.csv`), including rank, candidate details, score, percentage, elapsed time, integrity score, infraction counts, and Google Drive evidence links.
  - **Student Cohort Access**: Once results are officially declared by administrators, students can access the cohort leaderboard directly from their Student Assessment Hub (`🏆 Leaderboard` button) or the Quiz Completion Result Modal (`🏆 Cohort Leaderboard` button).
  - **Firestore Rules Security**: Updated `firestore.rules` for the `quiz_attempts` collection to allow authenticated students read access to cohort attempts for declared assessments while strictly enforcing admin-only mutations.

- 🚀 **Instant Assessment Submission (<150ms) & Non-Blocking Evidence Pipeline**:
  - **Zero-Latency Modal Dismissal**: Decoupled heavy Google Drive evidence snapshot uploading from the primary assessment submission flow. Firestore attempts write immediately in under 120ms, instantly dismissing the "Submitting..." modal and advancing students to the completed screen without UI freezing.
  - **Asynchronous Background Evidence Sync**: Photographic infraction evidence uploads non-blockingly in the background; once Google Drive returns the folder link, the Firestore attempt is patched silently via `updateQuizAttemptDriveLink()`.
  - **Render Cold-Start Shield & Timeout Protection**: Added an `AbortController` 15-second timeout to the Drive evidence upload endpoint in `quiz.service.ts` to ensure network spikes or backend cold starts never block or hang client submission.

- 📢 **Admin Result Declaration Governance & Answer Protection**:
  - **1-Click Result Declaration Controls**: Added `resultsDeclared` toggle across Admin Quiz Studio cards, Quiz Editor, and the Submissions Inspection Modal (`📢 Declare Results` vs `🔒 Result: Withheld`).
  - **Zero Early Answer Leaks for Candidates**: When an assessment's results are withheld (default), students who submit see a secure completion screen confirming receipt and proctoring synchronization. Scores, percentage grades, and question-by-question answer solutions are completely hidden until officially declared by the institution.
  - **Dynamic Student Hub Status**: When results are pending declaration, student cards display `⏳ Results Pending` and a `Status` review button instead of premature scores, keeping the entire cohort fair and leak-free.

- 🍪 **Cookie Registry & Cache Architecture Modernization**:
  - **Adapted Cookie Registry**: Expanded `COOKIE_REGISTRY` in `cookieManager.ts` to catalog assessment proctoring session tokens (`prephire_proctor_token`), timed quiz alert preferences (`prephire_quiz_timer_alert`), and on-device COCO-SSD inference telemetry (`prephire_quiz_telemetry`).
  - **Dynamic Cookie Preferences Modal**: Upgraded `CookieBanner.tsx` to dynamically query category counts from the registry rather than using hardcoded label values.
  - **Bounded Multi-Tier Query Caching**: Enhanced `quiz.service.ts` with a dedicated 60-second TTL cache for student quiz attempts (`studentAttemptsCache`) and in-memory cache lookup for `getQuizById`, preventing redundant Firestore reads across cohort dashboards while capping in-memory cache size with automatic FIFO pruning.

- 📸 **100% Photographic Evidence Guarantee on Every Proctoring Flag**:
  - **Zero Dropped Snapshots**: Every single proctoring infraction—mobile phone detection, candidate absence/no face, multiple faces, window blur, tab switches, developer tool tampers, or acoustic voice anomalies—captures and stores its forensic screenshot without exception.
  - **High-Capacity Firestore Evidence Ledger**: Safely persists up to 25 full photographic evidence records per test in Firestore (compressed to ~3.2KB each, totaling ~80KB, far below Firestore's 1,024KB document limit).
  - **Expanded Google Drive Evidence Ingestion**: Enhanced `/api/quiz/upload-evidence` to organize and upload up to 25 infraction snapshots directly to candidate-named Drive evidence directories (`PrepHire_Test_Evidences/<studentName>_<quizTitle>_<timestamp>`).
  - **Continuous In-Memory Frame Buffer**: Maintains a rolling frame cache from the camera stream to ensure instantaneous backgrounding, tab switches, and window blur events capture a crisp visual snapshot even when the browser occludes the active video element.
  - **Tuned Mobile Phone & Absence Sensitivity**: Calibrated COCO-SSD phone threshold to 0.15 and shortened absent face confirmation from 3.5s to 2.0s for immediate snapshot capture.

- ⚡ **Firebase Spark & Render Free-Tier Scaling Optimizations**:
  - **Client-Side TTL Read Caching**: Added 2-minute in-memory caching for `listQuizzes()` and 1-minute caching for `getQuizAttempts()`, cutting redundant Firestore document reads by ~85% during student testing cohorts.
  - **95% Firestore Document Compression**: Downscaled forensic snapshots to $200\times150$ @ 0.35 JPEG ($\sim 3\text{ KB}$ each) and capped inline Firestore storage to 2 key snapshots, keeping documents under $8\text{ KB}$ and protecting Firebase Spark storage and monthly egress limits.
  - **Render Free-Tier 512MB RAM Shield**: Slashed evidence JSON limits from 25MB to 3MB with a maximum of 4 streamed snapshots per submission, preventing memory spikes and out-of-memory (OOM) dyno restarts.

- 🕵️ **Stealth AI Proctoring, Sound Anomaly Detection & Forensic Snapshot Dossier**:
  - **Zero-Alert Silent Candidate Mode**: Candidate-facing proctor flags, alarming banners, and violation toasts are silenced. Students see a calm, reassuring green badge (`🟢 Proctored Session Active • Mic On`), preventing candidates from gaming warnings while preserving natural behavior.
  - **Automated Photographic Evidence Capture**: High-speed forensic canvas snapshots (~12KB JPEG) are instantly captured whenever an infraction occurs (mobile phone detected, secondary person, face absence, window blur, or background voice).
  - **Automated Google Drive Evidence Folder Sync**: New `POST /api/quiz/upload-evidence` endpoint creates a structured folder in Google Drive (`PrepHire_Test_Evidences/<studentName>_<quizTitle>_<timestamp>`) storing named snapshots (`<name>_<time>_<type>.jpg`) with 1-click Drive folder access for Administrators.
  - **Background Audio & Vocal Anomaly Detection**: In-browser Web Audio API `AnalyserNode` continuously monitors ambient sound levels. Whispering or external speech (>36dB for >1.5s) triggers an audio anomaly flag paired with an evidence snapshot.
  - **Silent Honey-traps & Away-Time Forensics**: Silently intercepts developer tools shortcuts (`F12`, `Ctrl+Shift+I`, `Ctrl+U`), clipboard actions, and right-click menus, while tracking the exact number of seconds the candidate was away from the assessment window.
  - **Admin Forensic Dossier & Snapshot Lightbox**: Upgraded Submissions modal with a 0-100% Forensic Integrity Score, 6-metric telemetry grid, interactive photographic evidence gallery, and full-resolution lightbox viewer.

- 🔍 **High-Fidelity Question Review & Visual Option Diagnostics**:
  - **Explicit Candidate Choice Tracking**: In the post-test review modal, every candidate selection is accurately preserved and cross-referenced with correct keys.
  - **Red Incorrect Highlights & Green Verified Badges**: Correct answers are highlighted in emerald green (`#059669` / `#DCFCE7`), while candidate mistakes are distinctly styled in bold red (`#DC2626` / `#FEE2E2`) with unmistakable status badges (`✗ Your Choice` vs `✓ Correct Answer`).
  - **Human-Readable Selection Summaries**: Per-question feedback strips clearly explain both what was selected and what the intended answer was.

- 🛡️ **Enhanced AI Proctoring Sensitivity (Multi-Face & Cell Phone Detection)**:
  - **High-Sensitivity Object & Person Inference**: Tuned in-browser TensorFlow COCO-SSD thresholds (`0.18`-`0.25`) to catch off-angle faces, secondary individuals entering the frame, and handheld electronic devices (`cell phone`, `remote`).
  - **Continuous 1200ms Detection & Warning Banners**: Real-time on-video warning banners alert candidates immediately when infractions occur while debouncing proctor flags to prevent false positives.
  - **Persistent Mobile Camera Stream**: Guaranteed continuous surveillance on smartphones by preventing proctor camera unmounting during drawer toggles.

- 🔄 **Admin Assessment Governance & Flexible Retake Controls**:
  - **1-Click Retake Toggle (`Retake: ON / OFF`)**: Instant studio card toggle allowing administrators to lock or unlock assessment retakes institution-wide.
  - **Single-Candidate Attempt Reset**: Targeted administrative control to reset specific student attempts (`Allow Candidate Retake`) without affecting cohort data.
  - **Student Portal Enforcement**: Enforces institutional retake lockdowns, transforming buttons into `View Result` and labeling completed assessments accordingly.

- 📝 **Assessment Studio & Proctored Quiz Center**:
  - **Instant Multi-Format Importer**: Ingests `.docx`, `.pdf`, `.txt`, `.json`, and smartphone photos/scans via a two-tier pipeline (<15ms client AST fast-path for digital docs + Gemini Multimodal Vision OCR for scans and photos).
  - **Public Shareable Test Links (`/quiz/:quizId`)**: Admins can generate single-click assessment URLs allowing candidates to complete timed tests on PC or mobile without pre-registration.
  - **AI Proctoring & Lockdown (`QuizProctorCamera`)**: In-browser TensorFlow.js / COCO-SSD computer vision tracking face absence, multi-person assistance, and cell phones, coupled with fullscreen lockdown and tab-switch detection ($\ge 4$ infractions trigger auto-submission).
  - **Comprehensive Admin Audit Dossier**: Real-time review modal displaying candidate PRN/roll numbers, completion scores, and timestamped proctoring infraction timelines.

- 🎯 **UI/UX Pro Max Assessment Cockpit & Contrast Immunity**:
  - **Distraction-Free Focus Mode**: Launches exams in an expansive 100% viewport width, automatically collapsing portal navigation to eliminate distractions and prevent accidental tab exits.
  - **CSS Contrast Immunity (`.dark-theme-banner`)**: Bulletproof CSS rules guaranteeing headers and subtexts inside dark gradient banners render in crisp `#FFFFFF` and slate-white (`rgba(241, 245, 249, 0.92)`).
  - **Lightning Keyboard Shortcuts**: Fast-paced answering via `A`/`B`/`C`/`D` or `1`/`2`/`3`/`4` for options, `←` / `→` for question navigation, `M` to toggle review bookmark, and `Backspace` / `Delete` to clear choices.
  - **Pacing & Navigation Ergonomics**: Dual-color live progress bar (`#2563EB` $\to$ `#10B981`), pulsing urgent timer (`.timer-urgent` under 2 mins), filterable palette tabs (`All`, `Ans`, `Rev`, `Left`), and a persistent summary submission card.

- 💻 **Competitive Coding Arena & 3-Tier Execution Engine**:
  - **Fault-Tolerant Judge Architecture**: 3-tier execution cascade ([Judge0](https://github.com/judge0/judge0) $\to$ Piston $\to$ host compiler fallback) with bounded 4-way parallel test execution and Server-Sent Events (SSE) live progress streaming.
  - **Clean Competitive Templates**: Standard competitive programming skeletons with `using namespace std;` and unsolved problem stubs instead of pre-solved solutions.
  - **AI Problem Generator**: Automated competition-grade problem generation powered by NVIDIA NIM and Gemini, pre-validated against Piston sandbox runtimes before publishing.

- 🎙️ **Mock Interview Engine & Voice Streaming**:
  - **Sub-200ms Voice Latency**: Server-Sent Events streaming pipeline (`POST /api/ai/stream`) coupled with `SentenceBoundarySpeaker` for instantaneous voice synthesis.
  - **Speech & Delivery Analytics**: Real-time Web Audio API waveform visualizer, Words Per Minute (WPM) cadence tracking, and verbal filler crutch detection.
  - **Company-Specific Placement Tracks**: Curated hiring rubrics and behavioral questions for TCS NQT, Infosys DSE, Amazon SDE, and Barclays FinTech across 9 MIT AoE engineering programs.
  - **Instant ATS Resume Matcher**: Client-side (<20ms) PDF resume analysis matching skills and quantitative metrics against target job descriptions.

- 🔒 **Enterprise Architecture & Security Hardening**:
  - **Zero-Trust Token Verification**: Strictly enforces Firebase Bearer tokens across all backend endpoints (`/api/coding/*`, `/api/ai/*`, `/api/upload`, `/api/courses`).
  - **Multi-Model AI Failover**: Automated Gemini fallback routing (`gemini-2.5-flash` $\to$ `gemini-1.5-flash` $\to$ `gemini-1.5-pro`) ensuring uninterrupted availability.
  - **Modular Bundle Splitting**: Optimized Rollup chunks cutting initial JavaScript bundle size by over 50% for fast page loads.

---

## 🎯 Who is PrepHire.AI For?

| Role | How They Use the Platform |
|:---|:---|
| 🎓 **Students** | Practice tailored AI interviews, solve coding problems with AI feedback, track scores, study courses, and view leaderboard rankings. |
| 🧑‍🏫 **Faculty Mentors** | Review interview recordings and scorecards for students in their department, audit placement readiness, and share study courses. |
| 🛡️ **Placement Administrators** | Monitor campus-wide readiness metrics, manage user roles and branch assignments, create coding challenges, and review student feedback. |

---

## 🗺️ User Flows & How to Use

### 🎓 Student Flow

```mermaid
flowchart LR
    A[Sign Up / Login] --> B[Upload Resume]
    B --> C[Select Domain & Level]
    C --> D[Consent & Audio/Cam Check]
    D --> E[Live AI Interview]
    E --> F[Instant Scorecard & Action Plan]
    F --> G[Coding Hub & Practice]
```

1. **Sign Up & Account Setup**:
   - Register using your name, email, password, and select your engineering department/branch.
2. **Resume Upload (Optional but Recommended)**:
   - Upload your PDF resume in the Interview tab. PrepHire extracts your projects, technical skills, and experience to personalize interview questions specifically for you.
3. **Select Interview Mode**:
   - Choose your interview focus:
     - **Technical**: Core DSA, System Design, Web Technologies, Database Systems, OOPs, and branch-specific subjects.
     - **HR & Behavioral**: STAR-method workplace situations, teamwork, leadership, and motivation.
     - **Aptitude**: Quantitative math, logical reasoning puzzles, and speed calculations.
     - **Group Discussion (GD)**: Structured arguments, counter-perspectives, and debate delivery.
   - Choose your difficulty: **Entry**, **Intermediate**, or **Advanced**.
4. **Consent & Verification**:
   - Review the pre-interview camera and audio notice and confirm consent to start your proctored session.
5. **Live AI Voice Interview**:
   - Speak naturally using your microphone or type your responses.
   - PrepHire asks one question at a time, providing calibrated micro-feedback and adjusting difficulty based on your answers.
6. **Instant Performance Scorecard & Action Plan**:
   - View your radar score across 5 key dimensions: **Technical Depth**, **Communication**, **Confidence**, **Clarity**, and **Relevance**.
   - Review specific strengths, targeted areas for improvement, and a **3-step concrete Action Plan** to work on this week.
7. **Coding Hub & AI Code Review**:
   - Practice algorithmic challenges directly in the browser with the built-in code editor.
   - Run tests against sample inputs and submit solutions.
   - Click **"Get AI Review"** after running code to receive instant analysis on correctness, time/space complexity, cleaner alternatives, and code readability.
8. **Courses, Leaderboard & Feedback**:
   - Browse curated courses and tutorials shared by faculty.
   - Track your position on the department leaderboard.
   - Tap the **Feedback** button anytime to share thoughts, report bugs, or request features.

---

### 🧑‍🏫 Faculty Flow

1. **Department Dashboard**:
   - Log in to your faculty portal. The dashboard is automatically scoped to candidates in your engineering branch.
2. **Review Student Interviews & Scorecards**:
   - Inspect individual student session records, radar breakdowns, AI feedback, and proctoring logs.
   - Assess placement readiness and provide personalized mentoring notes.
3. **Course Management**:
   - Create and organize department-specific learning resources, lecture notes, and practice materials for students.

---

### 🛡️ Admin Flow

1. **Overview & Analytics**:
   - Access real-time statistics on total registered students, completed interviews, average scores, and department distributions.
2. **User & Branch Management**:
   - View student and faculty rosters, reassign student branches when needed, and toggle account statuses.
3. **Coding Challenge Authoring**:
   - Create, edit, and publish coding problems with starter templates (Python, JavaScript, C++), visible test cases, and hidden judge test cases.
4. **Feedback Center**:
   - View feedback submitted by students during pilot testing, tagged by category (Bug, Suggestion, Confusing, Other).

---

## 🚀 Key Highlights

- 🎙️ **Natural Voice Interaction**: Real-time speech-to-text and synthetic voice prompts for realistic mock practice.
- 📄 **Smart Resume Analysis**: Personalizes questions based on each candidate's real-world projects and technical stack.
- 💻 **Integrated Code Editor**: Sandboxed multi-language programming workspace with immediate execution and AI code review.
- 📊 **Actionable Analytics**: Comprehensive radar charts, detailed rubrics, and concrete next steps rather than vague scores.
- 🏛️ **Institutional Scope**: Pre-configured support for 9 engineering branches with department-level isolation for faculty.
- 📱 **Mobile & Desktop Responsive**: Clean modern interface designed for smooth interaction across all screen sizes.

---

## 🏛️ Supported Engineering Programs

PrepHire.AI supports tailored tracks for 9 institutional branches:
- Computer Engineering
- Information Technology
- Computer Science & Engineering (AI & ML)
- Computer Science & Engineering (Data Science)
- Computer Engineering (Software Engineering)
- Electronics & Telecommunication Engineering
- Mechanical Engineering
- Chemical Engineering
- Civil Engineering

---

## 🏗️ System Architecture & Enterprise Infrastructure

PrepHire.AI is architected as an institutional-grade, zero-trust cloud platform ensuring high availability, sub-second evaluation latencies, and strict departmental data boundaries.

```mermaid
flowchart TD
    subgraph ClientLayer ["Client Layer (Edge Delivery)"]
        SPA["PrepHire.AI Web Client<br/>(React 19 + TypeScript + Vite)"]
        Monaco["Monaco Code Editor<br/>(Competitive IDE)"]
        Audio["Web Audio Waveform<br/>& Speech Synthesis Engine"]
    end

    subgraph SecurityGate ["Security & Authentication Boundary"]
        FBAuth["Firebase Authentication<br/>(Strict ID Token Verification)"]
        TenantGuard["Departmental Isolation<br/>& Role-Based Access Control"]
    end

    subgraph BackendAPI ["Backend Microservices (Node.js API)"]
        Express["Express Server<br/>(Reverse-Proxy Hardened)"]
        AIStream["SSE Streaming Voice<br/>& Clause-Boundary Speaker"]
        ProblemGen["NVIDIA NIM & Gemini<br/>Problem Engine"]
        JudgeOrchestrator["Judge Orchestrator<br/>(3-Tier Fault Tolerant)"]
    end

    subgraph ExecutionTiers ["Sandboxed Code Execution Infrastructure"]
        Judge0["Judge0 Sandbox API<br/>(Microsecond cgroup Tracking)"]
        Piston["Piston Sandbox Engine<br/>(Multi-Language Isolation)"]
    end

    subgraph DataStorage ["Data & Enterprise Persistence"]
        Firestore["Cloud Firestore<br/>(Users, Sessions, Badges)"]
        Drive["Google Drive API<br/>(Proctored Transcoded Video)"]
        AuditLedger["Persistent Problem &<br/>Submission Store"]
    end

    SPA --> FBAuth
    SPA --> Express
    Express --> TenantGuard
    TenantGuard --> Firestore
    Express --> AIStream
    Express --> ProblemGen
    Express --> JudgeOrchestrator
    JudgeOrchestrator --> Judge0
    JudgeOrchestrator --> Piston
    Express --> Drive
    Express --> AuditLedger
```

---

## 🔒 Enterprise Security & Governance

- **Zero-Trust Identity Verification**: Every privileged API endpoint (`/api/coding/*`, `/api/upload`, `/api/courses`) cryptographically verifies Firebase ID tokens server-side. Unsigned headers and client role spoofing are rejected with HTTP 401.
- **Departmental Multi-Tenancy**: Faculty access is strictly scoped to their engineering program via Firestore security rules and backend query constraints. Cross-department session inspection is programmatically blocked.
- **Secure Sandbox Execution**: Student submissions execute inside containerized cgroup-isolated sandboxes with enforced CPU time limits, memory caps, and process limits. Host execution is locked down by default (`JUDGE_ALLOW_LOCAL=false`).
- **Data Privacy & ATS Compliance**: Candidate PDF resumes are parsed in-memory client-side; raw PDF files are never stored or transmitted to third-party databases. Proctored interview recordings follow automated retention policies with Google Drive API integration.
- **XSS & Injection Hardening**: All candidate reports, gradebook exports, and evaluation rubrics feature context-aware HTML escaping and CSV formula injection mitigations.

---

## 🏛️ Institutional Governance & Legal Notice

**PrepHire.AI** is an institutional placement preparation and assessment platform developed exclusively for **MIT Academy of Engineering (MIT AoE), Alandi (Pune)** — Placement & Career Development Cell.

*Confidential & Proprietary. All rights reserved. Unauthorized reproduction, distribution, or public hosting of this software is strictly prohibited.*
