# PrepHire.AI UI/UX & Quality Improvement Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Elevate existing UI/UX responsiveness, accessibility (WCAG), design token consistency, and interaction ergonomics across all views of PrepHire.AI without adding any new feature scope.

**Architecture:** Refactor hardcoded desktop grids into responsive CSS-governed layouts with mobile-first breakpoints; replace emojis with vector SVG icons; standardize keyboard navigation (Escape key, ARIA dialog roles, focus management) across all modals; and migrate inline hardcoded hex colors to centralized design tokens in `src/theme.ts`.

**Tech Stack:** React 19, TypeScript, Lucide React, CSS Custom Properties, Vite.

**Spec:** Referenced from project documentation (`README.md`, `AGENTS.md`, `TODO-UPGRADES-AND-FEATURES.md`) and UI/UX design intelligence skills (`ui-ux-pro-max`, `ponytail-audit`).

## Global Constraints

- **Zero New Features:** Strictly address existing screens, layouts, accessibility gaps, and visual inconsistencies.
- **Styling Architecture:** Maintain the project's styling convention (shared tokens in `src/theme.ts`, global utilities and animations in `src/index.css`, inline styles for dynamic properties). Do not introduce Tailwind or CSS modules.
- **TypeScript Integrity:** All modifications must be 100% type-safe with zero TypeScript errors.
- **Preserve Existing Business Logic:** Do not alter Firestore schemas, AI prompt pipelines, judge sandboxes, or proctoring heuristics.

## Review Focus

1. **Mobile Viewport Collisions (< 768px):** Ensure the 240px sidebar in Student, Faculty, and Admin dashboards transforms into a clean responsive horizontal tab bar or collapsible mobile layout instead of squishing content.
2. **Keyboard & Modal Traps:** Verify that all modals (`AtsScannerModal`, Feedback modal, End Interview dialog, Cookie preferences) close on `Escape` key, support backdrop dismissal, and carry proper `role="dialog"` attributes.
3. **Screen Reader Feedback:** Verify that form validation errors (`LoginScreen`, Feedback modal) announce immediately to assistive technology via `role="alert"` / `aria-live="polite"`.
4. **Touch Target Dimensions:** Ensure all interactive elements, icon buttons, and table action buttons have a minimum tap area of 44x44px on mobile devices.
5. **Code Editor Ergonomics on Small Screens:** Ensure the Monaco editor and problem statement in `ProblemWorkspace.tsx` stack gracefully on viewports < 900px to prevent horizontal clipping.

---

### Task 1: Responsive Dashboard & Portal Layouts

**Files:**
- Modify: `src/index.css`
- Modify: `src/App.tsx:2142, 3322, 5212`

**Interfaces:**
- Consumes: CSS class `.portal-layout`, `.portal-sidebar`, `.portal-main`
- Produces: Fluid responsive dashboard structure that adapts between desktop (240px sidebar + 1fr main) and tablet/mobile (< 840px stacked tabs + full-width main).

- [x] **Step 1: Define responsive portal classes in `src/index.css`**
Add `.portal-layout`, `.portal-sidebar`, and `.portal-main` with media queries:
```css
.portal-layout {
  display: grid;
  grid-template-columns: 240px 1fr;
  min-height: calc(100vh - 60px);
  flex: 1;
}

@media (max-width: 840px) {
  .portal-layout {
    grid-template-columns: 1fr;
    display: flex;
    flex-direction: column;
  }
  .portal-sidebar {
    width: 100% !important;
    border-right: none !important;
    border-bottom: 1px solid var(--color-outline-variant) !important;
    flex-direction: row !important;
    overflow-x: auto !important;
    padding: 12px 16px !important;
    white-space: nowrap !important;
    gap: 8px !important;
  }
  .portal-main {
    height: auto !important;
    min-height: calc(100vh - 120px) !important;
  }
}
```

- [x] **Step 2: Apply `.portal-layout` and `.portal-sidebar` across all 3 dashboards in `src/App.tsx`**
Replace hardcoded inline `style={{ display: 'grid', gridTemplateColumns: '240px 1fr' ... }}` in Student Dashboard, `FacultyDashboard`, and `AdminDashboard` with the `.portal-layout` class.

- [x] **Step 3: Verify responsive layout rendering**
Resize browser window from 1440px down to 375px: verify sidebar transforms into a smoothly scrollable horizontal navigation bar without layout shift or horizontal body overflow.

---

### Task 2: Landing Page Responsive Grids & Mobile Navigation

**Files:**
- Modify: `src/index.css`
- Modify: `src/App.tsx:1030-1265`

**Interfaces:**
- Consumes: CSS utility classes for landing sections (`.landing-hero-grid`, `.landing-stats-grid`, `.landing-features-grid`, `.landing-steps-grid`, `.landing-nav`).
- Produces: Fully responsive public landing page that renders seamlessly on 375px (mobile), 768px (tablet), and 1280px (desktop).

- [x] **Step 1: Add landing grid utilities in `src/index.css`**
Add responsive grid classes with appropriate column wrapping:
```css
.landing-hero-grid {
  display: grid;
  grid-template-columns: 1.2fr 1fr;
  gap: 40px;
  align-items: center;
}
@media (max-width: 840px) {
  .landing-hero-grid {
    grid-template-columns: 1fr;
    gap: 24px;
    padding: 40px 20px 30px 20px !important;
  }
}

.landing-stats-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 24px;
}
@media (max-width: 640px) {
  .landing-stats-grid {
    grid-template-columns: repeat(2, 1fr);
    gap: 16px;
  }
}

.landing-features-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 20px;
}
@media (max-width: 640px) {
  .landing-features-grid {
    grid-template-columns: 1fr;
    gap: 14px;
  }
}

.landing-steps-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 20px;
}
@media (max-width: 768px) {
  .landing-steps-grid {
    grid-template-columns: repeat(2, 1fr);
    gap: 16px;
  }
}
@media (max-width: 480px) {
  .landing-steps-grid {
    grid-template-columns: 1fr;
  }
}
```

- [x] **Step 2: Update `LandingPage` in `src/App.tsx`**
Replace inline styles on sections with the new CSS classes and make the public header navigation links collapse or hide gracefully on small mobile screens.

- [x] **Step 3: Verification**
Verify no text truncation, no horizontal scrollbars, and readable stat cards on small viewport widths.

---

### Task 3: Modal Dialog Accessibility & Keyboard Handling

**Files:**
- Modify: `src/components/resume/AtsScannerModal.tsx`
- Modify: `src/App.tsx:4408-4412, 6642-6680` (Feedback Modal & End Interview Modal)
- Modify: `src/components/cookies/CookieBanner.tsx`

**Interfaces:**
- Consumes: Native `keydown` event listener for `key === 'Escape'`
- Produces: Accessible modal dialogs with focus management, backdrop dismissal, `role="dialog"`, `aria-modal="true"`, and `aria-labelledby`.

- [x] **Step 1: Add Escape key listener and backdrop click to `AtsScannerModal.tsx`**
Add `useEffect` listening for `Escape` key and call `onClose()`. Add backdrop click handler that closes when clicking the overlay container.
Add `role="dialog"`, `aria-modal="true"`, and `aria-labelledby="ats-modal-title"`.

- [x] **Step 2: Add Escape key listener and backdrop click to Feedback Modal & End Interview Modal in `src/App.tsx`**
Ensure pressing `Escape` dismisses the feedback modal and confirmation dialogs cleanly. Add `role="dialog"` and `aria-modal="true"`.

- [x] **Step 3: Add Escape key support to Cookie Preferences Modal in `src/components/cookies/CookieBanner.tsx`**
Ensure the preference panel can be closed using the keyboard `Escape` key.

- [x] **Step 4: Verification**
Open each modal, press `Escape`, verify modal closes. Click backdrop, verify modal closes. Inspect DOM to verify `role="dialog"` is present.

---

### Task 4: Vector Icon Normalization & Emoji Elimination

**Files:**
- Modify: `src/App.tsx:1269-1300` (`ToastNotification`)
- Modify: `src/App.tsx` (any inline emoji in warnings, status indicators, or report cards)

**Interfaces:**
- Consumes: Lucide icons `CheckCircle2`, `AlertCircle`, `Info`, `XCircle`
- Produces: Professional, platform-consistent SVG rendering conforming to `ui-ux-pro-max` icon guidelines.

- [x] **Step 1: Refactor `ToastNotification` in `src/App.tsx`**
Replace `'✅'`, `'❌'`, `'ℹ️'` emoji with Lucide vector icons:
```tsx
const Icon = toast.type === 'success' ? CheckCircle2 : toast.type === 'error' ? AlertCircle : Info
```
Render `<Icon size={18} style={{ color, flexShrink: 0 }} />`.

- [x] **Step 2: Scan and replace structural emojis across `src/App.tsx`**
Replace any structural emojis used as buttons or section badges with appropriate Lucide icons.

- [x] **Step 3: Verification**
Trigger success, error, and info toasts. Confirm crisp SVG rendering without OS font emoji discrepancies.

---

### Task 5: Form Accessibility, Labels & Validation Error Feedback

**Files:**
- Modify: `src/App.tsx:1303-1550` (`LoginScreen`)
- Modify: `src/App.tsx:4408-4412` (Feedback Modal Form)

**Interfaces:**
- Consumes: `<label className="sr-only">` or visible `<label>`, `role="alert"`, `aria-live="polite"`
- Produces: WCAG AA compliant forms with clear screen-reader associations and accessible validation feedback.

- [x] **Step 1: Add accessible labels to `LoginScreen` in `src/App.tsx`**
Add `<label htmlFor="...">` for Full name, Email, Password, Role, and Department/Branch. Use `.sr-only` class or clean semantic labels for visually seamless display.
Add `aria-invalid={!!err}` and `aria-describedby="auth-error-msg"` to the inputs.

- [x] **Step 2: Add `role="alert"` and `aria-live="polite"` to error display**
Ensure the auth error banner has `id="auth-error-msg"`, `role="alert"`, and `aria-live="polite"` so screen readers announce authentication errors immediately upon occurrence.

- [x] **Step 3: Verification**
Submit invalid form data and verify error message has proper alert semantics and that input fields have programmatically determinable accessible names.

---

### Task 6: Coding Workspace & Coding Dashboard Ergonomics

**Files:**
- Modify: `src/components/coding/ProblemWorkspace.tsx:269`
- Modify: `src/components/coding/CodingDashboard.tsx:50`

**Interfaces:**
- Consumes: Responsive layout CSS for problem workspace & dashboard stat cards
- Produces: Responsive coding interface that stacks problem statement above/below Monaco editor on narrow viewports, preventing editor distortion.

- [x] **Step 1: Add responsive classes in `src/index.css` for Coding Workspace**
```css
.workspace-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.15fr);
  gap: 16px;
  align-items: start;
}
@media (max-width: 960px) {
  .workspace-grid {
    grid-template-columns: 1fr;
  }
}

.coding-stats-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
}
@media (max-width: 768px) {
  .coding-stats-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}
@media (max-width: 440px) {
  .coding-stats-grid {
    grid-template-columns: 1fr;
  }
}
```

- [x] **Step 2: Apply classes in `ProblemWorkspace.tsx` and `CodingDashboard.tsx`**
Replace inline grid styles with `.workspace-grid` and `.coding-stats-grid`.

- [x] **Step 3: Verification**
Resize workspace to 768px and 400px: verify Monaco editor remains legible, tabs work properly, and stat cards display without squishing.

---

### Task 7: Design Token Harmonization & Color Consistency

**Files:**
- Modify: `src/theme.ts`
- Modify: `src/App.tsx` (selected hardcoded color sites)

**Interfaces:**
- Consumes: Centralized color tokens `T.primary`, `T.gold`, `T.green`, `T.error`, `T.amber`, `T.border`
- Produces: Consistent visual language free of conflicting ad-hoc hex values.

- [x] **Step 1: Audit and augment `src/theme.ts` tokens**
Ensure all standard UI semantic roles exist:
`T.info = '#2563EB'`, `T.infoBg = '#EFF6FF'`, `T.infoBorder = '#BFDBFE'`.

- [x] **Step 2: Replace hardcoded hex strings across `App.tsx`**
Replace recurring raw strings (e.g., `'#EFF6FF'`, `'#2563EB'`, `'#10B981'`, `'#EF4444'`) with semantic tokens from `T`.

- [x] **Step 3: Verification**
Verify visual consistency across score rings, pills, action buttons, and card borders.
