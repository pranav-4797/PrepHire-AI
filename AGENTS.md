# PrepHire.AI — Agent Instructions

## Dev commands

```bash
npm run dev        # concurrently starts Vite (client) + server (Express on :3001)
npm run build      # tsc -b && vite build
npm run lint       # eslint .
```

Server has its own `server/package.json`. Run `cd server && npm install` separately.

## Architecture

- **Frontend**: Vite + React 19 + TypeScript, `src/App.tsx` (~5200 lines, single monolithic file with all views/screens)
- **Backend**: Express in `server/index.js` (Drive upload, courses CRUD, mounts coding routes)
- **Auth**: Firebase Auth + Firestore; context in `src/context/auth-context-state.ts` (not `AuthContext.tsx` — `src/hooks/useAuth.ts` imports from `../context/auth-context-state`)
- **Theme**: Design tokens in `src/theme.ts` — import `T` instead of hardcoding colors
- **Coding platform**: Monaco editor (`@monaco-editor/react`) + Piston (sandboxed code execution); API under `/api/coding`
- **Persistence**: Firestore for users/sessions; JSON files on disk for courses (`server/uploads/courses.json`) and coding problems/submissions (`server/uploads/coding_problems.json`, `server/uploads/coding_submissions.json`)
- **Video upload**: Multer → ffmpeg transcoding → Google Drive API (mock mode if no service account)
- **Resume feature**: PDF parsed client-side with `pdfjs-dist` → Gemini extracts a structured `ResumeProfile` JSON → stored ONLY in Firestore `users/{uid}.resumeProfile` (+ optional `resumeNotes`). Raw PDF never uploaded/persisted.

## Key files

| File | Purpose |
|---|---|
| `src/App.tsx` | All UI: landing, auth, student/faculty/admin dashboards, interview, report, coding hub, course mgmt |
| `server/index.js` | Express server: Drive upload, courses CRUD, mounts coding routes |
| `server/coding/judge.js` | Piston sandboxed execution client |
| `server/coding/routes.js` | Coding REST API (problems CRUD, run/submit, dashboard) |
| `server/coding/authMiddleware.js` | Firebase ID token verification (not client-supplied headers) |
| `src/services/firestore.service.ts` | Firestore CRUD for users, sessions, courses |
| `src/services/coding.service.ts` | Coding API client + local autosave (localStorage) |
| `src/utils/ranking.ts` | Leaderboard ranking algorithm |
| `src/utils/resume.ts` | Resume PDF text extraction (pdfjs-dist), Gemini profile analysis, `buildResumeContext` prompt builder |

## Conventions

- **Styles**: All inline `style={}` objects. No CSS modules or Tailwind. Use tokens from `src/theme.ts` (`T.primary`, `T.gold`, etc.)
- **Components**: Reusable UI primitives (`Btn`, `GlassCard`, `SolidCard`, `Pill`, `ScoreRing`, `RadarChart`) defined in `App.tsx`
- **State**: All in `App.tsx` via `useState`/`useCallback`. No global state store.
- **Role model**: `UserRole` type = `'Admin' | 'Faculty' | 'Student'` — used for rendering different dashboards
- **Env vars**: All prefixed `VITE_` for Vite client; `server/.env` for backend (port, Drive folder, Piston URL)
- **Sound**: SpeechSynthesis for AI voice responses; `MicButton` component for speech-to-text
- **Proctoring**: Simulated face detection + tab-switch blur listener in `ProctoredCamera`
- **Documentation**: Whenever new features or improvements are added, always update `README.md` by adding a summary paragraph and bullets under the `## 🆕 What's New in the Latest Release` section.

## Recent fixes (2026-07-12)

- **Empty interview → score 0**: If the interview ends before any Q&A, `generateReport` returns all scores at 0 with `"The interview was ended before any questions could be answered"` — no AI call is made
- **Partial interview → early termination note**: Ending mid-session (1–4 questions answered) appends `"Interview ended early after X of 5 questions"` to the proctoring note
- **End Interview confirmation modal**: Clicking "End Interview" shows a modal with context-aware warning (0 / partial / all questions) and confirm/cancel buttons
- **Skip video upload on empty session**: No Drive upload attempted when zero questions were answered

## Recent fixes (2026-08-18)

- **Branch-specific institutional governance**: 9 MIT AoE engineering programs supported via `src/constants/branches.ts`. Students select branch during registration; Faculty view is scoped to students from their department (`branchSessions`); Admins have full access with branch filter and real-time branch reassignment.
- **Student Profile security**: Department is read-only on the student profile; `firestore.rules` strictly prevents self-modification of `department`, `role`, and `disabled` fields.
- **Cascading session cleanup**: Deleting a user in Admin Console automatically deletes all associated session records from Firestore (`sessions` collection) to free storage space.
- **Authentication UX & Password Visibility Toggle**: Added `Eye`/`EyeOff` toggle button to password input, Enter-key form submission wrapper, autocomplete attributes, and client-side password length validation.
- **Deep Subpage Routing & Browser Back/Forward History**: Two-way synchronization between React state and browser History API (`pushState` / `popstate`). Clicking the browser Back button or mouse back key navigates to the previous subpage/tab (`/dashboard/interview`, `/dashboard/coding`, `/dashboard/profile`, `/admin/users`, `/faculty/assessments`, etc.) without exiting the website. Direct linking/refreshing to subpaths restored on initial mount.
- **Zero build/lint errors**: Fixed all pre-existing TypeScript and ESLint errors. `npm run build` (`tsc -b && vite build`) and `npm run lint` pass cleanly with 0 errors.

## Recent fixes (2026-10-16)

- **Security & persistence hardening**: Secured `POST /api/upload` and `GET /api/courses` with Firebase token auth middleware (`requireAuth`). Upgraded backend storage (`server/coding/store.js` and `server/index.js`) to hybrid Firestore with local file fallback.
- **Audio visualizer & speech analytics**: Integrated real-time Web Audio API waveform visualizer (`AudioVisualizer.tsx`) and speech delivery metrics (`speechAnalytics.ts`) tracking Words Per Minute (WPM), pacing diagnosis, and filler crutch words.
- **Export capabilities**: Added print/PDF generation for candidate interview evaluation reports and batch CSV placement gradebook export for faculty.
- **Monaco coding custom testcases**: Added custom input (stdin) runner to `ProblemWorkspace.tsx` and coding backend execution route.
- **Cookie governance system**: Multi-category cookie registry (`cookieManager.ts`) with granular preferences modal, unobtrusive landing page footer link, and student profile settings trigger.
- **Autonomous offline interview engine & question library**: Multi-branch curated question repository (`questionBank.ts`) spanning all 9 engineering programs, circuit breaker with 8s timeout (`interviewEngine.ts`), deterministic STAR/keyword heuristic evaluator (`offlineEvaluator.ts`), and real-time engine mode indicator.
- **Low-latency SSE streaming voice synthesis**: Server-Sent Events endpoint (`POST /api/ai/stream` in `server/gemini.js` & `server/index.js`) paired with `SentenceBoundarySpeaker` (`streamingVoice.ts`) streaming clauses directly to `speechSynthesis`, slashing initial voice latency from ~3500ms down to ~200ms.
- **Modular Vite bundle chunking**: Optimized Rollup vendor chunks in `vite.config.ts` (`vendor-react`, `vendor-firebase`, `vendor-monaco`, `vendor-tensorflow`, `vendor-icons`), cutting main chunk size from 1,524 kB to 741 kB with clean 597ms builds.
- **Company-specific placement tracks**: Curated TCS NQT, Infosys DSE, Amazon SDE, and Barclays FinTech hiring tracks (`companyTracks.ts`) with track selector UI in `App.tsx` and tailored system prompt injection.
- **Client-side ATS resume analyzer & JD gap matrix**: In-browser keyword, metric, and format gap parser (`atsAnalyzer.ts` & `AtsScannerModal.tsx`) providing candidates with match percentages, missing competencies, and real-time guidance before campus interviews.
- **NVIDIA NIM AI coding problem generator & Piston sandbox pre-validation**: Added `POST /api/coding/generate-problem` powered by NVIDIA NIM (`qwen/qwen2.5-coder-32b-instruct` / `nvidia/llama-3.1-nemotron-70b-instruct` in `server/nvidia.js`), featuring automated Piston execution of the generated reference solution against all generated test cases to prevent hallucinations, and a one-click generation modal in `AdminProblemEditor.tsx`.

## Recent fixes (2026-10-25)

- **Codeforces/CodeChef-grade judge architecture**: Re-engineered `server/coding/judge.js` with 7 verdict types (AC, WA, TLE, **MLE**, **ILE**, RE, CE), per-test-case resource tracking (`timeMs` + `memoryKb`), improved TLE/MLE detection from Piston signals, and a streaming judge engine (`runTestCasesStreaming()`) for SSE progress.
- **SSE streaming submit endpoint**: New `POST /api/coding/problems/:id/submit-stream` returns Server-Sent Events with per-test verdicts as they complete (Codeforces-style "Running on test X").
- **Live judge progress UI**: `JudgeProgressBar` component in `ProblemWorkspace.tsx` shows animated test-by-test progress dots with pass/fail indicators during submission.
- **Keyboard shortcuts**: `Ctrl+Enter` = Run, `Ctrl+Shift+Enter` = Submit, with visible kbd badges on action buttons.
- **Code reset button**: One-click reset to starter template with confirmation dialog.
- **Copy-to-clipboard**: All sample test I/O blocks and failed test results have copy buttons.
- **Enhanced submission table**: Columnar layout (When · Language · Verdict · Time · Memory · Tests) with relative timestamps and hover highlights.
- **Results summary bar**: Aggregate stats (X/Y passed · Peak time · Peak memory) above per-test breakdown.
- **Custom error architecture & stack obfuscation**: Centralized `errorSanitizer.ts` translates raw Firebase, Piston, Gemini, Express, and Firestore error dumps into human-friendly explanations without leaking backend tech stacks.
- **Accessible ErrorAlert & Form feedback**: `ErrorAlert.tsx` with `role="alert"`, `aria-live="polite"`, WCAG-calibrated red accents, and optional dismiss/retry handlers.
- **Full-screen ErrorBoundary crash recovery**: React `ErrorBoundary.tsx` catches runtime rendering exceptions with Reload/Home recovery actions and zero technical stack leakage.
- **Custom 404 NotFoundPage**: Route fallback in `App.tsx` (`parsePathname` / `NotFoundPage.tsx`) providing clean recovery to dashboard and hubs.
- **Clean competitive templates & standard C++ namespace**: Built `codeSanitizer.ts` to mandate `using namespace std;` whenever `<iostream>` is imported in C++, stripping verbose `std::cin`, `std::cout`, `std::endl`, and `std::vector` prefixes. Replaced pre-solved solutions in `starterCode` with clean unsolved skeletons across all 10 seed problems and updated `server/nvidia.js` prompt. Added dual-mode Reset ("Clean Scratch Template" vs "Problem Stub") and 1-click Scratch action in `ProblemWorkspace.tsx`.

## Gotchas

- `.env.local` contains live Firebase + Gemini keys — do not commit
- Service account JSON (`server/service-account.json`) is gitignored — server falls back to mock mode without it
- `App.tsx` is ~5500 lines — edits need careful oldString matching; prefer multi-line context in oldString
- pdfjs-dist worker: `src/utils/resume.ts` imports `pdf.worker.min.mjs?url` and sets `GlobalWorkerOptions.workerSrc` — Vite handles it; don't switch to CDN worker URLs
- No test files exist in the repo; no test runner configured
- The Courses feature trusts `x-user-email` / `x-user-role` headers (legacy); the Coding platform uses server-verified Firebase tokens — do not copy the legacy pattern to new features
- Piston API URL defaults to public demo instance — self-host for production traffic
- SPA rewrites: `firebase.json` routes `**` to `/index.html` to support deep URL paths without 404s on refresh.
