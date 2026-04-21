# Services / Daily Ops Rebuild Part 1 Implementation Plan

> **For agentic workers:** REQUIRED: Use `superpowers:subagent-driven-development` (if subagents available) or `superpowers:executing-plans` to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship 13 stacked commits bringing OWNA-level depth to the Services module: service approval numbers + session times + casual booking settings, editable weekly/monthly roll-call with in-view sign-in/out + add-child-to-week, new full-page `/children/[id]` with 5 tabs, children list filters + CCS badges + parent display, Casual Bookings Settings tab, and Today as a first-class first tab.

**Architecture:** Feature branch `feat/services-daily-ops-4a-2026-04-22` off local `main`. Commits stacked dependency-first: schema → Overview fields → Overview decomposition → Roll Call toggle/views/API/grid → child page tabs → children list → casual settings → Today tab. Each commit revert-safe. Standard merge (not squash) to preserve bisect history.

**Tech Stack:** Next.js 16, TypeScript, Prisma 5.22, Vitest, Tailwind. Conventions from Sub-projects 2/3a/3b: `withApiAuth` / `withApiHandler` / `parseJsonBody` / `ApiError` with `.conflict()` factory / `logger` / `ADMIN_ROLES` / `parseRole` / `isAdminRole` / `NOTIFICATION_TYPES` / `toast` from `@/hooks/useToast` / primitive-spread query keys. Reuse existing attendance mutation route (`POST /api/attendance/roll-call` with action `sign_in|sign_out|mark_absent|undo`) — do NOT duplicate. New read routes allowed (weekly/monthly/enrollable-children/child-attendances).

**Parent spec:** [`docs/superpowers/specs/2026-04-22-services-daily-ops-4a-design.md`](../specs/2026-04-22-services-daily-ops-4a-design.md)

---

## Implementation Conventions (apply to every commit)

Read this once before starting. These rules apply globally; individual tasks below don't re-state them.

### Pinned field names & routes (don't drift)

| Thing | Correct value | Common mis-reference |
|---|---|---|
| AttendanceRecord date column | `date DateTime @db.Date` | ~~`attendanceDate`~~ |
| Booking date column | `date DateTime` | — |
| Sign-in/out mutation route | `POST /api/attendance/roll-call` (action: `sign_in`/`sign_out`/`mark_absent`/`undo`) | ~~`/api/attendance/[id]`~~ (does not exist) |
| Aggregate daily counts route | `POST /api/attendance` (writes `DailyAttendance`, not per-child) | — |
| "Book a child" (create empty `booked` record) | `POST /api/attendance/roll-call` with `action: "undo"` — upsert creates `status: "booked"` record if none exists | Don't create a new endpoint |
| Scope helpers | `getServiceScope(session)` + `getStateScope(session)` from `@/lib/service-scope` | Don't inline `prisma.user.findUnique({ ... serviceId })` |
| Session types enum | `"bsc" | "asc" | "vc"` (lowercase) | — |
| AttendanceRecord status | `"booked" | "present" | "absent"` | — |

### TDD ordering within every task
1. Write the failing test first (create the `.test.ts[x]` file).
2. Run it — confirm it fails with an informative error (missing file / component / route).
3. Implement minimal code to make the test pass.
4. Run the test — confirm it passes.
5. Run the commit-level gate (`npx tsc --noEmit | grep -c "error TS"` → 0; `npm test -- <path>` → green).
6. Commit.

Where a task below lists "Implement" before "Tests", flip the order at execution time. The checkbox label changes from `Implement` to `Write failing test`; the code block for the implementation moves into a later step.

### Date math is UTC-safe
Any week/month boundary calculation in API routes or client code must use UTC mutators:
- `d.setUTCDate(d.getUTCDate() + 7)` — not `setDate`
- `d.setUTCMonth(d.getUTCMonth() + 1)` — not `setMonth`
- `Date.UTC(y, m - 1, 1)` — not `new Date(\`${y}-${m}-01\`)` (local-TZ)

Motivation: Neon is UTC; server is AU-local. The data integrity audit (March 26) fixed several DST-boundary bugs the same way.

### Multi-row writes wrap in `prisma.$transaction`
Every server-side flow that writes > 1 row in one logical operation must use `prisma.$transaction([...])` so partial failure rolls back:
- Add-child-to-week bulk create (Commit 6 — N attendance rows per dialog submit)
- `bookingPrefs` merge in RoomDaysTab (Commit 8 — read existing prefs → merge → write)
- Any roll-call action that also touches `DailyAttendance` aggregate (already transactional in the existing roll-call route — don't un-do it)

### JSON Prisma columns use `Prisma.InputJsonValue`
Never cast Zod-parsed JSON as `any`. Use `import type { Prisma } from "@prisma/client"` and type the update payload as `parsed.data as Prisma.InputJsonValue`. Motivation: CLAUDE.md rule "Unsafe type casts — each one is a bug waiting to happen."

### Client mutation pattern
- Every `useMutation` must have `onError: (err) => toast({ variant: "destructive", description: err.message || "Something went wrong" })`.
- Every `useQuery` must have `retry: 2` and `staleTime: 30_000`.
- Mutations use `mutateApi`/`fetchApi` — no raw `fetch()`.

### Role-permissions checklist (MEMORY.md)
Any new page added in this project must update `src/lib/role-permissions.ts`:
1. Add the route to the `allPages` constant (owner/head_office inherit, admin inherits except `/crm/templates`).
2. Explicitly add to each other role's array in `rolePageAccess` that should see the page — `coordinator`, `member`, `staff`, `marketing` do NOT auto-inherit.
3. Add a smoke assertion to a test that `canAccessPage(role, "/new/path")` returns the expected boolean per role.

---

## File Structure Overview

| Commit | Files created | Files modified |
|---|---|---|
| 1 Schema | `prisma/migrations/<ts>_.../migration.sql`, `src/lib/service-settings.ts` | `prisma/schema.prisma` |
| 2 Overview new fields | (none) | `src/components/services/ServiceOverviewTab.tsx`, `src/app/api/services/[id]/route.ts` (PATCH Zod), tests |
| 3 Overview decomposition | `src/components/services/overview/{OverviewHeader,ServiceInfoCard,CapacityCard,RatesCard,MarketingCard,StaffingForecastCard,ParentFeedbackCard}.tsx` | `src/components/services/ServiceOverviewTab.tsx` (compose) |
| 4 Roll Call view toggle | (none) | `src/components/services/ServiceRollCallTab.tsx`, tests |
| 5 Weekly + monthly API | `src/app/api/services/[id]/roll-call/weekly/route.ts`, `src/app/api/services/[id]/roll-call/monthly/route.ts`, `src/app/api/services/[id]/children/enrollable/route.ts`, 3 test files | (none) |
| 6 Weekly editable grid | `src/components/services/ServiceWeeklyRollCallGrid.tsx`, `src/components/services/WeeklyRollCallCell.tsx`, `src/hooks/useWeeklyRollCall.ts`, tests | `src/components/services/ServiceRollCallTab.tsx` (render weekly view) |
| 7 Monthly view | `src/components/services/ServiceMonthlyRollCallView.tsx`, `src/hooks/useMonthlyRollCall.ts`, tests | `src/components/services/ServiceRollCallTab.tsx` (render monthly view) |
| 8 Child page — Details + Room | `src/app/(dashboard)/children/[id]/{layout,page,loading}.tsx`, `src/components/child/ChildProfileTabs.tsx`, `src/components/child/tabs/{DetailsTab,RoomDaysTab}.tsx`, tests | `src/lib/role-permissions.ts` (add /children/[id]) |
| 9 Child page — Relationships + Medical | `src/components/child/tabs/{RelationshipsTab,MedicalTab}.tsx`, tests | `src/components/child/ChildProfileTabs.tsx` (render new tabs) |
| 10 Child page — Attendances | `src/components/child/tabs/AttendancesTab.tsx`, `src/hooks/useChildAttendances.ts`, tests | `src/components/child/ChildProfileTabs.tsx` |
| 11 Children list filters | `src/components/services/ChildrenFilters.tsx`, tests | `src/components/services/ServiceChildrenTab.tsx`, `src/hooks/useChildren.ts`, `src/app/api/children/route.ts` (hydrate parents) |
| 12 Casual Bookings Settings | `src/components/services/ServiceCasualBookingsTab.tsx`, `src/app/api/services/[id]/casual-settings/route.ts`, tests | `src/app/(dashboard)/services/[id]/page.tsx` (add sub-tab under Daily Ops) |
| 13 Today first-class tab | `src/components/services/ServiceTodayTab.tsx` | `src/app/(dashboard)/services/[id]/page.tsx` (add tab, default landing, remove page-level ServiceTodayPanel render) |

Single migration in Commit 1. All other commits are code-only.

---

## Chunk 1: Setup & Baseline

### Task 1.1: Fetch, create worktree, install deps

- [ ] **Step 1: Fetch + confirm origin/main is at expected commit**

Run:
```bash
git fetch origin
git log origin/main --oneline -1
```
Expected: at `ba8ab55` or later (verify no schema drift affecting `Service` / `Child` / `AttendanceRecord`).

- [ ] **Step 2: Confirm local main clean + docs-only commits ahead**

```bash
git status
git log origin/main..main --oneline
```
Expected: clean; 2 docs commits ahead (spec + plan).

- [ ] **Step 3: Create worktree off local main**

`git worktree add -b feat/services-daily-ops-4a-2026-04-22 .worktrees/services-daily-ops-4a main`

- [ ] **Step 4: Switch in + install**

`cd .worktrees/services-daily-ops-4a && npm ci && npx prisma generate`

### Task 1.2: Baseline metrics

- [ ] **Step 1: Capture exact numbers**

```bash
npm test -- --run 2>&1 | tail -5
npx tsc --noEmit 2>&1 | grep -c "error TS"
```

Record to `/tmp/4a-baseline.txt`. Expected: ~1298+ passing, 0 tsc errors. Any deviation blocks start.

---

## Chunk 2: Commit 1 — Schema + service-settings helper

### Task 2.1: Extend Prisma schema

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add Service fields**

Locate `model Service` in schema. Add these 4 new fields alongside existing ones (keep section grouping clean — place near other settings):

```prisma
  serviceApprovalNumber  String?
  providerApprovalNumber String?
  sessionTimes           Json?
  casualBookingSettings  Json?
```

- [ ] **Step 2: Add Child fields**

Locate `model Child`. Add these 4 new fields:

```prisma
  medicareNumber     String?
  medicareExpiry     DateTime?
  medicareRef        String?
  vaccinationStatus  String?
```

- [ ] **Step 3: Format schema**

`npx prisma format`

### Task 2.2: Create shared settings + Zod types

**Files:**
- Create: `src/lib/service-settings.ts`

- [ ] **Step 1: Write**

```ts
import { z } from "zod";

// ── sessionTimes ────────────────────────────────────────────
export const sessionTimesSchema = z.object({
  bsc: z.object({ start: z.string().regex(/^\d{2}:\d{2}$/), end: z.string().regex(/^\d{2}:\d{2}$/) }).optional(),
  asc: z.object({ start: z.string().regex(/^\d{2}:\d{2}$/), end: z.string().regex(/^\d{2}:\d{2}$/) }).optional(),
  vc:  z.object({ start: z.string().regex(/^\d{2}:\d{2}$/), end: z.string().regex(/^\d{2}:\d{2}$/) }).optional(),
}).partial();
export type SessionTimes = z.infer<typeof sessionTimesSchema>;

// ── casualBookingSettings ───────────────────────────────────
const dayEnum = z.enum(["mon","tue","wed","thu","fri","sat","sun"]);
const sessionSettingSchema = z.object({
  enabled: z.boolean(),
  fee: z.number().nonnegative(),
  spots: z.number().int().nonnegative(),
  cutOffHours: z.number().int().nonnegative(),
  days: z.array(dayEnum),
});
export const casualBookingSettingsSchema = z.object({
  bsc: sessionSettingSchema.optional(),
  asc: sessionSettingSchema.optional(),
  vc:  sessionSettingSchema.optional(),
});
export type CasualBookingSettings = z.infer<typeof casualBookingSettingsSchema>;

// ── Child.bookingPrefs.fortnightPattern ─────────────────────
const daysByTypeSchema = z.object({
  bsc: z.array(dayEnum).optional(),
  asc: z.array(dayEnum).optional(),
  vc:  z.array(dayEnum).optional(),
});
export const fortnightPatternSchema = z.object({
  week1: daysByTypeSchema,
  week2: daysByTypeSchema,
});
export type FortnightPattern = z.infer<typeof fortnightPatternSchema>;

// The broader bookingPrefs may have other keys (legacy); use .passthrough()
// when parsing a complete bookingPrefs blob so we don't drop unknown fields.
export const bookingPrefsSchema = z.object({
  fortnightPattern: fortnightPatternSchema.optional(),
}).passthrough();
```

### Task 2.3: Generate migration

- [ ] **Step 1: Create migration**

`npx prisma migrate dev --name add_service_approval_session_times_child_medical`

If shadow DB fails (inherited P3006 from earlier sub-projects), fall back to the same pattern as 3a/3b/5/7/9:

```bash
mkdir -p "prisma/migrations/$(date +%Y%m%d%H%M%S)_add_service_approval_session_times_child_medical"
npx prisma migrate diff \
  --from-url "$DATABASE_URL" \
  --to-schema-datamodel prisma/schema.prisma \
  --script \
  > "prisma/migrations/$(ls prisma/migrations | tail -1)/migration.sql"
```

- [ ] **Step 2: Inspect migration.sql**

Expect exactly these statements (order may vary):

```sql
-- AlterTable
ALTER TABLE "Service" ADD COLUMN "serviceApprovalNumber" TEXT;
ALTER TABLE "Service" ADD COLUMN "providerApprovalNumber" TEXT;
ALTER TABLE "Service" ADD COLUMN "sessionTimes" JSONB;
ALTER TABLE "Service" ADD COLUMN "casualBookingSettings" JSONB;

-- AlterTable
ALTER TABLE "Child" ADD COLUMN "medicareNumber" TEXT;
ALTER TABLE "Child" ADD COLUMN "medicareExpiry" TIMESTAMP(3);
ALTER TABLE "Child" ADD COLUMN "medicareRef" TEXT;
ALTER TABLE "Child" ADD COLUMN "vaccinationStatus" TEXT;
```

Any deviation (e.g. unrelated dropped columns, column renames, index changes) means the schema drifted — STOP and investigate before continuing. Migration must be additive-only.

- [ ] **Step 3: Write the paste-ready Neon SQL to `prisma/migrations/<ts>_.../neon-apply.sql`**

Jayden will copy-paste this into the Neon SQL editor manually (not via `prisma migrate deploy`). Include the `_prisma_migrations` INSERT so Prisma sees it as applied:

```sql
-- Run this in the Neon SQL editor. Replace <MIGRATION_NAME> with the generated folder name.
ALTER TABLE "Service" ADD COLUMN IF NOT EXISTS "serviceApprovalNumber" TEXT;
ALTER TABLE "Service" ADD COLUMN IF NOT EXISTS "providerApprovalNumber" TEXT;
ALTER TABLE "Service" ADD COLUMN IF NOT EXISTS "sessionTimes" JSONB;
ALTER TABLE "Service" ADD COLUMN IF NOT EXISTS "casualBookingSettings" JSONB;

ALTER TABLE "Child" ADD COLUMN IF NOT EXISTS "medicareNumber" TEXT;
ALTER TABLE "Child" ADD COLUMN IF NOT EXISTS "medicareExpiry" TIMESTAMP(3);
ALTER TABLE "Child" ADD COLUMN IF NOT EXISTS "medicareRef" TEXT;
ALTER TABLE "Child" ADD COLUMN IF NOT EXISTS "vaccinationStatus" TEXT;

-- Tell Prisma this migration is applied (use the exact folder name under prisma/migrations/)
INSERT INTO "_prisma_migrations"
  (id, checksum, migration_name, started_at, finished_at, applied_steps_count)
VALUES
  (gen_random_uuid()::text, 'manual', '<MIGRATION_FOLDER_NAME>', now(), now(), 1)
ON CONFLICT DO NOTHING;
```

This file is the canonical artefact for PR body + Jayden's hand-off step in Task 15.3.

### Task 2.4: Verify + commit

- [ ] **Step 1: Gate**

```bash
npx prisma generate
npm test -- --run 2>&1 | tail -3
npx tsc --noEmit 2>&1 | grep -c "error TS"
```

Expected: baseline tests pass, 0 tsc errors (new file + schema changes compile cleanly).

- [ ] **Step 2: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/ src/lib/service-settings.ts
git commit -m "$(cat <<'EOF'
feat(schema): Service approval numbers + sessionTimes + Child Medicare/vaccination

Single additive migration for Sub-project 4a. All field additions
ship here — no other commits in 4a touch Prisma schema.

Service gains: serviceApprovalNumber, providerApprovalNumber (ACECQA),
sessionTimes (JSON: per-session-type start/end), casualBookingSettings
(JSON: per-session enable/fee/spots/cutOff/days).

Child gains: medicareNumber, medicareExpiry, medicareRef,
vaccinationStatus (consumed by Commit 9 Medical tab).

Plus src/lib/service-settings.ts with Zod schemas for all 3 JSON
shapes (sessionTimes, casualBookingSettings, bookingPrefs.fortnightPattern)
so API routes + UI share one source of truth.

Safe to deploy ahead of code.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Chunk 3: Commit 2 — Overview tab displays new fields

### Task 3.1: Extend PATCH /api/services/[id] Zod schema

**Files:**
- Modify: `src/app/api/services/[id]/route.ts`

- [ ] **Step 1: Read current PATCH handler**

Find the Zod schema used by the PATCH handler.

- [ ] **Step 2: Extend schema to accept new fields**

Add to the existing update-schema object:

```ts
serviceApprovalNumber: z.string().nullish(),
providerApprovalNumber: z.string().nullish(),
sessionTimes: sessionTimesSchema.nullish(),
```

Import `sessionTimesSchema` from `@/lib/service-settings`. (casualBookingSettings comes in Commit 12's dedicated endpoint — do NOT add it here.)

### Task 3.2: Add service-info UI card

**Files:**
- Modify: `src/components/services/ServiceOverviewTab.tsx`

- [ ] **Step 1: Add display card**

Locate where the existing service info renders (address, capacity, etc.). Add a new "Service Approvals & Session Times" card rendering:
- Service Approval #: value or "—"
- Provider Approval #: value or "—"
- Session times: per-session-type row "BSC 06:30 – 08:45" (only if populated)

If `canEdit` (`isAdminRole` or coordinator for this service), render an Edit button that opens a modal with form fields for the 3 pieces.

Modal on submit:
```ts
await mutateApi(`/api/services/${service.id}`, {
  method: "PATCH",
  body: { serviceApprovalNumber, providerApprovalNumber, sessionTimes },
});
await queryClient.invalidateQueries({ queryKey: ["service", service.id] });
```

Use existing `mutateApi` from `@/lib/fetch-api` and `useToast` for success/error.

### Task 3.3: Tests + commit

- [ ] **Step 1: API test**

`src/__tests__/api/services-id-patch.test.ts` — verify PATCH accepts the 3 new fields and rejects invalid time formats.

- [ ] **Step 2: Component test**

`src/__tests__/components/services/ServiceOverviewTab.test.tsx` — render with + without approval values; verify Edit button presence gated by role.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/services/\[id\]/route.ts src/components/services/ServiceOverviewTab.tsx src/__tests__/
git commit -m "feat(overview): display + edit service approvals and session times

Service Overview tab gains a new 'Service Approvals & Session Times'
card showing ACECQA approval numbers and per-session-type start/end
times. Admin/coordinator can edit via modal; staff/member/marketing
see read-only.

PATCH /api/services/[id] Zod schema extended to accept the 3 new
fields via sessionTimesSchema from src/lib/service-settings.ts.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Chunk 4: Commit 3 — Decompose ServiceOverviewTab

### Task 4.1: Identify existing sections

- [ ] **Step 1: Map the file**

`grep -nE "^(function |const [A-Z])" src/components/services/ServiceOverviewTab.tsx` — locate the 4 pre-existing embedded sections (`CapacityWaitlistWidget`, `StaffingForecast`, `SchoolPartnershipSection`, `ParentFeedbackSection`). Note their line ranges.

### Task 4.2: Extract to separate files

**Files created under** `src/components/services/overview/`:

- [ ] **Step 1: `OverviewHeader.tsx`** — hero card with name, code, status
- [ ] **Step 2: `ServiceInfoCard.tsx`** — address, contact, approvals, session times (includes the new Commit 2 card)
- [ ] **Step 3: `CapacityCard.tsx`** — absorbs `CapacityWaitlistWidget` + capacity targets
- [ ] **Step 4: `RatesCard.tsx`** — daily + casual rates
- [ ] **Step 5: `MarketingCard.tsx`** — school population, targets, launch phase, school partnership (absorbs `SchoolPartnershipSection`)
- [ ] **Step 6: `StaffingForecastCard.tsx`** — lift out existing `StaffingForecast`
- [ ] **Step 7: `ParentFeedbackCard.tsx`** — lift out existing `ParentFeedbackSection`

Each extracted file must:
- Keep existing hooks + API calls intact
- Export one default or named component
- Use same Tailwind + style patterns

### Task 4.3: Reduce parent to composition

**Files:**
- Modify: `src/components/services/ServiceOverviewTab.tsx`

- [ ] **Step 1: Replace sections with component imports**

Parent becomes:
```tsx
import { OverviewHeader } from "./overview/OverviewHeader";
import { ServiceInfoCard } from "./overview/ServiceInfoCard";
// ...

export function ServiceOverviewTab({ service, ... }) {
  // notes textarea state STAYS here (don't thread through children)
  const [notes, setNotes] = useState(service.notes);
  // ... handleNotesSave

  return (
    <div className="space-y-6">
      <OverviewHeader service={service} />
      <ServiceInfoCard service={service} canEdit={canEdit} />
      <CapacityCard service={service} canEdit={canEdit} />
      <RatesCard service={service} canEdit={canEdit} />
      <StaffingForecastCard serviceId={service.id} />
      <MarketingCard service={service} canEdit={canEdit} />
      <ParentFeedbackCard serviceId={service.id} />
      <NotesSection notes={notes} onChange={setNotes} onSave={handleNotesSave} />
    </div>
  );
}
```

Target: parent ≤ 250 lines.

### Task 4.4: Verify + commit

- [ ] **Step 1: Gate** — existing tests pass unchanged; tsc 0; lint clean.

- [ ] **Step 2: Commit**

```bash
git add src/components/services/ServiceOverviewTab.tsx src/components/services/overview/
git commit -m "refactor(overview): decompose ServiceOverviewTab 1200→7 focused children

Parent reduces to ~250 lines composition. 7 child components in
src/components/services/overview/:
- OverviewHeader, ServiceInfoCard (absorbs Commit 2 approvals card),
  CapacityCard (absorbs CapacityWaitlistWidget), RatesCard,
  StaffingForecastCard (lifted), MarketingCard (absorbs
  SchoolPartnershipSection), ParentFeedbackCard (lifted).

Notes textarea workflow stays in parent. No feature changes; pure
decomposition.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Chunk 5: Commit 4 — Roll Call view toggle

### Task 5.1: Add URL-synced view state

**Files:**
- Modify: `src/components/services/ServiceRollCallTab.tsx`

- [ ] **Step 1: Read current file structure**

Find where the tab currently renders its daily view.

- [ ] **Step 2: Add view toggle**

At the top of the tab, add:

```tsx
import { useSearchParams, useRouter } from "next/navigation";

// Inside component
const searchParams = useSearchParams();
const router = useRouter();
const view = (searchParams?.get("rollCallView") ?? "daily") as "daily" | "weekly" | "monthly";

const setView = (next: "daily" | "weekly" | "monthly") => {
  const params = new URLSearchParams(searchParams?.toString() ?? "");
  params.set("rollCallView", next);
  router.replace(`?${params.toString()}`, { scroll: false });
};
```

Render a button group:
```tsx
<div className="flex gap-2 mb-4">
  <button onClick={() => setView("daily")} className={cn("px-3 py-1.5 rounded", view === "daily" && "bg-brand-600 text-white")}>Daily</button>
  <button onClick={() => setView("weekly")}   className={cn("px-3 py-1.5 rounded", view === "weekly" && "bg-brand-600 text-white")}>Weekly</button>
  <button onClick={() => setView("monthly")}  className={cn("px-3 py-1.5 rounded", view === "monthly" && "bg-brand-600 text-white")}>Monthly</button>
</div>

{view === "daily" && <DailyRollCallView /* existing */ />}
{view === "weekly" && <div className="text-sm text-gray-500">Weekly view — ships in next commit</div>}
{view === "monthly" && <div className="text-sm text-gray-500">Monthly view — ships in next commit</div>}
```

Daily view's internal date state stays untouched (documented limitation in spec).

### Task 5.2: Test + commit

- [ ] **Step 1: Test view toggle**

Extend existing `ServiceRollCallTab.test.tsx` — URL param "weekly" renders weekly placeholder; "monthly" renders monthly placeholder; no URL param defaults to daily.

- [ ] **Step 2: Commit**

```bash
git add src/components/services/ServiceRollCallTab.tsx src/__tests__/components/services/
git commit -m "feat(roll-call): daily/weekly/monthly view toggle on ServiceRollCallTab

URL-synced via ?rollCallView=daily|weekly|monthly. Default daily.
Daily view untouched; weekly + monthly render placeholders until
Commits 6-7 ship their content.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Chunk 6: Commit 5 — Weekly + monthly roll-call + enrollable-children API

### Task 6.1: GET /api/services/[id]/roll-call/weekly

**Files:**
- Create: `src/app/api/services/[id]/roll-call/weekly/route.ts`
- Create: `src/__tests__/api/services-roll-call-weekly.test.ts`

- [ ] **Step 1: Write failing test** (create `src/__tests__/api/services-roll-call-weekly.test.ts` first with the cases below — verify it errors with "cannot find module" — then implement)

- [ ] **Step 2: Implement**

```ts
import { NextResponse } from "next/server";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-error";
import { isAdminRole } from "@/lib/role-permissions";
import { getServiceScope } from "@/lib/service-scope";

export const GET = withApiAuth(async (req, session, context) => {
  const { id } = await context!.params!;
  const { searchParams } = new URL(req.url);
  const weekStart = searchParams.get("weekStart");
  if (!weekStart || !/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
    throw ApiError.badRequest("weekStart (YYYY-MM-DD) required");
  }

  // Access: admin any; non-admin must be scoped to this service
  const role = session.user.role ?? "";
  if (!isAdminRole(role)) {
    const scope = getServiceScope(session);
    if (!scope || !scope.includes(id)) throw ApiError.forbidden();
  }

  // UTC-safe week boundary: parse weekStart as UTC midnight, add 7 UTC days
  const [y, m, d] = weekStart.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, d));
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 7);

  const [children, attendanceRecords, bookings] = await Promise.all([
    prisma.child.findMany({
      where: {
        serviceId: id,
        status: "active",
        OR: [
          { bookings: { some: { date: { gte: start, lt: end } } } },
          { attendanceRecords: { some: { date: { gte: start, lt: end } } } },
        ],
      },
      select: { id: true, firstName: true, surname: true, photo: true, dob: true, bookingPrefs: true },
      orderBy: { surname: "asc" },
    }),
    prisma.attendanceRecord.findMany({
      where: { child: { serviceId: id }, date: { gte: start, lt: end } },
      select: {
        id: true, childId: true, date: true, sessionType: true,
        status: true, signInTime: true, signOutTime: true,
        signedInById: true, signedOutById: true,
        absenceReason: true, notes: true,
      },
    }),
    prisma.booking.findMany({
      where: { child: { serviceId: id }, date: { gte: start, lt: end } },
      select: { id: true, childId: true, date: true, sessionType: true, fee: true },
    }),
  ]);

  return NextResponse.json({ children, attendanceRecords, bookings, weekStart });
});
```

Note on fields: `AttendanceRecord` has no `fee` column (verify against `prisma/schema.prisma:2450`) — the per-session fee lives on `Booking`. `status` is required to drive cell colour.

- [ ] **Step 3: Run test — verify green**

Cases to cover in the test file:
- 401 no session
- 400 missing/malformed weekStart (e.g. "not-a-date", "2025-13-01")
- 403 cross-service non-admin (seed user at different serviceId, expect 403)
- 200 happy path — admin any service; coord own service; correctly-shaped response with `date` on AttendanceRecord (not `attendanceDate`)

### Task 6.2: GET /api/services/[id]/roll-call/monthly

**Files:**
- Create: `src/app/api/services/[id]/roll-call/monthly/route.ts`
- Create: `src/__tests__/api/services-roll-call-monthly.test.ts`

- [ ] **Step 1: Write failing test** (404 if module doesn't exist yet)

- [ ] **Step 2: Implement**

```ts
import { NextResponse } from "next/server";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-error";
import { isAdminRole } from "@/lib/role-permissions";
import { getServiceScope } from "@/lib/service-scope";

export const GET = withApiAuth(async (req, session, context) => {
  const { id } = await context!.params!;
  const { searchParams } = new URL(req.url);
  const month = searchParams.get("month");
  if (!month || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    throw ApiError.badRequest("month (YYYY-MM) required");
  }

  const role = session.user.role ?? "";
  if (!isAdminRole(role)) {
    const scope = getServiceScope(session);
    if (!scope || !scope.includes(id)) throw ApiError.forbidden();
  }

  // UTC-safe month boundary
  const [y, m] = month.split("-").map(Number);
  const monthStart = new Date(Date.UTC(y, m - 1, 1));
  const monthEnd = new Date(monthStart);
  monthEnd.setUTCMonth(monthEnd.getUTCMonth() + 1);

  // Per-day status counts across attendance records
  const attGroups = await prisma.attendanceRecord.groupBy({
    by: ["date", "status"],
    where: { child: { serviceId: id }, date: { gte: monthStart, lt: monthEnd } },
    _count: { _all: true },
  });

  // Per-day booking counts (for days with bookings but no attendance records yet)
  const bookingGroups = await prisma.booking.groupBy({
    by: ["date"],
    where: { child: { serviceId: id }, date: { gte: monthStart, lt: monthEnd } },
    _count: { _all: true },
  });

  // Build { date → { booked, attended, absent } } map
  const perDay = new Map<string, { booked: number; attended: number; absent: number }>();
  for (const g of attGroups) {
    const key = g.date.toISOString().split("T")[0];
    const entry = perDay.get(key) ?? { booked: 0, attended: 0, absent: 0 };
    if (g.status === "present") entry.attended += g._count._all;
    else if (g.status === "absent") entry.absent += g._count._all;
    else entry.booked += g._count._all;
    perDay.set(key, entry);
  }
  for (const g of bookingGroups) {
    const key = g.date.toISOString().split("T")[0];
    const entry = perDay.get(key) ?? { booked: 0, attended: 0, absent: 0 };
    // bookings counted as "booked" only when no corresponding attendance rows exist for that day
    if (entry.attended === 0 && entry.absent === 0 && entry.booked === 0) {
      entry.booked = g._count._all;
    }
    perDay.set(key, entry);
  }

  // Emit days array for every day in the month
  const days: Array<{ date: string; booked: number; attended: number; absent: number }> = [];
  const cursor = new Date(monthStart);
  while (cursor < monthEnd) {
    const key = cursor.toISOString().split("T")[0];
    days.push({ date: key, ...(perDay.get(key) ?? { booked: 0, attended: 0, absent: 0 }) });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return NextResponse.json({ month, days });
});
```

- [ ] **Step 3: Run test — verify green**

Auth cases + happy path: seed 3 records across 2 days, expect correct per-day counts; verify no records → zero-counts for every day of the month; verify invalid `month=2025-13` returns 400.

### Task 6.3: GET /api/services/[id]/children/enrollable

**Files:**
- Create: `src/app/api/services/[id]/children/enrollable/route.ts`
- Create: `src/__tests__/api/services-children-enrollable.test.ts`

- [ ] **Step 1: Write failing test** in `src/__tests__/api/services-children-enrollable.test.ts`

- [ ] **Step 2: Implement**

Per spec definition: "active children at this service with NO attendance record in [weekStart, weekStart+7d)".

```ts
import { NextResponse } from "next/server";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-error";
import { isAdminRole } from "@/lib/role-permissions";
import { getServiceScope } from "@/lib/service-scope";

export const GET = withApiAuth(async (req, session, context) => {
  const { id } = await context!.params!;
  const { searchParams } = new URL(req.url);
  const weekStart = searchParams.get("weekStart");
  if (!weekStart || !/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
    throw ApiError.badRequest("weekStart (YYYY-MM-DD) required");
  }

  const role = session.user.role ?? "";
  if (!isAdminRole(role)) {
    const scope = getServiceScope(session);
    if (!scope || !scope.includes(id)) throw ApiError.forbidden();
  }

  const [y, m, d] = weekStart.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, d));
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 7);

  const children = await prisma.child.findMany({
    where: {
      serviceId: id,
      status: "active",
      attendanceRecords: { none: { date: { gte: start, lt: end } } },
    },
    select: { id: true, firstName: true, surname: true, photo: true, dob: true, bookingPrefs: true },
    orderBy: { surname: "asc" },
  });
  return NextResponse.json({ children });
});
```

- [ ] **Step 3: Run test — verify green**

Auth cases (401 / 400 / 403) + happy path (children who have attendance are filtered out; children who don't are returned). Seed `AttendanceRecord.date` (NOT `attendanceDate`) — confirm the Prisma schema field is `date DateTime @db.Date`.

### Task 6.4: Commit

```bash
git add src/app/api/services/\[id\]/roll-call/ src/app/api/services/\[id\]/children/enrollable/ src/__tests__/api/
git commit -m "feat(api): weekly + monthly roll-call + enrollable-children routes

3 new GET routes wrapped in withApiAuth with service-scoped access
(admin any; coord/staff/member/marketing only their own service):

- GET /api/services/[id]/roll-call/weekly?weekStart=YYYY-MM-DD —
  returns children + bookings + attendanceRecords for the week
- GET /api/services/[id]/roll-call/monthly?month=YYYY-MM —
  per-day booked/attended/absent counts
- GET /api/services/[id]/children/enrollable?weekStart=YYYY-MM-DD —
  active children at service with no attendance record in the week

Attendance mutations reuse existing POST /api/attendance/roll-call
(actions: sign_in | sign_out | mark_absent | undo) — no duplication.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Chunk 7: Commit 6 — Editable weekly grid

### Task 7.1: Create hook

**Files:**
- Create: `src/hooks/useWeeklyRollCall.ts`

- [ ] **Step 1: Implement**

```ts
import { useQuery } from "@tanstack/react-query";
import { fetchApi } from "@/lib/fetch-api";

export interface WeeklyRollCallResponse {
  children: Array<{ id: string; firstName: string; surname: string; photo: string | null; dob: string | null; bookingPrefs: unknown }>;
  attendanceRecords: Array<{
    id: string;
    childId: string;
    /** AttendanceRecord.date in prisma/schema.prisma — NOT `attendanceDate`. */
    date: string;
    sessionType: "bsc" | "asc" | "vc";
    status: "booked" | "present" | "absent";
    signInTime: string | null;
    signOutTime: string | null;
    signedInById: string | null;
    signedOutById: string | null;
    absenceReason: string | null;
    notes: string | null;
  }>;
  bookings: Array<{ id: string; childId: string; date: string; sessionType: "bsc" | "asc" | "vc"; fee: number | null }>;
  weekStart: string;
}

export function useWeeklyRollCall(serviceId: string, weekStart: string) {
  return useQuery({
    queryKey: ["weekly-roll-call", serviceId, weekStart],
    queryFn: () => fetchApi<WeeklyRollCallResponse>(`/api/services/${serviceId}/roll-call/weekly?weekStart=${weekStart}`),
    enabled: !!serviceId && !!weekStart,
    retry: 2,
    staleTime: 30_000,
  });
}

export function useEnrollableChildren(serviceId: string, weekStart: string) {
  return useQuery({
    queryKey: ["enrollable-children", serviceId, weekStart],
    queryFn: () => fetchApi<{ children: any[] }>(`/api/services/${serviceId}/children/enrollable?weekStart=${weekStart}`),
    enabled: !!serviceId && !!weekStart,
    retry: 2,
    staleTime: 30_000,
  });
}
```

### Task 7.2: Build WeeklyRollCallCell component

**Files:**
- Create: `src/components/services/WeeklyRollCallCell.tsx`

- [ ] **Step 1: Implement (memoized)**

```tsx
import { memo } from "react";
import { cn } from "@/lib/utils";

export interface CellShift {
  attendanceId?: string;
  bookingId?: string;
  sessionType: "bsc" | "asc" | "vc";
  status: "booked" | "signed_in" | "signed_out" | "absent";
  signInTime?: string | null;
  signOutTime?: string | null;
  /** Optional — only set for booking-only cells (no attendance record yet) */
  fee?: number | null;
}

interface Props {
  shift: CellShift | null;
  childId: string;
  date: string;
  onClickShift?: (shift: CellShift) => void;
  onClickEmpty?: (childId: string, date: string) => void;
  canEdit: boolean;
}

export const WeeklyRollCallCell = memo(function WeeklyRollCallCell({ shift, childId, date, onClickShift, onClickEmpty, canEdit }: Props) {
  if (!shift) {
    return (
      <button
        type="button"
        disabled={!canEdit || !onClickEmpty}
        onClick={() => onClickEmpty?.(childId, date)}
        className={cn("w-full h-14 border border-dashed rounded text-xs", canEdit && "hover:bg-gray-50")}
      >
        {canEdit ? "+ Add" : ""}
      </button>
    );
  }
  const color = shift.status === "signed_in" ? "bg-green-100 border-green-400" :
                shift.status === "signed_out" ? "bg-blue-100 border-blue-400" :
                shift.status === "absent" ? "bg-red-100 border-red-400" :
                "bg-teal-50 border-teal-300";
  return (
    <button type="button" disabled={!canEdit || !onClickShift} onClick={() => onClickShift?.(shift)}
      className={cn("w-full h-14 border rounded p-1 text-xs text-left", color)}>
      <div className="font-medium uppercase">{shift.sessionType}</div>
      {shift.signInTime && <div className="text-[10px]">In: {shift.signInTime}</div>}
      {shift.signOutTime && <div className="text-[10px]">Out: {shift.signOutTime}</div>}
    </button>
  );
}, (prev, next) => {
  return prev.shift?.attendanceId === next.shift?.attendanceId &&
         prev.shift?.status === next.shift?.status &&
         prev.shift?.signInTime === next.shift?.signInTime &&
         prev.shift?.signOutTime === next.shift?.signOutTime &&
         prev.childId === next.childId &&
         prev.date === next.date &&
         prev.canEdit === next.canEdit;
});
```

### Task 7.3: Build the grid

**Files:**
- Create: `src/components/services/ServiceWeeklyRollCallGrid.tsx`

- [ ] **Step 1: Implement**

Rows = children; columns = Mon–Fri (5). Header: week picker ← →, `+ Add child` button. Below grid: legend.

```tsx
"use client";
import { useState, useMemo } from "react";
import { useSession } from "next-auth/react";
import { useWeeklyRollCall, useEnrollableChildren } from "@/hooks/useWeeklyRollCall";
import { WeeklyRollCallCell, type CellShift } from "./WeeklyRollCallCell";
import { StaffAvatar } from "@/components/staff/StaffAvatar";
import { Button } from "@/components/ui/Button";
import { isAdminRole } from "@/lib/role-permissions";
import { toast } from "@/hooks/useToast";
import { mutateApi } from "@/lib/fetch-api";
import { useQueryClient } from "@tanstack/react-query";

export function ServiceWeeklyRollCallGrid({ serviceId }: { serviceId: string }) {
  const { data: session } = useSession();
  const role = session?.user?.role ?? "";
  const userService = (session?.user as { serviceId?: string | null })?.serviceId ?? null;
  const canEdit = isAdminRole(role) || role === "coordinator" || (role === "staff" && userService === serviceId);

  const [weekOffset, setWeekOffset] = useState(0);
  const weekStart = useMemo(() => {
    // Monday-of-current-week, UTC-safe. getDay(): 0=Sun..6=Sat. For Mon-start:
    // on Sunday (0), step back 6 days. Otherwise step 1-day back to Monday.
    const now = new Date();
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const day = d.getUTCDay();
    const diff = day === 0 ? -6 : 1 - day;
    d.setUTCDate(d.getUTCDate() + diff + weekOffset * 7);
    return d.toISOString().split("T")[0];
  }, [weekOffset]);

  const weekDates = useMemo(() =>
    Array.from({ length: 5 }, (_, i) => {
      const [y, m, dd] = weekStart.split("-").map(Number);
      const d = new Date(Date.UTC(y, m - 1, dd));
      d.setUTCDate(d.getUTCDate() + i);
      return d.toISOString().split("T")[0];
    }), [weekStart]);

  const { data, refetch } = useWeeklyRollCall(serviceId, weekStart);
  const qc = useQueryClient();

  // Build shiftsByChildAndDay map
  const shiftsMap = useMemo(() => {
    const m: Record<string, Record<string, CellShift[]>> = {};
    if (!data) return m;
    const getStatus = (rec: typeof data.attendanceRecords[0]): CellShift["status"] => {
      if (rec.status === "absent") return "absent";
      if (rec.signOutTime) return "signed_out";
      if (rec.signInTime) return "signed_in";
      return "booked";
    };
    for (const rec of data.attendanceRecords) {
      const date = rec.date.split("T")[0]; // AttendanceRecord.date (NOT attendanceDate)
      m[rec.childId] ??= {};
      m[rec.childId][date] ??= [];
      m[rec.childId][date].push({
        attendanceId: rec.id,
        sessionType: rec.sessionType,
        status: getStatus(rec),
        signInTime: rec.signInTime,
        signOutTime: rec.signOutTime,
      });
    }
    // Add booking-only (no attendance record yet) as "booked"
    for (const b of data.bookings) {
      const date = new Date(b.date).toISOString().split("T")[0];
      if (m[b.childId]?.[date]?.some(s => s.sessionType === b.sessionType)) continue;
      m[b.childId] ??= {};
      m[b.childId][date] ??= [];
      m[b.childId][date].push({
        bookingId: b.id,
        sessionType: b.sessionType as "bsc" | "asc" | "vc",
        status: "booked",
        fee: b.fee,
      });
    }
    return m;
  }, [data]);

  const [addChildOpen, setAddChildOpen] = useState(false);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Button onClick={() => setWeekOffset(o => o - 1)}>←</Button>
          <span className="font-medium">Week of {weekStart}</span>
          <Button onClick={() => setWeekOffset(o => o + 1)}>→</Button>
        </div>
        {canEdit && <Button onClick={() => setAddChildOpen(true)}>+ Add child to week</Button>}
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full border-collapse">
          <thead>
            <tr>
              <th className="text-left p-2 border">Child</th>
              {weekDates.map(d => (
                <th key={d} className="text-left p-2 border text-xs">
                  {new Date(d).toLocaleDateString("en-AU", { weekday: "short", day: "numeric" })}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(data?.children ?? []).map(child => (
              <tr key={child.id}>
                <td className="p-2 border">
                  <div className="flex items-center gap-2">
                    <StaffAvatar user={{ id: child.id, name: `${child.firstName} ${child.surname}`, avatar: child.photo }} size="xs" />
                    <span className="text-sm">{child.firstName} {child.surname}</span>
                  </div>
                </td>
                {weekDates.map(date => {
                  const shifts = shiftsMap[child.id]?.[date] ?? [];
                  if (shifts.length === 0) {
                    return <td key={date} className="p-1 border align-top">
                      <WeeklyRollCallCell shift={null} childId={child.id} date={date} canEdit={canEdit}
                        onClickEmpty={(cid, d) => openCellActions(cid, d, null)} />
                    </td>;
                  }
                  return <td key={date} className="p-1 border align-top">
                    <div className="flex flex-col gap-1">
                      {shifts.map((s, i) => (
                        <WeeklyRollCallCell key={i} shift={s} childId={child.id} date={date} canEdit={canEdit}
                          onClickShift={(shift) => openCellActions(child.id, date, shift)} />
                      ))}
                    </div>
                  </td>;
                })}
              </tr>
            ))}
            {(data?.children ?? []).length === 0 && (
              <tr><td colSpan={6} className="text-center p-8 text-gray-500">No children attending this week</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <CellActionsPopover /* see Task 7.4 */ />
      {addChildOpen && <AddChildDialog serviceId={serviceId} weekStart={weekStart} onClose={() => setAddChildOpen(false)} onAdded={() => { setAddChildOpen(false); refetch(); }} />}
    </div>
  );
}
```

### Task 7.4: Build CellActionsPopover (mutations)

**Files:**
- Extend: `src/components/services/ServiceWeeklyRollCallGrid.tsx` (same file or split if > 500 lines)

- [ ] **Step 1: Define action mapping**

All mutations hit `POST /api/attendance/roll-call` (the ONLY per-child attendance mutation endpoint — see existing route `src/app/api/attendance/roll-call/route.ts:149`).

| Cell status | Actions shown | Body sent |
|---|---|---|
| booked | Sign in, Mark absent, Edit notes | `action: "sign_in" | "mark_absent"` |
| signed_in | Sign out, Edit notes, Undo | `action: "sign_out" | "undo"` |
| signed_out | Edit notes, Undo | `action: "undo"` |
| absent | Undo | `action: "undo"` |

Payload shape: `{ childId, serviceId, date: "YYYY-MM-DD", sessionType: "bsc"|"asc"|"vc", action, absenceReason?, notes? }` — matches the existing route's `actionSchema`.

- [ ] **Step 2: Implement with mutateApi + onError toast + query invalidation**

```tsx
import { mutateApi } from "@/lib/fetch-api";
import { toast } from "@/hooks/useToast";
import { useMutation, useQueryClient } from "@tanstack/react-query";

function useRollCallAction(serviceId: string, weekStart: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      childId: string;
      date: string;
      sessionType: "bsc" | "asc" | "vc";
      action: "sign_in" | "sign_out" | "mark_absent" | "undo";
      absenceReason?: string;
      notes?: string;
    }) => mutateApi<{ id: string }>("/api/attendance/roll-call", {
      method: "POST",
      body: { serviceId, ...body },
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["weekly-roll-call", serviceId, weekStart] });
      qc.invalidateQueries({ queryKey: ["monthly-roll-call", serviceId] });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}
```

Render popover with buttons wired to `.mutate({ ... })` per the table above.

### Task 7.5: Build AddChildDialog (add child to this week)

**Files:**
- Extend: `src/components/services/ServiceWeeklyRollCallGrid.tsx`

- [ ] **Step 1: UI**

Dialog body lists children from `useEnrollableChildren(serviceId, weekStart)`. Per child: inline checkbox grid (5 days × 3 sessions). On submit: for each (child, date, sessionType) tuple the user checked, POST to `/api/attendance/roll-call` with `action: "undo"` (the existing route's `undo` action upserts to `status: "booked"` — that's exactly "create empty booked record").

- [ ] **Step 2: Transactional submit (client side — Promise.all with revert-on-error)**

```tsx
async function onSubmit(selections: Array<{ childId: string; date: string; sessionType: "bsc" | "asc" | "vc" }>) {
  try {
    await Promise.all(selections.map((s) =>
      mutateApi("/api/attendance/roll-call", {
        method: "POST",
        body: { serviceId, ...s, action: "undo" }, // creates status: "booked"
      }),
    ));
    qc.invalidateQueries({ queryKey: ["weekly-roll-call", serviceId, weekStart] });
    qc.invalidateQueries({ queryKey: ["enrollable-children", serviceId, weekStart] });
    toast({ description: `Added ${selections.length} booking${selections.length === 1 ? "" : "s"}.` });
    onClose();
  } catch (err) {
    toast({ variant: "destructive", description: (err as Error).message });
    // Best-effort: re-fetch to reconcile UI with whatever did persist
    qc.invalidateQueries({ queryKey: ["weekly-roll-call", serviceId, weekStart] });
  }
}
```

Note: true DB-level transaction would require a new `POST /api/attendance/roll-call/bulk` endpoint; scope creep for 4a. Client-side `Promise.all` with reconcile-on-error is sufficient for the typical add-3-days use case. Flag in PR body as "bulk endpoint deferred to 4b" if needed.

### Task 7.6: Render weekly view in tab

**Files:**
- Modify: `src/components/services/ServiceRollCallTab.tsx`

- [ ] **Step 1: Replace placeholder**

```tsx
{view === "weekly" && <ServiceWeeklyRollCallGrid serviceId={service.id} />}
```

### Task 7.7: Playwright E2E — weekly grid sign-in flow

**Files:**
- Create: `tests/e2e/weekly-roll-call.spec.ts`

- [ ] **Step 1: Write failing spec**

```ts
import { test, expect } from "@playwright/test";
import { loginAs, seedTestService, seedTestChildBooking } from "./_helpers";

test("weekly grid — sign child in persists across reload", async ({ page }) => {
  const { serviceId, coordUserEmail } = await seedTestService();
  const { childId, weekStart, mondayDate, sessionType } = await seedTestChildBooking({ serviceId });

  await loginAs(page, coordUserEmail);
  await page.goto(`/services/${serviceId}?tab=daily-ops&sub=roll-call&rollCallView=weekly`);
  await page.getByRole("button", { name: /→|next week|week of/i }).waitFor();

  // Find the child's booked chip for Monday + session type, click to open popover
  const cell = page.getByRole("cell", { name: new RegExp(sessionType, "i") }).first();
  await cell.click();
  await page.getByRole("button", { name: /sign in/i }).click();

  // Verify the chip turns green (signed_in) and shows an In: time
  await expect(cell).toContainText(/in: \d{2}:\d{2}/i);

  // Reload; record persists
  await page.reload();
  const reloadedCell = page.getByRole("cell", { name: new RegExp(sessionType, "i") }).first();
  await expect(reloadedCell).toContainText(/in: \d{2}:\d{2}/i);
});
```

- [ ] **Step 2: Add seed helpers if missing**

Check `tests/e2e/_helpers.ts`. If `seedTestService` / `seedTestChildBooking` don't exist, add them as thin wrappers around existing seed utilities (pattern: same as 3b's roster E2E).

- [ ] **Step 3: Run**

`npx playwright test weekly-roll-call.spec.ts --reporter=line`

Expected: passes on first run after helpers + grid wired. Flakes → bump timeout per spec.

### Task 7.8: Component tests + commit

- [ ] **Step 1: Component tests**

`src/__tests__/components/services/ServiceWeeklyRollCallGrid.test.tsx`:
- Empty state when no children
- Grid renders with children × 5 cells per row
- `canEdit=false` for staff-different-service hides + buttons
- Click cell with booked shift → popover opens with "Sign in" / "Mark absent" / "Edit"
- Click cell with signed-in shift → popover shows "Sign out" / "Undo"
- Add child flow → dialog renders `useEnrollableChildren` results; submitting calls POST /api/attendance/roll-call with `action: "undo"` per selection

- [ ] **Step 2: Commit**

```bash
git add src/components/services/ServiceWeeklyRollCallGrid.tsx src/components/services/WeeklyRollCallCell.tsx src/components/services/ServiceRollCallTab.tsx src/hooks/useWeeklyRollCall.ts tests/e2e/weekly-roll-call.spec.ts src/__tests__/
git commit -m "feat(roll-call): editable weekly grid with sign-in/out + add-child

New ServiceWeeklyRollCallGrid renders children × Mon-Fri with shift
chips colored by status (booked/signed-in/signed-out/absent). Empty
cells clickable to add; chip clicks open action popover (sign-in /
sign-out / mark-absent / undo / edit). Header '+ Add child to week'
button opens dialog listing children not yet on the week's roster.

WeeklyRollCallCell memoized to prevent full grid re-render on single
shift update — 60 children × 5 days = up to 900 cells.

All attendance mutations hit POST /api/attendance/roll-call with
actions sign_in / sign_out / mark_absent / undo (the 'undo' action
doubles as 'create booked record' when no row exists — upsert
behaviour already built into the existing route).

Playwright e2e covers the sign-in-persist-across-reload path.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Chunk 8: Commit 7 — Monthly view

### Task 8.1: Hook + component

**Files:**
- Create: `src/hooks/useMonthlyRollCall.ts`
- Create: `src/components/services/ServiceMonthlyRollCallView.tsx`

- [ ] **Step 1: Hook**

```ts
export function useMonthlyRollCall(serviceId: string, month: string) {
  return useQuery({
    queryKey: ["monthly-roll-call", serviceId, month],
    queryFn: () => fetchApi<{ days: Array<{ date: string; booked: number; attended: number; absent: number }> }>(
      `/api/services/${serviceId}/roll-call/monthly?month=${month}`,
    ),
    enabled: !!serviceId && !!month,
    retry: 2,
    staleTime: 30_000,
  });
}
```

- [ ] **Step 2: Calendar component**

Render full month grid (6 weeks × 7 days). Each day shows `{attended}/{booked}` pill with completion color:
- ≥ 90% attended / booked → green
- ≥ 70% → amber
- < 70% → red

Click a day → navigate: `router.replace(\`?tab=daily-ops&sub=roll-call&rollCallView=daily&date=${date}\`)`. Preserve the existing tab/sub path — don't drop the user out of Roll Call.

- [ ] **Step 3: Wire daily view to read the `date` search param**

The existing `ServiceRollCallTab.tsx` daily view currently has its own `useState(today)` date picker — it ignores URL params. Update its initial state:

```tsx
// inside ServiceRollCallTab daily view
const searchParams = useSearchParams();
const urlDate = searchParams?.get("date");
const [selectedDate, setSelectedDate] = useState(urlDate ?? todayDateString());
```

And when the user manually changes the date picker, sync back to URL: `router.replace(\`?...&date=${newDate}\`)`. This keeps monthly-drilldown + bookmarking consistent.

### Task 8.2: Render in tab

**Files:**
- Modify: `src/components/services/ServiceRollCallTab.tsx`

```tsx
{view === "monthly" && <ServiceMonthlyRollCallView serviceId={service.id} />}
```

### Task 8.3: Test + commit

- [ ] **Step 1: Tests** — calendar renders all days of month; color classification (≥90/≥70/<70%); click navigates to daily view with `date` param; daily view reads param on mount.

- [ ] **Step 2: Commit**

```bash
git add src/components/services/ServiceMonthlyRollCallView.tsx src/components/services/ServiceRollCallTab.tsx src/hooks/useMonthlyRollCall.ts src/__tests__/
git commit -m "feat(roll-call): monthly calendar view with per-day drill-down

Calendar grid with attended/booked pills colored by completion rate
(green ≥90%, amber ≥70%, red <70%). Click a day → navigates to
daily view for that date.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Chunk 9: Commit 8 — /children/[id] full page — Details + Room tabs

### Task 9.1: Route skeleton

**Files:**
- Create: `src/app/(dashboard)/children/[id]/layout.tsx`
- Create: `src/app/(dashboard)/children/[id]/page.tsx`
- Create: `src/app/(dashboard)/children/[id]/loading.tsx`
- Modify: `src/lib/role-permissions.ts`

- [ ] **Step 1: role-permissions.ts — add `/children/[id]` per-role**

Read `src/lib/role-permissions.ts`. Current state (as of baseline):
- `owner` and `head_office` set to `allPages` (full). `admin` is `allPages.filter(p => p !== "/crm/templates")` → inherits.
- `coordinator` and `member` already have `/children`. `staff` and `marketing` do NOT.

Per the spec access matrix (v2), all non-admin roles should be able to READ `/children/[id]` at their own service (Details/Room: coord+ read; Relationships/Medical/Attendances: all roles R).

Changes required:
1. **Add `/children/[id]` to `allPages` constant** — place it directly after `"/children"` (around line 105). This auto-grants owner/head_office/admin via the spread.
2. **Add `/children/[id]`** to each of these arrays in `rolePageAccess`:
   - `coordinator` (after existing `/children` entry)
   - `member` (after existing `/children` entry)
   - `staff` (new — `/children/[id]` only; do NOT add `/children` list itself to staff because the list route hasn't been opened to staff in the spec. The page route access is gated further by the server-side same-service check in `page.tsx`.)
   - `marketing` (new — `/children/[id]` only; same rationale as staff)

3. **Add a unit test** `src/__tests__/lib/role-permissions-children-detail.test.ts`:

```ts
import { canAccessPage } from "@/lib/role-permissions";
describe("canAccessPage /children/[id]", () => {
  for (const role of ["owner", "head_office", "admin", "coordinator", "member", "staff", "marketing"] as const) {
    it(`allows ${role}`, () => {
      expect(canAccessPage(role, "/children/abc123")).toBe(true);
    });
  }
});
```

- [ ] **Step 2: Explicitly widen `/api/children/[id]` PATCH Zod schema**

The existing schema at `src/app/api/children/[id]/route.ts:9-15` accepts only 5 fields (`status`, `serviceId`, `schoolName`, `yearLevel`, `generateBookings`). The DetailsTab (Task 9.3) and MedicalTab (Task 10.2) both PATCH this route with many more fields. Extend now:

```ts
const patchSchema = z.object({
  // Existing fields
  status: z.string().optional(),
  serviceId: z.string().optional(),
  schoolName: z.string().optional(),
  yearLevel: z.string().optional(),
  generateBookings: z.boolean().optional(),
  // New in 4a — Details tab
  firstName: z.string().min(1).max(100).optional(),
  surname: z.string().min(1).max(100).optional(),
  dob: z.string().datetime().optional().nullable(),
  gender: z.enum(["male", "female", "other", "prefer_not_to_say"]).optional().nullable(),
  crn: z.string().max(20).optional().nullable(),
  photo: z.string().url().optional().nullable(),
  enrolmentDate: z.string().datetime().optional().nullable(),
  exitDate: z.string().datetime().optional().nullable(),
  exitCategory: z.string().max(100).optional().nullable(),
  exitReason: z.string().max(500).optional().nullable(),
  // New in 4a — Medical tab (needs schema fields from Commit 1)
  medicalConditions: z.array(z.string()).optional(),
  medicareNumber: z.string().max(20).optional().nullable(),
  medicareExpiry: z.string().datetime().optional().nullable(),
  medicareRef: z.string().max(10).optional().nullable(),
  vaccinationStatus: z.enum(["up_to_date", "overdue", "exempt", "unknown"]).optional().nullable(),
  // New in 4a — Room/Days tab
  bookingPrefs: z.record(z.unknown()).optional(), // detailed validation via bookingPrefsSchema on write
});
```

Also add auth-narrowing: currently the PATCH is `withApiAuth` with default roles — acceptable. But explicitly state that Medical + Room/Days sections require coordinator+ (admin/hq/owner/coord) per spec matrix. Implementation: route handler checks `parsed.data` for medical/bookingPrefs keys; if present and role not in `[owner, head_office, admin, coordinator]`, throw `ApiError.forbidden()`.

Verify test: add a case to `src/__tests__/api/children-id.test.ts` that a staff-role user patching `medicareNumber` gets 403.

- [ ] **Step 3: Extend the PATCH implementation for bookingPrefs merge (transactional)**

Because `bookingPrefs` is a JSON column, partial-update needs a read-merge-write. Otherwise a client sending only `fortnightPattern` clobbers other keys. In the PATCH handler, when `parsed.data.bookingPrefs` is present:

```ts
await prisma.$transaction(async (tx) => {
  const existing = await tx.child.findUnique({
    where: { id },
    select: { bookingPrefs: true },
  });
  const merged = {
    ...(existing?.bookingPrefs as object ?? {}),
    ...parsed.data.bookingPrefs,
  };
  await tx.child.update({
    where: { id },
    data: { bookingPrefs: merged as Prisma.InputJsonValue, ...otherFields },
  });
});
```

(Import `Prisma` from `@prisma/client` at the top.)

- [ ] **Step 4: layout.tsx**

Sticky header with avatar + name + DOB+age + service name + back button.

- [ ] **Step 5: page.tsx (server component)**

Fetch child + parallel data. Access check:

```ts
async function canAccessChild(viewerId: string, viewerRole: string | null, child: { serviceId: string | null }): Promise<boolean> {
  if (isAdminRole(viewerRole ?? "")) return true;
  if (!child.serviceId) return false;
  const viewer = await prisma.user.findUnique({ where: { id: viewerId }, select: { serviceId: true } });
  return viewer?.serviceId === child.serviceId;
}
```

If denied → render inline "Access denied" + `logger.warn`. If child not found → `notFound()`.

On success:
```tsx
<ChildProfileTabs
  child={child}
  activeTab={tab}
  canEdit={canEdit}
/>
```

- [ ] **Step 6: loading.tsx** — skeleton matching layout.

### Task 9.2: ChildProfileTabs client component

**Files:**
- Create: `src/components/child/ChildProfileTabs.tsx`

- [ ] **Step 1: Build URL-synced tab router**

Tabs: `details`, `room`, `relationships`, `medical`, `attendances`. Mirror `StaffProfileTabs` pattern from 3a.

```tsx
const TABS = [
  { key: "details", label: "Details" },
  { key: "room", label: "Room / Days" },
  { key: "relationships", label: "Relationships" },
  { key: "medical", label: "Medical" },
  { key: "attendances", label: "Attendances" },
] as const;
```

Render active tab content. Commits 9-10 implement Relationships / Medical / Attendances — for now stub them.

### Task 9.3: DetailsTab

**Files:**
- Create: `src/components/child/tabs/DetailsTab.tsx`

- [ ] **Step 1: Write failing test** (`src/__tests__/components/child/DetailsTab.test.tsx`) covering: view-only mode hides inputs, edit mode shows all 11 fields, save triggers `mutateApi('/api/children/<id>', PATCH, {...body})`.

- [ ] **Step 2: Implement**

Display + edit (if `canEdit`) form with: firstName, surname, dob, gender, photo upload, schoolName, yearLevel, crn, status (active/withdrawn), enrolment start date, finish date, exit category/reason.

PATCH `/api/children/[id]`. The schema extension in Task 9.1 Step 2 already accepts all these fields — this tab is purely UI. Use `mutateApi("/api/children/" + childId, { method: "PATCH", body: dirtyFields })` with `onError` destructive toast.

- [ ] **Step 3: Verify test passes**

### Task 9.4: RoomDaysTab

**Files:**
- Create: `src/components/child/tabs/RoomDaysTab.tsx`

- [ ] **Step 1: Write failing test** (`src/__tests__/components/child/RoomDaysTab.test.tsx`) — existing bookingPrefs.fortnightPattern renders checkboxes correctly; toggling then saving only sends the new fortnight pattern in the PATCH body (server-side merge handles the rest).

- [ ] **Step 2: Implement editable fortnight pattern**

Render two rows (Week 1 / Week 2). Each row has sub-rows per session type (BSC / ASC / VC). Columns = Mon / Tue / Wed / Thu / Fri / Sat / Sun. Each cell = checkbox.

Current pattern reads from `child.bookingPrefs?.fortnightPattern` (parse via `bookingPrefsSchema` from `@/lib/service-settings` then narrow to `.fortnightPattern`).

On Save → `mutateApi('/api/children/' + childId, { method: 'PATCH', body: { bookingPrefs: { fortnightPattern: newPattern } } })`. The client sends ONLY `{ fortnightPattern: ... }` as the `bookingPrefs` key — the server's transactional merge (implemented in Task 9.1 Step 3) reads existing `bookingPrefs`, shallow-merges, and writes back. This avoids client-side clobber + the race between concurrent edits.

- [ ] **Step 3: Verify test passes**

### Task 9.5: Tests + commit

- [ ] **Step 1: Access tests** — 5 cases per spec's access matrix
- [ ] **Step 2: DetailsTab rendering**
- [ ] **Step 3: RoomDaysTab — fortnight pattern save round-trip**

- [ ] **Step 4: Commit**

```bash
git add src/app/\(dashboard\)/children/ src/components/child/ src/lib/role-permissions.ts src/__tests__/
git commit -m "feat(child-page): /children/[id] full page + Details + Room/Days tabs

New full-page route at /children/[id] matching /staff/[id] pattern.
URL-synced tabs via ?tab=. First 2 of 5 tabs:

- Details: name, DOB, photo, school, year, CRN, status, dates
- Room / Days: editable fortnight pattern (Week 1 + Week 2 × BSC/ASC/VC
  × Mon-Sun) stored in Child.bookingPrefs.fortnightPattern JSON

Access: admin/coord R/W at any/same-service; staff/member/marketing
R only at same service; 403 cross-service.

/children/[id] added to role-permissions.ts allPages + explicit per-role
access per MEMORY.md.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Chunk 10: Commit 9 — Relationships + Medical tabs

### Task 10.1: RelationshipsTab

**Files:**
- Create: `src/components/child/tabs/RelationshipsTab.tsx`

- [ ] **Step 1: Data source**

Primary parent: from `Child.enrolment.primaryParent` (JSON). Secondary parents + emergency contacts: `authorisedPickups` relation. Existing enrolment data provides names, phone, email, relationship.

- [ ] **Step 2: Render**

List primary carer (starred), secondary carers, emergency contacts, authorised pickup list. If `canEdit`, provide add/edit/remove actions. Add uses `/api/parent-contacts` or similar (confirm existing route; if not, create a minimal one — flag during impl).

### Task 10.2: MedicalTab

**Files:**
- Create: `src/components/child/tabs/MedicalTab.tsx`

- [ ] **Step 1: Write failing test** (`src/__tests__/components/child/MedicalTab.test.tsx`) — form renders existing values; save triggers PATCH with exactly the Medical-fields subset; 403 surfaces to destructive toast.

- [ ] **Step 2: Form fields**

Checkboxes: Anaphylaxis, Allergies, Asthma, Dietary Restrictions. Free-text textareas: mild allergies, severe medical conditions. Medicare #, expiry (month+year), ref #. Vaccination status dropdown (`up_to_date | overdue | exempt | unknown`).

Read from `child.medicalConditions[]`, `child.medicareNumber`, `child.medicareExpiry`, `child.medicareRef`, `child.vaccinationStatus` (all added in Commit 1). Save via `mutateApi('/api/children/' + childId, { method: 'PATCH', body: {...medicalFields} })`. The PATCH schema extension (Task 9.1 Step 2) already accepts these fields.

Per spec access matrix: staff/member/marketing are **read-only**. In the UI, gate edit controls behind `canEdit` (passed in from page.tsx based on role). Server-side, the PATCH handler's authz narrowing (Task 9.1 Step 2) rejects non-coord+ roles patching Medical fields with 403.

- [ ] **Step 3: Verify test passes**

### Task 10.3: Wire into ChildProfileTabs + tests + commit

- [ ] **Step 1: Tab renders**
- [ ] **Step 2: Test** each tab renders correct fields for role
- [ ] **Step 3: Commit**

```bash
git add src/components/child/tabs/RelationshipsTab.tsx src/components/child/tabs/MedicalTab.tsx src/components/child/ChildProfileTabs.tsx src/__tests__/
git commit -m "feat(child-page): Relationships + Medical tabs

- Relationships: primary carer (starred), secondary carers,
  emergency contacts, authorised pickups. Admin/coord edit.
- Medical: 4 boolean checkboxes (Anaphylaxis, Allergies, Asthma,
  Dietary), mild + severe free-text, Medicare # + expiry + ref #,
  vaccination status dropdown. Writes to Child.medicalConditions[]
  + new Medicare/vaccination fields from Commit 1.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Chunk 11: Commit 10 — Attendances tab + export

### Task 11.1: Hook

**Files:**
- Create: `src/hooks/useChildAttendances.ts`

- [ ] **Step 1: Implement**

```ts
export function useChildAttendances(childId: string, from: string, to: string) {
  return useQuery({
    queryKey: ["child-attendances", childId, from, to],
    queryFn: () => fetchApi<{ records: any[]; stats: { attendances: number; absences: number; totalFee: number; totalHours: number } }>(
      `/api/children/${childId}/attendances?from=${from}&to=${to}`,
    ),
    enabled: !!childId && !!from && !!to,
    retry: 2,
    staleTime: 30_000,
  });
}
```

### Task 11.2: API route

**Files:**
- Create: `src/app/api/children/[id]/attendances/route.ts`

- [ ] **Step 1: Implement**

GET with date-range query params. Return records + aggregated stats.

Access: same as `/children/[id]` page access (admin/coord/staff/member/marketing at same service).

### Task 11.3: AttendancesTab

**Files:**
- Create: `src/components/child/tabs/AttendancesTab.tsx`

- [ ] **Step 1: Implement**

Stats strip at top (4 numbers). Date range picker (default current month). Table matching OWNA screenshot #4 columns. Export button reuses existing `exportToCsv` helper from `@/lib/csv-export`.

### Task 11.4: Tests + commit

```bash
git add src/components/child/tabs/AttendancesTab.tsx src/app/api/children/\[id\]/attendances/ src/hooks/useChildAttendances.ts src/components/child/ChildProfileTabs.tsx src/__tests__/
git commit -m "feat(child-page): Attendances tab with date range + CSV export

Read-only attendance history for the child, matching OWNA's per-child
record view. Columns: date, sign-in (staff + time), sign-out (staff +
time), notes, fee, session. Stats strip: total attendances, absences,
fee, hours. Export to CSV reuses existing exportToCsv helper.

New read-only route GET /api/children/[id]/attendances?from=&to=.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Chunk 12: Commit 11 — Children list filters + CCS badge + parent display

### Task 12.1: Extend `/api/children` with parents + filters

**Files:**
- Modify: `src/app/api/children/route.ts`

- [ ] **Step 1: Add query params**

```ts
// ?includeParents=true&serviceId=&room=&day=&ccsStatus=&tags=&status=current|all|withdrawn&sortBy=surname|firstName|addedAt|dob
```

When `includeParents=true`, hydrate `parents` array from `enrolment.primaryParent` (JSON) + linked `centreContacts` + existing `authorisedPickups` where `isParent=true` (or similar). Return shape:

```ts
parents: Array<{ id?: string; firstName: string; surname: string; relationship: string; isPrimary: boolean; phone?: string; email?: string }>
```

Filters: apply Prisma where-clause per query params.

### Task 12.2: Update useChildren hook

**Files:**
- Modify: `src/hooks/useChildren.ts`

- [ ] **Step 1: Accept filters**

```ts
export interface ChildrenFilters {
  serviceId?: string;
  room?: string;
  day?: string;
  ccsStatus?: string;
  tags?: string[];
  status?: "current" | "all" | "withdrawn";
  sortBy?: "surname" | "firstName" | "addedAt" | "dob";
  includeParents?: boolean;
}

export function useChildren(filters?: ChildrenFilters) {
  // Sort tags so cache hits are stable regardless of user-supplied order
  const sortedTags = (filters?.tags ?? []).slice().sort();
  return useQuery({
    queryKey: [
      "children",
      filters?.serviceId ?? null,
      filters?.room ?? null,
      filters?.day ?? null,
      filters?.ccsStatus ?? null,
      filters?.status ?? null,
      filters?.sortBy ?? null,
      filters?.includeParents ?? false,
      ...sortedTags,
    ],
    queryFn: () => fetchApi<Child[]>(`/api/children${buildQueryString(filters)}`),
    retry: 2,
    staleTime: 30_000,
  });
}
```

Primitive-spread query keys per CLAUDE.md. Tags sorted so `["foo","bar"]` and `["bar","foo"]` produce the same cache key.

### Task 12.3: ChildrenFilters component + list upgrade

**Files:**
- Create: `src/components/services/ChildrenFilters.tsx`
- Modify: `src/components/services/ServiceChildrenTab.tsx`

- [ ] **Step 1: Filter row**

Render: status toggle (Current/All/Withdrawn), Room dropdown, Day dropdown, CCS Status dropdown, Tags multi-select, Sort-by dropdown, Clear button.

- [ ] **Step 2: List grid columns**

Cols: Name+Account, DOB+Age, Parents/Carers (map over `child.parents`, starred primary with phone/email quick-links), Room/Days+Session+Fee+Times, Action (edit/deactivate), CCS Status badge.

Click Name → navigate to `/children/[id]`.

### Task 12.4: Tests + commit

```bash
git add src/components/services/ChildrenFilters.tsx src/components/services/ServiceChildrenTab.tsx src/hooks/useChildren.ts src/app/api/children/route.ts src/__tests__/
git commit -m "feat(services-list): children list filters + CCS badge + parent display

ServiceChildrenTab gets a proper filter row (status/room/day/ccs/tags)
+ sort-by + parent display columns (primary starred, phone/email
quick-links) + CCS status badges.

/api/children extended with ?includeParents=true hydrating the parents
array from enrolment.primaryParent + centreContacts + authorisedPickups.
useChildren hook accepts optional ChildrenFilters with primitive-spread
query keys per CLAUDE.md.

Click child name → /children/[id] (full page from Commit 8).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Chunk 13: Commit 12 — Casual Bookings Settings tab

### Task 13.1: API route

**Files:**
- Create: `src/app/api/services/[id]/casual-settings/route.ts`

- [ ] **Step 1: Implement PATCH**

```ts
import { NextResponse } from "next/server";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { isAdminRole } from "@/lib/role-permissions";
import { casualBookingSettingsSchema } from "@/lib/service-settings";

import type { Prisma } from "@prisma/client";
import { getServiceScope } from "@/lib/service-scope";

export const PATCH = withApiAuth(async (req, session, context) => {
  const { id } = await context!.params!;
  const role = session.user.role ?? "";
  if (!isAdminRole(role)) {
    if (role !== "coordinator") throw ApiError.forbidden();
    const scope = getServiceScope(session);
    if (!scope || !scope.includes(id)) throw ApiError.forbidden();
  }
  const body = await parseJsonBody(req);
  const parsed = casualBookingSettingsSchema.safeParse(body);
  if (!parsed.success) throw ApiError.badRequest("Invalid casualBookingSettings", parsed.error.flatten());

  // Client sends the FULL {bsc,asc,vc} blob (UI displays all three cards every time,
  // so partial-update isn't needed here). Zod-parsed → Prisma.InputJsonValue cast
  // satisfies the JSON column type without unsafe `as any`.
  const updated = await prisma.service.update({
    where: { id },
    data: { casualBookingSettings: parsed.data as Prisma.InputJsonValue },
  });
  return NextResponse.json({ service: updated });
});
```

### Task 13.2: Settings tab UI

**Files:**
- Create: `src/components/services/ServiceCasualBookingsTab.tsx`

- [ ] **Step 1: Implement**

Three cards (BSC / ASC / VC). Each: enable toggle, fee input, spots input, cut-off hours input, days-of-week checkboxes.

Preview card at top: "Parents can book casual BSC up to 24 hours before the session at $36.00 (10 spots available)".

Info banner: "⚠ Settings stored — parent-portal enforcement ships in a follow-up sub-project."

Save → PATCH /api/services/[id]/casual-settings.

### Task 13.3: Register tab in page.tsx

**Files:**
- Modify: `src/app/(dashboard)/services/[id]/page.tsx`

- [ ] **Step 1: Add sub-tab**

Find the Daily Ops tab group's `subTabs` array. Add:
```ts
{ key: "casual-bookings", label: "Casual Bookings", icon: CalendarClock },
```
Gate via `isAdminRole || coordinator` (hide from staff/member/marketing).

Render the tab conditionally when `?sub=casual-bookings`.

### Task 13.4: Tests + commit

```bash
git add src/app/api/services/\[id\]/casual-settings/ src/components/services/ServiceCasualBookingsTab.tsx src/app/\(dashboard\)/services/\[id\]/page.tsx src/__tests__/
git commit -m "feat(casual-bookings): Casual Bookings Settings tab under Daily Ops

New sub-tab. Admin/coord edit per-session-type (BSC/ASC/VC):
enable toggle, fee, spots, cut-off hours, days of week. Preview card
shows human-readable policy. Info banner notes settings are stored
but parent-portal enforcement ships in a follow-up.

Dedicated PATCH /api/services/[id]/casual-settings route with
Zod-validated body via casualBookingSettingsSchema.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Chunk 14: Commit 13 — Today first-class tab + IA reorder

### Task 14.1: ServiceTodayTab wrapper

**Files:**
- Create: `src/components/services/ServiceTodayTab.tsx`

- [ ] **Step 1: Wrap the existing panel**

```tsx
"use client";
import { ServiceTodayPanel } from "./ServiceTodayPanel";

export function ServiceTodayTab({ serviceId, serviceName }: { serviceId: string; serviceName?: string }) {
  return <div className="space-y-6"><ServiceTodayPanel serviceId={serviceId} serviceName={serviceName} /></div>;
}
```

(Keep `ServiceTodayPanel` as-is for potential reuse on the services-list card.)

### Task 14.2: Reorder + default landing + remove page-level render

**Files:**
- Modify: `src/app/(dashboard)/services/[id]/page.tsx`

- [ ] **Step 1: Add Today tab at position 0**

```ts
const tabs = [
  { key: "today", label: "Today", icon: Sunrise },
  { key: "overview", label: "Overview", icon: Building2 },
  // ... existing 5 tab groups ...
];
```

- [ ] **Step 2: Default landing**

When no `?tab=` param present, default to `today`:
```ts
const activeTab = searchParams?.get("tab") ?? "today";
```

- [ ] **Step 3: Render Today tab**

```tsx
{activeTab === "today" && <ServiceTodayTab serviceId={service.id} serviceName={service.name} />}
```

- [ ] **Step 4: Remove page-level ServiceTodayPanel render**

Find the current line (~299) that renders `<ServiceTodayPanel />` above the tab group. Remove it. The panel only renders inside the new Today tab now.

- [ ] **Step 5: Audit existing links to `/services/[id]` (avoid silent redirects)**

Before committing, grep for existing link targets. Any bare `/services/<id>` link that users currently expect to land on Overview will now land on Today instead:

```bash
# Within the worktree:
grep -rn "services/\${" src --include="*.tsx" --include="*.ts" \
  | grep -v "tab="
grep -rn "/services/\[id\]" src/lib/nav-config.ts src/lib/email-templates.ts 2>/dev/null
grep -rn "href.*services/\$" src --include="*.tsx"
```

For each hit: decide intentionally. If the link SHOULD preserve Overview-default behaviour (e.g. an email CTA that says "Review service settings"), append `?tab=overview`. If the link should land on Today (most dashboard navigation), leave untouched. Document any you changed in the commit body.

### Task 14.3: Test + commit

- [ ] **Step 1: Test**

`ServiceIdPage.test.tsx`:
- Default landing is Today when no ?tab=
- Today tab renders ServiceTodayPanel content
- Page-level panel no longer renders

- [ ] **Step 2: Commit**

```bash
git add src/components/services/ServiceTodayTab.tsx src/app/\(dashboard\)/services/\[id\]/page.tsx src/__tests__/
git commit -m "feat(ia): promote Today to first-class tab + default landing

- New tab Today at position 0 (before Overview)
- Default landing when no ?tab= query is Today (was Overview implicitly)
- ServiceTodayPanel content moved into tab; page-level duplicate
  render removed

Coordinators now land on the live ops snapshot (attendance, staff
on duty, todos, tickets, expiring certs) by default when opening
a service.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Chunk 15: Final verification + PR

### Task 15.1: Verification sweep

- [ ] **Step 1: Commits on branch**

`git log origin/main..HEAD --oneline` — expect 13 feature commits + 2 docs commits.

- [ ] **Step 2: Full gate**

```bash
npm test -- --run 2>&1 | tail -10       # expect baseline + ~80 new tests
npx tsc --noEmit 2>&1 | grep -c "error TS"  # 0
npm run lint 2>&1 | tail -3
```

- [ ] **Step 3: Audits**

```bash
ls prisma/migrations/ | grep add_service_approval_session_times_child_medical
grep -c "/children/\[id\]" src/lib/role-permissions.ts   # at least 5 (allPages + 4 explicit roles)
grep -c "serviceApprovalNumber\|sessionTimes\|casualBookingSettings" prisma/schema.prisma
```

- [ ] **Step 4: Manual smoke**

Smoke scenarios:
1. Admin visits `/services/[id]` → lands on Today tab by default
2. Edit service info → set approval numbers + session times → verify persisted
3. Roll Call → toggle weekly → sign a child in → verify AttendanceRecord created
4. Click `+ Add child to week` → list of enrollable children → add → new row appears
5. Roll Call → toggle monthly → verify calendar
6. Services → Children tab → filter by CCS Status → click a child → lands on `/children/[id]`
7. On child page: edit Details, Room/Days fortnight, Medical, Attendances export
8. Daily Ops → Casual Bookings Settings → configure BSC → save → verify persisted

### Task 15.2: Push + open PR

- [ ] **Step 1: Push**

`git push -u origin feat/services-daily-ops-4a-2026-04-22`

- [ ] **Step 2: Open PR**

`gh pr create --title "feat: services daily ops part 1 (4a) — OWNA-depth rebuild" --body "..."` with:
- Summary paragraph
- Before/after table
- Per-commit list (13)
- Migration instructions (same 2-step pattern as 3a/3b/5/7/9: SQL + _prisma_migrations INSERT)
- Deferred to 4b list
- Test plan

### Task 15.3: Apply migration + merge

- [ ] **Step 1: Hand Jayden the paste-ready SQL artefact** from `prisma/migrations/<ts>_add_service_approval_session_times_child_medical/neon-apply.sql` (created in Task 2.3 Step 3). It includes the ALTER TABLE statements PLUS the `INSERT INTO _prisma_migrations` that tells Prisma the migration is applied. Reminder: substitute `<MIGRATION_FOLDER_NAME>` with the actual folder name.

- [ ] **Step 2: After Jayden confirms applied, verify via psql**

```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'Service' AND column_name IN
  ('serviceApprovalNumber','providerApprovalNumber','sessionTimes','casualBookingSettings');
-- Expect 4 rows

SELECT column_name FROM information_schema.columns
WHERE table_name = 'Child' AND column_name IN
  ('medicareNumber','medicareExpiry','medicareRef','vaccinationStatus');
-- Expect 4 rows

SELECT migration_name FROM "_prisma_migrations"
WHERE migration_name LIKE '%add_service_approval_session_times_child_medical%';
-- Expect 1 row
```

- [ ] **Step 3: Merge PR + cleanup**

```bash
git worktree remove .worktrees/services-daily-ops-4a
git branch -D feat/services-daily-ops-4a-2026-04-22
git fetch && git reset --hard origin/main
```

---

## Acceptance criteria

- [ ] All 13 commits land in prescribed order (+ 2 docs commits)
- [ ] Schema migration applied to Neon pre-merge (via `neon-apply.sql` artefact)
- [ ] 1298+ baseline → 1400+ tests (~80+ new, including 1 Playwright E2E for weekly grid)
- [ ] 0 tsc errors
- [ ] `/children/[id]` added to `src/lib/role-permissions.ts` in `allPages` + explicitly in 4 non-admin roles (coordinator, member, staff, marketing)
- [ ] `/api/children/[id]` PATCH Zod schema widened to 15+ fields (Details + Medical + Room/Days) with 403 narrowing for Medical/Room/Days from non-coord+
- [ ] `bookingPrefs` PATCH is transactional (read-merge-write inside `prisma.$transaction`)
- [ ] All attendance mutations route through `POST /api/attendance/roll-call` — zero references to `/api/attendance/[id]` (doesn't exist)
- [ ] All AttendanceRecord date filters use `date` column (not `attendanceDate`)
- [ ] All week/month boundary calcs use UTC mutators (`setUTCDate` / `setUTCMonth` / `Date.UTC`)
- [ ] No `as any` casts on Prisma JSON writes (use `Prisma.InputJsonValue`)
- [ ] Weekly grid Playwright test covers sign-in-persist-across-reload
- [ ] CI green on PR
- [ ] Manual smoke: all 8 scenarios pass
- [ ] PR body includes before/after + `neon-apply.sql` content + "deferred to 4b" list

## Risk mitigations

- **Schema migration**: all additive (nullable cols + new JSON fields). Safe for deploy-ahead.
- **Weekly grid perf**: `React.memo` on cell + `useMemo` for shiftsMap. If perf degrades, dynamically virtualize rows with react-window (fallback only).
- **Child parent hydration**: `includeParents` implementation depends on current CentreContact / authorisedPickups shape. If the stitching doesn't produce clean data, fall back to showing primary parent only and flag in PR body.
- **Decomposition regressions**: run existing overview tests before/after Commit 3 to confirm no behaviour change.
- **Today tab default-landing**: if any existing nav links explicitly pass `?tab=overview`, they keep working. Direct `/services/[id]` URLs now resolve to Today instead of Overview.

## Rollback

Each commit `git revert`-safe. Schema migration additive — safe to keep after rollback. Whole-PR revert via merge-commit revert; leaves migration applied but UI/routes removed.
