# Staff Portal v2 — 10/10 Program Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking. Update the Execution log at the bottom as phases land — with REAL commit hashes and PR numbers only, recorded after they exist.

**Goal:** Take the staff portal (educator side) and HR management side from "strong bones" to 10/10: a phone-first five-tab staff app (Home / My Day / Pay / Leave / Me), a real notifications loop with push, and closure of the four broken HR workflow legs (roster command centre, offboarding UI, hire→employee conversion, timesheet approval hygiene), plus compliance/reporting depth.

**Architecture:** Reshape the staff surface from one mega-page (`/my-portal`, ~1,400 lines) into a hub plus three dedicated destinations (`/my-pay`, `/my-leave`, `/my-expenses`) that REUSE the existing, well-built Employment-Hero-backed cards (`src/components/my-portal/*`) rather than rewriting their data layers. The mobile tab bar becomes role-aware. Everything follows the visual contract in the design mockups (Design Source below). HR phases wire existing-but-orphaned backends (offboarding hooks, timesheet entry mutations, open-shift APIs) into UI rather than building new backends.

**Tech Stack:** Next.js 16 app router, Prisma 5.22 (new migrations only where a phase says so), React Query, Tailwind tokens from `src/app/globals.css`, Vitest, existing `withApiAuth`/`ApiError`/`fetchApi` conventions.

**Design source of truth:** the mockup canvas working files in
`/private/tmp/claude-503/-Users-jaydenkowaider-Developer-amana-eos-dashboard/bd7b5961-00c2-4489-af41-6debab68c4e8/scratchpad/design/` —
`MobileHome.dc.html`, `MobileMyDay.dc.html`, `MobilePay.dc.html`, `MobileLeave.dc.html`, `MobileExpenses.dc.html`, `Main.dc.html`, `Pay.dc.html`, `Leave.dc.html`, `Expenses.dc.html`, `StaffFile.dc.html`. If that directory is gone, the canvas is at https://claude.ai/code/artifact/252516c2-5c19-4c85-a687-05d75f0c0d09. Translate the mockups' inline styles into design-system tokens (`bg-card`, `text-muted`, `border-border`, `bg-brand`, `text-2xs`, `shadow-warm*`, radius tokens) — NEVER hex-in-className outside `src/components/charts/`.

**Branch/PR strategy:** all work on `feat/staff-portal-v2` off `origin/main`. Commit per task; open one PR per phase (small phases may batch two) so the user can merge incrementally. `git fetch origin` before each phase — this checkout is shared with other sessions and main moves fast; rebase early.

**Non-negotiable repo rules (from CLAUDE.md — apply to every task):**
1. Every new page: add to `allPages` + each relevant role's list in `src/lib/role-permissions.ts`, add nav item in `src/lib/nav-config.ts` with a deliberate `core` tier, verify sidebar via `canAccessPage()`.
2. Every new API route: `withApiAuth` (session) or `withApiHandler`, Zod with Prisma enums, `parseJsonBody`, rate-limit defaults, role gating via options.
3. Mutations: `onError` destructive toast. Queries: `retry: 2` + `staleTime`.
4. Buttons via `@/components/ui/Button`; icon-only buttons need `aria-label`; dialogs need role/aria/Escape (prefer `@/components/ui/Dialog` — Radix).
5. Tests for new routes: auth 401, validation 400, happy path, 404, role 403 — `mockImplementation` input-routing style, under `src/__tests__/api/`.
6. Before claiming a phase done: `npx tsc --noEmit` (no NEW errors), `npm test` green, `npx eslint <changed files>` 0 errors, live browser check of changed pages as BOTH `test-staff@amana-test.local` and `test-owner@amana-test.local` (password `TestPassword123!`, dev server via preview `nextjs-dev`), including 375px mobile viewport for staff surfaces.
7. Dates: `toLocalIsoDate()` from `@/lib/utils` — never `toISOString().split("T")`.
8. Quarters: `quarterLabel()` etc. — never hand-rolled.
9. New cron: `verifyCronSecret` + `acquireCronLock` + vercel.json + tests.
10. Later-phase detail is intentionally lighter: at the START of each phase from 5 onward, re-read the touched files and expand that phase's tasks in this document before implementing (the codebase will have moved).

---

## Chunk 1: Phase 1 — Mobile shell + Pay/Leave/Expenses destinations

**Why first:** it reshapes how staff reach everything; later phases hang screens off this shell.

**Route naming decision (locked):** `/my-pay`, `/my-leave`, `/my-expenses` — consistent with `/my-portal`, `/my-day`, `/my-training`; `/leave` is taken by the admin historical page. "Me" tab = `/profile` (already a complete page: avatar, emergency contacts, WWCC, bank, super).

### Task 1.1: Page scaffolding decision

**Files:**
- Verify: `src/components/layout/PageHeader.tsx` props

- [ ] **Step 1:** Read `PageHeader` — if it supports title+description+primaryAction without EOS chrome, use it directly on the new pages and create nothing. Record the decision in the first commit message of Task 1.2.

### Task 1.2: `/my-pay` — the Pay destination

**Files:**
- Create: `src/app/(dashboard)/my-pay/page.tsx` (thin shell) + `loading.tsx`
- Create: `src/components/my-pay/MyPayContent.tsx`
- Create: `src/components/my-pay/PayslipHeroCard.tsx`
- Create: `src/hooks/useMyPayslips.ts` (lift the query out of `MyPayslipsCard`)
- Modify: `src/components/my-portal/MyPayslipsCard.tsx` (consume the lifted hook)
- Test: `src/__tests__/components/my-pay.test.tsx`

- [ ] **Step 1:** Create `useMyPayslips` by lifting the query (queryKey `["my-payslips"]`, `meta.suppressGlobalErrorToast`, terminal-404/503 retry predicate) out of `MyPayslipsCard`; card and page share it. Write a failing render test for `PayslipHeroCard`: given `slips[0] = {grossEarnings: 1562.3, netEarnings: 1284.6, totalHours: 38.5, payPeriodEnding: "28/08/2026", isPublished: true, payRunId: 7}` it shows `$1,284.60`, "net", a gross/tax(=gross−net)/hours line, and View + Download links pointing at `/api/my-portal/payslips/7/download`.
- [ ] **Step 2:** Run the test, verify it fails. Implement `PayslipHeroCard` per `Pay.dc.html`/`MobilePay.dc.html`: dark `bg-sidebar` hero card, headline via `font-heading`, accent CTA (`bg-accent` with dark text), responsive `sm:` split. Verify pass.
- [ ] **Step 3:** `MyPayContent`: hero (latest slip) + totals strip computed client-side from returned slips (sum gross/net/hours; label honestly "across the payslips shown" — the API returns recent slips, do NOT claim FY totals) + history list (reuse the row layout from `MyPayslipsCard`, full-width). Same not-linked/503/empty states and copy as the card.
- [ ] **Step 4:** Page shell mirrors `/my-portal/page.tsx` conventions. Live-check as staff at 375px and desktop. Commit.

### Task 1.3: `/my-leave` — the Leave destination

**Files:**
- Create: `src/app/(dashboard)/my-leave/page.tsx`, `loading.tsx`
- Create: `src/components/my-leave/MyLeaveContent.tsx`
- Modify: `src/components/my-portal/MyLeaveRequestsCard.tsx` (export `ApplyLeaveModal`)

- [ ] **Step 1:** `MyLeaveContent` per `Leave.dc.html`/`MobileLeave.dc.html`: balances row (reuse `MyLeaveBalanceCard` data logic; restyle container), Apply CTA opening the EXISTING `ApplyLeaveModal`, requests list. Not-linked state = one full-page friendly explanation, not multiple cards of it. Do not fork the cards.
- [ ] **Step 2:** Live-check both viewports incl. opening the apply modal (EH may 503 locally — verify that state renders cleanly). Commit.

### Task 1.4: `/my-expenses` — Reimbursements destination

**Files:**
- Create: `src/app/(dashboard)/my-expenses/page.tsx`, `loading.tsx`
- Create: `src/components/my-expenses/MyExpensesContent.tsx`
- Modify: `src/components/my-portal/MyExpensesCard.tsx` (export the submit modal)

- [ ] **Step 1:** Per `Expenses.dc.html`/`MobileExpenses.dc.html`: "snap your receipt" hero (buttons open the existing submit modal; add `capture="environment"` to the file input for phones), totals strip (pending sum + paid sum from statuses), claims list with the Submitted → Approval → In-your-pay pipeline strip on pending rows. Live-check, commit.

### Task 1.5: Role-aware mobile tab bar + nav/permissions wiring

**Files:**
- Modify: `src/components/layout/MobileTabBar.tsx`
- Modify: `src/lib/nav-config.ts` (My Portal section: My Pay / My Leave / My Expenses, `core: ["staff", "member", "marketing"]`; keep the section contiguous)
- Modify: `src/lib/role-permissions.ts` (`allPages` + staff, member, marketing lists)
- Test: extend existing role-permission tests if present

- [ ] **Step 1:** Tab bar: two tab sets keyed off `useSession().user.role` — staff/member/marketing → `[Home:/my-portal, My Day:/my-day, Pay:/my-pay, Leave:/my-leave, Me:/profile]`; other roles keep the current set. Icons: Wallet, CalendarDays, UserCircle (lucide). Active state via `pathname.startsWith`.
- [ ] **Step 2:** Wire nav-config + role-permissions (rule 1). Run any role-permission vitest files. Live-check: staff sees new tabs + sidebar items; owner unaffected. Commit.

### Task 1.6: `/my-portal` becomes the Home hub

**Files:**
- Modify: `src/app/(dashboard)/my-portal/page.tsx`
- Modify: affected E2E specs (grep for `my-payslips-card`, `my-leave-requests-card`, `my-expenses-card`, "Request Leave")

- [ ] **Step 1:** Per `Main.dc.html`/`MobileHome.dc.html`, restructure the TOP of the page: greeting (existing), next-shift/clock hero (compose existing `MyClockCard` + upcoming-shift data — no duplicate queries), four glance tiles (Last pay → `/my-pay`, Annual leave → `/my-leave`, Reimbursements → `/my-expenses`, Compliance → `/compliance`) reusing the respective hooks with a "—" not-linked fallback, quick-actions row, one consolidated "Needs your attention" card (pending policies / swaps / cert expiry — data already fetched on this page).
- [ ] **Step 2:** REMOVE the moved sections (payslips, leave balance+requests, expenses). Keep: profile summary, quiet hours, D&I, kiosk PIN, notification prefs, sessions, compliance summary, onboarding/offboarding progress. Update E2E selectors that pointed at removed sections to the new routes; update Getting Started hrefs if any pointed at moved anchors.
- [ ] **Step 3:** Full phase verification (rule 6). Commit. Open PR "feat: staff portal v2 phase 1 — mobile shell + Pay/Leave/Expenses destinations".

---

## Chunk 2: Phase 2 — My Day on-shift hero

**Files:**
- Modify: `src/app/(dashboard)/my-day/page.tsx`
- Create: `src/components/my-day/OnShiftHero.tsx`
- Modify: `src/components/my-portal/MyClockCard.tsx` (export `fmtElapsed`)

- [ ] **Task 2.1:** Per `MobileMyDay.dc.html`: when clocked in (active shift from the same `["my-shifts"]` query source as `MyClockCard`), render `OnShiftHero` — "On shift · clocked in HH:MM" with a green dot, elapsed timer recomputed per minute, Clock out via `useClockOut`. Not clocked in → current layout stands.
- [ ] **Task 2.2:** Roll-call callout: `bg-accent` card above checklists — "Roll call · N children not yet marked in" when the Now-card data exposes booked vs present counts; plain Roll Call row when counts unavailable. Link to the existing roll-call deep link.
- [ ] **Task 2.3:** Session snapshot strip (in care / booked / educators on) from the same data; hidden when serviceless. Verify live as staff (zeros locally are fine — check layout), tsc/lint/tests, commit. PR may batch with Phase 3.

---

## Chunk 3: Phase 3 — Notifications inbox + push

**Existing plumbing:** `UserNotification` model (with `link`, `read`), `/api/notifications/unread-count`, `NotificationBell`, `PushSubscription` model, `src/lib/push/register.ts`, `public/manifest.webmanifest`, `public/sw.js`. Missing: a full inbox page, mark-all-read, an opt-in surface.

- [ ] **Task 3.1:** Read `NotificationBell.tsx` to find the existing list/mark-read endpoints; extend with cursor pagination (`?cursor=&limit=`, max 50) if absent, and add `POST /api/notifications/read-all`. Route tests (auth / happy / idempotent re-run) in the existing style. Commit.
- [ ] **Task 3.2:** Page `/notifications`: Today / Earlier groups, unread dot, whole-row link to `n.link` (linkless rows non-navigating), "Mark all read" Button, `EmptyState`, cursor "Load more". Nav (My Portal section, core all roles) + role-permissions (all roles). Point the Getting Started notifications item at `/notifications`. Commit.
- [ ] **Task 3.3:** Push opt-in: card on `/my-portal` for staff-tier roles — renders only when `Notification.permission === "default"` and no active subscription; "Enable notifications" calls the existing `registerPush()`; dismissal persisted in localStorage. Verify register.ts is safe to re-run before wiring. Commit.
- [ ] **Task 3.4:** PWA polish: manifest `start_url` → `/my-day`, add shortcuts (My Day, Pay, Notifications). Verify the manifest is linked from the root layout. Live-check + tests. Open the phase PR.

---

## Chunk 4: Phase 4 — Offboarding UI + deactivate↔separation link

**Existing plumbing:** `src/hooks/useOffboarding.ts` (6 hooks, zero importers), `/api/offboarding/{packs,packs/[id],assign,seed}`, `offboarding.*` features in role-permissions, staff-side progress card on `/my-portal`, `SeparationTab` on the staff profile.

- [ ] **Task 4.1:** `/onboarding` gets an "Offboarding" tab: packs CRUD panel (mirror `OnboardingPacksTab` structure under `src/components/offboarding/`, swap in the offboarding hooks), assignments list with per-task progress, "Start offboarding" flow (user picker + pack picker via `useInitiateOffboarding`). Use `Dialog`/Button + proper loading/empty/error states — do not inherit the onboarding page's known gaps. Tests for any route changes. Commit.
- [ ] **Task 4.2:** `/team` row menu: "Start offboarding…" (gated by the `offboarding.create` feature) opening the same dialog (shared component). Commit.
- [ ] **Task 4.3:** Deactivate↔separation: in both deactivate confirms (team row + staff-profile quick action), warn when the target has no `Separation` record, linking to the profile's Separation tab. Server provides `hasSeparation` where the client needs it (smallest API change that serves both). Tests. Live-check, commit, phase PR.

---

## Chunk 5: Phase 5 — Roster command centre (`/roster`)

*(Rule 10: expand tasks against current code at phase start.)*

**Existing plumbing:** `ServiceWeeklyShiftsGrid`, `useRosterShifts`, open-shift APIs (`/open`, claim/release), `ShiftEditModal` (currently hard-requires userId), `useOpenShifts`, EH leave admin endpoint.

- [ ] **Task 5.1:** New page `/roster` for owner/head_office/admin + member (member auto-scoped to their service): week picker (local-date maths), per-service collapsible sections reusing `ServiceWeeklyShiftsGrid`.
- [ ] **Task 5.2:** Unassigned shifts visible: the grid renders an "Open shifts" row pinned first instead of skipping `!shift.userId` rows; open-shift chips show claim counts if cheaply available.
- [ ] **Task 5.3:** Create open shifts: `ShiftEditModal` gains an "Open shift (no assignee)" option; POST `/api/roster/shifts` accepts null `userId`, with cert/induction guards deferred to claim time (verify the claim route enforces both — it should already). Route tests updated.
- [ ] **Task 5.4:** Leave overlay: staff rows show an "On leave" chip on days inside approved internal leave (new batch endpoint, admin+member gated, tested). EH-pending overlay only if the data supports per-day granularity cheaply — otherwise note it as out of scope in this doc.
- [ ] **Task 5.5:** Cross-centre staff: include `UserServiceMembership` members in the grid's staff list (extend `/api/team?service=` or the grid's source — pick the smaller change after reading). Nav + role-permissions wiring. Tests + live check + phase PR.

---

## Chunk 6: Phase 6 — Timesheet approval hygiene

*(Rule 10 applies.)*

- [ ] **Task 6.1:** Bulk approve: `POST /api/timesheets/bulk-approve` `{ids}` (zod, cap 50) approving only `submitted` sheets not submitted by the caller; returns `{approved, skipped: [{id, reason}]}`; share an extracted `approveTimesheet()` helper with the single route so notifications/activity stay identical. Tests: auth/role/self-skip/mixed/happy. UI: row checkboxes + "Approve selected (N)" with skip-reason toast.
- [ ] **Task 6.2:** Wire the orphaned `useUpdateTimesheetEntry`/`useDeleteTimesheetEntry` into `TimesheetDetail`: per-entry edit dialog + delete with ConfirmDialog, allowed only on `draft`/`submitted` sheets — and ENFORCE that server-side on the entry PATCH/DELETE routes (add 409 on approved/exported; tests).
- [ ] **Task 6.3:** Honest export: hide "Export to Xero" behind an env flag defaulting off; provide a real "Export CSV" of the sheet's entries via the existing csv-export helper; fix the page header copy. Tests, live-check, phase PR.

---

## Chunk 7: Phase 7 — Hire → employee conversion

*(Rule 10 applies.)*

- [ ] **Task 7.1:** `POST /api/recruitment/candidates/[id]/convert` (roles aligned with POST /api/users): creates the User (role from zod enum, default `staff`, optional `newStarter`+`startDate`), stamps `RecruitmentVacancy.filledByUserId` and the candidate's stage, optionally assigns an onboarding pack via a helper shared with `/api/onboarding/assign` (P2002 → 409). Linking the candidate to the User may need a nullable `User.candidateId` column — decide at phase start; if a migration is added, follow the local-dev DB rules in CLAUDE.md. Duplicate email → 409 with existing user id. Full route tests.
- [ ] **Task 7.2:** UI: "Convert to employee" on accepted candidates in `VacancyDetailPanel` → dialog (role, start date, onboarding pack, optional invite email reusing the AddStaffModal invite path — extract, don't duplicate). Success toast links to `/staff/[id]`. Live-check + phase PR.

---

## Chunk 8: Phase 8 — Staff-profile stub wiring (Policies / Induction / Forms)

*(Rule 10 applies.)*

- [ ] **Task 8.1:** `staff/[id]/page.tsx` loader: add the target user's policy acknowledgements (with document title/version), induction/essential LMS enrollments with completion summaries, and form submissions — all inside the existing `canAccessProfile` guard.
- [ ] **Task 8.2:** `DocumentsSection`: replace the three "Coming in next release" stubs with read-only lists (Policies with unacknowledged shown amber; Induction per-course status/score plus practical sign-off state; Forms with status chips). Empty states each.
- [ ] **Task 8.3:** The 9-box and management-notes stubs: either build or relabel honestly — decide with the user before this task; default is an honest "Planned" label. tsc/tests/live + phase PR.

---

## Chunk 9: Phase 9 — Certificate requirements matrix

*(Rule 10 applies.)*

- [ ] **Task 9.1:** Org-settings JSON (no new table): `compliance.requiredCertsByRole` (strict zod, cert types from the existing list; sensible defaults for staff/member; empty for office roles). Settings → Organisation gets a role×type checkbox matrix (owner/head_office).
- [ ] **Task 9.2:** Consume via one shared `getRequiredCertTypes(role, orgSettings)` lib: staff `/compliance` shows "Required for your role" first with the rest collapsed; the `/my-portal` compliance tile and the staff-profile ring count required-only. Lib + zod tests. Live-check both roles + phase PR.

---

## Chunk 10: Phase 10 — HR reports pack + availability + salary history

*(Rule 10 applies.)*

- [ ] **Task 10.1:** `/workforce-reports` "Workforce" tab: headcount by role/service/employment type, starters & leavers per month (12-mo), tenure distribution, training completion %, cert-expiry 30/60/90 outlook. One summary API (owner/head_office/admin), CSV export per section, charts per `src/components/charts/` conventions. Route tests.
- [ ] **Task 10.2:** Availability: new `StaffAvailability` model (userId, weekday, available, optional start/end "HH:MM", note; unique userId+weekday) + migration. Staff editor on `/profile`; roster grid shows an "Unavailable" hint on those days (batched with the leave overlay fetch). Self-scoped GET/PUT API with tests.
- [ ] **Task 10.3:** Salary history: `EmploymentContract.classification` (nullable) migration; Pay & compensation lists ALL contracts desc (rate/classification/dates) instead of `findFirst`; issue/upload forms gain the optional classification field.
- [ ] **Task 10.4:** Program close-out: full test/tsc/lint sweep, live sweep (staff mobile: home/my-day/pay/leave/expenses/notifications; owner: roster/timesheets/offboarding/reports/staff file), update CLAUDE.md with the new routes/conventions, final PR, summary to the user.

---

## Execution log

*(Append REAL events only — dates, commit hashes, PR links — as they happen.)*

- 2026-09-04: Plan created. Nothing executed yet.
