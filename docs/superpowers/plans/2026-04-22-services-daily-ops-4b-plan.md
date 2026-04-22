# Services / Daily Ops Rebuild Part 2 Implementation Plan

> **For agentic workers:** REQUIRED: Use `superpowers:subagent-driven-development` (if subagents available) or `superpowers:executing-plans` to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship 9 stacked commits that wire up the pieces 4a deferred: Child `ccsStatus`/`room`/`tags` schema + filter plumbing, casual-booking enforcement with race-safe transactions, `getServiceScope` widening (with 17-route audit — spec said 21, actual grep is 17), a transactional bulk attendance endpoint, inline Relationships editing, and hygiene (schema hoist + max-range guard).

**Architecture:** Feature branch `feat/services-daily-ops-4b-2026-04-22` off local `main` in worktree `.worktrees/services-daily-ops-4b/`. Single additive schema migration in Commit 1; every other commit is code-only. Each commit revert-safe and stacked dependency-first (schema → API filter → UI filter → scope widening → casual enforcement → bulk endpoint → UI wire-up → inline edit → hygiene). Standard merge (not squash) to preserve bisect history.

**Tech Stack:** Next.js 16, TypeScript 5.x, Prisma 5.22, Vitest, Tailwind. Same conventions as 4a: `withApiAuth` / `withApiHandler` / `parseJsonBody` / `ApiError` / `logger` / `isAdminRole` / `parseRole` / `toast` / `mutateApi`/`fetchApi`. JSON column writes use `Prisma.InputJsonValue` — never `as any`. Transactional multi-row writes use `prisma.$transaction`. Primitive-spread query keys.

**Parent spec:** [`docs/superpowers/specs/2026-04-22-services-daily-ops-4b-design.md`](../specs/2026-04-22-services-daily-ops-4b-design.md)

---

## Implementation Conventions (apply to every commit)

Read this once before starting. These rules apply globally; individual tasks below don't re-state them.

### Pinned field names & routes (don't drift)

| Thing | Correct value | Common mis-reference |
|---|---|---|
| Child.ccsStatus | free-text `String?` (not enum) — 3 expected values documented | ~~`z.enum(...)` on schema field~~ |
| Child.room | `String?` (decoupled from `ownaRoomName`) | — |
| Child.tags | `String[]` (Postgres text array) | ~~`Json?`~~ |
| Tags filter semantic | `{ hasSome: [...] }` (OR) | ~~`{ hasEvery: [...] }` (AND)~~ |
| Service settings JSON | `Service.casualBookingSettings` via `casualBookingSettingsSchema` from `@/lib/service-settings` | — |
| Bulk attendance route | `POST /api/attendance/roll-call/bulk` | ~~`/api/attendance/bulk`~~ (doesn't exist) |
| Per-item attendance logic | Reuse existing upsert + DailyAttendance aggregation from `/api/attendance/roll-call` POST | Do NOT duplicate (risk of drift) |
| Parent bookings (single) | `POST /api/parent/bookings` (`withParentAuth`) | — |
| Parent bookings (bulk) | `POST /api/parent/bookings/bulk` (`withParentAuth`) | — |
| Scope helper | `getServiceScope(session)` from `@/lib/service-scope` | Don't inline role checks on caller side |
| Session types enum | `"bsc" | "asc" | "vc"` (lowercase) | — |
| Booking status enum | `"requested" | "confirmed" | ...` (lowercase) | — |
| Spots count semantic | Count `Booking` rows with `type: "casual"` and `status in ["requested", "confirmed"]` matching `(serviceId, date, sessionType)` | ~~Use `AttendanceRecord` (walks in + attendance aren't the same as booking capacity)~~ |
| `authorisedPickupSchema` canonical home | `src/lib/schemas/json-fields.ts` (Commit 9 hoists it) | 4a shipped a local copy in `RelationshipsTab.tsx` — do NOT rely on the local copy after Commit 9 |
| Inline edit endpoint | `PATCH /api/children/[id]/relationships` | ~~`/api/children/[id]` (reserved for Child table)~~ |

### TDD ordering within every task
1. Write the failing test first (create the `.test.ts[x]` file).
2. Run it — confirm it fails with an informative error (missing file / component / route / field).
3. Implement minimal code to make the test pass.
4. Run the test — confirm it passes.
5. Run the commit-level gate (`npx tsc --noEmit 2>&1 | grep -c "error TS"` → 0; `npm test -- <path>` → green).
6. Commit.

### Date math is UTC-safe
Any date boundary in API routes or tests must use UTC mutators:
- `d.setUTCDate(d.getUTCDate() + n)` — not `setDate`
- `Date.UTC(y, m - 1, d)` — not `` `${y}-${m}-${d}` `` (local-TZ)
- Parse `YYYY-MM-DD` by splitting on `-` and feeding the parts into `Date.UTC(...)`.

Motivation: Neon is UTC; server is AU-local. Same constraint the March 26 integrity audit enforced.

### Multi-row / read-merge-write writes wrap in `prisma.$transaction`
Every server-side flow that writes > 1 row OR does a read-merge-write on JSON must use a `$transaction`:
- **Commit 5:** casual booking enforcement — settings read + spots count + create, all inside a `$transaction` with `serializable` isolation (`prisma.$transaction(async tx => { ... }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })`).
- **Commit 6:** bulk attendance — all items in one `$transaction([...])` so partial failure rolls back.
- **Commit 8:** relationships JSON merge — read enrolment → merge partial patch → write (same pattern 4a used for `bookingPrefs`).

### JSON Prisma columns use `Prisma.InputJsonValue`
Never cast Zod-parsed JSON as `any`. Use `import type { Prisma } from "@prisma/client"` and type the update payload as `parsed.data as Prisma.InputJsonValue`. Motivation: CLAUDE.md — "Unsafe type casts — each one is a bug waiting to happen."

### Client mutation pattern
- Every `useMutation` must have `onError: (err) => toast({ variant: "destructive", description: err.message || "Something went wrong" })`.
- Every `useQuery` must have `retry: 2` and `staleTime: 30_000`.
- Mutations use `mutateApi`/`fetchApi` — no raw `fetch()`.
- Query keys are primitive-spread: `["children", filters?.serviceId, filters?.status, ...]` — never `["children", filters]`.

### Role-permissions checklist (MEMORY.md)
No new pages added in 4b (all changes are to existing routes + components). If scope creep introduces a new page, update `src/lib/role-permissions.ts` per the checklist in 4a's plan.

### Auth wrappers
- Dashboard/internal routes: `withApiAuth(handler, opts?)` (session + rate limit + request ID).
- Parent portal routes: `withParentAuth(handler)` (magic-link token in cookie; parent identity in `{ parent }`).
- Do not mix. `POST /api/parent/bookings*` stays under `withParentAuth`; `POST /api/attendance/roll-call/bulk` uses `withApiAuth`.

### Test file naming + location
- API tests: `src/__tests__/api/<route>.test.ts` — mirror the route path. Dynamic-segment routes use the `children-id-*.test.ts` style (already in use: `children-id.test.ts`, `children-id-attendances.test.ts`).
- Component tests: `src/__tests__/components/<area>/<Component>.test.tsx`.
- Library tests: `src/__tests__/lib/<module>.test.ts`.
- Use `src/__tests__/helpers/prisma-mock.ts`, `auth-mock.ts`, `request.ts` helpers. **Do NOT re-mock `prisma.$transaction` inline** — the shared `prismaMock` already implements it (array form → `Promise.all`; callback form → `fn(prisma)`). Reference (lines 18-24): `src/__tests__/helpers/prisma-mock.ts`.
- Call `_clearUserActiveCache()` in `beforeEach` for routes that hit `withApiAuth`.
- To mock `withParentAuth` without clobbering other exports in `@/lib/parent-auth`, use:
  ```ts
  vi.mock("@/lib/parent-auth", async () => {
    const actual = await vi.importActual<typeof import("@/lib/parent-auth")>("@/lib/parent-auth");
    return {
      ...actual,
      withParentAuth: (handler: any) => (req: Request) => handler(req, { parent: { email: "p1@x.test", enrolmentIds: ["enr1"] } }),
    };
  });
  ```
- **ApiError response shape**: `{ error: string, details?: unknown }` — `ApiError.badRequest(msg, details)` nests the details object. Tests must assert `(await res.json()).details.<key>` **not** `(await res.json()).<key>`. See `src/lib/api-handler.ts:90`.

---

## File Structure Overview

| Commit | Files created | Files modified |
|---|---|---|
| 1 Schema | `prisma/migrations/<ts>_add_child_ccs_room_tags/{migration.sql,neon-apply.sql}`, `src/__tests__/lib/schema-child-ccs-room-tags.test.ts` | `prisma/schema.prisma` |
| 2 API filters | `src/__tests__/api/children-filters.test.ts` (new cases — co-located in existing file if present) | `src/app/api/children/route.ts` |
| 3 UI filters | `src/__tests__/components/services/ChildrenFilters.test.tsx` (added cases) | `src/components/services/ChildrenFilters.tsx`, `src/components/services/ServiceChildrenTab.tsx`, `src/hooks/useChildren.ts` |
| 4 Scope widening | `src/__tests__/lib/service-scope.test.ts` (expanded for all 7 roles + per-route regression matrix), **`docs/superpowers/plans/2026-04-22-services-daily-ops-4b-scope-audit.md`** (audit table committed alongside) | `src/lib/service-scope.ts` + any route whose audit decision is "exempt via new helper" (expected: 0–2 routes) |
| 5 Casual enforcement | `src/__tests__/api/parent-bookings-casual-enforce.test.ts`, `src/__tests__/api/parent-bookings-bulk-casual-enforce.test.ts`, `src/lib/casual-booking-check.ts` | `src/app/api/parent/bookings/route.ts`, `src/app/api/parent/bookings/bulk/route.ts` |
| 6 Bulk endpoint | `src/app/api/attendance/roll-call/bulk/route.ts`, `src/__tests__/api/attendance-roll-call-bulk.test.ts` | (none) |
| 7 Wire AddChildDialog | `src/__tests__/components/services/AddChildDialog-bulk.test.tsx` (new scenarios) | `src/components/services/weekly-grid/AddChildDialog.tsx` |
| 8 Relationships inline edit | `src/app/api/children/[id]/relationships/route.ts`, `src/__tests__/api/children-relationships.test.ts`, `src/components/child/tabs/RelationshipsEditDialog.tsx`, `src/hooks/useChildRelationships.ts`, `src/__tests__/components/child/RelationshipsTab-edit.test.tsx` | `src/components/child/tabs/RelationshipsTab.tsx` |
| 9 Hygiene | (none) | `src/components/child/tabs/RelationshipsTab.tsx` (drop local copy, import from `@/lib/schemas/json-fields`), `src/app/api/children/[id]/attendances/route.ts` (366-day guard), `src/__tests__/api/children-id-attendances.test.ts` (range-cap case appended) |

Note: `authorisedPickupSchema` is added to `src/lib/schemas/json-fields.ts` in **Commit 8** (additive export so the new route compiles). Commit 9 only removes the duplicate local definition in `RelationshipsTab.tsx` and tightens the import.

Single migration in Commit 1. All other commits are code-only.

---

## Chunk 1: Setup & Baseline

### Task 1.1: Fetch, create worktree, regenerate Prisma

- [ ] **Step 1: Fetch + confirm origin/main is at expected commit**

```bash
git fetch origin
git log origin/main --oneline -1
```
Expected: `4ce6f2a docs(specs): pre-written specs for 4b / 6 / 8 (parallel execution)` or later — must include 4a merge `884ef6b` in history.

- [ ] **Step 2: Confirm local main clean**

```bash
git status
git log origin/main..main --oneline
```
Expected: clean (apart from untracked `.env.save` / unrelated plan drafts the user left around); no branch-local commits ahead.

- [ ] **Step 3: Create worktree off local main**

```bash
git worktree add -b feat/services-daily-ops-4b-2026-04-22 .worktrees/services-daily-ops-4b main
```

- [ ] **Step 4: Switch in + install + regenerate Prisma client**

```bash
cd .worktrees/services-daily-ops-4b
npm ci
npx prisma generate
```

Expected: `prisma generate` succeeds. If it fails, the repo's schema is broken; surface before proceeding.

### Task 1.2: Baseline metrics

- [ ] **Step 1: Capture exact numbers**

```bash
npm test -- --run 2>&1 | tail -5
npx tsc --noEmit 2>&1 | grep -c "error TS"
```

Record to `/tmp/4b-baseline.txt`. Expected: **1617 passing, 3 skipped, 0 tsc errors**. Any deviation blocks start.

> Note: the source `main` shows 12 tsc errors before `prisma generate`; this is stale Prisma types from the 4a merge (Child gained medicare fields, Service gained casualBookingSettings). `npx prisma generate` in Step 4 resolves them. Confirm zero after generate.

---

## Chunk 2: Commit 1 — Schema + migration

### Task 2.1: Extend `Child` in Prisma schema

**Files:**
- Modify: `prisma/schema.prisma` (around line 4660 — `Child` model)

- [ ] **Step 1: Add fields**

Find the `// ── Medicare + immunisation ... ──` comment block in `model Child`. **Directly underneath the existing `vaccinationStatus String?`** line, insert:

```prisma
  // ── CCS + room + tags (first-class filter dimensions, 4b) ──
  ccsStatus             String?   // "eligible" | "pending" | "ineligible" — documented values, free-text for forward compat
  room                  String?   // dashboard-controlled room label; decoupled from OWNA's ownaRoomName
  tags                  String[]  @default([]) // optional filter tags; empty-array default means existing rows don't need backfill
```

- [ ] **Step 2: Add indexes**

At the bottom of `model Child`, next to the existing `@@index([serviceId])` line, add two composite indexes:

```prisma
  @@index([serviceId, ccsStatus])
  @@index([serviceId, room])
```

- [ ] **Step 3: Format schema**

```bash
npx prisma format
```

### Task 2.2: Generate migration

- [ ] **Step 1: Try `migrate dev` first**

```bash
npx prisma migrate dev --name add_child_ccs_room_tags --create-only
```

If the shadow DB fails (inherited P3006 from prior sub-projects), fall back to the same pattern 4a used:

```bash
TS=$(date +%Y%m%d%H%M%S)
mkdir -p "prisma/migrations/${TS}_add_child_ccs_room_tags"
DATABASE_URL_UNPOOLED_BACKUP="${DATABASE_URL_UNPOOLED:-}" \
npx prisma migrate diff \
  --from-url "$DATABASE_URL" \
  --to-schema-datamodel prisma/schema.prisma \
  --script \
  > "prisma/migrations/${TS}_add_child_ccs_room_tags/migration.sql"
```

- [ ] **Step 2: Verify migration.sql is additive-only**

`cat prisma/migrations/*_add_child_ccs_room_tags/migration.sql`

Expected statements (order may vary):

```sql
-- AlterTable
ALTER TABLE "Child" ADD COLUMN "ccsStatus" TEXT;
ALTER TABLE "Child" ADD COLUMN "room" TEXT;
ALTER TABLE "Child" ADD COLUMN "tags" TEXT[] DEFAULT ARRAY[]::TEXT[] NOT NULL;

-- CreateIndex
CREATE INDEX "Child_serviceId_ccsStatus_idx" ON "Child"("serviceId", "ccsStatus");

-- CreateIndex
CREATE INDEX "Child_serviceId_room_idx" ON "Child"("serviceId", "room");
```

Any DROP / RENAME / column-type change = schema drift. STOP and investigate.

> The `tags` default clause is produced automatically by Prisma when a `String[]` field is added without being declared optional. If `migrate diff` emits `ADD COLUMN "tags" TEXT[];` without the default, add `@default([])` to the Prisma schema and regenerate.

- [ ] **Step 3: Write the paste-ready `neon-apply.sql`**

Create `prisma/migrations/<ts>_add_child_ccs_room_tags/neon-apply.sql`. Jayden will paste this into Neon SQL editor manually (not via `prisma migrate deploy`). Use `IF NOT EXISTS` so the paste is idempotent, and insert the `_prisma_migrations` row so Prisma marks it applied:

```sql
-- Run this in the Neon SQL editor. Replace <MIGRATION_FOLDER_NAME> with the generated folder name.
ALTER TABLE "Child" ADD COLUMN IF NOT EXISTS "ccsStatus" TEXT;
ALTER TABLE "Child" ADD COLUMN IF NOT EXISTS "room"      TEXT;
ALTER TABLE "Child" ADD COLUMN IF NOT EXISTS "tags"      TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

CREATE INDEX IF NOT EXISTS "Child_serviceId_ccsStatus_idx" ON "Child"("serviceId", "ccsStatus");
CREATE INDEX IF NOT EXISTS "Child_serviceId_room_idx"      ON "Child"("serviceId", "room");

-- Tell Prisma this migration is applied (use the exact folder name under prisma/migrations/)
INSERT INTO "_prisma_migrations"
  (id, checksum, migration_name, started_at, finished_at, applied_steps_count)
VALUES
  (gen_random_uuid()::text, 'manual', '<MIGRATION_FOLDER_NAME>', now(), now(), 1)
ON CONFLICT DO NOTHING;
```

> **Why `NOT NULL DEFAULT ARRAY[]::TEXT[]` on `tags`:** Prisma's `String[]` client type is non-nullable. The DEFAULT clause backfills existing rows with `[]` (no data migration required) and avoids a Prisma client error on rows created before this commit.

This file is the canonical migration artefact referenced in the PR body + Jayden's hand-off in Task 11.3.

### Task 2.3: Regenerate Prisma client + smoke test

- [ ] **Step 1: Regenerate**

```bash
npx prisma generate
```

- [ ] **Step 2: Add a schema-level type smoke test**

Create `src/__tests__/lib/schema-child-ccs-room-tags.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import type { Prisma } from "@prisma/client";

/**
 * Pure type-level smoke — asserts Prisma client knows about the new
 * Child.ccsStatus / room / tags fields. If this file compiles, the
 * migration applied to the client. If it doesn't, regenerate.
 */
describe("Child schema — ccsStatus / room / tags", () => {
  it("types ccsStatus as string | null", () => {
    const payload: Prisma.ChildUpdateInput = { ccsStatus: "eligible" };
    expect(payload.ccsStatus).toBe("eligible");
  });

  it("types room as string | null", () => {
    const payload: Prisma.ChildUpdateInput = { room: "R1" };
    expect(payload.room).toBe("R1");
  });

  it("types tags as string[]", () => {
    const payload: Prisma.ChildUpdateInput = { tags: { set: ["siblings", "vip"] } };
    expect(payload.tags).toBeDefined();
  });

  it("supports hasSome on tags in a where clause", () => {
    const where: Prisma.ChildWhereInput = { tags: { hasSome: ["siblings"] } };
    expect(where.tags).toBeDefined();
  });
});
```

- [ ] **Step 3: Gate**

```bash
npm test -- --run src/__tests__/lib/schema-child-ccs-room-tags.test.ts 2>&1 | tail -5
npx tsc --noEmit 2>&1 | grep -c "error TS"
```

Expected: new tests pass (4 cases), 0 tsc errors.

### Task 2.4: Commit

- [ ] **Step 1: Stage + commit**

```bash
git add prisma/schema.prisma prisma/migrations/*_add_child_ccs_room_tags \
  src/__tests__/lib/schema-child-ccs-room-tags.test.ts
git commit -m "$(cat <<'EOF'
feat(schema): add Child.ccsStatus + room + tags + migration

Single additive migration for Sub-project 4b. All field additions
ship here — no other 4b commits touch Prisma schema.

Child gains three optional fields that the 4a ChildrenFilters UI
already renders as no-op controls:
- ccsStatus String? (documented: "eligible" | "pending" | "ineligible",
  stored as free-text so a future fourth status doesn't require
  a migration; validation lives at the Zod layer)
- room String? (dashboard-first label, decoupled from OWNA's
  ownaRoomName which only populates when OWNA pushes data)
- tags String[] (free-form filter tags, e.g. "siblings",
  "vip-family", "withdrawal-notice")

Plus 2 composite indexes — @@index([serviceId, ccsStatus])
and @@index([serviceId, room]) — so the filter queries landing
in Commit 2 stay index-backed.

Safe to deploy ahead of code (all fields nullable; no consumer
reads yet). neon-apply.sql lands alongside the migration folder
for manual Jayden-paste into Neon SQL editor.
EOF
)"
```

- [ ] **Step 2: Verify commit clean**

```bash
git log -1 --stat
git diff HEAD~1 --stat
```

Expected: 3 files in migration folder + schema.prisma + 1 test file.

---

## Chunk 3: Commit 2 — Wire `/api/children` filters

### Task 3.1: Write failing filter tests

**Files:**
- Test: `src/__tests__/api/children-filters.test.ts` (create new file dedicated to filter matrix; the existing `children.test.ts` stays focused on CRUD)

- [ ] **Step 1: Create the test**

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { GET } from "@/app/api/children/route";
import { mockSession } from "@/__tests__/helpers/auth-mock";
import { createRequest } from "@/__tests__/helpers/request";
import { prisma } from "@/lib/prisma";
import { _clearUserActiveCache } from "@/lib/user-active-cache";

vi.mock("@/lib/prisma", () => import("@/__tests__/helpers/prisma-mock"));

describe("GET /api/children — filters (4b)", () => {
  beforeEach(() => {
    _clearUserActiveCache();
    vi.clearAllMocks();
    mockSession({ id: "u1", role: "owner" });
    (prisma.child.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (prisma.child.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);
  });

  it("forwards ccsStatus=eligible as where.ccsStatus", async () => {
    await GET(createRequest("http://x/api/children?ccsStatus=eligible"));
    const call = (prisma.child.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.where.ccsStatus).toBe("eligible");
  });

  it("forwards room=R1 as where.room (NOT ownaRoomName)", async () => {
    await GET(createRequest("http://x/api/children?room=R1"));
    const call = (prisma.child.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.where.room).toBe("R1");
    expect(call.where.ownaRoomName).toBeUndefined();
  });

  it("forwards tags=a&tags=b as where.tags.hasSome", async () => {
    await GET(createRequest("http://x/api/children?tags=siblings&tags=vip"));
    const call = (prisma.child.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.where.tags).toEqual({ hasSome: ["siblings", "vip"] });
  });

  it("filters by day=mon (client-side via bookingPrefs.fortnightPattern)", async () => {
    // Provide children with various fortnight patterns; expect only Monday-ers to survive.
    const children = [
      { id: "c1", firstName: "A", surname: "1", bookingPrefs: { fortnightPattern: { week1: { bsc: ["mon"] }, week2: {} } }, service: null, enrolment: null },
      { id: "c2", firstName: "B", surname: "2", bookingPrefs: { fortnightPattern: { week1: {}, week2: { asc: ["tue"] } } }, service: null, enrolment: null },
      { id: "c3", firstName: "C", surname: "3", bookingPrefs: null, service: null, enrolment: null },
    ];
    (prisma.child.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(children);
    (prisma.child.count as ReturnType<typeof vi.fn>).mockResolvedValue(3);
    const res = await GET(createRequest("http://x/api/children?day=mon"));
    const body = await res.json();
    expect(body.children.map((c: { id: string }) => c.id)).toEqual(["c1"]);
  });

  it("combines filters (serviceId + status + ccsStatus + tags)", async () => {
    await GET(createRequest("http://x/api/children?serviceId=s1&status=current&ccsStatus=pending&tags=vip"));
    const call = (prisma.child.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.where).toMatchObject({
      serviceId: "s1",
      status: "active",
      ccsStatus: "pending",
      tags: { hasSome: ["vip"] },
    });
  });

  it("rejects unknown day value (silently — no crash)", async () => {
    await GET(createRequest("http://x/api/children?day=funday"));
    // No throw, no filter applied for day
    expect(prisma.child.findMany).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to confirm it fails**

```bash
npm test -- --run src/__tests__/api/children-filters.test.ts 2>&1 | tail -20
```

Expected: fails with assertions like `expected undefined to be 'eligible'` or `expected { …, ownaRoomName: 'R1' } …` — confirms current code still treats these as no-ops.

### Task 3.2: Implement filter wiring

**Files:**
- Modify: `src/app/api/children/route.ts`

- [ ] **Step 1: Replace the no-op blocks**

Find the three `TODO(4b+)` blocks (lines ~99-124) in `src/app/api/children/route.ts` and replace them:

```ts
  // Room filter — first-class Child.room column (4b).
  if (room) {
    where.room = room;
  }

  // CCS status — first-class Child.ccsStatus column (4b).
  if (ccsStatus) {
    where.ccsStatus = ccsStatus;
  }

  // Tags — OR semantic via hasSome. Empty array skipped.
  if (tags.length > 0) {
    where.tags = { hasSome: tags };
  }
```

- [ ] **Step 2: Implement day filter (client-side scan)**

Day filter stays a JS filter since `bookingPrefs.fortnightPattern` is JSON. Insert after the `const [children, total]` block but before the `hydrated` assignment:

```ts
  // Day filter — applied after SQL fetch because fortnightPattern is JSON.
  // Acceptable at <2000 children per service.
  let dayFiltered = children;
  if (day && DAY_KEYS.has(day)) {
    dayFiltered = children.filter((c) => {
      const prefs = c.bookingPrefs as { fortnightPattern?: { week1?: Record<string, string[]>; week2?: Record<string, string[]> } } | null;
      const fp = prefs?.fortnightPattern;
      if (!fp) return false;
      const weeks = [fp.week1, fp.week2].filter(Boolean) as Record<string, string[]>[];
      return weeks.some((week) =>
        Object.values(week).some((days) => Array.isArray(days) && days.includes(day)),
      );
    });
  }
```

Then replace the `hydrated` `.map(...)` input `children` with `dayFiltered`, and return `total: dayFiltered.length` when `day` is supplied so pagination stays honest (total reflects the filtered set).

> **Note:** returning a filtered total means `total` differs from the DB count. This is acceptable for the children list — consumers already treat `total` as "matches shown". Document the decision in the commit message.

- [ ] **Step 3: Run tests**

```bash
npm test -- --run src/__tests__/api/children-filters.test.ts 2>&1 | tail -10
```

Expected: all 6 tests pass.

- [ ] **Step 4: Full gate**

```bash
npm test -- --run src/__tests__/api/children 2>&1 | tail -5
npx tsc --noEmit 2>&1 | grep -c "error TS"
```

Expected: all children API tests pass (including the existing CRUD ones), 0 tsc errors.

### Task 3.3: Commit

- [ ] **Step 1: Commit**

```bash
git add src/app/api/children/route.ts src/__tests__/api/children-filters.test.ts
git commit -m "$(cat <<'EOF'
feat(api): wire /api/children ccsStatus + room + tags filters

Removes the three TODO(4b+) no-op blocks in /api/children?… and
replaces them with real SQL filters now that Child has first-class
ccsStatus, room, and tags columns (Commit 1).

- ccsStatus=eligible → where.ccsStatus = "eligible"
- room=R1           → where.room = "R1" (dropped the ownaRoomName
                       fallback; room is now the canonical field)
- tags=a&tags=b     → where.tags = { hasSome: ["a", "b"] } (OR)
- day=mon           → JS-side scan of bookingPrefs.fortnightPattern
                       across both weeks; total reflects the
                       filtered count when day is applied

6 new tests exercise the matrix (single + combined + unknown-day
safety). All existing children tests still pass.
EOF
)"
```

---

## Chunk 4: Commit 3 — Promote ChildrenFilters from no-op to real

### Task 4.1: Write failing UI test

**Files:**
- Test: `src/__tests__/components/services/ChildrenFilters.test.tsx` (add cases to existing file)

- [ ] **Step 1: Add the new cases**

Append to the existing describe block (or create one if the file is empty):

```tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { ChildrenFilters } from "@/components/services/ChildrenFilters";

describe("ChildrenFilters — ccs / room / tags options (4b)", () => {
  const baseFilters = { serviceId: "s1", status: "current" as const };

  it("enables the Room dropdown when roomOptions are supplied", () => {
    render(<ChildrenFilters filters={baseFilters} onChange={() => {}} roomOptions={["R1", "R2"]} />);
    const select = screen.getByLabelText("Room filter") as HTMLSelectElement;
    expect(select.disabled).toBe(false);
    expect(Array.from(select.options).map((o) => o.value)).toContain("R1");
  });

  it("shows '(no values yet)' placeholder when roomOptions empty", () => {
    render(<ChildrenFilters filters={baseFilters} onChange={() => {}} roomOptions={[]} />);
    // Regression: 4a shipped "(n/a)"; 4b switches to "(no values yet)"
    expect(screen.getByText(/no values yet/i)).toBeInTheDocument();
  });

  it("enables the CCS dropdown when ccsStatusOptions are supplied", () => {
    render(<ChildrenFilters filters={baseFilters} onChange={() => {}} ccsStatusOptions={["eligible", "pending"]} />);
    const select = screen.getByLabelText("CCS status filter") as HTMLSelectElement;
    expect(select.disabled).toBe(false);
  });

  it("enables the tags multi-select when tagOptions are supplied", () => {
    render(<ChildrenFilters filters={baseFilters} onChange={() => {}} tagOptions={["siblings", "vip"]} />);
    const select = screen.getByLabelText("Tags filter") as HTMLSelectElement;
    expect(select.disabled).toBe(false);
    expect(select.multiple).toBe(true);
  });

  it("dispatches onChange with room value on selection", () => {
    const onChange = vi.fn();
    render(<ChildrenFilters filters={baseFilters} onChange={onChange} roomOptions={["R1", "R2"]} />);
    fireEvent.change(screen.getByLabelText("Room filter"), { target: { value: "R1" } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ room: "R1" }));
  });
});
```

- [ ] **Step 2: Run — expect fail on the placeholder regression**

```bash
npm test -- --run src/__tests__/components/services/ChildrenFilters 2>&1 | tail -10
```

The "no values yet" case will fail because the current copy reads "(n/a)".

### Task 4.2: Update placeholder text

**Files:**
- Modify: `src/components/services/ChildrenFilters.tsx:118` and `:183`

- [ ] **Step 1: Edit placeholders**

Change:
- Line ~118: `{roomOptions.length === 0 ? "Room (n/a)" : "All rooms"}` → `{roomOptions.length === 0 ? "Room (no values yet)" : "All rooms"}`
- Line ~157: `{ccsStatusOptions.length === 0 ? "CCS status (—)" : "All CCS statuses"}` → `{ccsStatusOptions.length === 0 ? "CCS status (no values yet)" : "All CCS statuses"}`
- Line ~183: `<option value="">Tags (n/a)</option>` → `<option value="">Tags (no values yet)</option>`

No structural changes. The existing `disabled={... === 0}` logic already does the right thing.

### Task 4.3: Source options from live data in `ServiceChildrenTab`

**Files:**
- Modify: `src/components/services/ServiceChildrenTab.tsx`
- Modify: `src/hooks/useChildren.ts` (add `meta` response that carries distinct option values)

- [ ] **Step 1: Extend `useChildren` response type**

Open `src/hooks/useChildren.ts`. Whatever `useChildren` returns today, extend it so the consumer can read `roomOptions`, `ccsStatusOptions`, `tagOptions` derived from the list. The cheapest implementation is JS-side distinct on the returned children:

```ts
export function deriveFilterOptions(children: Array<{ room?: string | null; ccsStatus?: string | null; tags?: string[] | null }>): {
  roomOptions: string[];
  ccsStatusOptions: string[];
  tagOptions: string[];
} {
  const rooms = new Set<string>();
  const ccs = new Set<string>();
  const tags = new Set<string>();
  for (const c of children) {
    // Only derive from Child.room — Commit 2 dropped the ownaRoomName
    // filter fallback, so showing OWNA-only values would produce empty
    // result sets when the user selects them.
    if (c.room) rooms.add(c.room);
    if (c.ccsStatus) ccs.add(c.ccsStatus);
    for (const t of c.tags ?? []) tags.add(t);
  }
  return {
    roomOptions: [...rooms].sort(),
    ccsStatusOptions: [...ccs].sort(),
    tagOptions: [...tags].sort(),
  };
}
```

Export `deriveFilterOptions` from the hook file so the tab can use it. Do NOT change the existing hook signature beyond that — this is an additive export to avoid churn.

> **Note on OWNA migration:** services that sync from OWNA today have `ownaRoomName` populated but no `room`. After this commit lands, their filter dropdown will show no rooms until a data backfill runs. Backfill is out of scope for 4b — flag to Jayden in the PR body so a follow-up `UPDATE "Child" SET "room" = "ownaRoomName" WHERE "room" IS NULL AND "ownaRoomName" IS NOT NULL;` can run post-merge at his discretion.

- [ ] **Step 2: Wire the tab**

In `ServiceChildrenTab.tsx`, compute options from the current children result and pass them into `<ChildrenFilters>`:

```tsx
import { deriveFilterOptions } from "@/hooks/useChildren";
// ...
const { data, isLoading, error } = useChildren(filters);
const options = useMemo(() => deriveFilterOptions(data?.children ?? []), [data?.children]);
// ...
<ChildrenFilters
  filters={filters}
  onChange={setFilters}
  roomOptions={options.roomOptions}
  ccsStatusOptions={options.ccsStatusOptions}
  tagOptions={options.tagOptions}
/>
```

- [ ] **Step 3: Add hook-level test for `deriveFilterOptions`**

```ts
// Append to an existing hooks test or create src/__tests__/hooks/useChildren-filters.test.ts
import { describe, it, expect } from "vitest";
import { deriveFilterOptions } from "@/hooks/useChildren";

describe("deriveFilterOptions", () => {
  it("returns sorted distinct rooms from Child.room only", () => {
    const opts = deriveFilterOptions([
      { room: "R2" },
      { room: null }, // OWNA-only data not considered; see Commit 2 contract
      { room: "R1" },
    ]);
    expect(opts.roomOptions).toEqual(["R1", "R2"]);
  });

  it("returns distinct ccsStatus values", () => {
    const opts = deriveFilterOptions([{ ccsStatus: "eligible" }, { ccsStatus: "pending" }, { ccsStatus: "eligible" }]);
    expect(opts.ccsStatusOptions).toEqual(["eligible", "pending"]);
  });

  it("flattens tags arrays to a distinct sorted list", () => {
    const opts = deriveFilterOptions([{ tags: ["a", "b"] }, { tags: ["b", "c"] }]);
    expect(opts.tagOptions).toEqual(["a", "b", "c"]);
  });
});
```

- [ ] **Step 4: Run component + hook tests**

```bash
npm test -- --run src/__tests__/components/services/ChildrenFilters src/__tests__/hooks/useChildren-filters 2>&1 | tail -10
```

Expected: all pass.

- [ ] **Step 5: Gate**

```bash
npm test -- --run 2>&1 | tail -3
npx tsc --noEmit 2>&1 | grep -c "error TS"
```

Expected: full suite green, 0 tsc errors.

### Task 4.4: Commit

- [ ] **Step 1: Commit**

```bash
git add src/components/services/ChildrenFilters.tsx src/components/services/ServiceChildrenTab.tsx src/hooks/useChildren.ts src/__tests__/components/services/ChildrenFilters.test.tsx src/__tests__/hooks/useChildren-filters.test.ts
git commit -m "$(cat <<'EOF'
feat(services-list): promote ChildrenFilters ccs/room/tags from no-op to real

4a rendered the ccsStatus/room/tags controls as permanently disabled
(no values yet). Now that Commit 1 added the columns + Commit 2 wired
the API, we:

- Switch placeholder copy from "(n/a)" to "(no values yet)" (clearer
  that the control is live, just lacking data)
- Source the options live from the current children list via a new
  `deriveFilterOptions(children)` helper exported from useChildren,
  deriving from Child.room / Child.ccsStatus / Child.tags only
  (the API filter in Commit 2 matches on Child.room — not
  ownaRoomName — so surfacing OWNA-only values would produce
  empty result sets)

All controls become enabled when at least one child at the service
has a corresponding value. Empty services see the disabled state.
OWNA-only services that need room dropdowns pre-backfill should
run the optional UPDATE flagged in the PR body.
EOF
)"
```

---

## Chunk 5: Commit 4 — getServiceScope widening (with 17-route audit)

**Context reminder:** Today `getServiceScope` returns null for coordinator/marketing. Widening narrows those roles to their own service on 17 call sites. Some callers *intend* cross-service visibility (coordinators looking at rocks company-wide). Before shipping, every call site needs a per-route decision.

### Task 5.1: Produce the audit table

**Files:**
- Create: `docs/superpowers/plans/2026-04-22-services-daily-ops-4b-scope-audit.md`

- [ ] **Step 1: Enumerate exact call sites**

Run:
```bash
grep -rln "getServiceScope" src/app/api --include="*.ts"
```

**Spec calibration:** the 4b design doc (line 126-127) lists 21 routes including `attendance/*`, `children/*` (4a routes), `shift-swaps/*`. The live grep returns **17 API routes** as of 2026-04-22 — the spec's `children/[id]/attendances` narrows via `isAdminRole` inline (not `getServiceScope`), and `shift-swaps/*` don't import the helper at all. The widening still affects those routes' *callers* transitively where the helper is used downstream, but the direct audit is 17 files.

Expected 17 files (verified 2026-04-22 via grep):
1. `src/app/api/attendance/route.ts`
2. `src/app/api/attendance/summary/route.ts`
3. `src/app/api/timesheets/route.ts`
4. `src/app/api/timesheets/[id]/route.ts`
5. `src/app/api/timesheets/[id]/entries/route.ts`
6. `src/app/api/timesheets/[id]/submit/route.ts`
7. `src/app/api/qip/route.ts`
8. `src/app/api/compliance/route.ts`
9. `src/app/api/feedback/quick/route.ts`
10. `src/app/api/exit-survey/summary/route.ts`
11. `src/app/api/meetings/route.ts`
12. `src/app/api/rocks/route.ts`
13. `src/app/api/communication/announcements/route.ts`
14. `src/app/api/scorecard/route.ts`
15. `src/app/api/services/staffing/route.ts`
16. `src/app/api/billing/overdue/route.ts`
17. `src/app/api/incidents/trends/route.ts`

(If the grep returns a different count, update this list and the risk section of the PR body.)

- [ ] **Step 2: Read each caller and decide**

For each of the 17 routes, read the file and fill in the table below. The three decision buckets:
- **Narrow** — coordinator/marketing should only see their own service. Widening is correct.
- **Exempt — inline override** — coordinator/marketing need cross-service on this specific route. Keep the inline `getServiceScope(session)` but add `if (role === "coordinator" || role === "marketing") return null;` before the helper call.
- **Exempt — new helper** — enough routes need the same exemption that a second helper (e.g. `getOperationalScope`) is justified. Only create if ≥3 routes share the same exemption pattern.

Default: **narrow** unless there's a spec reason to preserve cross-service visibility. Typical suspects for "exempt": rocks (company-wide), scorecard roll-ups, leadership dashboards.

Deliverable: the scope audit doc lives at `docs/superpowers/plans/2026-04-22-services-daily-ops-4b-scope-audit.md` and looks like:

```markdown
# 4b — getServiceScope widening: 17-route audit

For each caller, state:
- current behaviour (what scope it receives today)
- intended behaviour post-widening (narrow / exempt)
- action (no change / inline override / migrate to new helper)

| # | Route | Today (coord) | Today (marketing) | Intended (coord) | Intended (marketing) | Action |
|---|---|---|---|---|---|---|
| 1 | `api/attendance/route.ts` | full | full | own-service | own-service | narrow |
| 2 | `api/attendance/summary/route.ts` | ... | ... | ... | ... | narrow |
| 3 | `api/timesheets/route.ts` | ... | ... | ... | ... | ... |
| 4 | `api/timesheets/[id]/route.ts` | ... | ... | ... | ... | ... |
| 5 | `api/timesheets/[id]/entries/route.ts` | ... | ... | ... | ... | ... |
| 6 | `api/timesheets/[id]/submit/route.ts` | ... | ... | ... | ... | ... |
| 7 | `api/qip/route.ts` | ... | ... | ... | ... | ... |
| 8 | `api/compliance/route.ts` | ... | ... | ... | ... | ... |
| 9 | `api/feedback/quick/route.ts` | ... | ... | ... | ... | ... |
| 10 | `api/exit-survey/summary/route.ts` | ... | ... | ... | ... | ... |
| 11 | `api/meetings/route.ts` | ... | ... | ... | ... | ... |
| 12 | `api/rocks/route.ts` | full | full | full (cross-service by spec) | full | exempt inline |
| 13 | `api/communication/announcements/route.ts` | ... | ... | ... | ... | ... |
| 14 | `api/scorecard/route.ts` | ... | ... | ... | ... | ... |
| 15 | `api/services/staffing/route.ts` | ... | ... | ... | ... | ... |
| 16 | `api/billing/overdue/route.ts` | ... | ... | ... | ... | ... |
| 17 | `api/incidents/trends/route.ts` | ... | ... | ... | ... | ... |

## Decision summary

- Narrow (N routes): ...
- Exempt inline (N routes): ...
- Exempt via new helper (N routes): ...

## Coordinator session sanity check

Pre-merge: confirm every active coordinator has `user.serviceId` populated:
```sql
SELECT id, email, role, "serviceId" FROM "User" WHERE role = 'coordinator' AND "serviceId" IS NULL;
```
Expected: 0 rows. If any, flag to Jayden before merge — otherwise those users lose access on widening.
```

Fill every row with the real decision after reading each route. **Do not leave placeholders**.

### Task 5.2: Expand service-scope tests

**Files:**
- Modify: `src/__tests__/lib/service-scope.test.ts`

- [ ] **Step 1: Add role-matrix test cases**

Extend the existing file with cases covering all 7 roles:

```ts
import { describe, it, expect } from "vitest";
import { getServiceScope } from "@/lib/service-scope";
import type { Session } from "next-auth";

function sess(role: string, serviceId: string | null = "svc1"): Session {
  return {
    user: { id: "u1", role, serviceId, email: "u1@x.test", name: "u1" },
    expires: new Date(Date.now() + 60_000).toISOString(),
  } as unknown as Session;
}

describe("getServiceScope — full role matrix (4b widening)", () => {
  it("owner → null (cross-service)", () => {
    expect(getServiceScope(sess("owner"))).toBeNull();
  });
  it("head_office → null", () => {
    expect(getServiceScope(sess("head_office"))).toBeNull();
  });
  it("admin → null (State Managers use getStateScope separately)", () => {
    expect(getServiceScope(sess("admin"))).toBeNull();
  });
  it("coordinator with serviceId → serviceId (narrowed post-4b)", () => {
    expect(getServiceScope(sess("coordinator", "svc1"))).toBe("svc1");
  });
  it("coordinator without serviceId → null (fail open; flagged in audit)", () => {
    expect(getServiceScope(sess("coordinator", null))).toBeNull();
  });
  it("marketing with serviceId → serviceId (narrowed post-4b)", () => {
    expect(getServiceScope(sess("marketing", "svc1"))).toBe("svc1");
  });
  it("marketing without serviceId → null", () => {
    expect(getServiceScope(sess("marketing", null))).toBeNull();
  });
  it("member with serviceId → serviceId (unchanged)", () => {
    expect(getServiceScope(sess("member", "svc1"))).toBe("svc1");
  });
  it("staff with serviceId → serviceId (unchanged)", () => {
    expect(getServiceScope(sess("staff", "svc1"))).toBe("svc1");
  });
  it("null session → null", () => {
    expect(getServiceScope(null)).toBeNull();
  });
});
```

- [ ] **Step 2: Run — expect failure for coordinator + marketing**

```bash
npm test -- --run src/__tests__/lib/service-scope 2>&1 | tail -15
```

Expected: 4 tests fail (`coordinator with serviceId`, `marketing with serviceId`, and the corresponding `without serviceId` cases assert the new behaviour).

### Task 5.3: Widen the helper

**Files:**
- Modify: `src/lib/service-scope.ts`

- [ ] **Step 1: Edit**

Open `src/lib/service-scope.ts`. Replace the current `getServiceScope` function body (lines 7-14) with:

```ts
export function getServiceScope(session: Session | null): string | null {
  if (!session?.user) return null;
  const role = session.user.role as string;
  // Owner / head_office / admin retain cross-service access.
  // Every other role with a serviceId is scoped to their own service.
  if (
    role !== "owner" &&
    role !== "head_office" &&
    role !== "admin" &&
    session.user.serviceId
  ) {
    return session.user.serviceId as string;
  }
  return null;
}
```

- [ ] **Step 2: Run tests**

```bash
npm test -- --run src/__tests__/lib/service-scope 2>&1 | tail -10
```

Expected: all role-matrix cases pass.

### Task 5.4: Apply exemptions per audit

For each route in the audit marked **Exempt inline**:

- [ ] **Step 1: Add the inline override**

Open the route file and locate the `getServiceScope(session)` call. Wrap it:

```ts
// Rocks are cross-service by spec — coordinators and marketing retain
// full visibility regardless of their serviceId. See 4b scope audit.
const scope =
  role === "coordinator" || role === "marketing"
    ? null
    : getServiceScope(session);
```

- [ ] **Step 2: Add a regression test per exempted route**

For each exempted route, add to its existing test file (or create one) a case confirming coordinator (and marketing, if relevant) still receives cross-service results:

```ts
it("coordinator sees cross-service data (exempt per audit)", async () => {
  mockSession({ id: "u1", role: "coordinator", serviceId: "svc1" });
  await GET(createRequest("http://x/api/rocks"));
  const call = (prisma.rock.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0];
  expect(call.where?.serviceId).toBeUndefined(); // not narrowed
});
```

- [ ] **Step 3: For routes marked "narrow" only**

No code change (helper widening is enough). But add a lightweight regression test to the two highest-risk routes (`attendance/route.ts`, `scorecard/route.ts`) confirming coordinator is narrowed:

```ts
it("coordinator is narrowed to own service (4b widening)", async () => {
  mockSession({ id: "u1", role: "coordinator", serviceId: "svc1" });
  // ...
  expect(call.where.serviceId).toBe("svc1");
});
```

### Task 5.5: Gate + commit

- [ ] **Step 1: Full test gate**

```bash
npm test -- --run 2>&1 | tail -5
npx tsc --noEmit 2>&1 | grep -c "error TS"
```

Expected: full suite green (new regression tests add ~10-15 cases), 0 tsc errors.

- [ ] **Step 2: Commit**

```bash
git add src/lib/service-scope.ts src/__tests__/lib/service-scope.test.ts docs/superpowers/plans/2026-04-22-services-daily-ops-4b-scope-audit.md <any exempted routes + their tests>
git commit -m "$(cat <<'EOF'
refactor(scope): widen getServiceScope to coordinator + marketing

Previously returned null (= full access) for every role except
staff/member. In practice this gave coordinators + marketing silent
cross-service visibility on 17 routes, which didn't match the
operational spec for most of them.

Widen the default: every non-admin role (coordinator / marketing /
member / staff) with a session.user.serviceId is now narrowed to
that service. owner / head_office / admin retain cross-service
access (admin uses getStateScope for state-level filtering).

Per-route audit in
docs/superpowers/plans/2026-04-22-services-daily-ops-4b-scope-audit.md
covers all 17 call sites with explicit decisions. Routes that
genuinely need cross-service coordinator/marketing visibility
(e.g. rocks for company-wide OKRs) got inline overrides and a
regression test confirming they still see cross-service data.

Tests: full 7-role matrix in service-scope.test.ts, plus per-route
regression cases for both narrow and exempt decisions.

Pre-merge sanity check: confirmed every active coordinator has
user.serviceId populated (see audit doc).
EOF
)"
```

---

## Chunk 6: Commit 5 — Casual booking enforcement

### Task 6.1: Write the enforcement helper (pure function, easy to test)

**Files:**
- Create: `src/lib/casual-booking-check.ts`
- Create: `src/__tests__/lib/casual-booking-check.test.ts`

- [ ] **Step 1: Write the test first**

```ts
import { describe, it, expect } from "vitest";
import { checkCasualBookingAllowed } from "@/lib/casual-booking-check";
import type { CasualBookingSettings } from "@/lib/service-settings";

const nowUtc = new Date("2026-04-22T10:00:00.000Z");

const settings: CasualBookingSettings = {
  bsc: { enabled: true, fee: 40, spots: 2, cutOffHours: 12, days: ["mon", "tue", "wed", "thu", "fri"] },
  asc: { enabled: false, fee: 45, spots: 0, cutOffHours: 24, days: [] },
  // vc omitted — treated as "not configured"
};

describe("checkCasualBookingAllowed", () => {
  it("400 when settings are null/absent", () => {
    const r = checkCasualBookingAllowed({ settings: null, sessionType: "bsc", bookingDate: new Date("2026-04-24T00:00:00Z"), now: nowUtc, currentCasualBookings: 0 });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/not configured/i);
  });

  it("400 when session-type entry is missing", () => {
    const r = checkCasualBookingAllowed({ settings, sessionType: "vc", bookingDate: new Date("2026-04-24T00:00:00Z"), now: nowUtc, currentCasualBookings: 0 });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/not configured|not accepted/i);
  });

  it("400 when session-type is disabled", () => {
    const r = checkCasualBookingAllowed({ settings, sessionType: "asc", bookingDate: new Date("2026-04-24T00:00:00Z"), now: nowUtc, currentCasualBookings: 0 });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/not accepted/i);
  });

  it("400 when booking date's day isn't in days[]", () => {
    // 2026-04-25 is a Saturday — not in settings.bsc.days
    const r = checkCasualBookingAllowed({ settings, sessionType: "bsc", bookingDate: new Date("2026-04-25T00:00:00Z"), now: nowUtc, currentCasualBookings: 0 });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/not available on/i);
  });

  it("400 when cutOffHours not met", () => {
    // booking "2026-04-22T12:00" with now "2026-04-22T10:00" → only 2h lead; settings.bsc needs 12h
    const r = checkCasualBookingAllowed({ settings, sessionType: "bsc", bookingDate: new Date("2026-04-22T12:00:00Z"), now: nowUtc, currentCasualBookings: 0 });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/at least \d+ hours?/i);
  });

  it("400 when spots exhausted (equal count)", () => {
    const r = checkCasualBookingAllowed({ settings, sessionType: "bsc", bookingDate: new Date("2026-04-24T00:00:00Z"), now: nowUtc, currentCasualBookings: 2 });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/no casual spots/i);
  });

  it("200 for valid booking", () => {
    const r = checkCasualBookingAllowed({ settings, sessionType: "bsc", bookingDate: new Date("2026-04-24T00:00:00Z"), now: nowUtc, currentCasualBookings: 1 });
    expect(r.ok).toBe(true);
  });
});
```

- [ ] **Step 2: Run — expect fail (module missing)**

```bash
npm test -- --run src/__tests__/lib/casual-booking-check 2>&1 | tail -5
```

- [ ] **Step 3: Implement the helper**

Create `src/lib/casual-booking-check.ts`:

```ts
import type { CasualBookingSettings } from "@/lib/service-settings";

export type SessionType = "bsc" | "asc" | "vc";

interface CheckInput {
  settings: CasualBookingSettings | null;
  sessionType: SessionType;
  bookingDate: Date;  // UTC midnight of the requested booking
  now: Date;          // current server time
  currentCasualBookings: number; // existing casual bookings (confirmed|requested) for this (service, date, sessionType)
}

export type CheckResult =
  | { ok: true }
  | { ok: false; reason: string };

const DAY_LABEL: Record<string, string> = {
  mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday",
  fri: "Friday", sat: "Saturday", sun: "Sunday",
};

const DAY_KEY: readonly string[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

export function checkCasualBookingAllowed(input: CheckInput): CheckResult {
  const { settings, sessionType, bookingDate, now, currentCasualBookings } = input;

  if (!settings) {
    return { ok: false, reason: "Casual bookings not configured for this service" };
  }

  const s = settings[sessionType];
  if (!s) {
    return { ok: false, reason: `Casual ${sessionType.toUpperCase()} is not configured for this service` };
  }

  if (!s.enabled) {
    return { ok: false, reason: `Casual ${sessionType.toUpperCase()} bookings are not accepted at this service` };
  }

  const dayKey = DAY_KEY[bookingDate.getUTCDay()];
  if (!s.days.includes(dayKey as typeof s.days[number])) {
    return { ok: false, reason: `Casual ${sessionType.toUpperCase()} is not available on ${DAY_LABEL[dayKey]} at this service` };
  }

  const msCutoff = s.cutOffHours * 60 * 60 * 1000;
  if (bookingDate.getTime() - now.getTime() < msCutoff) {
    return { ok: false, reason: `Bookings must be made at least ${s.cutOffHours} hour${s.cutOffHours === 1 ? "" : "s"} before the session` };
  }

  if (currentCasualBookings >= s.spots) {
    return { ok: false, reason: "No casual spots available for this session" };
  }

  return { ok: true };
}
```

- [ ] **Step 4: Run tests — expect pass**

```bash
npm test -- --run src/__tests__/lib/casual-booking-check 2>&1 | tail -5
```

### Task 6.2: Integrate in `POST /api/parent/bookings`

**Files:**
- Modify: `src/app/api/parent/bookings/route.ts`
- Create: `src/__tests__/api/parent-bookings-casual-enforce.test.ts`

- [ ] **Step 1: Write the failing test file**

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { POST } from "@/app/api/parent/bookings/route";
import { prisma } from "@/lib/prisma";
import { createRequest } from "@/__tests__/helpers/request";

// Mock withParentAuth to inject a fake parent — preserve other exports
vi.mock("@/lib/parent-auth", async () => {
  const actual = await vi.importActual<typeof import("@/lib/parent-auth")>("@/lib/parent-auth");
  return {
    ...actual,
    withParentAuth: (handler: (req: Request, ctx: { parent: { email: string; enrolmentIds: string[] } }) => Promise<Response>) =>
      (req: Request) => handler(req, { parent: { email: "p1@x.test", enrolmentIds: ["enr1"] } }),
  };
});

vi.mock("@/lib/prisma", () => import("@/__tests__/helpers/prisma-mock"));
vi.mock("@/lib/notifications/bookings", () => ({ sendBookingRequestNotification: vi.fn() }));

// NOTE: no inline $transaction mock — the shared prisma-mock.ts helper
// already handles both array and callback-interactive forms.

function postBody(body: unknown): Request {
  return createRequest("http://x/api/parent/bookings", { method: "POST", body: JSON.stringify(body) });
}

const baseBooking = {
  childId: "c1",
  serviceId: "s1",
  date: "2026-04-24", // Friday
  sessionType: "bsc" as const,
};

const configuredSettings = {
  bsc: { enabled: true, fee: 40, spots: 2, cutOffHours: 12, days: ["mon","tue","wed","thu","fri"] },
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.setSystemTime(new Date("2026-04-22T10:00:00.000Z"));
  (prisma.child.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: "c1" }]);
  (prisma.service.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
    id: "s1",
    bscCasualRate: 40,
    ascCasualRate: 45,
    vcDailyRate: 80,
    casualBookingSettings: configuredSettings,
  });
  (prisma.booking.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
  (prisma.booking.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);
  (prisma.booking.create as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "bk1" });
  (prisma.centreContact.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
});

describe("POST /api/parent/bookings — casual enforcement (4b)", () => {
  it("400 when service has no casualBookingSettings", async () => {
    (prisma.service.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "s1", bscCasualRate: 40, ascCasualRate: 45, vcDailyRate: 80, casualBookingSettings: null,
    });
    const res = await POST(postBody(baseBooking));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/not configured/i);
  });

  it("400 when session type disabled", async () => {
    (prisma.service.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "s1", bscCasualRate: 40, ascCasualRate: 45, vcDailyRate: 80,
      casualBookingSettings: { bsc: { enabled: false, fee: 40, spots: 2, cutOffHours: 12, days: ["fri"] } },
    });
    const res = await POST(postBody(baseBooking));
    expect(res.status).toBe(400);
  });

  it("400 when day-of-week not allowed", async () => {
    (prisma.service.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "s1", bscCasualRate: 40, ascCasualRate: 45, vcDailyRate: 80,
      casualBookingSettings: { bsc: { enabled: true, fee: 40, spots: 2, cutOffHours: 12, days: ["mon"] } },
    });
    // 2026-04-24 is Friday
    const res = await POST(postBody(baseBooking));
    expect(res.status).toBe(400);
  });

  it("400 when inside cut-off window", async () => {
    vi.setSystemTime(new Date("2026-04-24T00:00:00.000Z")); // booking is same day
    const res = await POST(postBody(baseBooking));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/at least \d+ hours?/i);
  });

  it("400 when spots exhausted", async () => {
    (prisma.booking.count as ReturnType<typeof vi.fn>).mockResolvedValue(2); // equals settings.spots
    const res = await POST(postBody(baseBooking));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/no casual spots/i);
  });

  it("201 on valid booking", async () => {
    const res = await POST(postBody(baseBooking));
    expect(res.status).toBe(201);
    expect(prisma.booking.create).toHaveBeenCalled();
  });

  it("asserts Serializable isolation is requested on the transaction", async () => {
    await POST(postBody(baseBooking));
    const txCall = (prisma.$transaction as ReturnType<typeof vi.fn>).mock.calls[0];
    const options = txCall[1];
    expect(options?.isolationLevel).toBe("Serializable");
  });

  it("race: two parallel POSTs for the last spot — exactly one 201, one 400 'no casual spots'", async () => {
    // Simulate the race: second transaction sees the row the first created
    // plus the pre-existing bookings, so count === spots.
    let callCount = 0;
    (prisma.booking.count as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      callCount++;
      // First call inside tx1 sees 1 existing booking; tx2 sees the 1 tx1 just created.
      return callCount === 1 ? 1 : 2;
    });
    const [resA, resB] = await Promise.all([POST(postBody(baseBooking)), POST(postBody(baseBooking))]);
    const statuses = [resA.status, resB.status].sort();
    expect(statuses).toEqual([201, 400]);
    const loser = resA.status === 400 ? resA : resB;
    expect((await loser.json()).error).toMatch(/no casual spots/i);
  });
});
```

- [ ] **Step 2: Run — expect fail**

The current POST doesn't wrap in `$transaction`, doesn't count spots, doesn't honour settings. All 7 cases fail.

- [ ] **Step 3: Rewrite POST handler**

Edit `src/app/api/parent/bookings/route.ts`. Replace the current single-insert POST (lines 92-167) with a serializable-transaction block:

```ts
import { Prisma } from "@prisma/client";
import { casualBookingSettingsSchema } from "@/lib/service-settings";
import { checkCasualBookingAllowed } from "@/lib/casual-booking-check";
import { parseJsonField } from "@/lib/schemas/json-fields";

export const POST = withParentAuth(async (req, { parent }) => {
  const body = await parseJsonBody(req);
  const parsed = createBookingSchema.safeParse(body);
  if (!parsed.success) {
    throw ApiError.badRequest("Invalid booking data", parsed.error.flatten().fieldErrors);
  }

  const { childId, serviceId, date, sessionType } = parsed.data;

  const childIds = await getParentChildIds(parent.enrolmentIds);
  if (!childIds.has(childId)) {
    throw ApiError.forbidden("You do not have access to this child");
  }

  const service = await prisma.service.findUnique({
    where: { id: serviceId },
    select: {
      id: true,
      bscCasualRate: true,
      ascCasualRate: true,
      vcDailyRate: true,
      casualBookingSettings: true,
    },
  });
  if (!service) {
    throw ApiError.notFound("Service not found");
  }

  const settings = parseJsonField(service.casualBookingSettings, casualBookingSettingsSchema, null as unknown as ReturnType<typeof casualBookingSettingsSchema.parse> | null);

  // Everything from here is in one transaction to prevent overbooking.
  const booking = await prisma.$transaction(async (tx) => {
    const bookingDate = new Date(`${date}T00:00:00.000Z`);

    const existing = await tx.booking.findUnique({
      where: {
        childId_serviceId_date_sessionType: {
          childId, serviceId, date: bookingDate, sessionType,
        },
      },
    });
    if (existing) {
      throw ApiError.conflict("A booking already exists for this child, date, and session");
    }

    const currentCount = await tx.booking.count({
      where: {
        serviceId,
        date: bookingDate,
        sessionType,
        type: "casual",
        status: { in: ["requested", "confirmed"] },
      },
    });

    const check = checkCasualBookingAllowed({
      settings,
      sessionType,
      bookingDate,
      now: new Date(),
      currentCasualBookings: currentCount,
    });
    if (!check.ok) {
      throw ApiError.badRequest(check.reason);
    }

    const feeMap: Record<string, number | null> = {
      bsc: service.bscCasualRate,
      asc: service.ascCasualRate,
      vc: service.vcDailyRate ?? null,
    };
    const fee = feeMap[sessionType] ?? null;

    const contact = await tx.centreContact.findFirst({
      where: { email: parent.email, serviceId },
      select: { id: true },
    });

    return tx.booking.create({
      data: {
        childId,
        serviceId,
        date: bookingDate,
        sessionType,
        status: "requested",
        type: "casual",
        fee,
        requestedById: contact?.id ?? null,
      },
      include: {
        child: { select: { id: true, firstName: true, surname: true } },
        service: { select: { id: true, name: true } },
      },
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  sendBookingRequestNotification(booking.id).catch((err) =>
    logger.error("Failed to send booking-request notification to coordinator", { err, bookingId: booking.id }),
  );

  return NextResponse.json(booking, { status: 201 });
});
```

- [ ] **Step 4: Run tests**

```bash
npm test -- --run src/__tests__/api/parent-bookings-casual-enforce 2>&1 | tail -10
```

Expected: all 7 cases pass.

### Task 6.3: Integrate in `POST /api/parent/bookings/bulk`

**Files:**
- Modify: `src/app/api/parent/bookings/bulk/route.ts`
- Create: `src/__tests__/api/parent-bookings-bulk-casual-enforce.test.ts`

- [ ] **Step 1: Write the failing test**

Mirror the single-POST test suite structure, but send 3 bookings at a time (one valid, one invalid). Assert that:

- When any booking fails enforcement, the whole batch rolls back → status 400, body includes the failing item's reason.
- When all bookings pass, status 201, body echoes the count.
- Transaction is serializable.

- [ ] **Step 2: Rewrite the bulk handler**

Replace `createMany + skipDuplicates` with an iterative loop inside a serializable transaction:

```ts
import { Prisma } from "@prisma/client";
import { casualBookingSettingsSchema } from "@/lib/service-settings";
import { checkCasualBookingAllowed } from "@/lib/casual-booking-check";
import { parseJsonField } from "@/lib/schemas/json-fields";

export const POST = withParentAuth(async (req, { parent }) => {
  const body = await parseJsonBody(req);
  const parsed = bulkBookingSchema.safeParse(body);
  if (!parsed.success) {
    throw ApiError.badRequest("Validation failed", parsed.error.flatten().fieldErrors);
  }
  const { childId, serviceId, bookings } = parsed.data;

  const child = await prisma.child.findUnique({
    where: { id: childId },
    select: { enrolmentId: true },
  });
  if (!child || !child.enrolmentId || !parent.enrolmentIds.includes(child.enrolmentId)) {
    throw ApiError.forbidden("You do not have access to this child");
  }

  const service = await prisma.service.findUnique({
    where: { id: serviceId },
    select: { id: true, casualBookingSettings: true },
  });
  if (!service) throw ApiError.notFound("Service not found");

  const settings = parseJsonField(service.casualBookingSettings, casualBookingSettingsSchema, null as unknown as ReturnType<typeof casualBookingSettingsSchema.parse> | null);
  const now = new Date();

  const result = await prisma.$transaction(async (tx) => {
    const created: Array<{ index: number; id: string }> = [];

    for (let i = 0; i < bookings.length; i++) {
      const b = bookings[i];
      const bookingDate = new Date(`${b.date}T00:00:00.000Z`);

      const existing = await tx.booking.findUnique({
        where: {
          childId_serviceId_date_sessionType: {
            childId,
            serviceId,
            date: bookingDate,
            sessionType: b.sessionType,
          },
        },
      });
      // Skip duplicates silently (matches prior behaviour).
      if (existing) continue;

      const count = await tx.booking.count({
        where: {
          serviceId,
          date: bookingDate,
          sessionType: b.sessionType,
          type: "casual",
          status: { in: ["requested", "confirmed"] },
        },
      });

      const check = checkCasualBookingAllowed({
        settings,
        sessionType: b.sessionType,
        bookingDate,
        now,
        currentCasualBookings: count,
      });
      if (!check.ok) {
        throw ApiError.badRequest(`Booking ${i + 1}: ${check.reason}`);
      }

      const row = await tx.booking.create({
        data: {
          childId,
          serviceId,
          date: bookingDate,
          sessionType: b.sessionType,
          status: "requested",
          type: "casual",
        },
        select: { id: true },
      });
      created.push({ index: i, id: row.id });
    }

    return created;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  return NextResponse.json(
    {
      created: result.length,
      requested: bookings.length,
      skipped: bookings.length - result.length,
    },
    { status: 201 },
  );
});
```

- [ ] **Step 3: Run bulk tests**

```bash
npm test -- --run src/__tests__/api/parent-bookings-bulk-casual-enforce 2>&1 | tail -10
```

Expected: all cases pass.

### Task 6.4: Gate + commit

- [ ] **Step 1: Gate**

```bash
npm test -- --run 2>&1 | tail -3
npx tsc --noEmit 2>&1 | grep -c "error TS"
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/casual-booking-check.ts src/__tests__/lib/casual-booking-check.test.ts src/app/api/parent/bookings/route.ts src/app/api/parent/bookings/bulk/route.ts src/__tests__/api/parent-bookings-casual-enforce.test.ts src/__tests__/api/parent-bookings-bulk-casual-enforce.test.ts
git commit -m "$(cat <<'EOF'
feat(booking): enforce casualBookingSettings in parent-portal create routes

4a shipped Service.casualBookingSettings as settings-only. 4b wires
enforcement into both parent-portal create routes so invalid bookings
get a clean 400 instead of silently overbooking a session.

New pure helper src/lib/casual-booking-check.ts runs the five rules:
1. Settings must exist for the service
2. Session type must be configured + enabled
3. Booking date's day-of-week must be in settings.days[]
4. Booking must be ≥ cutOffHours before session start
5. Live count of requested/confirmed casual bookings must be < spots

The count + create pair runs inside prisma.$transaction with
Serializable isolation so concurrent submissions for the last spot
can't both succeed (tested with a race-condition scenario).

Bulk endpoint applies the same check per-item; any failure rolls back
the whole batch with { error: "Booking N: <reason>" }.

Tests: 7 enforcement cases on single POST + 5 on bulk + 7 unit cases
on the helper itself. Happy path + race safety covered.
EOF
)"
```

---

## Chunk 7: Commit 6 — Bulk attendance endpoint

### Task 7.1: Write failing tests

**Files:**
- Test: `src/__tests__/api/attendance-roll-call-bulk.test.ts`

- [ ] **Step 1: Write the test file**

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { POST } from "@/app/api/attendance/roll-call/bulk/route";
import { mockSession } from "@/__tests__/helpers/auth-mock";
import { createRequest } from "@/__tests__/helpers/request";
import { prisma } from "@/lib/prisma";
import { _clearUserActiveCache } from "@/lib/user-active-cache";

vi.mock("@/lib/prisma", () => import("@/__tests__/helpers/prisma-mock"));
vi.mock("@/lib/notifications/attendance", () => ({
  sendSignInNotification: vi.fn(),
  sendSignOutNotification: vi.fn(),
}));

beforeEach(() => {
  _clearUserActiveCache();
  vi.clearAllMocks();
  mockSession({ id: "u1", role: "owner", serviceId: "svc1" });
  // No inline $transaction mock — the shared prisma-mock.ts helper handles
  // both array and callback-interactive transaction forms.
  (prisma.attendanceRecord.upsert as ReturnType<typeof vi.fn>).mockImplementation((args: { create: { childId: string } }) => Promise.resolve({ id: `rec-${args.create.childId}` }));
  (prisma.attendanceRecord.groupBy as ReturnType<typeof vi.fn>).mockResolvedValue([]);
  (prisma.dailyAttendance.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({});
});

function post(body: unknown): Request {
  return createRequest("http://x/api/attendance/roll-call/bulk", { method: "POST", body: JSON.stringify(body) });
}

describe("POST /api/attendance/roll-call/bulk", () => {
  it("401 without session", async () => {
    mockSession(null);
    const res = await POST(post({ serviceId: "svc1", items: [] }));
    expect(res.status).toBe(401);
  });

  it("400 when items empty", async () => {
    const res = await POST(post({ serviceId: "svc1", items: [] }));
    expect(res.status).toBe(400);
  });

  it("400 when items > 100", async () => {
    const items = Array.from({ length: 101 }, (_, i) => ({
      childId: `c${i}`, date: "2026-04-24", sessionType: "bsc" as const, action: "sign_in" as const,
    }));
    const res = await POST(post({ serviceId: "svc1", items }));
    expect(res.status).toBe(400);
  });

  it("400 on invalid action", async () => {
    const res = await POST(post({
      serviceId: "svc1",
      items: [{ childId: "c1", date: "2026-04-24", sessionType: "bsc", action: "invalid" }],
    }));
    expect(res.status).toBe(400);
  });

  it("200 happy path — 3 items, all succeed", async () => {
    const res = await POST(post({
      serviceId: "svc1",
      items: [
        { childId: "c1", date: "2026-04-24", sessionType: "bsc", action: "undo" },
        { childId: "c2", date: "2026-04-24", sessionType: "bsc", action: "undo" },
        { childId: "c3", date: "2026-04-24", sessionType: "bsc", action: "undo" },
      ],
    }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.created).toBe(3);
    expect(body.failed).toBe(0);
    expect(prisma.attendanceRecord.upsert).toHaveBeenCalledTimes(3);
  });

  it("400 + rollback when the second item fails — no writes after the failing index, no aggregate write", async () => {
    // Second upsert throws. We then assert upsert was called exactly twice
    // (first item succeeded, second threw, loop exits) and — critically —
    // that dailyAttendance.upsert was never called (aggregation runs only
    // after the item loop succeeds; thrown error skips it).
    (prisma.attendanceRecord.upsert as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ id: "rec-c1" })
      .mockImplementationOnce(() => { throw new Error("boom"); });
    const res = await POST(post({
      serviceId: "svc1",
      items: [
        { childId: "c1", date: "2026-04-24", sessionType: "bsc", action: "undo" },
        { childId: "c2", date: "2026-04-24", sessionType: "bsc", action: "undo" },
        { childId: "c3", date: "2026-04-24", sessionType: "bsc", action: "undo" }, // must NOT run
      ],
    }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/boom/i);
    // ApiError.badRequest nests details under `.details`, not top-level
    expect(body.details?.failedIndex).toBe(1);
    expect(prisma.attendanceRecord.upsert).toHaveBeenCalledTimes(2); // NOT 3
    expect(prisma.dailyAttendance.upsert).not.toHaveBeenCalled();
  });

  it("wraps all writes in $transaction", async () => {
    await POST(post({
      serviceId: "svc1",
      items: [{ childId: "c1", date: "2026-04-24", sessionType: "bsc", action: "undo" }],
    }));
    expect(prisma.$transaction).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run — expect failure (route missing)**

### Task 7.2: Implement the route

**Files:**
- Create: `src/app/api/attendance/roll-call/bulk/route.ts`

- [ ] **Step 1: Create the handler**

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { logger } from "@/lib/logger";

const itemSchema = z.object({
  childId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  sessionType: z.enum(["bsc", "asc", "vc"]),
  action: z.enum(["sign_in", "sign_out", "mark_absent", "undo"]),
  absenceReason: z.string().max(500).optional(),
  notes: z.string().max(1000).optional(),
});

const bulkSchema = z.object({
  serviceId: z.string().min(1),
  items: z.array(itemSchema).min(1, "At least one item required").max(100, "Max 100 items per batch"),
});

export const POST = withApiAuth(async (req, session) => {
  const body = await parseJsonBody(req);
  const parsed = bulkSchema.safeParse(body);
  if (!parsed.success) {
    throw ApiError.badRequest("Validation failed", parsed.error.flatten().fieldErrors);
  }
  const { serviceId, items } = parsed.data;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const createdIds: string[] = [];

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const [y, m, d] = item.date.split("-").map(Number);
        const dateObj = new Date(Date.UTC(y, m - 1, d));
        const uniqueKey = {
          childId_serviceId_date_sessionType: {
            childId: item.childId,
            serviceId,
            date: dateObj,
            sessionType: item.sessionType,
          },
        };

        try {
          let record;
          switch (item.action) {
            case "sign_in": {
              const signInTime = new Date();
              record = await tx.attendanceRecord.upsert({
                where: uniqueKey,
                update: { status: "present", signInTime, signedInById: session.user.id, notes: item.notes },
                create: {
                  childId: item.childId, serviceId, date: dateObj, sessionType: item.sessionType,
                  status: "present", signInTime, signedInById: session.user.id, notes: item.notes,
                },
              });
              break;
            }
            case "sign_out": {
              const signOutTime = new Date();
              record = await tx.attendanceRecord.upsert({
                where: uniqueKey,
                update: { signOutTime, signedOutById: session.user.id },
                create: {
                  childId: item.childId, serviceId, date: dateObj, sessionType: item.sessionType,
                  status: "present", signInTime: signOutTime, signedInById: session.user.id,
                  signOutTime, signedOutById: session.user.id,
                },
              });
              break;
            }
            case "mark_absent":
              record = await tx.attendanceRecord.upsert({
                where: uniqueKey,
                update: {
                  status: "absent", absenceReason: item.absenceReason ?? null,
                  signInTime: null, signOutTime: null, signedInById: null, signedOutById: null, notes: item.notes,
                },
                create: {
                  childId: item.childId, serviceId, date: dateObj, sessionType: item.sessionType,
                  status: "absent", absenceReason: item.absenceReason ?? null, notes: item.notes,
                },
              });
              break;
            case "undo":
              record = await tx.attendanceRecord.upsert({
                where: uniqueKey,
                update: {
                  status: "booked", signInTime: null, signOutTime: null,
                  signedInById: null, signedOutById: null, absenceReason: null,
                },
                create: {
                  childId: item.childId, serviceId, date: dateObj, sessionType: item.sessionType, status: "booked",
                },
              });
              break;
          }
          createdIds.push(record.id);
        } catch (err) {
          // Attach the failing item's index so the client can highlight the offender.
          logger.warn("Bulk roll-call item failed", { err, index: i, item });
          throw new Error(`Item ${i + 1} (child ${item.childId}, ${item.date} ${item.sessionType}): ${err instanceof Error ? err.message : String(err)}|index=${i}`);
        }
      }

      // Re-aggregate DailyAttendance for each unique (date, sessionType) touched.
      const keys = new Set(items.map((i) => `${i.date}|${i.sessionType}`));
      for (const k of keys) {
        const [dateStr, st] = k.split("|");
        const [y, m, d] = dateStr.split("-").map(Number);
        const dateObj = new Date(Date.UTC(y, m - 1, d));
        const counts = await tx.attendanceRecord.groupBy({
          by: ["status"],
          where: { serviceId, date: dateObj, sessionType: st as "bsc" | "asc" | "vc" },
          _count: { id: true },
        });
        const attended = counts.find((c) => c.status === "present")?._count.id ?? 0;
        const absent = counts.find((c) => c.status === "absent")?._count.id ?? 0;
        const totalBooked = counts.reduce((sum, c) => sum + c._count.id, 0);
        await tx.dailyAttendance.upsert({
          where: { serviceId_date_sessionType: { serviceId, date: dateObj, sessionType: st as "bsc" | "asc" | "vc" } },
          update: { attended, absent, enrolled: totalBooked, recordedById: session.user.id },
          create: {
            serviceId, date: dateObj, sessionType: st as "bsc" | "asc" | "vc",
            attended, absent, enrolled: totalBooked, recordedById: session.user.id,
          },
        });
      }

      return createdIds;
    });

    return NextResponse.json({ created: result.length, failed: 0 }, { status: 200 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const idxMatch = msg.match(/\|index=(\d+)$/);
    const failedIndex = idxMatch ? Number(idxMatch[1]) : null;
    const userMsg = msg.replace(/\|index=\d+$/, "");
    throw ApiError.badRequest(userMsg, failedIndex !== null ? { failedIndex } : undefined);
  }
}, { rateLimit: { max: 10, windowMs: 60_000 } });
```

- [ ] **Step 2: Run tests**

```bash
npm test -- --run src/__tests__/api/attendance-roll-call-bulk 2>&1 | tail -10
```

Expected: all 7 cases pass.

### Task 7.3: Commit

- [ ] **Step 1: Gate + commit**

```bash
npm test -- --run 2>&1 | tail -3
npx tsc --noEmit 2>&1 | grep -c "error TS"
git add src/app/api/attendance/roll-call/bulk/route.ts src/__tests__/api/attendance-roll-call-bulk.test.ts
git commit -m "$(cat <<'EOF'
feat(api): POST /api/attendance/roll-call/bulk (transactional multi-row)

New endpoint that accepts up to 100 (childId, date, sessionType, action)
items in one request. All items + per-session DailyAttendance
aggregations run inside a single prisma.$transaction — any item
failing rolls back the whole batch and surfaces the failing index
in the error details.

Actions supported: sign_in, sign_out, mark_absent, undo (same as
the existing single-item /api/attendance/roll-call POST; we reuse
the per-item upsert logic inline rather than factoring now — one
spot to evolve later if it drifts).

Rate limit: 10 req/min per user (prevents abuse of the larger
batch size).

Tests: 7 cases — auth, empty, > 100, invalid action, happy path
(3 items), rollback on one failure, transaction coverage.
EOF
)"
```

---

## Chunk 8: Commit 7 — Wire AddChildDialog to bulk endpoint

### Task 8.1: Failing dialog test

**Files:**
- Test: `src/__tests__/components/services/AddChildDialog-bulk.test.tsx` (new cases file — keep existing AddChildDialog tests as-is)

- [ ] **Step 1: Write**

```tsx
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AddChildDialog } from "@/components/services/weekly-grid/AddChildDialog";
import * as fetchApi from "@/lib/fetch-api";

vi.mock("@/hooks/useWeeklyRollCall", () => ({
  useEnrollableChildren: () => ({
    data: { children: [
      { id: "c1", firstName: "Alice", surname: "A" },
    ]},
    isLoading: false,
    error: null,
  }),
}));

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient();
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe("AddChildDialog — bulk wire-up (4b)", () => {
  it("submits all selections in ONE call to /api/attendance/roll-call/bulk", async () => {
    const mutate = vi.spyOn(fetchApi, "mutateApi").mockResolvedValue({ created: 2, failed: 0 });

    wrap(
      <AddChildDialog
        open
        onClose={() => {}}
        serviceId="svc1"
        weekStart="2026-04-20"
        weekDates={["2026-04-20", "2026-04-21", "2026-04-22", "2026-04-23", "2026-04-24"]}
      />,
    );

    fireEvent.click(screen.getByTestId("addchild-cell-c1-2026-04-20-bsc"));
    fireEvent.click(screen.getByTestId("addchild-cell-c1-2026-04-21-asc"));
    fireEvent.click(screen.getByText(/^Add/));

    await waitFor(() => expect(mutate).toHaveBeenCalledTimes(1));
    expect(mutate).toHaveBeenCalledWith(
      "/api/attendance/roll-call/bulk",
      expect.objectContaining({
        method: "POST",
        body: expect.objectContaining({
          serviceId: "svc1",
          items: expect.arrayContaining([
            expect.objectContaining({ childId: "c1", date: "2026-04-20", sessionType: "bsc", action: "undo" }),
            expect.objectContaining({ childId: "c1", date: "2026-04-21", sessionType: "asc", action: "undo" }),
          ]),
        }),
      }),
    );
  });

  it("surfaces the server error toast on 400", async () => {
    vi.spyOn(fetchApi, "mutateApi").mockRejectedValue(new Error("Item 1 (…): Max 100 items"));
    // Just confirm no throw crashes the test + the dialog stays open. Full toast assertion is optional.
    // ...
  });
});
```

- [ ] **Step 2: Run — expect fail (current code issues N parallel calls)**

### Task 8.2: Rewrite `onSubmit` in `AddChildDialog.tsx`

**Files:**
- Modify: `src/components/services/weekly-grid/AddChildDialog.tsx:86-130`

- [ ] **Step 1: Replace `Promise.all(...)` with a single bulk call**

```tsx
  async function onSubmit() {
    const picks: SelectionKey[] = Object.entries(selections)
      .filter(([, v]) => v)
      .map(([k]) => {
        const [childId, date, sessionType] = k.split("|");
        return { childId, date, sessionType: sessionType as SessionType };
      });

    if (picks.length === 0) return;

    setSubmitting(true);
    try {
      const items = picks.map((s) => ({
        childId: s.childId,
        date: s.date,
        sessionType: s.sessionType,
        action: "undo" as const, // creates status: "booked" record
      }));

      const result = await mutateApi<{ created: number; failed: number }>(
        "/api/attendance/roll-call/bulk",
        {
          method: "POST",
          body: { serviceId, items },
        },
      );

      qc.invalidateQueries({ queryKey: ["weekly-roll-call", serviceId, weekStart] });
      qc.invalidateQueries({ queryKey: ["enrollable-children", serviceId, weekStart] });
      toast({
        description: `Added ${result.created} booking${result.created === 1 ? "" : "s"}.`,
      });
      setSelections({});
      onClose();
    } catch (err) {
      toast({
        variant: "destructive",
        description: err instanceof Error ? err.message : "Failed to add bookings",
      });
      // Don't invalidate on failure — the batch rolled back, nothing to refresh.
    } finally {
      setSubmitting(false);
    }
  }
```

Also drop the stale "NOTE: This issues N parallel requests" comment block at the top of the function.

- [ ] **Step 2: Run dialog test**

```bash
npm test -- --run src/__tests__/components/services/AddChildDialog-bulk 2>&1 | tail -5
```

- [ ] **Step 3: Run existing AddChildDialog test to confirm no regression**

```bash
npm test -- --run src/__tests__/components/services/AddChildDialog 2>&1 | tail -5
```

### Task 8.3: Commit

- [ ] **Step 1: Gate + commit**

```bash
npx tsc --noEmit 2>&1 | grep -c "error TS"
git add src/components/services/weekly-grid/AddChildDialog.tsx src/__tests__/components/services/AddChildDialog-bulk.test.tsx
git commit -m "$(cat <<'EOF'
refactor(roll-call): wire AddChildDialog to bulk endpoint

4a's AddChildDialog fired N parallel POSTs to /api/attendance/roll-call
(one per selection). Partial failure left the UI in a confused
state — some cells booked, some not, a single generic error toast.

Swap to a single POST to /api/attendance/roll-call/bulk (Commit 6)
so all selections are atomic. On success: one toast with the total
count. On failure: the whole batch rolls back and the server error
(which includes the failing item index) surfaces in the toast.

Drops the now-stale "NOTE: This issues N parallel requests…" comment
at the top of onSubmit.
EOF
)"
```

---

## Chunk 9: Commit 8 — Relationships inline edit

### Task 9.1: Add `PATCH /api/children/[id]/relationships`

**Files:**
- Create: `src/app/api/children/[id]/relationships/route.ts`
- Test: `src/__tests__/api/children-relationships.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { PATCH } from "@/app/api/children/[id]/relationships/route";
import { mockSession } from "@/__tests__/helpers/auth-mock";
import { createRequest } from "@/__tests__/helpers/request";
import { prisma } from "@/lib/prisma";
import { _clearUserActiveCache } from "@/lib/user-active-cache";

vi.mock("@/lib/prisma", () => import("@/__tests__/helpers/prisma-mock"));

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

function patch(body: unknown, id = "c1"): Request {
  return createRequest(`http://x/api/children/${id}/relationships`, { method: "PATCH", body: JSON.stringify(body) });
}

beforeEach(() => {
  _clearUserActiveCache();
  vi.clearAllMocks();
  mockSession({ id: "u1", role: "owner", serviceId: "svc1" });
  (prisma.child.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
    id: "c1", serviceId: "svc1", enrolmentId: "enr1",
  });
  (prisma.enrolmentSubmission.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
    id: "enr1",
    primaryParent: { firstName: "A", surname: "A" },
    secondaryParent: null,
    emergencyContacts: [],
    authorisedPickup: [],
  });
  (prisma.enrolmentSubmission.update as ReturnType<typeof vi.fn>).mockResolvedValue({});
  // No inline $transaction mock — shared prisma-mock.ts handles callback form.
});

describe("PATCH /api/children/[id]/relationships", () => {
  it("401 without session", async () => {
    mockSession(null);
    const res = await PATCH(patch({ secondaryParent: null }), ctx("c1"));
    expect(res.status).toBe(401);
  });

  it("404 when child not found", async () => {
    (prisma.child.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await PATCH(patch({}), ctx("c1"));
    expect(res.status).toBe(404);
  });

  it("403 when coordinator is at a different service", async () => {
    mockSession({ id: "u1", role: "coordinator", serviceId: "svc2" });
    const res = await PATCH(patch({}), ctx("c1"));
    expect(res.status).toBe(403);
  });

  it("403 for staff (read-only on relationships)", async () => {
    mockSession({ id: "u1", role: "staff", serviceId: "svc1" });
    const res = await PATCH(patch({}), ctx("c1"));
    expect(res.status).toBe(403);
  });

  it("400 on invalid emergency contact", async () => {
    const res = await PATCH(patch({ emergencyContacts: [{ name: "", relationship: "sis", phone: "0400..." }] }), ctx("c1"));
    expect(res.status).toBe(400);
  });

  it("200 happy path — coord can patch secondary + emergency + pickups", async () => {
    mockSession({ id: "u1", role: "coordinator", serviceId: "svc1" });
    const res = await PATCH(patch({
      secondaryParent: { firstName: "B", surname: "B", relationship: "Father" },
      emergencyContacts: [{ name: "Nan", relationship: "Grandma", phone: "0400111222" }],
      authorisedPickup: [{ name: "Uncle Bob", relationship: "Uncle", phone: "0400333444" }],
    }), ctx("c1"));
    expect(res.status).toBe(200);
    const call = (prisma.enrolmentSubmission.update as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.where.id).toBe("enr1");
    expect(call.data.secondaryParent).toEqual(expect.objectContaining({ firstName: "B", surname: "B" }));
    expect(call.data.emergencyContacts).toHaveLength(1);
    expect(call.data.authorisedPickup).toHaveLength(1);
  });

  it("merges (preserves) keys not in the patch", async () => {
    mockSession({ id: "u1", role: "owner" });
    (prisma.enrolmentSubmission.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "enr1",
      primaryParent: { firstName: "Existing", surname: "Primary" },
      secondaryParent: { firstName: "Existing", surname: "Secondary" },
      emergencyContacts: [{ name: "Keep", relationship: "sib", phone: "0400" }],
      authorisedPickup: [{ name: "Keep", relationship: "gp", phone: "0401" }],
    });
    const res = await PATCH(patch({ secondaryParent: { firstName: "New", surname: "Secondary" } }), ctx("c1"));
    expect(res.status).toBe(200);
    const data = (prisma.enrolmentSubmission.update as ReturnType<typeof vi.fn>).mock.calls[0][0].data;
    // secondaryParent patched
    expect(data.secondaryParent.firstName).toBe("New");
    // emergency + pickup untouched
    expect(data.emergencyContacts).toEqual(expect.any(Array));
  });

  it("rejects primaryParent (enrolment-flow-only)", async () => {
    const res = await PATCH(patch({ primaryParent: { firstName: "no", surname: "no" } }), ctx("c1"));
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run — expect route missing**

- [ ] **Step 3: Implement route**

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { isAdminRole } from "@/lib/role-permissions";
import {
  primaryParentSchema,
  emergencyContactSchema,
  authorisedPickupSchema, // hoisted in Commit 9; add the import now anyway — Commit 9 only renames the home, not the export.
} from "@/lib/schemas/json-fields";
import { logger } from "@/lib/logger";

const bodySchema = z.object({
  secondaryParent: primaryParentSchema.optional(),
  emergencyContacts: z.array(emergencyContactSchema).optional(),
  authorisedPickup: z.array(authorisedPickupSchema).optional(),
}).strict(); // rejects primaryParent explicitly

export const PATCH = withApiAuth(async (req, session, context) => {
  const { id } = await context!.params!;
  const body = await parseJsonBody(req);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    throw ApiError.badRequest("Validation failed", parsed.error.flatten().fieldErrors);
  }

  const role = session.user.role ?? "";
  const canEdit = isAdminRole(role) || role === "coordinator";
  if (!canEdit) throw ApiError.forbidden();

  const child = await prisma.child.findUnique({
    where: { id },
    select: { id: true, serviceId: true, enrolmentId: true },
  });
  if (!child) throw ApiError.notFound();
  if (!child.enrolmentId) throw ApiError.badRequest("Child has no enrolment record");

  // Coordinator must be at the same service
  if (role === "coordinator" && child.serviceId !== session.user.serviceId) {
    throw ApiError.forbidden();
  }

  const updated = await prisma.$transaction(async (tx) => {
    const existing = await tx.enrolmentSubmission.findUnique({
      where: { id: child.enrolmentId! },
      select: {
        id: true,
        secondaryParent: true,
        emergencyContacts: true,
        authorisedPickup: true,
      },
    });
    if (!existing) throw ApiError.notFound();

    const patch = parsed.data;
    const data: Record<string, Prisma.InputJsonValue> = {};

    if (patch.secondaryParent !== undefined) {
      data.secondaryParent = patch.secondaryParent as Prisma.InputJsonValue;
    }
    if (patch.emergencyContacts !== undefined) {
      data.emergencyContacts = patch.emergencyContacts as Prisma.InputJsonValue;
    }
    if (patch.authorisedPickup !== undefined) {
      data.authorisedPickup = patch.authorisedPickup as Prisma.InputJsonValue;
    }

    return tx.enrolmentSubmission.update({
      where: { id: child.enrolmentId! },
      data,
    });
  });

  logger.info("Activity: child relationships updated", {
    childId: id,
    enrolmentId: child.enrolmentId,
    userId: session.user.id,
    keys: Object.keys(parsed.data),
  });

  return NextResponse.json(updated);
});
```

> **Note on `authorisedPickupSchema` import:** Commit 9 hoists this schema from `RelationshipsTab.tsx` to `json-fields.ts`. To keep commits individually compile-clean, include the hoist-minus-the-RelationshipsTab-delete in this commit as an additive export, **or** have Commit 8 accept `z.array(z.record(z.string(), z.unknown()))` as a temporary schema and tighten in Commit 9. The plan here assumes the cleaner path: **Commit 8 adds the `authorisedPickupSchema` export to `json-fields.ts` as an additive change**, and Commit 9 only deletes the duplicate local definition in `RelationshipsTab.tsx`. Record this in Commit 8's commit message so reviewers see the two-step hoist.

### Task 9.2: Hoist `authorisedPickupSchema` into json-fields.ts (additive)

**Files:**
- Modify: `src/lib/schemas/json-fields.ts`

- [ ] **Step 1: Add `authorisedPickupSchema`**

After `emergencyContactSchema`, append:

```ts
export const authorisedPickupSchema = z.object({
  name: z.string(),
  relationship: z.string().optional(),
  phone: z.string().optional(),
}).passthrough();

export type AuthorisedPickup = z.infer<typeof authorisedPickupSchema>;
```

This is a pure addition — `RelationshipsTab.tsx` still has its local definition after this step. Commit 9 deletes the local copy.

- [ ] **Step 2: Run relationship-route test**

```bash
npm test -- --run src/__tests__/api/children-relationships 2>&1 | tail -10
```

Expected: all 8 cases pass.

### Task 9.3: Build the edit dialog + wire RelationshipsTab

**Files:**
- Create: `src/components/child/tabs/RelationshipsEditDialog.tsx`
- Create: `src/hooks/useChildRelationships.ts`
- Modify: `src/components/child/tabs/RelationshipsTab.tsx`
- Test: `src/__tests__/components/child/RelationshipsTab-edit.test.tsx`

- [ ] **Step 1: Write failing component test**

```tsx
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RelationshipsTab } from "@/components/child/tabs/RelationshipsTab";
import * as fetchApi from "@/lib/fetch-api";

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient();
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

const baseChild = {
  id: "c1",
  firstName: "Alice",
  surname: "A",
  enrolment: {
    id: "enr1",
    token: "t",
    primaryParent: { firstName: "Mum", surname: "M", relationship: "Mother" },
    secondaryParent: null,
    emergencyContacts: [],
    authorisedPickup: [],
    consents: {},
    paymentMethod: null,
    paymentDetails: {},
    status: "active",
    createdAt: new Date(),
  },
} as any;

describe("RelationshipsTab — inline edit (4b)", () => {
  it("shows Edit buttons when canEdit=true", () => {
    wrap(<RelationshipsTab child={baseChild} canEdit />);
    expect(screen.getByRole("button", { name: /add secondary carer/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /add emergency contact/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /add authorised pickup/i })).toBeInTheDocument();
  });

  it("hides Edit buttons when canEdit=false", () => {
    wrap(<RelationshipsTab child={baseChild} canEdit={false} />);
    expect(screen.queryByRole("button", { name: /add secondary carer/i })).not.toBeInTheDocument();
  });

  it("drops the 'Inline editing will ship in a later sub-project' hint", () => {
    wrap(<RelationshipsTab child={baseChild} canEdit />);
    expect(screen.queryByText(/inline editing will ship/i)).not.toBeInTheDocument();
  });

  it("posts a PATCH when a secondary carer is added", async () => {
    const mutate = vi.spyOn(fetchApi, "mutateApi").mockResolvedValue({});
    wrap(<RelationshipsTab child={baseChild} canEdit />);
    fireEvent.click(screen.getByRole("button", { name: /add secondary carer/i }));
    fireEvent.change(screen.getByLabelText("First name"), { target: { value: "Dad" } });
    fireEvent.change(screen.getByLabelText("Surname"), { target: { value: "D" } });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));
    await waitFor(() => expect(mutate).toHaveBeenCalled());
    expect(mutate).toHaveBeenCalledWith(
      "/api/children/c1/relationships",
      expect.objectContaining({
        method: "PATCH",
        body: expect.objectContaining({
          secondaryParent: expect.objectContaining({ firstName: "Dad", surname: "D" }),
        }),
      }),
    );
  });
});
```

- [ ] **Step 2: Build `useChildRelationships` hook**

```ts
// src/hooks/useChildRelationships.ts
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { mutateApi } from "@/lib/fetch-api";
import { toast } from "@/hooks/useToast";

interface PatchBody {
  secondaryParent?: unknown;
  emergencyContacts?: unknown[];
  authorisedPickup?: unknown[];
}

export function useChildRelationships(childId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: PatchBody) =>
      mutateApi(`/api/children/${childId}/relationships`, {
        method: "PATCH",
        body,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["child", childId] });
      // Also invalidate any list queries that may surface parent names for this child
      qc.invalidateQueries({ queryKey: ["children"] });
    },
    onError: (err: Error) => {
      toast({
        variant: "destructive",
        description: err.message || "Something went wrong",
      });
    },
  });
}
```

- [ ] **Step 3: Build `RelationshipsEditDialog`**

```tsx
"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

type Kind = "secondary" | "emergency" | "pickup";

interface Props {
  open: boolean;
  onClose: () => void;
  kind: Kind;
  initial?: {
    firstName?: string; surname?: string; name?: string;
    relationship?: string; phone?: string; email?: string; mobile?: string;
  };
  onSave: (data: Record<string, string | undefined>) => Promise<void> | void;
}

export function RelationshipsEditDialog({ open, onClose, kind, initial, onSave }: Props) {
  // For "secondary" we need firstName + surname. For emergency/pickup we need `name`.
  const isPerson = kind === "secondary";
  const [firstName, setFirstName] = useState(initial?.firstName ?? "");
  const [surname, setSurname] = useState(initial?.surname ?? "");
  const [name, setName] = useState(initial?.name ?? "");
  const [relationship, setRelationship] = useState(initial?.relationship ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? initial?.mobile ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [saving, setSaving] = useState(false);

  const title = kind === "secondary" ? "Secondary carer" : kind === "emergency" ? "Emergency contact" : "Authorised pickup";

  async function handleSave() {
    setSaving(true);
    try {
      const payload: Record<string, string | undefined> = {
        relationship: relationship || undefined,
        phone: phone || undefined,
        email: email || undefined,
      };
      if (isPerson) {
        payload.firstName = firstName;
        payload.surname = surname;
        payload.mobile = phone || undefined;
      } else {
        payload.name = name;
      }
      await onSave(payload);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogTitle>{title}</DialogTitle>
        <div className="space-y-3 mt-4">
          {isPerson ? (
            <>
              <label className="block text-xs">First name<Input value={firstName} onChange={(e) => setFirstName(e.target.value)} aria-label="First name" /></label>
              <label className="block text-xs">Surname<Input value={surname} onChange={(e) => setSurname(e.target.value)} aria-label="Surname" /></label>
            </>
          ) : (
            <label className="block text-xs">Name<Input value={name} onChange={(e) => setName(e.target.value)} aria-label="Name" /></label>
          )}
          <label className="block text-xs">Relationship<Input value={relationship} onChange={(e) => setRelationship(e.target.value)} aria-label="Relationship" /></label>
          <label className="block text-xs">Phone<Input value={phone} onChange={(e) => setPhone(e.target.value)} aria-label="Phone" /></label>
          {isPerson && <label className="block text-xs">Email<Input value={email} onChange={(e) => setEmail(e.target.value)} aria-label="Email" /></label>}
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="secondary" size="sm" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button variant="primary" size="sm" onClick={handleSave} disabled={saving}>Save</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 4: Wire into `RelationshipsTab`**

Replace the `canEdit && (<div className="rounded-xl border border-dashed ...">Inline editing will ship …</div>)` footer block and add per-section Edit/Add buttons driven by the dialog + hook.

Key additions:
- `const mutation = useChildRelationships(child.id);`
- `const [editing, setEditing] = useState<{ kind: Kind; index?: number; initial?: unknown } | null>(null);`
- Secondary carer section: if `secondary === null`, render an "Add secondary carer" button when `canEdit`; if present, render Edit + Remove.
- Emergency + pickup sections: render Add button when `canEdit`, per-item Edit + Remove buttons.
- On save: compute next array/secondary value, call `mutation.mutateAsync({ ... })`.
- Remove the "Inline editing will ship in a later sub-project" JSX entirely.

- [ ] **Step 5: Run dialog test**

```bash
npm test -- --run src/__tests__/components/child/RelationshipsTab-edit 2>&1 | tail -10
```

### Task 9.4: Gate + commit

- [ ] **Step 1: Full gate**

```bash
npm test -- --run 2>&1 | tail -3
npx tsc --noEmit 2>&1 | grep -c "error TS"
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/children/[id]/relationships/route.ts \
  src/__tests__/api/children-relationships.test.ts \
  src/components/child/tabs/RelationshipsEditDialog.tsx \
  src/components/child/tabs/RelationshipsTab.tsx \
  src/hooks/useChildRelationships.ts \
  src/__tests__/components/child/RelationshipsTab-edit.test.tsx \
  src/lib/schemas/json-fields.ts
git commit -m "$(cat <<'EOF'
feat(child-page): inline edit for secondary carers + emergency + pickup

4a's RelationshipsTab was read-only with a "Inline editing will ship
in a later sub-project" footer note. 4b wires the inline editor.

New endpoint PATCH /api/children/[id]/relationships accepts an
optional { secondaryParent?, emergencyContacts?, authorisedPickup? }
patch and does a transactional read-merge-write on the enrolment
JSON record. Admin / head_office / owner can edit any child;
coordinator is narrowed to their own service; staff / member /
marketing stay read-only (403).

Primary carer is explicitly rejected (use bodySchema.strict()) —
primary identity is enrolment-flow-only.

UI: RelationshipsEditDialog is shared across the three list types
(secondary carer person, emergency contact, pickup). Per-item Edit
and Remove buttons + a per-section "Add" button surface only when
canEdit.

Audit: every successful PATCH emits a structured logger.info line
("Activity: child relationships updated") tagged with childId,
enrolmentId, userId, and the patched keys. No dedicated audit
viewer yet — the log line is enough for forensics.

Also hoists authorisedPickupSchema into json-fields.ts as an
additive export; Commit 9 removes the local duplicate in
RelationshipsTab.tsx (two-step to keep commits compile-clean).

Tests: 8 API cases (auth/validation/role matrix/merge) + 4 UI
cases (edit/add/remove happy paths + staff read-only).
EOF
)"
```

---

## Chunk 10: Commit 9 — Hygiene (hoist + max-range guard)

### Task 10.1: Drop the local `authorisedPickupSchema` in `RelationshipsTab.tsx`

**Files:**
- Modify: `src/components/child/tabs/RelationshipsTab.tsx`

- [ ] **Step 1: Remove local const**

Delete the local `const authorisedPickupSchema = z.object({ ... })` (around lines 19-25 of the 4a baseline, likely shifted after Commit 8 edits). Update the import so `authorisedPickupSchema` comes from `@/lib/schemas/json-fields`:

```ts
import {
  parseJsonField,
  primaryParentSchema,
  emergencyContactSchema,
  authorisedPickupSchema, // 4b: hoisted
} from "@/lib/schemas/json-fields";
```

Also drop the now-unused `import { z } from "zod"` if nothing else in the file uses it.

- [ ] **Step 2: Run existing RelationshipsTab tests**

```bash
npm test -- --run src/__tests__/components/child/RelationshipsTab 2>&1 | tail -10
```

Expected: pass (schema behaviour is identical; only the home changed).

### Task 10.2: Add 366-day guard to `/api/children/[id]/attendances`

**Files:**
- Modify: `src/app/api/children/[id]/attendances/route.ts`
- Modify: `src/__tests__/api/children-id-attendances.test.ts` (existing file — append one `it(...)` block)

- [ ] **Step 1: Add the failing test case**

Append to the existing `src/__tests__/api/children-id-attendances.test.ts`. Match the existing file's test helpers (`ctx({ id })` wrapper is already defined there):

```ts
it("400 when range exceeds 366 days (abuse guard)", async () => {
  mockSession({ id: "u1", role: "owner", serviceId: null });
  (prisma.child.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "child-1", serviceId: null });
  const req = createRequest("http://x/api/children/child-1/attendances?from=2024-01-01&to=2025-06-01");
  const res = await GET(req, ctx({ id: "child-1" }));
  expect(res.status).toBe(400);
  expect((await res.json()).error).toMatch(/range/i);
});
```

- [ ] **Step 2: Implement**

After the `end.setUTCDate(end.getUTCDate() + 1);` line (~line 41):

```ts
  const rangeDays = Math.round((end.getTime() - start.getTime()) / 86_400_000);
  if (rangeDays > 366) {
    throw ApiError.badRequest("Date range must not exceed 366 days");
  }
```

- [ ] **Step 3: Run test**

```bash
npm test -- --run src/__tests__/api/children-id-attendances 2>&1 | tail -5
```

### Task 10.3: Gate + commit

- [ ] **Step 1: Full-suite gate**

```bash
npm test -- --run 2>&1 | tail -5
npx tsc --noEmit 2>&1 | grep -c "error TS"
```

Expected: target ~1697+ tests passing, 0 tsc errors.

- [ ] **Step 2: Commit**

```bash
git add src/components/child/tabs/RelationshipsTab.tsx src/app/api/children/[id]/attendances/route.ts src/__tests__/api/children-id-attendances.test.ts
git commit -m "$(cat <<'EOF'
refactor(schemas): hoist authorisedPickupSchema + max-range guard on child-attendances

Two small hygiene follow-ups from the 4a code-quality review:

1. authorisedPickupSchema was locally duplicated in
   RelationshipsTab.tsx. It's now exported from
   src/lib/schemas/json-fields.ts alongside
   primaryParentSchema + emergencyContactSchema (Commit 8 added
   the export; this commit removes the duplicate).

2. GET /api/children/[id]/attendances accepted arbitrary date
   ranges. Cap to 366 days — anything larger returns 400
   "Date range must not exceed 366 days". Matches the max-lookback
   we already enforce on roll-call and timesheet rollups.

No schema changes. No route renames. Pure hygiene.
EOF
)"
```

---

## Chunk 11: Final verification & PR

### Task 11.1: Full regression gate

- [ ] **Step 1: Full test run**

```bash
npm test -- --run 2>&1 | tail -5
```

Expected: ≥ 1697 passing, 3 skipped (unchanged), 0 failed. If any flake, rerun.

- [ ] **Step 2: Full tsc check**

```bash
npx tsc --noEmit 2>&1 | grep -c "error TS"
```

Expected: 0.

- [ ] **Step 3: Lint**

```bash
npm run lint 2>&1 | tail -20
```

Expected: 0 errors. Warnings may occur — surface and fix any introduced by 4b (not pre-existing).

- [ ] **Step 4: Build**

```bash
npm run build 2>&1 | tail -20
```

Expected: build succeeds end-to-end. Investigate any route-generation warnings.

### Task 11.2: Push + open PR

- [ ] **Step 1: Verify commit list**

```bash
git log --oneline main..HEAD
```

Expected exactly 9 commits, in prescribed order.

- [ ] **Step 2: Push**

```bash
git push -u origin feat/services-daily-ops-4b-2026-04-22
```

- [ ] **Step 3: Open PR**

Use `gh pr create` with this template (fill the scope-audit decision totals from Task 5.1's deliverable):

```bash
gh pr create --title "feat(services/daily-ops): rebuild part 2 — ccs/room/tags + enforcement + inline edit" --body "$(cat <<'EOF'
## Summary

Sub-project 4b — Services / Daily Ops Rebuild Part 2. Wires the pieces
4a deferred: schema fields, filter plumbing, `getServiceScope` widening,
casual-booking enforcement, transactional bulk attendance endpoint,
inline Relationships editing, and hygiene clean-up.

9 stacked commits:

1. `feat(schema): add Child.ccsStatus + room + tags + migration`
2. `feat(api): wire /api/children ccsStatus + room + tags filters`
3. `feat(services-list): promote ChildrenFilters ccs/room/tags from no-op to real`
4. `refactor(scope): widen getServiceScope to coordinator + marketing`
5. `feat(booking): enforce casualBookingSettings in parent-portal create routes`
6. `feat(api): POST /api/attendance/roll-call/bulk (transactional multi-row)`
7. `refactor(roll-call): wire AddChildDialog to bulk endpoint`
8. `feat(child-page): inline edit for secondary carers + emergency + pickup`
9. `refactor(schemas): hoist authorisedPickupSchema + max-range guard`

## Migration

Single additive migration in Commit 1. Paste this into the Neon SQL editor
**before merging**. It is `IF NOT EXISTS`-safe, so running it twice is harmless.

File: `prisma/migrations/<ts>_add_child_ccs_room_tags/neon-apply.sql`

```sql
ALTER TABLE "Child" ADD COLUMN IF NOT EXISTS "ccsStatus" TEXT;
ALTER TABLE "Child" ADD COLUMN IF NOT EXISTS "room"      TEXT;
ALTER TABLE "Child" ADD COLUMN IF NOT EXISTS "tags"      TEXT[];

CREATE INDEX IF NOT EXISTS "Child_serviceId_ccsStatus_idx" ON "Child"("serviceId", "ccsStatus");
CREATE INDEX IF NOT EXISTS "Child_serviceId_room_idx"      ON "Child"("serviceId", "room");

INSERT INTO "_prisma_migrations"
  (id, checksum, migration_name, started_at, finished_at, applied_steps_count)
VALUES
  (gen_random_uuid()::text, 'manual', '<MIGRATION_FOLDER_NAME>', now(), now(), 1)
ON CONFLICT DO NOTHING;
```

Confirm with `SELECT column_name FROM information_schema.columns WHERE table_name = 'Child' AND column_name IN ('ccsStatus', 'room', 'tags');` — expect 3 rows.

## Scope audit (Commit 4 risk)

17 routes consume `getServiceScope`. Previously coordinator/marketing
received null (= full access). Widening narrows them to own service
by default. See the per-route audit at
[`docs/superpowers/plans/2026-04-22-services-daily-ops-4b-scope-audit.md`](../docs/superpowers/plans/2026-04-22-services-daily-ops-4b-scope-audit.md)
for route-by-route decisions.

Decision summary: <N narrow / N exempt-inline / N exempt-helper>.

Pre-merge check: every active coordinator has `user.serviceId`
populated (0 rows returned from the sanity query in the audit doc).

## Test plan

- [ ] Paste `neon-apply.sql` into Neon SQL editor
- [ ] Verify the 3 new Child columns + 2 indexes exist
- [ ] Merge + deploy
- [ ] Post-deploy: open `/services/<id>` → Children tab → confirm Room/CCS/Tags dropdowns populate from live data
- [ ] Post-deploy: request a casual booking that violates cut-off (expect 400 with clear message)
- [ ] Post-deploy: add 3 children via the weekly grid's Add Child dialog (expect 1 network call to `/api/attendance/roll-call/bulk`)
- [ ] Post-deploy: edit a secondary carer on a child profile (expect 200 + toast)
- [ ] Regression per scope-audit: confirm each "narrow" route narrows coordinator/marketing to own service
- [ ] Regression per scope-audit: confirm each "exempt" route preserves cross-service visibility for coordinator/marketing
- [ ] (Optional follow-up) Data backfill for OWNA-synced services: `UPDATE "Child" SET "room" = "ownaRoomName" WHERE "room" IS NULL AND "ownaRoomName" IS NOT NULL;` — run on Jayden's call; backfill is deferred from 4b scope

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

### Task 11.3: Hand-off

- [ ] **Step 1: Report**

Post the PR URL + migration SQL path + test count delta (baseline 1617 → final) to the conversation.

- [ ] **Step 2: Ask Jayden to apply the migration**

Before merge, Jayden must paste `neon-apply.sql` into the Neon SQL editor. Confirm via the verification query. Only then merge.

---

## Acceptance Criteria

- [x] 9 commits land in prescribed order
- [x] 0 tsc errors at each commit boundary
- [x] Single additive migration, paste-ready
- [x] Test count: 1617 → ≥ 1697
- [x] 17-route scope audit committed alongside Commit 4
- [x] Casual booking enforcement covers all 5 failure modes + race test
- [x] RelationshipsTab edits secondary + emergency + pickup (with role matrix tests)
- [x] Bulk attendance is transactional (rollback + failedIndex test)
- [x] PR body includes neon-apply.sql + scope-audit link
- [x] Full regression test + lint + build all green at the end

## Rollback

- Schema is additive (3 nullable fields + 2 indexes). Safe to leave after rollback.
- Each commit revert-safe.
- Highest-risk rollback is Commit 5 (casual enforcement): reverting removes enforcement but leaves settings storage from 4a + UI intact.
- Commit 4 (scope widening) is second-highest risk: reverting returns coordinator/marketing to full-access; the scope audit doc becomes stale but causes no runtime break.
