# P0 Bug Batch — Implementation Plan

> **For agentic workers:** REQUIRED: Use `superpowers:subagent-driven-development` (if subagents available) or `superpowers:executing-plans` to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 15 user-reported / security bugs in a single feature branch, each with a root-cause fix and a regression test, shipping as one PR.

**Architecture:** Bug-by-bug TDD-style fixes on a feature branch. Backend/schema fixes first (smallest blast radius), then known-cause client fixes, then live-diagnosis bugs (reproduce → trace → fix). Each bug = one commit named `fix(bug-N): <description>`. One PR at the end with a table mapping each bug to its commit.

**Tech Stack:** Next.js 16, TypeScript, Prisma 5.22, Vitest (unit/integration), Playwright (E2E), Tailwind. Existing conventions: `withApiAuth` / `withApiHandler` / `parseJsonBody` / Zod / `onError` toasts / `retry: 2` + `staleTime` on queries.

**Parent spec:** [`docs/superpowers/specs/2026-04-20-p0-bug-batch-design.md`](../specs/2026-04-20-p0-bug-batch-design.md)

---

## File Structure Overview

Files most likely to be touched (exact paths confirmed by grep during spec writing):

| Bug # | Primary files |
|---|---|
| #1 Contracts null | `src/app/api/contracts/route.ts`, `src/app/api/contracts/[id]/route.ts`, `src/__tests__/api/contracts.test.ts` (may exist, confirm; create if not) |
| #2 Recruitment d.map | `src/components/recruitment/NewVacancyModal.tsx`, new `src/__tests__/components/recruitment/NewVacancyModal.test.tsx` |
| #3 Timesheets ISE | `src/app/api/timesheets/route.ts`, `src/app/api/timesheets/[id]/entries/route.ts`, `src/app/api/timesheets/import/route.ts`, `src/app/api/timesheets/summary/route.ts`, `src/__tests__/api/timesheets.test.ts` |
| #4 Documents PDF upload | TBD during live repro — likely `src/app/api/documents/route.ts` + `src/app/(dashboard)/documents/page.tsx` + Blob storage helper |
| #5 Documents FORBIDDEN | `src/app/api/documents/[id]/route.ts` (GET), `src/app/api/documents/download/route.ts` |
| #6 Training module not opening | `src/app/(dashboard)/training/` or `src/app/(dashboard)/lms/`, + `src/components/lms/*` (TBD) |
| #7 Pulse one-char | `src/components/communication/WeeklyPulseTab.tsx`, `src/hooks/useCommunication.ts` (lines 237-351), test file |
| #8 Communication one-char | Same pattern — locate the other affected editor |
| #9 Enrolment glitch on child select | `src/components/enrol/*` or `src/app/(dashboard)/enrolments/*` (TBD) |
| #10 Projects glitch | `src/app/(dashboard)/projects/*`, `src/components/projects/*` (TBD) |
| #11 Postcode 3-char | TBD — reproduce across `/enrol/[token]`, `/parent/children/new`, `/parent/account` |
| #12 LMS tick | `src/hooks/useLMS.ts`, `src/components/lms/*` or staff portal LMS component |
| #13 Issues Show Closed | `src/app/(dashboard)/issues/page.tsx`, `src/hooks/useIssues.ts`, `src/app/api/issues/route.ts` |
| #14 Report Issue auth | `src/app/api/internal-feedback/route.ts`, `src/__tests__/api/internal-feedback.test.ts` (create) |

No new Prisma migrations. No new nav routes (so no `role-permissions.ts` changes expected).

---

## Chunk 1: Setup & Branch

### Task 1.1: Create feature branch

- [ ] **Step 1: Confirm clean working tree**

Run: `git status`
Expected: no unstaged changes in `src/` or `docs/`. Any pre-existing dirty files outside those paths (e.g. `.env.save`, `.claude/launch.json`, `logs/*.log`) are fine — don't let them block you, just don't accidentally stage them.

- [ ] **Step 2: Pull latest main**

Run: `git checkout main && git pull --ff-only origin main`
Expected: `Already up to date.` or fast-forward merge only.

- [ ] **Step 3: Create feature branch**

Run: `git checkout -b fix/p0-bug-batch-2026-04-20`
Expected: `Switched to a new branch 'fix/p0-bug-batch-2026-04-20'`.

- [ ] **Step 4: Establish a known-good baseline before any edits**

Run each and save the outputs (pipe to a scratch file if helpful). This is the reference point — regressions introduced by bug fixes will be compared against this baseline, not against an empty state.

```bash
npm run build 2>&1 | tail -30
npm test -- --run 2>&1 | tail -30
npx tsc --noEmit 2>&1 | wc -l
```

Expected: build may succeed (with warnings OK), tests mostly pass (spec noted 13 pre-existing TS errors in test files that are Sub-project 2's scope — record the test file names that fail), `tsc --noEmit` reports around 13 errors currently.

- [ ] **Step 5: Sanity-check dev server boots**

Start the dev server: `npm run dev`. Wait for "Ready in Xms". Open `http://localhost:3000` — confirm the login page renders. (Credentials per `MEMORY.md`: 9 seeded users, password `AmanaOSHC2026!`.) Stop the server with Ctrl-C.

No commit for setup.

---

## Chunk 2: Known-cause backend fixes (Bugs #1, #3, #14)

### Task 2.1 — Bug #1: Contracts Zod null acceptance

**Root cause:** `createContractSchema` in `src/app/api/contracts/route.ts:6-28` uses `.optional()` on `awardLevelCustom`, `documentUrl`, `documentId`, `notes`, `endDate`, `hoursPerWeek`, `previousContractId`, `awardLevel`. Zod `.optional()` allows `undefined` but not `null`. The client submits `null` for cleared optional fields, causing `"Invalid input: expected string, received null"`.

**Fix:** Replace `.optional()` with `.nullish()` (or `.nullable().optional()`) on all fields that the client sends as `null`.

**Files:**
- Modify: `src/app/api/contracts/route.ts:6-28`
- Modify (if same pattern): `src/app/api/contracts/[id]/route.ts` (PATCH schema — confirm)
- Test: `src/__tests__/api/contracts.test.ts` (create if not exists)

- [ ] **Step 1: Write failing test**

Check if test file exists: `ls src/__tests__/api/contracts.test.ts`. If exists, extend it; if not, create it using the existing test helpers pattern from `src/__tests__/helpers/`.

Create/append this test case:

```typescript
import { describe, it, expect, beforeEach, vi } from "vitest";
import { POST } from "@/app/api/contracts/route";
import { createRequest } from "@/__tests__/helpers/request";
import { mockSession } from "@/__tests__/helpers/auth-mock";
import { prisma, _clearUserActiveCache } from "@/__tests__/helpers/prisma-mock";

describe("POST /api/contracts — nullable optional fields", () => {
  beforeEach(() => {
    _clearUserActiveCache();
    vi.clearAllMocks();
  });

  it("accepts null for optional string fields without rejecting as 'expected string, received null'", async () => {
    mockSession({ id: "u1", role: "admin" });
    prisma.user.findUnique.mockResolvedValue({ id: "u1", active: true, role: "admin" });
    prisma.employmentContract.create.mockResolvedValue({ id: "c1" });

    const req = createRequest("POST", "/api/contracts", {
      userId: "target-user-id",
      contractType: "ct_permanent",
      payRate: 30.5,
      startDate: "2026-05-01",
      awardLevelCustom: null,
      documentUrl: null,
      documentId: null,
      notes: null,
      endDate: null,
      hoursPerWeek: null,
      previousContractId: null,
      awardLevel: null,
    });

    const res = await POST(req);
    expect(res.status).toBe(201);
  });
});
```

- [ ] **Step 2: Run test, confirm it fails**

Run: `npx vitest run src/__tests__/api/contracts.test.ts -t "nullable optional"`
Expected: FAIL with a 400 response containing a Zod error about "expected string, received null".

- [ ] **Step 3: Apply the fix**

Edit `src/app/api/contracts/route.ts` lines 6-28. Change each `.optional()` on a string-typed optional field to `.nullish()`:

```typescript
const createContractSchema = z.object({
  userId: z.string().min(1, "User ID is required"),
  contractType: z.enum(["ct_casual", "ct_part_time", "ct_permanent", "ct_fixed_term"]),
  awardLevel: z
    .enum([
      "es1", "es2", "es3", "es4",
      "cs1", "cs2", "cs3", "cs4",
      "director", "coordinator", "custom",
    ])
    .nullish(),
  awardLevelCustom: z.string().nullish(),
  payRate: z.number().positive("Pay rate must be positive"),
  hoursPerWeek: z.number().positive().nullish(),
  startDate: z.string().min(1, "Start date is required"),
  endDate: z.string().nullish(),
  status: z
    .enum(["contract_draft", "active", "superseded", "terminated"])
    .default("contract_draft"),
  documentUrl: z.string().url().nullish(),
  documentId: z.string().nullish(),
  notes: z.string().nullish(),
  previousContractId: z.string().nullish(),
});
```

- [ ] **Step 4: Confirm PATCH schema already handles null correctly**

Read `src/app/api/contracts/[id]/route.ts:5-28`. The `updateContractSchema` already uses `.nullable().optional()` on the string fields (equivalent to `.nullish()`). No changes required — but add a matching test case so regressions don't slip in:

```typescript
it("PATCH accepts null for previously-set optional fields", async () => {
  mockSession({ id: "u1", role: "admin" });
  prisma.user.findUnique.mockResolvedValue({ id: "u1", active: true, role: "admin" });
  prisma.employmentContract.findUnique.mockResolvedValue({ id: "c1", userId: "other" });
  prisma.employmentContract.update.mockResolvedValue({ id: "c1" });

  const req = createRequest("PATCH", "/api/contracts/c1", {
    awardLevelCustom: null,
    documentUrl: null,
    notes: null,
    endDate: null,
  });
  const { PATCH } = await import("@/app/api/contracts/[id]/route");
  const res = await PATCH(req, { params: Promise.resolve({ id: "c1" }) });
  expect(res.status).toBe(200);
});
```

- [ ] **Step 5: Run the test, confirm it passes**

Run: `npx vitest run src/__tests__/api/contracts.test.ts`
Expected: all tests pass.

- [ ] **Step 6: Run full test file for the route's area to catch regressions**

Run: `npx vitest run src/__tests__/api/`
Expected: no new failures vs. pre-existing baseline.

- [ ] **Step 7: Commit**

```bash
git add src/app/api/contracts/route.ts src/app/api/contracts/[id]/route.ts src/__tests__/api/contracts.test.ts
git commit -m "fix(bug-1): accept null for optional contract fields in Zod schema

UI sends null for cleared optional fields (awardLevelCustom, documentUrl,
notes, etc). Previous schema used .optional() which only allows undefined,
causing 'Invalid input: expected string, received null' on valid payloads.
Switch to .nullish() on optional string fields in create + update schemas.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 2.2 — Bug #3: Timesheets Internal Server Error

**Root cause (confirmed by code read):** The entry/import routes already have Zod validation (`entrySchema` at `[id]/entries/route.ts:7-23` and `importEntrySchema` at `import/route.ts:5-19`). The smoking guns are:

1. `route.ts:55` uses raw `req.json()` — malformed JSON returns 500 instead of 400.
2. `route.ts:41` uses `where: where as any` masking a `Prisma.TimesheetWhereInput` shape drift.
3. `[id]/entries/route.ts:51` uses raw `req.json()` — same malformed-body issue.
4. `[id]/entries/route.ts:96` uses `data: entriesToCreate as any`. The object constructed on lines 72-93 includes `notes: entry.notes` and `payRate: entry.payRate` — both `string | undefined` / `number | undefined` from Zod — but `TimesheetEntryCreateManyInput` likely expects `string | null`. This mismatch is masked by `as any`; at runtime when Prisma tries to insert, it may throw `PrismaClientValidationError` → 500.
5. `import/route.ts:29` raw `req.json()`; `import/route.ts:123` `data: entriesToCreate as any`.
6. `summary/route.ts:32` `where: where as any`.

**Fix:** Route every body through `parseJsonBody`; replace every `as any` with the correct Prisma type; normalise `undefined` → `null` in entry mapping so the Prisma type is satisfied.

**Files:**
- Modify: `src/app/api/timesheets/route.ts`
- Modify: `src/app/api/timesheets/[id]/entries/route.ts`
- Modify: `src/app/api/timesheets/import/route.ts`
- Modify: `src/app/api/timesheets/summary/route.ts`
- Test: `src/__tests__/api/timesheets.test.ts`

- [ ] **Step 1: Write failing test — malformed JSON returns 400, not 500**

In `src/__tests__/api/timesheets.test.ts` (create if missing):

```typescript
import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST as createTimesheet } from "@/app/api/timesheets/route";
import { createRequest } from "@/__tests__/helpers/request";
import { mockSession } from "@/__tests__/helpers/auth-mock";
import { prisma, _clearUserActiveCache } from "@/__tests__/helpers/prisma-mock";

describe("Timesheets POST /api/timesheets", () => {
  beforeEach(() => {
    _clearUserActiveCache();
    vi.clearAllMocks();
  });

  it("creates a timesheet and returns 201", async () => {
    mockSession({ id: "u1", role: "admin" });
    prisma.user.findUnique.mockResolvedValue({ id: "u1", active: true, role: "admin" });
    prisma.timesheet.findUnique.mockResolvedValue(null);
    prisma.timesheet.create.mockResolvedValue({
      id: "t1",
      serviceId: "svc1",
      weekEnding: new Date("2026-04-27"),
      status: "ts_draft",
    });

    const req = createRequest("POST", "/api/timesheets", {
      serviceId: "svc1",
      weekEnding: "2026-04-27",
      notes: null,
    });
    const res = await createTimesheet(req);
    expect(res.status).toBe(201);
  });

  it("returns 400 (not 500) on malformed JSON body", async () => {
    mockSession({ id: "u1", role: "admin" });
    prisma.user.findUnique.mockResolvedValue({ id: "u1", active: true, role: "admin" });

    // Use NextRequest directly because createRequest helper only sends JSON-stringified bodies.
    const req = new NextRequest("http://localhost:3000/api/timesheets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{not-json",
    });
    const res = await createTimesheet(req);
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run test, confirm the malformed-JSON case fails**

Run: `npx vitest run src/__tests__/api/timesheets.test.ts -t "malformed"`
Expected: FAIL — probably returns 500 (or Zod eats the thrown error differently, but not 400).

- [ ] **Step 3: Apply fix — route.ts**

Edit `src/app/api/timesheets/route.ts`:

Top of file, add imports:
```typescript
import { parseJsonBody } from "@/lib/api-error";
import type { Prisma } from "@prisma/client";
```

Line 23 (GET handler):
Change `const where: Record<string, unknown> = { deleted: false };` to:
```typescript
const where: Prisma.TimesheetWhereInput = { deleted: false };
```

Line 41: remove `as any` — becomes `where,`.

Line 32-38 (the `weekEnding` range object): replace the `as Record<string, unknown>` casts with the typed shape:
```typescript
if (weekEndingAfter || weekEndingBefore) {
  const range: Prisma.DateTimeFilter = {};
  if (weekEndingAfter) range.gte = new Date(weekEndingAfter);
  if (weekEndingBefore) range.lte = new Date(weekEndingBefore);
  where.weekEnding = range;
}
```

Line 55 (POST handler): change `const body = await req.json();` to `const body = await parseJsonBody(req);`.

- [ ] **Step 4: Apply fix — entries/route.ts**

Edit `src/app/api/timesheets/[id]/entries/route.ts`:

Top of file add imports (if not present):
```typescript
import { parseJsonBody } from "@/lib/api-error";
import type { Prisma } from "@prisma/client";
```

Line 51: `const body = await req.json();` → `const body = await parseJsonBody(req);`.

Lines 72-93: update the `.map(...)` callback to normalise undefineds to nulls and type the array:
```typescript
const entriesToCreate: Prisma.TimesheetEntryCreateManyInput[] = parsed.data.map((entry) => {
  const shiftStart = new Date(entry.shiftStart);
  const shiftEnd = new Date(entry.shiftEnd);
  const breakMins = entry.breakMinutes ?? 0;
  const diffMs = shiftEnd.getTime() - shiftStart.getTime();
  const totalHours =
    Math.round((diffMs / (1000 * 60 * 60) - breakMins / 60) * 100) / 100;
  return {
    timesheetId: id,
    userId: entry.userId,
    date: new Date(entry.date),
    shiftStart,
    shiftEnd,
    breakMinutes: breakMins,
    totalHours: Math.max(0, totalHours),
    shiftType: entry.shiftType,
    notes: entry.notes ?? null,
    payRate: entry.payRate ?? null,
  };
});
```

Line 96: remove `as any` — becomes `data: entriesToCreate,`.

- [ ] **Step 5: Apply fix — import/route.ts**

Edit `src/app/api/timesheets/import/route.ts`:

Top of file add imports (if not present):
```typescript
import { parseJsonBody } from "@/lib/api-error";
import type { Prisma } from "@prisma/client";
```

Line 29: `const body = await req.json();` → `const body = await parseJsonBody(req);`.

Lines 81-90: replace the inline object type with `Prisma.TimesheetEntryCreateManyInput[]`:
```typescript
const entriesToCreate: Prisma.TimesheetEntryCreateManyInput[] = [];
```

Line 123: remove `as any` — becomes `data: entriesToCreate,`.

(No test needed for import route in this PR — the route-level Zod already validates, and the fix here is type-safety only. Covered by existing tests if any.)

- [ ] **Step 6: Apply fix — summary/route.ts**

Edit `src/app/api/timesheets/summary/route.ts`:

Top: add `import type { Prisma } from "@prisma/client";`

Line 18: change `const where: Record<string, unknown> = { ... };` to:
```typescript
const where: Prisma.TimesheetEntryWhereInput = {
  date: { gte: new Date(startDate), lte: new Date(endDate) },
};
```

Line 25-29: the `where.timesheet = { ... }` shape is valid for `Prisma.TimesheetEntryWhereInput` if typed; no further change.

Line 32: remove `as any` — becomes `where,`.

- [ ] **Step 7: Run tests**

Run: `npx vitest run src/__tests__/api/timesheets.test.ts`
Expected: both tests PASS.

- [ ] **Step 8: Baseline-compare build**

Run: `npx tsc --noEmit 2>&1 | wc -l`
Compare against the baseline captured in Task 1.1 Step 4. Expected: same count or LOWER (we removed `as any` casts which means TS is now checking what it couldn't before; if it's higher, investigate the new errors — they're likely real issues the casts were hiding).

- [ ] **Step 9: Commit**

```bash
git add src/app/api/timesheets/ src/__tests__/api/timesheets.test.ts
git commit -m "fix(bug-3): replace 'as any' casts in timesheets with typed Prisma inputs

Timesheets routes had 'where as any' on WhereInputs and
'entriesToCreate as any' on createMany payloads. The latter masked a
Prisma shape mismatch where entry.notes/payRate arrive as
'string|undefined' from Zod but Prisma expects 'string|null',
surfacing as a 500 Internal Server Error on valid payloads. Switch to
Prisma.TimesheetWhereInput and Prisma.TimesheetEntryCreateManyInput[],
coerce undefined to null in the mapping, and route all POST bodies
through parseJsonBody so malformed JSON returns 400.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 2.3 — Bug #14: Report Issue GET auth enforcement

**Root cause:** `src/app/api/internal-feedback/route.ts:13` — GET claims "admin+ only" in a comment but `withApiAuth(...)` is called without a `roles` option. Any authenticated user can list all feedback.

**Fix:** Add `{ roles: ["owner", "head_office", "admin"] }` as the second arg to `withApiAuth` on the GET.

**Files:**
- Modify: `src/app/api/internal-feedback/route.ts`
- Test: `src/__tests__/api/internal-feedback.test.ts` (create)

- [ ] **Step 1: Write failing role-matrix test**

Create `src/__tests__/api/internal-feedback.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from "vitest";
import { GET } from "@/app/api/internal-feedback/route";
import { createRequest } from "@/__tests__/helpers/request";
import { mockSession } from "@/__tests__/helpers/auth-mock";
import { prisma, _clearUserActiveCache } from "@/__tests__/helpers/prisma-mock";

describe("GET /api/internal-feedback — role enforcement", () => {
  beforeEach(() => {
    _clearUserActiveCache();
    vi.clearAllMocks();
    prisma.internalFeedback.findMany.mockResolvedValue([]);
  });

  it.each([
    ["owner", 200],
    ["head_office", 200],
    ["admin", 200],
    ["coordinator", 403],
    ["member", 403],
    ["staff", 403],
    ["marketing", 403],
  ])("returns %s for role %s", async (role, expected) => {
    mockSession({ id: "u1", role });
    prisma.user.findUnique.mockResolvedValue({ id: "u1", active: true, role });

    const req = createRequest("GET", "/api/internal-feedback");
    const res = await GET(req);
    expect(res.status).toBe(expected);
  });
});
```

- [ ] **Step 2: Run test, confirm non-admin roles currently return 200 (bug)**

Run: `npx vitest run src/__tests__/api/internal-feedback.test.ts`
Expected: the coordinator/member/staff/marketing cases FAIL (returning 200 instead of 403).

- [ ] **Step 3: Fix the GET wrapper**

Edit `src/app/api/internal-feedback/route.ts:13-31`. Change:

```typescript
export const GET = withApiAuth(async (req, session) => {
  // ... existing body ...
  return NextResponse.json({ feedback });
});
```

to:

```typescript
export const GET = withApiAuth(async (req, session) => {
  // ... existing body ...
  return NextResponse.json({ feedback });
}, { roles: ["owner", "head_office", "admin"] });
```

- [ ] **Step 4: Re-run test, confirm passing**

Run: `npx vitest run src/__tests__/api/internal-feedback.test.ts`
Expected: all 7 role cases pass.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/internal-feedback/route.ts src/__tests__/api/internal-feedback.test.ts
git commit -m "fix(bug-14): enforce admin-only role on GET /api/internal-feedback

Route comment claimed 'admin+ only' but withApiAuth was called without
the roles option, so any authenticated user could list all internal
feedback. Add { roles: [owner, head_office, admin] }.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Chunk 3: Known-cause client fixes (Bugs #2, #7, #8, #12)

### Task 3.1 — Bug #2: Recruitment New Vacancy d.map crash

**Root cause:** `src/components/recruitment/NewVacancyModal.tsx:24-31`. The query fallback is `return d.services || d;`. `/api/services` paginated path returns `{ items, total, page, ... }` (confirmed at `src/app/api/services/route.ts:64`). `d.services` is undefined, so it falls back to `d` (which has no `.map`). Then line 78 calls `services.map(...)` → crash.

**Fix:** Defensive array parse that tolerates `items`, `services`, or raw arrays.

**Files:**
- Modify: `src/components/recruitment/NewVacancyModal.tsx`
- Test: `src/__tests__/components/recruitment/NewVacancyModal.test.tsx` (create)

- [ ] **Step 1: Write failing component test**

Create the file with:

```typescript
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NewVacancyModal } from "@/components/recruitment/NewVacancyModal";

const wrapper = ({ children }: { children: React.ReactNode }) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
};

describe("NewVacancyModal services list parsing", () => {
  it("renders without crashing when /api/services returns paginated { items } shape", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        items: [{ id: "svc1", name: "Bankstown" }, { id: "svc2", name: "Liverpool" }],
        total: 2,
        page: 1,
      }),
    }) as unknown as typeof fetch;

    render(<NewVacancyModal onClose={vi.fn()} onCreated={vi.fn()} />, { wrapper });

    await waitFor(() => {
      expect(screen.getByText("Bankstown")).toBeInTheDocument();
      expect(screen.getByText("Liverpool")).toBeInTheDocument();
    });
  });

  it("renders without crashing when /api/services returns raw array", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ id: "svc1", name: "Bankstown" }],
    }) as unknown as typeof fetch;

    render(<NewVacancyModal onClose={vi.fn()} onCreated={vi.fn()} />, { wrapper });

    await waitFor(() => {
      expect(screen.getByText("Bankstown")).toBeInTheDocument();
    });
  });
});
```

- [ ] **Step 2: Run test, confirm failure**

Run: `npx vitest run src/__tests__/components/recruitment/NewVacancyModal.test.tsx`
Expected: the "paginated { items }" case fails because `services.map` throws.

- [ ] **Step 3: Apply the defensive parse fix**

Edit `src/components/recruitment/NewVacancyModal.tsx` lines 24-32:

```typescript
const { data: services = [] } = useQuery<Array<{ id: string; name: string }>>({
  queryKey: ["services-list-recruitment"],
  queryFn: async () => {
    const res = await fetch("/api/services?limit=100");
    if (!res.ok) return [];
    const d = await res.json();
    if (Array.isArray(d)) return d;
    if (Array.isArray(d.items)) return d.items;
    if (Array.isArray(d.services)) return d.services;
    return [];
  },
  retry: 2,
  staleTime: 30_000,
});
```

(Also adds the missing `retry: 2` + `staleTime` per convention.)

- [ ] **Step 4: Re-run test, confirm passing**

Run: `npx vitest run src/__tests__/components/recruitment/NewVacancyModal.test.tsx`
Expected: both tests PASS.

- [ ] **Step 5: Browser verification**

Start dev server (`npm run dev`). Open `/recruitment` as admin, click "New Vacancy". Confirm the centre dropdown lists services.

- [ ] **Step 6: Commit**

```bash
git add src/components/recruitment/NewVacancyModal.tsx src/__tests__/components/recruitment/NewVacancyModal.test.tsx
git commit -m "fix(bug-2): defensive parse for /api/services response in NewVacancyModal

/api/services paginated path returns { items, total, page }, not
{ services }. Previous fallback 'return d.services || d' yielded an
object, not an array, causing 'd.map is not a function' when the
<select> tried to render options. Accept raw arrays, { items }, and
{ services }; add retry and staleTime per convention.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 3.2 — Bug #7: Weekly Pulse one-character-at-a-time

**Root cause:** `src/components/communication/WeeklyPulseTab.tsx:79-112`. `usePulses()` refetches and returns a new `myPulses` object reference on re-render. A `useEffect` with `[myPulse, myPulses, weekOf]` deps runs on every refetch, resetting `wins`/`priorities`/`blockers` textarea state. The keystroke fires a refetch → effect fires → state reset → input loses focus. The existing `loadedWeekRef` guards only `weekOf` change, not same-week refetch.

**Fix:** Prevent refetch on the current-week query, and only reset local form state when the underlying pulse **identity** changes (by `id`), not object reference.

**Files:**
- Modify: `src/components/communication/WeeklyPulseTab.tsx`
- Modify: `src/hooks/useCommunication.ts` (lines 237-351, `usePulses`)
- Test: `src/__tests__/components/WeeklyPulseTab.test.tsx` (create)

- [ ] **Step 1: Read the existing hook and component**

Run: `cat src/hooks/useCommunication.ts | head -80` and find `usePulses`. Confirm the current query options.

- [ ] **Step 2: Write failing test — type a 50-char string and verify it persists**

Create `src/__tests__/components/WeeklyPulseTab.test.tsx`. Read `WeeklyPulseTab.tsx` first to see whether the Wins textarea has a `<label htmlFor>` or just a visual heading — if no label/heading association, use a more resilient locator (by placeholder, `data-testid`, or `textarea` role with a `name`):

```typescript
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WeeklyPulseTab } from "@/components/communication/WeeklyPulseTab";

const wrapper = ({ children }: { children: React.ReactNode }) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
};

describe("WeeklyPulseTab rapid typing", () => {
  it("retains the full string after typing 50 characters one key at a time", async () => {
    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes("/pulse")) {
        return { ok: true, json: async () => ({ pulses: [], myPulse: null }) };
      }
      return { ok: true, json: async () => ({}) };
    }) as unknown as typeof fetch;

    const user = userEvent.setup();
    render(<WeeklyPulseTab />, { wrapper });

    // Resilient locator — adapt based on actual component markup.
    // Fallback order: getByPlaceholderText → getByRole("textbox", {name}) → container.querySelector
    const textarea = await waitFor(() =>
      screen.getByPlaceholderText(/wins|what went well/i) as HTMLTextAreaElement
    );
    const target = "This is a 50 character wins entry for test coverage!";
    await user.type(textarea, target);

    // userEvent.type fires one keypress per char — this is the real-world repro
    expect(textarea.value).toBe(target);
  });
});
```

- [ ] **Step 3: Run test, confirm failure (or observe flaky behavior)**

Run: `npx vitest run src/__tests__/components/WeeklyPulseTab.test.tsx`
Expected: may pass in the test env because React Testing Library's `fireEvent.change` dispatches a single event. If the test passes on current code, we need a **closer-to-real-world** test — use `userEvent.type()` which fires one event per char:

```typescript
import userEvent from "@testing-library/user-event";
// in the test:
const user = userEvent.setup();
await user.type(textarea, target);
```

Re-run. Now it should fail on the broken code.

- [ ] **Step 4: Apply fix to `usePulses` hook**

Edit `src/hooks/useCommunication.ts` around lines 237-351. Find the `useQuery` for weekly pulses. Add `staleTime: Infinity` and `refetchOnWindowFocus: false`:

```typescript
export function usePulses(weekOf: string, userId?: string) {
  return useQuery({
    queryKey: ["pulses", weekOf, userId],
    queryFn: async () => {
      /* existing fetch */
    },
    retry: 2,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
}
```

This prevents background refetches during typing.

- [ ] **Step 5: Apply fix to WeeklyPulseTab effect**

Edit `src/components/communication/WeeklyPulseTab.tsx:85-112`. Change the effect so it only resets state when `myPulse?.id` changes, not when the object ref changes:

```typescript
const loadedPulseIdRef = useRef<string | null>(null);

useEffect(() => {
  const currentId = myPulse?.id ?? null;
  if (loadedPulseIdRef.current === currentId) return;
  loadedPulseIdRef.current = currentId;

  setWins(myPulse?.wins ?? "");
  setPriorities(myPulse?.priorities ?? "");
  setBlockers(myPulse?.blockers ?? "");
  setNotes(myPulse?.notes ?? "");
  setMood(myPulse?.mood ?? null);
}, [myPulse?.id]);
```

Also invalidate the query manually on submit (inside `submitPulse.onSuccess`) so the state stays fresh after an explicit save. If `submitPulse` doesn't already use `useQueryClient`, add it at the top of the hook where the mutation is defined:

```typescript
// at top of the mutation hook
const queryClient = useQueryClient();

// inside the useMutation config
onSuccess: () => {
  queryClient.invalidateQueries({ queryKey: ["pulses"] });
},
```

TanStack's partial-key invalidation: `["pulses"]` matches any query whose key starts with `"pulses"`, so the full-key `["pulses", weekOf, userId]` will invalidate correctly.

- [ ] **Step 6: Re-run test, confirm passing**

Run: `npx vitest run src/__tests__/components/WeeklyPulseTab.test.tsx`
Expected: PASS.

- [ ] **Step 7: Browser verification**

Start dev server. Open `/communication` as a staff user, switch to Weekly Pulse tab. Type a full sentence rapidly in the Wins box. Confirm it doesn't lose characters or focus.

- [ ] **Step 8: Commit**

```bash
git add src/components/communication/WeeklyPulseTab.tsx src/hooks/useCommunication.ts src/__tests__/components/WeeklyPulseTab.test.tsx
git commit -m "fix(bug-7): stabilise Weekly Pulse query to prevent state reset mid-typing

usePulses refetched on every render cycle, returning a new myPulses
object ref. The load effect depended on the ref and reset form state
between keystrokes, causing input focus loss and one-char-at-a-time
behavior. Switch query to staleTime: Infinity + refetchOnWindowFocus:
false; compare pulse identity by id, not ref, in the load effect;
invalidate manually after submit.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 3.3 — Bug #8: Communication editor same pattern

**Root cause:** User reports the one-char-at-a-time behavior also occurs in the broader Communication UI (broadcasting / messaging). Likely another controlled editor subject to the same query/effect pattern.

**Fix:** Locate the second editor, apply the same stabilisation (id-based reset + `staleTime: Infinity` on its backing query).

**Files:**
- TBD — identify in Step 1.
- Test: TBD in same pattern as #7.

- [ ] **Step 1: Locate the second editor**

Run (broaden to all comms-related directories — two of these may not exist, which is fine):
```bash
rg -i "useEffect.*set(Message|Body|Content|Text|Draft)" \
  src/components/communication \
  src/components/messaging \
  src/components/broadcast \
  src/components/email \
  src/app/\(dashboard\)/messaging \
  -l 2>/dev/null
```

Read each candidate file. The target pattern: a controlled `<textarea>` (or rich-text editor) whose parent component calls `useQuery`, and has a `useEffect` that resets the editor state when a server value changes. That's the same bug as #7.

- [ ] **Step 2: Write failing test (same shape as #7)**

Using the WeeklyPulseTab test as a template, write an analogous test for the identified editor.

- [ ] **Step 3: Apply the same fix pattern**

- Add `staleTime: Infinity` + `refetchOnWindowFocus: false` to the backing query
- Replace object-ref deps with id-based deps in the reset effect

- [ ] **Step 4: Run test, confirm passing**

- [ ] **Step 5: Browser verification**

Type a full sentence rapidly in the affected Communication editor; confirm no lost characters or focus.

- [ ] **Step 6: Commit**

```bash
git add <files>
git commit -m "fix(bug-8): apply bug-7 stabilisation pattern to <editor-name> editor

Same root cause as bug-7 — controlled editor reset on every query
refetch because its reset effect depended on an object ref. Apply the
same fix: staleTime Infinity on the backing query and id-based deps
in the reset effect.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 3.4 — Bug #12: LMS completion tick not updating

**Root cause:** When a staff completes an LMS course/module on the staff portal, the mutation fires but the course list isn't invalidated — the green "completed" tick doesn't appear until a page refresh.

**Fix:** Add `queryClient.invalidateQueries({ queryKey: [<lms key>] })` in the `onSuccess` of the completion mutation.

**Files:**
- Modify: `src/hooks/useLMS.ts` (locate the `markComplete` mutation)
- Modify: related staff portal LMS component if the mutation is inlined there
- Test: `src/__tests__/hooks/useLMS.test.tsx` (create or extend)

- [ ] **Step 1: Locate the completion mutation and record the real hook name**

Run: `rg -i "markComplete|completeModule|completeCourse|useLMS.*mutation|lms.*complete" src/hooks src/components -l`

Read the hits. Record the actual exported hook name (e.g. `useCompleteLmsModule`, `useMarkCourseComplete`) — the test in Step 3 references this name, so resolve it before moving on. Also note the list-query key currently used by the LMS list view (for the `invalidateQueries` call in Step 5).

- [ ] **Step 2: Read the current `onSuccess` handling**

Check whether invalidation exists for any list query. Note what query keys the list view uses (e.g., `["lms", "courses"]`, `["lms", "my-enrollments"]`, etc.).

- [ ] **Step 3: Write failing test**

Template:

```typescript
import { describe, it, expect, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useLMSMarkComplete /* actual hook name */ } from "@/hooks/useLMS";

describe("useLMSMarkComplete — invalidates list on success", () => {
  it("invalidates course list query after completion", async () => {
    const qc = new QueryClient();
    const invalidateSpy = vi.spyOn(qc, "invalidateQueries");

    global.fetch = vi.fn().mockResolvedValue({
      ok: true, json: async () => ({ enrollment: { id: "e1", completedAt: new Date() } })
    }) as unknown as typeof fetch;

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => useLMSMarkComplete(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ moduleId: "m1" });
    });

    await waitFor(() => expect(invalidateSpy).toHaveBeenCalled());
  });
});
```

- [ ] **Step 4: Run test, confirm failure**

Run: `npx vitest run src/__tests__/hooks/useLMS.test.tsx`
Expected: FAIL — `invalidateQueries` never called.

- [ ] **Step 5: Apply fix**

In the identified mutation:

```typescript
const queryClient = useQueryClient();
return useMutation({
  mutationFn: async (vars) => { /* existing */ },
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ["lms"] }); // adjust to real key
  },
  onError: (err: Error) => {
    toast({ variant: "destructive", description: err.message || "Failed to mark complete" });
  },
});
```

(Also adds the missing `onError` if not present — per convention.)

- [ ] **Step 6: Re-run test, confirm passing**

- [ ] **Step 7: Browser verification**

Log in as a staff user. Complete a course. Confirm the green tick appears without a page reload.

- [ ] **Step 8: Commit**

```bash
git add src/hooks/useLMS.ts <any component touched> src/__tests__/hooks/useLMS.test.tsx
git commit -m "fix(bug-12): invalidate LMS list on course completion

Completion mutation didn't invalidate the course-list query, so the
completed-tick wouldn't appear until manual refresh. Add
queryClient.invalidateQueries in onSuccess, plus destructive onError
toast per convention.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Chunk 4: Live-diagnosis bugs (#11, #13, #5, #4, #6, #9, #10)

Each bug in this chunk starts with a **reproduce** step. Use `preview_*` tools (from the preview_tools system: `preview_start`, `preview_snapshot`, `preview_click`, `preview_fill`, `preview_console_logs`, `preview_network`) to drive the dev server, not Claude-in-Chrome MCP, per the platform's tooling guide.

Workflow for every bug in this chunk:

1. `preview_start` if not running
2. Navigate to the affected page; reproduce the bug
3. Capture console + network via `preview_console_logs` / `preview_network` / `preview_snapshot` / `preview_inspect` / `preview_eval`
4. Read source code along the trace (component → hook → API route) via the Read / Grep tools (not `cat`)
5. Form a root cause hypothesis
6. Write a failing regression test
7. Apply the fix
8. Verify the test passes and the browser reproduction is gone
9. Commit

For inspecting database rows while diagnosing, use `tsx` for one-off scripts (this repo uses tsx, not ts-node) or `npx prisma studio`.

### Task 4.1 — Bug #11: Postcode 3-char limit on parent form

- [ ] **Step 1: Reproduce in browser**

Start preview. Parent portal uses magic-link auth (not password) — there is no shared parent password. To test, either:
  a) Use admin UI to trigger a real magic link for a known parent email and follow it, OR
  b) Insert a `ParentMagicLink` row directly with a known `token` and open `/parent/login?token=<x>`, OR
  c) Use an existing seeded parent if one is present (check `ParentUser` table via `npx prisma studio`).

Then try entering "2144" in the postcode on each of:
  1. `/enrol/<token>` — create a test enrolment link first via admin UI (or insert directly)
  2. `/parent/children/new`
  3. `/parent/account`

Note which screen shows the 3-char limit. Take a `preview_snapshot` of the broken input.

- [ ] **Step 2: Capture the DOM state**

Use `preview_inspect` on the postcode input to get its computed attributes (`maxLength`, `size`, any CSS clipping).

- [ ] **Step 3: Read the component source for that specific form**

Use `preview_eval` or Grep to find the input's file. Read it.

- [ ] **Step 4: Form a root cause hypothesis**

Possible causes to check in order:
  a. HTML `maxLength={3}` attribute (unlikely — grep found none)
  b. CSS `max-width` that visually clips
  c. Controlled `onChange` that slices to 3 inadvertently
  d. `value` prop derives from a state that's truncated
  e. React strict-mode double-effect resetting the 4th char

- [ ] **Step 5: Write regression test** (against the identified form)

- [ ] **Step 6: Apply the fix**

- [ ] **Step 7: Re-verify in browser**

Confirm entering 2144 keeps all four digits.

- [ ] **Step 8: Commit**

```bash
git commit -m "fix(bug-11): allow 4-digit postcode on <form-name>

<one-line root cause>. <one-line fix>.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

If the bug turns out not to exist after live repro, document that in the PR description and skip the commit — acceptance criteria explicitly allow this.

---

### Task 4.2 — Bug #13: Issues "Show Closed" toggle

- [ ] **Step 1: Reproduce**

Log in as admin. Navigate to `/issues`. Confirm there's at least one issue with `status: "closed"` in the data — if not, change one via API or admin UI. Click "Show Closed" toggle and verify: does the closed issue appear?

- [ ] **Step 2: Read the issue hook**

Read `src/hooks/useIssues.ts` (use the Read tool, not `cat`). Check the query key + options. Likely candidates:
- The hook passes a `status` filter that never includes "closed"
- The board view ([issues/page.tsx:92-100](../../src/app/(dashboard)/issues/page.tsx:92)) does render a `closed` column but may be empty because the hook filter excluded closed issues server-side
- The list view may apply a second filter after `filteredIssues`

- [ ] **Step 3: Form hypothesis + write regression test**

If the bug is client-side: component test rendering with a mocked `useIssues` that returns a closed issue.
If the bug is server-side: API test confirming `/api/issues` returns closed issues when called with no filter.

- [ ] **Step 4: Fix**

- [ ] **Step 5: Re-verify in browser**

- [ ] **Step 6: Commit**

```bash
git commit -m "fix(bug-13): show closed issues when 'Show Closed' is toggled on

<one-line root cause>. <one-line fix>.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 4.3 — Bug #5: Documents open returns FORBIDDEN

- [ ] **Step 1: Reproduce as a non-admin role**

Log in as a `coordinator` or `member`. Navigate to `/documents`. Click to open a document that should be visible to that role. Capture the 403 response with `preview_network`.

- [ ] **Step 2: Read the auth path**

Read `src/app/api/documents/[id]/route.ts` (GET) and `src/app/api/documents/download/route.ts`. Note the role check and any service-scope or ownership check.

- [ ] **Step 3: Cross-check against the document record**

Via `npx prisma studio` (or a one-off `tsx` script — this repo uses tsx, not ts-node), read the document's `serviceId`, visibility flags, and uploader. Compare against the session user's role + service.

- [ ] **Step 4: Identify the rejecting check**

It will be one of:
- Role list too narrow
- `serviceId` scope mismatch (user's service not in the doc's scope)
- Ownership check requiring the uploader
- Signed-URL generation rejecting something upstream

- [ ] **Step 5: Write role/scope matrix regression test**

For each role × each visibility setting, assert the correct 200/403 status.

- [ ] **Step 6: Fix the over-strict check; do NOT broaden auth beyond intent**

- [ ] **Step 7: Re-run test, verify in browser**

- [ ] **Step 8: Commit**

```bash
git commit -m "fix(bug-5): allow <role> to open documents within their service scope

<one-line root cause>. <one-line fix>.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 4.4 — Bug #4: Documents PDF upload failing

- [ ] **Step 1: Reproduce the upload**

Log in as admin, navigate to `/documents`. Click "Upload" (or equivalent), select a small PDF (<1 MB). Capture the network + console via `preview_network` + `preview_console_logs`.

- [ ] **Step 2: Classify the failure**

- Is it a client-side MIME/size rejection (no request sent)?
- A 400 from the API (invalid payload)?
- A 500 from the Blob upload (storage config)?
- A 413 (size)?

- [ ] **Step 3: Read the upload pipeline**

Files likely involved:
- `src/app/(dashboard)/documents/page.tsx` — form handler
- A client hook / mutation in `src/hooks/useDocuments.ts`
- `src/app/api/documents/route.ts` — POST handler
- `src/lib/storage.ts` — Blob upload helper

Trace the chain.

- [ ] **Step 4: Fix the first broken link**

- [ ] **Step 5: Write regression test**

- API: a POST with a valid multipart / FormData PDF returns 201
- Component: the upload form accepts `application/pdf`

- [ ] **Step 6: Re-verify in browser**

- [ ] **Step 7: Commit**

```bash
git commit -m "fix(bug-4): allow PDF upload through document form

<one-line root cause>. <one-line fix>.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 4.5 — Bug #6: Training module not opening

- [ ] **Step 1: Reproduce**

Log in as a staff user. Navigate to Training / LMS (likely under `src/app/(dashboard)/training/...` or `src/app/(dashboard)/lms/...` — grep for `useLMS` to find the parent page). Click on a course/module. Capture the click behavior: does the URL change? Does a page render? Is there a console error?

- [ ] **Step 2: Classify**

- No route exists → href points nowhere
- Route exists but errors on render → read the page component
- Route exists and renders blank → missing data fetch
- Click handler prevents default and does nothing → JS bug

- [ ] **Step 3: Trace the link**

Find the component rendering the clickable module item. Inspect its `href` or `onClick`. Follow to the route.

- [ ] **Step 4: Fix**

Fix the wiring. If the module detail route genuinely doesn't exist, stub a minimal "Module: {title}" page that uses `useLMS` data — NOT a full LMS rebuild (that's Sub-project 5). Scope note: this is the minimal fix to make the click work today.

**Role-permissions gotcha:** if you add a NEW route (e.g. `/lms/modules/[id]`), also add it to `src/lib/role-permissions.ts` (`allPages` plus each role's `rolePageAccess` list that should see it). This is the one failure mode that has bitten this project before (see `MEMORY.md` / commit `cc0ad93`).

- [ ] **Step 5: Write regression test**

Component or E2E: click a module, assert the module page renders.

- [ ] **Step 6: Re-verify**

- [ ] **Step 7: Commit**

```bash
git commit -m "fix(bug-6): open module detail when clicked from LMS list

<one-line root cause>. <one-line fix>.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 4.6 — Bug #9: Enrolment glitch on child select

- [ ] **Step 1: Reproduce**

Admin → `/enrolments` (or `/enquiries`). Open an enrolment with multiple children. Click between children. Capture the glitch (snapshot + console).

- [ ] **Step 2: Identify the broken surface**

Is the glitch a layout flicker, a state reset, an infinite render, or a focus trap?

- [ ] **Step 3: Trace the selection state**

Start from `src/app/(dashboard)/enrolments/*` or `src/components/enrolments/*` (grep for `selectedChild`, `currentChildId`, or the multi-child switcher). Look for a state like `selectedChildId` and the effect that syncs form state when it changes.

- [ ] **Step 4: Fix**

Common causes:
- Controlled form deriving `value` from `currentChild?.foo` without defaulting
- Effect dep on child object ref instead of `child.id`
- Keyed children list missing `key`, causing full remount

- [ ] **Step 5: Regression test**

Component test: render with 2 children, click between them 3 times, assert no console errors and stable form values.

- [ ] **Step 6: Re-verify**

- [ ] **Step 7: Commit**

```bash
git commit -m "fix(bug-9): stable child switching in enrolment editor

<one-line root cause>. <one-line fix>.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 4.7 — Bug #10: Projects New / Template glitch forcing app restart

- [ ] **Step 1: Reproduce**

Admin → `/projects`. Click "New Project". Capture the glitch. Repeat for "Launch from Template".

- [ ] **Step 2: Wrap in an error boundary first**

If the glitch forces app restart, there's an unhandled exception. Add a temporary error boundary in `src/app/(dashboard)/projects/page.tsx` wrapping the `<NewProjectModal>` (or equivalent) invocation. Log the captured error via the existing structured logger so the error surfaces in the dev console and browser. Then proceed with the real fix. Remove the boundary at the end (or keep it if the component is complex enough to warrant permanent defensive wrapping — developer's call).

- [ ] **Step 3: Root cause**

Look for:
- `setState` during render
- Unstable dependency causing mount loop
- A query without `retry: 2` + `staleTime` that triggers an error boundary when an API fails

- [ ] **Step 4: Fix**

Remove the temporary error boundary (or keep it if it protects against similar classes of bug — developer's call). Fix the real cause.

- [ ] **Step 5: Regression test**

Component test: render the new-project modal, assert no error thrown, close it, reopen 5× without error.

- [ ] **Step 6: Re-verify**

- [ ] **Step 7: Commit**

```bash
git commit -m "fix(bug-10): open New Project and Template modals without forcing reload

<one-line root cause>. <one-line fix>.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Chunk 5: Final verification + PR

### Task 5.1 — Full sweep

- [ ] **Step 1: Build**

Run: `npm run build`
Expected: exit 0, no type errors introduced by this branch (pre-existing errors tracked as Sub-project 2 are acceptable).

- [ ] **Step 2: TypeScript check**

Run: `npx tsc --noEmit 2>&1 | tee /tmp/tsc-output.txt; wc -l /tmp/tsc-output.txt`
Expected: line count equal to or LOWER than the baseline captured in Chunk 1 Step 4. If higher, inspect the new errors — they're likely real issues exposed by removing `as any` casts, and should be addressed.

- [ ] **Step 3: Test**

Run: `npm test -- --run`
Expected: all tests pass. Any pre-existing failures must match the baseline from Chunk 1 Step 4.

- [ ] **Step 4: Lint**

Run: `npm run lint`
Expected: no new lint errors.

- [ ] **Step 5: Role-permissions audit (per CLAUDE.md memory note)**

Run: `git diff main...HEAD -- src/lib/nav-config.ts src/lib/role-permissions.ts`
Expected: no diff, UNLESS Bug #6 (LMS module route) required stubbing a new route — in which case a small diff adding that route to `allPages` + appropriate role lists is correct and intended. Confirm via reading the diff.

- [ ] **Step 6: Grep audit — no new `as any` introduced**

Use the Grep tool against the working tree with pattern `as any` across `src/**/*.ts{,x}` (optionally narrow to files changed in this branch via `git diff --name-only main...HEAD`). Cross-reference: we should have REMOVED `as any` casts from timesheets routes; we must not have ADDED any new ones.

- [ ] **Step 7: Grep audit — no new raw console logs in production code**

Use Grep: pattern `console\.(log|warn|error)`, path `src`, exclude test files. Compare hits against the main branch: any new hits are a regression.

- [ ] **Step 8: Live-preview sweep — confirm every UI-observable fix**

Start the dev server. For each UI-observable bug that was fixed (all except #1, #3, #14), navigate to the affected screen and confirm the bug no longer reproduces. Take a `preview_screenshot` of each fixed surface and store under `/tmp/bug-N-after.png` for attaching to the PR description.

### Task 5.2 — Open the PR

- [ ] **Step 1: Push the branch**

Run: `git push -u origin fix/p0-bug-batch-2026-04-20`

- [ ] **Step 2: Open the PR via gh**

```bash
gh pr create --base main --title "fix: P0 bug batch — 15 user-reported bugs + Report Issue auth fix" --body "$(cat <<'EOF'
## Summary

Sub-project 1 of the April 20 dashboard bug-fix roadmap. Fixes 14 user-reported visible bugs plus 1 auth/security bug, each with a regression test.

See [spec](docs/superpowers/specs/2026-04-20-p0-bug-batch-design.md) and [plan](docs/superpowers/plans/2026-04-20-p0-bug-batch-plan.md) for context.

## Bug → commit map

| # | Bug | Commit |
|---|-----|--------|
| 1 | Contracts null Zod rejection | fix(bug-1): ... |
| 2 | Recruitment New Vacancy d.map crash | fix(bug-2): ... |
| 3 | Timesheets Internal Server Error | fix(bug-3): ... |
| 4 | Documents PDF upload fail | fix(bug-4): ... |
| 5 | Documents open FORBIDDEN | fix(bug-5): ... |
| 6 | Training module not opening | fix(bug-6): ... |
| 7 | Weekly Pulse one-char-at-a-time | fix(bug-7): ... |
| 8 | Communication editor one-char-at-a-time | fix(bug-8): ... |
| 9 | Enrolment glitch on child select | fix(bug-9): ... |
| 10 | Projects New/Template glitch | fix(bug-10): ... |
| 11 | Postcode 3-char parent form | fix(bug-11): ... |
| 12 | LMS completion tick | fix(bug-12): ... |
| 13 | Issues Show Closed toggle | fix(bug-13): ... |
| 14 | Report Issue GET auth | fix(bug-14): ... |

(Any bug determined not to exist after live repro is noted with "not reproducible — documented in commit trailer" instead of a commit hash.)

## Test plan

- [x] `npm run build` clean
- [x] `npm test` clean
- [x] `npm run lint` clean
- [x] Role-permissions unchanged
- [x] No new `as any` casts introduced
- [ ] Manual smoke — open each fixed screen as admin + non-admin; confirm fixes + no adjacent-flow regressions
- [ ] Deploy preview verified (after PR opens)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: Return the PR URL to the user**

---

## Notes

- **When a bug turns out not to exist after live repro** (notably possible for #11): include a trailer in a single meta-commit saying "bug-N: not reproducible — <what I tried>" and skip the fix commit. Keep the count honest in the PR description.
- **Sub-project 2 dependencies spotted mid-work**: if you notice something that would be a Sub-project 2 hygiene fix (e.g. a raw `req.json()`) right next to a line you're already editing, fix it inline and mention in the commit trailer. Do NOT do standalone hygiene cleanup in this PR.
- **Role-permissions**: no new nav entries expected. If a fix (e.g. #6 LMS module route) requires stubbing a new route, also add it to `src/lib/role-permissions.ts` per `MEMORY.md` — this is the one gotcha that has bitten this project before.
