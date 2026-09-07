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
| `GEMINI_API_KEY` | **New** — server-side only. Get one at https://aistudio.google.com/apikey. Do **not** prefix it with `VITE_` — that's what caused it to leak into the client bundle before this fix. |
| `PISTON_API_URL` | Defaults to the public Piston demo instance. Fine for ~20 students doing light coding practice, but it's shared with the rest of the internet and can be flaky. Self-host if you can (see below). |
| `CORS_ORIGIN` | Set to your deployed Firebase Hosting URL |

`render.yaml` already lists `GEMINI_API_KEY` alongside the other secrets —
Render will prompt you for it during service creation/redeploy.

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
- [ ] Try the coding hub: run and submit a sample problem.
- [ ] As a non-Admin/Faculty account, confirm you get a 403 trying to hit
      `POST /api/courses` or `POST /api/coding/problems` directly (e.g. via
      curl) — this confirms the auth migration took effect.

## 7. Optional but recommended before a wider rollout (not blocking for 20 students)

- **Self-host Piston** (`docker run -d -p 2000:2000 engineer-man/piston` as a
  starting point) and point `PISTON_API_URL` at it, instead of the shared
  public demo instance.
- Move `server/uploads/courses.json` and `coding_problems.json` /
  `coding_submissions.json` to a real database if you outgrow single-writer
  JSON files (fine for a 20-person pilot, a real risk at higher concurrency).

---

### What changed and why (quick reference)

| Area | Before | After |
|---|---|---|
| Signup role | Client could set any role in the write to Firestore | Firestore rules force `role: 'Student'` on create |
| Faculty session access | Could read *any* session | Scoped to their own `department` |
| Courses API | Trusted forgeable `x-user-email`/`x-user-role` headers | Verifies Firebase ID token server-side, same as the coding platform |
| Gemini key | Shipped in the client bundle (`VITE_GEMINI_API_KEY`) | Lives only in `server/.env` (`GEMINI_API_KEY`), called via `/api/ai/generate` |
| Server hardening | No security headers, no rate limits, unbounded JSON body | `helmet`, tiered rate limits (general / upload / code-exec), 1MB JSON limit |
