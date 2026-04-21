# Sub-project 3b — Staff Rostering & Shift Management

**Date**: 2026-04-21
**Status**: Draft
**Parent roadmap**: [`2026-04-20-dashboard-bugfix-roadmap.md`](./2026-04-20-dashboard-bugfix-roadmap.md)
**Predecessors**: Sub-project 1 P0 Bug Batch (`dd0a1d9`), Sub-project 2 Hygiene Sweep (`2ca8289`), Sub-project 3a Staff/People Part 1 (`39164df`)

## Overview

Part 2 of the Staff / People module. Makes the dashboard the **source of truth** for staff rostering — part of the long-term plan to replace OWNA. Managers build and publish weekly rosters per service; staff see their shifts and can request swaps. Ratio warnings are surfaced inline. OWNA sync continues in parallel as a safety net during migration — it's deprecated in a later cleanup sub-project once dashboard rostering is stable.

**Branch**: `feat/staff-rostering-3b-2026-04-21` off `origin/main` at `39164df`
**Worktree**: `.worktrees/staff-rostering-3b`

## Baseline (captured 2026-04-21, post 3a merge)

| Metric | Current | Target |
|---|---|---|
| Tests passing | 1168 | 1168+ (~60 new tests) |
| `tsc --noEmit` | 0 errors | 0 |
| `RosterShift` populated via | OWNA sync only (`staffName` free-text, no `userId`) | Dashboard builder + OWNA sync coexist |
| Roster builder UI | None | Weekly grid inside `ServiceWeeklyRosterTab` "Shifts" sub-pill |
| Staff view of own roster | None | `/my-portal` "My Upcoming Shifts" card + "My Next Shift" on profile + `/roster/me` |
| Shift swap model | Does not exist | `ShiftSwapRequest` model with 3-step flow |
| Ratio warnings | Only in `shift-gap-detector` cron email | Inline in grid + email cron still active |
| `/team` Action Required widget | Certs + leave + timesheets | + shift-swaps-pending count |

## In scope — 11 stacked commits

| # | Commit subject | Category | Files (approx.) |
|---|---|---|---|
| 1 | `feat(schema): RosterShift userId/status + ShiftSwapRequest + migration` | Schema | 3 |
| 2 | `chore(data): backfill RosterShift.userId by staffName exact-match to User.name` | Data migration | 1 (script) + report |
| 3 | `feat(components): ShiftChip, RatioBadge, ShiftEditModal` | Shared UI | 6 (3 comps + 3 tests) |
| 4 | `feat(api): roster shift CRUD + publish + copy-week routes` | API | 10 (routes + tests) |
| 5 | `feat(roster): builder grid in ServiceWeeklyRosterTab Shifts sub-pill` | Feature | ~8 |
| 6 | `feat(roster): staff self-view — my-portal card + /staff/[id] Overview wiring + /roster/me` | Feature | ~5 |
| 7 | `feat(api): ShiftSwapRequest CRUD + accept + approve + reject routes` | API | 8 (routes + tests) |
| 8 | `feat(roster): shift swap UI — staff propose + target accept + admin approve` | Feature | ~7 |
| 9 | `refactor(lib): extract roster-ratio helper from shift-gap-detector + inline warnings` | Reliability | 3 |
| 10 | `feat(notifications): wire 5 new roster notification types + constants update` | Feature | ~4 |
| 11 | `feat(team): extend Action Required widget with shift-swaps-pending count` | Feature | 2 |

**Ordering rationale**: schema first (unblocks API + UI). Migration second (so userId values are present before any UI depends on them). Shared components third. Then API + UI in functional slices (builder, self-view, swaps). Helpers + notifications layered on. Team widget last.

---

### Commit 1: `feat(schema): RosterShift userId/status + ShiftSwapRequest + migration`

**Schema changes**:

```prisma
model RosterShift {
  // ... existing fields ...
  userId       String?
  user         User?     @relation("UserRosterShifts", fields: [userId], references: [id], onDelete: SetNull)
  status       String    @default("published")  // "draft" | "published"
  publishedAt  DateTime?                         // when manager hit Publish; NULL for OWNA-synced rows
  createdById  String?
  createdBy    User?     @relation("CreatedRosterShifts", fields: [createdById], references: [id], onDelete: SetNull)
  
  @@index([userId])
  @@index([userId, date])
  @@index([status])
}

model User {
  // ... existing ...
  rosterShifts        RosterShift[]      @relation("UserRosterShifts")
  createdRosterShifts RosterShift[]      @relation("CreatedRosterShifts")
  proposedShiftSwaps  ShiftSwapRequest[] @relation("ProposedShiftSwaps")
  targetShiftSwaps    ShiftSwapRequest[] @relation("TargetShiftSwaps")
  approvedShiftSwaps  ShiftSwapRequest[] @relation("ApprovedShiftSwaps")
}

/// Staff-initiated request to swap or cover a shift.
/// 3-step flow: proposer → target accepts → admin/coordinator approves.
model ShiftSwapRequest {
  id             String       @id @default(cuid())
  shiftId        String
  shift          RosterShift  @relation("ShiftSwapRequests", fields: [shiftId], references: [id], onDelete: Cascade)
  proposerId     String
  proposer       User         @relation("ProposedShiftSwaps", fields: [proposerId], references: [id])
  targetId       String
  target         User         @relation("TargetShiftSwaps", fields: [targetId], references: [id])
  reason         String?
  status         String       @default("proposed") // "proposed" | "accepted" | "approved" | "rejected" | "cancelled"
  acceptedAt     DateTime?
  approvedAt     DateTime?
  approvedById   String?
  approvedBy     User?        @relation("ApprovedShiftSwaps", fields: [approvedById], references: [id], onDelete: SetNull)
  rejectedAt     DateTime?
  rejectedReason String?
  createdAt      DateTime     @default(now())
  updatedAt      DateTime     @updatedAt
  
  @@index([proposerId])
  @@index([targetId])
  @@index([status])
  @@index([shiftId])
}
```

`RosterShift.status` defaults to `"published"` — preserves backward-compat for existing OWNA-synced rows (they're visible as published). New dashboard-created shifts start as `"draft"` until the manager publishes.

**Back-relations on `ComplianceCertificate` and `RosterShift`**: RosterShift already has a service relation; only the new `user`, `createdBy`, and `shiftSwapRequests` (implicit via `ShiftSwapRequest` FK) are new.

Add to `RosterShift`:
```prisma
  shiftSwapRequests ShiftSwapRequest[] @relation
```
(Actually Prisma infers this via the FK; the back-relation is optional but recommended for query ergonomics.)

**Migration**: `npx prisma migrate dev --name add_roster_shift_user_and_swap_requests`. Additive only — no column drops, no type changes on existing fields.

**Acceptance**:
- Migration file generated and applied locally
- `npx prisma generate` produces `ShiftSwapRequest` + updated `RosterShift` types
- 1168 tests still pass
- 0 new tsc errors

---

### Commit 2: `chore(data): backfill RosterShift.userId by staffName exact-match to User.name`

**Purpose**: existing OWNA-synced `RosterShift` rows have `staffName` as free text. Link `userId` where unambiguous.

**Script**: `scripts/one-shots/backfill-roster-userid.ts`:
```ts
// For each distinct staffName:
//   1. find User.name exact-match (case-sensitive first, then case-insensitive fallback)
//   2. if 1 match: update RosterShift.userId = user.id
//   3. if 0 or >1 match: leave userId=null, log to stdout
// Prints summary: { matched, multiMatch, unmatched }
```

Run once against the live Neon DB after migration. Non-matching rows are left alone — they remain functional (display falls back to `staffName`).

**Acceptance**:
- Script runs to completion
- Report printed to console (copy into PR body for audit trail)
- No `RosterShift` rows deleted or otherwise mutated beyond `userId` population
- Script committed to `scripts/one-shots/` for audit

---

### Commit 3: `feat(components): ShiftChip, RatioBadge, ShiftEditModal`

**Purpose**: three shared UI primitives used across the roster builder + staff views.

1. **`src/components/roster/ShiftChip.tsx`**
   - Props: `shift: { id, userId?, staffName, shiftStart, shiftEnd, sessionType, role?, status }`, `onClick?`
   - Renders: compact pill (avatar-less chip) showing: staff display name, time range, optional role. Color per sessionType (BSC blue / ASC green / VC purple). Status "draft" shows dashed border; "published" shows solid.

2. **`src/components/roster/RatioBadge.tsx`**
   - Props: `staffCount: number, childrenCount: number, threshold?: number` (default 13 — per `shift-gap-detector`)
   - Computes ratio; renders green (within), amber (near threshold — within 15% buffer), red (over), gray (no children = "no coverage needed").

3. **`src/components/roster/ShiftEditModal.tsx`**
   - Props: `open, onClose, mode: "create" | "edit", shift?, serviceId, date?, onSaved`
   - Form: user (staff at this service, select), date, sessionType (BSC/ASC/VC), shiftStart/shiftEnd (HH:mm), role (optional)
   - Submit: POST `/api/roster/shifts` (create) or PATCH `/api/roster/shifts/[id]` (edit)
   - Delete action in edit mode

**Tests**: unit tests per component, boundary tests on `RatioBadge` thresholds.

**Acceptance**: components render in Storybook-style preview; tests pass.

---

### Commit 4: `feat(api): roster shift CRUD + publish + copy-week routes`

**Routes**:

- `GET /api/roster/shifts?serviceId=X&weekStart=YYYY-MM-DD` — list shifts for a service + week
- `POST /api/roster/shifts` — create shift (admin/coord at service)
- `PATCH /api/roster/shifts/[id]` — edit shift (admin/coord)
- `DELETE /api/roster/shifts/[id]` — delete shift (admin/coord)
- `POST /api/roster/publish` — body: `{ serviceId, weekStart }` — flips all `status: "draft"` shifts in that service+week to `"published"`, sets `publishedAt`, creates `ROSTER_PUBLISHED` UserNotifications for each affected `userId`
- `POST /api/roster/copy-week` — body: `{ serviceId, sourceWeekStart, targetWeekStart }` — duplicates shifts from source week to target week with `status: "draft"`. Idempotent — re-running replaces target week's draft shifts (but never published shifts).

**Auth**: all `withApiAuth`. Access rules:
- Admin / head_office / owner: any service
- Coordinator: own service only (derived from `User.serviceId`)
- Others: 403

**Tests**: auth, validation, happy path, coordinator-scope, publish triggers notifications, copy-week doesn't clobber published shifts.

---

### Commit 5: `feat(roster): builder grid in ServiceWeeklyRosterTab Shifts sub-pill`

**UI structure**: `ServiceWeeklyRosterTab` gets sub-pills inside it:
- "Bookings" — existing content (children per session per day)
- "Shifts" — new roster builder

**Shifts sub-pill** (rows=staff, cols=Mon–Fri):
- Header: week picker (← / →), "Copy last week" button, "Publish" button (admin/coord only)
- Left column: staff avatars + names (scoped to this service)
- Cells: click empty → opens `<ShiftEditModal>` for create. Click a `<ShiftChip>` → edit/delete
- Bottom row per day: `<RatioBadge>` for BSC + ASC + VC showing ratio vs. booked children count (from existing booking query)
- Draft shifts visually distinct (dashed border)
- Empty state: "No shifts rostered for this week — click a cell to create"

**Staff view** (role=staff/member/marketing): same grid but read-only; no modal, no publish button, no copy-week.

**URL-synced**: `?tab=roster&sub=bookings|shifts`.

**Files**: `ServiceWeeklyRosterTab.tsx` (extended), new `src/components/services/ServiceWeeklyShiftsGrid.tsx`.

---

### Commit 6: `feat(roster): staff self-view — my-portal + Overview tab + /roster/me`

**`/my-portal` "My Upcoming Shifts" card**:
- Fetches `/api/roster/shifts?userId=self&from=today&to=+7d`
- List of next 7 days shifts with `<ShiftChip>`
- Empty state: "No upcoming shifts rostered"

**`/staff/[id]` Overview tab**:
- Replace the 3a "Next Shift — Coming soon" placeholder with actual next shift (earliest published shift with date >= today for this user)

**`/roster/me` page**:
- Read-only week view of own shifts
- Week picker (← / →)
- Plus any pending shift-swap requests targeted at the user (from commit 8)
- Access: self-only (staff) or admin (viewing any user's roster by `?userId=X`)

**Files**: extend `my-portal/page.tsx`, `OverviewTab.tsx`, new `/roster/me/page.tsx` + content.

---

### Commit 7: `feat(api): ShiftSwapRequest CRUD + accept + approve + reject routes`

**Routes**:

- `POST /api/shift-swaps` — body: `{ shiftId, targetId, reason? }` — creates `ShiftSwapRequest{status:"proposed"}` + creates `SHIFT_SWAP_PROPOSED` notification for target. Proposer must be the shift's current `userId`.
- `POST /api/shift-swaps/[id]/accept` — target user accepts → `status:"accepted"`, `acceptedAt:now()` + `SHIFT_SWAP_ACCEPTED` notification for proposer + admin/coord(s) at service
- `POST /api/shift-swaps/[id]/reject` — body: `{ reason? }` — target rejects → `status:"rejected"`, `rejectedAt`, `rejectedReason` + `SHIFT_SWAP_REJECTED` notification for proposer
- `POST /api/shift-swaps/[id]/approve` — admin/coord approves an accepted swap → `status:"approved"`, `approvedAt`, `approvedById` + **swaps RosterShift.userId** (proposer's shift now points to target) + `SHIFT_SWAP_APPROVED` notifications for proposer and target
- `POST /api/shift-swaps/[id]/cancel` — proposer cancels while still "proposed" → `status:"cancelled"`
- `GET /api/shift-swaps?status=X&scope=mine|service|all` — list (scoped by role)

**Auth**:
- Propose: any staff where `shift.userId === session.user.id`
- Accept/Reject: only the `targetId` user
- Approve: admin/head_office/owner OR coordinator at shift's service
- Cancel: only the `proposerId` user and only while `status === "proposed"`

**Tests**: full state machine — propose → accept → approve; propose → reject; propose → cancel. Auth matrix for each transition.

---

### Commit 8: `feat(roster): shift swap UI`

**Staff UI**: on any ShiftChip where `shift.userId === session.user.id`, add context menu action "Request swap":
- Opens dialog: pick target staff (dropdown of staff at service) + optional reason
- Submit → POST /api/shift-swaps

**Target UI**: NotificationPopover shows `SHIFT_SWAP_PROPOSED` with inline Accept / Reject actions (or navigate to `/roster/me` where pending swaps are listed with actions)

**Admin UI**: new `/roster/swaps` inbox page showing all "accepted" swaps awaiting approval. Table with: proposer, target, shift detail, reason, "Approve" / "Reject" buttons. Access: admin + coord (service-scoped).

**Files**: context-menu extension in `ShiftChip` (or a new `ShiftSwapButton.tsx`), `ShiftSwapDialog.tsx`, `/roster/swaps/page.tsx`, extend NotificationPopover with inline actions.

---

### Commit 9: `refactor(lib): extract roster-ratio helper + inline warnings`

**Purpose**: the `shift-gap-detector` cron already computes ratios. Extract the logic to `src/lib/roster-ratio.ts` so the roster builder grid can reuse it.

```ts
export const RATIO_THRESHOLD = 13;

export interface RatioResult {
  status: "none" | "ok" | "warning" | "breach";
  ratio: number | null;
  message: string;
}

export function computeRatio(staffCount: number, childrenCount: number): RatioResult {
  if (childrenCount === 0) return { status: "none", ratio: null, message: "No children — no coverage needed" };
  if (staffCount === 0) return { status: "breach", ratio: Infinity, message: "No staff rostered" };
  const ratio = childrenCount / staffCount;
  if (ratio > RATIO_THRESHOLD) return { status: "breach", ratio, message: `${ratio.toFixed(1)}:1 exceeds 1:${RATIO_THRESHOLD}` };
  if (ratio > RATIO_THRESHOLD * 0.85) return { status: "warning", ratio, message: `${ratio.toFixed(1)}:1 near limit` };
  return { status: "ok", ratio, message: `${ratio.toFixed(1)}:1 within limit` };
}
```

Update `shift-gap-detector/route.ts` to import this helper. Update `RatioBadge` (Commit 3) to use this helper (retrofit).

---

### Commit 10: `feat(notifications): wire 5 new roster notification types`

Extend `src/lib/notification-types.ts`:
```ts
// ... existing ...
ROSTER_PUBLISHED: "roster_published",
SHIFT_SWAP_PROPOSED: "shift_swap_proposed",
SHIFT_SWAP_ACCEPTED: "shift_swap_accepted",
SHIFT_SWAP_APPROVED: "shift_swap_approved",
SHIFT_SWAP_REJECTED: "shift_swap_rejected",
```

Wire at the trigger points (routes built in commits 4 + 7). Link format: `/roster/me?highlight=<shiftId>` or `/roster/swaps?id=<swapId>`.

No new UI — reuses the 3a bell + popover infrastructure.

---

### Commit 11: `feat(team): extend Action Required widget with shift-swaps-pending count`

**Purpose**: admins/coordinators need visibility over swaps awaiting their approval.

Extend `/api/team/action-counts` to also return `shiftSwapsPending: number` (count of `ShiftSwapRequest{status:"accepted"}`, scoped to admin=org-wide, coord=own service).

Extend `ActionRequiredWidget` to show the 4th stat card. Link → `/roster/swaps?filter=pending`.

---

## Testing & verification plan

**Per commit**: `npm test -- --run`, `npx tsc --noEmit`, `npm run lint`. All must pass. Per-commit Acceptance sections above.

**End-of-PR smoke** (manual):
1. As admin: open service detail → Weekly Roster tab → Shifts sub-pill → create shift → save → reload, verify shift appears
2. Click "Publish" → verify staff receives notification (bell badge + popover entry)
3. As staff: open `/my-portal` → "My Upcoming Shifts" card shows the shift
4. Right-click own shift → Request swap → pick target → submit → target gets notification
5. As target: Accept swap → proposer + coords get notifications
6. As admin: `/roster/swaps` inbox → Approve → RosterShift.userId now swapped; both parties notified
7. Ratio badge updates live as shifts are added/removed

## Out of scope (deferred to future sub-projects)

- **Recurring shift patterns / templates** (e.g. "every Monday 8am-10am coordinator")
- **AI roster suggestions** UI integration (template exists; integration is a separate sub-project)
- **Coverage heatmap / analytics** (hours per staff, cost projection)
- **OWNA sync disable** — keep running in parallel during migration; disable in a later cleanup sub-project once dashboard roster is stable
- **Bulk CSV import** of shifts
- **Roster export** (PDF / Excel)
- **Shift trading marketplace** (open-shifts listing, first-come-first-served claim)
- **Leave integration on the grid** (show staff on leave as unavailable cells)

## Decisions (previously open questions)

1. **Sub-pill location**: `ServiceWeeklyRosterTab` gets two sub-pills — "Bookings" (existing) and "Shifts" (new). Service-level roster matches actual business model.
2. **Swap approval**: 3-step — staff proposes → target accepts → admin approves.
3. **Legacy staffName migration**: exact-equality match by `User.name` (case-sensitive first, case-insensitive fallback). Unmatched rows stay `userId=null`.
4. **`RosterShift.status` default**: `"published"` — OWNA-synced rows remain visible without migration work.
5. **Ratio threshold**: 1:13, matching existing `shift-gap-detector`. Warning at 85% of threshold (`~11:1`).
6. **OWNA coexistence**: OWNA sync cron continues running. Dashboard-created and OWNA-created shifts can coexist (distinguished by `createdById` presence).

## Acceptance criteria — sub-project done when

- [ ] All 11 commits landed on `feat/staff-rostering-3b-2026-04-21`
- [ ] Schema migration applied (local + Neon verification pre-merge)
- [ ] Legacy `RosterShift.userId` backfilled with report in PR body
- [ ] `/staff/[id]` Overview "Next Shift" placeholder replaced with real data
- [ ] All 4 swap-flow transitions tested end-to-end
- [ ] `npm test`, `tsc --noEmit`, `npm run lint` all clean
- [ ] CI green on PR
- [ ] PR body includes before/after table + per-commit summary + migration instruction

## Risks & mitigations

- **Schema drift with OWNA**: new fields (`userId`, `status`, `publishedAt`, `createdById`) are additive. OWNA sync sets `staffName` + existing fields as before; it doesn't touch the new ones (they remain null). Coexistence is safe.
- **Ratio warning false positives**: children-count comes from bookings data which might be stale. Warning is advisory only — doesn't block publish.
- **Large existing component (ServiceWeeklyRosterTab, 255 lines)** becomes larger. Mitigation: new grid lives in a separate `ServiceWeeklyShiftsGrid.tsx` component; the tab file just adds sub-pill routing.
- **Migration backfill ambiguity**: if two staff share a name (e.g. two "Sarah Johnson"s), the script leaves `userId=null` and logs it. Admin reconciles manually. Fallback display remains `staffName`.
- **Swap state-machine bugs**: each transition has its own route + tests. State invariants tested (you can't approve a rejected swap, etc.).

## Rollback

Schema migration is additive — safe to keep even if feature is rolled back. Each commit is `git revert`-safe standalone. Worst-case whole-PR revert via merge-commit revert — leaves the migration applied but UI and routes removed.

---

*Document conventions per `docs/superpowers/specs/2026-04-20-dashboard-bugfix-roadmap.md`. Implementation plan will live at `docs/superpowers/plans/2026-04-21-staff-rostering-3b-plan.md`.*
