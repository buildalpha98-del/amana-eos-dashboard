# Sub-project 4b — Services / Daily Ops Rebuild Part 2

**Date**: 2026-04-22
**Status**: Approved (pre-written for parallel execution — brainstorming skipped by user preference)
**Parent roadmap**: [`2026-04-20-dashboard-bugfix-roadmap.md`](./2026-04-20-dashboard-bugfix-roadmap.md)
**Predecessors**: #1 P0 Bugs (`dd0a1d9`), #2 Hygiene Sweep (`2ca8289`), #3a Staff Part 1 (`39164df`), #3b Staff Rostering (`38fd0b2`), #5 Documents (`c3cf585`), #7 Portal/Enrolment, #9 Leadership/Scorecard/Pulse, **#4a Services/Daily Ops Part 1 (`884ef6b`)**

## Overview

Follow-up to 4a. 4a shipped the UI shell, schema foundation, and settings-storage layer; 4b wires up the deferred pieces. Items originally listed in 4a's "Out of scope" (incidents tab, photo gallery, parent daily feed, SSE real-time updates, further ProgramTab / BudgetTab decomposition) remain deferred to a later services sub-project — 4b targets the mid-commit deferrals (filters, enforcement, inline edit, bulk, scope helper).

1. **Child schema fields** — add `ccsStatus`, `room`, `tags` to `Child` model. 4a's `ChildrenFilters` component already renders these controls; they're currently no-ops. 4b promotes them to first-class fields + wires the `/api/children` filter logic.
2. **Casual booking enforcement** — 4a shipped `Service.casualBookingSettings` as settings-only. 4b enforces settings against `POST /api/parent/bookings` + `/api/parent/bookings/bulk`: reject casual bookings when session disabled, spots exhausted, or inside cut-off window; reject on disallowed day.
3. **Relationships tab inline edit** — 4a's `RelationshipsTab` is read-only. 4b adds inline add/edit/remove for secondary carers, emergency contacts, and authorised pickups. Writes to `EnrolmentSubmission` JSON (primary carer stays read-only — high risk field, needs enrolment-flow guard rails).
4. **Bulk add-child endpoint** — 4a's `AddChildDialog` uses client-side `Promise.all` of 1 POST per selection. 4b adds `POST /api/attendance/roll-call/bulk` (server-side transactional) so partial failure rolls back.
5. **`getServiceScope` widening** — 4a flagged: helper only covers staff + member today. 4b widens to also return scope for coordinator + marketing. Low-risk additive change; each call site already has `isAdminRole` bypass.

Smaller follow-ups (from 4a review):
6. **Attendances per-child route max-range guard** — add 366-day cap to `/api/children/[id]/attendances` to protect against abusive ranges (reviewer flagged in Commit 10).
7. **`authorisedPickupSchema` hoist** — move locally-defined schema in `RelationshipsTab.tsx` to `src/lib/schemas/json-fields.ts` for consistency.

## Baseline

- 1617 tests, 0 tsc errors (after 4a merge at `884ef6b`)
- Child model has `ownaRoomName` (OWNA-synced) but no first-class `room`
- Child model has 0 of `ccsStatus` / `tags`
- `POST /api/parent/bookings` + `/api/parent/bookings/bulk` exist with no casualBookingSettings enforcement
- `RelationshipsTab` is read-only with a footer note "Inline editing will ship in a later sub-project"
- `getServiceScope` returns scope only for staff + member

## In scope — stacked commits

| # | Commit subject | Category | Files (approx.) |
|---|---|---|---|
| 1 | `feat(schema): add Child.ccsStatus + room + tags + migration` | Schema | 2 (schema + neon-apply.sql) |
| 2 | `feat(api): wire /api/children ccsStatus+room+tags filters (remove 4a TODOs)` | API | 3 |
| 3 | `feat(services-list): promote ChildrenFilters ccs/room/tags from no-op to real` | Feature | ~3 |
| 4 | `refactor(scope): widen getServiceScope to coordinator + marketing + expand tests` | Reliability | 2 |
| 5 | `feat(booking): enforce casualBookingSettings in parent-portal create routes` | Feature | ~5 |
| 6 | `feat(api): POST /api/attendance/roll-call/bulk (transactional multi-row)` | API | 3 |
| 7 | `refactor(roll-call): wire AddChildDialog to bulk endpoint` | Reliability | 2 |
| 8 | `feat(child-page): inline edit for secondary carers + emergency + pickup on RelationshipsTab` | Feature | ~5 |
| 9 | `refactor(schemas): hoist authorisedPickupSchema + max-range guard on child-attendances` | Hygiene | 3 |

~9 commits. No changes to `/staff/[id]`, Overview, or Roll Call grid behaviour — 4b stays inside the child + booking + scope surfaces.

## Key design decisions

### Schema additions (Commit 1)

```prisma
// Child model — additive, nullable
ccsStatus      String?   // "eligible" | "pending" | "ineligible" — free-text to keep flexible
room           String?   // dashboard-first room label; decouples from OWNA's ownaRoomName
tags           String[]  // optional tags for filtering (e.g. "siblings", "vip-family", "withdrawal-notice")
```

No enum type on `ccsStatus` — three expected values documented in comment but stored as string so a future fourth status doesn't require a migration. Validation done at Zod/UI layer.

Indexes: `@@index([serviceId, ccsStatus])` + `@@index([serviceId, room])` for filter performance.

### Filter wiring (Commits 2 + 3)

Server (`src/app/api/children/route.ts`):
- `ccsStatus=eligible` → `where.ccsStatus = "eligible"`
- `room=R1` → `where.room = "R1"` (exact match; room naming is controlled)
- `tags=siblings&tags=vip` → `where.tags = { hasSome: ["siblings", "vip"] }` (OR semantic)
- `day=mon` → filter by `bookingPrefs.fortnightPattern` JSON. Approach: fetch all active children at service, filter in JS via the existing `fortnightPatternSchema` parser. Acceptable perf for < 2000 children per service.

UI (`src/components/services/ChildrenFilters.tsx`):
- Enable the 4 controls that were disabled/no-op in 4a. Options sourced from live data (distinct `room` / `ccsStatus` / `tags` values seen on children at this service).
- Update empty-state placeholder from "(n/a)" to "(no values yet)" when list of options is empty.

### Casual booking enforcement (Commit 5)

`POST /api/parent/bookings` + `POST /api/parent/bookings/bulk`:

For each booking with `type: "casual"`:
1. Load `Service.casualBookingSettings` via `casualBookingSettingsSchema.safeParse`.
2. If settings absent → reject with 400 "Casual bookings not configured for this service" (conservative: don't allow unconfigured).
3. Check session (`bsc`/`asc`/`vc`) is enabled → else 400 "{sessionType} casual bookings are not accepted at this service".
4. Check booking date's day-of-week is in `days[]` → else 400 "Casual {sessionType} is not available on {day} at this service".
5. Check `cutOffHours` — if `new Date(booking.date) < now + cutOffHours` → 400 "Bookings must be made at least {n} hours before the session".
6. Check spots remaining — count existing casual bookings for same (serviceId, date, sessionType) with status `confirmed|requested`; if `≥ spots` → 400 "No casual spots available for this session".

Spots check must be inside a `prisma.$transaction` with `serializable` isolation to prevent race-condition overbooking (10 parents booking simultaneously). Bulk endpoint runs checks per-booking within the same transaction; any rejection rolls back the whole batch.

Tests:
- Enforcement 400 cases (all 5 failure modes above)
- Happy path 200 (passes all checks)
- Race: 2 concurrent parallel POSTs for last spot → exactly one succeeds (200), other gets 400

### Bulk attendance endpoint (Commits 6 + 7)

`POST /api/attendance/roll-call/bulk`:

Body:
```ts
{
  serviceId: string,
  items: Array<{
    childId: string,
    date: "YYYY-MM-DD",
    sessionType: "bsc" | "asc" | "vc",
    action: "sign_in" | "sign_out" | "mark_absent" | "undo",
  }>  // max 100 items
}
```

Handler wraps all items in `prisma.$transaction([...])`. Reuses existing per-item logic from the single-action route. Returns `{ created: N, failed: 0 }` on success; rolls back on any item's failure and returns 400 with the failed item index + reason.

Rate limit: 10 req/min per user (override via `withApiAuth`).

AddChildDialog in `ServiceWeeklyRollCallGrid.tsx` swaps `Promise.all(...)` for a single `mutateApi('/api/attendance/roll-call/bulk', { ... })` call. Error handling becomes cleaner: one toast per submission, not per-item.

### getServiceScope widening (Commit 4)

**Blast radius — read this before shipping.** Today `getServiceScope` returns `null` for coordinator/marketing. Because most consumer routes treat `null` as "no scope = full access", **coordinators and marketing currently see cross-service data** on 21 endpoints (timesheets, scorecard, rocks, meetings, compliance, incidents, financials, etc.). Widening the helper = **narrowing** those roles to their own service = real UX regression risk where coordinators today rely on cross-service views (e.g. rocks across services).

Before this commit lands, audit each of the 21 non-test callers (grep confirmed list). For each:
- **Narrow (widen helper covers it):** coordinator/marketing visibility was accidental; intent was always same-service. (Expected for most operational routes: attendance, roll-call, children list.)
- **Preserve cross-service (exempt from narrowing):** coordinator/marketing actually need cross-service visibility by spec (likely: leadership dashboards, rocks, scorecard-rollup). For these: keep the inline `getServiceScope` call but add a new helper `getOperationalScope(session)` that narrows only for staff/member — OR skip the helper entirely and do explicit role-gated cross-service logic.

Deliverable: before Commit 4 lands, the plan must include a **21-route audit table** with decisions per route (narrow / exempt / needs-new-helper). Surface the decisions in the commit message.

Current call sites (21, grepped 2026-04-22):
`timesheets/*`, `services/staffing`, `scorecard/*`, `rocks`, `qip`, `meetings`, `incidents/trends`, `feedback/quick`, `exit-survey/summary`, `compliance`, `communication/announcements`, `billing/overdue`, `attendance/*`, `children/*` (4a routes), `shift-swaps/*`.

Helper change:
```ts
// BEFORE
if ((role === "staff" || role === "member") && session.user.serviceId) {
  return session.user.serviceId as string;
}

// AFTER (default — narrow all non-admin roles to own service)
if (role !== "owner" && role !== "head_office" && role !== "admin" && session.user.serviceId) {
  return session.user.serviceId as string;
}
```

Extend `service-scope.test.ts` with coverage for all 7 roles. Add a per-route regression test confirming each of the 21 consumers behaves as the audit decided.

### Relationships inline edit (Commit 8)

- **Primary carer** — remains read-only. Primary is tied to the enrolment identity and must be changed via the enrolment flow (auditable).
- **Secondary carer** — add Edit button → modal form with name/phone/email/relationship. Save via new endpoint `PATCH /api/children/[id]/relationships` (updates `enrolment.secondaryParent` JSON).
- **Emergency contacts** — add / edit / remove list. Same endpoint.
- **Authorised pickups** — add / edit / remove list. Same endpoint.

Role access: admin / head_office / owner / coordinator (at same service). Staff / member / marketing see read-only (no edit buttons).

New endpoint `PATCH /api/children/[id]/relationships`:
- Accepts `{ secondaryParent?, emergencyContacts?, authorisedPickup? }` (all optional)
- Validates via Zod (`primaryParentSchema` re-used for secondary, new `emergencyContactSchema` + `authorisedPickupSchema` in `json-fields.ts`)
- Transactional read-merge-write on `enrolment` JSON (same pattern as 4a's `bookingPrefs` merge)
- Role narrowing: `isAdminRole || (role === "coordinator" && sameService)`

Audit: activity-log entry per edit (uses existing `logger.info("Activity: ...")` pattern).

### Access control summary

| Surface | Who can edit |
|---|---|
| Child.ccsStatus / room / tags | admin/head_office/owner + coord same service (via existing `/api/children/[id]` PATCH) |
| CasualBookingSettings | (unchanged from 4a — admin/head_office/owner + coord same service) |
| Secondary carer / emergency / pickup | admin/head_office/owner + coord same service |
| Primary carer | no UI edit (enrolment flow only) |

## Schema changes

Single additive migration in Commit 1:

```sql
ALTER TABLE "Child" ADD COLUMN "ccsStatus" TEXT;
ALTER TABLE "Child" ADD COLUMN "room" TEXT;
ALTER TABLE "Child" ADD COLUMN "tags" TEXT[];
CREATE INDEX "Child_serviceId_ccsStatus_idx" ON "Child" ("serviceId", "ccsStatus");
CREATE INDEX "Child_serviceId_room_idx" ON "Child" ("serviceId", "room");
```

Safe to apply ahead of code. Jayden runs via Neon SQL editor (same pattern as 4a; `neon-apply.sql` artefact ships with the migration).

## Out of scope (defer)

- **CCS calculation logic / CRN-based eligibility check** — separate future sub-project (CCS pipeline is a big effort; just the status field + filter here)
- **Drag-and-drop room assignments** — UI-intensive; defer
- **Automatic tag application** (e.g. auto-tag "withdrawal-notice" when exit date set) — nice-to-have automation
- **Batch edit** on children list (select 10, set status) — deferred
- **Audit log viewer UI** for relationship edits — log line exists; viewer is separate
- **Parent-facing casual booking UI improvements** — enforcement is API-only; UI improvements ship in later parent-portal work

## Acceptance criteria

- [ ] All 9 commits land in prescribed order
- [ ] Migration applied to Neon pre-merge (single additive migration)
- [ ] 1617 baseline → ~1700+ tests (~80+ new)
- [ ] 0 tsc errors
- [ ] 4 previously-disabled ChildrenFilters controls functional with live data
- [ ] Casual booking enforcement: all 5 failure modes tested + race-condition test
- [ ] RelationshipsTab can add/edit/remove secondary + emergency + pickup (admin + coord)
- [ ] Bulk add-child endpoint transactional (partial failure → full rollback)
- [ ] `getServiceScope` returns scope for coordinator + marketing (unit test per role)
- [ ] PR body includes before/after + migration SQL

## Risks

- **getServiceScope widening breaks existing callers** — mitigated by grep audit of all 22 callers + every new scope check has `isAdminRole` bypass above it. Widening only affects coordinator + marketing access to routes that were previously letting them through as `null` (null = full access); now they'll be narrowed to their own service. Net effect: _tighter_ access, not looser — could break a coordinator whose session lacks `serviceId`. Flag: pre-merge query on `User` table confirms all current coordinators have `serviceId` populated.
- **Casual booking race condition** — mitigated by `serializable` transaction isolation. Risk: throughput hit on booking endpoints. Acceptable; casual booking volume is low.
- **Bulk endpoint max items** — 100 cap prevents abuse but someone might want to add 200 children at once. Mitigation: server returns 400 "Max 100 items per batch" with a clear message; UI splits batches of 100 if needed (unlikely in practice).
- **JSON inline edit concurrency** — two admins editing the same child's enrolment JSON simultaneously. Mitigated by transactional read-merge-write (same pattern as 4a's bookingPrefs). Last-writer-wins on the specific key; unchanged keys preserved.

## Rollback

- Schema additive (3 nullable fields + 2 indexes). Safe to leave after rollback.
- Each commit revert-safe.
- Casual booking enforcement (Commit 5) is the highest-impact rollback: if it breaks parent bookings, revert the enforcement commit; settings storage (4a) + UI remain intact, just no enforcement.

---

*Plan target: `docs/superpowers/plans/2026-04-22-services-daily-ops-4b-plan.md`.*
