# Deploying PrepHire.AI for the student pilot

This is a step-by-step checklist for standing up the app for a small pilot
group (~20 students). It assumes you're deploying the frontend to Firebase
Hosting and the backend to Render, matching the existing `firebase.json` /
`render.yaml` in this repo — adjust if you're hosting elsewhere.

It also documents the security fixes made just before this pilot (see
`git log` / PR history around the date you're reading this) so you know
which env vars moved and why.

---

## 1. Firebase project setup

1. Create (or reuse) a Firebase project. Enable **Authentication →
   Email/Password** and **Firestore**.
2. Copy `.env.example` to `.env.local` and fill in the `VITE_FIREBASE_*`
   values from your Firebase project settings.
3. Leave `VITE_API_URL` blank if the frontend and backend will be on
   different hosts and the SPA is calling the deployed Render URL directly
   from the browser — set it to the Render URL in that case, e.g.
   `VITE_API_URL=https://your-service.onrender.com`.
   (**Note:** there is no `VITE_GEMINI_API_KEY` anymore — see §3.)

## 2. Deploy Firestore rules — **do this before anyone signs up**

```bash
firebase deploy --only firestore:rules
```

The rules in this repo now do two important things that didn't exist before
this pilot prep:

- A newly-created account can **only** create itself as `role: 'Student'`.
  Promotion to `Faculty`/`Admin` can only happen via an existing Admin's
  `update` — never at signup, and never by editing the client. If you skip
  deploying the updated rules, the old (unrestricted) rules stay live and
  self-promotion to Admin is possible.
- Faculty can only read/update sessions in their own `department`.

## 3. Bootstrap your first Admin account

Because self-registration can no longer set an elevated role, you need to
promote your own account by hand, once, before inviting anyone else:

1. Register normally through the app's sign-up flow (you'll land as
   `Student`).
2. Go to **Firebase Console → Firestore Database → `users` collection →
   your document** (doc ID = your Firebase Auth UID).
3. Edit the `role` field from `Student` to `Admin`. Save.
4. Sign out and back in — the app will pick up the new role.

Do this **before** sharing the sign-up link with students, so you're not
racing anyone for the first Admin slot.

## 4. Backend (Render) environment variables

Copy `server/.env.example` for the full list. The important ones for this
pilot:

| Variable | Notes |
|---|---|
| `GOOGLE_SHARED_DRIVE_FOLDER_ID` | Shared Drive folder for interview video storage |
| `GOOGLE_SERVICE_ACCOUNT` | Base64 or raw JSON service account credentials |
| `GEMINI_API_KEY` | Server-side only. Get one at https://aistudio.google.com/apikey. Do **not** prefix it with `VITE_`. |
| `JUDGE_PROVIDER` | Execution provider mode: `'auto'` (default), `'judge0'`, `'piston'`, or `'local'`. In `'auto'`, prefers Judge0, falls back to Piston, and provides native toolchains (`g++`, `gcc`, `python`, `node`) for offline resilience. |
| `JUDGE0_API_URL` | URL to Judge0 API. Defaults to public CE: `https://ce.judge0.com`. For self-hosted Docker, use `http://localhost:2358` or internal container DNS. |
| `JUDGE0_API_KEY` | Optional API key if using RapidAPI (`judge0-ce.p.rapidapi.com`) or an authenticated Judge0 deployment. |
| `JUDGE0_API_HOST` | RapidAPI host header (e.g. `judge0-ce.p.rapidapi.com`), required only when routing via RapidAPI. |
| `JUDGE0_AUTH_TOKEN` | Optional auth token header (`X-Auth-Token`) for self-hosted instances with authentication enabled. |
| `PISTON_API_URL` | Piston sandbox endpoint (defaults to demo instance or self-hosted port 2000). Acts as secondary provider. |
| `CORS_ORIGIN` | Set to your deployed Firebase Hosting URL |

`render.yaml` lists these secrets alongside other configuration variables.

### 4.1 Deploying & Configuring Judge0

Judge0 (GPLv3) provides containerized, CodeChef-standard execution with cgroup resource isolation, microsecond timing, and accurate memory telemetry.

#### Option A: Public Free CE (Zero-Setup Default)
By default, `JUDGE_PROVIDER=auto` and `JUDGE0_API_URL=https://ce.judge0.com`. No keys or Docker setup required. The PrepHire backend communicates via Base64 encoding and auto-polls execution tokens.

#### Option B: Self-Hosted Judge0 CE via Docker Compose (Recommended for Institutional Production)
To run an isolated Judge0 instance on your own virtual machine or campus server:
1. Download the official Judge0 Docker Compose release:
   ```bash
   wget https://github.com/judge0/judge0/releases/download/v1.14.0/judge0-v1.14.0.zip
   unzip judge0-v1.14.0.zip && cd judge0-v1.14.0
   ```
2. Generate configuration and start containers:
   ```bash
   docker-compose up -d db redis
   sleep 10
   docker-compose up -d
   ```
3. Point PrepHire's `server/.env` to your host:
   ```env
   JUDGE_PROVIDER=judge0
   JUDGE0_API_URL=http://your-server-ip:2358
   ```

#### Option C: RapidAPI Judge0
If subscribing through RapidAPI:
```env
JUDGE_PROVIDER=judge0
JUDGE0_API_URL=https://judge0-ce.p.rapidapi.com
JUDGE0_API_KEY=your_rapidapi_key
JUDGE0_API_HOST=judge0-ce.p.rapidapi.com
```

### 4.2 Judge Troubleshooting & Diagnostics

- **Inspect Active Judge Engine**: Query `GET /api/coding/judge-status` on the server to verify which provider is currently active and reachable.
- **Run the Judge Test Suite**: Execute `npm run test:judge` inside the `server/` directory to run all 9 automated verification checks (C++, Python, JS, TLE, CE, WA, Hidden cases, SSE progress, and concurrency).
- **Public Queue Congestion**: If using `https://ce.judge0.com` during peak internet hours, submissions may experience queue wait times. The PrepHire judge automatically uses adaptive token polling with extended timeouts and falls back seamlessly to the host toolchain if public queues become unreachable.
- **Linux cgroup v1 vs v2**: When self-hosting Judge0 on newer Linux distributions (Ubuntu 22.04+, Debian 11+), ensure cgroup v1 compatibility is enabled (`systemd.unified_cgroup_hierarchy=0`) in GRUB if CPU/memory tracking fails.

## 5. Build and deploy the frontend

```bash
npm run build
firebase deploy --only hosting,firestore:rules
```

## 6. Smoke-test before inviting students

- [ ] Register a throwaway Student account — confirm it lands as `Student`,
      not something else.
- [ ] Log in as your Admin account, confirm the Admin console loads.
- [ ] Run a mock interview end-to-end (resume upload → AI questions →
      report) — this exercises the new `/api/ai/generate` proxy.
- [ ] Try the coding hub: run and submit a sample problem. Verify the live SSE
      progress bar ("Running on test X of N...") completes with Accepted.
- [ ] As a non-Admin/Faculty account, confirm you get a 403 trying to hit
      `POST /api/courses` or `POST /api/coding/problems` directly (e.g. via
      curl) — this confirms the auth migration took effect.

## 7. Scalability & Rollout Checklist

- **Self-host Judge0** using Option B above for zero rate limits and dedicated departmental compute.
- Move `server/uploads/courses.json` and `coding_problems.json` /
  `coding_submissions.json` to Firestore if scaling beyond pilot cohorts.

---

### What changed and why (quick reference)

| Area | Before | After |
|---|---|---|
| Signup role | Client could set any role in the write to Firestore | Firestore rules force `role: 'Student'` on create |
| Faculty session access | Could read *any* session | Scoped to their own `department` |
| Courses API | Trusted forgeable `x-user-email`/`x-user-role` headers | Verifies Firebase ID token server-side, same as the coding platform |
| Gemini key | Shipped in the client bundle (`VITE_GEMINI_API_KEY`) | Lives only in `server/.env` (`GEMINI_API_KEY`), called via `/api/ai/generate` |
| Server hardening | No security headers, no rate limits, unbounded JSON body | `helmet`, tiered rate limits (general / upload / code-exec), 1MB JSON limit |
