# Scorecard + Contact Centre + Leadership Team Centre + Pulse Admin Visibility — Implementation Plan

> **For agentic workers:** REQUIRED: Use `superpowers:subagent-driven-development` (if subagents available) or `superpowers:executing-plans` to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship 7 stacked commits that close visibility gaps for leaders/admins: a new `/leadership` landing page, org-wide scorecard rollup + historical trend charts, a coordinator leaderboard tab on `/contact-centre`, anonymous admin-tier pulse drill-down, and a 5th "pulse responses awaiting review" card on the Team Action Required widget — all without breaking 1298 tests, with zero schema changes.

**Architecture:** Feature branch `feat/scorecard-pulse-admin-2026-04-22` off local `main` (which already has the spec + this plan on top of `origin/main` at `38fd0b2`). Commits stacked dependency-first: leadership API → leadership page → scorecard rollup → trend charts → leaderboard → pulse admin view → team widget. Pure aggregation across existing Prisma models (`Rock`, `Measurable`, `MeasurableEntry`, `SupportTicket`, `ParentEnquiry`, `WeeklyPulse`, `User`, `Service`, `Issue`) — no new models, no migrations, revert-safe per commit. Standard merge (not squash) to preserve bisect history. Parallel with #5 and #7 — rebase before merge.

**Tech Stack:** Next.js 16 (App Router, `"use client"` for pages), TypeScript, Prisma 5.22, Vitest, Tailwind, recharts (already a dep), `@tanstack/react-query`. Conventions from Sub-projects 2 + 3a + 3b: `withApiAuth` (rate-limited, auth-logged) / `fetchApi` / `mutateApi` / `ApiError` / `parseJsonBody` / `ADMIN_ROLES` / `isAdminRole` / `parseRole` / `toast` from `@/hooks/useToast` / primitive-spread query keys / `PageHeader` / `EmptyState` / `ErrorState` / `Skeleton` / `ChartCard` + `CHART_COLORS`.

**Parent spec:** [`docs/superpowers/specs/2026-04-22-scorecard-pulse-admin-design.md`](../specs/2026-04-22-scorecard-pulse-admin-design.md)

**Parallel execution notice:** Sub-projects #5 and #7 run concurrently. Expected rebase hotspots on this branch:
- `src/lib/role-permissions.ts` — one-line `/leadership` addition in `allPages` (trivial)
- `src/lib/nav-config.ts` — one Leadership nav item (trivial)
- `src/components/team/ActionRequiredWidget.tsx` + `src/app/api/team/action-counts/route.ts` — fifth card + counter (unlikely overlap but possible)
No schema conflicts (zero schema changes).

---

## File Structure Overview

| Commit | Subject | Files created | Files modified |
|---|---|---|---|
| 1 | `feat(api): /api/leadership/overview — org-wide KPI aggregator` | `src/app/api/leadership/overview/route.ts`, `src/__tests__/api/leadership-overview.test.ts` | (none) |
| 2 | `feat(leadership): /leadership landing page + role-permissions registration` | `src/app/(dashboard)/leadership/page.tsx`, `src/app/(dashboard)/leadership/loading.tsx`, `src/hooks/useLeadership.ts`, `src/__tests__/hooks/useLeadership.test.tsx` | `src/lib/role-permissions.ts` (+`/leadership` in allPages), `src/lib/nav-config.ts` (+Leadership nav entry) |
| 3 | `feat(scorecard): org-wide rollup view across services` | `src/app/api/scorecard/rollup/route.ts`, `src/components/scorecard/ScorecardRollupView.tsx`, `src/hooks/useScorecardRollup.ts`, `src/__tests__/api/scorecard-rollup.test.ts` | `src/app/(dashboard)/scorecard/page.tsx` (+Rollup tab, admin-only) |
| 4 | `feat(scorecard): historical trend charts per measurable` | `src/app/api/measurables/[id]/history/route.ts`, `src/components/scorecard/MeasurableTrendDrawer.tsx`, `src/hooks/useMeasurableHistory.ts`, `src/__tests__/api/measurable-history.test.ts` | `src/components/scorecard/ScorecardGrid.tsx` (clickable title opens drawer) |
| 5 | `feat(contact-centre): coordinator leaderboard tab` | `src/app/api/contact-centre/leaderboard/route.ts`, `src/components/contact-centre/LeaderboardContent.tsx`, `src/hooks/useLeaderboard.ts`, `src/__tests__/api/contact-centre-leaderboard.test.ts` | `src/app/(dashboard)/contact-centre/page.tsx` (+Leaderboard tab, admin-only), `src/app/(dashboard)/leadership/page.tsx` (embed inline leaderboard section) |
| 6 | `feat(pulse): admin-tier visibility + per-service drill-down` | `src/app/api/communication/pulse/admin-summary/route.ts`, `src/components/communication/PulseAdminView.tsx`, `src/__tests__/api/pulse-admin-summary.test.ts` | `src/components/communication/WeeklyPulseTab.tsx` (add "All Services" view for admin tier; extend `isLeader` to include `head_office` for consistency with `ADMIN_ROLES`), `src/hooks/useCommunication.ts` (+`usePulseAdminSummary`) |
| 7 | `feat(team): extend Action Required widget with Pulse responses awaiting review card` | (none) | `src/app/api/team/action-counts/route.ts` (+`pulsesConcerning` counter, admin-tier only), `src/components/team/ActionRequiredWidget.tsx` (+5th card, grid grows to 5 cols), `src/__tests__/api/team-action-counts.test.ts` (extend existing file — it's already present) |

No Prisma migrations. No schema changes. 1298 tests baseline → target ~1340+ (approx. 40+ new tests across 5 API test files + 1 hook test file).

---

## Chunk 1: Setup & Baseline

### Task 1.1: Fetch, create worktree, install deps

- [ ] **Step 1: Fetch + confirm origin/main is at a known commit**

Run:
```bash
git fetch origin
git log origin/main --oneline -1
```
Expected: `38fd0b2 Merge pull request #13 from buildalpha98-del/feat/staff-rostering-3b-2026-04-21` or later if #5 or #7 has merged. Note the SHA for rebase-later reference. Any divergence affecting `src/lib/role-permissions.ts`, `src/lib/nav-config.ts`, `src/components/team/ActionRequiredWidget.tsx`, or `src/app/api/team/action-counts/route.ts` is expected — we'll rebase at the end.

- [ ] **Step 2: Confirm local main clean + docs-only commits ahead**

```bash
git status
git log origin/main..main --oneline
```
Expected: clean working tree; 2 docs commits ahead (spec + this plan). If uncommitted changes exist, stash or surface before starting.

- [ ] **Step 3: Create worktree off local main**

```bash
git worktree add -b feat/scorecard-pulse-admin-2026-04-22 .worktrees/scorecard-pulse-admin main
```
Expected: new worktree at `.worktrees/scorecard-pulse-admin/` on new branch tracking local main HEAD (includes spec + plan docs). Confirm with `git -C .worktrees/scorecard-pulse-admin branch --show-current`.

- [ ] **Step 4: Switch into worktree + install**

```bash
cd .worktrees/scorecard-pulse-admin
npm ci
npx prisma generate
```
Expected: `npm ci` completes without errors; `prisma generate` prints `✔ Generated Prisma Client`. All further commands in this plan run from inside the worktree — NEVER run them in the main checkout.

### Task 1.2: Baseline metrics

- [ ] **Step 1: Record baseline gate**

Run from inside the worktree:
```bash
npm test -- --run 2>&1 | tail -5
npx tsc --noEmit 2>&1 | grep -c "error TS"
npm run lint 2>&1 | tail -3
```
Expected output to capture to `/tmp/sub9-baseline.txt`:
- Vitest: `Test Files XX passed | YY total` with 1298 passing (exact count may be +/- a few if #5/#7 landed; record the actual number).
- TSC errors: `0`.
- ESLint: clean or pre-existing warnings only (count and compare after each commit).

Any deviation from 0 tsc errors blocks start. Test count becomes the "before" number for the PR body's `1298 → 1340+` comparison.

- [ ] **Step 2: Confirm docs already committed from main**

```bash
ls docs/superpowers/specs/2026-04-22-scorecard-pulse-admin-design.md
ls docs/superpowers/plans/2026-04-22-scorecard-pulse-admin-plan.md
```
Expected: both exist (they were committed on main before this worktree was created).

### Task 1.3: Test-file convention reminder

**Every new test file created in this plan MUST:**
1. Import `_clearUserActiveCache` from `@/lib/server-auth`
2. Call it in `beforeEach()` alongside `vi.clearAllMocks()` to prevent auth-cache pollution between tests
3. Also mock `@/lib/rate-limit` (`checkRateLimit` → `{ limited: false, remaining: 59, resetIn: 60000 }`) and `@/lib/logger` (to avoid cross-test log noise)

The existing test `src/__tests__/api/team-action-counts.test.ts` is the canonical template — mimic its imports/`beforeEach` exactly. Each code snippet in the chunks below has been written to include these, but confirm the imports and beforeEach block are present before you run the test.

Reference boilerplate (prepend to every new API test file in this plan):
```ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession, mockNoSession } from "../helpers/auth-mock";
import { createRequest } from "../helpers/request";

vi.mock("@/lib/service-scope", () => ({
  getServiceScope: vi.fn(() => null),
  getStateScope: vi.fn(() => null),
}));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() => Promise.resolve({ limited: false, remaining: 59, resetIn: 60000 })),
}));
vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(),
    withRequestId: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }) },
  generateRequestId: () => "test-req-id",
}));

import { _clearUserActiveCache } from "@/lib/server-auth";
// import { GET } from "@/app/api/..." — after the mocks

// In each describe:
beforeEach(() => {
  vi.clearAllMocks();
  _clearUserActiveCache();
  prismaMock.user.findUnique.mockResolvedValue({ active: true });
});
```

No git commits in Chunk 1.

---

## Chunk 2: Commit 1 — `feat(api): /api/leadership/overview`

**Goal:** Single aggregator endpoint returning org-wide KPIs consumed by the `/leadership` page. Admin-tier only (owner/head_office/admin).

**Files:**
- Create: `src/app/api/leadership/overview/route.ts`
- Create: `src/__tests__/api/leadership-overview.test.ts`

### Task 2.1: Write the API test first

- [ ] **Step 1: Scaffold the test file**

Create `src/__tests__/api/leadership-overview.test.ts`:
```ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession, mockNoSession } from "../helpers/auth-mock";
import { createRequest } from "../helpers/request";

vi.mock("@/lib/service-scope", () => ({
  getServiceScope: vi.fn(() => null),
  getStateScope: vi.fn(() => null),
}));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() => Promise.resolve({ limited: false, remaining: 59, resetIn: 60000 })),
}));
vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(),
    withRequestId: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }) },
  generateRequestId: () => "test-req-id",
}));

import { _clearUserActiveCache } from "@/lib/server-auth";
import { GET } from "@/app/api/leadership/overview/route";

describe("GET /api/leadership/overview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
  });

  it("returns 401 when unauthenticated", async () => {
    mockNoSession();
    const res = await GET(createRequest("GET", "/api/leadership/overview"));
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-admin roles", async () => {
    mockSession({ id: "u", name: "Staff", role: "staff" });
    const res = await GET(createRequest("GET", "/api/leadership/overview"));
    expect(res.status).toBe(403);
  });

  it("returns aggregated KPIs for owner", async () => {
    mockSession({ id: "u1", name: "Owner", role: "owner" });

    prismaMock.user.count.mockResolvedValue(42);
    prismaMock.service.count.mockResolvedValue(7);
    prismaMock.issue.count.mockResolvedValue(3);
    prismaMock.supportTicket.count.mockResolvedValue(12);
    // RockStatus enum: on_track | off_track | complete | dropped (no at_risk)
    prismaMock.rock.findMany.mockResolvedValue([
      { id: "r1", status: "on_track", serviceId: "s1", service: { id: "s1", name: "Centre A" } },
      { id: "r2", status: "off_track", serviceId: "s1", service: { id: "s1", name: "Centre A" } },
      { id: "r3", status: "complete", serviceId: "s2", service: { id: "s2", name: "Centre B" } },
      { id: "r4", status: "dropped", serviceId: null, service: null },
      { id: "r5", status: "on_track", serviceId: null, service: null },
    ]);
    prismaMock.weeklyPulse.findMany.mockResolvedValue([
      { weekOf: new Date("2026-04-06"), mood: 4 },
      { weekOf: new Date("2026-04-06"), mood: 5 },
      { weekOf: new Date("2026-04-13"), mood: 3 },
      { weekOf: new Date("2026-04-20"), mood: 4 },
    ]);

    const res = await GET(createRequest("GET", "/api/leadership/overview"));
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.staffCount).toBe(42);
    expect(body.serviceCount).toBe(7);
    expect(body.openIssueCount).toBe(3);
    expect(body.openTicketCount).toBe(12);

    expect(body.rocksRollup.total).toBe(5);
    expect(body.rocksRollup.onTrack).toBe(2);
    expect(body.rocksRollup.offTrack).toBe(1);
    expect(body.rocksRollup.complete).toBe(1);
    expect(body.rocksRollup.dropped).toBe(1);
    expect(body.rocksRollup.byService).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ serviceId: "s1", serviceName: "Centre A", total: 2, onTrack: 1 }),
        expect.objectContaining({ serviceId: "s2", serviceName: "Centre B", total: 1, onTrack: 0 }),
      ])
    );

    expect(Array.isArray(body.sentimentTrend)).toBe(true);
    expect(body.sentimentTrend.length).toBeGreaterThan(0);
    const wk1 = body.sentimentTrend.find((w: { weekOf: string }) => w.weekOf.startsWith("2026-04-06"));
    expect(wk1?.avgMood).toBe(4.5);

    // IssueStatus enum is open | in_discussion | solved | closed — verify "open" path
    const issueCall = prismaMock.issue.count.mock.calls[0][0];
    expect(issueCall.where.status.notIn).toEqual(["solved", "closed"]);
  });

  it("returns 200 for head_office and admin", async () => {
    for (const role of ["head_office", "admin"] as const) {
      vi.clearAllMocks();
      _clearUserActiveCache();
      prismaMock.user.findUnique.mockResolvedValue({ active: true });
      prismaMock.user.count.mockResolvedValue(0);
      prismaMock.service.count.mockResolvedValue(0);
      prismaMock.issue.count.mockResolvedValue(0);
      prismaMock.supportTicket.count.mockResolvedValue(0);
      prismaMock.rock.findMany.mockResolvedValue([]);
      prismaMock.weeklyPulse.findMany.mockResolvedValue([]);
      mockSession({ id: "u", name: "U", role });
      const res = await GET(createRequest("GET", "/api/leadership/overview"));
      expect(res.status).toBe(200);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails (route file doesn't exist)**

```bash
npm test -- --run src/__tests__/api/leadership-overview.test.ts 2>&1 | tail -20
```
Expected: FAIL — `Failed to resolve import "@/app/api/leadership/overview/route"`. Confirms the test is wired correctly before we write the route.

### Task 2.2: Implement the route

- [ ] **Step 1: Create the route file**

Write `src/app/api/leadership/overview/route.ts`:
```ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ADMIN_ROLES } from "@/lib/role-permissions";

/**
 * GET /api/leadership/overview
 *
 * Org-wide KPI aggregator for the /leadership page.
 * Admin-tier only (owner / head_office / admin).
 *
 * Returns:
 *   - staffCount: active User count
 *   - serviceCount: active Service count
 *   - openIssueCount: Issue rows with status ∈ { open, in_discussion }
 *   - openTicketCount: SupportTicket rows with status != resolved/closed
 *   - rocksRollup: current-quarter rock counts grouped by status (onTrack / offTrack / complete / dropped — matches RockStatus enum) + by service
 *   - sentimentTrend: last 8 weeks of avg WeeklyPulse.mood per weekOf
 *
 * Runs the six queries in parallel to keep response under ~500ms at current scale.
 */
export const GET = withApiAuth(async () => {
  const now = new Date();
  // Approximate "current quarter" via Q[1-4]-YYYY format used across the codebase
  const quarter = `Q${Math.floor(now.getMonth() / 3) + 1}-${now.getFullYear()}`;

  // Last 8 weeks window (ISO Monday)
  const eightWeeksAgo = new Date(now);
  eightWeeksAgo.setDate(eightWeeksAgo.getDate() - 56);

  const [
    staffCount,
    serviceCount,
    openIssueCount,
    openTicketCount,
    quarterRocks,
    recentPulses,
  ] = await Promise.all([
    prisma.user.count({ where: { active: true } }),
    prisma.service.count({ where: { status: "active" } }),
    // IssueStatus enum = open | in_discussion | solved | closed
    prisma.issue.count({ where: { status: { notIn: ["solved", "closed"] } } }),
    prisma.supportTicket.count({
      where: { deleted: false, status: { notIn: ["resolved", "closed"] } },
    }),
    prisma.rock.findMany({
      where: { quarter, deleted: false },
      select: {
        id: true,
        status: true,
        serviceId: true,
        service: { select: { id: true, name: true } },
      },
    }),
    prisma.weeklyPulse.findMany({
      where: {
        submittedAt: { not: null },
        weekOf: { gte: eightWeeksAgo },
        mood: { not: null },
      },
      select: { weekOf: true, mood: true },
    }),
  ]);

  // Rocks rollup — RockStatus enum values only
  const rocksRollup = {
    quarter,
    total: quarterRocks.length,
    onTrack: quarterRocks.filter((r) => r.status === "on_track").length,
    offTrack: quarterRocks.filter((r) => r.status === "off_track").length,
    complete: quarterRocks.filter((r) => r.status === "complete").length,
    dropped: quarterRocks.filter((r) => r.status === "dropped").length,
    byService: Array.from(
      quarterRocks
        .filter((r) => r.service)
        .reduce((acc, r) => {
          const key = r.service!.id;
          const entry = acc.get(key) ?? {
            serviceId: key,
            serviceName: r.service!.name,
            total: 0,
            onTrack: 0,
          };
          entry.total += 1;
          if (r.status === "on_track") entry.onTrack += 1;
          acc.set(key, entry);
          return acc;
        }, new Map<string, { serviceId: string; serviceName: string; total: number; onTrack: number }>())
        .values()
    ).sort((a, b) => b.total - a.total),
  };

  // Sentiment trend: group by ISO weekOf, avg mood
  const byWeek = new Map<string, { sum: number; count: number }>();
  for (const p of recentPulses) {
    const key = p.weekOf.toISOString();
    const entry = byWeek.get(key) ?? { sum: 0, count: 0 };
    entry.sum += p.mood!;
    entry.count += 1;
    byWeek.set(key, entry);
  }
  const sentimentTrend = Array.from(byWeek.entries())
    .map(([weekOf, { sum, count }]) => ({
      weekOf,
      avgMood: Math.round((sum / count) * 10) / 10,
      count,
    }))
    .sort((a, b) => a.weekOf.localeCompare(b.weekOf));

  return NextResponse.json({
    staffCount,
    serviceCount,
    openIssueCount,
    openTicketCount,
    rocksRollup,
    sentimentTrend,
  });
}, { roles: [...ADMIN_ROLES] });
```

- [ ] **Step 2: Run the test — must pass**

```bash
npm test -- --run src/__tests__/api/leadership-overview.test.ts 2>&1 | tail -10
```
Expected: `✓ 4 tests passed`. If the `avgMood` calculation differs, verify the test's `toBe(4.5)` matches the implementation's `Math.round(4.5 * 10) / 10 = 4.5`.

- [ ] **Step 3: Verify tsc + lint still clean**

```bash
npx tsc --noEmit 2>&1 | grep -c "error TS"
npm run lint 2>&1 | tail -3
```
Expected: 0 errors, lint unchanged from baseline.

### Task 2.3: Commit

- [ ] **Step 1: Stage + commit**

```bash
git add src/app/api/leadership/overview/route.ts src/__tests__/api/leadership-overview.test.ts
git commit -m "$(cat <<'EOF'
feat(api): /api/leadership/overview — org-wide KPI aggregator

Admin-tier-only endpoint returning six parallel queries: active staff,
active services, open issues, open tickets, current-quarter rocks rollup
(total + by status + by service), and an 8-week sentiment trend from
WeeklyPulse. Powers the new /leadership landing page (commit 2).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```
Expected: commit succeeds; no pre-commit hook failures.

---

## Chunk 3: Commit 2 — `feat(leadership): /leadership landing page + role-permissions`

**Goal:** Admin-only `/leadership` page aggregating Org KPIs + Rocks Rollup + Pulse Sentiment Trend (leaderboard section stub for now — commit 5 fills it in). Registration in `role-permissions.ts` and `nav-config.ts` so the sidebar shows it.

**Files:**
- Create: `src/app/(dashboard)/leadership/page.tsx`
- Create: `src/app/(dashboard)/leadership/loading.tsx`
- Create: `src/hooks/useLeadership.ts`
- Create: `src/__tests__/hooks/useLeadership.test.tsx`
- Modify: `src/lib/role-permissions.ts` (+`/leadership` in `allPages`)
- Modify: `src/lib/nav-config.ts` (+Leadership nav item, Admin section)

### Task 3.1: Register the route in role-permissions

- [ ] **Step 1: Add `/leadership` to `allPages`**

Edit `src/lib/role-permissions.ts`. In the `allPages` array, add `"/leadership"` under the `// Admin` comment (around line 121):
```ts
  // Admin
  "/leadership",
  "/automations",
  "/audit-log",
```
Because `owner`, `head_office`, and `admin` all use `allPages` (or a filter-by-exclusion of it) in `rolePageAccess`, no further changes are needed — `/leadership` automatically becomes visible to them and hidden from everyone else. Verify this by grepping:
```bash
grep -A 3 "^export const rolePageAccess" src/lib/role-permissions.ts
```
Expected: owner → `allPages`; head_office → `allPages`; admin → `allPages.filter(p !== "/crm/templates")`. All three now include `/leadership`. Marketing/coordinator/member/staff have explicit lists that do NOT include `/leadership`.

### Task 3.2: Add Leadership nav item

- [ ] **Step 1: Edit nav-config.ts**

Edit `src/lib/nav-config.ts`. First, add `Crown` to the lucide-react import (insert alphabetically near `Contact`):
```ts
  Contact,
  Crown,
  Inbox,
```
Then add a new nav item in the `// ── Admin — config, strategy & utilities ──` block, as the first entry after the comment:
```ts
  // ── Admin — config, strategy & utilities ──────────────────
  { href: "/leadership", label: "Leadership", icon: Crown, section: "Admin", tooltip: "Org-wide KPIs, rocks rollup, coordinator leaderboard, and pulse sentiment" },
  { href: "/reports", label: "Reports", ...
```

### Task 3.3: Write the hook test first

- [ ] **Step 1: Create the hook test**

Create `src/__tests__/hooks/useLeadership.test.tsx`:
```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

vi.mock("@/lib/fetch-api", () => ({
  fetchApi: vi.fn(),
}));

import { fetchApi } from "@/lib/fetch-api";
import { useLeadershipOverview } from "@/hooks/useLeadership";

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe("useLeadershipOverview", () => {
  beforeEach(() => vi.clearAllMocks());

  it("fetches from /api/leadership/overview", async () => {
    vi.mocked(fetchApi).mockResolvedValue({
      staffCount: 10,
      serviceCount: 3,
      openIssueCount: 0,
      openTicketCount: 0,
      rocksRollup: { quarter: "Q2-2026", total: 0, onTrack: 0, offTrack: 0, complete: 0, dropped: 0, byService: [] },
      sentimentTrend: [],
    });
    const { result } = renderHook(() => useLeadershipOverview(), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(fetchApi).toHaveBeenCalledWith("/api/leadership/overview");
    expect(result.current.data?.staffCount).toBe(10);
  });
});
```

- [ ] **Step 2: Run test to verify it fails (hook doesn't exist)**

```bash
npm test -- --run src/__tests__/hooks/useLeadership.test.tsx 2>&1 | tail -10
```
Expected: FAIL — `Failed to resolve import "@/hooks/useLeadership"`.

### Task 3.4: Implement the hook

- [ ] **Step 1: Create the hook**

Write `src/hooks/useLeadership.ts`:
```ts
"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchApi } from "@/lib/fetch-api";

export interface RocksRollupService {
  serviceId: string;
  serviceName: string;
  total: number;
  onTrack: number;
}

export interface RocksRollup {
  quarter: string;
  total: number;
  onTrack: number;
  offTrack: number;
  complete: number;
  dropped: number;
  byService: RocksRollupService[];
}

export interface SentimentPoint {
  weekOf: string;
  avgMood: number;
  count: number;
}

export interface LeadershipOverview {
  staffCount: number;
  serviceCount: number;
  openIssueCount: number;
  openTicketCount: number;
  rocksRollup: RocksRollup;
  sentimentTrend: SentimentPoint[];
}

export function useLeadershipOverview() {
  return useQuery<LeadershipOverview>({
    queryKey: ["leadership-overview"],
    queryFn: () => fetchApi<LeadershipOverview>("/api/leadership/overview"),
    staleTime: 60_000,
    retry: 2,
  });
}
```

- [ ] **Step 2: Run hook test — must pass**

```bash
npm test -- --run src/__tests__/hooks/useLeadership.test.tsx 2>&1 | tail -10
```
Expected: `✓ 1 test passed`.

### Task 3.5: Build the /leadership page

- [ ] **Step 1: Create `loading.tsx`**

Write `src/app/(dashboard)/leadership/loading.tsx`:
```tsx
import { Skeleton } from "@/components/ui/Skeleton";

export default function LeadershipLoading() {
  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <Skeleton className="h-10 w-64" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
      <Skeleton className="h-64 w-full" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}
```

(Component matches the imports in `/scorecard/loading.tsx` — `Skeleton` exists at `src/components/ui/Skeleton.tsx`.)

- [ ] **Step 2: Create the page**

Write `src/app/(dashboard)/leadership/page.tsx`:
```tsx
"use client";

import dynamic from "next/dynamic";
import { useLeadershipOverview } from "@/hooks/useLeadership";
import { PageHeader } from "@/components/layout/PageHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/ErrorState";
import { Crown, Users, Building2, AlertCircle, MessageSquare, Mountain } from "lucide-react";
import { cn } from "@/lib/utils";

const SentimentTrendChart = dynamic(
  () => import("recharts").then((mod) => {
    const { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } = mod;
    return {
      default: ({ data }: { data: { weekOf: string; avgMood: number }[] }) => (
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={data} margin={{ top: 10, right: 20, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
            <XAxis
              dataKey="weekOf"
              tick={{ fontSize: 11, fill: "#6B7280" }}
              tickFormatter={(v) => new Date(v).toLocaleDateString("en-AU", { day: "2-digit", month: "short" })}
            />
            <YAxis domain={[1, 5]} tick={{ fontSize: 11, fill: "#6B7280" }} allowDecimals={false} />
            <Tooltip
              labelFormatter={(v) => new Date(String(v)).toLocaleDateString("en-AU")}
              formatter={(v) => [Number(v).toFixed(1), "Avg mood"]}
            />
            <Line type="monotone" dataKey="avgMood" stroke="#004E64" strokeWidth={2} dot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      ),
    };
  }),
  { loading: () => <Skeleton className="h-60 w-full" /> }
);

function Kpi({ icon: Icon, value, label, iconClass }: { icon: typeof Users; value: number; label: string; iconClass: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 flex items-center gap-3">
      <div className={cn("rounded-full p-2.5", iconClass)}>
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <p className="text-2xl font-bold text-foreground">{value}</p>
        <p className="text-xs text-muted">{label}</p>
      </div>
    </div>
  );
}

export default function LeadershipPage() {
  const { data, isLoading, error, refetch } = useLeadershipOverview();

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <PageHeader
        title="Leadership Team Centre"
        description="Org-wide visibility: KPIs, quarterly rocks, pulse sentiment, coordinator leaderboard"
        badge="Admin"
      />

      {error ? (
        <ErrorState title="Failed to load leadership overview" error={error as Error} onRetry={refetch} />
      ) : isLoading || !data ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
        </div>
      ) : (
        <>
          {/* Section 1: Org KPIs */}
          <section>
            <h3 className="text-sm font-semibold text-foreground/80 uppercase tracking-wider mb-3">Org KPIs</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Kpi icon={Users} value={data.staffCount} label="Active staff" iconClass="bg-blue-100 text-blue-600" />
              <Kpi icon={Building2} value={data.serviceCount} label="Active services" iconClass="bg-emerald-100 text-emerald-600" />
              <Kpi icon={AlertCircle} value={data.openIssueCount} label="Open issues" iconClass="bg-amber-100 text-amber-600" />
              <Kpi icon={MessageSquare} value={data.openTicketCount} label="Open tickets" iconClass="bg-purple-100 text-purple-600" />
            </div>
          </section>

          {/* Section 2: Quarterly Rocks Rollup */}
          <section className="rounded-xl border border-border bg-card p-6">
            <div className="flex items-center gap-2 mb-4">
              <Mountain className="h-5 w-5 text-brand" />
              <h3 className="text-lg font-semibold text-foreground">Quarterly Rocks — {data.rocksRollup.quarter}</h3>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-5">
              <div className="text-center p-3 rounded-lg bg-surface">
                <p className="text-2xl font-bold text-foreground">{data.rocksRollup.total}</p>
                <p className="text-xs text-muted">Total</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-emerald-50">
                <p className="text-2xl font-bold text-emerald-700">{data.rocksRollup.onTrack}</p>
                <p className="text-xs text-emerald-700/80">On track</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-red-50">
                <p className="text-2xl font-bold text-red-700">{data.rocksRollup.offTrack}</p>
                <p className="text-xs text-red-700/80">Off track</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-blue-50">
                <p className="text-2xl font-bold text-blue-700">{data.rocksRollup.complete}</p>
                <p className="text-xs text-blue-700/80">Complete</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-muted/10">
                <p className="text-2xl font-bold text-muted-foreground">{data.rocksRollup.dropped}</p>
                <p className="text-xs text-muted">Dropped</p>
              </div>
            </div>
            {data.rocksRollup.byService.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-muted">
                      <th className="py-2 font-medium">Service</th>
                      <th className="py-2 font-medium text-right">Total</th>
                      <th className="py-2 font-medium text-right">On track</th>
                      <th className="py-2 font-medium text-right">%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.rocksRollup.byService.map((row) => (
                      <tr key={row.serviceId} className="border-b border-border/50">
                        <td className="py-2 text-foreground">{row.serviceName}</td>
                        <td className="py-2 text-right text-foreground">{row.total}</td>
                        <td className="py-2 text-right text-emerald-700">{row.onTrack}</td>
                        <td className="py-2 text-right text-muted">
                          {row.total > 0 ? `${Math.round((row.onTrack / row.total) * 100)}%` : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-muted italic">No service-scoped rocks this quarter.</p>
            )}
          </section>

          {/* Section 3: Pulse Sentiment Trend */}
          <section className="rounded-xl border border-border bg-card p-6">
            <div className="flex items-center gap-2 mb-4">
              <Crown className="h-5 w-5 text-brand" />
              <h3 className="text-lg font-semibold text-foreground">Pulse sentiment — last 8 weeks</h3>
            </div>
            {data.sentimentTrend.length > 0 ? (
              <SentimentTrendChart data={data.sentimentTrend} />
            ) : (
              <p className="text-sm text-muted italic">No pulse data for the last 8 weeks.</p>
            )}
          </section>

          {/* Section 4: Leaderboard — filled in commit 5 */}
          <section className="rounded-xl border border-border bg-card p-6">
            <h3 className="text-lg font-semibold text-foreground mb-2">Coordinator Leaderboard</h3>
            <p className="text-sm text-muted italic">Leaderboard lands in a follow-up commit.</p>
          </section>
        </>
      )}
    </div>
  );
}
```
If `ErrorState` doesn't exist, check `src/components/ui/ErrorState.tsx` — it's used by `/scorecard` so it should be present. If the `Crown` icon isn't in `lucide-react` at this version, swap for `Trophy` or `Shield` and adjust the nav entry to match.

### Task 3.6: Verify page + commit

- [ ] **Step 1: Run all affected tests**

```bash
npm test -- --run src/__tests__/hooks/useLeadership.test.tsx src/__tests__/api/leadership-overview.test.ts 2>&1 | tail -5
npx tsc --noEmit 2>&1 | grep -c "error TS"
```
Expected: all tests pass, 0 tsc errors.

- [ ] **Step 2: Smoke-test in dev (optional but recommended)**

```bash
npm run dev
```
Navigate to `http://localhost:3000/leadership` as an admin user. Expected: page renders with 4 KPI tiles, rocks rollup table, sentiment chart, leaderboard stub. Navigate as a non-admin (e.g. staff) user → sidebar hides the Leadership link; direct visit should fall through to client-side routing (middleware doesn't hard-block, but the link is gone from the sidebar — that matches the existing pattern). Stop the dev server (`Ctrl+C`) before committing.

- [ ] **Step 3: Commit**

```bash
git add src/app/\(dashboard\)/leadership/ src/hooks/useLeadership.ts src/__tests__/hooks/useLeadership.test.tsx src/lib/role-permissions.ts src/lib/nav-config.ts
git commit -m "$(cat <<'EOF'
feat(leadership): /leadership landing page + role-permissions registration

Admin-only single-scroll page rendering Org KPIs, quarterly rocks rollup
with per-service breakdown, and 8-week pulse sentiment trend (recharts).
Leaderboard section stubbed — commit 5 fills it in. Registered in
allPages (visible to owner/head_office/admin via the existing spread
pattern) and added as a "Leadership" item in the Admin nav section.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```
Expected: commit succeeds.

---

## Chunk 4: Commit 3 — `feat(scorecard): org-wide rollup view across services`

**Goal:** New "Org Rollup" tab on `/scorecard` (admin-only) showing all measurables grouped by service with last-week values and a total row.

**Files:**
- Create: `src/app/api/scorecard/rollup/route.ts`
- Create: `src/components/scorecard/ScorecardRollupView.tsx`
- Create: `src/hooks/useScorecardRollup.ts`
- Create: `src/__tests__/api/scorecard-rollup.test.ts`
- Modify: `src/app/(dashboard)/scorecard/page.tsx` (add tab — admin only)

### Task 4.1: Write the API test

- [ ] **Step 1: Scaffold the test**

Create `src/__tests__/api/scorecard-rollup.test.ts`:
```ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession, mockNoSession } from "../helpers/auth-mock";
import { createRequest } from "../helpers/request";

vi.mock("@/lib/service-scope", () => ({
  getServiceScope: vi.fn(() => null),
  getStateScope: vi.fn(() => null),
}));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() => Promise.resolve({ limited: false, remaining: 59, resetIn: 60000 })),
}));
vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(),
    withRequestId: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }) },
  generateRequestId: () => "test-req-id",
}));

import { _clearUserActiveCache } from "@/lib/server-auth";
import { GET } from "@/app/api/scorecard/rollup/route";

describe("GET /api/scorecard/rollup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
  });

  it("returns 403 for coordinator", async () => {
    mockSession({ id: "u", name: "C", role: "coordinator" });
    const res = await GET(createRequest("GET", "/api/scorecard/rollup"));
    expect(res.status).toBe(403);
  });

  it("groups measurables by service with last-week values", async () => {
    mockSession({ id: "u1", name: "Owner", role: "owner" });

    prismaMock.service.findMany.mockResolvedValue([
      { id: "s1", name: "Centre A", code: "A" },
      { id: "s2", name: "Centre B", code: "B" },
    ]);
    prismaMock.measurable.findMany.mockResolvedValue([
      {
        id: "m1", title: "Attendance", goalDirection: "above", goalValue: 50,
        unit: null, serviceId: "s1",
        service: { id: "s1", name: "Centre A" },
        entries: [{ weekOf: new Date("2026-04-13"), value: 55, onTrack: true }],
      },
      {
        id: "m2", title: "Attendance", goalDirection: "above", goalValue: 50,
        unit: null, serviceId: "s2",
        service: { id: "s2", name: "Centre B" },
        entries: [{ weekOf: new Date("2026-04-13"), value: 48, onTrack: false }],
      },
      {
        id: "m3", title: "Org KPI", goalDirection: "above", goalValue: 100,
        unit: null, serviceId: null, service: null,
        entries: [{ weekOf: new Date("2026-04-13"), value: 110, onTrack: true }],
      },
    ]);

    const res = await GET(createRequest("GET", "/api/scorecard/rollup"));
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.services).toEqual([
      { id: "s1", name: "Centre A", code: "A" },
      { id: "s2", name: "Centre B", code: "B" },
    ]);
    expect(body.rows).toHaveLength(2); // Attendance (grouped by title), Org KPI
    const attendance = body.rows.find((r: { title: string }) => r.title === "Attendance");
    expect(attendance.byService.s1.value).toBe(55);
    expect(attendance.byService.s2.value).toBe(48);
    expect(attendance.byService.s1.onTrack).toBe(true);
    expect(attendance.byService.s2.onTrack).toBe(false);
  });
});
```

- [ ] **Step 2: Run — must fail**

```bash
npm test -- --run src/__tests__/api/scorecard-rollup.test.ts 2>&1 | tail -10
```
Expected: FAIL on import.

### Task 4.2: Implement the route

- [ ] **Step 1: Create `src/app/api/scorecard/rollup/route.ts`**

```ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ADMIN_ROLES } from "@/lib/role-permissions";

/**
 * GET /api/scorecard/rollup
 *
 * Org-wide scorecard rollup: all measurables grouped by title, with last-week
 * value per service, plus an org-wide total row. Admin-tier only.
 *
 * Response shape (client renders a matrix table):
 *   {
 *     services: Array<{ id, name, code }>,
 *     rows: Array<{
 *       title: string,
 *       unit: string | null,
 *       goalDirection: "above" | "below" | "exact",
 *       goalValue: number,
 *       byService: Record<serviceId | "_org", { value: number | null, onTrack: boolean | null }>,
 *     }>,
 *   }
 *
 * Grouping: measurables are grouped by `title` (case-insensitive). If two
 * services each track an "Attendance" measurable, both appear on the same row
 * under their respective service columns. Org-level measurables (serviceId
 * null) use the sentinel key "_org".
 */
export const GET = withApiAuth(async () => {
  const [services, measurables] = await Promise.all([
    prisma.service.findMany({
      where: { status: "active" },
      select: { id: true, name: true, code: true },
      orderBy: { name: "asc" },
    }),
    prisma.measurable.findMany({
      select: {
        id: true,
        title: true,
        unit: true,
        goalDirection: true,
        goalValue: true,
        serviceId: true,
        service: { select: { id: true, name: true } },
        entries: {
          orderBy: { weekOf: "desc" },
          take: 1,
          select: { weekOf: true, value: true, onTrack: true },
        },
      },
    }),
  ]);

  // Group measurables by normalised title
  type Row = {
    title: string;
    unit: string | null;
    goalDirection: string;
    goalValue: number;
    byService: Record<string, { value: number | null; onTrack: boolean | null }>;
  };

  const rowMap = new Map<string, Row>();
  for (const m of measurables) {
    const key = m.title.trim().toLowerCase();
    let row = rowMap.get(key);
    if (!row) {
      row = {
        title: m.title,
        unit: m.unit,
        goalDirection: m.goalDirection,
        goalValue: m.goalValue,
        byService: {},
      };
      rowMap.set(key, row);
    }
    const colKey = m.serviceId ?? "_org";
    const last = m.entries[0];
    row.byService[colKey] = {
      value: last?.value ?? null,
      onTrack: last?.onTrack ?? null,
    };
  }

  const rows = Array.from(rowMap.values()).sort((a, b) =>
    a.title.localeCompare(b.title)
  );

  return NextResponse.json({ services, rows });
}, { roles: [...ADMIN_ROLES] });
```

- [ ] **Step 2: Run — must pass**

```bash
npm test -- --run src/__tests__/api/scorecard-rollup.test.ts 2>&1 | tail -10
```
Expected: both tests pass.

### Task 4.3: Implement the hook

- [ ] **Step 1: Create `src/hooks/useScorecardRollup.ts`**

```ts
"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchApi } from "@/lib/fetch-api";

export interface RollupService {
  id: string;
  name: string;
  code: string;
}

export interface RollupCell {
  value: number | null;
  onTrack: boolean | null;
}

export interface RollupRow {
  title: string;
  unit: string | null;
  goalDirection: "above" | "below" | "exact";
  goalValue: number;
  byService: Record<string, RollupCell>;
}

export interface ScorecardRollup {
  services: RollupService[];
  rows: RollupRow[];
}

export function useScorecardRollup(enabled: boolean) {
  return useQuery<ScorecardRollup>({
    queryKey: ["scorecard-rollup"],
    queryFn: () => fetchApi<ScorecardRollup>("/api/scorecard/rollup"),
    staleTime: 60_000,
    retry: 2,
    enabled,
  });
}
```

### Task 4.4: Implement the rollup view component

- [ ] **Step 1: Create `src/components/scorecard/ScorecardRollupView.tsx`**

```tsx
"use client";

import { useScorecardRollup } from "@/hooks/useScorecardRollup";
import { Skeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/ErrorState";
import { EmptyState } from "@/components/ui/EmptyState";
import { BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";

function formatCell(value: number | null, unit: string | null): string {
  if (value == null) return "—";
  const formatted = Number.isInteger(value) ? value.toString() : value.toFixed(1);
  return unit ? `${formatted}${unit}` : formatted;
}

export function ScorecardRollupView({ enabled }: { enabled: boolean }) {
  const { data, isLoading, error, refetch } = useScorecardRollup(enabled);

  if (isLoading) return <Skeleton className="h-96 w-full" />;
  if (error) return <ErrorState title="Failed to load rollup" error={error as Error} onRetry={refetch} />;
  if (!data || data.rows.length === 0) {
    return (
      <EmptyState
        icon={BarChart3}
        title="No measurables to roll up"
        description="Add measurables on /scorecard to see them aggregated here."
      />
    );
  }

  const hasOrgColumn = data.rows.some((r) => r.byService._org);

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-surface/50">
            <th className="sticky left-0 bg-surface/50 text-left font-medium text-muted px-4 py-3 z-10">Measurable</th>
            <th className="text-right font-medium text-muted px-3 py-3 whitespace-nowrap">Goal</th>
            {hasOrgColumn && <th className="text-center font-medium text-muted px-3 py-3 whitespace-nowrap">Org</th>}
            {data.services.map((s) => (
              <th key={s.id} className="text-center font-medium text-muted px-3 py-3 whitespace-nowrap" title={s.name}>
                {s.code || s.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.rows.map((row) => {
            const goalLabel =
              row.goalDirection === "above" ? `≥ ${row.goalValue}`
              : row.goalDirection === "below" ? `≤ ${row.goalValue}`
              : `= ${row.goalValue}`;
            return (
              <tr key={row.title} className="border-b border-border/50 hover:bg-surface/50">
                <td className="sticky left-0 bg-card hover:bg-surface/50 font-medium text-foreground px-4 py-2.5">{row.title}</td>
                <td className="text-right text-muted px-3 py-2.5 whitespace-nowrap">
                  {goalLabel}{row.unit ?? ""}
                </td>
                {hasOrgColumn && (
                  <td className={cn(
                    "text-center px-3 py-2.5",
                    row.byService._org?.onTrack === false && "text-red-600 font-medium",
                    row.byService._org?.onTrack === true && "text-emerald-700"
                  )}>
                    {formatCell(row.byService._org?.value ?? null, row.unit)}
                  </td>
                )}
                {data.services.map((s) => {
                  const cell = row.byService[s.id];
                  return (
                    <td key={s.id} className={cn(
                      "text-center px-3 py-2.5",
                      cell?.onTrack === false && "text-red-600 font-medium",
                      cell?.onTrack === true && "text-emerald-700"
                    )}>
                      {formatCell(cell?.value ?? null, row.unit)}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
```

### Task 4.5: Wire Rollup tab into /scorecard

- [ ] **Step 1: Edit `src/app/(dashboard)/scorecard/page.tsx`**

At the top of the file with the imports, add:
```ts
import { useSession } from "next-auth/react";
import { isAdminRole } from "@/lib/role-permissions";
import { ScorecardRollupView } from "@/components/scorecard/ScorecardRollupView";
```

Change the `tab` state type to include the new tab:
```ts
const [tab, setTab] = useState<"all" | "leadership" | "rollup">("all");
```

Right below the `const queryClient = useQueryClient();` line, add:
```ts
const { data: session } = useSession();
const isAdmin = isAdminRole(session?.user?.role as string | undefined);
```

In the existing tab switcher (around the `All Measurables` / `Leadership Team` buttons), append a third button, rendered only when `isAdmin`:
```tsx
{isAdmin && (
  <button
    onClick={() => setTab("rollup")}
    className={cn(
      "px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
      tab === "rollup" ? "bg-card text-brand shadow-sm" : "text-muted hover:text-foreground"
    )}
  >
    Org Rollup
  </button>
)}
```

In the content block (currently a big ternary around `isLoading ? … : error ? … : filteredScorecard && …`), wrap it so that the rollup tab short-circuits to `<ScorecardRollupView>`:

Find the section starting `{/* Content */}` and change:
```tsx
{/* Content */}
{isLoading ? (
```
to:
```tsx
{/* Content */}
{tab === "rollup" ? (
  <ScorecardRollupView enabled={tab === "rollup"} />
) : isLoading ? (
```
(Rollup view handles its own loading/error/empty states.)

Also update the CSV export `handleExport` early return to skip when `tab === "rollup"` (since that data shape differs):
```ts
const handleExport = () => {
  if (tab === "rollup") return;
  if (!scorecard?.measurables || scorecard.measurables.length === 0) return;
  // … existing logic
};
```

### Task 4.6: Verify + commit

- [ ] **Step 1: Run all tests**

```bash
npm test -- --run 2>&1 | tail -5
npx tsc --noEmit 2>&1 | grep -c "error TS"
```
Expected: 1298 + 5 new (3 API tests from commits 1+3 + 1 hook test + ~1 from rollup) = baseline + commits' new tests, 0 tsc errors.

- [ ] **Step 2: Commit**

```bash
git add src/app/api/scorecard/rollup/ src/components/scorecard/ScorecardRollupView.tsx src/hooks/useScorecardRollup.ts src/__tests__/api/scorecard-rollup.test.ts src/app/\(dashboard\)/scorecard/page.tsx
git commit -m "$(cat <<'EOF'
feat(scorecard): org-wide rollup view across services

Admin-only Rollup tab on /scorecard rendering a matrix of measurables
(grouped by title) × services, with per-cell on-track colouring and
last-week value. Backed by /api/scorecard/rollup (admin-tier only).
Handles org-level measurables via a dedicated Org column when present.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Chunk 5: Commit 4 — `feat(scorecard): historical trend charts per measurable`

**Goal:** Clickable measurable titles on `/scorecard` open a side drawer with a 12-week line chart of the measurable's entries vs. its goal.

**Files:**
- Create: `src/app/api/measurables/[id]/history/route.ts`
- Create: `src/components/scorecard/MeasurableTrendDrawer.tsx`
- Create: `src/hooks/useMeasurableHistory.ts`
- Create: `src/__tests__/api/measurable-history.test.ts`
- Modify: `src/components/scorecard/ScorecardGrid.tsx` (make title clickable)

### Task 5.1: API test

- [ ] **Step 1: Create `src/__tests__/api/measurable-history.test.ts`**

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession, mockNoSession } from "../helpers/auth-mock";
import { createRequest } from "../helpers/request";

vi.mock("@/lib/service-scope", () => ({
  getServiceScope: vi.fn(() => null),
  getStateScope: vi.fn(() => null),
}));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() => Promise.resolve({ limited: false, remaining: 59, resetIn: 60000 })),
}));
vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(),
    withRequestId: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }) },
  generateRequestId: () => "test-req-id",
}));

import { _clearUserActiveCache } from "@/lib/server-auth";
import { GET } from "@/app/api/measurables/[id]/history/route";

async function invoke(id: string, query = "") {
  const req = createRequest("GET", `/api/measurables/${id}/history${query}`);
  return GET(req, { params: Promise.resolve({ id }) });
}

describe("GET /api/measurables/[id]/history", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
  });

  it("returns 401 when unauthenticated", async () => {
    mockNoSession();
    const res = await invoke("m1");
    expect(res.status).toBe(401);
  });

  it("returns 404 when measurable missing", async () => {
    mockSession({ id: "u1", name: "U", role: "owner" });
    prismaMock.measurable.findUnique.mockResolvedValue(null);
    const res = await invoke("missing");
    expect(res.status).toBe(404);
  });

  it("returns last 12 weeks by default", async () => {
    mockSession({ id: "u1", name: "U", role: "owner" });
    prismaMock.measurable.findUnique.mockResolvedValue({
      id: "m1",
      title: "Attendance",
      goalDirection: "above",
      goalValue: 50,
      unit: null,
      serviceId: null,
    });
    prismaMock.measurableEntry.findMany.mockResolvedValue([
      { weekOf: new Date("2026-04-13"), value: 55, onTrack: true },
      { weekOf: new Date("2026-04-06"), value: 52, onTrack: true },
    ]);
    const res = await invoke("m1");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.measurable.id).toBe("m1");
    expect(body.measurable.goalValue).toBe(50);
    expect(body.entries).toHaveLength(2);
    expect(new Date(body.entries[0].weekOf) < new Date(body.entries[1].weekOf)).toBe(true);
  });

  it("honours ?weeks param (max 52)", async () => {
    mockSession({ id: "u1", name: "U", role: "owner" });
    prismaMock.measurable.findUnique.mockResolvedValue({
      id: "m1", title: "T", goalDirection: "above", goalValue: 1, unit: null, serviceId: null,
    });
    prismaMock.measurableEntry.findMany.mockResolvedValue([]);
    await invoke("m1", "?weeks=100");
    const call = prismaMock.measurableEntry.findMany.mock.calls[0][0];
    expect(call.take).toBe(52);
  });
});
```

- [ ] **Step 2: Run — must fail**

```bash
npm test -- --run src/__tests__/api/measurable-history.test.ts 2>&1 | tail -10
```

### Task 5.2: Implement route

- [ ] **Step 1: Create `src/app/api/measurables/[id]/history/route.ts`**

```ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";

/**
 * GET /api/measurables/[id]/history?weeks=12
 *
 * Returns trailing N weeks of entries for a single measurable, oldest first
 * (sorted ascending by weekOf for charting). Default 12, clamped to [1, 52].
 *
 * Any authenticated user can read this — scoping happens in the calling UI
 * (a user who can see the measurable on the scorecard can view its history).
 */
export const GET = withApiAuth(async (req, _session, context) => {
  const params = await context?.params;
  const id = params?.id;
  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const { searchParams } = new URL(req.url);
  const weeksRaw = Number.parseInt(searchParams.get("weeks") ?? "12", 10);
  const weeks = Math.max(1, Math.min(52, Number.isFinite(weeksRaw) ? weeksRaw : 12));

  const measurable = await prisma.measurable.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      goalDirection: true,
      goalValue: true,
      unit: true,
      serviceId: true,
    },
  });
  if (!measurable) {
    return NextResponse.json({ error: "Measurable not found" }, { status: 404 });
  }

  const entries = await prisma.measurableEntry.findMany({
    where: { measurableId: id },
    orderBy: { weekOf: "desc" },
    take: weeks,
    select: { weekOf: true, value: true, onTrack: true },
  });

  // Return oldest → newest for line charting
  entries.reverse();

  return NextResponse.json({ measurable, entries });
});
```

- [ ] **Step 2: Run — must pass**

```bash
npm test -- --run src/__tests__/api/measurable-history.test.ts 2>&1 | tail -10
```

### Task 5.3: Hook + drawer component

- [ ] **Step 1: Create `src/hooks/useMeasurableHistory.ts`**

```ts
"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchApi } from "@/lib/fetch-api";

export interface MeasurableHistoryEntry {
  weekOf: string;
  value: number;
  onTrack: boolean;
}

export interface MeasurableHistory {
  measurable: {
    id: string;
    title: string;
    goalDirection: "above" | "below" | "exact";
    goalValue: number;
    unit: string | null;
    serviceId: string | null;
  };
  entries: MeasurableHistoryEntry[];
}

export function useMeasurableHistory(id: string | null, weeks = 12) {
  return useQuery<MeasurableHistory>({
    queryKey: ["measurable-history", id, weeks],
    queryFn: () => fetchApi<MeasurableHistory>(`/api/measurables/${id}/history?weeks=${weeks}`),
    enabled: !!id,
    staleTime: 60_000,
    retry: 2,
  });
}
```

- [ ] **Step 2: Create `src/components/scorecard/MeasurableTrendDrawer.tsx`**

```tsx
"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import { useMeasurableHistory } from "@/hooks/useMeasurableHistory";
import { Skeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/ErrorState";
import {
  LineChart,
  Line,
  ReferenceLine,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface Props {
  measurableId: string | null;
  onClose: () => void;
}

export function MeasurableTrendDrawer({ measurableId, onClose }: Props) {
  const { data, isLoading, error, refetch } = useMeasurableHistory(measurableId, 12);

  // Close on Escape
  useEffect(() => {
    if (!measurableId) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [measurableId, onClose]);

  if (!measurableId) return null;

  const chartData = data?.entries.map((e) => ({
    label: new Date(e.weekOf).toLocaleDateString("en-AU", { day: "2-digit", month: "short" }),
    value: e.value,
    onTrack: e.onTrack,
  })) ?? [];

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true">
      <button
        aria-label="Close trend"
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
      />
      <div className="relative w-full max-w-xl h-full bg-card border-l border-border shadow-xl overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div>
            <h3 className="text-lg font-semibold text-foreground">
              {data?.measurable.title ?? "Loading…"}
            </h3>
            {data?.measurable && (
              <p className="text-xs text-muted">
                Goal: {data.measurable.goalDirection === "above" ? "≥" : data.measurable.goalDirection === "below" ? "≤" : "="} {data.measurable.goalValue}
                {data.measurable.unit ?? ""}
              </p>
            )}
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-surface" aria-label="Close">
            <X className="h-5 w-5 text-muted" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {isLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : error ? (
            <ErrorState title="Failed to load trend" error={error as Error} onRetry={refetch} />
          ) : chartData.length === 0 ? (
            <p className="text-sm text-muted italic">No entries yet for this measurable.</p>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={chartData} margin={{ top: 10, right: 20, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#6B7280" }} />
                  <YAxis tick={{ fontSize: 11, fill: "#6B7280" }} />
                  <Tooltip formatter={(v) => Number(v).toString()} />
                  {data?.measurable.goalValue != null && (
                    <ReferenceLine
                      y={data.measurable.goalValue}
                      stroke="#10B981"
                      strokeDasharray="4 4"
                      label={{ value: "Goal", fontSize: 10, fill: "#10B981", position: "right" }}
                    />
                  )}
                  <Line type="monotone" dataKey="value" stroke="#004E64" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
              <div className="text-xs text-muted">
                Showing last {chartData.length} week{chartData.length === 1 ? "" : "s"}.
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
```

### Task 5.4: Wire clickable titles in `ScorecardGrid.tsx`

- [ ] **Step 1: Inspect + edit `src/components/scorecard/ScorecardGrid.tsx`**

First read the file to locate where measurable titles render:
```bash
grep -n "title\b" src/components/scorecard/ScorecardGrid.tsx | head -20
```

At the top of the file, add state + drawer:
```tsx
import { useState } from "react";
import { MeasurableTrendDrawer } from "./MeasurableTrendDrawer";
```
In the component, add:
```tsx
const [trendId, setTrendId] = useState<string | null>(null);
```
Find the JSX where the measurable title is rendered (usually a `<td>` or `<span>` with `{measurable.title}` or `{m.title}`). Wrap it in a button:
```tsx
<button
  type="button"
  onClick={() => setTrendId(m.id)}
  className="text-left font-medium text-foreground hover:text-brand hover:underline truncate"
  title="View 12-week trend"
>
  {m.title}
</button>
```
At the end of the returned JSX (before the closing fragment/root element), render:
```tsx
<MeasurableTrendDrawer measurableId={trendId} onClose={() => setTrendId(null)} />
```
The exact location depends on the component's current structure. Keep edits minimal — don't rewrite layout.

### Task 5.5: Verify + commit

- [ ] **Step 1: Gate**

```bash
npm test -- --run 2>&1 | tail -5
npx tsc --noEmit 2>&1 | grep -c "error TS"
```
Expected: all green.

- [ ] **Step 2: Commit**

```bash
git add src/app/api/measurables/\[id\]/history/ src/components/scorecard/MeasurableTrendDrawer.tsx src/hooks/useMeasurableHistory.ts src/__tests__/api/measurable-history.test.ts src/components/scorecard/ScorecardGrid.tsx
git commit -m "$(cat <<'EOF'
feat(scorecard): historical trend charts per measurable

Clicking a measurable title on /scorecard opens a slide-over drawer with
a 12-week line chart + goal reference line. Backed by new
/api/measurables/[id]/history endpoint (auth-only, scoping handled by
the calling UI). Entries returned oldest-first for charting.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Chunk 6: Commit 5 — `feat(contact-centre): coordinator leaderboard tab`

**Goal:** "Leaderboard" tab on `/contact-centre` (admin-only) with per-coordinator metrics: avg first-response time, tickets resolved, enquiries converted. Also embed the same data inline on `/leadership` (replace the stub from commit 2).

**Files:**
- Create: `src/app/api/contact-centre/leaderboard/route.ts`
- Create: `src/components/contact-centre/LeaderboardContent.tsx`
- Create: `src/hooks/useLeaderboard.ts`
- Create: `src/__tests__/api/contact-centre-leaderboard.test.ts`
- Modify: `src/app/(dashboard)/contact-centre/page.tsx` (+Leaderboard tab)
- Modify: `src/app/(dashboard)/leadership/page.tsx` (embed leaderboard)

### Task 6.1: API test

- [ ] **Step 1: Create `src/__tests__/api/contact-centre-leaderboard.test.ts`**

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession, mockNoSession } from "../helpers/auth-mock";
import { createRequest } from "../helpers/request";

vi.mock("@/lib/service-scope", () => ({
  getServiceScope: vi.fn(() => null),
  getStateScope: vi.fn(() => null),
}));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() => Promise.resolve({ limited: false, remaining: 59, resetIn: 60000 })),
}));
vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(),
    withRequestId: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }) },
  generateRequestId: () => "test-req-id",
}));

import { _clearUserActiveCache } from "@/lib/server-auth";
import { GET } from "@/app/api/contact-centre/leaderboard/route";

describe("GET /api/contact-centre/leaderboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
  });

  it("returns 403 for non-admin", async () => {
    mockSession({ id: "u", name: "S", role: "staff" });
    const res = await GET(createRequest("GET", "/api/contact-centre/leaderboard"));
    expect(res.status).toBe(403);
  });

  it("computes per-coordinator metrics", async () => {
    mockSession({ id: "u1", name: "Owner", role: "owner" });

    prismaMock.user.findMany.mockResolvedValue([
      { id: "c1", name: "Ali", email: "ali@x.com", avatar: null, role: "coordinator" },
      { id: "c2", name: "Bea", email: "bea@x.com", avatar: null, role: "coordinator" },
    ]);
    prismaMock.supportTicket.findMany.mockResolvedValue([
      // c1: 2 tickets, 1 resolved, first-response 10 min avg
      {
        id: "t1", assignedToId: "c1", status: "resolved",
        createdAt: new Date("2026-04-01T09:00:00Z"),
        firstResponseAt: new Date("2026-04-01T09:10:00Z"),
        resolvedAt: new Date("2026-04-01T10:00:00Z"),
      },
      {
        id: "t2", assignedToId: "c1", status: "open",
        createdAt: new Date("2026-04-02T09:00:00Z"),
        firstResponseAt: new Date("2026-04-02T09:10:00Z"),
        resolvedAt: null,
      },
      // c2: 1 ticket, resolved, first-response 30 min
      {
        id: "t3", assignedToId: "c2", status: "resolved",
        createdAt: new Date("2026-04-03T09:00:00Z"),
        firstResponseAt: new Date("2026-04-03T09:30:00Z"),
        resolvedAt: new Date("2026-04-03T11:00:00Z"),
      },
    ]);
    prismaMock.parentEnquiry.findMany.mockResolvedValue([
      { id: "e1", assigneeId: "c1", stage: "enrolled" },
      { id: "e2", assigneeId: "c1", stage: "nurturing" },
      { id: "e3", assigneeId: "c2", stage: "enrolled" },
      { id: "e4", assigneeId: "c2", stage: "enrolled" },
    ]);

    const res = await GET(createRequest("GET", "/api/contact-centre/leaderboard"));
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.rows).toHaveLength(2);
    const ali = body.rows.find((r: { userId: string }) => r.userId === "c1");
    expect(ali.ticketsAssigned).toBe(2);
    expect(ali.ticketsResolved).toBe(1);
    expect(ali.avgFirstResponseMin).toBe(10);
    expect(ali.enquiriesConverted).toBe(1);
    expect(ali.enquiriesTotal).toBe(2);

    const bea = body.rows.find((r: { userId: string }) => r.userId === "c2");
    expect(bea.ticketsAssigned).toBe(1);
    expect(bea.avgFirstResponseMin).toBe(30);
    expect(bea.enquiriesConverted).toBe(2);
  });

  it("supports ?days=30 filter", async () => {
    mockSession({ id: "u1", name: "U", role: "owner" });
    prismaMock.user.findMany.mockResolvedValue([]);
    prismaMock.supportTicket.findMany.mockResolvedValue([]);
    prismaMock.parentEnquiry.findMany.mockResolvedValue([]);
    await GET(createRequest("GET", "/api/contact-centre/leaderboard?days=30"));
    const ticketCall = prismaMock.supportTicket.findMany.mock.calls[0][0];
    expect(ticketCall.where.createdAt?.gte).toBeDefined();
  });
});
```

- [ ] **Step 2: Run — must fail**

```bash
npm test -- --run src/__tests__/api/contact-centre-leaderboard.test.ts 2>&1 | tail -10
```

### Task 6.2: Implement route

- [ ] **Step 1: Create `src/app/api/contact-centre/leaderboard/route.ts`**

```ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ADMIN_ROLES } from "@/lib/role-permissions";

/**
 * GET /api/contact-centre/leaderboard?days=30
 *
 * Per-coordinator metrics across the window (default 30 days, capped 365):
 *   - ticketsAssigned / ticketsResolved
 *   - avgFirstResponseMin: mean minutes from createdAt → firstResponseAt
 *   - enquiriesTotal / enquiriesConverted (stage === "enrolled")
 *
 * Includes only users whose role is coordinator OR who have any ticket/enquiry
 * assigned in-window — covers both "owns a service" coordinators and
 * admins/members who take work ad-hoc. Anonymity: coordinator NAMES are shown
 * because the leaderboard is explicitly about performance, and a coordinator
 * voluntarily accepts ownership when they pick up a ticket. This differs from
 * Pulse (involuntary sentiment signals) which stays anonymous.
 */
export const GET = withApiAuth(async (req) => {
  const { searchParams } = new URL(req.url);
  const daysRaw = Number.parseInt(searchParams.get("days") ?? "30", 10);
  const days = Math.max(1, Math.min(365, Number.isFinite(daysRaw) ? daysRaw : 30));

  const since = new Date();
  since.setDate(since.getDate() - days);

  const [users, tickets, enquiries] = await Promise.all([
    prisma.user.findMany({
      where: { active: true, role: { in: ["coordinator", "admin", "owner", "head_office", "member"] } },
      select: { id: true, name: true, email: true, avatar: true, role: true },
    }),
    prisma.supportTicket.findMany({
      where: { deleted: false, createdAt: { gte: since }, assignedToId: { not: null } },
      select: {
        id: true,
        assignedToId: true,
        status: true,
        createdAt: true,
        firstResponseAt: true,
        resolvedAt: true,
      },
    }),
    prisma.parentEnquiry.findMany({
      where: { deleted: false, createdAt: { gte: since }, assigneeId: { not: null } },
      select: { id: true, assigneeId: true, stage: true },
    }),
  ]);

  const byUser = new Map<string, {
    userId: string;
    name: string;
    email: string;
    avatar: string | null;
    role: string;
    ticketsAssigned: number;
    ticketsResolved: number;
    firstResponseMinSum: number;
    firstResponseCount: number;
    avgFirstResponseMin: number | null;
    enquiriesTotal: number;
    enquiriesConverted: number;
  }>();

  function ensure(userId: string) {
    let row = byUser.get(userId);
    if (!row) {
      const u = users.find((x) => x.id === userId);
      row = {
        userId,
        name: u?.name ?? "Unknown",
        email: u?.email ?? "",
        avatar: u?.avatar ?? null,
        role: u?.role ?? "unknown",
        ticketsAssigned: 0,
        ticketsResolved: 0,
        firstResponseMinSum: 0,
        firstResponseCount: 0,
        avgFirstResponseMin: null,
        enquiriesTotal: 0,
        enquiriesConverted: 0,
      };
      byUser.set(userId, row);
    }
    return row;
  }

  for (const t of tickets) {
    if (!t.assignedToId) continue;
    const row = ensure(t.assignedToId);
    row.ticketsAssigned += 1;
    if (t.status === "resolved" || t.status === "closed") row.ticketsResolved += 1;
    if (t.firstResponseAt && t.createdAt) {
      row.firstResponseMinSum += (t.firstResponseAt.getTime() - t.createdAt.getTime()) / 60_000;
      row.firstResponseCount += 1;
    }
  }
  for (const e of enquiries) {
    if (!e.assigneeId) continue;
    const row = ensure(e.assigneeId);
    row.enquiriesTotal += 1;
    if (e.stage === "enrolled") row.enquiriesConverted += 1;
  }

  const rows = Array.from(byUser.values())
    .map((r) => ({
      ...r,
      avgFirstResponseMin:
        r.firstResponseCount > 0
          ? Math.round(r.firstResponseMinSum / r.firstResponseCount)
          : null,
    }))
    .map((r) => {
      const { firstResponseMinSum: _sum, firstResponseCount: _count, ...rest } = r;
      return rest;
    })
    .sort((a, b) => b.ticketsResolved + b.enquiriesConverted - (a.ticketsResolved + a.enquiriesConverted));

  return NextResponse.json({ days, since: since.toISOString(), rows });
}, { roles: [...ADMIN_ROLES] });
```

- [ ] **Step 2: Run — must pass**

```bash
npm test -- --run src/__tests__/api/contact-centre-leaderboard.test.ts 2>&1 | tail -10
```

### Task 6.3: Hook + UI

- [ ] **Step 1: Create `src/hooks/useLeaderboard.ts`**

```ts
"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchApi } from "@/lib/fetch-api";

export interface LeaderboardRow {
  userId: string;
  name: string;
  email: string;
  avatar: string | null;
  role: string;
  ticketsAssigned: number;
  ticketsResolved: number;
  avgFirstResponseMin: number | null;
  enquiriesTotal: number;
  enquiriesConverted: number;
}

export interface Leaderboard {
  days: number;
  since: string;
  rows: LeaderboardRow[];
}

export function useLeaderboard(days = 30, enabled = true) {
  return useQuery<Leaderboard>({
    queryKey: ["leaderboard", days],
    queryFn: () => fetchApi<Leaderboard>(`/api/contact-centre/leaderboard?days=${days}`),
    staleTime: 60_000,
    retry: 2,
    enabled,
  });
}
```

- [ ] **Step 2: Create `src/components/contact-centre/LeaderboardContent.tsx`**

```tsx
"use client";

import { useState } from "react";
import { useLeaderboard } from "@/hooks/useLeaderboard";
import { Skeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/ErrorState";
import { EmptyState } from "@/components/ui/EmptyState";
import { Trophy } from "lucide-react";
import { cn } from "@/lib/utils";

function formatMinutes(m: number | null): string {
  if (m == null) return "—";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem === 0 ? `${h}h` : `${h}h ${rem}m`;
}

interface Props {
  /** If true, only render the table (no PageHeader) — used for embedding in /leadership. */
  embedded?: boolean;
}

export function LeaderboardContent({ embedded = false }: Props) {
  const [days, setDays] = useState(30);
  const { data, isLoading, error, refetch } = useLeaderboard(days);

  return (
    <div className={embedded ? "" : "space-y-4"}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Trophy className="h-5 w-5 text-brand" />
          <h3 className="text-lg font-semibold text-foreground">Coordinator Leaderboard</h3>
        </div>
        <div className="inline-flex rounded-lg border border-border bg-surface/50 p-0.5 text-xs">
          {[7, 30, 90].map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={cn(
                "px-3 py-1 rounded-md font-medium transition-colors",
                days === d ? "bg-card text-brand shadow-sm" : "text-muted hover:text-foreground"
              )}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : error ? (
        <ErrorState title="Failed to load leaderboard" error={error as Error} onRetry={refetch} />
      ) : !data || data.rows.length === 0 ? (
        <EmptyState
          icon={Trophy}
          title="No activity in this window"
          description="Try extending the window, or wait for coordinators to pick up tickets and enquiries."
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface/50 text-left text-muted">
                <th className="px-4 py-2.5 font-medium">Coordinator</th>
                <th className="px-3 py-2.5 font-medium text-right">Tickets assigned</th>
                <th className="px-3 py-2.5 font-medium text-right">Resolved</th>
                <th className="px-3 py-2.5 font-medium text-right">Avg first response</th>
                <th className="px-3 py-2.5 font-medium text-right">Enquiries</th>
                <th className="px-3 py-2.5 font-medium text-right">Converted</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.userId} className="border-b border-border/50">
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      {r.avatar ? (
                        <img src={r.avatar} alt={r.name} className="h-7 w-7 rounded-full object-cover" />
                      ) : (
                        <div className="h-7 w-7 rounded-full bg-brand text-white text-[10px] flex items-center justify-center font-medium">
                          {r.name.split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase()}
                        </div>
                      )}
                      <div>
                        <p className="font-medium text-foreground">{r.name}</p>
                        <p className="text-xs text-muted">{r.role}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-right text-foreground">{r.ticketsAssigned}</td>
                  <td className="px-3 py-2.5 text-right text-emerald-700">{r.ticketsResolved}</td>
                  <td className="px-3 py-2.5 text-right text-muted">{formatMinutes(r.avgFirstResponseMin)}</td>
                  <td className="px-3 py-2.5 text-right text-foreground">{r.enquiriesTotal}</td>
                  <td className="px-3 py-2.5 text-right text-emerald-700">
                    {r.enquiriesConverted}
                    {r.enquiriesTotal > 0 && (
                      <span className="text-xs text-muted ml-1">
                        ({Math.round((r.enquiriesConverted / r.enquiriesTotal) * 100)}%)
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="px-4 py-2 text-xs text-muted">
            Sample size: {data.rows.reduce((s, r) => s + r.ticketsAssigned + r.enquiriesTotal, 0)} items over {data.days}d — smaller services naturally have smaller counts.
          </p>
        </div>
      )}
    </div>
  );
}
```

### Task 6.4: Wire the Leaderboard tab into /contact-centre

- [ ] **Step 1: Edit `src/app/(dashboard)/contact-centre/page.tsx`**

Near the other imports:
```tsx
import { useSession } from "next-auth/react";
import { isAdminRole } from "@/lib/role-permissions";
import { Trophy } from "lucide-react";

const LeaderboardContent = dynamic(
  () => import("@/components/contact-centre/LeaderboardContent").then((m) => ({ default: m.LeaderboardContent })),
  { loading: () => <Skeleton className="h-96 w-full" /> },
);
```

Extend the `TABS` const — keep it typed:
```tsx
const TABS = [
  { key: "enquiries", label: "Enquiries", icon: UserPlus },
  { key: "tickets", label: "Tickets", icon: MessageSquare },
  { key: "calls", label: "Calls", icon: Phone },
  { key: "leaderboard", label: "Leaderboard", icon: Trophy, adminOnly: true },
] as const;
```

Inside `ContactCentreContent`, add after the existing `const [activeTab, setActiveTab] = useState<TabKey>(...)`:
```tsx
const { data: session } = useSession();
const isAdmin = isAdminRole((session?.user as { role?: string } | undefined)?.role);
const visibleTabs = TABS.filter((t) => !("adminOnly" in t) || !t.adminOnly || isAdmin);
```

Replace `{TABS.map` with `{visibleTabs.map` in the tab-button loop.

Under the existing `{activeTab === "calls" && <CallsTab />}` line, add:
```tsx
{activeTab === "leaderboard" && isAdmin && <LeaderboardContent />}
```

If a non-admin user somehow ends up on `?tab=leaderboard`, they'll see nothing — acceptable behavior; server 403s the API anyway. Optionally guard the URL sync effect to reset non-admin users back to enquiries, but skip unless ux requires it.

### Task 6.5: Embed in /leadership (replace stub from commit 2)

- [ ] **Step 1: Edit `src/app/(dashboard)/leadership/page.tsx`**

Add import near the top:
```tsx
import { LeaderboardContent } from "@/components/contact-centre/LeaderboardContent";
```

Replace the stub section:
```tsx
{/* Section 4: Leaderboard — filled in commit 5 */}
<section className="rounded-xl border border-border bg-card p-6">
  <h3 className="text-lg font-semibold text-foreground mb-2">Coordinator Leaderboard</h3>
  <p className="text-sm text-muted italic">Leaderboard lands in a follow-up commit.</p>
</section>
```
with:
```tsx
<section className="rounded-xl border border-border bg-card p-6 space-y-4">
  <LeaderboardContent embedded />
</section>
```

### Task 6.6: Verify + commit

- [ ] **Step 1: Gate**

```bash
npm test -- --run 2>&1 | tail -5
npx tsc --noEmit 2>&1 | grep -c "error TS"
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/contact-centre/ src/components/contact-centre/LeaderboardContent.tsx src/hooks/useLeaderboard.ts src/__tests__/api/contact-centre-leaderboard.test.ts src/app/\(dashboard\)/contact-centre/page.tsx src/app/\(dashboard\)/leadership/page.tsx
git commit -m "$(cat <<'EOF'
feat(contact-centre): coordinator leaderboard tab

Admin-only Leaderboard tab on /contact-centre and embedded section on
/leadership, backed by /api/contact-centre/leaderboard. Per-coordinator
metrics (tickets assigned/resolved, avg first-response time, enquiries
total/converted) over a selectable 7/30/90-day window. Shows sample-size
caveat inline — small services naturally have smaller counts.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Chunk 7: Commit 6 — `feat(pulse): admin-tier visibility + per-service drill-down`

**Goal:** Admin-tier (owner/head_office/admin) can view an anonymous "All Services" pulse drill-down from `/communication → Weekly Pulse`. Shows sentiment counts per service + org-wide trend. **No individual staff names are exposed** in this view (per-user preference). The existing leader-only "Team Pulse" view — which does show names — is extended to include `head_office` for consistency with `ADMIN_ROLES` used elsewhere, keeping today's behavior for owner/admin and correcting the existing `head_office` omission.

**Files:**
- Create: `src/app/api/communication/pulse/admin-summary/route.ts`
- Create: `src/components/communication/PulseAdminView.tsx`
- Create: `src/__tests__/api/pulse-admin-summary.test.ts`
- Modify: `src/components/communication/WeeklyPulseTab.tsx` (+"All Services" view)
- Modify: `src/hooks/useCommunication.ts` (+`usePulseAdminSummary`)

### Task 7.1: API test — with explicit anonymity assertion

- [ ] **Step 1: Create `src/__tests__/api/pulse-admin-summary.test.ts`**

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession, mockNoSession } from "../helpers/auth-mock";
import { createRequest } from "../helpers/request";

vi.mock("@/lib/service-scope", () => ({
  getServiceScope: vi.fn(() => null),
  getStateScope: vi.fn(() => null),
}));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() => Promise.resolve({ limited: false, remaining: 59, resetIn: 60000 })),
}));
vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(),
    withRequestId: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }) },
  generateRequestId: () => "test-req-id",
}));

import { _clearUserActiveCache } from "@/lib/server-auth";
import { GET } from "@/app/api/communication/pulse/admin-summary/route";

function isoMonday(d: Date): Date {
  const out = new Date(d);
  const day = out.getDay();
  out.setDate(out.getDate() - day + (day === 0 ? -6 : 1));
  out.setHours(0, 0, 0, 0);
  return out;
}

describe("GET /api/communication/pulse/admin-summary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
  });

  it("returns 403 for coordinator", async () => {
    mockSession({ id: "u", name: "C", role: "coordinator" });
    const res = await GET(createRequest("GET", `/api/communication/pulse/admin-summary?weekOf=${isoMonday(new Date()).toISOString()}`));
    expect(res.status).toBe(403);
  });

  it("returns 400 without weekOf", async () => {
    mockSession({ id: "u1", name: "U", role: "owner" });
    const res = await GET(createRequest("GET", "/api/communication/pulse/admin-summary"));
    expect(res.status).toBe(400);
  });

  it("returns sentiment counts per service — NEVER includes user names or user IDs", async () => {
    mockSession({ id: "u1", name: "Owner", role: "owner" });
    const weekOf = isoMonday(new Date("2026-04-20T12:00:00Z"));

    prismaMock.service.findMany.mockResolvedValue([
      { id: "s1", name: "Centre A", code: "A" },
      { id: "s2", name: "Centre B", code: "B" },
    ]);
    // Count of pulses grouped server-side via findMany (we aggregate in app)
    prismaMock.weeklyPulse.findMany.mockResolvedValue([
      { id: "p1", mood: 5, blockers: null, user: { serviceId: "s1" } },
      { id: "p2", mood: 4, blockers: "something", user: { serviceId: "s1" } },
      { id: "p3", mood: 2, blockers: "hard week", user: { serviceId: "s2" } },
      { id: "p4", mood: null, blockers: null, user: { serviceId: "s2" } },
    ]);
    prismaMock.user.count.mockResolvedValue(10);
    // per-service active staff counts
    prismaMock.user.groupBy.mockResolvedValue([
      { serviceId: "s1", _count: { _all: 4 } },
      { serviceId: "s2", _count: { _all: 6 } },
    ]);

    const res = await GET(createRequest("GET", `/api/communication/pulse/admin-summary?weekOf=${weekOf.toISOString()}`));
    expect(res.status).toBe(200);
    const body = await res.json();

    // Anonymity check: serialised body must not contain any name/email/userId
    const raw = JSON.stringify(body);
    expect(raw).not.toMatch(/"name"/);
    expect(raw).not.toMatch(/"email"/);
    expect(raw).not.toMatch(/"userId"/);
    expect(raw).not.toMatch(/"user"\s*:/);

    expect(body.org.totalUsers).toBe(10);
    expect(body.org.submitted).toBe(4);
    expect(body.org.positive).toBe(2); // mood 4, 5
    expect(body.org.neutral).toBe(0);  // mood 3 (none)
    expect(body.org.concerning).toBe(1); // mood 2
    expect(body.org.blockerCount).toBe(2); // two non-null blockers

    const s1 = body.byService.find((r: { serviceId: string }) => r.serviceId === "s1");
    expect(s1.totalUsers).toBe(4);
    expect(s1.submitted).toBe(2);
    expect(s1.positive).toBe(2);
    expect(s1.concerning).toBe(0);
  });
});
```

- [ ] **Step 2: Run — must fail**

```bash
npm test -- --run src/__tests__/api/pulse-admin-summary.test.ts 2>&1 | tail -10
```

### Task 7.2: Implement route

- [ ] **Step 1: Create `src/app/api/communication/pulse/admin-summary/route.ts`**

```ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ADMIN_ROLES } from "@/lib/role-permissions";

/**
 * GET /api/communication/pulse/admin-summary?weekOf=ISO
 *
 * Admin-tier anonymous pulse summary: sentiment counts + blocker count,
 * org-wide and per-service. NEVER exposes individual staff names, emails,
 * or userIds — this is an explicit anonymity guarantee backed by a unit test.
 *
 * Sentiment buckets:
 *   positive   → mood in {4, 5}
 *   neutral    → mood === 3
 *   concerning → mood in {1, 2}
 *   submitted without mood → counted only in `submitted`
 *
 * Use /api/communication/pulse/summary for the leader-tier view with names.
 */
export const GET = withApiAuth(async (req) => {
  const { searchParams } = new URL(req.url);
  const weekOfRaw = searchParams.get("weekOf");
  if (!weekOfRaw) {
    return NextResponse.json({ error: "weekOf query parameter is required" }, { status: 400 });
  }
  const weekOf = new Date(weekOfRaw);
  if (Number.isNaN(weekOf.getTime())) {
    return NextResponse.json({ error: "weekOf is not a valid date" }, { status: 400 });
  }

  const [services, pulses, totalUsers, perServiceUserCounts] = await Promise.all([
    prisma.service.findMany({
      where: { status: "active" },
      select: { id: true, name: true, code: true },
      orderBy: { name: "asc" },
    }),
    prisma.weeklyPulse.findMany({
      where: { weekOf, submittedAt: { not: null } },
      select: {
        id: true,
        mood: true,
        blockers: true,
        user: { select: { serviceId: true } },
      },
    }),
    prisma.user.count({ where: { active: true } }),
    prisma.user.groupBy({
      by: ["serviceId"],
      where: { active: true, serviceId: { not: null } },
      _count: { _all: true },
    }),
  ]);

  function bucket(mood: number | null) {
    if (mood == null) return "unknown" as const;
    if (mood >= 4) return "positive" as const;
    if (mood === 3) return "neutral" as const;
    return "concerning" as const;
  }

  function aggregate(subset: typeof pulses) {
    let positive = 0, neutral = 0, concerning = 0, blockerCount = 0;
    for (const p of subset) {
      const b = bucket(p.mood);
      if (b === "positive") positive += 1;
      else if (b === "neutral") neutral += 1;
      else if (b === "concerning") concerning += 1;
      if (p.blockers && p.blockers.trim().length > 0) blockerCount += 1;
    }
    return { submitted: subset.length, positive, neutral, concerning, blockerCount };
  }

  const orgAgg = aggregate(pulses);
  const byService = services.map((s) => {
    const subset = pulses.filter((p) => p.user?.serviceId === s.id);
    const userCount = perServiceUserCounts.find((g) => g.serviceId === s.id)?._count._all ?? 0;
    const agg = aggregate(subset);
    return {
      serviceId: s.id,
      serviceName: s.name,
      serviceCode: s.code,
      totalUsers: userCount,
      ...agg,
    };
  });

  return NextResponse.json({
    weekOf: weekOf.toISOString(),
    org: {
      totalUsers,
      ...orgAgg,
    },
    byService,
  });
}, { roles: [...ADMIN_ROLES] });
```

- [ ] **Step 2: Run — must pass**

```bash
npm test -- --run src/__tests__/api/pulse-admin-summary.test.ts 2>&1 | tail -10
```

### Task 7.3: Hook

- [ ] **Step 1: Append to `src/hooks/useCommunication.ts`**

At the end of the file, add:
```ts
// ═══════════════════════════════════════════════════════════════════════════════
// WEEKLY PULSE — ADMIN VIEW (anonymous)
// ═══════════════════════════════════════════════════════════════════════════════

export interface PulseServiceRow {
  serviceId: string;
  serviceName: string;
  serviceCode: string;
  totalUsers: number;
  submitted: number;
  positive: number;
  neutral: number;
  concerning: number;
  blockerCount: number;
}

export interface PulseAdminSummary {
  weekOf: string;
  org: {
    totalUsers: number;
    submitted: number;
    positive: number;
    neutral: number;
    concerning: number;
    blockerCount: number;
  };
  byService: PulseServiceRow[];
}

export function usePulseAdminSummary(weekOf: string, enabled: boolean) {
  return useQuery<PulseAdminSummary>({
    queryKey: ["pulse-admin-summary", weekOf],
    queryFn: () =>
      fetchApi<PulseAdminSummary>(`/api/communication/pulse/admin-summary?weekOf=${weekOf}`),
    enabled: enabled && !!weekOf,
    retry: 2,
  });
}
```

### Task 7.4: PulseAdminView component

- [ ] **Step 1: Create `src/components/communication/PulseAdminView.tsx`**

```tsx
"use client";

import { usePulseAdminSummary, type PulseServiceRow } from "@/hooks/useCommunication";
import { Skeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/ErrorState";
import { Smile, Meh, Frown, AlertTriangle, Users } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  weekOf: string;
}

function SentimentBar({ row, total }: { row: PulseServiceRow; total: number }) {
  if (total === 0) return <div className="h-2 bg-border rounded-full" />;
  const pos = (row.positive / total) * 100;
  const neu = (row.neutral / total) * 100;
  const con = (row.concerning / total) * 100;
  return (
    <div className="h-2 w-full rounded-full bg-border overflow-hidden flex">
      <div className="h-full bg-emerald-500" style={{ width: `${pos}%` }} />
      <div className="h-full bg-amber-400" style={{ width: `${neu}%` }} />
      <div className="h-full bg-red-500" style={{ width: `${con}%` }} />
    </div>
  );
}

export function PulseAdminView({ weekOf }: Props) {
  const { data, isLoading, error, refetch } = usePulseAdminSummary(weekOf, true);

  if (isLoading) return <Skeleton className="h-96 w-full" />;
  if (error) return <ErrorState title="Failed to load admin pulse view" error={error as Error} onRetry={refetch} />;
  if (!data) return null;

  return (
    <div className="space-y-5">
      {/* Org-wide counts */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-muted" />
            <span className="text-xs text-muted">Submitted</span>
          </div>
          <p className="text-2xl font-bold text-foreground mt-1">
            {data.org.submitted} <span className="text-sm text-muted">/ {data.org.totalUsers}</span>
          </p>
        </div>
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
          <div className="flex items-center gap-2">
            <Smile className="h-4 w-4 text-emerald-600" />
            <span className="text-xs text-emerald-700">Positive</span>
          </div>
          <p className="text-2xl font-bold text-emerald-700 mt-1">{data.org.positive}</p>
        </div>
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
          <div className="flex items-center gap-2">
            <Meh className="h-4 w-4 text-amber-600" />
            <span className="text-xs text-amber-700">Neutral</span>
          </div>
          <p className="text-2xl font-bold text-amber-700 mt-1">{data.org.neutral}</p>
        </div>
        <div className="rounded-lg border border-red-200 bg-red-50 p-3">
          <div className="flex items-center gap-2">
            <Frown className="h-4 w-4 text-red-600" />
            <span className="text-xs text-red-700">Concerning</span>
          </div>
          <p className="text-2xl font-bold text-red-700 mt-1">{data.org.concerning}</p>
        </div>
      </div>

      {data.org.blockerCount > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 flex items-start gap-2">
          <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-amber-800">
              {data.org.blockerCount} blocker{data.org.blockerCount === 1 ? "" : "s"} flagged this week
            </p>
            <p className="text-xs text-amber-700 mt-0.5">
              Drill into a service for per-service breakdowns. Individual responses are visible only to service leaders in the Team Pulse view.
            </p>
          </div>
        </div>
      )}

      {/* Per-service table */}
      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-surface/50 text-left text-muted">
              <th className="px-4 py-2.5 font-medium">Service</th>
              <th className="px-3 py-2.5 font-medium text-right">Submitted</th>
              <th className="px-3 py-2.5 font-medium">Sentiment</th>
              <th className="px-3 py-2.5 font-medium text-right">Blockers</th>
            </tr>
          </thead>
          <tbody>
            {data.byService.map((row) => (
              <tr key={row.serviceId} className="border-b border-border/50">
                <td className="px-4 py-2.5 font-medium text-foreground">{row.serviceName}</td>
                <td className="px-3 py-2.5 text-right text-foreground whitespace-nowrap">
                  {row.submitted} / {row.totalUsers}
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-3">
                    <SentimentBar row={row} total={row.submitted} />
                    <div className="flex items-center gap-1.5 text-xs whitespace-nowrap">
                      <span className="text-emerald-700">{row.positive}</span>
                      <span className="text-amber-700">/ {row.neutral}</span>
                      <span className="text-red-700">/ {row.concerning}</span>
                    </div>
                  </div>
                </td>
                <td className={cn(
                  "px-3 py-2.5 text-right font-medium whitespace-nowrap",
                  row.blockerCount > 0 ? "text-amber-700" : "text-muted"
                )}>
                  {row.blockerCount}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-muted italic">
        Anonymous admin view — individual staff names and response content are never shown here. For named responses (leader-tier only), use the Team Pulse view.
      </p>
    </div>
  );
}
```

### Task 7.5: Wire admin view into WeeklyPulseTab

- [ ] **Step 1: Edit `src/components/communication/WeeklyPulseTab.tsx`**

Imports:
```tsx
import { isAdminRole } from "@/lib/role-permissions";
import { PulseAdminView } from "./PulseAdminView";
```

Find the line:
```tsx
const isLeader = userRole === "owner" || userRole === "admin";
```
Replace with:
```tsx
const isLeader = userRole === "owner" || userRole === "admin" || userRole === "head_office";
const isAdmin = isAdminRole(userRole);
```

Change the view state type:
```tsx
const [view, setView] = useState<"my" | "team" | "admin">("my");
```

In the view switcher (the `<div className="inline-flex ...">` containing My Pulse / Team Pulse buttons), add a third button after the Team Pulse button, admin-only:
```tsx
{isAdmin && (
  <button
    onClick={() => setView("admin")}
    className={cn(
      "px-4 py-1.5 rounded-md text-sm font-medium transition-colors",
      view === "admin" ? "bg-brand text-white shadow-sm" : "text-muted hover:text-foreground"
    )}
  >
    All Services
  </button>
)}
```

Then in the render block:
```tsx
<div className="rounded-xl border border-border bg-card p-6">
  {view === "my" ? <MyPulseView /> : view === "team" ? <TeamPulseView /> : <PulseAdminView weekOf={weekOf} />}
</div>
```

### Task 7.6: Verify + commit

- [ ] **Step 1: Gate**

```bash
npm test -- --run 2>&1 | tail -5
npx tsc --noEmit 2>&1 | grep -c "error TS"
```
Expected: all green. The anonymity regex assertions in the test file are the safety net — they'll break loudly if anyone refactors the route to include names.

- [ ] **Step 2: Commit**

```bash
git add src/app/api/communication/pulse/admin-summary/ src/components/communication/PulseAdminView.tsx src/components/communication/WeeklyPulseTab.tsx src/hooks/useCommunication.ts src/__tests__/api/pulse-admin-summary.test.ts
git commit -m "$(cat <<'EOF'
feat(pulse): admin-tier visibility + per-service drill-down

Owner/head_office/admin get a third "All Services" view on /communication
→ Weekly Pulse showing org-wide sentiment (positive/neutral/concerning
counts) and per-service breakdown. NEVER exposes individual staff names
— response is strictly aggregated and the test enforces this with a
stringify-then-regex anonymity assertion. The leader-tier Team Pulse
view (with names) is unchanged, but its gating fix now includes
head_office consistent with ADMIN_ROLES elsewhere.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Chunk 8: Commit 7 — `feat(team): extend Action Required widget with Pulse responses awaiting review card`

**Goal:** Add a 5th card to the existing Action Required widget on `/team`: "N concerning pulse responses this week" (mood ≤ 2, current week only). Admin-tier sees org-wide count; coordinators see their service only (consistent with the existing widget's scoping).

**Files:**
- Modify: `src/app/api/team/action-counts/route.ts` (+`pulsesConcerning`)
- Modify: `src/components/team/ActionRequiredWidget.tsx` (+5th card, grid → 5 cols)
- Modify: `src/__tests__/api/team-action-counts.test.ts` (extend existing file — already has coverage for the 4 existing counts; we append 2 new cases for `pulsesConcerning` + update the two `toEqual` assertions to include `pulsesConcerning: 0`)

### Task 8.1: Confirm existing test file exists

- [ ] **Step 1: Confirm path**

```bash
ls src/__tests__/api/team-action-counts.test.ts
```
Expected: file exists. This file already covers auth, admin, coordinator, owner, head_office, staff, and no-serviceId cases for the 4 existing counters. We will extend it.

### Task 8.2: Extend the existing test with failing cases for `pulsesConcerning`

- [ ] **Step 1: Update the two `toEqual({...})` assertions** in the "admin sees org-wide counts" and "coordinator sees service-scoped counts" and other `body).toEqual` blocks to include `pulsesConcerning: 0` — those tests currently don't mock `weeklyPulse.count` at all, so they'd fail with the new route returning `undefined` for the new field. Update each to mock `prismaMock.weeklyPulse.count.mockResolvedValue(0)` and add `pulsesConcerning: 0` to the expected object.

Concretely, open `src/__tests__/api/team-action-counts.test.ts` and:
1. For the `"admin sees org-wide counts (no scoping in Prisma where clause)"` test — add `prismaMock.weeklyPulse.count.mockResolvedValue(0);` next to the other count mocks and add `pulsesConcerning: 0,` into the `toEqual` object.
2. Same for `"coordinator sees service-scoped counts"`, `"staff user gets counts scoped to their serviceId..."`, and any other test with a `body).toEqual({...})` shape check.

- [ ] **Step 2: Append two new test cases** at the end of the same `describe` block:

```ts
it("returns pulsesConcerning for admin (org-wide, mood<=2, current week filter)", async () => {
  mockSession({ id: "u1", name: "Owner", role: "owner" });
  prismaMock.complianceCertificate.count.mockResolvedValue(0);
  prismaMock.leaveRequest.count.mockResolvedValue(0);
  prismaMock.timesheet.count.mockResolvedValue(0);
  prismaMock.shiftSwapRequest.count.mockResolvedValue(0);
  prismaMock.weeklyPulse.count.mockResolvedValue(3);

  const res = await GET(createRequest("GET", "/api/team/action-counts"));
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.pulsesConcerning).toBe(3);

  const call = prismaMock.weeklyPulse.count.mock.calls[0][0];
  expect(call.where.mood).toEqual({ lte: 2 });
  expect(call.where.submittedAt).toEqual({ not: null });
  // Current-week weekOf filter present
  expect(call.where.weekOf?.gte).toBeInstanceOf(Date);
  // Admin: no service scoping
  expect(call.where.user).toBeUndefined();
});

it("scopes pulsesConcerning for coordinator via user.serviceId", async () => {
  mockSession({ id: "u2", name: "Coord", role: "coordinator", serviceId: "svc-1" });
  prismaMock.complianceCertificate.count.mockResolvedValue(0);
  prismaMock.leaveRequest.count.mockResolvedValue(0);
  prismaMock.timesheet.count.mockResolvedValue(0);
  prismaMock.shiftSwapRequest.count.mockResolvedValue(0);
  prismaMock.weeklyPulse.count.mockResolvedValue(1);

  const res = await GET(createRequest("GET", "/api/team/action-counts"));
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.pulsesConcerning).toBe(1);

  const call = prismaMock.weeklyPulse.count.mock.calls[0][0];
  expect(call.where.user).toEqual({ serviceId: "svc-1" });
});
```

- [ ] **Step 3: Run — must fail on the new assertions**

```bash
npm test -- --run src/__tests__/api/team-action-counts.test.ts 2>&1 | tail -20
```
Expected: the two new tests fail (`pulsesConcerning` is `undefined`), plus the existing tests fail on the updated `toEqual` shape. All fail-paths confirm the test file is wired to the new expectations before we touch the route.

### Task 8.3: Update the route

- [ ] **Step 1: Edit `src/app/api/team/action-counts/route.ts`**

Inside the `Promise.all`, add a fifth query for `pulsesConcerning`. The "current week" starts at ISO Monday. Add after the `shiftSwapRequest.count` block:
```ts
prisma.weeklyPulse.count({
  where: {
    submittedAt: { not: null },
    mood: { lte: 2 },
    weekOf: { gte: startOfIsoWeek() },
    ...(scopedServiceId
      ? { user: { serviceId: scopedServiceId } }
      : {}),
  },
}),
```
Add a helper at the bottom of the file:
```ts
function startOfIsoWeek(): Date {
  const d = new Date();
  const day = d.getDay();
  d.setDate(d.getDate() - day + (day === 0 ? -6 : 1));
  d.setHours(0, 0, 0, 0);
  return d;
}
```

Update the destructuring + response:
```ts
const [certsExpiring, leavePending, timesheetsPending, shiftSwapsPending, pulsesConcerning] =
  await Promise.all([...]);

return NextResponse.json({
  certsExpiring,
  leavePending,
  timesheetsPending,
  shiftSwapsPending,
  pulsesConcerning,
});
```

- [ ] **Step 2: Run — must pass**

```bash
npm test -- --run src/__tests__/api/action-counts.test.ts 2>&1 | tail -10
```

### Task 8.4: Update widget with 5th card

- [ ] **Step 1: Edit `src/components/team/ActionRequiredWidget.tsx`**

Import the new icon:
```tsx
import { Shield, Calendar, Clock, RefreshCw, HeartPulse } from "lucide-react";
```

Extend the interface:
```ts
interface ActionCounts {
  certsExpiring: number;
  leavePending: number;
  timesheetsPending: number;
  shiftSwapsPending: number;
  pulsesConcerning: number;
}
```

Destructure the new field + include in the all-zero short-circuit:
```tsx
const { certsExpiring, leavePending, timesheetsPending, shiftSwapsPending, pulsesConcerning } = data;
if (
  certsExpiring === 0 &&
  leavePending === 0 &&
  timesheetsPending === 0 &&
  shiftSwapsPending === 0 &&
  pulsesConcerning === 0
) {
  return null;
}
```

Change the outer grid to 5 columns on large screens:
```tsx
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
```

Add a 5th card after the shift-swap card:
```tsx
<Link
  href="/communication?tab=pulse"
  className="border rounded-lg p-4 bg-white hover:bg-rose-50 transition flex items-center gap-3"
>
  <HeartPulse className="h-8 w-8 text-rose-600" />
  <div>
    <div className="text-2xl font-semibold">{pulsesConcerning}</div>
    <div className="text-sm text-gray-600">
      concerning pulse responses this week
    </div>
  </div>
</Link>
```

### Task 8.5: Verify + commit

- [ ] **Step 1: Gate**

```bash
npm test -- --run 2>&1 | tail -5
npx tsc --noEmit 2>&1 | grep -c "error TS"
npm run lint 2>&1 | tail -3
```
Expected: all green, including the existing team-action-counts tests (now updated to expect the 5th field).

- [ ] **Step 2: Commit**

```bash
git add src/app/api/team/action-counts/route.ts src/components/team/ActionRequiredWidget.tsx src/__tests__/api/team-action-counts.test.ts
git commit -m "$(cat <<'EOF'
feat(team): extend Action Required widget with Pulse responses card

Fifth card on /team's Action Required widget: "N concerning pulse
responses this week" (mood ≤ 2 in the current ISO week). Admin-tier
sees org-wide; coordinator/member see only their service — consistent
with the widget's existing scoping. Links to /communication?tab=pulse
so reviewers land on the pulse surface directly.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Chunk 9: Final Gate, Rebase, Push, PR

### Task 9.1: Full gate one more time

- [ ] **Step 1: Run full gate from inside worktree**

```bash
npm test -- --run 2>&1 | tail -5
npx tsc --noEmit 2>&1 | grep -c "error TS"
npm run lint 2>&1 | tail -3
npm run build 2>&1 | tail -15
```
Expected:
- Vitest: baseline+40ish passing, 0 failed.
- tsc: 0 errors.
- Lint: clean or unchanged from baseline.
- Build: `✓ Compiled successfully` and prisma generate succeeds. If build fails on `prisma migrate deploy`, that's a red herring from the `build` script — just confirm `next build` itself passed. If it did NOT, investigate before pushing.

### Task 9.2: Rebase on origin/main

- [ ] **Step 1: Fetch + check for drift**

```bash
git fetch origin
git log origin/main --oneline -5
```
Note the new tip — may be past `38fd0b2` if #5 or #7 has merged.

- [ ] **Step 2: Rebase**

```bash
git rebase origin/main
```
If conflicts occur — expected files:
- `src/lib/role-permissions.ts` — add `/leadership` back in the `allPages` block; accept both sets of additions
- `src/lib/nav-config.ts` — keep both the Leadership item and whatever #5/#7 added
- `src/components/team/ActionRequiredWidget.tsx` — unlikely; if #3b added the 4th card and we added 5th, merge the card list additively. Grid col count may need `lg:grid-cols-5` vs. whatever exists.
- `src/app/api/team/action-counts/route.ts` — merge the Promise.all + response fields additively

Resolve by combining both sides (no one is "dropping" changes — all additions are additive). Run `git rebase --continue` after each resolution.

- [ ] **Step 3: Re-run gate**

```bash
npm test -- --run 2>&1 | tail -5
npx tsc --noEmit 2>&1 | grep -c "error TS"
```
Expected: still clean after rebase. If a test fails because a sibling PR renamed a symbol we import, fix by updating the import. Do not revert our work.

### Task 9.3: Push + open PR

- [ ] **Step 1: Push the branch**

```bash
git push -u origin feat/scorecard-pulse-admin-2026-04-22
```
Expected: branch pushed, remote tracks. If push is rejected because the branch already exists (from a previous attempt), force-with-lease: `git push --force-with-lease`.

- [ ] **Step 2: Open PR via gh**

Before running `gh pr create`, compute the before/after for the PR body. Record the baseline test count (saved earlier to `/tmp/sub9-baseline.txt`) and the final count; diff them for the "added tests" number.

```bash
gh pr create --title "feat: Sub-project 9 — scorecard + contact centre + leadership + pulse admin" --body "$(cat <<'EOF'
## Summary

Ships 7 stacked commits closing admin visibility gaps without schema changes:

- **`/leadership`** — new admin landing page with Org KPIs, quarterly rocks rollup, pulse sentiment trend, and coordinator leaderboard
- **Scorecard** — new Org Rollup tab (admin) + clickable measurables opening a 12-week trend drawer
- **Contact Centre** — Leaderboard tab (admin) with per-coordinator metrics over 7/30/90d windows
- **Pulse** — admin-tier "All Services" view with anonymous sentiment breakdowns per service (individual names NEVER surface — enforced by unit test regex)
- **Team widget** — 5th card for "concerning pulse responses this week"

## Before / After

| | Before | After |
|---|---|---|
| Tests | 1298 | REPLACE_ME |
| tsc errors | 0 | 0 |
| Admin `/leadership` page | ❌ | ✅ |
| Scorecard org-wide view | ❌ | ✅ (admin-only) |
| Measurable trend chart | ❌ | ✅ (any viewer) |
| Coordinator leaderboard | ❌ | ✅ (admin-only) |
| Pulse admin cross-service view | ❌ | ✅ (admin-only, anonymous) |
| Action Required widget cards | 4 | 5 |
| Prisma migrations | N/A | 0 (pure aggregation) |

## Commits

1. `feat(api): /api/leadership/overview — org-wide KPI aggregator`
2. `feat(leadership): /leadership landing page + role-permissions registration`
3. `feat(scorecard): org-wide rollup view across services`
4. `feat(scorecard): historical trend charts per measurable`
5. `feat(contact-centre): coordinator leaderboard tab`
6. `feat(pulse): admin-tier visibility + per-service drill-down`
7. `feat(team): extend Action Required widget with Pulse responses awaiting review card`

## Anonymity guarantee

The admin-tier pulse view (commit 6) **must not** expose individual staff names. The test at `src/__tests__/api/pulse-admin-summary.test.ts` enforces this with a regex over the serialised response body — it will break loudly if the route is ever refactored to include names.

## Test plan

- [ ] Load `/leadership` as admin → see KPI tiles, rocks rollup, sentiment chart, leaderboard
- [ ] Load `/leadership` as staff → sidebar hides the link (page otherwise inaccessible via nav)
- [ ] On `/scorecard` as admin → "Org Rollup" tab appears; click it → measurable matrix with per-service columns
- [ ] Click any measurable title on `/scorecard` → 12-week trend drawer opens
- [ ] On `/contact-centre` as admin → Leaderboard tab appears; switch between 7/30/90d windows
- [ ] On `/communication` → Weekly Pulse as admin → "All Services" toggle shows anonymous per-service sentiment
- [ ] On `/team` → 5th "concerning pulses" card appears when any concerning pulses exist this week

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```
Replace `REPLACE_ME` with the final test count BEFORE running (edit the body string in-place or append). Expected: PR URL returned.

### Task 9.4: Merge + cleanup

- [ ] **Step 1: Wait for CI green + Jayden approval**

Watch CI on the PR. If CI fails:
- Test failure → pull down diffs, fix, push.
- Type error from a rebased-in change → update the offending import/symbol, push.
Do NOT merge red.

- [ ] **Step 2: After approval — standard merge (not squash)**

```bash
gh pr merge <PR#> --merge --delete-branch
```
Expected: merge commit created; remote branch deleted; local branch remains (delete manually if desired).

- [ ] **Step 3: Back in main checkout, update + clean worktree**

```bash
cd /Users/jaydenkowaider/Developer/amana-eos-dashboard
git checkout main
git pull origin main
git worktree remove .worktrees/scorecard-pulse-admin
git branch -D feat/scorecard-pulse-admin-2026-04-22
```
Expected: `main` now contains all 7 commits; worktree directory gone; local feature branch deleted.

- [ ] **Step 4: Sanity-check post-merge**

```bash
npm test -- --run 2>&1 | tail -5
npx tsc --noEmit 2>&1 | grep -c "error TS"
```
Expected: same counts as the PR reported.

---

## Risk checklist (re-read before claiming done)

- [ ] `/leadership` 403s (or sidebar-hides) for non-admin roles — verified via role-permissions.ts registration
- [ ] Scorecard rollup tab only renders for admin — guarded client-side with `isAdminRole`
- [ ] Measurable trend endpoint does NOT allow writing — only `GET` exported
- [ ] Leaderboard — `supportTicket.assignedToId` can be null in prod — filtered via `{ not: null }`
- [ ] Pulse admin view — anonymity test passes; response body regex-free of `"name"`, `"email"`, `"userId"`, `"user":`
- [ ] Team widget — grid gracefully handles 4-card case for coordinator/member scoping (empty pulse count hidden by all-zero short-circuit) — confirmed in existing widget logic
- [ ] All commit messages pass hook (no force-amend)
- [ ] PR body's test count correctly filled in (no `REPLACE_ME`)

---

*End of plan.*
