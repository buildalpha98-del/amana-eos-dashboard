# Staff Portal v2 — 10/10 Program Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking. Update the Execution log at the bottom as phases land — with REAL commit hashes and PR numbers only, recorded after they exist.

**Goal:** Take the staff portal (educator side) and HR management side from "strong bones" to 10/10: a phone-first five-tab staff app (Home / My Day / Pay / Leave / Me), a real notifications loop with push, and closure of the four broken HR workflow legs (roster command centre, offboarding UI, hire→employee conversion, timesheet approval hygiene), plus compliance/reporting depth.

**Architecture:** Reshape the staff surface from one mega-page (`/my-portal`, ~1,400 lines) into a hub plus three dedicated destinations (`/my-pay`, `/my-leave`, `/my-expenses`) that REUSE the existing, well-built Employment-Hero-backed cards (`src/components/my-portal/*`) rather than rewriting their data layers. The mobile tab bar becomes role-aware. Everything follows the visual contract in the design mockups (Design Source below). HR phases wire existing-but-orphaned backends (offboarding hooks, timesheet entry mutations, open-shift APIs) into UI rather than building new backends.

**Tech Stack:** Next.js 16 app router, Prisma 5.22 (new migrations only where a phase says so), React Query, Tailwind tokens from `src/app/globals.css`, Vitest, existing `withApiAuth`/`ApiError`/`fetchApi` conventions.

**Design source of truth:** `docs/design/staff-portal-v2/*.dc.html` (checked into this repo; also published at https://claude.ai/code/artifact/252516c2-5c19-4c85-a687-05d75f0c0d09). Translate the mockups' inline styles into design-system tokens (`bg-card`, `text-muted`, `border-border`, `bg-brand`, `text-2xs`, `shadow-warm*`, radius tokens) — NEVER hex-in-className outside `src/components/charts/`.

**Schema-change procedure (Phases 7 and 10):** the local dev DB is maintained with `npx prisma db push` (CLAUDE.md), so `prisma migrate dev` will report drift. Procedure: edit `prisma/schema.prisma` → `npx prisma db push` locally → generate the production migration file with schema-to-schema `prisma migrate diff` (the repo's established practice — see the memory note `reference_local-db-and-worktrees`), placed under `prisma/migrations/`. Never point any command at `PROD_DATABASE_URL`.

**Live-check credentials prerequisite:** `test-staff@` / `test-owner@amana-test.local` come from `seedTestData()` (`src/lib/test-utils/seed-test-data.ts`). They already exist in the local dev DB in this environment; if absent, run `seedTestData()` against `amana_eos_dev` before the rule-6 sweeps.

**Leave systems note (affects Phases 1 and 5):** there are TWO leave systems. Staff apply via Employment Hero (`/api/my-portal/leave/*` — what `/my-leave` fronts). The internal `/leave` module holds the pre-switchover backlog and internal `LeaveRequest` rows. Phase 5's roster overlay reads internal approved leave and therefore will NOT show EH-only leave — Task 5.4 must surface that limitation in the UI copy or additionally pull EH approved upcoming leave from the existing admin endpoint if per-day granularity is available.

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

- [x] **Step 1:** Read `PageHeader` — if it supports title+description+primaryAction without EOS chrome, use it directly on the new pages and create nothing. Record the decision in the first commit message of Task 1.2.

### Task 1.2: `/my-pay` — the Pay destination

**Files:**
- Create: `src/app/(dashboard)/my-pay/page.tsx` (thin shell) + `loading.tsx`
- Create: `src/components/my-pay/MyPayContent.tsx`
- Create: `src/components/my-pay/PayslipHeroCard.tsx`
- Create: `src/hooks/useMyPayslips.ts` (lift the query out of `MyPayslipsCard`)
- Modify: `src/components/my-portal/MyPayslipsCard.tsx` (consume the lifted hook)
- Test: `src/__tests__/components/my-pay.test.tsx`

- [x] **Step 1:** Create `useMyPayslips` by lifting the query (queryKey `["my-payslips"]`, `meta.suppressGlobalErrorToast`, terminal-404/503 retry predicate) out of `MyPayslipsCard`; card and page share it. Write a failing render test for `PayslipHeroCard`: fixture must satisfy the full `PayslipSummary` type (including `id` and `payPeriodStarting`). It shows `$1,284.60`, "net", a gross/**deductions**(=gross−net — NOT "tax": the delta includes super sacrifice etc.)/hours line, View link at `/api/my-portal/payslips/{payRunId}/download` and Download at the same URL with `?download=1`.
- [x] **Step 2:** Run the test, verify it fails. Implement `PayslipHeroCard` per `Pay.dc.html`/`MobilePay.dc.html`: dark `bg-sidebar` hero card, headline via `font-heading`, accent CTA (`bg-accent` with dark text), responsive `sm:` split. Verify pass.
- [x] **Step 3:** `MyPayContent`: hero (latest slip) + totals strip computed client-side from returned slips (sum gross/net/hours; label honestly "across the payslips shown" — the API returns recent slips, do NOT claim FY totals) + history list (reuse the row layout from `MyPayslipsCard`, full-width). Same not-linked/503/empty states and copy as the card.
- [x] **Step 4:** Page shell mirrors `/my-portal/page.tsx` conventions. Live-check as staff at 375px and desktop. Commit.

### Task 1.3: `/my-leave` — the Leave destination

**Files:**
- Create: `src/app/(dashboard)/my-leave/page.tsx`, `loading.tsx`
- Create: `src/components/my-leave/MyLeaveContent.tsx`
- Note: `ApplyLeaveModal` is ALREADY exported from `MyLeaveRequestsCard.tsx` — import it, modify nothing.

- [x] **Step 1:** `MyLeaveContent` per `Leave.dc.html`/`MobileLeave.dc.html`: balances row (reuse `MyLeaveBalanceCard` data logic; restyle container), Apply CTA opening the EXISTING `ApplyLeaveModal`, requests list. Not-linked state = one full-page friendly explanation, not multiple cards of it. Do not fork the cards.
- [x] **Step 2:** Live-check both viewports incl. opening the apply modal (EH may 503 locally — verify that state renders cleanly). Commit.

### Task 1.4: `/my-expenses` — Reimbursements destination

**Files:**
- Create: `src/app/(dashboard)/my-expenses/page.tsx`, `loading.tsx`
- Create: `src/components/my-expenses/MyExpensesContent.tsx`
- Modify: `src/components/my-portal/MyExpensesCard.tsx` (export the submit modal)

- [x] **Step 1:** Per `Expenses.dc.html`/`MobileExpenses.dc.html`: "snap your receipt" hero (buttons open the existing submit modal; add `capture="environment"` to the file input for phones), totals strip (pending sum + paid sum from statuses), claims list with the Submitted → Approval → In-your-pay pipeline strip on pending rows. Live-check, commit.

### Task 1.5: Role-aware mobile tab bar + nav/permissions wiring

**Files:**
- Modify: `src/components/layout/MobileTabBar.tsx`
- Modify: `src/lib/nav-config.ts` (My Portal section: My Pay / My Leave / My Expenses, `core: ["staff", "member", "marketing"]`; keep the section contiguous)
- Modify: `src/lib/role-permissions.ts` (`allPages` + staff, member, marketing lists)
- Test: extend existing role-permission tests if present

- [x] **Step 1:** Tab bar (LOCKED decisions from plan review): the bar renders 4 tabs + the required More button (More opens the sidebar via `onMorePress` from `(dashboard)/layout.tsx` — it must stay; 6 slots would overflow 375px). Staff/member/marketing set: `[Home:/my-portal, My Day:/my-day, Pay:/my-pay, Leave:/my-leave]` + More ("Me"/profile and Expenses are reached via Home tiles and the sidebar). Other roles keep the current set. `MobileTabBar` has no `useSession` today — add the import; while the session loads render the generic set. Icons: Wallet, CalendarDays (lucide).
- [x] **Step 2:** Wiring (LOCKED): pages go into `allPages` (so office roles can open them by URL — they are employees too) AND into staff/member/marketing lists; nav items get `roles: ["staff", "member", "marketing"]` so the sidebar only shows them to staff-tier roles (`filterNavByRole` otherwise surfaces them to owners via allPages). Keep the My Portal section contiguous (`nav-config.ts:139-155`). Run any role-permission vitest files. Live-check: staff sees new tabs + sidebar items; owner's nav unchanged but URLs open. Commit.

### Task 1.6: `/my-portal` becomes the Home hub

**Files:**
- Modify: `src/app/(dashboard)/my-portal/page.tsx`
- Modify: `tests/e2e/staff-portal.spec.ts` — the spec that actually targets `/my-portal`, with loose regexes (`/leave|balance|annual/i`, `getByRole("button", {name: /request leave|new request/i})`) that will break or go vacuous when sections move. Repoint at the new routes; heed CLAUDE.md E2E gotcha #2 (substring matches → strict-mode traps).

- [x] **Step 1:** Per `Main.dc.html`/`MobileHome.dc.html`, restructure the TOP of the page: greeting (existing), next-shift/clock hero (compose existing `MyClockCard` + upcoming-shift data — no duplicate queries), four glance tiles (Last pay → `/my-pay`, Annual leave → `/my-leave`, Reimbursements → `/my-expenses`, Compliance → `/compliance`) reusing the respective hooks with a "—" not-linked fallback, quick-actions row, one consolidated "Needs your attention" card (pending policies / swaps / cert expiry — data already fetched on this page).
- [x] **Step 2:** REMOVE the moved sections (payslips, leave balance+requests, expenses). Keep: profile summary, quiet hours, D&I, kiosk PIN, notification prefs, sessions, compliance summary, onboarding/offboarding progress. Update E2E selectors that pointed at removed sections to the new routes; update Getting Started hrefs if any pointed at moved anchors.
- [x] **Step 3:** Full phase verification (rule 6). Commit. Open PR "feat: staff portal v2 phase 1 — mobile shell + Pay/Leave/Expenses destinations".

---

## Chunk 2: Phase 2 — My Day on-shift hero

**Files:**
- Modify: `src/app/(dashboard)/my-day/page.tsx`
- Create: `src/components/my-day/OnShiftHero.tsx`
- Modify: `src/components/my-portal/MyClockCard.tsx` (export `fmtElapsed`)

- [x] **Task 2.1:** Per `MobileMyDay.dc.html`: when clocked in, render `OnShiftHero` — "On shift · clocked in HH:MM" with a green dot, elapsed timer recomputed per minute, Clock out via `useClockOut`. CACHE NOTE: the clock query key is `["my-shifts", userId, from, to]` — export the range/key builder AND `fmtElapsed` from `MyClockCard.tsx` and reuse both, or the hero silently double-fetches with a mismatched window (`from`/`to` must be built with `toLocalIsoDate`). Not clocked in → current layout stands.
- [x] **Task 2.2:** Roll-call callout: `bg-accent` card above checklists — "Roll call · N children not yet marked in" when the Now-card data exposes booked vs present counts; plain Roll Call row when counts unavailable. Link to the existing roll-call deep link.
- [x] **Task 2.3:** Session snapshot strip (in care / booked / educators on) from the same data; hidden when serviceless. Verify live as staff (zeros locally are fine — check layout), tsc/lint/tests, commit. PR may batch with Phase 3.

---

## Chunk 3: Phase 3 — Notifications inbox + push

**Existing plumbing (corrected by plan review):** `UserNotification` model; ALL client endpoints live in `src/hooks/useNotifications.ts` — `GET /api/notifications` (hardcoded take 50, no cursor), `/api/notifications/unread-count`, `/api/notifications/[id]/mark-read`, and **`/api/notifications/mark-all-read` which ALREADY EXISTS** (do not build a duplicate). `/api/notifications/dismiss` and `/log` also exist. Push: `src/lib/push/register.ts` exports `getPushStatus`, `registerParentServiceWorker`, `subscribeParentPush` (NOT `registerPush`); `src/lib/push/webPush.ts` has `sendPush`/`sendPushToContact` but **no `sendPushToUser`** — staff notification writers only do `userNotification.create`, so without new fan-out work, staff who enable push receive nothing, ever.

- [x] **Task 3.1:** Cursor pagination on `GET /api/notifications` (`?cursor=&limit=`, max 50; keep the default-call shape backward compatible for the popover). Route tests. Commit.
- [x] **Task 3.2:** Page `/notifications`: Today / Earlier groups, unread dot, whole-row link to `n.link` (linkless rows non-navigating), "Mark all read" wired to the EXISTING mark-all-read endpoint via `useNotifications`, `EmptyState`, cursor "Load more". Decide and note whether `dismiss` gets a row affordance (default: yes, reuse the existing endpoint). Nav (My Portal section, core all roles) + role-permissions (all roles). Point the Getting Started notifications item at `/notifications`. Commit.
- [x] **Task 3.3a (security, do first):** `POST /api/push/subscribe` is `withApiHandler` and trusts a client-supplied `userId` — any caller can register a subscription against any user. Split the staff path onto `withApiAuth` taking userId from the session (keep the parent/contact path working — read how the parent flow authenticates before touching it). Route tests. Commit.
- [x] **Task 3.3b:** Staff push delivery: add `sendPushToUser(userId, payload)` to `src/lib/push/webPush.ts` (subscriptions where `userId`), and fan it out from the shared user-notification creation path (find the common helper the writers use — cascade-notify, open-shift-notify, creative-request notify, term-pack, meeting-digest — or add one thin `notifyUser()` they all call; keep it swallow-and-log). Unit test the fan-out. Commit.
- [x] **Task 3.3c:** Push opt-in card on `/my-portal` for staff-tier roles — renders only when `getPushStatus()` says unsubscribed and permission is `default`; "Enable notifications" calls `registerParentServiceWorker()` + `subscribeParentPush()` (decide at implementation whether to rename the `*Parent*` helpers now that staff use them — smallest honest change wins); dismissal persisted in localStorage. Commit.
- [x] **Task 3.4:** PWA polish (LOCKED: `start_url` STAYS `/dashboard` — the manifest is role-agnostic and `sw.js` pre-caches the dashboard shell; changing it would strand office installs and stale caches). Add manifest `shortcuts` (My Day, Pay, Notifications) only. Verify the manifest link in the root layout. Live-check + tests. Open the phase PR.

---

## Chunk 4: Phase 4 — Offboarding UI + deactivate↔separation link

**Existing plumbing:** `src/hooks/useOffboarding.ts` (6 hooks, zero importers), `/api/offboarding/{packs,packs/[id],assign,seed}`, `offboarding.*` features in role-permissions, staff-side progress card on `/my-portal`, `SeparationTab` on the staff profile.

- [x] **Task 4.1:** `/onboarding` gets an "Offboarding" tab: packs CRUD panel (mirror `OnboardingPacksTab` structure under `src/components/offboarding/`, swap in the offboarding hooks — NOTE: `useOffboarding.ts` has no update/delete pack hooks; the routes support PATCH/DELETE on `packs/[id]`, so add `useUpdateOffboardingPack`/`useDeleteOffboardingPack` first), assignments list with per-task progress, "Start offboarding" flow (user picker + pack picker via `useInitiateOffboarding`). Use `Dialog`/Button + proper loading/empty/error states — do not inherit the onboarding page's known gaps. Tests for any route changes. Commit.
- [x] **Task 4.2:** `/team` row menu: "Start offboarding…" (gated by the `offboarding.create` feature) opening the same dialog (shared component). Commit.
- [x] **Task 4.3:** Deactivate↔separation: in both deactivate confirms (team row + staff-profile quick action), warn when the target has no **`SeparationRecord`** (that is the Prisma model name — NOT `Separation`), linking to the profile's Separation tab. Server provides `hasSeparation` where the client needs it (smallest API change that serves both). Tests. Live-check, commit, phase PR.

---

## Chunk 5: Phase 5 — Roster command centre (`/roster`) — EXPANDED per scout (rule 10 done)

**Scout corrections:** PATCH /api/roster/shifts/[id] does NOT accept null userId (zod line 18) — route work IS needed; `@@unique([serviceId,date,staffName,shiftStart])` + staffName "Open shift" means two open shifts at the same time P2002-500s — catch → 409; there is no claim model (cut claim counts); LeaveRequest.serviceId is nullable — key the overlay endpoint on userIds, never serviceId; grid has no weekStart prop — add one + extract a WeekPicker; grid+modal staff source must BOTH move to useServiceStaff (memberships included) in the same change, and /api/services/[id]/staff-certificates must widen to userId IN (...) or cross-centre staff render cert-less (compliance regression). Two pre-existing security holes to fix in this phase's PR: /api/leave/calendar (no roles option + optional serviceId = org-wide leave leak to staff) and /api/services/[id]/staff (no authz, emails to every role).

- [x] **Task 5.1:** Grid becomes drivable: `ServiceWeeklyShiftsGrid` gains optional `weekStart`/`onWeekChange` props (internal state stays for the service-detail tab); extract `src/components/roster/WeekPicker.tsx` (controlled) from its lines 276-297 using `getWeekStart`/`toLocalIsoDate`; fix the file's three `toISOString().split` violations (lines 58/79/234) while in there. New `/roster` page (server shell per roster/me conventions + loading.tsx): one WeekPicker, per-service collapsible sections via `useServices` (member scoping free via getCentreScope), grids LAZY-MOUNTED on expand (5 queries per grid), pass `serviceName` (already-plumbed dead prop — wire it). Nav: People section next to Timesheets, roles owner/head_office/admin/member, core true; role-permissions: allPages + member list + permissionsTable row + a comment on the /roster prefix-match granting /roster/me + /roster/swaps.
- [x] **Task 5.2:** Remove `if (!shift.userId) continue` (grid line 123); render an "Open shifts" pinned row from the already-returned null-userId shifts (ShiftChip handles null). DECISION (locked): open shifts do NOT count toward ratio numerators once visible — add the null-skip to ratioCountsByDay (lines 138-147) with a comment; an unfilled slot must not make a cell look compliant.
- [x] **Task 5.3:** Open-shift create/edit: modal sentinel option `__open__` → payload userId null (create AND edit); drop the `required` on the staff select; PATCH route: `userId: z.string().min(1).nullable()`, staffName reset to "Open shift" when unassigning; POST+PATCH catch P2002 → 409 "An open shift already exists at this time". Route tests for null-edit, unassign, and the 409. (Record follow-up: replace the staffName-based unique constraint properly.) ShiftEditModal Rule-4 debt (raw div dialog, window.confirm) — convert to ui/Dialog + ConfirmDialog in this task since we're rewriting its form anyway.
- [x] **Task 5.4:** New `GET /api/roster/leave?userIds=&from=&to=` (zod csv→array max 200, roles owner/head_office/admin/member with member intersected against their centre's staff; select userId/leaveType/startDate/endDate/isHalfDay; status leave_approved only). `useRosterLeave` hook; grid overlays an "On leave" (½ day variant) chip on covered days; legend: "Internal leave only — leave applied in Employment Hero won't appear here" (EH admin endpoint is org-wide/unpaginated/admin-only — recorded as out of scope). SECURITY FIX in same commit: add roles + mandatory scoping to /api/leave/calendar (keep /leave page working — it passes serviceId; gate to its roles).
- [x] **Task 5.5:** Grid + ShiftEditModal staff source → `useServiceStaff` (primary + memberships, isActive filter, userId field rename); widen /api/services/[id]/staff-certificates to `userId IN (...)` so cross-centre staff keep cert shields; SECURITY FIX: add assertServiceAccess-style gating to /api/services/[id]/staff and stop returning email to non-admin callers. Tests for both route changes. Live check + phase PR.

## Chunk 6: Phase 6 — Timesheet approval hygiene

*(Rule 10 applies.)*

- [x] **Task 6.1:** Bulk approve: `POST /api/timesheets/bulk-approve` `{ids}` (zod, cap 50) approving only `submitted` sheets not submitted by the caller; returns `{approved, skipped: [{id, reason}]}`; share an extracted `approveTimesheet()` helper with the single route so notifications/activity stay identical. Tests: auth/role/self-skip/mixed/happy. UI: row checkboxes + "Approve selected (N)" with skip-reason toast.
- [x] **Task 6.2:** Wire the orphaned `useUpdateTimesheetEntry`/`useDeleteTimesheetEntry` (`src/hooks/useTimesheets.ts:288,322`) into `TimesheetDetail` — which is NOT its own file: it lives inside `src/app/(dashboard)/timesheets/page.tsx`. The entry routes are `src/app/api/timesheet-entries/[id]/route.ts` (PATCH/DELETE — note `/api/timesheets/[id]/entries/` is POST-only). Per-entry edit dialog + delete with ConfirmDialog, allowed only on `draft`/`submitted` sheets — and ENFORCE that server-side on the entry PATCH/DELETE routes (add 409 on approved/exported; tests).
- [x] **Task 6.3:** Honest export: hide "Export to Xero" behind an env flag defaulting off; provide a real "Export CSV" of the sheet's entries via the existing csv-export helper; fix the page header copy. Tests, live-check, phase PR.

---

## Chunk 7: Phase 7 — Hire → employee conversion

*(Rule 10 applies.)*

- [x] **Task 7.1:** `POST /api/recruitment/candidates/[id]/convert` (roles aligned with POST /api/users): creates the User (role from zod enum, default `staff`, optional `newStarter`+`startDate`), stamps `RecruitmentVacancy.filledByUserId` and the candidate's stage, optionally assigns an onboarding pack via a helper shared with `/api/onboarding/assign` (P2002 → 409). Linking the candidate to the User may need a nullable `User.candidateId` column — decide at phase start; if a migration is added, follow the local-dev DB rules in CLAUDE.md. Duplicate email → 409 with existing user id. Full route tests.
- [x] **Task 7.2:** UI: "Convert to employee" on accepted candidates in `VacancyDetailPanel` → dialog (role, start date, onboarding pack, optional invite email reusing the AddStaffModal invite path — extract, don't duplicate). Success toast links to `/staff/[id]`. Live-check + phase PR.

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
- [ ] **Task 9.2:** Consume via one shared `getRequiredCertTypes(role, orgSettings)` lib. CLIENT ACCESS RULE: staff cannot read `GET /api/org-settings` (role-gated) — expose `compliance.requiredCertsByRole` on the client-safe `GET /api/org-settings/config` slice, and resolve server-side via `getOrgSettings()` (60s cache) everywhere else. Staff `/compliance` shows "Required for your role" first with the rest collapsed; the `/my-portal` compliance tile and the staff-profile ring count required-only. Lib + zod tests. Live-check both roles + phase PR.

---

## Chunk 10: Phase 10 — HR reports pack + availability + salary history

*(Rule 10 applies.)*

- [x] **Task 10.1:** `/workforce-reports` "Workforce" tab: headcount by role/service/employment type, starters & leavers per month (12-mo), tenure distribution, training completion %, cert-expiry 30/60/90 outlook. One summary API (owner/head_office/admin), CSV export per section, charts per `src/components/charts/` conventions. Route tests.
- [ ] **Task 10.2:** Availability: new `StaffAvailability` model (userId, weekday, available, optional start/end "HH:MM", note; unique userId+weekday) + migration. Staff editor on `/profile`; roster grid shows an "Unavailable" hint on those days (batched with the leave overlay fetch). Self-scoped GET/PUT API with tests.
- [ ] **Task 10.3:** Salary history: `EmploymentContract.classification` (nullable) migration; Pay & compensation lists ALL contracts desc (rate/classification/dates) instead of `findFirst`; issue/upload forms gain the optional classification field.
- [ ] **Task 10.4:** Program close-out: full test/tsc/lint sweep, live sweep (staff mobile: home/my-day/pay/leave/expenses/notifications; owner: roster/timesheets/offboarding/reports/staff file), update CLAUDE.md with the new routes/conventions, final PR, summary to the user.

---

## Execution log

*(Append REAL events only — dates, commit hashes, PR links — as they happen.)*

- 2026-09-04: Plan created. Nothing executed yet.
- 2026-09-04: Plan review applied (21 findings). Phase 1 Tasks 1.2-1.4 committed: ef48e1d6, e7667418, ed55d72a.
- 2026-09-04: Phase 1 complete on feat/staff-portal-v2 — commits ef48e1d6 (my-pay), e7667418 (my-leave), ed55d72a (my-expenses), 521d918a (tab bar + wiring), f3a7ba75 (Home hub + E2E repoint + cert-status DST fix). Full suite 6439/6439 green. Owner-side live click-through deferred (browser pane closed); code-level owner checks green.
- 2026-09-04: Phases 2+3 complete — 246e9a79 (my-day hero/snapshot/callout; MyDayNowCard deleted), d3ca0351 (cursor pagination, secured push subscribe + DELETE, sendPushToUser + notifyUsers fan-out; follow-up: route-level notification writers still lack push), 9e2de8cb (inbox, opt-in card, manifest shortcuts; dismiss omitted — endpoint is digest-only). Suite 6459 green. Live-checked /my-day + /notifications as staff.
- 2026-09-04: Phase 4 complete — offboarding tab/action/dialog, separation warning, quick-action GET (+5 tests). Suite 6478 green. Admin visual pass deferred (browser pane unresponsive to clicks — environmental).
- 2026-09-04: Task 5.3 + Phase 8 shipped in PR #280 (merged). Phase 5 complete — 136286bf (/roster page, open-shifts row, ratio honesty), ce18a74f (RosterShift unique key → userId; migration 20260904230000 with dedupe guard; OWNA ingest + copy-week rewritten), finale commit (leave overlay, cross-centre staff via useServiceStaff, cert-shield widening, authz fixes on /api/leave/calendar + /api/services/[id]/staff). Phase 6 complete — d98a8bcf (bulk approve, entry editing + server lock, honest export; live-verified by its implementer). Suite 6529 green.
- 2026-09-05: Phase 7 complete (agent stalled post-tests; orchestrator finished verification, fixed 3 mock typings). Suite 6544 green.
