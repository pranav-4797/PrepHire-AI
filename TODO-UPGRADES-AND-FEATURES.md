# PrepHire-AI — Pending Work (captured 2026-07-02)

## PART A — Upgrades already written & type-checked (0 tsc errors), NOT yet shipped
Blocked in the build sandbox (FUSE forbids git writes; proxy blocks GitHub/Firebase/npm binary).
Apply on a normal machine, then commit → push (auto-deploys server on Render) → `firebase deploy --only hosting`.

- [ ] server/package.json: `"multer": "^2.0.0"` (was ^1.4.5-lts.2). Verified compatible with current
      `dest` / `limits` / `fileFilter(_req,file,cb)` / `upload.single('video')` / `multer.MulterError` usage.
- [ ] server/package.json + package.json: add `"engines": { "node": ">=20" }`.
- [ ] tsconfig.app.json: `"strict": true` (remove `strict:false` and `noImplicitAny:false`).
- [ ] src/App.tsx:889: `rec.onresult = (e: SpeechRecognitionEvent) => ...` (type-only fix strict requires).
- [ ] Remove duplicate lockfiles: `git rm pnpm-lock.yaml server/package-lock.json` (keep package-lock.json).

Commands:
    npm install && ( cd server && npm install )
    npm run build          # verify dist/ builds
    git add -A && git commit -m "chore: upgrade multer 2.x, enable TS strict, node engines"
    git push origin main   # Render auto-deploys the server
    firebase deploy --only hosting

## PART B — Planned features (do later), in priority order
1. [SECURITY, do first] Move Gemini key server-side.
   VITE_GEMINI_API_KEY is currently in the public client bundle (anyone can steal it & bill you).
   - server/index.js: add `POST /api/interview` that reads server-side `GEMINI_API_KEY`, forwards to
     generativelanguage.googleapis.com (model gemini-3.1-flash-lite-preview).
   - src/App.tsx: change callClaude() to POST /api/interview (Vite /api proxy already routes in dev).
   - render.yaml: add `GEMINI_API_KEY` (sync: false). Drop VITE_GEMINI_API_KEY from client env.
2. Résumé-tailored questions: student uploads PDF résumé → server extracts text → Gemini generates
   personalized questions instead of the static DOMAINS list. Builds on the new /api/interview route.
3. Progress-over-time chart on student dashboard (reuse existing HistoryEntry: score/date/domain).

## PART C — Feature backlog (nice-to-have)
- Export report as PDF (ReportData is already structured).
- Faculty comments / manual score override on a student report.
- Resume/retry an interrupted interview (persist partial state on camera/mic error).
- Recorded-video review with timestamped feedback (video already uploaded to Google Drive).
- Coding challenge mode for Technical domain (Monaco + Judge0). ✅ IMPLEMENTED (2026-07-12) as a
  standalone "Coding Platform" feature — see server/coding/ (routes.js, judge.js, store.js) and
  src/components/coding/ (CodingHub, ProblemWorkspace, AdminProblemsManager). Uses Monaco via
  @monaco-editor/react and Piston (github.com/engineer-man/piston) as the sandboxed execution
  service instead of Judge0 — swap PISTON_API_URL in server/.env to self-host if needed.
- Assigned interviews + deadlines for cohorts (mirrors course/approval workflow).
- Anti-cheat: tab-switch/blur detection + face-presence/multi-face (mediapipe / face-api.js) -> proctoringNote.
- Multi-language interviews (SpeechRecognition is hardcoded to en-IN).
- Email notifications (approved / report ready / interview assigned).
- Faculty-editable question bank (DOMAINS is hardcoded in App.tsx).
