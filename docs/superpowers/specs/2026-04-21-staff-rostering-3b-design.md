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

| # | Commit subject | Category | Files touched (approx.) |
|---|---|---|---|
| 1 | `feat(schema): RosterShift userId/status + ShiftSwapRequest + migration` | Schema | `prisma/schema.prisma`, `prisma/migrations/<ts>_.../migration.sql` (2 files + generated) |
| 2 | `chore(data): backfill RosterShift.userId by staffName match` | Data migration | `scripts/one-shots/backfill-roster-userid.ts` (1 file) |
| 3 | `feat(components): ShiftChip, RatioBadge, ShiftEditModal` | Shared UI | `src/components/roster/ShiftChip.tsx`, `RatioBadge.tsx`, `ShiftEditModal.tsx` + 3 tests (6 files) |
| 4 | `feat(api): roster shift CRUD + publish + copy-week` | API | `src/app/api/roster/shifts/{route,[id]/route}.ts`, `publish/route.ts`, `copy-week/route.ts` + 4 test files (~10 files) |
| 5 | `feat(roster): builder grid in Shifts sub-pill` | Feature | `src/components/services/ServiceWeeklyRosterTab.tsx` (sub-pill router), new `ServiceWeeklyShiftsGrid.tsx`, `src/hooks/useRosterShifts.ts`, tests (~6 files) |
| 6 | `feat(roster): staff self-view` | Feature | `src/app/(dashboard)/my-portal/page.tsx` (card), new `src/components/my-portal/MyUpcomingShiftsCard.tsx`, `src/components/staff/tabs/OverviewTab.tsx` (replace placeholder), `src/app/(dashboard)/roster/me/page.tsx`, `src/lib/role-permissions.ts` (add route), tests (~5 files) |
| 7 | `feat(api): shift swap CRUD + state transitions` | API | `src/app/api/shift-swaps/{route,[id]/{accept,reject,approve,cancel}/route}.ts` + tests (~8 files) |
| 8 | `feat(roster): shift swap UI` | Feature | `src/components/roster/ShiftSwapDialog.tsx`, extend `ShiftChip.tsx` (context menu), `src/app/(dashboard)/roster/swaps/page.tsx`, extend `NotificationPopover.tsx` (inline actions), `src/lib/role-permissions.ts` (add route), tests (~7 files) |
| 9 | `refactor(lib): extract roster-ratio helper + inline warnings` | Reliability | `src/lib/roster-ratio.ts` (new), `src/app/api/cron/shift-gap-detector/route.ts` (refactor to import), `src/components/roster/RatioBadge.tsx` (retrofit) (3 files) |
| 10 | `feat(notifications): 5 new roster notification types` | Feature | `src/lib/notification-types.ts` (add 5 entries — preserves `as const` + `NotificationType` union auto-derivation), trigger wiring at call sites in commits 4 + 7 (~2 primary files + wiring) |
| 11 | `feat(team): Action Required widget + shift swaps pending` | Feature | `src/components/team/ActionRequiredWidget.tsx` (+ 4th card), `src/app/api/team/action-counts/route.ts` (+ shiftSwapsPending), tests (2-3 files) |

**Ordering rationale**: schema first (unblocks API + UI). Migration second (so userId values are present before any UI depends on them). Shared components third. Then API + UI in functional slices (builder, self-view, swaps). Helpers + notifications layered on. Team widget last.

---

### Commit 1: `feat(schema): RosterShift userId/status + ShiftSwapRequest + migration`

**Schema changes**:

```prisma
model RosterShift {
  // ... existing fields unchanged (id, serviceId, service, date, sessionType,
  //     staffName, shiftStart, shiftEnd, role, syncedAt) ...

  userId            String?
  user              User?               @relation("UserRosterShifts", fields: [userId], references: [id], onDelete: SetNull)
  status            String              @default("published")  // "draft" | "published"
  publishedAt       DateTime?                                   // when manager hit Publish; NULL for OWNA-synced rows
  createdById       String?
  createdBy         User?               @relation("CreatedRosterShifts", fields: [createdById], references: [id], onDelete: SetNull)
  shiftSwapRequests ShiftSwapRequest[]  @relation("ShiftSwapRequests")

  @@index([userId])
  @@index([userId, date])
  @@index([status])
}

model User {
  // ... existing fields + relations unchanged ...

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

**Naming convention notes** (all five new @relation names matched exactly on both sides):
- `"UserRosterShifts"` — User.rosterShifts ↔ RosterShift.user
- `"CreatedRosterShifts"` — User.createdRosterShifts ↔ RosterShift.createdBy
- `"ShiftSwapRequests"` — RosterShift.shiftSwapRequests ↔ ShiftSwapRequest.shift
- `"ProposedShiftSwaps"` — User.proposedShiftSwaps ↔ ShiftSwapRequest.proposer
- `"TargetShiftSwaps"` — User.targetShiftSwaps ↔ ShiftSwapRequest.target
- `"ApprovedShiftSwaps"` — User.approvedShiftSwaps ↔ ShiftSwapRequest.approvedBy

**`RosterShift.status` default = `"published"`** — preserves backward-compat for existing OWNA-synced rows. New dashboard-created shifts start `"draft"` until the manager publishes.

**`RosterShift.staffName` on dashboard-created shifts** — populated from `user.name` at create/update time (snapshot). This keeps the existing unique constraint `@@unique([serviceId, date, staffName, shiftStart])` working and lets the `shift-gap-detector` email templates continue to use `staffName`. If the linked user later changes name, a one-off reconciliation job can update `staffName` — not in 3b scope.

**Migration**: `npx prisma migrate dev --name add_roster_shift_user_and_swap_requests`. Additive only — no column drops, no type changes on existing fields. Existing unique constraint preserved (staffName still populated from user.name for dashboard shifts, preventing collisions).

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

**Routes + Zod body schemas**:

- `GET /api/roster/shifts?serviceId=X&weekStart=YYYY-MM-DD` — list shifts for a service + week (7 days starting weekStart, inclusive)
- `POST /api/roster/shifts` — create shift (admin/coord at service). Zod body:
  ```ts
  const createShiftSchema = z.object({
    serviceId: z.string().min(1),
    userId: z.string().min(1),              // required for dashboard-created shifts
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),  // ISO date
    sessionType: z.enum(["bsc", "asc", "vc"]),
    shiftStart: z.string().regex(/^\d{2}:\d{2}$/),  // HH:mm
    shiftEnd: z.string().regex(/^\d{2}:\d{2}$/),
    role: z.string().nullish(),
    status: z.enum(["draft", "published"]).default("draft"),
  });
  ```
  Server hydrates `staffName` from `user.name` snapshot at create time. Sets `createdById` from session user. Enforces `shiftEnd > shiftStart` validation.
- `PATCH /api/roster/shifts/[id]` — edit shift (admin/coord). Zod body: all create fields optional (partial update). If `userId` changes, re-hydrate `staffName`.
- `DELETE /api/roster/shifts/[id]` — delete shift (admin/coord). Soft-block deleting published shifts with pending `ShiftSwapRequest` — return 409.
- `POST /api/roster/publish` — body: `{ serviceId: string, weekStart: string }`. Flips all `status: "draft"` shifts in that service+week to `"published"`, sets `publishedAt`, creates `ROSTER_PUBLISHED` UserNotifications for each affected `userId` (one notification per staff member with count of their shifts for the week — not one per shift).
- `POST /api/roster/copy-week` — body: `{ serviceId: string, sourceWeekStart: string, targetWeekStart: string }`. For each shift in source week:
  - If target cell (date, userId, sessionType, shiftStart) doesn't exist → create as `status:"draft"` with new `createdById`
  - If target cell exists with `status:"draft"` → replace (delete old draft, create new)
  - If target cell exists with `status:"published"` → **skip** that shift, include in response's `skipped` array
  Response: `{ created: number, replaced: number, skipped: Array<{date, sessionType, reason}> }`

**Auth**: all `withApiAuth`. Access rules:
- Admin / head_office / owner: any service
- Coordinator: own service only — compare `session.user.serviceId === shift.serviceId` (or request body's `serviceId` for POST/copy-week/publish)
- Staff / member / marketing: 403 on mutations; 200 on GET (read-only)

**Tests**: auth per role, Zod validation, happy path CRUD, coordinator cross-service → 403, publish triggers exactly one notification per staff (not per shift), copy-week skip list correct on mixed-status target week.

---

### Commit 5: `feat(roster): builder grid in ServiceWeeklyRosterTab Shifts sub-pill`

**UI structure**: `ServiceWeeklyRosterTab` gets sub-pills inside it:
- "Bookings" — existing content (children per session per day)
- "Shifts" — new roster builder

**Shifts sub-pill** (rows=staff, cols=Mon–Fri):
- Header: week picker (← / →), "Copy last week" button, "Publish" button (admin/coord only)
- Left column: staff avatars + names. **Staff scope** = `User.findMany({ where: { serviceId: serviceId, active: true } })` — only currently-active users whose primary service matches. Order by name asc. This same query drives the `ShiftEditModal` user dropdown (Commit 3).
- Cells: click empty → opens `<ShiftEditModal>` for create. Click a `<ShiftChip>` → edit/delete
- Bottom row per day: `<RatioBadge>` for BSC + ASC + VC showing ratio vs. booked children count (from existing booking query)
- Draft shifts visually distinct (dashed border)
- Empty state: "No shifts rostered for this week — click a cell to create"
- **Leave integration (graceful degradation)**: if a staff member has an approved `LeaveRequest` overlapping this week, their row still renders (existing shifts continue to show as scheduled). Full leave-aware disabling of cells is out of scope for 3b — defer to a later sub-project.

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
- Access (`?userId=X` param): self always allowed; admin/head_office/owner can view any; coordinator can view staff at own service (same rule as `/staff/[id]` profile access); others 403

**Files**: extend `my-portal/page.tsx`, `OverviewTab.tsx`, new `/roster/me/page.tsx` + content.

**Role-permissions update** (per MEMORY.md checklist): add `/roster/me` to `allPages` in `src/lib/role-permissions.ts` AND to each non-admin role's access list in `rolePageAccess` (coordinator, member, marketing, staff).

---

### Commit 7: `feat(api): ShiftSwapRequest CRUD + accept + approve + reject routes`

**Routes + Zod schemas**:

- `POST /api/shift-swaps` — body: `{ shiftId: string, targetId: string, reason?: string }`. Creates `ShiftSwapRequest{status:"proposed"}` + creates `SHIFT_SWAP_PROPOSED` notification for target. Server validates: (a) `shift.userId === session.user.id` (proposer is the shift owner), (b) `target.serviceId === shift.serviceId` AND `target.active === true` (target must be an active staff member at the same service as the shift — same scope as the roster builder staff dropdown). Prevents spoofed inter-service or inactive-user swaps.
- `POST /api/shift-swaps/[id]/accept` — target user accepts → `status:"accepted"`, `acceptedAt:now()` + `SHIFT_SWAP_ACCEPTED` notification for proposer + one notification per admin/coordinator at the shift's service (so approvers know there's something waiting). Only `swap.targetId === session.user.id` may call this; only transitions from `"proposed"`.
- `POST /api/shift-swaps/[id]/reject` — body: `{ reason?: string }` — target rejects → `status:"rejected"`, `rejectedAt`, `rejectedReason` + `SHIFT_SWAP_REJECTED` notification for proposer. Only `swap.targetId === session.user.id`.
- `POST /api/shift-swaps/[id]/approve` — admin/coord approves an accepted swap. **Atomic via `prisma.$transaction`**: (1) update `ShiftSwapRequest` to `status:"approved"`, `approvedAt`, `approvedById`, (2) update the linked `RosterShift.userId` and `staffName` to point to the target user, (3) create `SHIFT_SWAP_APPROVED` notifications for proposer and target. All three writes succeed or none do. Enforced access: admin/head_office/owner globally, OR coordinator where `session.user.serviceId === shift.serviceId`. Only transitions from `"accepted"` (cannot approve a "proposed" or "rejected" swap).
- `POST /api/shift-swaps/[id]/cancel` — proposer cancels while still `"proposed"` → `status:"cancelled"`. Only `swap.proposerId === session.user.id`, only from `"proposed"`.
- `GET /api/shift-swaps?status=X&scope=mine|service|all` — list (scoped by role):
  - `scope=mine`: swaps where `proposerId === session.user.id OR targetId === session.user.id`
  - `scope=service`: all swaps where `shift.serviceId` matches coordinator's service (admins ignore scope)
  - `scope=all`: admin only — 403 for non-admins

**State machine** (enforced server-side):
- `proposed` → `accepted` (target) | `rejected` (target) | `cancelled` (proposer)
- `accepted` → `approved` (admin/coord) | `rejected` (admin/coord with a reason)
- `approved` / `rejected` / `cancelled` → terminal (no further transitions)

Any attempt to cross-transition (e.g. approve a `"rejected"` swap) returns 409 Conflict.

**Tests**: full state machine — propose → accept → approve atomically swaps userId; propose → reject; propose → cancel; approve with mismatched coordinator-service → 403; propose with target at different service → 400; reject an already-rejected swap → 409.

---

### Commit 8: `feat(roster): shift swap UI`

**Staff UI**: on any ShiftChip where `shift.userId === session.user.id`, add context menu action "Request swap":
- Opens dialog: pick target staff (dropdown of staff at service) + optional reason
- Submit → POST /api/shift-swaps

**Target UI**: NotificationPopover shows `SHIFT_SWAP_PROPOSED` with inline Accept / Reject actions (or navigate to `/roster/me` where pending swaps are listed with actions)

**Admin UI**: new `/roster/swaps` inbox page showing all `"accepted"` swaps awaiting approval. Table with: proposer, target, shift detail, reason, "Approve" / "Reject" buttons. Access: admin/head_office/owner see all; coordinator sees swaps at own service.

**Files**: context-menu extension in `ShiftChip` (or a new `ShiftSwapButton.tsx`), `ShiftSwapDialog.tsx`, `/roster/swaps/page.tsx`, extend NotificationPopover with inline actions.

**Role-permissions update** (per MEMORY.md checklist): add `/roster/swaps` to `allPages` in `src/lib/role-permissions.ts` AND to each role's access list that should see it (admin/owner/head_office auto via `allPages` spread; coordinator explicit entry; staff/member/marketing explicit entries — they need view access to see their own swaps).

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

**Role visibility**: the widget currently hides for `staff|member|marketing`. Keep that logic — the 4th card inherits the same visibility (visible only to admin/head_office/owner/coordinator). Staff see their swap-related notifications via the bell popover + inline actions (commits 8 + 10) instead of the team widget.

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

**Backfill data specifically**: if the sub-project is rolled back, the `userId` values populated on `RosterShift` rows remain (harmless — they're now orphan metadata since the UI stops reading `userId`, falling back to `staffName` display as before). The backfill script is idempotent — re-running after rollback is safe.

---

*Document conventions per `docs/superpowers/specs/2026-04-20-dashboard-bugfix-roadmap.md`. Implementation plan will live at `docs/superpowers/plans/2026-04-21-staff-rostering-3b-plan.md`.*
