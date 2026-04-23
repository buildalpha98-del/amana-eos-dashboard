# Sub-project 8b — AI Drafts Dashboard + Decompositions + Zero-Test Coverage

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship commits 5-14 of spec 8 — admin AI drafts dashboard + meetings/onboarding decomposition + "All Queues" grouping + issues spawnedTodos interactivity + ~50 new tests across 5 previously-untested modules.

**Architecture:** Five independent modules, each module gets a feature commit + a test commit. No schema changes. Reuses existing `AiTaskDraft`, `Meeting`, `OnboardingPack`, `AutomationReport`, `Issue` models.

**Tech Stack:** Next.js 16 App Router, React Query (TanStack), Prisma 5.22, Zod, Tailwind, Vitest.

**Spec:** [`docs/superpowers/specs/2026-04-22-ai-queue-ops-8-design.md`](../specs/2026-04-22-ai-queue-ops-8-design.md) — Commits 5-14 section.

**Baseline:** origin/main @ `07bfc03` (PR-8a merged); 1653 tests passing, 3 skipped, 0 tsc errors, build green.

**Branch:** `feat/ai-queue-ops-8b-2026-04-22` (worktree at `.worktrees/ai-queue-ops-8b/`).

---

## Context discovery results (saves the implementer time)

1. **AI drafts**: Existing `GET /api/ai-drafts` is USER-scoped (drafts for tasks assigned to current user). `PATCH /api/ai-drafts/[id]` cascades status="accepted" → source task completion. `AiDraftReviewPanel` (248 lines) is props-driven, reusable inline. No `/admin/ai-drafts` page exists. No role-permissions entry.

2. **Meetings page (2706 lines)**: 13 inline section components already defined (`MeetingListView`, `SegueSection`, `ScorecardSection`, `RockReviewSection`, `HeadlinesSection`, `TodoReviewSection`, `IDSSection`, `ConcludeSection`, `MeetingOutcomesPanel`, `ActiveMeetingView`, `StartMeetingDialog`, `useTimer`, plus the root `MeetingsPage`). Data via hooks (no inline Prisma). Shared `useTimer()` ref needs externalizing. `src/components/meetings/` dir does not exist.

3. **Onboarding page (1667 lines)**: **Only 3 tabs exist — `onboarding` | `lms` | `exit-surveys`**, not 5. Spec mentioned 5 tabs; correct that. `ExitSurveyDashboard` is already extracted. `WelcomeTour.tsx` exists in `src/components/onboarding/` but is NOT in the main page — it's a separate flow. So the decomposition is: extract the `onboarding` tab + the `lms` tab. Don't create `WelcomeTourTab` or `ExitSurveyTab` — they already exist.

4. **Queue page (512 lines)**: **"All Queues" toggle already exists** (page lines 235+296-307, backend supports `view=all`). The COMMIT 11 work is to ENHANCE the admin view with per-service GROUPING/columns, not to build the toggle.

5. **IssueCard (203 lines)**: **Already shows `issue._count.spawnedTodos`** as a count badge (lines 162-165). COMMIT 13 work is to make it INTERACTIVE — clicking the badge opens the Issue detail panel with the `spawnedTodos` list visible.

6. **Zero-test modules**: meetings, onboarding, queue, issues, ai-drafts, internal-feedback. (internal-feedback got coverage in 8a — skip.) That leaves 5 modules. Target: ≥10 tests per module → ≥50 total.

7. **Bulk endpoint pattern** (from `api/issues/bulk/route.ts`): POST with `{ action: enum, ids: string[], ...extras }`, `switch(action)` + `updateMany()` per action, single audit log entry.

---

## File Structure

**New files (by commit):**

- Commit 5 (AI dashboard):
  - `src/app/api/ai-drafts/admin/route.ts` (admin-scoped GET)
  - `src/hooks/useAdminAiDrafts.ts`
  - `src/app/(dashboard)/admin/ai-drafts/page.tsx`
  - `src/app/(dashboard)/admin/ai-drafts/AiDraftsInboxContent.tsx`
- Commit 6 (bulk): `src/app/api/ai-drafts/bulk/route.ts`
- Commit 7 (meetings decompose):
  - `src/components/meetings/useTimer.ts` (hook extraction)
  - `src/components/meetings/MeetingListView.tsx`
  - `src/components/meetings/SegueSection.tsx`
  - `src/components/meetings/ScorecardSection.tsx`
  - `src/components/meetings/RockReviewSection.tsx`
  - `src/components/meetings/HeadlinesSection.tsx`
  - `src/components/meetings/TodoReviewSection.tsx`
  - `src/components/meetings/IDSSection.tsx`
  - `src/components/meetings/ConcludeSection.tsx`
  - `src/components/meetings/MeetingOutcomesPanel.tsx`
  - `src/components/meetings/ActiveMeetingView.tsx`
  - `src/components/meetings/StartMeetingDialog.tsx`
  - `src/components/meetings/sections.ts` (shared `L10_SECTIONS` const)
  - `src/components/meetings/types.ts` (shared types)
- Commit 8 (meetings tests):
  - `src/__tests__/api/meetings.test.ts`
  - `src/__tests__/components/meetings/useTimer.test.ts`
  - `src/__tests__/components/meetings/ScorecardSection.test.tsx` (smoke)
  - `src/__tests__/components/meetings/TodoReviewSection.test.tsx` (smoke)
- Commit 9 (onboarding decompose):
  - `src/components/onboarding/OnboardingPacksTab.tsx`
  - `src/components/onboarding/LmsCoursesTab.tsx`
  - (ExitSurveyDashboard already exists as component — keep as-is.)
- Commit 10 (onboarding tests):
  - `src/__tests__/api/onboarding-packs.test.ts`
  - `src/__tests__/api/onboarding-assign.test.ts`
  - `src/__tests__/components/onboarding/OnboardingPacksTab.test.tsx` (smoke)
- Commit 11 (queue per-service grouping): no new files — enhance `queue/page.tsx` with per-service grouped view when `view=all`
- Commit 12 (queue tests):
  - `src/__tests__/api/queue.test.ts`
  - `src/__tests__/api/queue-complete.test.ts`
- Commit 13 (issues spawnedTodos clickable): no new files — enhance `IssueCard.tsx` + `IssueDetailPanel.tsx` (if exists) to surface spawnedTodos on click
- Commit 14 (issues tests):
  - `src/__tests__/api/issues.test.ts`
  - `src/__tests__/api/issues-bulk.test.ts`

**Modified files:**

- `src/lib/role-permissions.ts` — add `/admin/ai-drafts` to `allPages`
- `src/lib/nav-config.ts` — add "AI Drafts" admin nav item with `Bot` icon
- `src/app/(dashboard)/meetings/page.tsx` — reduce from 2706 → ~400 lines of orchestration
- `src/app/(dashboard)/onboarding/page.tsx` — reduce from 1667 → ~250 lines
- `src/app/(dashboard)/queue/page.tsx` — add per-service grouping when in "All Queues" admin view
- `src/components/issues/IssueCard.tsx` — make spawnedTodos count badge clickable
- (Possibly) `src/components/issues/IssueDetailPanel.tsx` if spawnedTodos not already surfaced there

---

## Conventions (non-negotiable — inherited from 8a)

1. `withApiAuth(handler, { roles: [...] })` or `authenticateCowork()` for all routes
2. `parseJsonBody(req)` not raw `req.json()`
3. `ApiError.*` static factories for errors
4. `mutateApi`/`fetchApi` — zero raw `fetch` in hooks
5. Every `useQuery` has `retry: 2` + `staleTime: 30_000`
6. Every `useMutation` has `onError` destructive toast
7. Query keys use primitives, namespaced (e.g. `["ai-drafts", "admin", filters.status]`)
8. Zod on all write bodies; enums for closed sets
9. `logger.warn/error` from `@/lib/logger`; no `console.*`
10. No `as Role`/`as any` — use `parseRole()` / `isAdminRole()`
11. Test mocks: `vi.mock("@/lib/rate-limit", ...)`, `vi.mock("@/lib/logger", ...)`, `_clearUserActiveCache()` in `beforeEach`
12. Decomposition discipline: preserve every existing behaviour; pre + post line counts in commit body

---

## Chunk 1: Commits 5-6 — AI drafts admin dashboard

### Task 1: Backend — admin-scoped GET

**Files:**
- Create: `src/app/api/ai-drafts/admin/route.ts`
- Create: `src/__tests__/api/ai-drafts-admin.test.ts`

- [ ] **Step 1: Write the failing tests first**

Create `src/__tests__/api/ai-drafts-admin.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "@/__tests__/helpers/prisma-mock";
import { mockSession, mockNoSession, type MockUserRole } from "@/__tests__/helpers/auth-mock";
import { createRequest } from "@/__tests__/helpers/request";

vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: vi.fn(() => ({ limited: false })) }));
vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  generateRequestId: () => "test-req-id",
}));

import { GET } from "@/app/api/ai-drafts/admin/route";
import { _clearUserActiveCache } from "@/lib/server-auth";

describe("GET /api/ai-drafts/admin", () => {
  beforeEach(() => {
    _clearUserActiveCache();
    vi.clearAllMocks();
    prismaMock.user.findUnique.mockResolvedValue({ id: "u1", active: true, role: "owner" });
  });

  it("returns 401 unauthenticated", async () => {
    mockNoSession();
    const req = createRequest("GET", "/api/ai-drafts/admin");
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it.each([
    ["owner", 200],
    ["head_office", 200],
    ["admin", 200],
    ["coordinator", 403],
    ["member", 403],
    ["staff", 403],
    ["marketing", 403],
  ])("role %s → %i", async (role, expected) => {
    mockSession({ id: "u1", name: "U", role: role as MockUserRole });
    prismaMock.user.findUnique.mockResolvedValue({ id: "u1", active: true, role });
    prismaMock.aiTaskDraft.findMany.mockResolvedValue([]);
    prismaMock.aiTaskDraft.count.mockResolvedValue(0);

    const req = createRequest("GET", "/api/ai-drafts/admin");
    const res = await GET(req);
    expect(res.status).toBe(expected);
  });

  it("returns paginated drafts with default status=ready", async () => {
    mockSession({ id: "u1", name: "Owner", role: "owner" });
    prismaMock.aiTaskDraft.findMany.mockResolvedValue([
      { id: "d1", status: "ready", title: "T", taskType: "communication", createdAt: new Date() },
    ]);
    prismaMock.aiTaskDraft.count.mockResolvedValue(1);

    const req = createRequest("GET", "/api/ai-drafts/admin");
    const res = await GET(req);
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.drafts).toHaveLength(1);
    expect(data.page).toBe(1);
    expect(data.total).toBe(1);

    const whereArg = prismaMock.aiTaskDraft.findMany.mock.calls[0][0].where;
    expect(whereArg).toMatchObject({ status: "ready" });
  });

  it("status=all returns all regardless", async () => {
    mockSession({ id: "u1", name: "Owner", role: "owner" });
    prismaMock.aiTaskDraft.findMany.mockResolvedValue([]);
    prismaMock.aiTaskDraft.count.mockResolvedValue(0);

    const req = createRequest("GET", "/api/ai-drafts/admin?status=all");
    await GET(req);
    const whereArg = prismaMock.aiTaskDraft.findMany.mock.calls[0][0].where;
    expect(whereArg.status).toBeUndefined();
  });

  it("taskType filter", async () => {
    mockSession({ id: "u1", name: "Owner", role: "owner" });
    prismaMock.aiTaskDraft.findMany.mockResolvedValue([]);
    prismaMock.aiTaskDraft.count.mockResolvedValue(0);

    const req = createRequest("GET", "/api/ai-drafts/admin?taskType=communication");
    await GET(req);
    const whereArg = prismaMock.aiTaskDraft.findMany.mock.calls[0][0].where;
    expect(whereArg.taskType).toBe("communication");
  });
});
```

- [ ] **Step 2: Run — confirm failure (module not found)**

```bash
npm test -- --run src/__tests__/api/ai-drafts-admin.test.ts 2>&1 | tail -5
```

- [ ] **Step 3: Implement the route**

Create `src/app/api/ai-drafts/admin/route.ts`:

```ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";

const LIMIT = 50;

export const GET = withApiAuth(
  async (req) => {
    const { searchParams } = new URL(req.url);
    const statusParam = searchParams.get("status") ?? "ready"; // default "ready"
    const taskType = searchParams.get("taskType");
    const sourceType = searchParams.get("sourceType"); // "todo" | "marketingTask" | "coworkTodo" | "ticket" | "issue"

    const pageRaw = Number(searchParams.get("page") ?? "1");
    const page = Number.isFinite(pageRaw) && pageRaw >= 1 ? Math.floor(pageRaw) : 1;

    const where: Record<string, unknown> = {};
    if (statusParam && statusParam !== "all") where.status = statusParam;
    if (taskType) where.taskType = taskType;
    if (sourceType === "todo") where.todoId = { not: null };
    else if (sourceType === "marketingTask") where.marketingTaskId = { not: null };
    else if (sourceType === "coworkTodo") where.coworkTodoId = { not: null };
    else if (sourceType === "ticket") where.ticketId = { not: null };
    else if (sourceType === "issue") where.issueId = { not: null };

    const [drafts, total] = await Promise.all([
      prisma.aiTaskDraft.findMany({
        where,
        include: {
          todo: { select: { id: true, title: true, assignee: { select: { id: true, name: true } } } },
          marketingTask: { select: { id: true, title: true, assignee: { select: { id: true, name: true } } } },
          coworkTodo: { select: { id: true, title: true, assignedTo: { select: { id: true, name: true } } } },
          ticket: { select: { id: true, ticketNumber: true, subject: true, assignedTo: { select: { id: true, name: true } } } },
          issue: { select: { id: true, title: true, owner: { select: { id: true, name: true } } } },
          reviewedBy: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * LIMIT,
        take: LIMIT,
      }),
      prisma.aiTaskDraft.count({ where }),
    ]);

    return NextResponse.json({
      drafts,
      page,
      limit: LIMIT,
      total,
      totalPages: Math.max(1, Math.ceil(total / LIMIT)),
    });
  },
  { roles: ["owner", "head_office", "admin"] },
);
```

- [ ] **Step 4: Re-run tests — all pass**

```bash
npm test -- --run src/__tests__/api/ai-drafts-admin.test.ts 2>&1 | tail -10
```

### Task 2: Role-permissions + nav

**Files:**
- Modify: `src/lib/role-permissions.ts`
- Modify: `src/lib/nav-config.ts`

- [ ] **Step 1: Add `/admin/ai-drafts` to `allPages`**

In the Admin cluster (after `/admin/feedback`):
```ts
  "/admin/ai-drafts",
```

- [ ] **Step 2: Add nav item**

In `src/lib/nav-config.ts` (import `Bot` already exists; if not, add to lucide imports):
```ts
  { href: "/admin/ai-drafts", label: "AI Drafts", icon: Bot, section: "Admin", tooltip: "Review and bulk-triage all AI-generated task drafts across the organisation" },
```

(Note: `Bot` is already used by the existing `/assistant` nav item — confirm reuse.)

### Task 3: Hook + page + list UI

**Files:**
- Create: `src/hooks/useAdminAiDrafts.ts`
- Create: `src/app/(dashboard)/admin/ai-drafts/page.tsx`
- Create: `src/app/(dashboard)/admin/ai-drafts/AiDraftsInboxContent.tsx`

- [ ] **Step 1: Hook**

Create `src/hooks/useAdminAiDrafts.ts`:

```ts
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchApi, mutateApi } from "@/lib/fetch-api";
import { toast } from "@/hooks/useToast";

export interface AdminAiDraftRow {
  id: string;
  taskType: string;
  title: string;
  content: string;
  status: "ready" | "accepted" | "edited" | "dismissed";
  createdAt: string;
  reviewedAt: string | null;
  reviewedBy: { id: string; name: string | null } | null;
  todo: { id: string; title: string; assignee: { id: string; name: string | null } | null } | null;
  marketingTask: { id: string; title: string; assignee: { id: string; name: string | null } | null } | null;
  coworkTodo: { id: string; title: string; assignedTo: { id: string; name: string | null } | null } | null;
  ticket: { id: string; ticketNumber: number; subject: string; assignedTo: { id: string; name: string | null } | null } | null;
  issue: { id: string; title: string; owner: { id: string; name: string | null } | null } | null;
}

export interface AdminAiDraftsResponse {
  drafts: AdminAiDraftRow[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface AdminAiDraftsFilters {
  status?: string;
  taskType?: string;
  sourceType?: string;
  page?: number;
}

function qs(f: AdminAiDraftsFilters) {
  const p = new URLSearchParams();
  if (f.status) p.set("status", f.status);
  if (f.taskType) p.set("taskType", f.taskType);
  if (f.sourceType) p.set("sourceType", f.sourceType);
  if (f.page) p.set("page", String(f.page));
  const s = p.toString();
  return s ? `?${s}` : "";
}

export function useAdminAiDrafts(filters: AdminAiDraftsFilters) {
  return useQuery<AdminAiDraftsResponse>({
    queryKey: ["ai-drafts", "admin", filters.status ?? "ready", filters.taskType, filters.sourceType, filters.page ?? 1],
    queryFn: () => fetchApi<AdminAiDraftsResponse>(`/api/ai-drafts/admin${qs(filters)}`),
    retry: 2,
    staleTime: 30_000,
  });
}

export function useBulkDraftAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { action: "approve" | "dismiss"; ids: string[] }) =>
      mutateApi<{ updated: number }>("/api/ai-drafts/bulk", { method: "POST", body: args }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ai-drafts"] }),
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Bulk action failed" });
    },
  });
}
```

- [ ] **Step 2: Page entrypoint**

Create `src/app/(dashboard)/admin/ai-drafts/page.tsx`:

```tsx
import { AiDraftsInboxContent } from "./AiDraftsInboxContent";

export const metadata = { title: "AI Drafts | Amana EOS" };

export default function AdminAiDraftsPage() {
  return <AiDraftsInboxContent />;
}
```

- [ ] **Step 3: List content**

Create `src/app/(dashboard)/admin/ai-drafts/AiDraftsInboxContent.tsx`. Patterns:
- PageHeader with title "AI Drafts" + description "Review all AI-generated task drafts across the organisation"
- Filters: status (ready/accepted/edited/dismissed/all — default "ready"), taskType, sourceType
- StickyTable cols: checkbox | created | task type | title | source (with link) | reviewer | status | action
- Bulk action toolbar appears when ≥1 checkbox is selected: "Approve selected (N)" / "Dismiss selected (N)" buttons
- Clicking any row opens `AiDraftReviewPanel` in a slide-in (reuse existing component, pass `draft` + `onClose`)
- Skeleton loaders, empty state, pagination identical to `/admin/feedback`
- Confirmation modal on bulk action (simple `window.confirm` acceptable for v1)

Full implementation (~200 lines) follows the pattern of `FeedbackInboxContent.tsx` from 8a. For brevity, mirror that structure:
- `useState` for `status`, `taskType`, `sourceType`, `page`, `selectedIds: Set<string>`, `selectedDraft: AdminAiDraftRow | null`
- Checkbox column at left; header checkbox toggles all visible
- Row click (except checkbox) sets `selectedDraft`
- Bulk toolbar absolute-positioned at top when `selectedIds.size > 0`
- On bulk submit: `useBulkDraftAction().mutate({ action, ids: Array.from(selectedIds) })`
- On mutation success: clear selected, invalidate query (already done in hook)

Commit both the page and the nav/role updates together as Commit 5.

- [ ] **Step 4: Verify + commit**

```bash
npx tsc --noEmit 2>&1 | grep -c "error TS"
npm test -- --run 2>&1 | tail -5
npm run build 2>&1 | tail -10
```

Commit with:

```bash
git add -- \
  src/lib/role-permissions.ts \
  src/lib/nav-config.ts \
  src/app/api/ai-drafts/admin/route.ts \
  src/__tests__/api/ai-drafts-admin.test.ts \
  src/hooks/useAdminAiDrafts.ts \
  src/app/\(dashboard\)/admin/ai-drafts/page.tsx \
  src/app/\(dashboard\)/admin/ai-drafts/AiDraftsInboxContent.tsx

git commit -m "$(cat <<'EOF'
feat(ai): /admin/ai-drafts dashboard — all drafts one view

Add admin-only /admin/ai-drafts page with filters (status / taskType /
sourceType), pagination (50/page), checkbox selection, reuse of
AiDraftReviewPanel for per-row detail/edit.

New /api/ai-drafts/admin route (admin-scoped, not user-scoped — returns
all drafts org-wide). Default filter is status=ready (only drafts awaiting
review). Nav item "AI Drafts" appears under Admin for owner/head_office/admin.

Sub-project 8b / Commit 1 of 10.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Task 4: Bulk action endpoint

**Files:**
- Create: `src/app/api/ai-drafts/bulk/route.ts`
- Create: `src/__tests__/api/ai-drafts-bulk.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/__tests__/api/ai-drafts-bulk.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "@/__tests__/helpers/prisma-mock";
import { mockSession, mockNoSession } from "@/__tests__/helpers/auth-mock";
import { createRequest } from "@/__tests__/helpers/request";

vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: vi.fn(() => ({ limited: false })) }));
vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  generateRequestId: () => "test-req-id",
}));

import { POST } from "@/app/api/ai-drafts/bulk/route";
import { _clearUserActiveCache } from "@/lib/server-auth";

describe("POST /api/ai-drafts/bulk", () => {
  beforeEach(() => {
    _clearUserActiveCache();
    vi.clearAllMocks();
    mockSession({ id: "u1", name: "Owner", role: "owner" });
    prismaMock.user.findUnique.mockResolvedValue({ id: "u1", active: true, role: "owner" });
  });

  it("401 unauthenticated", async () => {
    mockNoSession();
    const req = createRequest("POST", "/api/ai-drafts/bulk", { body: { action: "approve", ids: ["d1"] } });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("400 on invalid action", async () => {
    const req = createRequest("POST", "/api/ai-drafts/bulk", { body: { action: "delete", ids: ["d1"] } });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("400 on empty ids", async () => {
    const req = createRequest("POST", "/api/ai-drafts/bulk", { body: { action: "approve", ids: [] } });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("400 on ids > 20", async () => {
    const ids = Array.from({ length: 21 }, (_, i) => `d${i}`);
    const req = createRequest("POST", "/api/ai-drafts/bulk", { body: { action: "approve", ids } });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it.each([
    ["owner", 200],
    ["head_office", 200],
    ["admin", 200],
    ["coordinator", 403],
    ["staff", 403],
  ])("role %s → %i", async (role, expected) => {
    mockSession({ id: "u1", name: "U", role: role as "owner" });
    prismaMock.user.findUnique.mockResolvedValue({ id: "u1", active: true, role });
    prismaMock.aiTaskDraft.updateMany.mockResolvedValue({ count: 2 });

    const req = createRequest("POST", "/api/ai-drafts/bulk", { body: { action: "approve", ids: ["d1", "d2"] } });
    const res = await POST(req);
    expect(res.status).toBe(expected);
  });

  it("approves all ids atomically (updateMany)", async () => {
    prismaMock.aiTaskDraft.updateMany.mockResolvedValue({ count: 3 });

    const req = createRequest("POST", "/api/ai-drafts/bulk", { body: { action: "approve", ids: ["d1", "d2", "d3"] } });
    const res = await POST(req);
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.updated).toBe(3);

    const call = prismaMock.aiTaskDraft.updateMany.mock.calls[0][0];
    expect(call.where).toMatchObject({ id: { in: ["d1", "d2", "d3"] } });
    expect(call.data.status).toBe("accepted");
  });

  it("dismisses all ids", async () => {
    prismaMock.aiTaskDraft.updateMany.mockResolvedValue({ count: 2 });

    const req = createRequest("POST", "/api/ai-drafts/bulk", { body: { action: "dismiss", ids: ["d1", "d2"] } });
    const res = await POST(req);
    const data = await res.json();
    expect(data.updated).toBe(2);
    expect(prismaMock.aiTaskDraft.updateMany.mock.calls[0][0].data.status).toBe("dismissed");
  });

  it("does not re-flip already-processed drafts (status filter)", async () => {
    // Simulate: all 3 drafts already accepted. updateMany filters on status=ready → count=0.
    prismaMock.aiTaskDraft.updateMany.mockResolvedValue({ count: 0 });

    const req = createRequest("POST", "/api/ai-drafts/bulk", { body: { action: "dismiss", ids: ["d1", "d2", "d3"] } });
    const res = await POST(req);
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.updated).toBe(0);

    // Confirm the where-clause includes status=ready so the filter is enforced at the DB
    const call = prismaMock.aiTaskDraft.updateMany.mock.calls[0][0];
    expect(call.where).toMatchObject({ status: "ready" });
  });
});
```

- [ ] **Step 2: Confirm failure**

- [ ] **Step 3: Implement**

Create `src/app/api/ai-drafts/bulk/route.ts`:

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { parseJsonBody } from "@/lib/api-error";

const bulkSchema = z.object({
  action: z.enum(["approve", "dismiss"]),
  ids: z.array(z.string().min(1)).min(1, "At least one id required").max(20, "Max 20 drafts per batch"),
});

export const POST = withApiAuth(
  async (req, session) => {
    const body = await parseJsonBody(req);
    const parsed = bulkSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message, details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const { action, ids } = parsed.data;
    const newStatus = action === "approve" ? "accepted" : "dismissed";

    const result = await prisma.aiTaskDraft.updateMany({
      where: { id: { in: ids }, status: "ready" }, // only triage drafts still in review
      data: {
        status: newStatus,
        reviewedAt: new Date(),
        reviewedById: session.user.id,
      },
    });

    return NextResponse.json({ updated: result.count });
  },
  { roles: ["owner", "head_office", "admin"] },
);
```

**Note on 400 shape**: use `throw ApiError.badRequest(parsed.error.issues[0].message, parsed.error.flatten().fieldErrors)` if the project's convention allows. Current 8a pattern uses raw `NextResponse.json` for 400s in some routes and `ApiError.badRequest` in others. Use whichever the spec-reviewer in 8a flagged as preferred — if the 8a review said `ApiError.badRequest`, switch to that here for consistency. Either way, the tests must pass unchanged (they assert on status + error string, not on how it was thrown).

**Note on task-completion cascade**: Bulk approve does NOT cascade to source-task completion (unlike single PATCH). This is intentional — bulk accepting drafts is an admin triage signal ("these are fine, stop bothering me"), not a commitment to mark the original tasks done. The single PATCH route retains the cascade. Document this in the commit body.

- [ ] **Step 4: Verify + commit**

```bash
npm test -- --run src/__tests__/api/ai-drafts-bulk.test.ts 2>&1 | tail -10
npm test -- --run 2>&1 | tail -5
```

Commit:
```bash
git add -- \
  src/app/api/ai-drafts/bulk/route.ts \
  src/__tests__/api/ai-drafts-bulk.test.ts

git commit -m "$(cat <<'EOF'
feat(ai): bulk approve/dismiss on dashboard

POST /api/ai-drafts/bulk accepts { action: "approve"|"dismiss", ids: string[] }
with Zod validation (1-20 ids). Uses prisma.aiTaskDraft.updateMany scoped to
status=ready so a retry won't re-flip already-processed drafts.

Deliberately does NOT cascade to source-task completion — bulk approve is
an admin triage signal, not a commitment to complete the underlying tasks.
Single PATCH /api/ai-drafts/[id] retains the cascade behaviour.

Sub-project 8b / Commit 2 of 10.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Chunk 2: Commits 7-8 — Meetings decomposition + tests

### Task 5: Extract shared types + `useTimer` hook

**Files:**
- Create: `src/components/meetings/types.ts`
- Create: `src/components/meetings/sections.ts`
- Create: `src/components/meetings/useTimer.ts`

- [ ] **Step 1: Create shared types**

Create `src/components/meetings/types.ts` with whatever types the page uses (copy from the page's local type defs — `Meeting`, `Section`, etc.). Export as named exports.

- [ ] **Step 2: Create shared constants**

Create `src/components/meetings/sections.ts` — move the `L10_SECTIONS` const from the page (lines 72-80 per exploration).

- [ ] **Step 3: Extract `useTimer`**

Move the hook from page lines 86-119 to `src/components/meetings/useTimer.ts`. Named export.

### Prop-contract strategy for extracted sections

Before starting Task 6, establish the prop contract every extracted section uses. This prevents 11 ad-hoc decisions during execution.

**Each section component receives props**:
- `meeting: Meeting` — the full meeting object
- `onUpdate: (patch: Partial<Meeting>) => void` — handler to update meeting state
- `timer: ReturnType<typeof useTimer>` — the shared timer instance (created once at the page level)
- `section: L10Section` — the section config from `L10_SECTIONS`
- `onNext: () => void` — advance to next section (used by `ConcludeSection`, etc.)

Sections with extra data (e.g. `ScorecardSection` needing scorecard rows, `IDSSection` needing issues list) also receive those via props — don't re-fetch inside the section when the page already has the data.

No React Context is introduced in this commit. All state flows via props. This keeps each section independently testable with a smoke test that mocks the props.

### Task 6: Extract sub-components one at a time

For each of the 11 components below, extract in this order (each step: copy component body from page → paste into new file with correct imports → replace inline call in page with import). Run `npm run build` after every 2-3 extractions to catch errors early.

- `MeetingListView` → `src/components/meetings/MeetingListView.tsx`
- `SegueSection` → `.../SegueSection.tsx`
- `ScorecardSection` → `.../ScorecardSection.tsx`
- `RockReviewSection` → `.../RockReviewSection.tsx`
- `HeadlinesSection` → `.../HeadlinesSection.tsx`
- `TodoReviewSection` → `.../TodoReviewSection.tsx`
- `IDSSection` → `.../IDSSection.tsx`
- `ConcludeSection` → `.../ConcludeSection.tsx`
- `MeetingOutcomesPanel` → `.../MeetingOutcomesPanel.tsx`
- `ActiveMeetingView` → `.../ActiveMeetingView.tsx`
- `StartMeetingDialog` → `.../StartMeetingDialog.tsx`

Each extraction follows this micro-pattern:

- [ ] **Step N.1**: Copy component body + any helper functions it uses into the new file. Add `"use client";` if the component uses hooks/effects.
- [ ] **Step N.2**: Copy required imports to the new file (only what that component needs).
- [ ] **Step N.3**: In `page.tsx`, replace the inline `function ComponentName(...)` block with `import { ComponentName } from "@/components/meetings/ComponentName";`.
- [ ] **Step N.4**: `npm run build 2>&1 | tail -10` — must still succeed.

After all 11 extractions, `page.tsx` should be ~300-400 lines of orchestration (state, top-level routing, imports).

- [ ] **Final step: verify line counts**

```bash
wc -l src/app/\(dashboard\)/meetings/page.tsx src/components/meetings/*.tsx src/components/meetings/*.ts
```

Expected: `page.tsx` < 500 lines; total components/meetings ≈ 2700 lines distributed.

### Task 7: Commit 7

```bash
npx tsc --noEmit 2>&1 | grep -c "error TS"
npm run lint 2>&1 | tail -5
npm test -- --run 2>&1 | tail -5            # no regressions
npm run build 2>&1 | tail -10
```

Commit:
```bash
git add -- \
  src/components/meetings/ \
  src/app/\(dashboard\)/meetings/page.tsx

git commit -m "$(cat <<'EOF'
refactor(meetings): decompose page.tsx into section components

Split the 2706-line meetings/page.tsx into 12 focused files under
src/components/meetings/:
- useTimer.ts, types.ts, sections.ts (shared)
- MeetingListView, SegueSection, ScorecardSection, RockReviewSection,
  HeadlinesSection, TodoReviewSection, IDSSection, ConcludeSection,
  MeetingOutcomesPanel, ActiveMeetingView, StartMeetingDialog

Parent page.tsx reduces to ~400 lines of orchestration. All existing
behaviour preserved — no API or hook changes. Zero test regressions.

Before: page.tsx 2706 lines, 0 component files.
After: page.tsx ~400 lines, 12 component/shared files totaling ~2400 lines.

Sub-project 8b / Commit 3 of 10.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Task 8: Meetings tests

**Files:**
- Create: `src/__tests__/api/meetings.test.ts`
- Create: `src/__tests__/components/meetings/useTimer.test.ts`
- Create: `src/__tests__/components/meetings/ScorecardSection.test.tsx`
- Create: `src/__tests__/components/meetings/TodoReviewSection.test.tsx`

- [ ] **Step 1: API route tests (`src/__tests__/api/meetings.test.ts`)**

Find existing `src/app/api/meetings/**/*.ts` routes. For each CRUD route (GET list, POST create, GET one, PATCH, DELETE), write tests: 401 unauth, role-based 403, 200 happy path, 400 validation, 404 not-found. Target ≥10 tests total.

Use the same test scaffolding pattern as existing API tests (e.g. `src/__tests__/api/internal-feedback-patch.test.ts`): mocks for `rate-limit`, `logger`, `_clearUserActiveCache` in `beforeEach`, `mockSession`.

- [ ] **Step 2: `useTimer` unit tests**

Test the timer hook: starts at 0, increments every second (fake timers), pause/resume, reset. ~5 tests.

```ts
import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useTimer } from "@/components/meetings/useTimer";

describe("useTimer", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("starts at 0 and increments every second when running", () => {
    const { result } = renderHook(() => useTimer());
    act(() => { result.current.start(); });
    act(() => { vi.advanceTimersByTime(3000); });
    expect(result.current.elapsed).toBe(3);
  });

  it("pauses correctly", () => {
    const { result } = renderHook(() => useTimer());
    act(() => { result.current.start(); vi.advanceTimersByTime(2000); });
    act(() => { result.current.pause(); vi.advanceTimersByTime(2000); });
    expect(result.current.elapsed).toBe(2);
  });

  // ... 3 more tests
});
```

Actual test code depends on the hook's API — adapt after Task 5 extracts it.

- [ ] **Step 3: Smoke tests for 2 section components**

For `ScorecardSection` and `TodoReviewSection`, write render smoke tests. Mock the data hooks, render, assert key headings + interactions work.

- [ ] **Step 4: Verify + commit**

```bash
npm test -- --run 2>&1 | tail -5
```

Commit:
```bash
git add -- \
  src/__tests__/api/meetings.test.ts \
  src/__tests__/components/meetings/

git commit -m "$(cat <<'EOF'
test(meetings): route + hook + section-component coverage

Add ≥15 tests covering /api/meetings* routes (auth/validation/happy-path/404),
useTimer hook (start/pause/resume/reset under fake timers), plus smoke tests
for ScorecardSection and TodoReviewSection components.

Meetings was a zero-test module prior to this commit. Brings baseline
coverage to the minimum "auth + validation + happy path" matrix for the
largest surface in the dashboard.

Sub-project 8b / Commit 4 of 10.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Chunk 3: Commits 9-10 — Onboarding decomposition + tests

### Task 9: Decompose onboarding/page.tsx (3 tabs, not 5)

Exploration found the page has only 3 tabs: `onboarding` | `lms` | `exit-surveys` (the latter already extracted to `ExitSurveyDashboard`). So only extract:
- `OnboardingPacksTab` (page lines 574-1140) → `src/components/onboarding/OnboardingPacksTab.tsx`
- `LmsCoursesTab` (page lines 1144+) → `src/components/onboarding/LmsCoursesTab.tsx`

**Files:**
- Create: `src/components/onboarding/OnboardingPacksTab.tsx`
- Create: `src/components/onboarding/LmsCoursesTab.tsx`
- Modify: `src/app/(dashboard)/onboarding/page.tsx` (reduce to ~250 lines)

Same micro-pattern as meetings:
- [ ] **Step 1**: Extract `OnboardingPacksTab` (copy body + hooks/imports → new file → replace inline with import).
- [ ] **Step 2**: `npm run build` — must succeed.
- [ ] **Step 3**: Extract `LmsCoursesTab`.
- [ ] **Step 4**: `npm run build` — must succeed.
- [ ] **Step 5**: Confirm `page.tsx` reduced to ~250 lines of tab routing + orchestration.

### Task 10: Commit 9

```bash
npx tsc --noEmit 2>&1 | grep -c "error TS"
npm test -- --run 2>&1 | tail -5
npm run build 2>&1 | tail -10
```

Commit:
```bash
git add -- \
  src/components/onboarding/OnboardingPacksTab.tsx \
  src/components/onboarding/LmsCoursesTab.tsx \
  src/app/\(dashboard\)/onboarding/page.tsx

git commit -m "$(cat <<'EOF'
refactor(onboarding): decompose page.tsx into tab components

Extract OnboardingPacksTab and LmsCoursesTab to src/components/onboarding/.
ExitSurveyDashboard was already a separate component. Parent page.tsx
reduces from 1667 to ~250 lines of tab routing.

No behaviour change, no API change. Tests still green.

Before: page.tsx 1667 lines.
After: page.tsx ~250 lines, 2 new component files ~1400 lines total.

Sub-project 8b / Commit 5 of 10.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Task 11: Onboarding tests

**Files:**
- Create: `src/__tests__/api/onboarding-packs.test.ts`
- Create: `src/__tests__/api/onboarding-assign.test.ts`
- Create: `src/__tests__/components/onboarding/OnboardingPacksTab.test.tsx` (smoke)

- [ ] **Step 1**: API tests — GET/POST packs, assign action. ≥8 tests across the two files.
- [ ] **Step 2**: Smoke test for `OnboardingPacksTab` — renders, shows packs list, pack creation dialog opens.
- [ ] **Step 3**: Verify full suite + build green.
- [ ] **Step 4**: Commit 10

```bash
git add -- src/__tests__/api/onboarding-packs.test.ts src/__tests__/api/onboarding-assign.test.ts src/__tests__/components/onboarding/
git commit -m "$(cat <<'EOF'
test(onboarding): packs + assignments + component coverage

Add ~10 tests covering /api/onboarding/packs, /api/onboarding/assign, plus
smoke test for OnboardingPacksTab component.

Onboarding was a zero-test module prior to this commit.

Sub-project 8b / Commit 6 of 10.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Chunk 4: Commits 11-12 — Queue per-service grouping + tests

### Task 12: Queue "All Queues" per-service grouping

**Context**: The "All Queues" toggle already exists on `queue/page.tsx`. Spec asks for a "per-service column for grouping" to make the admin view more actionable — group reports by service code, show a header row per service, and let the admin collapse/expand.

**Files:**
- Modify: `src/app/(dashboard)/queue/page.tsx`

- [ ] **Step 1: Identify where the flat list renders in `view=all` mode**

Read lines 250-350 of `queue/page.tsx`. There should be a list rendering reports grouped by assignee when `queueView === "all"`.

- [ ] **Step 2: Add per-service grouping**

When `queueView === "all"`, first group reports by `report.serviceCode`, then within each service group sub-group by assignee. Derive the grouping with a memoized helper:

```tsx
const reportsByService = useMemo(() => {
  if (queueView !== "all") return null;
  return (data?.reports ?? []).reduce<Record<string, typeof data.reports>>((acc, r) => {
    const code = r.serviceCode ?? "Unassigned";
    (acc[code] ??= []).push(r);
    return acc;
  }, {});
}, [data?.reports, queueView]);
```

Render:

```tsx
{reportsByService && Object.entries(reportsByService).map(([serviceCode, serviceReports]) => (
  <div key={serviceCode} className="space-y-2">
    <h3 className="text-sm font-semibold text-foreground/80 border-b border-border pb-1">
      {serviceCode} <span className="text-muted text-xs font-normal">({serviceReports.length})</span>
    </h3>
    {/* existing per-assignee render logic, scoped to serviceReports */}
  </div>
))}
```

Keep the existing `My Queue` view unchanged.

- [ ] **Step 3: Verify visually**

`npm run dev` — log in as owner, click "All Queues" toggle, confirm per-service headers appear.

- [ ] **Step 4: Commit 11**

```bash
git add -- src/app/\(dashboard\)/queue/page.tsx
git commit -m "$(cat <<'EOF'
feat(queue): per-service grouping in All Queues admin view

When an admin toggles "All Queues", reports now group by serviceCode with
a per-service header showing the report count. Assignee-level rendering
within each service group is unchanged. "My Queue" view unaffected.

Sub-project 8b / Commit 7 of 10.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Task 13: Queue tests

**Files:**
- Create: `src/__tests__/api/queue.test.ts`
- Create: `src/__tests__/api/queue-complete.test.ts`

- [ ] **Step 1: Tests for GET /api/queue**

Cases: 401, my-queue default scope, `view=all` for admin (allowed), `view=all` for non-admin (ignored — still scoped), filters `seat`/`serviceCode`/`status`, pagination `limit`/`offset`. ≥8 tests.

- [ ] **Step 2: Tests for POST /api/queue/[id]/complete**

Cases: 401, 403 (different assignee), 404, 200 happy path. ≥4 tests.

- [ ] **Step 3: Verify + commit**

```bash
npm test -- --run 2>&1 | tail -5
git add -- src/__tests__/api/queue.test.ts src/__tests__/api/queue-complete.test.ts
git commit -m "$(cat <<'EOF'
test(queue): report + todo route coverage

Add 12+ tests covering /api/queue (auth, admin view, scope, filters,
pagination) + /api/queue/[id]/complete (auth, permissions, 404, happy path).

Queue was a zero-test module prior to this commit.

Sub-project 8b / Commit 8 of 10.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Chunk 5: Commits 13-14 — Issues spawnedTodos interactivity + tests

### Task 14: Clickable spawnedTodos badge on IssueCard

**Context**: `IssueCard.tsx` already shows `issue._count.spawnedTodos`. Commit 13 work is to make it clickable — clicking opens the Issue detail panel scrolled/focused on the `spawnedTodos` section.

**Files:**
- Modify: `src/components/issues/IssueCard.tsx`
- Modify: `src/components/issues/IssueDetailPanel.tsx` (if exists — or wherever the detail slide-in lives)

- [ ] **Step 1: Inspect current IssueCard.tsx around line 162**

Find the `{issue._count.spawnedTodos}` render. Wrap it in a `<button>` with an `aria-label`, click handler that calls `onOpenDetail(issue.id, { focus: "spawnedTodos" })` (or similar — depends on how the card currently opens details).

- [ ] **Step 2: Detail panel handles the `focus` prop**

When the detail panel mounts with `focus === "spawnedTodos"`, scroll the spawnedTodos section into view (use `useEffect` + `scrollIntoView`).

- [ ] **Step 3: Verify**

`npm run dev` → create a test issue with `spawnedTodos` → click the count badge → detail panel opens + scrolls to the section.

- [ ] **Step 4: Commit 13**

```bash
git add -- src/components/issues/IssueCard.tsx src/components/issues/IssueDetailPanel.tsx
git commit -m "$(cat <<'EOF'
feat(issues): clickable spawnedTodos count on Kanban card

The count badge on IssueCard is now a button — click opens the detail
panel and scrolls the spawnedTodos list into view. Previous UX: count
was visible but non-interactive, admin had to click elsewhere to open
the issue then find the list.

Sub-project 8b / Commit 9 of 10.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Task 15: Issues tests

**Files:**
- Create: `src/__tests__/api/issues.test.ts`
- Create: `src/__tests__/api/issues-bulk.test.ts`
- Create: `src/__tests__/components/issues/IssueCard.test.tsx`

- [ ] **Step 1: /api/issues tests**

GET (list, filters), POST (create, validation), PATCH `[id]` (update, 404), DELETE. ≥10 tests.

- [ ] **Step 2: /api/issues/bulk tests**

action=resolve, delete, assign, move. Cases: 401, 403 (non-admin), 400 empty/oversize ids, 200 happy path. ≥6 tests.

- [ ] **Step 3: IssueCard spawnedTodos badge test**

Smoke test for the Commit 9 interactivity:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IssueCard } from "@/components/issues/IssueCard";

const baseIssue = {
  id: "i1",
  title: "Test issue",
  priority: "high",
  status: "open",
  _count: { spawnedTodos: 3 },
  // ...fill other required fields per IssueCard props
};

describe("IssueCard spawnedTodos badge", () => {
  it("renders count when > 0", () => {
    render(<IssueCard issue={baseIssue as any} onOpenDetail={vi.fn()} />);
    expect(screen.getByRole("button", { name: /3 spawned todos/i })).toBeInTheDocument();
  });

  it("does not render badge when count is 0", () => {
    render(<IssueCard issue={{ ...baseIssue, _count: { spawnedTodos: 0 } } as any} onOpenDetail={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /spawned todos/i })).toBeNull();
  });

  it("click badge calls onOpenDetail with focus hint", async () => {
    const handler = vi.fn();
    render(<IssueCard issue={baseIssue as any} onOpenDetail={handler} />);
    await userEvent.click(screen.getByRole("button", { name: /3 spawned todos/i }));
    expect(handler).toHaveBeenCalledWith("i1", { focus: "spawnedTodos" });
  });
});
```

Adapt to IssueCard's actual props once Task 14 lands (the `onOpenDetail` contract lives there).

- [ ] **Step 4: Verify + commit**

```bash
npm test -- --run 2>&1 | tail -5
git add -- src/__tests__/api/issues.test.ts src/__tests__/api/issues-bulk.test.ts src/__tests__/components/issues/
git commit -m "$(cat <<'EOF'
test(issues): route + bulk coverage

Add 16+ tests covering /api/issues (CRUD + validation + 404) and
/api/issues/bulk (all four actions, auth, size limits).

Issues was a zero-test module prior to this commit.

Sub-project 8b / Commit 10 of 10.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Post-commit: Push + PR

- [ ] **Step 1: Push branch**

```bash
git push -u origin feat/ai-queue-ops-8b-2026-04-22
```

- [ ] **Step 2: Open PR**

```bash
gh pr create --title "feat: AI drafts dashboard + decompositions + coverage (sub-project 8b)" --body "$(cat <<'EOF'
## Summary

Ships commits 5-14 of spec 8:
- `/admin/ai-drafts` dashboard with filters, pagination, bulk approve/dismiss
- Meetings page decomposed: 2706 lines → ~400 lines (12 component files extracted)
- Onboarding page decomposed: 1667 lines → ~250 lines (2 tab files extracted)
- Queue "All Queues" admin view gets per-service grouping
- Issues Kanban card: spawnedTodos count is now clickable → opens detail + scrolls
- ~50 new tests across 5 previously-untested modules (meetings, onboarding, queue, issues, ai-drafts)

Plan: `docs/superpowers/plans/2026-04-22-ai-queue-ops-8b-plan.md`

## Commits

| # | Subject | Type |
|---|---|---|
| 5 | feat(ai): /admin/ai-drafts dashboard | Feature |
| 6 | feat(ai): bulk approve/dismiss on dashboard | Feature |
| 7 | refactor(meetings): decompose page.tsx | Hygiene |
| 8 | test(meetings): route + hook + section coverage | Testing |
| 9 | refactor(onboarding): decompose page.tsx | Hygiene |
| 10 | test(onboarding): packs + assignments coverage | Testing |
| 11 | feat(queue): per-service grouping in All Queues | Feature |
| 12 | test(queue): report + todo route coverage | Testing |
| 13 | feat(issues): clickable spawnedTodos on Kanban | UI |
| 14 | test(issues): route + bulk coverage | Testing |

## Schema

**No migration.** All commits consume existing models unchanged.

## Test plan

- [x] `npm test -- --run` — 1653 baseline → 1700+ (≥47 new)
- [x] `npx tsc --noEmit` — 0 errors
- [x] `npm run build` — green
- [ ] Manual smoke: owner logs in, checks /admin/ai-drafts, meetings page (verify parity), onboarding page (verify parity), queue "All Queues" with per-service groups, issues Kanban clickable badges

## Decomposition line-count table

| File | Before | After | Extracted |
|---|---|---|---|
| meetings/page.tsx | 2706 | ~400 | 12 files in src/components/meetings/ |
| onboarding/page.tsx | 1667 | ~250 | 2 files in src/components/onboarding/ |

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Acceptance criteria

- [ ] 10 commits in order
- [ ] `npm test -- --run` ≥ 1700 passing (+47 from baseline 1653)
- [ ] 0 tsc errors
- [ ] No schema migration
- [ ] `/admin/ai-drafts` renders list + filters + bulk toolbar
- [ ] Bulk approve/dismiss atomic (updateMany), capped at 20 per batch
- [ ] Meetings page ≤500 lines after decomposition
- [ ] Onboarding page ≤300 lines after decomposition
- [ ] Queue admin view shows per-service groups
- [ ] Issues spawnedTodos badge clickable + opens detail
- [ ] Every decomposition preserves existing behaviour (no hook/API change; manual smoke confirms parity)
- [ ] Every previously-zero-test module has ≥8 tests

## Risks

1. **Decomposition scope is the biggest unknown.** Meetings page has 2706 lines of tightly-interrelated sections. The `useTimer` ref is shared, state is passed down via many props. Mitigation: extract ONE component at a time; build after each; roll back any extraction that breaks.

2. **Bulk endpoint race condition**: simultaneous single PATCH + bulk PATCH could cause inconsistent state (single sets `accepted` + cascades; bulk sets `dismissed` → cascade already done). The `status: "ready"` filter in the `updateMany` where-clause prevents this.

3. **AI draft admin view cardinality** — if there are thousands of drafts in production, the 50/page default is fine. No full-fetch risk.

4. **Meetings test suite integration** — decomposing a monolith while also adding tests could mask regressions. Mitigation: do decomposition first (Commit 7), run full suite to confirm no regression, THEN add new tests (Commit 8).

## Rollback

Per-commit revert safe. Decomposition commits (7, 9) are the riskiest to revert — reverting restores the monolith. AI drafts commits (5, 6) are pure additions. Test commits (8, 10, 12, 14) are pure additions.

---

*Last updated: 2026-04-22. Spec reference: [`../specs/2026-04-22-ai-queue-ops-8-design.md`](../specs/2026-04-22-ai-queue-ops-8-design.md).*
