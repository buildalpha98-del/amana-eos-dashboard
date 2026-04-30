# Staff Rostering & Shift Management Implementation Plan

> **For agentic workers:** REQUIRED: Use `superpowers:subagent-driven-development` (if subagents available) or `superpowers:executing-plans` to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship 11 stacked commits that make the dashboard source-of-truth for weekly staff rostering — builder UI per service, staff self-service view, 3-step shift swap flow, inline ratio warnings — without breaking 1168 tests. OWNA sync continues in parallel during migration.

**Architecture:** Feature branch `feat/staff-rostering-3b-2026-04-21` off local `main` (which has the reviewer-approved spec + plan docs on top of `origin/main` at `39164df`). Commits stacked dependency-first: schema → backfill → shared UI → API → builder grid → staff view → swap API → swap UI → helper refactor → notification wiring → team widget. Each commit revert-safe. Standard merge (not squash) to preserve bisect history.

**Tech Stack:** Next.js 16, TypeScript, Prisma 5.22, Vitest, Tailwind. Conventions from Sub-projects 2 + 3a: `withApiAuth` / `withApiHandler` / `parseJsonBody` / `ApiError` / `acquireCronLock` / `logger` / `ADMIN_ROLES` / `parseRole` / `isAdminRole` / `NOTIFICATION_TYPES` / `toast` from `@/hooks/useToast` / primitive-spread query keys.

**Parent spec:** [`docs/superpowers/specs/2026-04-21-staff-rostering-3b-design.md`](../specs/2026-04-21-staff-rostering-3b-design.md)

---

## File Structure Overview

| Commit | Files created | Files modified |
|---|---|---|
| 1 Schema | `prisma/migrations/<ts>_.../migration.sql` | `prisma/schema.prisma` |
| 2 Backfill | `scripts/one-shots/backfill-roster-userid.ts` | (none — script run once, committed for audit) |
| 3 Shared UI | `src/components/roster/{ShiftChip,RatioBadge,ShiftEditModal}.tsx`, 3 test files | `src/lib/cert-status.ts` pattern reused for status types if needed |
| 4 Roster API | `src/app/api/roster/shifts/{route,[id]/route}.ts`, `publish/route.ts`, `copy-week/route.ts`, 4 test files | (none) |
| 5 Builder grid | `src/components/services/ServiceWeeklyShiftsGrid.tsx`, `src/hooks/useRosterShifts.ts`, tests | `src/components/services/ServiceWeeklyRosterTab.tsx` (add sub-pill) |
| 6 Staff self-view | `src/components/my-portal/MyUpcomingShiftsCard.tsx`, `src/app/(dashboard)/roster/me/page.tsx`, tests | `src/app/(dashboard)/my-portal/page.tsx` (add card), `src/components/staff/tabs/OverviewTab.tsx` (replace placeholder), `src/lib/role-permissions.ts` (add `/roster/me`) |
| 7 Swap API | `src/app/api/shift-swaps/{route,[id]/{accept,reject,approve,cancel}/route}.ts`, 5 test files | (none) |
| 8 Swap UI | `src/components/roster/ShiftSwapDialog.tsx`, `src/app/(dashboard)/roster/swaps/page.tsx`, tests | `src/components/roster/ShiftChip.tsx` (context menu), `src/components/layout/NotificationPopover.tsx` (inline actions), `src/lib/role-permissions.ts` (add `/roster/swaps`) |
| 9 Ratio helper | `src/lib/roster-ratio.ts`, test | `src/app/api/cron/shift-gap-detector/route.ts` (import helper), `src/components/roster/RatioBadge.tsx` (retrofit) |
| 10 Notification types | (none) | `src/lib/notification-types.ts` (+5 entries) — wiring changes happen inside commits 4 + 7 |
| 11 Team widget | (none) | `src/components/team/ActionRequiredWidget.tsx` (+4th card), `src/app/api/team/action-counts/route.ts` (+shiftSwapsPending) |

No new Prisma migrations beyond commit 1. No other schema changes.

---

## Chunk 1: Setup & Baseline

### Task 1.1: Fetch, create worktree, install deps

- [ ] **Step 1: Fetch + confirm origin/main at 39164df**

Run:
```bash
git fetch origin
git log origin/main --oneline -1
```
Expected: `39164df Merge pull request #12 from buildalpha98-del/feat/staff-people-3a-2026-04-21` (or later if additional PRs landed — verify no schema drift affecting `RosterShift` or `User`).

- [ ] **Step 2: Confirm local main clean + docs-only commits ahead**

```bash
git status
git log origin/main..main --oneline
```
Expected: clean; 2 docs commits ahead (spec + plan).

- [ ] **Step 3: Create worktree off local main**

`git worktree add -b feat/staff-rostering-3b-2026-04-21 .worktrees/staff-rostering-3b main`
Expected: new worktree at `.worktrees/staff-rostering-3b/` on new branch tracking local main HEAD (includes docs commits).

- [ ] **Step 4: Switch in + install**

`cd .worktrees/staff-rostering-3b && npm ci && npx prisma generate`
Expected: npm ci completes; prisma generate prints `✔ Generated Prisma Client`.

### Task 1.2: Baseline metrics

- [ ] **Step 1: Full gate**

```bash
npm test -- --run 2>&1 | tail -5
npx tsc --noEmit 2>&1 | grep -c "error TS"
npm run lint 2>&1 | tail -3
```
Expected: 1168 passing, 0 tsc errors, lint unchanged from 3a. Record to `/tmp/3b-baseline.txt`. Any deviation blocks start.

No git commits in Chunk 1.

---

## Chunk 2: Commit 1 — Schema + ShiftSwapRequest model

### Task 2.1: Add new fields to RosterShift

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Locate RosterShift model**

`grep -n "^model RosterShift " prisma/schema.prisma` — note the line number.

- [ ] **Step 2: Add new fields inside the RosterShift model block**

Edit the model to add these fields (after existing fields, before the `@@unique` / `@@index` lines):

```prisma
  userId            String?
  user              User?               @relation("UserRosterShifts", fields: [userId], references: [id], onDelete: SetNull)
  status            String              @default("published")
  publishedAt       DateTime?
  createdById       String?
  createdBy         User?               @relation("CreatedRosterShifts", fields: [createdById], references: [id], onDelete: SetNull)
  shiftSwapRequests ShiftSwapRequest[]  @relation("ShiftSwapRequests")
```

Add three new indexes alongside the existing ones:
```prisma
  @@index([userId])
  @@index([userId, date])
  @@index([status])
```

### Task 2.2: Add ShiftSwapRequest model

- [ ] **Step 1: Add new model (place near RosterShift for readability)**

```prisma
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
  status         String       @default("proposed")
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

### Task 2.3: Add back-relations on User

- [ ] **Step 1: Locate User model**

Find the User model (~line 421). Inside its relations section add:

```prisma
  rosterShifts        RosterShift[]      @relation("UserRosterShifts")
  createdRosterShifts RosterShift[]      @relation("CreatedRosterShifts")
  proposedShiftSwaps  ShiftSwapRequest[] @relation("ProposedShiftSwaps")
  targetShiftSwaps    ShiftSwapRequest[] @relation("TargetShiftSwaps")
  approvedShiftSwaps  ShiftSwapRequest[] @relation("ApprovedShiftSwaps")
```

### Task 2.4: Format + migrate + verify

- [ ] **Step 1: Format schema**

`npx prisma format` — re-aligns columns. No semantic changes.

- [ ] **Step 2: Generate migration**

`npx prisma migrate dev --name add_roster_shift_user_and_swap_requests`

Expected: migration file created at `prisma/migrations/<timestamp>_add_roster_shift_user_and_swap_requests/migration.sql`. If shadow-DB fails (pre-existing issue from 3a), fall back to `--create-only` and proceed with manually-applied SQL workflow, like 3a did.

- [ ] **Step 3: Inspect migration.sql**

Verify the file contains:
- `ALTER TABLE "RosterShift" ADD COLUMN` × 4 (userId, status, publishedAt, createdById)
- `CREATE TABLE "ShiftSwapRequest"` with all fields + indexes
- 3 new indexes on `RosterShift` (userId, userId+date, status)
- 4 indexes on `ShiftSwapRequest`
- 7 foreign keys total (userId, createdById, shiftId, proposerId, targetId, approvedById) — 6 FKs on ShiftSwapRequest side, 2 on RosterShift side

If anything looks off, investigate before committing.

- [ ] **Step 4: Verification gate**

```bash
npx prisma generate
npm test -- --run 2>&1 | tail -5
npx tsc --noEmit 2>&1 | grep -c "error TS"
```
Expected: prisma generates cleanly; 1168 tests still pass; 0 tsc errors.

### Task 2.5: Extend NOTIFICATION_TYPES constants (in same commit as schema)

**Critical ordering fix**: commits 4 + 7 reference 5 new notification type constants. Those MUST be added here in Chunk 2 (the earliest commit that any downstream code references them). Commit 11 is then a no-op placeholder (removable if tooling permits).

**Files:**
- Modify: `src/lib/notification-types.ts`

- [ ] **Step 1: Append 5 new roster entries to the constant object**

Find `src/lib/notification-types.ts`. It currently has 9 entries (CERT_* / LEAVE_* / TIMESHEET_*). Add these at the end of the object:

```ts
  // Roster & shift management (added in Sub-project 3b)
  ROSTER_PUBLISHED: "roster_published",
  SHIFT_SWAP_PROPOSED: "shift_swap_proposed",
  SHIFT_SWAP_ACCEPTED: "shift_swap_accepted",
  SHIFT_SWAP_APPROVED: "shift_swap_approved",
  SHIFT_SWAP_REJECTED: "shift_swap_rejected",
```

The `NotificationType` union auto-derives via `typeof NOTIFICATION_TYPES[keyof typeof NOTIFICATION_TYPES]` — no type changes needed.

### Task 2.6: Commit (schema + constants together)

- [ ] **Step 1: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/ src/lib/notification-types.ts
git commit -m "$(cat <<'EOF'
feat(schema): RosterShift userId/status + ShiftSwapRequest + notification constants

Adds 4 fields to RosterShift: userId FK (optional), status default
"published" (OWNA-synced rows stay visible), publishedAt, createdById
FK. Plus shiftSwapRequests back-relation.

New ShiftSwapRequest model for the 3-step shift swap flow: proposer
→ target accepts → admin/coordinator approves. Status field tracks
state machine transitions. Indexed on proposerId, targetId, status,
shiftId for query efficiency.

User model gains 5 new back-relations: rosterShifts,
createdRosterShifts, proposedShiftSwaps, targetShiftSwaps,
approvedShiftSwaps.

Notification type constants pre-added to src/lib/notification-types.ts
(5 new entries: ROSTER_PUBLISHED, SHIFT_SWAP_PROPOSED/ACCEPTED/
APPROVED/REJECTED) so downstream API commits can reference them.

Additive schema only — no column drops, no type changes on existing
fields. Existing @@unique([serviceId, date, staffName, shiftStart])
preserved (dashboard-created shifts hydrate staffName from user.name
snapshot).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Chunk 3: Commit 2 — Backfill RosterShift.userId

### Task 3.1: Create the one-shot script

**Files:**
- Create: `scripts/one-shots/backfill-roster-userid.ts`

- [ ] **Step 1: Write the script**

```ts
#!/usr/bin/env tsx
/**
 * One-shot: backfill RosterShift.userId by exact match on staffName → User.name.
 *
 * Case-sensitive pass first; case-insensitive fallback for rows still unmatched.
 * Ambiguous matches (>1 user) leave userId=null and log to stdout.
 *
 * Usage: npx tsx scripts/one-shots/backfill-roster-userid.ts
 */
import { prisma } from "@/lib/prisma";

async function main() {
  console.log("Starting RosterShift.userId backfill...");

  const unlinkedShifts = await prisma.rosterShift.findMany({
    where: { userId: null },
    select: { id: true, staffName: true },
  });
  console.log(`Found ${unlinkedShifts.length} shifts without userId.`);

  const distinctNames = Array.from(new Set(unlinkedShifts.map((s) => s.staffName.trim())));
  console.log(`${distinctNames.length} distinct staffName values.`);

  let matched = 0;
  let multiMatch = 0;
  let unmatched = 0;

  for (const name of distinctNames) {
    // Case-sensitive first
    let users = await prisma.user.findMany({
      where: { name, active: true },
      select: { id: true, name: true },
    });

    // Case-insensitive fallback
    if (users.length === 0) {
      users = await prisma.user.findMany({
        where: { name: { equals: name, mode: "insensitive" }, active: true },
        select: { id: true, name: true },
      });
    }

    if (users.length === 1) {
      const updated = await prisma.rosterShift.updateMany({
        where: { staffName: name, userId: null },
        data: { userId: users[0].id },
      });
      matched += updated.count;
      console.log(`  Matched: "${name}" → ${users[0].id} (${updated.count} shifts)`);
    } else if (users.length > 1) {
      multiMatch++;
      console.log(`  Ambiguous (${users.length} matches): "${name}" — left unmatched`);
    } else {
      unmatched++;
      console.log(`  Unmatched: "${name}"`);
    }
  }

  console.log();
  console.log("Summary:");
  console.log(`  Shifts with userId set: ${matched}`);
  console.log(`  Ambiguous names (>1 user): ${multiMatch}`);
  console.log(`  Unmatched names (0 users): ${unmatched}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
```

- [ ] **Step 2: Make executable**

`chmod +x scripts/one-shots/backfill-roster-userid.ts`

- [ ] **Step 3: Verification gate**

Tests + tsc unchanged. (The script is not imported by runtime code.)

```bash
npm test -- --run 2>&1 | tail -3
npx tsc --noEmit 2>&1 | grep -c "error TS"
```
Expected: 1168 / 0.

### Task 3.2: Commit (do NOT run against Neon locally)

The script runs on the live Neon DB **after the PR is merged** (same pattern as 3a's migration). Committing the script alone is the deliverable for this chunk.

- [ ] **Step 1: Commit**

```bash
git add scripts/one-shots/backfill-roster-userid.ts
git commit -m "$(cat <<'EOF'
chore(data): backfill script for RosterShift.userId

One-shot TypeScript script at scripts/one-shots/backfill-roster-userid.ts
that matches staffName exact-equality (case-sensitive first, case-
insensitive fallback) to User.name for active users. Ambiguous and
unmatched names leave userId=null.

Run after migration applied to Neon:
  npx tsx scripts/one-shots/backfill-roster-userid.ts

Script logs match/multi-match/unmatched counts + per-name detail for
audit. Include output in PR body.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Chunk 4: Commit 3 — Shared roster UI primitives

### Task 4.1: ShiftChip component (TDD)

**Files:**
- Create: `src/components/roster/ShiftChip.tsx`
- Create: `src/__tests__/components/roster/ShiftChip.test.tsx`

- [ ] **Step 1: Write failing test**

```tsx
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { ShiftChip } from "@/components/roster/ShiftChip";

const baseShift = {
  id: "s1",
  userId: "u1",
  staffName: "Jane Doe",
  shiftStart: "08:00",
  shiftEnd: "10:00",
  sessionType: "asc",
  role: "coordinator",
  status: "published" as const,
};

describe("ShiftChip", () => {
  it("renders time range + staff name", () => {
    const { container } = render(<ShiftChip shift={baseShift} />);
    expect(container.textContent).toContain("Jane Doe");
    expect(container.textContent).toMatch(/8:00|08:00/);
    expect(container.textContent).toMatch(/10:00/);
  });

  it("renders role when present", () => {
    const { container } = render(<ShiftChip shift={baseShift} />);
    expect(container.textContent?.toLowerCase()).toContain("coordinator");
  });

  it("applies distinct class for sessionType", () => {
    const { container: a } = render(<ShiftChip shift={{ ...baseShift, sessionType: "bsc" }} />);
    const { container: b } = render(<ShiftChip shift={{ ...baseShift, sessionType: "asc" }} />);
    expect(a.firstChild?.className).not.toBe(b.firstChild?.className);
  });

  it("draft status shows dashed border", () => {
    const { container } = render(<ShiftChip shift={{ ...baseShift, status: "draft" }} />);
    expect(container.firstChild?.className).toMatch(/dashed/);
  });

  it("onClick fires when clicked", () => {
    const onClick = vi.fn();
    const { container } = render(<ShiftChip shift={baseShift} onClick={onClick} />);
    container.querySelector("button")?.click();
    expect(onClick).toHaveBeenCalledWith(baseShift);
  });
});
```

(Remember `import { vi } from "vitest"`.)

- [ ] **Step 2: Implement**

```tsx
"use client";

import { cn } from "@/lib/utils";

export interface ShiftChipShift {
  id: string;
  userId?: string | null;
  staffName: string;
  shiftStart: string;
  shiftEnd: string;
  sessionType: string;
  role?: string | null;
  status: "draft" | "published";
}

interface ShiftChipProps {
  shift: ShiftChipShift;
  onClick?: (shift: ShiftChipShift) => void;
  className?: string;
}

const SESSION_BG: Record<string, string> = {
  bsc: "bg-blue-50 border-blue-300 text-blue-900",
  asc: "bg-green-50 border-green-300 text-green-900",
  vc: "bg-purple-50 border-purple-300 text-purple-900",
};

export function ShiftChip({ shift, onClick, className }: ShiftChipProps) {
  const base = SESSION_BG[shift.sessionType] ?? "bg-gray-50 border-gray-300 text-gray-900";
  const border = shift.status === "draft" ? "border-dashed" : "border-solid";
  return (
    <button
      type="button"
      onClick={onClick ? () => onClick(shift) : undefined}
      className={cn(
        "inline-flex flex-col items-start text-left px-2 py-1 rounded border text-xs",
        base,
        border,
        onClick && "hover:shadow-sm cursor-pointer",
        className,
      )}
    >
      <span className="font-medium truncate max-w-full">{shift.staffName}</span>
      <span className="text-[11px] opacity-80">
        {shift.shiftStart}–{shift.shiftEnd}
      </span>
      {shift.role && <span className="text-[10px] opacity-70 capitalize">{shift.role}</span>}
    </button>
  );
}
```

- [ ] **Step 3: Run test, verify passes**

### Task 4.2: RatioBadge component (TDD)

**Files:**
- Create: `src/components/roster/RatioBadge.tsx`
- Create: `src/__tests__/components/roster/RatioBadge.test.tsx`

- [ ] **Step 1: Write test**

```tsx
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { RatioBadge } from "@/components/roster/RatioBadge";

describe("RatioBadge", () => {
  it("renders 'No coverage needed' when childrenCount=0", () => {
    const { container } = render(<RatioBadge staffCount={2} childrenCount={0} />);
    expect(container.textContent ?? "").toMatch(/no coverage|no children/i);
  });

  it("renders breach style when staffCount=0 and children>0", () => {
    const { container } = render(<RatioBadge staffCount={0} childrenCount={10} />);
    expect(container.textContent ?? "").toMatch(/no staff/i);
    expect(container.firstChild?.className).toMatch(/red|breach/i);
  });

  it("renders ok style at ratio 10:1 (well below 13)", () => {
    const { container } = render(<RatioBadge staffCount={2} childrenCount={20} />);
    expect(container.firstChild?.className).toMatch(/green|ok/i);
    expect(container.textContent ?? "").toContain("10.0");
  });

  it("renders warning at 12:1 (>85% of 13)", () => {
    const { container } = render(<RatioBadge staffCount={1} childrenCount={12} />);
    expect(container.firstChild?.className).toMatch(/amber|yellow|warning/i);
  });

  it("renders breach at 14:1 (over 13)", () => {
    const { container } = render(<RatioBadge staffCount={1} childrenCount={14} />);
    expect(container.firstChild?.className).toMatch(/red|breach/i);
  });
});
```

- [ ] **Step 2: Implement (uses placeholder logic — commit 9 extracts to `roster-ratio.ts` helper and retrofits this component)**

```tsx
import { cn } from "@/lib/utils";

const RATIO_THRESHOLD = 13;
const WARNING_FRACTION = 0.85;

type RatioStatus = "none" | "ok" | "warning" | "breach";

function compute(staff: number, children: number): { status: RatioStatus; ratio: number | null; message: string } {
  if (children === 0) return { status: "none", ratio: null, message: "No coverage needed" };
  if (staff === 0) return { status: "breach", ratio: Infinity, message: "No staff rostered" };
  const ratio = children / staff;
  if (ratio > RATIO_THRESHOLD) return { status: "breach", ratio, message: `${ratio.toFixed(1)}:1 exceeds 1:${RATIO_THRESHOLD}` };
  if (ratio > RATIO_THRESHOLD * WARNING_FRACTION) return { status: "warning", ratio, message: `${ratio.toFixed(1)}:1 near limit` };
  return { status: "ok", ratio, message: `${ratio.toFixed(1)}:1 within limit` };
}

const STYLES: Record<RatioStatus, string> = {
  none: "bg-gray-100 text-gray-600 border-gray-200",
  ok: "bg-green-100 text-green-800 border-green-200",
  warning: "bg-amber-100 text-amber-800 border-amber-200",
  breach: "bg-red-100 text-red-800 border-red-200",
};

export function RatioBadge({
  staffCount,
  childrenCount,
  className,
}: {
  staffCount: number;
  childrenCount: number;
  className?: string;
}) {
  const { status, message } = compute(staffCount, childrenCount);
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded border text-xs font-medium",
        STYLES[status],
        className,
      )}
    >
      {message}
    </span>
  );
}
```

### Task 4.3: ShiftEditModal component

**Files:**
- Create: `src/components/roster/ShiftEditModal.tsx`
- Create: `src/__tests__/components/roster/ShiftEditModal.test.tsx`

- [ ] **Step 1: Implement**

Form component opening a `<Dialog>` (reuse existing `src/components/ui/Dialog.tsx` if present; otherwise a headless-ui pattern used elsewhere). Props:

```tsx
interface ShiftEditModalProps {
  open: boolean;
  onClose: () => void;
  mode: "create" | "edit";
  shift?: { id: string; userId?: string | null; date: string; sessionType: string; shiftStart: string; shiftEnd: string; role?: string | null };
  serviceId: string;
  defaultDate?: string;
  onSaved?: () => void;
}
```

Form fields (all required except `role`):
- `userId` — `<Select>` of active staff at this service (fetch from `/api/team?service={serviceId}&role=&q=` or similar — use `useTeam({ service: serviceId })` from 3a)
- `date` — date input
- `sessionType` — select: BSC / ASC / VC
- `shiftStart` / `shiftEnd` — time inputs (HH:mm)
- `role` — optional text input

Submit:
- Create: `fetch("/api/roster/shifts", { method: "POST", body: JSON.stringify({ serviceId, ...form, status: "draft" }) })`
- Edit: `fetch(`/api/roster/shifts/${shift.id}`, { method: "PATCH", body: JSON.stringify(form) })`

On success: call `onSaved()` to trigger parent refetch, then `onClose()`. Use `toast` from `@/hooks/useToast` on success + error.

Delete button in edit mode calls `DELETE /api/roster/shifts/[id]`.

- [ ] **Step 2: Write test** — covers form render, submit calls correct endpoint, delete triggers DELETE.

### Task 4.4: Verify + commit

- [ ] **Step 1: Gate**

```bash
npm test -- --run 2>&1 | tail -5    # expect 1168 + ~15 new
npx tsc --noEmit 2>&1 | grep -c "error TS"
npm run lint 2>&1 | tail -3
```

- [ ] **Step 2: Commit**

```bash
git add src/components/roster/ src/__tests__/components/roster/
git commit -m "feat(components): ShiftChip, RatioBadge, ShiftEditModal

Three shared roster UI primitives:
- ShiftChip: compact pill showing staff, time range, role; sessionType
  color; dashed border for draft status
- RatioBadge: staff:children ratio with ok/warning/breach styling
  (threshold 1:13 per shift-gap-detector; warning at 85% buffer).
  Temporary inline logic — extracted to src/lib/roster-ratio.ts in
  Commit 9.
- ShiftEditModal: create/edit/delete form opening a Dialog; user
  dropdown scoped to active staff at service.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Chunk 5: Commit 4 — Roster shift CRUD + publish + copy-week API

### Task 5.1: GET /api/roster/shifts (list)

**Files:**
- Create: `src/app/api/roster/shifts/route.ts`
- Create: `src/__tests__/api/roster-shifts.test.ts`

- [ ] **Step 1: Write test (auth, happy path, filters)**

```ts
describe("GET /api/roster/shifts", () => {
  beforeEach(() => {
    _clearUserActiveCache();
    vi.clearAllMocks();
  });

  it("401 without session", async () => {
    mockNoSession();
    const res = await GET(createRequest("GET", "/api/roster/shifts?serviceId=s1&weekStart=2026-04-21"));
    expect(res.status).toBe(401);
  });

  it("returns shifts filtered by service + week", async () => {
    mockSession({ id: "u1", role: "admin" });
    prisma.user.findUnique.mockResolvedValue({ id: "u1", active: true, role: "admin" });
    prisma.rosterShift.findMany.mockResolvedValue([]);
    const res = await GET(createRequest("GET", "/api/roster/shifts?serviceId=s1&weekStart=2026-04-21"));
    expect(res.status).toBe(200);
    expect(prisma.rosterShift.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          serviceId: "s1",
          date: expect.objectContaining({ gte: expect.any(Date), lte: expect.any(Date) }),
        }),
      }),
    );
  });

  it("400 if weekStart missing or malformed", async () => {
    mockSession({ id: "u1", role: "admin" });
    prisma.user.findUnique.mockResolvedValue({ id: "u1", active: true, role: "admin" });
    const res = await GET(createRequest("GET", "/api/roster/shifts?serviceId=s1"));
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Implement**

```ts
import { NextResponse } from "next/server";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-error";

export const GET = withApiAuth(async (req) => {
  const { searchParams } = new URL(req.url);
  const serviceId = searchParams.get("serviceId");
  const weekStart = searchParams.get("weekStart");

  if (!serviceId || !weekStart || !/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
    throw ApiError.badRequest("serviceId and weekStart (YYYY-MM-DD) required");
  }

  const start = new Date(weekStart);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);

  const shifts = await prisma.rosterShift.findMany({
    where: {
      serviceId,
      date: { gte: start, lt: end },
    },
    orderBy: [{ date: "asc" }, { shiftStart: "asc" }],
    include: {
      user: { select: { id: true, name: true, avatar: true } },
    },
  });

  return NextResponse.json({ shifts });
});
```

### Task 5.2: POST /api/roster/shifts (create)

- [ ] **Step 1: Add POST handler to same file**

```ts
import { z } from "zod";
import { parseJsonBody } from "@/lib/api-error";
import { isAdminRole } from "@/lib/role-permissions";

const createShiftSchema = z.object({
  serviceId: z.string().min(1),
  userId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  sessionType: z.enum(["bsc", "asc", "vc"]),
  shiftStart: z.string().regex(/^\d{2}:\d{2}$/),
  shiftEnd: z.string().regex(/^\d{2}:\d{2}$/),
  role: z.string().nullish(),
  status: z.enum(["draft", "published"]).default("draft"),
});

export const POST = withApiAuth(async (req, session) => {
  const body = await parseJsonBody(req);
  const parsed = createShiftSchema.safeParse(body);
  if (!parsed.success) throw ApiError.badRequest("Invalid input", parsed.error.flatten());
  const data = parsed.data;

  // Validate shift times
  if (data.shiftStart >= data.shiftEnd) {
    throw ApiError.badRequest("shiftEnd must be later than shiftStart");
  }

  // Coordinator scope check
  const role = session.user.role ?? "";
  if (!isAdminRole(role)) {
    if (role !== "coordinator" || session.user.serviceId !== data.serviceId) {
      throw ApiError.forbidden();
    }
  }

  // Hydrate staffName from user.name snapshot
  const user = await prisma.user.findUnique({
    where: { id: data.userId },
    select: { name: true, serviceId: true },
  });
  if (!user) throw ApiError.notFound("User not found");

  const shift = await prisma.rosterShift.create({
    data: {
      serviceId: data.serviceId,
      userId: data.userId,
      staffName: user.name,
      date: new Date(data.date),
      sessionType: data.sessionType,
      shiftStart: data.shiftStart,
      shiftEnd: data.shiftEnd,
      role: data.role ?? null,
      status: data.status,
      createdById: session.user.id,
    },
  });

  return NextResponse.json({ shift }, { status: 201 });
});
```

- [ ] **Step 2: Write tests** — happy path, bad body → 400, shift times invalid → 400, coordinator cross-service → 403, admin any → 201.

### Task 5.3: PATCH + DELETE /api/roster/shifts/[id]

**Files:**
- Create: `src/app/api/roster/shifts/[id]/route.ts`
- Extend: `src/__tests__/api/roster-shifts.test.ts`

- [ ] **Step 1: Implement PATCH (partial update)**

Similar pattern to POST but all fields optional via `.partial()` Zod. If `userId` changes, re-hydrate `staffName`. Coordinator scope: check `session.user.serviceId === shift.serviceId` on the loaded shift.

- [ ] **Step 2: Implement DELETE**

Admin/coord only (same scope check). Before deleting, check if shift has any `ShiftSwapRequest` with status in `("proposed", "accepted")` — return 409 with message "Cannot delete shift with pending swap request". Else delete.

### Task 5.4: POST /api/roster/publish

**Files:**
- Create: `src/app/api/roster/publish/route.ts`

- [ ] **Step 1: Implement**

```ts
import { NextResponse } from "next/server";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { isAdminRole } from "@/lib/role-permissions";
import { NOTIFICATION_TYPES } from "@/lib/notification-types";
import { z } from "zod";

const publishSchema = z.object({
  serviceId: z.string().min(1),
  weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const POST = withApiAuth(async (req, session) => {
  const body = await parseJsonBody(req);
  const parsed = publishSchema.safeParse(body);
  if (!parsed.success) throw ApiError.badRequest("Invalid input", parsed.error.flatten());
  const { serviceId, weekStart } = parsed.data;

  const role = session.user.role ?? "";
  if (!isAdminRole(role)) {
    if (role !== "coordinator" || session.user.serviceId !== serviceId) {
      throw ApiError.forbidden();
    }
  }

  const start = new Date(weekStart);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);

  // Use transaction: flip draft → published AND create notifications atomically
  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.rosterShift.updateMany({
      where: {
        serviceId,
        date: { gte: start, lt: end },
        status: "draft",
      },
      data: { status: "published", publishedAt: new Date() },
    });

    // Gather unique userIds affected in this week
    const shifts = await tx.rosterShift.findMany({
      where: { serviceId, date: { gte: start, lt: end }, status: "published" },
      select: { userId: true },
    });
    const userIds = Array.from(new Set(shifts.map((s) => s.userId).filter((id): id is string => Boolean(id))));

    // One notification per staff — not per shift
    const notifs = userIds.map((userId) => ({
      userId,
      type: NOTIFICATION_TYPES.ROSTER_PUBLISHED,
      title: "Your roster for the week is published",
      body: `View your shifts for week of ${weekStart}`,
      link: `/roster/me?weekStart=${weekStart}`,
    }));
    if (notifs.length > 0) {
      await tx.userNotification.createMany({ data: notifs });
    }

    return { publishedCount: updated.count, notificationsSent: notifs.length };
  });

  return NextResponse.json(result);
});
```

- [ ] **Step 2: Write tests** — publish flips draft → published, creates notifications once per staff, skips already-published.

### Task 5.5: POST /api/roster/copy-week

**Files:**
- Create: `src/app/api/roster/copy-week/route.ts`

- [ ] **Step 1: Implement**

Similar structure to publish. Zod body: `{ serviceId, sourceWeekStart, targetWeekStart }`. Read source-week shifts. For each:
- Compute target date = source date + (targetWeekStart - sourceWeekStart) days
- Lookup target cell using the **existing composite unique**: `@@unique([serviceId, date, staffName, shiftStart])`. Concrete Prisma lookup:
  ```ts
  const targetCell = await tx.rosterShift.findUnique({
    where: {
      serviceId_date_staffName_shiftStart: {
        serviceId: source.serviceId,
        date: targetDate,                  // Date object (not string)
        staffName: source.staffName,       // copied from source row
        shiftStart: source.shiftStart,
      },
    },
  });
  ```
  **Note**: the unique is keyed on `staffName`, not `userId` — so collisions arise on matching display name + start-time pairs. Dashboard-created shifts populate `staffName` from user snapshot so this works correctly for both OWNA + dashboard rows.
- If target doesn't exist → create as draft, `createdById: session.user.id`, copy `userId` + `staffName` + `sessionType` + `role` + time fields from source
- If target exists and is draft → `await tx.rosterShift.delete({ where: { id: targetCell.id } })` then create new (replace — keeps the audit-trail distinction between old draft and new draft)
- If target exists and is published → skip, add to response `skipped: [{ date, sessionType, staffName, reason: "target already published" }]`

Wrap the whole iteration in `prisma.$transaction` to ensure partial failures don't leave the target week half-written.

Response: `{ created: number, replaced: number, skipped: Array<{date: string, sessionType: string, staffName: string, reason: string}> }`.

- [ ] **Step 2: Write tests** — no collision → all created; draft collision → replaced; published collision → skipped list populated; mixed source+target → correct counts.

### Task 5.6: Verify + commit

- [ ] Gate: 1168 + ~25 tests; tsc 0; lint clean.

- [ ] Commit:

```bash
git add src/app/api/roster/ src/__tests__/api/roster-shifts.test.ts
git commit -m "feat(api): roster shift CRUD + publish + copy-week

5 routes wrapped in withApiAuth:
- GET /api/roster/shifts?serviceId+weekStart — list week
- POST /api/roster/shifts — create (Zod validated; coordinator
  scoped to own service; staffName hydrated from user.name)
- PATCH /api/roster/shifts/[id] — partial update; re-hydrate
  staffName if userId changes
- DELETE /api/roster/shifts/[id] — blocks on pending swap (409)
- POST /api/roster/publish — atomic: flips draft→published,
  sets publishedAt, creates one notification per affected staff
- POST /api/roster/copy-week — source→target duplication:
  creates new drafts, replaces existing drafts, skips published

Coordinator auth: cross-service → 403.
Admin/owner/head_office: global access.
State-machine invariants enforced by Zod + server checks.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Chunk 6: Commit 5 — Builder grid in Shifts sub-pill

### Task 6.1: Create hook

**Files:**
- Create: `src/hooks/useRosterShifts.ts`

- [ ] **Step 1: Implement**

```ts
import { useQuery } from "@tanstack/react-query";
import { fetchApi } from "@/lib/fetch-api";

export interface RosterShiftListItem {
  id: string;
  userId: string | null;
  staffName: string;
  date: string;  // ISO
  sessionType: string;
  shiftStart: string;
  shiftEnd: string;
  role: string | null;
  status: "draft" | "published";
  user: { id: string; name: string; avatar: string | null } | null;
}

export function useRosterShifts(serviceId: string, weekStart: string) {
  return useQuery({
    queryKey: ["roster-shifts", serviceId, weekStart],
    queryFn: () =>
      fetchApi<{ shifts: RosterShiftListItem[] }>(
        `/api/roster/shifts?serviceId=${encodeURIComponent(serviceId)}&weekStart=${encodeURIComponent(weekStart)}`,
      ),
    enabled: !!serviceId && !!weekStart,
    retry: 2,
    staleTime: 30_000,
  });
}
```

### Task 6.2: Create ServiceWeeklyShiftsGrid component

**Files:**
- Create: `src/components/services/ServiceWeeklyShiftsGrid.tsx`

- [ ] **Step 1: Implement**

High-level structure:

```tsx
"use client";

import { useState, useMemo } from "react";
import { useSession } from "next-auth/react";
import { useRosterShifts } from "@/hooks/useRosterShifts";
import { useTeam } from "@/hooks/useTeam";
import { ShiftChip } from "@/components/roster/ShiftChip";
import { RatioBadge } from "@/components/roster/RatioBadge";
import { ShiftEditModal } from "@/components/roster/ShiftEditModal";
import { StaffAvatar } from "@/components/staff/StaffAvatar";
import { Button } from "@/components/ui/Button";
import { isAdminRole } from "@/lib/role-permissions";
import { toast } from "@/hooks/useToast";

interface Props { serviceId: string; serviceName?: string; }

export function ServiceWeeklyShiftsGrid({ serviceId }: Props) {
  const { data: session } = useSession();
  const role = session?.user?.role ?? "";
  const canEdit = isAdminRole(role) || (role === "coordinator" && session?.user?.serviceId === serviceId);

  const [weekOffset, setWeekOffset] = useState(0);
  const weekStart = useMemo(() => {
    // Monday of current + offset weeks
    const d = new Date();
    const day = d.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + diff + weekOffset * 7);
    d.setHours(0, 0, 0, 0);
    return d.toISOString().split("T")[0];
  }, [weekOffset]);

  const { data: shiftsData, refetch } = useRosterShifts(serviceId, weekStart);
  const { data: teamData } = useTeam({ service: serviceId });

  const staff = useMemo(
    () => (teamData ?? []).filter((m) => m.service?.id === serviceId),
    [teamData, serviceId],
  );

  const [modalState, setModalState] = useState<{ mode: "create" | "edit"; shift?: any; date?: string } | null>(null);

  // Build grid: rows=staff, cols=5 days
  const weekDates = useMemo(() => {
    return Array.from({ length: 5 }, (_, i) => {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i);
      return d.toISOString().split("T")[0];
    });
  }, [weekStart]);

  const shiftsByUserAndDay: Record<string, Record<string, any[]>> = useMemo(() => {
    const out: Record<string, Record<string, any[]>> = {};
    for (const shift of shiftsData?.shifts ?? []) {
      if (!shift.userId) continue;
      const dateKey = new Date(shift.date).toISOString().split("T")[0];
      if (!out[shift.userId]) out[shift.userId] = {};
      if (!out[shift.userId][dateKey]) out[shift.userId][dateKey] = [];
      out[shift.userId][dateKey].push(shift);
    }
    return out;
  }, [shiftsData]);

  const handlePublish = async () => {
    try {
      const res = await fetch("/api/roster/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serviceId, weekStart }),
      });
      if (!res.ok) throw new Error("Publish failed");
      const result = await res.json();
      toast({ description: `Published ${result.publishedCount} shifts. Notified ${result.notificationsSent} staff.` });
      refetch();
    } catch (err) {
      toast({ variant: "destructive", description: err instanceof Error ? err.message : "Publish failed" });
    }
  };

  const handleCopyLastWeek = async () => {
    const prev = new Date(weekStart);
    prev.setDate(prev.getDate() - 7);
    const sourceWeekStart = prev.toISOString().split("T")[0];
    try {
      const res = await fetch("/api/roster/copy-week", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serviceId, sourceWeekStart, targetWeekStart: weekStart }),
      });
      if (!res.ok) throw new Error("Copy failed");
      const result = await res.json();
      toast({ description: `Copied: ${result.created} new, ${result.replaced} replaced, ${result.skipped.length} skipped.` });
      refetch();
    } catch (err) {
      toast({ variant: "destructive", description: err instanceof Error ? err.message : "Copy failed" });
    }
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Button onClick={() => setWeekOffset((o) => o - 1)}>←</Button>
          <span className="font-medium">Week of {weekStart}</span>
          <Button onClick={() => setWeekOffset((o) => o + 1)}>→</Button>
        </div>
        {canEdit && (
          <div className="flex gap-2">
            <Button onClick={handleCopyLastWeek}>Copy last week</Button>
            <Button onClick={handlePublish}>Publish</Button>
          </div>
        )}
      </div>

      {/* Grid */}
      <div className="overflow-x-auto">
        <table className="min-w-full border-collapse">
          <thead>
            <tr>
              <th className="text-left p-2 border">Staff</th>
              {weekDates.map((d) => (
                <th key={d} className="text-left p-2 border">
                  {new Date(d).toLocaleDateString("en-AU", { weekday: "short", day: "numeric" })}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {staff.map((member) => (
              <tr key={member.id}>
                <td className="p-2 border flex items-center gap-2">
                  <StaffAvatar user={member} size="xs" />
                  <span className="text-sm">{member.name}</span>
                </td>
                {weekDates.map((date) => (
                  <td
                    key={date}
                    className="p-1 border align-top min-h-[60px]"
                    onClick={canEdit && !shiftsByUserAndDay[member.id]?.[date]?.length
                      ? () => setModalState({ mode: "create", date })
                      : undefined}
                  >
                    <div className="flex flex-col gap-1">
                      {(shiftsByUserAndDay[member.id]?.[date] ?? []).map((s) => (
                        <ShiftChip key={s.id} shift={s} onClick={canEdit ? () => setModalState({ mode: "edit", shift: s }) : undefined} />
                      ))}
                    </div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Ratio badges per day × sessionType */}
      <div className="mt-4 grid grid-cols-6 gap-2 text-sm">
        <div></div>  {/* empty cell under staff column */}
        {weekDates.map((date) => {
          // For each day: read booked children count from existing /api/bookings/roster for this day+service
          // (the hook useRoster from 3a returns children per sessionType per day)
          // For each sessionType, compute rostered staff count
          const dayShifts = (shiftsData?.shifts ?? []).filter((s) => new Date(s.date).toISOString().split("T")[0] === date);
          const bySession = { bsc: 0, asc: 0, vc: 0 };
          for (const s of dayShifts) bySession[s.sessionType as "bsc" | "asc" | "vc"] = (bySession[s.sessionType as "bsc" | "asc" | "vc"] ?? 0) + 1;
          return (
            <div key={date} className="flex flex-col gap-1">
              {/* TODO: replace zeros with real bookedCount when wired to useRoster */}
              <RatioBadge staffCount={bySession.bsc} childrenCount={0} />
              <RatioBadge staffCount={bySession.asc} childrenCount={0} />
              <RatioBadge staffCount={bySession.vc} childrenCount={0} />
            </div>
          );
        })}
      </div>
      {/* Wiring bookedCount to the existing useRoster hook is a stretch — if time permits
          in this chunk, fetch via useRoster(serviceId, weekStart) and count children per
          session per day; otherwise initial pass uses 0 and a follow-up sub-project
          lights them up. */}

      {modalState && (
        <ShiftEditModal
          open={true}
          onClose={() => setModalState(null)}
          mode={modalState.mode}
          shift={modalState.shift}
          serviceId={serviceId}
          defaultDate={modalState.date}
          onSaved={() => { setModalState(null); refetch(); }}
        />
      )}
    </div>
  );
}
```

### Task 6.3: Integrate sub-pill into ServiceWeeklyRosterTab

**Files:**
- Modify: `src/components/services/ServiceWeeklyRosterTab.tsx`

- [ ] **Step 1: Add sub-pill state + conditional render**

Current file shows children only. Add a sub-pill toggle at top:

```tsx
import { useSearchParams, useRouter } from "next/navigation";
import { ServiceWeeklyShiftsGrid } from "./ServiceWeeklyShiftsGrid";

// Inside the component:
const searchParams = useSearchParams();
const router = useRouter();
const sub = searchParams?.get("sub") ?? "bookings";

const setSub = (next: "bookings" | "shifts") => {
  const params = new URLSearchParams(searchParams?.toString() ?? "");
  params.set("sub", next);
  router.replace(`?${params.toString()}`, { scroll: false });
};

// In the JSX, before the existing children/bookings content:
<div className="flex gap-2 mb-4">
  <button onClick={() => setSub("bookings")} className={sub === "bookings" ? "font-bold" : ""}>Bookings</button>
  <button onClick={() => setSub("shifts")} className={sub === "shifts" ? "font-bold" : ""}>Shifts</button>
</div>

{sub === "bookings" && (
  // ... existing content ...
)}

{sub === "shifts" && <ServiceWeeklyShiftsGrid serviceId={serviceId} serviceName={serviceName} />}
```

### Task 6.4: Tests + commit

- [ ] **Step 1: Component render test** for `ServiceWeeklyShiftsGrid` (mock hooks, verify staff rows render, canEdit branches).

- [ ] **Step 2: Gate + commit**

```bash
git add src/components/services/ src/hooks/useRosterShifts.ts src/__tests__/
git commit -m "feat(roster): builder grid inside Service Weekly Roster 'Shifts' sub-pill

Staff-down/days-across grid with ShiftChip cells. Click empty cell →
create shift modal; click chip → edit/delete modal. Access control:
admin/head_office/owner globally, coordinator own service, others
read-only. Header: week picker, 'Copy last week', 'Publish' buttons.

URL-synced sub-pill via ?tab=roster&sub=bookings|shifts (matches
existing service-page convention).

Staff list scoped to User.serviceId + active=true.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Chunk 7: Commit 6 — Staff self-view

### Task 7.1: MyUpcomingShiftsCard + my-portal integration

**Files:**
- Create: `src/components/my-portal/MyUpcomingShiftsCard.tsx`
- Create: `src/__tests__/components/my-portal/MyUpcomingShiftsCard.test.tsx`
- Modify: `src/app/(dashboard)/my-portal/page.tsx`

- [ ] **Step 1: Implement card**

```tsx
"use client";
import { useQuery } from "@tanstack/react-query";
import { fetchApi } from "@/lib/fetch-api";
import { ShiftChip } from "@/components/roster/ShiftChip";

export function MyUpcomingShiftsCard({ userId }: { userId: string }) {
  const { data } = useQuery({
    queryKey: ["my-shifts", userId],
    queryFn: () => {
      const today = new Date().toISOString().split("T")[0];
      const in7 = new Date();
      in7.setDate(in7.getDate() + 7);
      const weekStart = today;
      // We fetch via the list API and filter client-side; backend
      // query requires serviceId but we want cross-service; use
      // a dedicated route or server-side aggregation per spec's /roster/me page
      return fetchApi<{ shifts: any[] }>(`/api/roster/shifts/mine?from=${today}&to=${in7.toISOString().split("T")[0]}`);
    },
    enabled: !!userId,
    retry: 2,
    staleTime: 60_000,
  });

  if (!data || data.shifts.length === 0) {
    return <div className="border rounded p-4">No upcoming shifts rostered.</div>;
  }

  return (
    <div className="border rounded p-4">
      <h3 className="font-medium mb-3">My Upcoming Shifts</h3>
      <div className="flex flex-col gap-2">
        {data.shifts.map((s) => <ShiftChip key={s.id} shift={s} />)}
      </div>
    </div>
  );
}
```

### Task 7.1b: `GET /api/roster/shifts/mine` route

**Files:**
- Create: `src/app/api/roster/shifts/mine/route.ts`
- Create: `src/__tests__/api/roster-shifts-mine.test.ts`

- [ ] **Step 1: Implement route**

```ts
import { NextResponse } from "next/server";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-error";
import { z } from "zod";

const querySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const GET = withApiAuth(async (req, session) => {
  const { searchParams } = new URL(req.url);
  const parsed = querySchema.safeParse({
    from: searchParams.get("from"),
    to: searchParams.get("to"),
  });
  if (!parsed.success) {
    throw ApiError.badRequest("from and to (YYYY-MM-DD) required", parsed.error.flatten());
  }

  const shifts = await prisma.rosterShift.findMany({
    where: {
      userId: session.user.id,
      status: "published", // only show published shifts to self (drafts are manager-preview only)
      date: { gte: new Date(parsed.data.from), lte: new Date(parsed.data.to) },
    },
    orderBy: [{ date: "asc" }, { shiftStart: "asc" }],
    include: { service: { select: { id: true, name: true } } },
  });

  return NextResponse.json({ shifts });
});
```

- [ ] **Step 2: Write tests** (4 cases minimum):
  - 401 without session
  - 400 malformed / missing date params
  - 200 happy path returns self shifts only
  - Admin/coord cannot fetch another user's shifts via this route (no `?userId=` support — use the general `/api/roster/shifts?serviceId=X` for others)

- [ ] **Step 2: Add to my-portal/page.tsx**

Insert `<MyUpcomingShiftsCard userId={session.user.id} />` in the page's self-service card area.

### Task 7.2: Replace OverviewTab placeholder

**Files:**
- Modify: `src/components/staff/tabs/OverviewTab.tsx`
- Modify: `src/app/(dashboard)/staff/[id]/page.tsx` (parent server component)

**Architecture note**: `OverviewTab.tsx` is a **server component** (no `"use client"` directive). The parent page at `src/app/(dashboard)/staff/[id]/page.tsx` already fetches stats (rocks count, todos, leave balance, etc.) server-side and passes them as props. Follow the same pattern: the page fetches `nextShift` and passes it in.

- [ ] **Step 1: Add nextShift query to the parent page.tsx**

In the page's existing `Promise.all` block, add:
```ts
prisma.rosterShift.findFirst({
  where: {
    userId: targetUser.id,
    status: "published",
    date: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
  },
  orderBy: [{ date: "asc" }, { shiftStart: "asc" }],
  select: { id: true, date: true, shiftStart: true, shiftEnd: true, sessionType: true, role: true, staffName: true, userId: true, status: true },
}),
```
Pass the result as `nextShift` prop to `<OverviewTab ... nextShift={...} />`.

- [ ] **Step 2: Locate "Coming soon" placeholder in OverviewTab**

`grep -n "Coming soon\|next.shift\|Next [Ss]hift" src/components/staff/tabs/OverviewTab.tsx`

- [ ] **Step 3: Replace with nextShift display**

Add the `nextShift` prop to `OverviewTab`'s props interface. Replace the placeholder JSX with:
```tsx
{nextShift ? (
  <div>
    <div className="text-xs text-gray-500">Next Shift</div>
    <ShiftChip shift={nextShift} />
  </div>
) : (
  <div className="text-xs text-gray-400">No upcoming shifts</div>
)}
```

**Note**: `OverviewTab` stays a server component — just add one more prop. No client-side query needed.

### Task 7.3: /roster/me page + dedicated single-user component

**Files:**
- Create: `src/app/(dashboard)/roster/me/page.tsx`
- Create: `src/app/(dashboard)/roster/me/loading.tsx`
- Create: `src/components/roster/MyWeekShifts.tsx` (single-user week view, NOT the multi-staff grid)
- Modify: `src/lib/role-permissions.ts` (add `/roster/me`)

**Architecture note**: `ServiceWeeklyShiftsGrid` from Chunk 6 is a rows=staff × cols=days grid (multi-staff). `/roster/me` shows ONE user's week — a different layout (5 day columns, one row of shift chips per day). Build a separate component `MyWeekShifts.tsx` rather than overloading the multi-staff grid.

- [ ] **Step 1: Implement MyWeekShifts component**

`src/components/roster/MyWeekShifts.tsx`:
```tsx
"use client";
import { useQuery } from "@tanstack/react-query";
import { fetchApi } from "@/lib/fetch-api";
import { ShiftChip } from "@/components/roster/ShiftChip";

interface Props { userId: string; weekStart: string; }

export function MyWeekShifts({ userId, weekStart }: Props) {
  const end = new Date(weekStart); end.setDate(end.getDate() + 6);
  const endStr = end.toISOString().split("T")[0];
  const { data } = useQuery({
    queryKey: ["my-week-shifts", userId, weekStart],
    queryFn: () => fetchApi<{ shifts: any[] }>(`/api/roster/shifts/mine?from=${weekStart}&to=${endStr}`),
    retry: 2, staleTime: 30_000,
  });

  const weekDates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart); d.setDate(d.getDate() + i);
    return d.toISOString().split("T")[0];
  });

  return (
    <div className="grid grid-cols-7 gap-2">
      {weekDates.map((date) => {
        const dayShifts = (data?.shifts ?? []).filter((s) => new Date(s.date).toISOString().split("T")[0] === date);
        return (
          <div key={date} className="border rounded p-2 min-h-[80px]">
            <div className="text-xs text-gray-500 mb-1">
              {new Date(date).toLocaleDateString("en-AU", { weekday: "short", day: "numeric" })}
            </div>
            <div className="flex flex-col gap-1">
              {dayShifts.length === 0
                ? <span className="text-xs text-gray-400">Off</span>
                : dayShifts.map((s) => <ShiftChip key={s.id} shift={s} />)}
            </div>
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Implement /roster/me/page.tsx**

Server component with access rules matching `/staff/[id]` (self always; admin any; coordinator at own service; others 403). Read `?userId=X` (defaults to session.user.id). Render `<MyWeekShifts userId={...} weekStart={...} />` plus a list of pending `ShiftSwapRequest` where `targetId === userId` (fetched server-side via prisma).

- [ ] **Step 3: Add route to role-permissions.ts**

Per MEMORY.md: add `/roster/me` to `allPages` array + every role's `rolePageAccess` that needs it (admin/owner/head_office inherit via `allPages` spread — confirm by reading the file; coordinator/member/marketing/staff need explicit entries).

- [ ] **Step 2: Add route to role-permissions.ts**

Per MEMORY.md: add `/roster/me` to `allPages` + every role's `rolePageAccess` that needs it (everyone who might access their own shifts).

### Task 7.4: Commit

```bash
git add src/components/my-portal/ src/app/\(dashboard\)/roster/ src/app/api/roster/shifts/mine/ src/components/staff/tabs/OverviewTab.tsx src/app/\(dashboard\)/my-portal/page.tsx src/lib/role-permissions.ts src/__tests__/
git commit -m "feat(roster): staff self-view — my-portal card + profile overview + /roster/me

Three staff-facing surfaces wired to roster data:
- MyUpcomingShiftsCard on /my-portal (next 7 days)
- /staff/[id] Overview: replaces 3a 'Coming soon' placeholder with
  earliest-upcoming published shift
- /roster/me: full week read-only view with access control
  (self always; admin any; coordinator at same service)

New route GET /api/roster/shifts/mine for self-scoped queries.

/roster/me added to role-permissions.ts per MEMORY.md checklist.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Chunk 8: Commit 7 — Shift swap API (5 routes)

### Task 8.1: POST /api/shift-swaps (propose)

**Files:**
- Create: `src/app/api/shift-swaps/route.ts`
- Create: `src/__tests__/api/shift-swaps.test.ts`

- [ ] **Step 1: Implement**

```ts
import { NextResponse } from "next/server";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { NOTIFICATION_TYPES } from "@/lib/notification-types";
import { z } from "zod";

const proposeSchema = z.object({
  shiftId: z.string().min(1),
  targetId: z.string().min(1),
  reason: z.string().optional(),
});

export const POST = withApiAuth(async (req, session) => {
  const body = await parseJsonBody(req);
  const parsed = proposeSchema.safeParse(body);
  if (!parsed.success) throw ApiError.badRequest("Invalid input", parsed.error.flatten());
  const { shiftId, targetId, reason } = parsed.data;

  const shift = await prisma.rosterShift.findUnique({
    where: { id: shiftId },
    select: { id: true, userId: true, serviceId: true, date: true, shiftStart: true, shiftEnd: true },
  });
  if (!shift) throw ApiError.notFound("Shift not found");
  if (shift.userId !== session.user.id) throw ApiError.forbidden("Only the shift owner can propose a swap");

  // Target must be active staff at same service
  const target = await prisma.user.findUnique({
    where: { id: targetId },
    select: { id: true, name: true, active: true, serviceId: true },
  });
  if (!target) throw ApiError.notFound("Target user not found");
  if (!target.active) throw ApiError.badRequest("Target user is not active");
  if (target.serviceId !== shift.serviceId) throw ApiError.badRequest("Target must be at same service as the shift");
  if (target.id === session.user.id) throw ApiError.badRequest("Cannot swap with yourself");

  const swap = await prisma.$transaction(async (tx) => {
    const created = await tx.shiftSwapRequest.create({
      data: { shiftId, proposerId: session.user.id, targetId, reason, status: "proposed" },
    });
    await tx.userNotification.create({
      data: {
        userId: targetId,
        type: NOTIFICATION_TYPES.SHIFT_SWAP_PROPOSED,
        title: `${session.user.name ?? "A colleague"} proposed a shift swap`,
        body: `Shift on ${shift.date.toISOString().split("T")[0]} ${shift.shiftStart}–${shift.shiftEnd}`,
        link: `/roster/me?swap=${created.id}`,
      },
    });
    return created;
  });

  return NextResponse.json({ swap }, { status: 201 });
});
```

- [ ] **Step 2: Write tests** — auth, validation, cross-service target → 400, self-target → 400.

### Task 8.2: POST /api/shift-swaps/[id]/accept

- [ ] **Step 1: Implement**

```ts
export const POST = withApiAuth(async (_req, session, context) => {
  const { id } = await context!.params!;
  const swap = await prisma.shiftSwapRequest.findUnique({
    where: { id },
    include: { shift: { select: { serviceId: true, date: true, shiftStart: true, shiftEnd: true } } },
  });
  if (!swap) throw ApiError.notFound("Swap request not found");
  if (swap.targetId !== session.user.id) throw ApiError.forbidden("Only the target can accept");
  if (swap.status !== "proposed") throw ApiError.conflict(`Cannot accept a ${swap.status} swap`);

  const updated = await prisma.$transaction(async (tx) => {
    const s = await tx.shiftSwapRequest.update({
      where: { id },
      data: { status: "accepted", acceptedAt: new Date() },
    });

    // Notify proposer + coordinators/admins at the shift's service
    await tx.userNotification.create({
      data: {
        userId: swap.proposerId,
        type: NOTIFICATION_TYPES.SHIFT_SWAP_ACCEPTED,
        title: "Your shift swap was accepted",
        body: `${session.user.name ?? "Target"} accepted — awaiting admin approval`,
        link: `/roster/me?swap=${id}`,
      },
    });

    const admins = await tx.user.findMany({
      where: {
        active: true,
        OR: [
          { role: "admin" }, { role: "owner" }, { role: "head_office" },
          { role: "coordinator", serviceId: swap.shift.serviceId },
        ],
      },
      select: { id: true },
    });
    if (admins.length > 0) {
      await tx.userNotification.createMany({
        data: admins.map((a) => ({
          userId: a.id,
          type: NOTIFICATION_TYPES.SHIFT_SWAP_ACCEPTED,
          title: "Shift swap needs approval",
          body: `${swap.shift.date.toISOString().split("T")[0]} ${swap.shift.shiftStart}`,
          link: `/roster/swaps?id=${id}`,
        })),
      });
    }
    return s;
  });

  return NextResponse.json({ swap: updated });
});
```

### Task 8.3: POST /api/shift-swaps/[id]/reject

- [ ] **Step 1: Implement**

```ts
const rejectSchema = z.object({ reason: z.string().optional() });

export const POST = withApiAuth(async (req, session, context) => {
  const { id } = await context!.params!;
  const swap = await prisma.shiftSwapRequest.findUnique({ where: { id } });
  if (!swap) throw ApiError.notFound("Swap request not found");
  if (swap.targetId !== session.user.id) throw ApiError.forbidden();
  if (swap.status !== "proposed") throw ApiError.conflict(`Cannot reject a ${swap.status} swap`);

  const body = await parseJsonBody(req);
  const parsed = rejectSchema.safeParse(body);
  const reason = parsed.success ? parsed.data.reason : undefined;

  const updated = await prisma.$transaction(async (tx) => {
    const s = await tx.shiftSwapRequest.update({
      where: { id },
      data: { status: "rejected", rejectedAt: new Date(), rejectedReason: reason ?? null },
    });
    await tx.userNotification.create({
      data: {
        userId: swap.proposerId,
        type: NOTIFICATION_TYPES.SHIFT_SWAP_REJECTED,
        title: "Your shift swap was rejected",
        body: reason ?? "The target staff declined the swap",
        link: `/roster/me?swap=${id}`,
      },
    });
    return s;
  });

  return NextResponse.json({ swap: updated });
});
```

### Task 8.4: POST /api/shift-swaps/[id]/approve

- [ ] **Step 1: Implement — atomic 3-write transaction**

```ts
export const POST = withApiAuth(async (_req, session, context) => {
  const { id } = await context!.params!;
  const swap = await prisma.shiftSwapRequest.findUnique({
    where: { id },
    include: { shift: { select: { id: true, serviceId: true, userId: true } } },
  });
  if (!swap) throw ApiError.notFound("Swap request not found");
  if (swap.status !== "accepted") throw ApiError.conflict(`Cannot approve a ${swap.status} swap`);

  const role = session.user.role ?? "";
  const isAdmin = ["admin", "owner", "head_office"].includes(role);
  const isCoordForService = role === "coordinator" && session.user.serviceId === swap.shift.serviceId;
  if (!isAdmin && !isCoordForService) throw ApiError.forbidden();

  const target = await prisma.user.findUnique({ where: { id: swap.targetId }, select: { name: true } });
  if (!target) throw ApiError.notFound("Target user not found");

  // Atomic: (1) swap ShiftSwapRequest → approved, (2) swap RosterShift.userId+staffName,
  // (3) create two notifications
  const result = await prisma.$transaction(async (tx) => {
    const updatedSwap = await tx.shiftSwapRequest.update({
      where: { id },
      data: { status: "approved", approvedAt: new Date(), approvedById: session.user.id },
    });
    await tx.rosterShift.update({
      where: { id: swap.shiftId },
      data: { userId: swap.targetId, staffName: target.name },
    });
    await tx.userNotification.createMany({
      data: [
        { userId: swap.proposerId, type: NOTIFICATION_TYPES.SHIFT_SWAP_APPROVED, title: "Your shift swap was approved", body: "", link: `/roster/me?swap=${id}` },
        { userId: swap.targetId, type: NOTIFICATION_TYPES.SHIFT_SWAP_APPROVED, title: "You accepted a shift swap (approved)", body: "", link: `/roster/me?swap=${id}` },
      ],
    });
    return updatedSwap;
  });

  return NextResponse.json({ swap: result });
});
```

### Task 8.5: POST /api/shift-swaps/[id]/cancel

- [ ] **Step 1: Implement**

```ts
export const POST = withApiAuth(async (_req, session, context) => {
  const { id } = await context!.params!;
  const swap = await prisma.shiftSwapRequest.findUnique({ where: { id } });
  if (!swap) throw ApiError.notFound("Swap request not found");
  if (swap.proposerId !== session.user.id) throw ApiError.forbidden("Only proposer can cancel");
  if (swap.status !== "proposed") throw ApiError.conflict(`Cannot cancel a ${swap.status} swap`);

  const updated = await prisma.shiftSwapRequest.update({
    where: { id },
    data: { status: "cancelled" },
  });
  return NextResponse.json({ swap: updated });
});
```

### Task 8.6: GET /api/shift-swaps (list with scope)

- [ ] **Step 1: Add GET handler to `route.ts`** — accepts `?status=&scope=mine|service|all`. Filter per-role per spec.

### Task 8.7: Tests + commit

- [ ] **Step 1: Full state-machine test coverage** — happy paths + all 409 invalid transitions.

- [ ] **Step 2: Commit**

```bash
git add src/app/api/shift-swaps/ src/__tests__/api/shift-swaps.test.ts
git commit -m "feat(api): ShiftSwapRequest CRUD + state transitions

6 routes implementing the 3-step shift swap flow:
- POST /api/shift-swaps — propose (target = active staff at same
  service; not self)
- POST /api/shift-swaps/[id]/accept — target only; proposed → accepted
- POST /api/shift-swaps/[id]/reject — target only; proposed → rejected
- POST /api/shift-swaps/[id]/approve — admin/coord at service;
  accepted → approved + atomic RosterShift.userId swap
- POST /api/shift-swaps/[id]/cancel — proposer only; proposed → cancelled
- GET /api/shift-swaps?status&scope — list (scope=mine|service|all)

All mutations wrapped in prisma.$transaction. Invalid state
transitions return 409. Notifications created at each step to
relevant parties.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Chunk 9: Commit 8 — Shift swap UI

### Task 9.1: ShiftSwapDialog

**Files:**
- Create: `src/components/roster/ShiftSwapDialog.tsx`
- Create: `src/__tests__/components/roster/ShiftSwapDialog.test.tsx`

- [ ] **Step 1: Implement**

Form dialog with: target staff dropdown (scoped to same-service active staff minus self), optional reason textarea, submit button. Submits `POST /api/shift-swaps`. On success, toast + close.

- [ ] **Step 2: Write test**

At minimum: render with a shift prop; target dropdown excludes current user; submit calls fetch with correct body; error path shows destructive toast. ~3-4 cases.

### Task 9.2: Context menu on ShiftChip

**Files:**
- Modify: `src/components/roster/ShiftChip.tsx`
- Modify: `src/__tests__/components/roster/ShiftChip.test.tsx` (add cases)

- [ ] **Step 1: Extend props**

Update `ShiftChipProps` in `src/components/roster/ShiftChip.tsx`:
```ts
interface ShiftChipProps {
  shift: ShiftChipShift;
  onClick?: (shift: ShiftChipShift) => void;
  onRequestSwap?: (shift: ShiftChipShift) => void;  // NEW
  currentUserId?: string;                             // NEW — used to compute ownership
  className?: string;
}
```

- [ ] **Step 2: Show "⋯" menu only when owned by current user**

Inside the component, compute `const isOwned = currentUserId !== undefined && shift.userId === currentUserId;`. If `isOwned && onRequestSwap`, render a small menu trigger `<button>⋯</button>` inside the chip that on click calls `onRequestSwap(shift)`. Use a simple dropdown or headless-ui `<Menu>` pattern.

- [ ] **Step 3: Update existing tests + add case**

Add: "shows ⋯ menu when currentUserId matches shift.userId and onRequestSwap provided"; "does NOT show ⋯ when currentUserId mismatches".

- [ ] **Step 4: Update ServiceWeeklyShiftsGrid (Chunk 6) to pass currentUserId + onRequestSwap**

Grep for existing `<ShiftChip>` usages in `src/components/services/ServiceWeeklyShiftsGrid.tsx` and `src/components/my-portal/MyUpcomingShiftsCard.tsx` and `src/components/roster/MyWeekShifts.tsx` — pass `currentUserId={session.user.id}` and `onRequestSwap={(s) => setSwapDialogShift(s)}` where applicable.

### Task 9.3: /roster/swaps inbox

**Files:**
- Create: `src/app/(dashboard)/roster/swaps/page.tsx`
- Modify: `src/lib/role-permissions.ts` (add `/roster/swaps`)

- [ ] **Step 1: Implement**

Server component. Access check: admin + coordinator + staff (staff see own proposals; admin/coord see all service swaps). Fetches `GET /api/shift-swaps?scope=service` and displays table.

For admin/coord rows with `status=accepted`: show "Approve" / "Reject" action buttons.
For staff proposer rows with `status=proposed`: show "Cancel" button.

### Task 9.4: NotificationPopover inline actions

**Files:**
- Modify: `src/components/layout/NotificationPopover.tsx`

- [ ] **Step 1: Add Accept/Reject buttons for SHIFT_SWAP_PROPOSED notifications targeted at current user**

Parse notification.type; if `SHIFT_SWAP_PROPOSED`, render small Accept/Reject buttons that POST to the respective endpoints.

### Task 9.5: Commit

```bash
git add src/components/roster/ src/app/\(dashboard\)/roster/ src/components/layout/NotificationPopover.tsx src/lib/role-permissions.ts src/__tests__/
git commit -m "feat(roster): shift swap UI — propose, accept/reject, approve

Four UI pieces wired to the 5-route swap API:
- ShiftSwapDialog: proposer picks target + reason
- ShiftChip context menu: 'Request swap' action (only shown when
  chip.userId === currentUserId)
- /roster/swaps inbox: admin/coord sees accepted-pending-approval
  swaps with Approve/Reject; staff sees own proposals
- NotificationPopover: inline Accept/Reject on SHIFT_SWAP_PROPOSED
  for targets

/roster/swaps added to role-permissions.ts per MEMORY.md.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Chunk 10: Commit 9 — Extract roster-ratio helper

### Task 10.1: Create src/lib/roster-ratio.ts

**Files:**
- Create: `src/lib/roster-ratio.ts`
- Create: `src/__tests__/lib/roster-ratio.test.ts`

- [ ] **Step 1: Write test**

```ts
import { describe, it, expect } from "vitest";
import { computeRatio, RATIO_THRESHOLD } from "@/lib/roster-ratio";

describe("computeRatio", () => {
  it("none when no children", () => {
    expect(computeRatio(2, 0).status).toBe("none");
  });
  it("breach when no staff and has children", () => {
    expect(computeRatio(0, 10).status).toBe("breach");
  });
  it("ok when ratio well below threshold", () => {
    expect(computeRatio(3, 20).status).toBe("ok");
  });
  it("warning near threshold (above 85% buffer)", () => {
    // 12/1 = 12; 12 > 13*0.85 = 11.05 and 12 <= 13
    expect(computeRatio(1, 12).status).toBe("warning");
  });
  it("breach when over threshold", () => {
    expect(computeRatio(1, 14).status).toBe("breach");
  });
  it("respects RATIO_THRESHOLD export", () => {
    expect(RATIO_THRESHOLD).toBe(13);
  });
});
```

- [ ] **Step 2: Implement**

```ts
export const RATIO_THRESHOLD = 13;
const WARNING_FRACTION = 0.85;

export type RatioStatus = "none" | "ok" | "warning" | "breach";

export interface RatioResult {
  status: RatioStatus;
  ratio: number | null;
  message: string;
}

export function computeRatio(staffCount: number, childrenCount: number): RatioResult {
  if (childrenCount === 0) return { status: "none", ratio: null, message: "No children — no coverage needed" };
  if (staffCount === 0) return { status: "breach", ratio: Infinity, message: "No staff rostered" };
  const ratio = childrenCount / staffCount;
  if (ratio > RATIO_THRESHOLD) return { status: "breach", ratio, message: `${ratio.toFixed(1)}:1 exceeds 1:${RATIO_THRESHOLD}` };
  if (ratio > RATIO_THRESHOLD * WARNING_FRACTION) return { status: "warning", ratio, message: `${ratio.toFixed(1)}:1 near limit` };
  return { status: "ok", ratio, message: `${ratio.toFixed(1)}:1 within limit` };
}
```

### Task 10.2: Refactor shift-gap-detector cron

**Files:**
- Modify: `src/app/api/cron/shift-gap-detector/route.ts`

- [ ] **Step 1: Replace inline ratio logic with helper**

Find the ratio-computation block (around `RATIO_THRESHOLD = 13`) and replace with `import { computeRatio, RATIO_THRESHOLD } from "@/lib/roster-ratio"`. Use `computeRatio` to classify shifts.

### Task 10.3: Retrofit RatioBadge

**Files:**
- Modify: `src/components/roster/RatioBadge.tsx`

- [ ] **Step 1: Remove inline `compute` function**

Replace with `import { computeRatio } from "@/lib/roster-ratio"`. Use it for classification.

### Task 10.4: Commit

```bash
git add src/lib/roster-ratio.ts src/__tests__/lib/roster-ratio.test.ts src/app/api/cron/shift-gap-detector/route.ts src/components/roster/RatioBadge.tsx
git commit -m "refactor(lib): extract computeRatio to src/lib/roster-ratio.ts

Consolidates staff:children ratio math that had been duplicated in:
- shift-gap-detector cron
- RatioBadge component (temporarily inlined in Chunk 3)

Single source of truth at src/lib/roster-ratio.ts with unit tests
covering boundary cases (none / ok / warning / breach).

RATIO_THRESHOLD = 13 exported for any other consumers.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Chunk 11: No-op — constants moved to Chunk 2

**Status**: this chunk's original content (adding 5 new entries to `NOTIFICATION_TYPES`) has been **folded into Chunk 2** as Task 2.5 to fix a plan-reviewer-flagged ordering bug: commits 5 + 8 reference these constants and would otherwise fail the `tsc --noEmit` gate before Chunk 11 lands.

### Task 11.1: Verify constants are already in place

- [ ] **Step 1: Sanity check**

```bash
grep -c "ROSTER_PUBLISHED\|SHIFT_SWAP_PROPOSED\|SHIFT_SWAP_ACCEPTED\|SHIFT_SWAP_APPROVED\|SHIFT_SWAP_REJECTED" src/lib/notification-types.ts
```
Expected: 5. If any are missing, fall back to appending them here (would indicate Chunk 2 Task 2.5 was skipped).

No commit — this is a verification-only chunk. The resulting PR will have **10 feature commits** (not 11) plus docs commits.

---

## Chunk 12: Commit 11 — Team widget extension

### Task 12.1: Extend action-counts API

**Files:**
- Modify: `src/app/api/team/action-counts/route.ts`

- [ ] **Step 1: Add shiftSwapsPending count**

```ts
const shiftSwapsPending = await prisma.shiftSwapRequest.count({
  where: {
    status: "accepted",
    ...(coordinatorScope ? { shift: { serviceId: coordinatorScope.serviceId } } : {}),
  },
});

return NextResponse.json({ certsExpiring, leavePending, timesheetsPending, shiftSwapsPending });
```

### Task 12.2: Extend ActionRequiredWidget

**Files:**
- Modify: `src/components/team/ActionRequiredWidget.tsx`

- [ ] **Step 1: Confirm current grid class**

Before editing, `grep -n "grid-cols" src/components/team/ActionRequiredWidget.tsx` to verify the current column count (expected: `md:grid-cols-3` from 3a's 3-card implementation).

- [ ] **Step 2: Add 4th card**

New interface field `shiftSwapsPending: number` on the ActionCounts type. Update the grid class from `md:grid-cols-3` to `md:grid-cols-4`. Add 4th `<Link>` card mirroring the existing 3 (Calendar icon + count + description). Link: `/roster/swaps?filter=pending`.

Widget visibility rule (role hide for staff/member/marketing) unchanged — coordinators + admins still see all 4 cards.

### Task 12.3: Tests

- [ ] Extend `src/__tests__/components/team/ActionRequiredWidget.test.tsx` — 4th card rendering, hides when count=0.
- [ ] Extend `src/__tests__/api/team-action-counts.test.ts` — includes shiftSwapsPending in response.

### Task 12.4: Commit

```bash
git add src/app/api/team/action-counts/route.ts src/components/team/ActionRequiredWidget.tsx src/__tests__/
git commit -m "feat(team): Action Required widget + shift swaps pending count

4th stat card on /team widget for admins/coordinators:
- 'N shift swaps pending approval' → links to
  /roster/swaps?filter=pending

Coordinator scope uses shift.serviceId relation.
Widget visibility unchanged (hidden for staff/member/marketing).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Chunk 13: Final verification + PR

### Task 13.1: Verification sweep

- [ ] **Step 1: Commits on branch**

`git log origin/main..HEAD --oneline` → 11 feature commits + 2 docs commits = 13 total.

- [ ] **Step 2: Full gate**

```bash
npm test -- --run 2>&1 | tail -10      # expect 1168 + ~60+ new
npx tsc --noEmit 2>&1 | grep -c "error TS"   # 0
npm run lint 2>&1 | tail -3
```

- [ ] **Step 3: Audits**

```bash
# Migration file present
ls prisma/migrations/ | grep add_roster_shift_user

# Backfill script committed
ls scripts/one-shots/backfill-roster-userid.ts

# /roster/me + /roster/swaps in role-permissions
grep -c "/roster/me\|/roster/swaps" src/lib/role-permissions.ts
```

- [ ] **Step 4: Manual smoke**

If time permits: dev server → log in as admin → visit a service → Weekly Roster tab → Shifts sub-pill → create shift → verify saved. Publish → verify as staff login sees notification. Swap propose → accept → approve flow end-to-end.

### Task 13.2: Push + open PR

- [ ] **Step 1: Push**

`git push -u origin feat/staff-rostering-3b-2026-04-21`

- [ ] **Step 2: Open PR**

`gh pr create` with title `feat: staff rostering part 2 (3b) — dashboard-first builder, swap flow, ratio warnings` and body:
- Summary paragraph: dashboard becomes source of truth for rostering; OWNA coexists during migration
- Before/after table (models added, routes added, tests before/after)
- Per-commit list (11 commits)
- Known follow-ups (AI suggestions, recurring patterns, CSV import, analytics, OWNA disable)
- **Migration instructions**: the migration SQL file needs to be applied to Neon BEFORE merge (same pattern as 3a); after merge, run backfill script `npx tsx scripts/one-shots/backfill-roster-userid.ts` against Neon with the output pasted into the PR

### Task 13.3: Apply migration to Neon + run backfill

After PR review but before merge:
- [ ] **Step 1: Get migration SQL from the committed file + paste to Jayden** (same flow as 3a — he runs it in Neon SQL editor)
- [ ] **Step 2: After Jayden confirms migration applied, run backfill script** locally with `.env` DATABASE_URL pointing at Neon; paste output into PR body
- [ ] **Step 3: Verify schema via psql** — tables, indexes, FKs present

### Task 13.4: Merge + cleanup

After CI green + migration applied:
- [ ] **Step 1: Merge**: `gh pr merge <PR-number> --merge`
- [ ] **Step 2: Cleanup**:
```bash
git worktree remove .worktrees/staff-rostering-3b
git branch -D feat/staff-rostering-3b-2026-04-21
git fetch && git reset --hard origin/main
```

---

## Acceptance criteria (sub-project done when)

- [ ] All 11 commits landed on `feat/staff-rostering-3b-2026-04-21`
- [ ] Each commit's per-commit Acceptance section met
- [ ] `npm test`, `tsc --noEmit` (=0), `npm run lint` all clean
- [ ] Prisma migration applied to Neon + backfill script run
- [ ] `/roster/me` and `/roster/swaps` added to `src/lib/role-permissions.ts`
- [ ] CI green on PR
- [ ] Manual smoke: roster publish + shift swap full flow end-to-end
- [ ] PR body includes before/after table + per-commit summary + migration/backfill instructions

## Risk mitigations

- **Schema migration**: additive only (additive columns + new table). Safe to apply ahead of code.
- **Coexistence with OWNA sync**: new fields default to null / "published" so OWNA-populated rows behave identically. Dashboard-created shifts set `createdById` + `status="draft"` to distinguish.
- **Unique constraint** preserved via `staffName = user.name` hydration on dashboard-created shifts.
- **Atomic approve transaction**: all 3 writes in `$transaction` — no partial state on approval.
- **State-machine enforcement**: 409 returned on invalid cross-transition (e.g. approve a rejected swap).
- **Backfill ambiguity**: name collisions leave `userId=null` (logged). Admin can manually reconcile; display falls back to `staffName`.

## Rollback

Each commit is `git revert`-safe standalone. Schema migration is additive — safe to keep even after rollback. Worst case: whole-PR revert via merge-commit revert; leaves schema applied but UI/routes removed.
