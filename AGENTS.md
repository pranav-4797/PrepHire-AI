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

## Gotchas

- `.env.local` contains live Firebase + Gemini keys — do not commit
- Service account JSON (`server/service-account.json`) is gitignored — server falls back to mock mode without it
- `App.tsx` is ~5500 lines — edits need careful oldString matching; prefer multi-line context in oldString
- pdfjs-dist worker: `src/utils/resume.ts` imports `pdf.worker.min.mjs?url` and sets `GlobalWorkerOptions.workerSrc` — Vite handles it; don't switch to CDN worker URLs
- No test files exist in the repo; no test runner configured
- The Courses feature trusts `x-user-email` / `x-user-role` headers (legacy); the Coding platform uses server-verified Firebase tokens — do not copy the legacy pattern to new features
- Piston API URL defaults to public demo instance — self-host for production traffic
- SPA rewrites: `firebase.json` routes `**` to `/index.html` to support deep URL paths without 404s on refresh.
