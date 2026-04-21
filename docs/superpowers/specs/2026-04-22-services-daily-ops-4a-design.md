# Sub-project 4a — Services / Daily Ops Rebuild Part 1

**Date**: 2026-04-22
**Status**: Approved (user confirmed scope + adjustments)
**Parent roadmap**: [`2026-04-20-dashboard-bugfix-roadmap.md`](./2026-04-20-dashboard-bugfix-roadmap.md)
**Predecessors**: #1 P0 Bugs (`dd0a1d9`), #2 Hygiene Sweep (`2ca8289`), #3a Staff Part 1 (`39164df`), #3b Staff Rostering (`38fd0b2`), #5 Documents/Policies/Compliance (`c3cf585`), #7 Portal & Enrolment CSV export (`3a8ee1e`), #9 Leadership/Scorecard/Pulse admin (`cc11d10`).

## Overview

The Services module has 6 tab groups and 19 components, all functional but shallow compared to OWNA (the childcare management system the dashboard is replacing). Part 1 of the Services / Daily Ops Rebuild brings OWNA-level depth to the most operational parts: the service facts, an editable weekly attendance grid that supports in-view sign-in/out AND adding children not yet in the week's roster, and a full-page child detail view covering everything a coordinator needs to act on a child in one place.

Part 2 (Sub-project 4b, deferred) tackles: incidents tab, photos/gallery, parent daily feed, real-time updates, remaining component decomposition (ProgramTab 1314 lines, AttendanceTab 856 lines, BudgetTab 818 lines).

## Baseline

- Main at `ba8ab55` (post #5/#7/#9 merges). Exact test count at worktree-baseline step — each commit's gate re-asserts that number.
- 0 `tsc --noEmit` errors
- `/services/[id]/page.tsx` (504 lines) has 6 tab groups + sub-pill routing via `?tab=&sub=`
- `ServiceTodayPanel.tsx` (414 lines) renders at page-level above the tab group navigation in `src/app/(dashboard)/services/[id]/page.tsx` (~line 299) — NOT inside Overview. Commit 13 removes the page-level render + promotes its content into a first-class tab.
- `Child` model has expanded profile fields (`medicalConditions String[]`, `dietaryRequirements String[]`, `photo`, `ownaChildId` for legacy sync); also has `bookingPrefs Json?` for session-type/days/booking-type preferences. NO `medicareNumber`, `medicareExpiry`, `medicareRef`, `vaccinationStatus` fields today — Commit 1 adds them.
- `Service` model has capacity + rates + marketing fields; NO approval numbers, session times structure, or casual booking settings — Commit 1 adds them.
- `AttendanceRecord` model (`prisma/schema.prisma:2450-2473`) already has `signInTime`, `signOutTime`, `signedInById`, `signedOutById`, `absenceReason`, `notes` — no migration needed for sign-in/out attribution.
- `Booking` model is per-date (no recurring pattern field). Permanent-days pattern (Mon–Sun + Mon2–Sun2 fortnight) stored in `Child.bookingPrefs Json` — Commit 8 defines the JSON shape; no new Prisma model needed.
- Existing attendance APIs: `/api/attendance/route.ts` (POST/GET global), `/api/attendance/roll-call/route.ts` (daily view used by `useRollCall`). Commit 5 REUSES these for the daily view and ADDS `/api/services/[id]/roll-call/weekly|monthly` for the new views — does NOT duplicate.
- Existing children route: `/api/children/route.ts` with optional `?serviceId=` filter (NOT a per-service `/api/services/[id]/children` route). Commit 11 extends `/api/children` to optionally hydrate primary + secondary parents via `?includeParents=true`; does NOT create a new per-service route.

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

### Commit 1 — Schema additions (all schema changes for 4a in one migration)

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

New fields on `Child` model (all nullable, additive — consumed by Commit 9 Medical tab):

```prisma
model Child {
  // ... existing fields ...
  medicareNumber     String?
  medicareExpiry     DateTime?    // stored as a date; UI renders month/year
  medicareRef        String?      // IRN reference #
  vaccinationStatus  String?      // "up_to_date" | "partial" | "not_provided" | "exempt"
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

`Child.bookingPrefs` **JSON shape** (existing field, formally documented here — used by Commit 8 Room/Days tab):
```ts
{
  fortnightPattern: {
    week1: { bsc?: ("mon"|"tue"|"wed"|"thu"|"fri"|"sat"|"sun")[]; asc?: same; vc?: same };
    week2: { same shape as week1 };
  };
  // plus any existing keys — don't break them
}
```

**Zod validation** for all three JSON shapes (`sessionTimes`, `casualBookingSettings`, `bookingPrefs.fortnightPattern`) lives in `src/lib/service-settings.ts` (new) alongside TypeScript types, so API routes + UI share one source of truth.

**Migration**: `npx prisma migrate dev --name add_service_approval_session_times_child_medical`. Additive only — no column drops, no type changes. **No other commits in 4a ship schema changes** (single migration policy).

---

### Commit 2 — Overview tab: display new fields

Add a "Service approvals" and "Session times" card to the Overview tab. Admin/coordinator sees an Edit button that opens a modal to update the 4 new fields (approvalNumber, providerApprovalNumber, sessionTimes, casualBookingSettings is handled in Commit 12). Existing marketing fields are NOT merged or renamed — just unchanged alongside.

Visible to everyone with access to the service (read-only for staff).

---

### Commit 3 — Decompose ServiceOverviewTab

Current `ServiceOverviewTab.tsx` is 1200 lines with 4 pre-existing embedded sections (`CapacityWaitlistWidget`, `StaffingForecast`, `SchoolPartnershipSection`, `ParentFeedbackSection`) plus the notes textarea workflow. Split into:
- `OverviewHeader.tsx` — hero card with name, code, status
- `ServiceInfoCard.tsx` — address, contact, approvals, session times (new — from Commit 2)
- `CapacityCard.tsx` — capacity + attendance targets (absorbs `CapacityWaitlistWidget`)
- `RatesCard.tsx` — daily + casual rates
- `MarketingCard.tsx` — school population, parent segment, launch phase, school partnership (absorbs `SchoolPartnershipSection`)
- `StaffingForecastCard.tsx` — existing embedded `StaffingForecast` lifted out
- `ParentFeedbackCard.tsx` — existing embedded `ParentFeedbackSection` lifted out
- Keep the notes textarea workflow in the parent `ServiceOverviewTab.tsx` (simpler than threading a state prop through 7 children; ~150 lines of composition + notes logic)

Parent `ServiceOverviewTab.tsx` becomes ~200 lines composition. No feature changes, pure decomposition. Run existing overview tests before + after to verify no behavior regression.

---

### Commit 4 — Roll Call view toggle

Add `?rollCallView=daily|weekly|monthly` query param synced to state on `ServiceRollCallTab.tsx`. Header button group toggles between the 3 views. **Daily view = existing implementation (untouched)** — the tab's internal `useState(todayDateString)` date-picker state stays local; only the top-level view selector is URL-synced. Acknowledged awkwardness: daily view's date is not bookmarkable. Not worth rewriting in 4a; revisit in 4b.

---

### Commit 5 — Weekly + monthly roll-call API (reuses existing attendance CRUD)

**Route reuse policy**: daily view keeps existing `/api/attendance/roll-call` and `/api/attendance` POST/PATCH/DELETE. Commit 5 adds **only the two new aggregation routes** needed for the weekly + monthly views, plus the enrollable-children route.

New API routes (all `withApiAuth`, admin/coord scoped):

- `GET /api/services/[id]/roll-call/weekly?weekStart=YYYY-MM-DD` — returns all children attending that week at the service, with per-day per-session status (booked / signed-in / signed-out / absent / none), their bookings, their existing `AttendanceRecord`s.
- `GET /api/services/[id]/roll-call/monthly?month=YYYY-MM` — per-day totals for calendar view.
- `GET /api/services/[id]/children/enrollable?weekStart=YYYY-MM-DD` — children eligible for the "+ add child to week" flow. **Enrollable definition**: `Child.serviceId === this service` AND `Child.status === "active"` AND `Child` has no `AttendanceRecord` in [weekStart, weekStart+7d). This set represents active children of the service not yet on the week's roster.

**Attendance mutations**: client UI calls existing `POST /api/attendance` / `PATCH /api/attendance/[id]` / `DELETE /api/attendance/[id]` — NO new mutation endpoints under `/api/services/[id]/attendance/*`. Keeps one source of truth for attendance CRUD.

Zod validated, tests for auth/happy/403/404 per route.

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

**Performance note**: a 60-child × 5-day × 3-session grid is up to 900 cells. Use `React.memo` on the cell component with `(prev, next) => prev.shift?.id === next.shift?.id && prev.shift?.status === next.shift?.status`, and `useMemo` for derived grid shape keyed on the week's attendance set. Without memo, sign-in actions re-render every cell.

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

**Access control (per tab, per role)**:

| Tab | Admin / H.O. / Owner | Coordinator (same service) | Staff / Member / Marketing (same service) | Any role (different service) |
|---|---|---|---|---|
| Details | R/W | R/W | R only | 403 |
| Room / Days | R/W | R/W | R only | 403 |
| Relationships | R/W | R/W | R only | 403 |
| Medical | R/W | R/W | R only | 403 |
| Attendances | R | R | R | 403 |

All roles see Child's primary fields (name, DOB, service, basic photo). Non-admin read-only on all tabs. "R/W" includes upload actions for photo + documents. Staff role gains read access specifically on their own service's children.

**Role-permissions.ts update**: add `/children/[id]` to `allPages` AND explicit entries in `rolePageAccess` for **owner, head_office, admin** (via allPages spread if pattern allows), plus explicit entries for **coordinator, marketing, member, staff**. Per MEMORY.md.

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

**Data source**: extends existing `/api/children/route.ts` — adds `?includeParents=true` query flag. When set, response includes `parents: { id?, firstName, surname, relationship, isPrimary, phone?, email? }[]` hydrated from `EnrolmentSubmission.primaryParent` + any linked `CentreContact` rows + existing `authorisedPickups` for secondary carers. Does NOT create a new per-service route.

UI hook `useChildren(filters)` passes `includeParents: true` + filter params. Existing hook signature extended with optional `TeamFilters`-style primitives-in-query-key pattern from CLAUDE.md.

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
- **Stored — not enforced in 4a**. Settings save correctly, but the parent-portal casual-booking flow does NOT yet gate on these settings. UI shows a "⚠ Settings stored — parent-portal enforcement ships in a follow-up sub-project" info banner below the form so admins know the preview is aspirational. Wire-through to parent portal deferred (see Out of scope).
- Save → new dedicated route `PATCH /api/services/[id]/casual-settings` (body: Zod-validated casualBookingSettings). Dedicated route keeps the JSON validation isolated and lets existing `PATCH /api/services/[id]` stay lean.

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

| Surface | Admin / H.O. / Owner | Coordinator (own service) | Staff (own service) | Marketing / Member (own service) | Any role (diff service) |
|---|---|---|---|---|---|
| Service Overview | R/W | R/W | R | R | R |
| Service settings (approvals, session times, casual booking) | R/W | R/W | R | R | 403 |
| Today tab | R | R | R | R | 403 |
| Daily Ops → Roll Call (all views) | R/W | R/W | R/W sign-in/out + add-child | R | 403 |
| Daily Ops → Casual Bookings Settings | R/W | R/W | 403 | 403 | 403 |
| Children list filters + details | R/W | R/W | R | R | 403 |
| `/children/[id]` (5 tabs) | R/W | R/W | R | R | 403 |

"R/W" on Roll Call includes `/api/attendance` POST/PATCH/DELETE. Staff role specifically gets write access to Roll Call (sign-in/out + add-child-to-week) for their own service — they're the ones on the floor doing it.

## Resolved decisions

1. **Schema consolidated into Commit 1** — all Service + Child field additions ship in one migration. No commit-9 surprise schema change.
2. **AttendanceRecord already has sign-in/out attribution** — `signInTime`, `signOutTime`, `signedInById`, `signedOutById`, `absenceReason`, `notes` all exist. No migration for attendance.
3. **Permanent-days pattern stored in existing `Child.bookingPrefs Json`** — Commit 1 formalizes the JSON shape via Zod; no new model or field.
4. **`casualBookingSettings` stays JSON** — simpler; promote to model later if fields grow.
5. **Child's legacy `medical Json?` stays read-only**; Commit 9 writes to `medicalConditions String[]` + new Medicare/vaccination fields.
6. **Casual booking enforcement deferred to a follow-up** — Commit 12 stores settings + UI banner says "not yet enforced".
7. **Today tab sits alongside Overview**, promoted to first tab + default landing.
8. **Route reuse**: daily view + attendance CRUD continue on existing `/api/attendance` + `/api/attendance/roll-call`. New routes only for weekly/monthly aggregation + enrollable children.

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
