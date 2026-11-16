# Admin-Managed Quizzes & Student Assessment Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a full-featured Quizzes module in PrepHire.AI allowing Administrators to author, AI-generate, and publish timed multiple-choice assessments (with branch targeting), and allowing Students to take timed tests with an interactive palette navigator, instant automated grading, and comprehensive performance reviews.

**Architecture:** 
- **Persistence Layer**: Firestore collections `quizzes` (quiz metadata & question array) and `quiz_attempts` (student submissions & scores) with Firestore security rules enforcement.
- **Admin Studio**: `AdminQuizManager` & `AdminQuizEditor` with manual question authoring and 1-click AI generation via backend LLM integration.
- **Student Experience**: `StudentQuizHub` (catalog with branch & difficulty filtering) and `QuizPlayer` (timed assessment cockpit with countdown timer, question palette, review tags, and instant results modal).
- **Navigation**: Deep routing synchronization (`/dashboard/quizzes`, `/admin/quizzes`) in `App.tsx` with browser history integration.

**Tech Stack:** React 19, TypeScript, Cloud Firestore, Lucide Icons, Theme tokens (`src/theme.ts`), Gemini / NVIDIA NIM AI generation.

---

## Global Constraints

- **Theme Compliance**: All UI components must use semantic tokens from `src/theme.ts` (`T.primary`, `T.gold`, `T.bg`, `T.border`, `GlassCard`, `SolidCard`). No CSS modules or Tailwind.
- **Role Isolation**: Only `Admin` can create, update, publish, or delete quizzes. `Student` can only read published quizzes and write their own attempt records.
- **Zero Build / Lint Errors**: `npm run build` (`tsc -b && vite build`) and `npm run lint` must pass with 0 errors at every stage.
- **Institutional Governance**: Quizzes must support MIT AoE branch targeting (`targetBranch: 'all' | BranchCode`) using `BRANCHES` from `src/constants/branches.ts`.

---

## Review Focus

1. **Auto-submission on timer expiry**: When the countdown clock hits `00:00`, all currently answered questions must automatically be submitted without data loss.
2. **Hidden answer privacy**: While a quiz is in progress, the client must evaluate answers cleanly or verify securely upon completion so answers aren't exposed in inspect element before submission.
3. **Department scoping**: Students only see quizzes targeted to `'all'` or their registered engineering department.
4. **State preservation across questions**: Switching between questions via the question palette must preserve chosen radio options and review flags.
5. **Back/forward browser navigation**: Entering `/dashboard/quizzes` or taking a quiz must interact cleanly with browser history without accidental cancellation.

---

## File Structure

```
src/
├── types/
│   └── quiz.ts                          # TypeScript interfaces for Quiz, Question, Attempt
├── services/
│   └── quiz.service.ts                  # Firestore CRUD for quizzes and attempts
├── components/
│   └── quiz/
│       ├── AdminQuizManager.tsx         # Admin quiz catalog, publish toggle, analytics
│       ├── AdminQuizEditor.tsx          # Quiz form, MCQ builder, AI generation modal
│       ├── StudentQuizHub.tsx           # Student quiz catalog & past performance card
│       ├── QuizPlayer.tsx               # Timed exam workspace with palette & countdown
│       └── QuizResultModal.tsx          # Score breakdown, correct answers, explanations
└── App.tsx                              # Navigation tabs, routing sync, role integration
```

---

## Tasks

### Task 1: Type Definitions & Quiz Service Layer

**Files:**
- Create: `src/types/quiz.ts`
- Create: `src/services/quiz.service.ts`

- [ ] **Step 1: Define TypeScript models in `src/types/quiz.ts`**
  - `QuizQuestion`: `id`, `question`, `codeSnippet?`, `options: [string, string, string, string]`, `correctIndex: number`, `explanation?`, `points: number`
  - `Quiz`: `id`, `title`, `description`, `targetBranch: string`, `category: string`, `difficulty: 'Beginner' | 'Intermediate' | 'Advanced'`, `timeLimitMinutes: number`, `passingPercentage: number`, `questions: QuizQuestion[]`, `createdBy: string`, `createdAt: string`, `updatedAt: string`, `published: boolean`
  - `QuizAttempt`: `id`, `quizId`, `quizTitle`, `studentUid`, `studentEmail`, `studentName`, `department`, `score`, `maxScore`, `percentage`, `passed`, `answers: Record<string, number>`, `timeSpentSeconds`, `completedAt: string`
- [ ] **Step 2: Implement Firestore service methods in `src/services/quiz.service.ts`**
  - `listQuizzes(options?: { branch?: string, publishedOnly?: boolean })`
  - `getQuizById(quizId: string)`
  - `createQuiz(quiz: Omit<Quiz, 'id'>)`
  - `updateQuiz(quizId: string, updates: Partial<Quiz>)`
  - `deleteQuiz(quizId: string)`
  - `submitQuizAttempt(attempt: Omit<QuizAttempt, 'id'>)`
  - `getStudentQuizAttempts(studentUid: string)`
  - `getQuizAttempts(quizId: string)`
- [ ] **Step 3: Verify TypeScript compilation**
  - Run `npm run build` to confirm zero typing errors.

---

### Task 2: Admin Quiz Studio (Manager & Editor)

**Files:**
- Create: `src/components/quiz/AdminQuizManager.tsx`
- Create: `src/components/quiz/AdminQuizEditor.tsx`

- [ ] **Step 1: Build `AdminQuizManager.tsx`**
  - Header with "Create New Quiz" and "✨ AI Generate Quiz" action buttons.
  - Metrics row: Total Quizzes, Active/Published Quizzes, Total Student Attempts.
  - Search and filter bar (by Branch and Category).
  - Responsive quiz cards/table showing title, target branch, question count, duration, published badge, and actions (Edit, Delete, Toggle Publish, View Results).
- [ ] **Step 2: Build `AdminQuizEditor.tsx`**
  - Meta section: Title, Description, Branch dropdown (All + 9 MIT AoE branches), Category (Technical, Aptitude, Core, Verbal), Time limit (minutes), Passing percentage.
  - Question Builder: Add question button, prompt input, optional code snippet block, 4 option text fields, radio button to set correct answer, and explanation field.
  - AI Quiz Generator Modal: Topic input (e.g. "C++ Pointers & Memory Management"), number of questions (5, 10, 15), difficulty selector, and "Generate" trigger.
  - Save as Draft / Publish actions with error validation (ensures questions have text and options).
- [ ] **Step 3: Verification**
  - Run `npm run lint` and `npm run build`.

---

### Task 3: Student Quiz Hub & Catalog

**Files:**
- Create: `src/components/quiz/StudentQuizHub.tsx`

- [ ] **Step 1: Build `StudentQuizHub.tsx`**
  - Hero header with candidate's quiz readiness stats (Quizzes Completed, Average Score %, Best Subject).
  - Branch and Category filter pills (`All Quizzes`, `My Department: [Branch]`, `Technical`, `Aptitude`).
  - Quiz Cards displaying:
    - Subject icon & category pill
    - Branch eligibility tag (`All Branches` vs `Department Specific`)
    - Duration (`⏱️ 15 mins`), Questions count (`📝 10 Questions`), Difficulty badge
    - Status badge (`Not Attempted`, `Passed (85%)`, `Needs Retake`)
    - "Start Quiz" / "Retake Quiz" action button.
- [ ] **Step 2: Verification**
  - Run `npm run build`.

---

### Task 4: Interactive Quiz Player & Real-Time Test Workspace

**Files:**
- Create: `src/components/quiz/QuizPlayer.tsx`
- Create: `src/components/quiz/QuizResultModal.tsx`

- [ ] **Step 1: Build `QuizPlayer.tsx`**
  - Full-width focused test environment with confirmation dialog before exit.
  - Top header: Quiz title, question counter (`Question 3 of 10`), and live countdown timer (visual warning when under 2 minutes).
  - Main question card:
    - Clear question typography and optional code snippet formatting.
    - 4 large interactive option buttons (A, B, C, D) with hover effects and selection checkmarks.
  - Navigation bar: "Previous Question", "Mark for Review" toggle, "Next Question", and "Submit Assessment".
  - Sidebar Question Palette:
    - 1..N numbered grid with color-coded status legend: Answered (Green), Marked for Review (Yellow), Unanswered (Gray), Active (Blue border).
  - Auto-submit trigger on timer expiration (`00:00`).
- [ ] **Step 2: Build `QuizResultModal.tsx`**
  - Congratulatory / evaluation banner (`Passed` or `Keep Practicing`).
  - Score metrics: Total Score, Accuracy percentage, Time spent.
  - Question Review Section: Expandable question list showing candidate's choice, correct answer, and detailed explanation for learning reinforcement.
- [ ] **Step 3: Verification**
  - Run `npm run build` and `npm run lint`.

---

### Task 5: App Integration & Deep Routing Synchronization

**Files:**
- Modify: `src/App.tsx`
- Modify: `firestore.rules` (if applicable)

- [ ] **Step 1: Register Quizzes in Navigation & Role Portals**
  - Add `'quizzes'` to `AdminPortal` tab bar alongside `Users`, `Courses`, `Coding Problems`.
  - Add `'quizzes'` to `StudentPortal` tab bar / header navigation.
  - Mount `AdminQuizManager` when admin is on `'quizzes'` tab.
  - Mount `StudentQuizHub` and `QuizPlayer` when student is on `'quizzes'` tab.
- [ ] **Step 2: Deep Routing Synchronization**
  - Update `parsePathname` and `syncPathname` in `App.tsx` to handle:
    - `/dashboard/quizzes`
    - `/dashboard/quizzes/:quizId`
    - `/admin/quizzes`
  - Ensure browser Back/Forward buttons navigate smoothly between the quiz catalog and active quiz.
- [ ] **Step 3: End-to-End Verification**
  - Run `npm run build` (0 errors).
  - Run `npm run lint` (0 errors).
  - Run `npm --prefix server run test:sandbox` and `test:judge`.
  - Verify complete navigation in development server.

---

### Task 6: Documentation & Production Deployment

**Files:**
- Modify: `README.md`
- Modify: `AGENTS.md`

- [ ] **Step 1: Update Documentation**
  - Document the Quizzes module in `README.md` under `## 🆕 What's New in the Latest Release`.
  - Update `AGENTS.md` with quiz architecture and data schemas.
- [ ] **Step 2: Git Commit & Push**
  - Stage, commit with message `feat(quiz): add admin quiz studio and student assessment hub`.
  - Push to `origin main`.
- [ ] **Step 3: Deploy to Firebase Hosting**
  - Deploy with `npx firebase deploy --only hosting`.
  - Confirm live deployment at `https://prephire-ai.web.app`.
