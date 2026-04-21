# Sub-project 4a — Services / Daily Ops Rebuild Part 1

**Date**: 2026-04-22
**Status**: Approved (user confirmed scope + adjustments)
**Parent roadmap**: [`2026-04-20-dashboard-bugfix-roadmap.md`](./2026-04-20-dashboard-bugfix-roadmap.md)
**Predecessors**: #1 P0 Bugs (`dd0a1d9`), #2 Hygiene Sweep (`2ca8289`), #3a Staff Part 1 (`39164df`), #3b Staff Rostering (`38fd0b2`), #5 Documents/Policies/Compliance (`c3cf585`), #7 Portal & Enrolment CSV export (`3a8ee1e`), #9 Leadership/Scorecard/Pulse admin (`cc11d10`).

## Overview

The Services module has 6 tab groups and 19 components, all functional but shallow compared to OWNA (the childcare management system the dashboard is replacing). Part 1 of the Services / Daily Ops Rebuild brings OWNA-level depth to the most operational parts: the service facts, an editable weekly attendance grid that supports in-view sign-in/out AND adding children not yet in the week's roster, and a full-page child detail view covering everything a coordinator needs to act on a child in one place.

Part 2 (Sub-project 4b, deferred) tackles: incidents tab, photos/gallery, parent daily feed, real-time updates, remaining component decomposition (ProgramTab 1314 lines, AttendanceTab 856 lines, BudgetTab 818 lines).

## Baseline

- Main at `ba8ab55` (post #5/#7/#9 merges)
- ~1700+ tests passing (baseline was 1298 before #5/#7/#9 landed — exact count to be captured in worktree setup)
- 0 `tsc --noEmit` errors
- `/services/[id]/page.tsx` (504 lines) has 6 tab groups + sub-pill routing via `?tab=&sub=`
- `ServiceTodayPanel.tsx` (414 lines) exists but currently renders inside overview card, not as a first-class tab
- `Child` model has expanded profile fields (medicalConditions, dietaryRequirements, photo, ownaChildId for legacy sync)
- `Service` model has capacity + rates + marketing fields; NO approval numbers, session times structure, or casual booking settings

## In scope — 13 stacked commits

| # | Commit subject | Category | Files (approx.) |
|---|---|---|---|
| 1 | `feat(schema): Service approval numbers + sessionTimes + casualBookingSettings` | Schema | 3 (schema + migration + generated) |
| 2 | `feat(overview): display service approval numbers + session times` | Feature | 3 |
| 3 | `refactor(overview): decompose ServiceOverviewTab 1200→5 focused children` | Cleanup | ~6 |
| 4 | `feat(roll-call): daily/weekly/monthly view toggle + routing` | Feature | 3 |
| 5 | `feat(api): weekly roll-call + attendance CRUD routes` | API | ~8 (routes + tests) |
| 6 | `feat(roll-call): editable weekly grid with sign-in/out + add-child action` | Feature | ~7 |
| 7 | `feat(roll-call): monthly view with per-day drill-down` | Feature | 3 |
| 8 | `feat(child-page): new /children/[id] full-page detail route (Details + Room tabs)` | Feature | ~8 |
| 9 | `feat(child-page): Relationships + Medical tabs on child page` | Feature | ~5 |
| 10 | `feat(child-page): Attendances tab + export` | Feature | ~4 |
| 11 | `feat(services-list): children list filters + CCS badge + parent display` | Feature | ~4 |
| 12 | `feat(casual-bookings): Casual Bookings Settings tab under Daily Ops` | Feature | ~5 |
| 13 | `feat(ia): Today as first-class tab + reorder + default landing` | Feature | 3 |

---

### Commit 1 — Schema additions

New fields on `Service` model (all nullable, additive):

```prisma
model Service {
  // ... existing fields ...

  serviceApprovalNumber  String?   // e.g. "SE-XXXXXXXX" (ACECQA service approval)
  providerApprovalNumber String?   // e.g. "PR-XXXXXXXX" (ACECQA provider approval)
  sessionTimes           Json?     // { bsc: { start: "06:30", end: "08:45" }, asc: { start: "15:00", end: "18:30" }, vc: { start: "08:00", end: "18:00" } }
  casualBookingSettings  Json?     // see shape below
}
```

`casualBookingSettings` JSON shape:
```ts
{
  bsc: { enabled: boolean; fee: number; spots: number; cutOffHours: number; days: ("mon"|"tue"|"wed"|"thu"|"fri"|"sat"|"sun")[] };
  asc: { ...same };
  vc:  { ...same };
}
```

Defaults (set client-side when editor opens for the first time): `enabled: false, fee: <centre's existing casual rate>, spots: 10, cutOffHours: 24, days: ["mon"..."fri"]`.

**Zod validation** for both JSON fields lives in `src/lib/service-settings.ts` (new) alongside TypeScript types, so API routes + UI share one source of truth.

**Migration**: `npx prisma migrate dev --name add_service_approval_and_session_times`. Additive only.

---

### Commit 2 — Overview tab: display new fields

Add a "Service approvals" and "Session times" card to the Overview tab. Admin/coordinator sees an Edit button that opens a modal to update all four new fields (plus existing approval numbers if we later absorb anything from the marketing fields already there).

Visible to everyone with access to the service (read-only for staff).

---

### Commit 3 — Decompose ServiceOverviewTab

Current `ServiceOverviewTab.tsx` is 1200 lines. Split into:
- `OverviewHeader.tsx` — hero card with name, code, status
- `ServiceInfoCard.tsx` — address, contact, approvals, session times (new)
- `CapacityCard.tsx` — capacity + attendance targets
- `RatesCard.tsx` — daily + casual rates
- `MarketingCard.tsx` — school population, targets, launch phase

Parent `ServiceOverviewTab.tsx` becomes a thin composition (~200 lines). No feature changes, pure decomposition.

---

### Commit 4 — Roll Call view toggle

Add `?rollCallView=daily|weekly|monthly` query param synced to state on `ServiceRollCallTab.tsx`. Header button group toggles between the 3 views. Daily view = existing implementation (untouched).

---

### Commit 5 — Weekly roll-call + attendance CRUD API

New API routes (all `withApiAuth`, admin/coord scoped):

- `GET /api/services/[id]/roll-call/weekly?weekStart=YYYY-MM-DD` — returns all children attending that week at the service, with per-day per-session status (booked / signed-in / signed-out / absent / none), their bookings, their existing `AttendanceRecord`s.
- `POST /api/services/[id]/attendance` — create attendance (body: `{ childId, date, sessionType, signInAt?, signOutAt?, notes? }`)
- `PATCH /api/services/[id]/attendance/[attendanceId]` — edit sign-in/out times, notes, session type
- `DELETE /api/services/[id]/attendance/[attendanceId]` — mark absent / remove
- `GET /api/services/[id]/roll-call/monthly?month=YYYY-MM` — per-day totals for calendar view
- `GET /api/services/[id]/children/enrollable?weekStart=YYYY-MM-DD` — children in the service not yet on this week's roster (for the "+ add child" flow)

Zod validated, tests for auth/happy/403/404/409 per route.

---

### Commit 6 — Editable weekly grid + sign-in/out + add-child

New `ServiceWeeklyRollCallGrid.tsx` component:
- Rows = children attending this week (from the new API). Row header: avatar + name + age + weekly fee + hours used.
- Cols = Mon–Sun (default Mon–Fri; configurable to show weekend if service operates them).
- Each cell shows booked sessions as chips. Chip color:
  - Teal: booked, not yet signed in (default)
  - Green: signed in (shows sign-in time; if signed out also shows sign-out time)
  - Red: absent
  - Gray: no booking
- Click a teal chip → opens a small popover: "Sign in now" / "Mark absent" / "Edit" actions
- Click a gray cell → opens popover: "Add attendance for this day" (session picker)
- "+" button at top: "Add a child to this week" — opens a modal listing enrollable children (from `/children/enrollable`), with checkboxes to add each to a specific day+session. On submit: creates `AttendanceRecord` entries with status "booked".
- Legend at top: "booked / signed in / signed out / absent / add".
- Loading state = skeleton grid; error state = inline error with retry.

Tests: render cases (empty / populated), click a chip → correct popover action, add-child flow → correct API call.

---

### Commit 7 — Monthly view

New `ServiceMonthlyRollCallView.tsx`:
- Calendar grid (full month, Mon–Sun)
- Each day cell shows: `{attended} / {booked}` in a pill, color by completion (green >= 90%, amber >= 70%, red < 70%)
- Click a day → navigate to daily view for that date (existing)

Uses `GET /api/services/[id]/roll-call/monthly` route.

---

### Commit 8 — New `/children/[id]` full-page route — Details + Room/Days tabs

**Critical scope note**: user wants FULL PAGE, not drawer. Matches the `/staff/[id]` pattern from 3a.

New route: `src/app/(dashboard)/children/[id]/page.tsx` (server component) + `layout.tsx` (sticky header with avatar + name + DOB + age + service + back link).

5 tabs managed via `?tab=` query param:
1. **Details** — name, DOB (with auto-calculated age), gender, photo upload, school, year level, CRN, CCS status, active/withdrawn status, original enrolment date, finish date, exit category, exit comments.
2. **Room / Days** — editable permanent days grid matching OWNA screenshot #1:
   - Rows per booking (session type)
   - Cols: Mon, Tue, Wed, Thu, Fri, Sat, Sun, Mon2, Tue2, Wed2, Thu2, Fri2, Sat2, Sun2 (fortnight pattern)
   - Checkboxes per cell; save updates `Booking.recurringDays` or creates a new `Booking`.
   - "Update Room / Permanent Days" button commits the change.

Commits 9 & 10 add the remaining 3 tabs.

**Access control**: matches existing Child access rules. Admin/coord scoped to their service. Staff / member / marketing only see basic info if child is at their service.

**Role-permissions.ts update**: add `/children/[id]` to `allPages` + per-role access per MEMORY.md.

---

### Commit 9 — Relationships + Medical tabs

3. **Relationships / Permissions** — list linked parents/carers (primary starred), emergency contacts, authorised pickup list. Add/edit/remove relationships. Primary carer editable. Uses existing `AuthorisedPickup` + enrolment parent data.
4. **Medical** — 4 boolean checkboxes (Anaphylaxis, Allergies, Asthma, Dietary Restrictions), mild free-text, severe free-text, Medicare # + expiry + ref #, Vaccination Status dropdown. Saves to existing `Child.medicalConditions` + new fields for Medicare + vaccination (added in Commit 1 or here — decide during impl based on schema).

Server-side edit guarded by admin/coord access; all users can view.

---

### Commit 10 — Attendances tab + export

5. **Attendances** — matches OWNA screenshot #4 — table of this child's attendance history:
   - Columns: Date, Name, Sign-In (staff + time), Sign-Out (staff + time), Staff Notes, Room Changes Log, Fee, Session
   - Date range filter (default: current month)
   - Stats strip at top: Attendances, Absences, Fee total, Hours used, Session of Care
   - Export to Excel button (reuse existing `exportToCsv` + xlsx if present; else CSV)
- Read-only view — edits happen via Roll Call (commit 6).

---

### Commit 11 — Children list filters + CCS badge + parent display

Edit `ServiceChildrenTab.tsx` — add filter row + column improvements matching OWNA screenshot #3:

- Filter row: Current / All / Withdrawn toggle, Room dropdown, Day dropdown, CCS Status dropdown, Tags multi-select
- Grid columns: Name+Account, DOB+Age, **Parents/Carers** (primary starred, with phone/email quick-links), Room/Days+Session+Fee+Times, Action (edit / deactivate), **CCS Status badge** (Confirmed / Enrolment number / % + hours used)
- Sort-by dropdown: Surname (default), First name, Added date, DOB

Reuses existing data but surfaces more. No new API route needed if existing `/api/services/[id]/children` returns parents — confirm during impl; extend if not.

---

### Commit 12 — Casual Bookings Settings tab

New sub-tab under Daily Ops (alongside Attendance, Roll Call, Children, Weekly Roster, Checklists). Admin/coord only.

UI:
- Three session cards (BSC / ASC / VC), each with:
  - Enable toggle
  - Default casual fee input (currency)
  - Max casual spots input (number)
  - Cut-off hours input (number) — "Parents must book X hours before session start"
  - Day-of-week checkboxes (Mon–Sun) — which days accept casual bookings
- Live preview card: "Parents can book casual BSC up to 24 hours before the session at $36.00 (10 spots available)"
- Save → `PATCH /api/services/[id]` updates `casualBookingSettings` JSON field

Tests: form renders, save calls API, validation rejects negative fees / zero cut-off hours.

---

### Commit 13 — Today tab as first-class + IA reorder

Promote `ServiceTodayPanel` content into a new first-class tab:
- New tab at the top: **Today** (icon: Sunrise or Clock)
- Existing tab order after: Overview, Daily Ops, Program, EOS, Compliance, Finance
- Default landing: when user visits `/services/[id]`, redirect (or default query param) to `?tab=today`
- Today tab content: live attendance snapshot per session, staff on duty (with avatars), todos due today (assigned to anyone at this service), open tickets, expiring certs (30d), recent incidents (7d if any — placeholder until 4b).
- Refresh interval: 60s (match the bell notification polling)

File: move `ServiceTodayPanel.tsx` contents into a proper `ServiceTodayTab.tsx` wrapper that renders on the new tab; keep the panel usable for the services-list card if needed.

---

## Testing & verification plan

Per-commit: `npm test -- --run`, `npx tsc --noEmit`, `npm run lint`. Target: 1298+ baseline → 1400+ after 4a (100+ new tests across 13 commits).

End-of-PR manual smoke:
- Create a service, set approval numbers + session times + casual settings — verify Overview displays
- Roll Call weekly view: sign a child in/out, add a child who wasn't in the week, verify attendance records created
- Roll Call monthly view: see per-day totals, click a day → lands on daily view
- Click a child in Children tab → lands on `/children/[id]`, test all 5 tabs
- Casual Bookings Settings tab: toggle sessions, set fees, save, re-open confirms
- Today tab renders by default on service visit

## Out of scope (deferred to 4b)

- Incidents tab (currently only global `/incidents`)
- Photos / Gallery tab
- Parent Communication Feed (coordinator posts with photos → parent portal)
- Real-time updates via SSE (polling is enough for 4a)
- `ServiceProgramTab.tsx` (1314 lines), `ServiceAttendanceTab.tsx` (856 lines), `ServiceBudgetTab.tsx` (818 lines) decomposition
- Sign-in/out polish on the parent portal (4a focuses on the service-side view)

## Access control summary

- **Admin / head_office / owner**: full edit on all tabs + service settings + CCS settings
- **Coordinator**: full edit for their own service's tabs; read-only for others
- **Marketing / Member**: read-only on everything
- **Staff**: read-only, plus ability to sign children in/out at their own service (not edit other records)

## Open questions — resolve during implementation

1. **Q-A1** (Commit 1): `casualBookingSettings` JSON vs. separate `CasualBookingSetting` model with FK? Default: JSON for flexibility; promote to model later if it grows fields.
2. **Q-A2** (Commit 5): existing `AttendanceRecord` model has which fields? Verify during schema read. If missing `signInAt` / `signOutAt` / `signInStaffId` / `signOutStaffId`, add them in Commit 5's migration step (tack onto Commit 1 if small).
3. **Q-A3** (Commit 8): Child model currently has `medical Json?` (legacy) AND `medicalConditions String[]` (expanded). Commit 9's Medical tab should write to the expanded fields; legacy stays read-only.
4. **Q-A4** (Commit 12): casual booking actually flows where? Parent portal booking flow (if it exists) needs to respect `casualBookingSettings`. That's deferred to a follow-up — Commit 12 only stores the settings; wire-through to parent portal is 4b or a separate follow-up.
5. **Q-A5** (Commit 13): Should `Today` tab replace the Overview tab entirely, or sit alongside it? Spec says sit alongside (first-class); Overview keeps service-facts role. Implementation confirms.

## Acceptance criteria

- [ ] All 13 commits land on `feat/services-daily-ops-4a-2026-04-22`
- [ ] Schema migration applied to Neon pre-merge
- [ ] 1298+ → 1400+ tests passing
- [ ] 0 tsc errors
- [ ] `/children/[id]` added to `role-permissions.ts` per MEMORY.md
- [ ] Manual smoke covers all 13 commit-level acceptance items
- [ ] CI green on PR
- [ ] PR body includes before/after + migration SQL

## Risks

- **Child relation to Parents**: the current `Child` model doesn't have a direct `parents Parent[]` relation. Parents come via enrolment + centre contacts. Commit 9's Relationships tab needs to stitch these together; if relation-shape surprises emerge, flag at plan time.
- **Attendance schema gaps**: if `AttendanceRecord` doesn't have sign-in-staff attribution, Commit 5 needs additional migration columns. Prefer folding into Commit 1 if the gap is small.
- **Decomposition regressions**: splitting a 1200-line file can introduce subtle bugs. Mitigation: identical behavior tests before/after refactor.
- **Roll Call weekly grid perf**: 60 children × 5 days × 3 sessions = up to 900 cells. Should render fine with React, but watch for re-render churn; use `useMemo` for cell keys.

## Rollback

Each commit `git revert`-safe. Schema migration additive (no column drops). Worst-case whole-PR revert leaves migration applied but UI removed.

---

*Plan target: `docs/superpowers/plans/2026-04-22-services-daily-ops-4a-plan.md`.*
