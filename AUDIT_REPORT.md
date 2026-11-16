# PrepHire-AI — Code Audit & Fix Report

Scope: full server (`server/**`), Firestore rules, and the client services/utils/context/coding UI.
Method: read the code, then **proved** the serious findings with PoCs against the real code before fixing.
`tsc`, ESLint (0 errors), `vite build`, the existing judge suite, and a new security suite (`npm --prefix server run test:sandbox`) all pass.

## Critical (proven exploitable)

| # | Issue | Where | Fix |
|---|-------|-------|-----|
| 1 | **Sandbox bypass.** In the default `auto` mode the *host* toolchain was preferred whenever installed. `node` always exists, so every JavaScript submission ran inside the API server with its full environment. A student could print `GEMINI_API_KEY` / service-account data back to the UI. | `judge.js`, `adapters/local.js` | Host execution is now **opt-in only** (`JUDGE_ALLOW_LOCAL=true`), never preferred over Judge0/Piston, and never a silent fallback. When enabled it is hardened: scrubbed env, private 0700 temp dir, process-group SIGKILL, output caps, ulimits, Node permission model. |
| 2 | **Auth bypass via forged JWT.** If `verifyIdToken` *rejected* a token, a "dev fallback" base64-decoded the payload **without checking the signature** and used that uid's role. | `authMiddleware.js` | Rejected token = 401. Dev trust only with `ALLOW_INSECURE_DEV_AUTH=true` and never in production. |
| 3 | **Fail-open roles.** Firestore down/unconfigured ⇒ everyone became *Faculty*. | `authMiddleware.js` | Fails closed to *Student*. |
| 4 | **Stored XSS → privilege escalation.** Student names, AI text and faculty remarks were interpolated unescaped into a same-origin `window.open('')` report. | `utils/reportExport.ts` | All values escaped; CSV formula-injection neutralised. |
| 5 | **Server crash (DoS).** A program that exits without reading stdin caused an unhandled `EPIPE` that killed the whole API process. | `adapters/local.js` | stdin now comes from a file descriptor; no pipe, no EPIPE. |
| 6 | **Hidden-test leak.** `stderr` was returned for hidden tests, so `print(input(), file=stderr)` revealed every hidden input. | `judge.js` (3 copies) | `buildTestResult()` never returns stdout/stderr for hidden tests. |
| 7 | **IDOR on uploads.** Any user could overwrite another student's `driveLink`/`driveFileId` by passing their `sessionId` (Admin SDK bypasses rules). | `index.js` `/api/upload` | Session must exist and be owned by the caller; id format validated. |
| 8 | **Course approval bypass.** Faculty could POST/PUT `status:"approved"`, `id`, `createdByEmail` directly. | `index.js` courses | Field whitelist; only Admin can set status; Faculty edits return to *pending*. |

## High / Medium

- **Rate-limit gaps:** `/submit-stream` (full hidden suite) matched no limiter (regex ended in `(run|submit)$`); no `trust proxy` so all users shared one bucket behind Render; `generate-problem` unthrottled. Added per-user limiter + IP guard + `TRUST_PROXY`.
- **Draft problems** could be run/submitted by students (any id). Now 404 for non-privileged.
- **Faculty could edit/delete any problem** (header claimed admin-only). Now owner-or-admin. PUT mass-assignment replaced with a field whitelist; limits clamped; array/shape validation (non-array `languages` used to 500).
- **Deleted problems resurrected** after restart (never deleted from Firestore); **every submission sync silently failed** (`undefined` fields); submissions loaded as an arbitrary 500. All fixed in `store.js` (+ atomic file writes, bounded memory).
- **Infrastructure outages were saved as student failures.** Now 503, not persisted.
- Verdict logic was duplicated 3× and inconsistent (host path used plain `.trim()`; Piston judged TLE from the HTTP round-trip). Single `verdict.js`; Piston uses real `wall_time`; Judge0 falls back when `?wait=true` is disabled, picks GCC not Clang/"Python for ML", and no longer reports unfinished jobs as Runtime Error.
- `C` programs failed to link `-lm` on the host path; Python/Java/JS had no time-limit multiplier on the host path; fake memory numbers (1024/2048/4096 KB) replaced with "unknown".
- **Faculty dashboards were empty:** unfiltered `sessions` listener is rejected by the rules (rules aren't filters). Now department-scoped.
- **Every student interview showed a bogus "Failed to save drive link"** (client `updateSession` is denied by rules). Server writes it; save now ordered before upload.
- Auth context: cleanup returned inside `.then()` (listener/timer leaks, old timer could log out the *next* user), spinner hung forever if profile load threw, stale profile after fast logout.
- `firebase.ts` threw at import (white screen) if an *optional* env var (analytics ID) was missing.
- Streaming AI: server-sent errors were swallowed (blank questions); sentences split mid-number ("v3." / "5").
- Error handler returned **400 + raw internal message for every error**, and crashed after SSE headers were sent. CORS allowed any `localhost:*` in production. Dockerfile ran as root without `NODE_ENV`.
- ffmpeg input is now restricted to local files and uploads are magic-byte checked (client MIME was trusted).
- `ranking.ts` crashed on partial records and could exceed 100 diversity; stale-closure hooks in the interview flow used an outdated `sessionTimeLimit`.
- Offline AI-problem fallback mis-routed ("Subarray Sum" → arithmetic, "Topological Sort" → selection sort).

## Needs your decision (not changed)

1. **Retention job deletes the whole session record** (scores, report) after `VIDEO_RETENTION_DAYS`, not just the video. The test asserts this, so it looks intentional — but it erases students' interview history after 7 days.
2. **Deleting a user in Admin only deletes Firestore docs**, not the Firebase Auth account; the person can log back in and gets a fresh Student profile. Needs a server endpoint using the Admin SDK.
3. **Speech analytics use a hard-coded 180 s** duration for WPM regardless of real speaking time; real per-answer timing is needed.
4. **Offline evaluator scores are content-insensitive** (baseline 50–95 for any text) — fine as a fallback, but don't treat as a grade.
5. `ce.judge0.com` / `emkc.org` are the default sandboxes: student code goes to a third party and the public instances are rate-limited. Self-host Judge0/Piston for production.
6. Client-computed interview scores are writable by the student under the current rules (inherent to the design).

## Behaviour changes to be aware of
- Local dev without a service account now needs `ALLOW_INSECURE_DEV_AUTH=true` (see `server/.env.example`).
- Local code execution needs `JUDGE_ALLOW_LOCAL=true` (with a clear "sandbox unavailable" error otherwise).
- `GET /api/coding/judge-status` is Admin-only.
