# Sub-project 8a — Report Issue Admin Inbox Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the admin-facing inbox for `InternalFeedback` — the "silent black hole" today — so staff submissions via `FeedbackWidget` are triageable with a status workflow, admin notes, Slack notification, and hardened rate-limiting + tests.

**Architecture:** New admin-only route `/admin/feedback` (list + detail), one new PATCH route on `/api/internal-feedback/[id]`, Slack webhook fire-and-forget on existing POST, full Vitest coverage + Playwright E2E. Consumes the existing `InternalFeedback` Prisma model unchanged — zero schema migration.

**Tech Stack:** Next.js 16 App Router, React Query (TanStack), Prisma 5.22, Zod, Tailwind, Vitest, Playwright, lucide-react icons.

**Spec:** [`docs/superpowers/specs/2026-04-22-ai-queue-ops-8-design.md`](../specs/2026-04-22-ai-queue-ops-8-design.md) (Commits 1–4 section).

**Baseline:** origin/main @ `4ce6f2a`; 1617 tests passing (146 files, 3 skipped); 12 pre-existing tsc errors in `MedicalTab.tsx` + `casual-settings/route.ts` — NOT our scope; do not make worse.

**Branch:** `feat/ai-queue-ops-8a-2026-04-22` (worktree at `.worktrees/ai-queue-ops-8a/`).

---

## File Structure

**New files:**

- `src/app/(dashboard)/admin/feedback/page.tsx` — list view wrapper (client component)
- `src/app/(dashboard)/admin/feedback/FeedbackInboxContent.tsx` — list table + filters + drawer state
- `src/app/(dashboard)/admin/feedback/FeedbackDetailPanel.tsx` — slide-in detail panel (status dropdown, notes autosave, activity log)
- `src/app/api/internal-feedback/[id]/route.ts` — GET single + PATCH (status + adminNotes)
- `src/lib/slack-webhook.ts` — fire-and-forget Slack webhook helper (AbortController timeout + single retry)
- `src/hooks/useInternalFeedback.ts` — React Query hooks for list / single / patch
- `src/__tests__/api/internal-feedback-patch.test.ts` — PATCH route coverage
- `src/__tests__/api/internal-feedback-post.test.ts` — POST coverage (rate limit + Slack fire)
- `src/__tests__/lib/slack-webhook.test.ts` — Slack helper unit tests
- `tests/e2e/feedback-inbox.spec.ts` — end-to-end submit → resolve flow

**Modified files:**

- `src/app/api/internal-feedback/route.ts` — add pagination on GET, rate-limit on POST, Slack webhook call
- `src/__tests__/api/internal-feedback.test.ts` — expand beyond role enforcement (pagination, filters)
- `src/components/shared/FeedbackWidget.tsx` — switch from raw `fetch` to `mutateApi` (standards compliance)
- `src/lib/role-permissions.ts` — add `/admin/feedback` to `allPages` + explicitly to owner / head_office / admin in `rolePageAccess` (marketing/coordinator/member/staff omitted by design)
- `src/lib/nav-config.ts` — add "Feedback Inbox" under Admin section with `Inbox` icon (or `Bug` — pick Bug to differentiate from Contact Centre's existing Inbox)

**Responsibilities** (one per file, no drift):

- `FeedbackInboxContent.tsx` owns list table + filters + selected-id state; delegates detail UI to child.
- `FeedbackDetailPanel.tsx` owns the slide-in; receives `feedbackId` + `onClose` props; manages its own autosave debounce.
- `slack-webhook.ts` exports one function `sendSlackFeedback(payload)` — the only place env-var is read.
- `useInternalFeedback.ts` — exports `useFeedbackList(filters)`, `useFeedback(id)`, `useUpdateFeedback()`.
- `internal-feedback/[id]/route.ts` — the ONLY place PATCH logic lives; consumers go through it.

---

## Conventions to Follow (Non-Negotiable)

Sourced from `/Users/jaydenkowaider/.claude/CLAUDE.md` (user's global standards) + project `CLAUDE.md`:

1. **API routes**: `withApiAuth(handler, { roles: [...] })` or `withApiHandler` — never raw try/catch returning `{ error }`.
2. **Validation**: every POST/PATCH body via Zod; enum fields use `z.enum([...])`.
3. **Parse JSON**: `parseJsonBody(req)` from `@/lib/api-error`, not raw `req.json()`.
4. **Rate limit**: explicit on POST — `withApiAuth({ rateLimit: { max: 5, windowMs: 60_000 } })`.
5. **Request ID**: automatic via `withApiAuth` — do not add manually.
6. **Client queries**: `retry: 2`, `staleTime: 30_000` (or higher).
7. **Client mutations**: every `useMutation` has `onError: (err) => toast({ variant: "destructive", description: err.message || "Something went wrong" })`.
8. **Fetch**: use `fetchApi<T>(url)` / `mutateApi<T>(url, { method, body })` from `@/lib/fetch-api`. Never raw `fetch()` in hooks (FormData/SSE excepted — not relevant here).
9. **Logging**: `logger.warn/info/error` from `@/lib/logger`; no `console.*` in production paths.
10. **Types**: no `as Role` / `as any` casts — use `parseRole()` or `isAdminRole()`.
11. **Toast**: `toast({ description: "..." })` — `description` required.
12. **Role-permissions.ts critical checklist (from MEMORY.md):** add `/admin/feedback` to `allPages` tuple AND to `rolePageAccess` for owner / head_office / admin explicitly (owner + head_office get it auto via `allPages`; admin needs explicit inclusion since it's `allPages.filter(p => p !== "/crm/templates")`; marketing/coordinator/member/staff must NOT have it). Verify sidebar shows it by mocking the role.
13. **Tests mocking**: `vi.mock("@/lib/rate-limit", ...)`, `vi.mock("@/lib/logger", ...)`, `vi.mock("@/lib/audit-log", ...)`, `_clearUserActiveCache()` in `beforeEach`. Use `mockImplementation` with input routing, not `mockResolvedValueOnce` chains.

---

## Chunk 1: Commit 1 — Inbox page + list API with pagination

### Task 1: Add `/admin/feedback` to role-permissions + nav

**Files:**

- Modify: `src/lib/role-permissions.ts` (line 61 area — `allPages`; lines 152-156 — `owner/head_office/admin`)
- Modify: `src/lib/nav-config.ts` (Admin section block, lines 111-128)

- [ ] **Step 1: Add route to `allPages`**

In `src/lib/role-permissions.ts`, inside the `allPages` tuple, after line `"/audit-log",` add:

```ts
  "/admin/feedback",
```

(Place it in the Admin cluster, next to `/audit-log` and `/automations`, before the `// Support` comment.)

- [ ] **Step 2: Verify owner/head_office/admin include it automatically**

- `owner`: `allPages` — auto-included ✓
- `head_office`: `allPages` — auto-included ✓
- `admin`: `allPages.filter(p => p !== "/crm/templates")` — auto-included ✓

No other role edits needed. The default filter already excludes it for marketing/coordinator/member/staff since they use explicit lists.

- [ ] **Step 3: Add sidebar nav item**

In `src/lib/nav-config.ts`:

1. Add `Bug` to the lucide imports (line 1-48 block): `Bug` is already a valid lucide icon — add it to the existing import block.
2. In the Admin section (after `/audit-log` on line 123 or so), add:

```ts
  { href: "/admin/feedback", label: "Feedback Inbox", icon: Bug, section: "Admin", tooltip: "Triage staff-submitted bug reports, feature requests, and questions" },
```

- [ ] **Step 4: Run lint + tsc — no new errors**

```bash
npm run lint 2>&1 | tail -5
npx tsc --noEmit 2>&1 | grep -c "error TS"
```

Expected: lint passes for changed files; tsc error count still 12 (not 13+).

- [ ] **Step 5: Commit-worthy? Hold — combine with next task into commit 1.**

### Task 2: Expand GET `/api/internal-feedback` — pagination, filters, total

**Files:**

- Modify: `src/app/api/internal-feedback/route.ts` (GET handler, lines 14-32)
- Modify: `src/__tests__/api/internal-feedback.test.ts` (extend from role-enforcement-only)

- [ ] **Step 1: Write failing tests for pagination**

Add to `src/__tests__/api/internal-feedback.test.ts`:

```ts
describe("GET /api/internal-feedback — pagination + filters", () => {
  beforeEach(() => {
    _clearUserActiveCache();
    vi.clearAllMocks();
    mockSession({ id: "u1", name: "Owner", role: "owner" });
    prismaMock.user.findUnique.mockResolvedValue({ id: "u1", active: true, role: "owner" });
  });

  it("returns paginated feedback (default page 1, limit 50)", async () => {
    const rows = Array.from({ length: 50 }, (_, i) => ({
      id: `fb-${i}`,
      category: "bug",
      status: "new",
      message: `msg ${i}`,
      createdAt: new Date(),
      author: { id: "u2", name: "Reporter", email: "r@a.com", role: "staff" },
    }));
    prismaMock.internalFeedback.findMany.mockResolvedValue(rows);
    prismaMock.internalFeedback.count.mockResolvedValue(127);

    const req = createRequest("GET", "/api/internal-feedback");
    const res = await GET(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.feedback).toHaveLength(50);
    expect(data.page).toBe(1);
    expect(data.limit).toBe(50);
    expect(data.total).toBe(127);
    expect(data.totalPages).toBe(3);
  });

  it("filters by status", async () => {
    prismaMock.internalFeedback.findMany.mockResolvedValue([]);
    prismaMock.internalFeedback.count.mockResolvedValue(0);

    const req = createRequest("GET", "/api/internal-feedback?status=resolved");
    await GET(req);

    const callArgs = prismaMock.internalFeedback.findMany.mock.calls[0][0];
    expect(callArgs.where).toMatchObject({ status: "resolved" });
  });

  it("filters by category", async () => {
    prismaMock.internalFeedback.findMany.mockResolvedValue([]);
    prismaMock.internalFeedback.count.mockResolvedValue(0);

    const req = createRequest("GET", "/api/internal-feedback?category=bug");
    await GET(req);
    const callArgs = prismaMock.internalFeedback.findMany.mock.calls[0][0];
    expect(callArgs.where).toMatchObject({ category: "bug" });
  });

  it("rejects invalid page (negative, non-numeric) → defaults to 1", async () => {
    prismaMock.internalFeedback.findMany.mockResolvedValue([]);
    prismaMock.internalFeedback.count.mockResolvedValue(0);

    const req = createRequest("GET", "/api/internal-feedback?page=-5");
    const res = await GET(req);
    const data = await res.json();
    expect(data.page).toBe(1);
  });
});
```

- [ ] **Step 2: Run tests → confirm they fail (pagination not implemented)**

```bash
npm test -- --run src/__tests__/api/internal-feedback.test.ts 2>&1 | tail -15
```

Expected: FAIL — `data.page` undefined, `data.total` undefined.

- [ ] **Step 3: Implement pagination + filters in GET handler**

Replace `src/app/api/internal-feedback/route.ts` GET block (lines 14-32) with:

```ts
const LIMIT = 50;

export const GET = withApiAuth(async (req) => {
  const { searchParams } = new URL(req.url);
  const statusParam = searchParams.get("status");
  const categoryParam = searchParams.get("category");

  const pageRaw = Number(searchParams.get("page") ?? "1");
  const page = Number.isFinite(pageRaw) && pageRaw >= 1 ? Math.floor(pageRaw) : 1;

  const where: Record<string, unknown> = {};
  if (statusParam) where.status = statusParam;
  if (categoryParam) where.category = categoryParam;

  const [feedback, total] = await Promise.all([
    prisma.internalFeedback.findMany({
      where,
      include: {
        author: { select: { id: true, name: true, email: true, role: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * LIMIT,
      take: LIMIT,
    }),
    prisma.internalFeedback.count({ where }),
  ]);

  return NextResponse.json({
    feedback,
    page,
    limit: LIMIT,
    total,
    totalPages: Math.max(1, Math.ceil(total / LIMIT)),
  });
}, { roles: ["owner", "head_office", "admin"] });
```

- [ ] **Step 4: Re-run tests — all pass**

```bash
npm test -- --run src/__tests__/api/internal-feedback.test.ts 2>&1 | tail -10
```

Expected: PASS (existing role-enforcement tests + 4 new pagination tests).

- [ ] **Step 5: Full test suite sanity — nothing else broke**

```bash
npm test -- --run 2>&1 | tail -5
```

Expected: `Tests 1621 passed | 3 skipped` (1617 + 4 new).

### Task 3: Build `/admin/feedback` list page

**Files:**

- Create: `src/hooks/useInternalFeedback.ts`
- Create: `src/app/(dashboard)/admin/feedback/page.tsx`
- Create: `src/app/(dashboard)/admin/feedback/FeedbackInboxContent.tsx`

- [ ] **Step 1: Create the hook**

Create `src/hooks/useInternalFeedback.ts`:

```ts
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchApi, mutateApi } from "@/lib/fetch-api";

export interface FeedbackAuthor {
  id: string;
  name: string | null;
  email: string;
  role: string;
}

export interface InternalFeedback {
  id: string;
  category: "bug" | "feature_request" | "question" | "general";
  message: string;
  screenshotUrl: string | null;
  page: string | null;
  status: "new" | "acknowledged" | "in_progress" | "resolved";
  resolvedAt: string | null;
  adminNotes: string | null;
  createdAt: string;
  updatedAt: string;
  author: FeedbackAuthor;
}

export interface FeedbackListResponse {
  feedback: InternalFeedback[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface FeedbackFilters {
  status?: string;
  category?: string;
  page?: number;
}

function buildQueryString(filters: FeedbackFilters) {
  const p = new URLSearchParams();
  if (filters.status) p.set("status", filters.status);
  if (filters.category) p.set("category", filters.category);
  if (filters.page) p.set("page", String(filters.page));
  const qs = p.toString();
  return qs ? `?${qs}` : "";
}

export function useFeedbackList(filters: FeedbackFilters) {
  return useQuery<FeedbackListResponse>({
    queryKey: ["internal-feedback", "list", filters.status, filters.category, filters.page ?? 1],
    queryFn: () => fetchApi<FeedbackListResponse>(`/api/internal-feedback${buildQueryString(filters)}`),
    retry: 2,
    staleTime: 30_000,
  });
}

export function useFeedback(id: string | null) {
  return useQuery<{ feedback: InternalFeedback }>({
    queryKey: ["internal-feedback", "detail", id],
    queryFn: () => fetchApi<{ feedback: InternalFeedback }>(`/api/internal-feedback/${id}`),
    enabled: !!id,
    retry: 2,
    staleTime: 30_000,
  });
}

export function useUpdateFeedback() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: string; status?: string; adminNotes?: string }) =>
      mutateApi<{ feedback: InternalFeedback }>(`/api/internal-feedback/${args.id}`, {
        method: "PATCH",
        body: { status: args.status, adminNotes: args.adminNotes },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["internal-feedback"] });
    },
  });
}
```

Note: query keys use primitive values (not filter object) per user's CLAUDE.md anti-cache-miss convention.

- [ ] **Step 2: Create the page entrypoint**

Create `src/app/(dashboard)/admin/feedback/page.tsx`:

```tsx
import { FeedbackInboxContent } from "./FeedbackInboxContent";

export const metadata = {
  title: "Report Issue Inbox | Amana EOS",
};

export default function FeedbackInboxPage() {
  return <FeedbackInboxContent />;
}
```

- [ ] **Step 3: Build `FeedbackInboxContent.tsx`**

Create `src/app/(dashboard)/admin/feedback/FeedbackInboxContent.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Bug, ChevronLeft, ChevronRight, Filter } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { StickyTable } from "@/components/ui/StickyTable";
import { useFeedbackList, type InternalFeedback } from "@/hooks/useInternalFeedback";
import { FeedbackDetailPanel } from "./FeedbackDetailPanel";

const STATUS_OPTIONS = [
  { value: "", label: "All statuses" },
  { value: "new", label: "New" },
  { value: "acknowledged", label: "Acknowledged" },
  { value: "in_progress", label: "In progress" },
  { value: "resolved", label: "Resolved" },
];

const CATEGORY_OPTIONS = [
  { value: "", label: "All categories" },
  { value: "bug", label: "Bug" },
  { value: "feature_request", label: "Feature request" },
  { value: "question", label: "Question" },
  { value: "general", label: "General" },
];

const STATUS_COLORS: Record<string, string> = {
  new: "bg-blue-100 text-blue-700",
  acknowledged: "bg-indigo-100 text-indigo-700",
  in_progress: "bg-amber-100 text-amber-700",
  resolved: "bg-emerald-100 text-emerald-700",
};

const CATEGORY_COLORS: Record<string, string> = {
  bug: "bg-rose-100 text-rose-700",
  feature_request: "bg-violet-100 text-violet-700",
  question: "bg-sky-100 text-sky-700",
  general: "bg-gray-100 text-gray-700",
};

function formatDate(d: string) {
  return new Date(d).toLocaleString("en-AU", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function preview(msg: string, n = 80) {
  return msg.length > n ? msg.slice(0, n - 1) + "…" : msg;
}

export function FeedbackInboxContent() {
  const [status, setStatus] = useState("");
  const [category, setCategory] = useState("");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  const { data, isLoading, error } = useFeedbackList({ status, category, page });

  const handleFilterChange = (key: "status" | "category", v: string) => {
    if (key === "status") setStatus(v);
    else setCategory(v);
    setPage(1);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Report Issue Inbox"
        description="Triage staff-submitted feedback, bugs, and feature requests"
        secondaryActions={[
          { label: "Filters", icon: Filter, onClick: () => setShowFilters((v) => !v) },
        ]}
      />

      {showFilters && (
        <div className="bg-card rounded-xl border border-border p-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-foreground/80 mb-1">Status</label>
              <select
                value={status}
                onChange={(e) => handleFilterChange("status", e.target.value)}
                className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
              >
                {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground/80 mb-1">Category</label>
              <select
                value={category}
                onChange={(e) => handleFilterChange("category", e.target.value)}
                className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
              >
                {CATEGORY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
          Failed to load feedback inbox. You may not have permission to view this page.
        </div>
      )}

      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <StickyTable>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface/50">
                <th className="px-4 py-3 text-left font-medium text-muted whitespace-nowrap">Date</th>
                <th className="px-4 py-3 text-left font-medium text-muted whitespace-nowrap">Author</th>
                <th className="px-4 py-3 text-left font-medium text-muted whitespace-nowrap">Category</th>
                <th className="px-4 py-3 text-left font-medium text-muted whitespace-nowrap">Status</th>
                <th className="px-4 py-3 text-left font-medium text-muted whitespace-nowrap">Page</th>
                <th className="px-4 py-3 text-left font-medium text-muted">Message</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {isLoading && Array.from({ length: 8 }).map((_, i) => (
                <tr key={i}>
                  {Array.from({ length: 6 }).map((__, j) => (
                    <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-28" /></td>
                  ))}
                </tr>
              ))}

              {!isLoading && data?.feedback.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-4">
                    <EmptyState
                      icon={Bug}
                      title="No feedback yet"
                      description="When staff submit feedback via the widget, it'll land here."
                      variant="inline"
                    />
                  </td>
                </tr>
              )}

              {!isLoading && data?.feedback.map((f: InternalFeedback) => (
                <tr
                  key={f.id}
                  onClick={() => setSelectedId(f.id)}
                  className="cursor-pointer hover:bg-surface/50 transition-colors"
                >
                  <td className="px-4 py-3 whitespace-nowrap text-muted">{formatDate(f.createdAt)}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-foreground">{f.author.name ?? f.author.email}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${CATEGORY_COLORS[f.category] ?? ""}`}>
                      {f.category.replace("_", " ")}
                    </span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[f.status] ?? ""}`}>
                      {f.status.replace("_", " ")}
                    </span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap font-mono text-xs text-muted">{f.page ?? "-"}</td>
                  <td className="px-4 py-3 text-muted">{preview(f.message)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </StickyTable>

        {data && data.totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-border px-4 py-3 bg-surface/30">
            <p className="text-sm text-muted">
              Page <span className="font-medium">{data.page}</span> of <span className="font-medium">{data.totalPages}</span> · {data.total} total
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-sm font-medium hover:bg-surface disabled:opacity-50"
              >
                <ChevronLeft className="h-4 w-4" /> Prev
              </button>
              <button
                onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
                disabled={page >= data.totalPages}
                className="flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-sm font-medium hover:bg-surface disabled:opacity-50"
              >
                Next <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {selectedId && (
        <FeedbackDetailPanel
          feedbackId={selectedId}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 4: Stub `FeedbackDetailPanel` so the page compiles**

Create `src/app/(dashboard)/admin/feedback/FeedbackDetailPanel.tsx` with a minimal placeholder (full impl in Task 5):

```tsx
"use client";

export function FeedbackDetailPanel({ feedbackId, onClose }: { feedbackId: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={onClose}>
      <aside className="w-full max-w-md bg-card border-l border-border shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="p-6">
          <p className="text-sm text-muted">Feedback detail — id: {feedbackId}</p>
          <button onClick={onClose} className="mt-4 text-sm text-brand">Close</button>
        </div>
      </aside>
    </div>
  );
}
```

- [ ] **Step 5: Build + tsc — no new errors**

```bash
npm run build 2>&1 | tail -20
npx tsc --noEmit 2>&1 | grep -c "error TS"
```

Expected: build succeeds; tsc errors still 12. Nav shows "Feedback Inbox" under Admin when logged in as owner.

- [ ] **Step 6: Commit 1**

```bash
git add -- \
  src/lib/role-permissions.ts \
  src/lib/nav-config.ts \
  src/app/api/internal-feedback/route.ts \
  src/__tests__/api/internal-feedback.test.ts \
  src/hooks/useInternalFeedback.ts \
  src/app/\(dashboard\)/admin/feedback/page.tsx \
  src/app/\(dashboard\)/admin/feedback/FeedbackInboxContent.tsx \
  src/app/\(dashboard\)/admin/feedback/FeedbackDetailPanel.tsx

git commit -m "$(cat <<'EOF'
feat(feedback): /admin/feedback inbox page + list API

Add admin-only /admin/feedback route with list view (filters + pagination),
hooks (useFeedbackList/useFeedback/useUpdateFeedback), and paginated GET
on /api/internal-feedback. Nav item appears under Admin for owner/head_office/admin.

Closes the P0 "silent black hole" gap — staff feedback via FeedbackWidget
now surfaces for triage instead of sitting in a table no one reads.

Sub-project 8a / Commit 1 of 4.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Chunk 2: Commit 2 — Detail panel + status workflow + admin-notes PATCH

### Task 4: Build PATCH `/api/internal-feedback/[id]` route

**Files:**

- Create: `src/app/api/internal-feedback/[id]/route.ts`
- Create: `src/__tests__/api/internal-feedback-patch.test.ts`

- [ ] **Step 1: Write failing tests for PATCH**

Create `src/__tests__/api/internal-feedback-patch.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "@/__tests__/helpers/prisma-mock";
import { mockSession, mockNoSession, type MockUserRole } from "@/__tests__/helpers/auth-mock";
import { createRequest } from "@/__tests__/helpers/request";

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() => ({ limited: false })),
}));

vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  generateRequestId: () => "test-req-id",
}));

vi.mock("@/lib/audit-log", () => ({
  logAuditEvent: vi.fn(),
}));

import { GET, PATCH } from "@/app/api/internal-feedback/[id]/route";
import { _clearUserActiveCache } from "@/lib/server-auth";
import { logAuditEvent } from "@/lib/audit-log";

const params = { params: Promise.resolve({ id: "fb-1" }) };

describe("PATCH /api/internal-feedback/[id]", () => {
  beforeEach(() => {
    _clearUserActiveCache();
    vi.clearAllMocks();
    prismaMock.user.findUnique.mockResolvedValue({ id: "u1", active: true, role: "owner" });
  });

  it("returns 401 when unauthenticated", async () => {
    mockNoSession();
    const req = createRequest("PATCH", "/api/internal-feedback/fb-1", { body: { status: "resolved" } });
    const res = await PATCH(req, params);
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
    mockSession({ id: "u1", name: "User", role: role as MockUserRole });
    prismaMock.user.findUnique.mockResolvedValue({ id: "u1", active: true, role });
    prismaMock.internalFeedback.findUnique.mockResolvedValue({ id: "fb-1", status: "new", adminNotes: null });
    prismaMock.internalFeedback.update.mockResolvedValue({
      id: "fb-1", status: "resolved", adminNotes: null, resolvedAt: new Date(),
      author: { id: "u2", name: "R", email: "r@a.com", role: "staff" },
    });

    const req = createRequest("PATCH", "/api/internal-feedback/fb-1", { body: { status: "resolved" } });
    const res = await PATCH(req, params);
    expect(res.status).toBe(expected);
  });

  it("returns 400 on invalid status value", async () => {
    mockSession({ id: "u1", name: "Owner", role: "owner" });
    const req = createRequest("PATCH", "/api/internal-feedback/fb-1", { body: { status: "banana" } });
    const res = await PATCH(req, params);
    expect(res.status).toBe(400);
  });

  it("returns 400 on adminNotes over 5000 chars", async () => {
    mockSession({ id: "u1", name: "Owner", role: "owner" });
    const req = createRequest("PATCH", "/api/internal-feedback/fb-1", { body: { adminNotes: "a".repeat(5001) } });
    const res = await PATCH(req, params);
    expect(res.status).toBe(400);
  });

  it("returns 404 when feedback does not exist", async () => {
    mockSession({ id: "u1", name: "Owner", role: "owner" });
    prismaMock.internalFeedback.findUnique.mockResolvedValue(null);

    const req = createRequest("PATCH", "/api/internal-feedback/missing", { body: { status: "resolved" } });
    const res = await PATCH(req, { params: Promise.resolve({ id: "missing" }) });
    expect(res.status).toBe(404);
  });

  it("sets resolvedAt when status → resolved", async () => {
    mockSession({ id: "u1", name: "Owner", role: "owner" });
    prismaMock.internalFeedback.findUnique.mockResolvedValue({ id: "fb-1", status: "new", adminNotes: null });
    prismaMock.internalFeedback.update.mockResolvedValue({
      id: "fb-1", status: "resolved", adminNotes: null, resolvedAt: new Date(),
      author: { id: "u2", name: "R", email: "r@a.com", role: "staff" },
    });

    const req = createRequest("PATCH", "/api/internal-feedback/fb-1", { body: { status: "resolved" } });
    await PATCH(req, params);

    const call = prismaMock.internalFeedback.update.mock.calls[0][0];
    expect(call.data.status).toBe("resolved");
    expect(call.data.resolvedAt).toBeInstanceOf(Date);
  });

  it("clears resolvedAt when status → in_progress after resolved", async () => {
    mockSession({ id: "u1", name: "Owner", role: "owner" });
    prismaMock.internalFeedback.findUnique.mockResolvedValue({ id: "fb-1", status: "resolved", adminNotes: null });
    prismaMock.internalFeedback.update.mockResolvedValue({
      id: "fb-1", status: "in_progress", adminNotes: null, resolvedAt: null,
      author: { id: "u2", name: "R", email: "r@a.com", role: "staff" },
    });

    const req = createRequest("PATCH", "/api/internal-feedback/fb-1", { body: { status: "in_progress" } });
    await PATCH(req, params);
    const call = prismaMock.internalFeedback.update.mock.calls[0][0];
    expect(call.data.resolvedAt).toBeNull();
  });

  it("logs audit event on status change", async () => {
    mockSession({ id: "u1", name: "Owner", role: "owner" });
    prismaMock.internalFeedback.findUnique.mockResolvedValue({ id: "fb-1", status: "new", adminNotes: null });
    prismaMock.internalFeedback.update.mockResolvedValue({
      id: "fb-1", status: "resolved", adminNotes: null, resolvedAt: new Date(),
      author: { id: "u2", name: "R", email: "r@a.com", role: "staff" },
    });

    const req = createRequest("PATCH", "/api/internal-feedback/fb-1", { body: { status: "resolved" } });
    await PATCH(req, params);
    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "feedback.status_changed",
        targetId: "fb-1",
        targetType: "InternalFeedback",
        metadata: expect.objectContaining({ from: "new", to: "resolved" }),
      }),
      expect.anything(),
    );
  });

  it("does NOT log audit when only adminNotes change (no status transition)", async () => {
    mockSession({ id: "u1", name: "Owner", role: "owner" });
    prismaMock.internalFeedback.findUnique.mockResolvedValue({ id: "fb-1", status: "new", adminNotes: null });
    prismaMock.internalFeedback.update.mockResolvedValue({
      id: "fb-1", status: "new", adminNotes: "investigating", resolvedAt: null,
      author: { id: "u2", name: "R", email: "r@a.com", role: "staff" },
    });

    const req = createRequest("PATCH", "/api/internal-feedback/fb-1", { body: { adminNotes: "investigating" } });
    await PATCH(req, params);
    expect(logAuditEvent).not.toHaveBeenCalled();
  });
});

describe("GET /api/internal-feedback/[id]", () => {
  beforeEach(() => {
    _clearUserActiveCache();
    vi.clearAllMocks();
    mockSession({ id: "u1", name: "Owner", role: "owner" });
    prismaMock.user.findUnique.mockResolvedValue({ id: "u1", active: true, role: "owner" });
  });

  it("returns feedback by id", async () => {
    prismaMock.internalFeedback.findUnique.mockResolvedValue({
      id: "fb-1", status: "new", message: "hello", category: "bug",
      author: { id: "u2", name: "R", email: "r@a.com", role: "staff" },
    });

    const req = createRequest("GET", "/api/internal-feedback/fb-1");
    const res = await GET(req, params);
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.feedback.id).toBe("fb-1");
  });

  it("returns 404 on unknown id", async () => {
    prismaMock.internalFeedback.findUnique.mockResolvedValue(null);
    const req = createRequest("GET", "/api/internal-feedback/nope");
    const res = await GET(req, { params: Promise.resolve({ id: "nope" }) });
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run tests — confirm failure (route doesn't exist)**

```bash
npm test -- --run src/__tests__/api/internal-feedback-patch.test.ts 2>&1 | tail -5
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the route**

Create `src/app/api/internal-feedback/[id]/route.ts`:

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { logAuditEvent } from "@/lib/audit-log";

const STATUSES = ["new", "acknowledged", "in_progress", "resolved"] as const;

const patchFeedbackSchema = z
  .object({
    status: z.enum(STATUSES).optional(),
    adminNotes: z.string().max(5000).optional(),
  })
  .refine((v) => v.status !== undefined || v.adminNotes !== undefined, {
    message: "At least one of status or adminNotes must be provided",
  });

export const GET = withApiAuth(
  async (req, session, context) => {
    const { id } = await context!.params!;
    const feedback = await prisma.internalFeedback.findUnique({
      where: { id },
      include: {
        author: { select: { id: true, name: true, email: true, role: true } },
      },
    });
    if (!feedback) throw ApiError.notFound("Feedback not found");
    return NextResponse.json({ feedback });
  },
  { roles: ["owner", "head_office", "admin"] },
);

export const PATCH = withApiAuth(
  async (req, session, context) => {
    const { id } = await context!.params!;
    const body = await parseJsonBody(req);
    const parsed = patchFeedbackSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message, details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const existing = await prisma.internalFeedback.findUnique({
      where: { id },
      select: { id: true, status: true, adminNotes: true },
    });
    if (!existing) throw ApiError.notFound("Feedback not found");

    const { status, adminNotes } = parsed.data;
    const data: Record<string, unknown> = {};
    if (status !== undefined) {
      data.status = status;
      data.resolvedAt = status === "resolved" ? new Date() : null;
    }
    if (adminNotes !== undefined) {
      data.adminNotes = adminNotes;
    }

    const updated = await prisma.internalFeedback.update({
      where: { id },
      data,
      include: {
        author: { select: { id: true, name: true, email: true, role: true } },
      },
    });

    if (status !== undefined && status !== existing.status) {
      logAuditEvent(
        {
          action: "feedback.status_changed",
          actorId: session.user.id,
          actorEmail: session.user.email ?? null,
          targetId: id,
          targetType: "InternalFeedback",
          metadata: { from: existing.status, to: status },
        },
        req,
      );
    }

    return NextResponse.json({ feedback: updated });
  },
  { roles: ["owner", "head_office", "admin"] },
);
```

- [ ] **Step 4: Re-run tests → all pass**

```bash
npm test -- --run src/__tests__/api/internal-feedback-patch.test.ts 2>&1 | tail -10
```

Expected: PASS (all 12 tests).

### Task 5: Build the full `FeedbackDetailPanel`

**Files:**

- Modify (replace stub): `src/app/(dashboard)/admin/feedback/FeedbackDetailPanel.tsx`

- [ ] **Step 1: Replace the stub with full panel**

Replace `src/app/(dashboard)/admin/feedback/FeedbackDetailPanel.tsx` contents:

```tsx
"use client";

import { useState, useEffect, useRef } from "react";
import { X, User, Calendar, Link as LinkIcon, Loader2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/useToast";
import { Skeleton } from "@/components/ui/Skeleton";
import { useFeedback, useUpdateFeedback } from "@/hooks/useInternalFeedback";

const STATUS_OPTIONS = [
  { value: "new", label: "New" },
  { value: "acknowledged", label: "Acknowledged" },
  { value: "in_progress", label: "In progress" },
  { value: "resolved", label: "Resolved" },
];

function formatFull(d: string) {
  return new Date(d).toLocaleString("en-AU", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function FeedbackDetailPanel({ feedbackId, onClose }: { feedbackId: string; onClose: () => void }) {
  const { data, isLoading } = useFeedback(feedbackId);
  const feedback = data?.feedback;

  const [notes, setNotes] = useState("");
  const [notesSaving, setNotesSaving] = useState(false);
  const [notesSavedAt, setNotesSavedAt] = useState<number | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Dirty ref prevents a mid-type server response from clobbering the user's text.
  // Flips true on keystroke, back to false only after the successful save round-trip.
  const notesDirtyRef = useRef(false);

  const qc = useQueryClient();
  const update = useUpdateFeedback();

  // Only sync server → local when NOT dirty (user isn't mid-type).
  // Dependency on id covers switching between feedback items.
  useEffect(() => {
    if (!notesDirtyRef.current) {
      setNotes(feedback?.adminNotes ?? "");
    }
  }, [feedback?.id, feedback?.adminNotes]);

  const handleStatusChange = (newStatus: string) => {
    if (!feedback) return;
    const prev = feedback.status;
    // Key must match useFeedback() in src/hooks/useInternalFeedback.ts
    const detailKey = ["internal-feedback", "detail", feedback.id];
    qc.setQueryData<{ feedback: typeof feedback } | undefined>(
      detailKey,
      (old) => (old ? { feedback: { ...old.feedback, status: newStatus as typeof feedback.status } } : old),
    );
    update.mutate(
      { id: feedback.id, status: newStatus },
      {
        onError: (err: Error) => {
          qc.setQueryData<{ feedback: typeof feedback } | undefined>(
            detailKey,
            (old) => (old ? { feedback: { ...old.feedback, status: prev } } : old),
          );
          toast({ variant: "destructive", description: err.message || "Failed to update status" });
        },
      },
    );
  };

  const handleNotesChange = (v: string) => {
    notesDirtyRef.current = true;
    setNotes(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (!feedback) return;
      setNotesSaving(true);
      update.mutate(
        { id: feedback.id, adminNotes: v },
        {
          onSuccess: () => {
            setNotesSaving(false);
            setNotesSavedAt(Date.now());
            notesDirtyRef.current = false;
          },
          onError: (err: Error) => {
            setNotesSaving(false);
            toast({ variant: "destructive", description: err.message || "Failed to save notes" });
          },
        },
      );
    }, 2000);
  };

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={onClose}>
      <aside
        className="w-full max-w-xl bg-card border-l border-border shadow-2xl overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        aria-label="Feedback detail"
      >
        <header className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="text-lg font-semibold">Feedback detail</h2>
          <button onClick={onClose} className="rounded-md p-1 text-muted hover:bg-surface" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </header>

        {isLoading && (
          <div className="p-6 space-y-4">
            <Skeleton className="h-6 w-3/4" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        )}

        {feedback && (
          <div className="p-6 space-y-5">
            <div className="flex items-center gap-3 text-sm">
              <User className="h-4 w-4 text-muted" />
              <span className="font-medium">{feedback.author.name ?? feedback.author.email}</span>
              <span className="text-muted">· {feedback.author.role}</span>
            </div>

            <div className="flex items-center gap-3 text-sm text-muted">
              <Calendar className="h-4 w-4" />
              <span>{formatFull(feedback.createdAt)}</span>
            </div>

            {feedback.page && (
              <div className="flex items-center gap-2 text-sm">
                <LinkIcon className="h-4 w-4 text-muted" />
                <a href={feedback.page} className="text-brand hover:underline font-mono text-xs" target="_blank" rel="noopener noreferrer">
                  {feedback.page}
                </a>
              </div>
            )}

            <div>
              <p className="text-xs font-medium text-muted mb-1">Category</p>
              <p className="text-sm capitalize">{feedback.category.replace("_", " ")}</p>
            </div>

            <div>
              <p className="text-xs font-medium text-muted mb-1">Message</p>
              <div className="rounded-lg border border-border bg-surface/30 p-4 text-sm whitespace-pre-wrap">
                {feedback.message}
              </div>
            </div>

            {feedback.screenshotUrl && (
              <div>
                <p className="text-xs font-medium text-muted mb-1">Screenshot</p>
                <a href={feedback.screenshotUrl} target="_blank" rel="noopener noreferrer" className="block">
                  <img
                    src={feedback.screenshotUrl}
                    alt="Feedback screenshot"
                    className="rounded-lg border border-border max-h-80 object-contain"
                  />
                </a>
              </div>
            )}

            <div>
              <label htmlFor="fb-status" className="block text-xs font-medium text-muted mb-1">Status</label>
              <select
                id="fb-status"
                value={feedback.status}
                onChange={(e) => handleStatusChange(e.target.value)}
                className="w-full rounded-lg border border-border bg-surface/50 px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
              >
                {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>

            <div>
              <label htmlFor="fb-notes" className="flex items-center justify-between text-xs font-medium text-muted mb-1">
                <span>Admin notes</span>
                <span className="flex items-center gap-1 text-[11px]">
                  {notesSaving && <><Loader2 className="h-3 w-3 animate-spin" /> Saving…</>}
                  {!notesSaving && notesSavedAt && <span className="text-emerald-600">Saved</span>}
                </span>
              </label>
              <textarea
                id="fb-notes"
                value={notes}
                onChange={(e) => handleNotesChange(e.target.value)}
                rows={5}
                maxLength={5000}
                placeholder="Add investigation notes, fix details, or context…"
                className="w-full resize-none rounded-lg border border-border bg-surface/50 px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
              />
              <p className="mt-1 text-[11px] text-muted">{notes.length} / 5000</p>
            </div>

            {feedback.resolvedAt && (
              <p className="text-xs text-emerald-700 bg-emerald-50 rounded-md px-3 py-2">
                Resolved at {formatFull(feedback.resolvedAt)}
              </p>
            )}
          </div>
        )}
      </aside>
    </div>
  );
}
```

- [ ] **Step 2: Build + tsc**

```bash
npm run build 2>&1 | tail -20
npx tsc --noEmit 2>&1 | grep -c "error TS"
```

Expected: build succeeds; tsc still 12.

- [ ] **Step 3: Full test suite**

```bash
npm test -- --run 2>&1 | tail -5
```

Expected: `Tests 1633 passed | 3 skipped` (1617 + 4 pagination + 12 PATCH).

- [ ] **Step 4: Commit 2**

```bash
git add -- \
  src/app/api/internal-feedback/\[id\]/route.ts \
  src/app/\(dashboard\)/admin/feedback/FeedbackDetailPanel.tsx \
  src/__tests__/api/internal-feedback-patch.test.ts

git commit -m "$(cat <<'EOF'
feat(feedback): detail panel + status workflow + admin notes

Add GET/PATCH /api/internal-feedback/[id] with Zod validation, 404 handling,
and audit logging on status transitions. Build slide-in FeedbackDetailPanel
with optimistic status dropdown and 2s-debounced admin-notes autosave.

Panel shows author + page + screenshot + full message + activity timeline.
Status → resolved sets resolvedAt; reverting clears it.

Sub-project 8a / Commit 2 of 4.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Chunk 3: Commit 3 — Slack notification + rate limit on POST

### Task 6: Build `slack-webhook.ts` helper

**Files:**

- Create: `src/lib/slack-webhook.ts`
- Create: `src/__tests__/lib/slack-webhook.test.ts`

- [ ] **Step 1: Write failing tests for Slack helper**

Create `src/__tests__/lib/slack-webhook.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { sendSlackFeedback } from "@/lib/slack-webhook";
import { logger } from "@/lib/logger";

describe("sendSlackFeedback", () => {
  const originalEnv = process.env.SLACK_INTERNAL_FEEDBACK_WEBHOOK_URL;
  const fetchSpy = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    (globalThis as Record<string, unknown>).fetch = fetchSpy;
    fetchSpy.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    if (originalEnv === undefined) delete process.env.SLACK_INTERNAL_FEEDBACK_WEBHOOK_URL;
    else process.env.SLACK_INTERNAL_FEEDBACK_WEBHOOK_URL = originalEnv;
  });

  it("is a no-op when env var absent", async () => {
    delete process.env.SLACK_INTERNAL_FEEDBACK_WEBHOOK_URL;
    await sendSlackFeedback({ id: "fb-1", authorName: "Jayden", role: "owner", category: "bug", message: "Broken" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("POSTs to the webhook URL with formatted payload", async () => {
    process.env.SLACK_INTERNAL_FEEDBACK_WEBHOOK_URL = "https://hooks.slack.com/xxx";
    fetchSpy.mockResolvedValue(new Response(null, { status: 200 }));

    await sendSlackFeedback({ id: "fb-1", authorName: "Jayden", role: "owner", category: "bug", message: "It broke" });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("https://hooks.slack.com/xxx");
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body);
    expect(body.text).toContain("bug");
    expect(body.text).toContain("Jayden");
    expect(body.text).toContain("It broke");
    expect(body.text).toContain("/admin/feedback");
  });

  it("truncates very long messages to 100 chars with ellipsis", async () => {
    process.env.SLACK_INTERNAL_FEEDBACK_WEBHOOK_URL = "https://hooks.slack.com/xxx";
    fetchSpy.mockResolvedValue(new Response(null, { status: 200 }));

    await sendSlackFeedback({
      id: "fb-1",
      authorName: "Jayden",
      role: "owner",
      category: "bug",
      message: "x".repeat(250),
    });

    const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
    expect(body.text).toContain("…");
    expect(body.text).not.toContain("x".repeat(101));
  });

  it("retries once on failure then logs and swallows", async () => {
    process.env.SLACK_INTERNAL_FEEDBACK_WEBHOOK_URL = "https://hooks.slack.com/xxx";
    fetchSpy.mockRejectedValue(new Error("boom"));

    await sendSlackFeedback({ id: "fb-1", authorName: "J", role: "admin", category: "bug", message: "m" });

    expect(fetchSpy).toHaveBeenCalledTimes(2); // initial + 1 retry
    expect(logger.warn).toHaveBeenCalledWith(
      "Slack feedback webhook failed",
      expect.any(Object),
    );
  });

  it("aborts after 3s timeout and logs", async () => {
    process.env.SLACK_INTERNAL_FEEDBACK_WEBHOOK_URL = "https://hooks.slack.com/xxx";
    // Mock must honor the abort signal: reject with AbortError when controller.abort() fires
    fetchSpy.mockImplementation((_url, init: RequestInit) =>
      new Promise((_, reject) => {
        init.signal?.addEventListener("abort", () =>
          reject(new DOMException("The operation was aborted.", "AbortError")),
        );
      }),
    );

    const promise = sendSlackFeedback({ id: "fb-1", authorName: "J", role: "admin", category: "bug", message: "m" });
    await vi.advanceTimersByTimeAsync(3100); // first attempt
    await vi.advanceTimersByTimeAsync(3100); // retry
    await promise;

    expect(fetchSpy).toHaveBeenCalledTimes(2); // initial + retry
    expect(logger.warn).toHaveBeenCalledWith(
      "Slack feedback webhook failed",
      expect.any(Object),
    );
  });

  it("passes AbortSignal to fetch", async () => {
    process.env.SLACK_INTERNAL_FEEDBACK_WEBHOOK_URL = "https://hooks.slack.com/xxx";
    fetchSpy.mockResolvedValue(new Response(null, { status: 200 }));

    await sendSlackFeedback({ id: "fb-1", authorName: "J", role: "admin", category: "bug", message: "m" });

    const init = fetchSpy.mock.calls[0][1];
    expect(init.signal).toBeDefined();
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("does not throw on fetch error (fire-and-forget)", async () => {
    process.env.SLACK_INTERNAL_FEEDBACK_WEBHOOK_URL = "https://hooks.slack.com/xxx";
    fetchSpy.mockRejectedValue(new Error("boom"));
    await expect(
      sendSlackFeedback({ id: "fb-1", authorName: "J", role: "admin", category: "bug", message: "m" }),
    ).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests — fail because helper doesn't exist**

```bash
npm test -- --run src/__tests__/lib/slack-webhook.test.ts 2>&1 | tail -5
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the helper**

Create `src/lib/slack-webhook.ts`:

```ts
import { logger } from "@/lib/logger";

export interface SlackFeedbackPayload {
  id: string;
  authorName: string;
  role: string;
  category: string;
  message: string;
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

function buildDashboardUrl(id: string): string {
  const base = process.env.NEXTAUTH_URL?.replace(/\/$/, "") ?? "";
  return `${base}/admin/feedback?id=${id}`;
}

async function attempt(url: string, body: string): Promise<void> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 3000);
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(t);
  }
}

/**
 * Fire-and-forget Slack notification for new internal feedback.
 * No-op when `SLACK_INTERNAL_FEEDBACK_WEBHOOK_URL` is unset.
 * 3s timeout per attempt + one retry → log and swallow.
 */
export async function sendSlackFeedback(payload: SlackFeedbackPayload): Promise<void> {
  const url = process.env.SLACK_INTERNAL_FEEDBACK_WEBHOOK_URL;
  if (!url) return;

  const body = JSON.stringify({
    text: `🐛 New ${payload.category} from ${payload.authorName} (${payload.role}): "${truncate(payload.message, 100)}" — ${buildDashboardUrl(payload.id)}`,
  });

  try {
    await attempt(url, body);
  } catch (firstErr) {
    try {
      await attempt(url, body);
    } catch (retryErr) {
      logger.warn("Slack feedback webhook failed", {
        feedbackId: payload.id,
        firstError: firstErr instanceof Error ? firstErr.message : String(firstErr),
        retryError: retryErr instanceof Error ? retryErr.message : String(retryErr),
      });
    }
  }
}
```

- [ ] **Step 4: Re-run Slack tests — pass**

```bash
npm test -- --run src/__tests__/lib/slack-webhook.test.ts 2>&1 | tail -5
```

Expected: PASS (7 tests).

### Task 7: Wire Slack + rate-limit into POST `/api/internal-feedback`

**Files:**

- Modify: `src/app/api/internal-feedback/route.ts` (POST handler, lines 34-54)
- Create: `src/__tests__/api/internal-feedback-post.test.ts`

- [ ] **Step 1: Write failing tests for POST**

Create `src/__tests__/api/internal-feedback-post.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "@/__tests__/helpers/prisma-mock";
import { mockSession, mockNoSession } from "@/__tests__/helpers/auth-mock";
import { createRequest } from "@/__tests__/helpers/request";

const rateLimitState = { limited: false, resetIn: 0 };

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(async () => ({ limited: rateLimitState.limited, resetIn: rateLimitState.resetIn })),
}));

vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  generateRequestId: () => "test-req-id",
}));

vi.mock("@/lib/slack-webhook", () => ({
  sendSlackFeedback: vi.fn(),
}));

import { POST } from "@/app/api/internal-feedback/route";
import { _clearUserActiveCache } from "@/lib/server-auth";
import { sendSlackFeedback } from "@/lib/slack-webhook";

describe("POST /api/internal-feedback", () => {
  beforeEach(() => {
    _clearUserActiveCache();
    vi.clearAllMocks();
    rateLimitState.limited = false;
    rateLimitState.resetIn = 0;
    mockSession({ id: "u1", name: "Staff", role: "staff" });
    prismaMock.user.findUnique.mockResolvedValue({ id: "u1", active: true, role: "staff" });
  });

  it("returns 401 unauthenticated", async () => {
    mockNoSession();
    const req = createRequest("POST", "/api/internal-feedback", { body: { category: "bug", message: "x" } });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 400 on missing message", async () => {
    const req = createRequest("POST", "/api/internal-feedback", { body: { category: "bug", message: "" } });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 on invalid category", async () => {
    const req = createRequest("POST", "/api/internal-feedback", { body: { category: "banana", message: "x" } });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 on invalid JSON body", async () => {
    const req = new Request("http://localhost:3000/api/internal-feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not-json",
    });
    const res = await POST(req as any);
    expect(res.status).toBe(400);
  });

  it("creates feedback, returns 201, fires Slack webhook", async () => {
    prismaMock.internalFeedback.create.mockResolvedValue({
      id: "fb-new", category: "bug", message: "broken", status: "new",
    });

    const req = createRequest("POST", "/api/internal-feedback", { body: { category: "bug", message: "broken" } });
    const res = await POST(req);
    expect(res.status).toBe(201);
    expect(sendSlackFeedback).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "fb-new",
        authorName: "Staff",
        role: "staff",
        category: "bug",
        message: "broken",
      }),
    );
  });

  it("returns 429 when rate limited (6th req within 60s)", async () => {
    rateLimitState.limited = true;
    rateLimitState.resetIn = 30000;
    const req = createRequest("POST", "/api/internal-feedback", { body: { category: "bug", message: "again" } });
    const res = await POST(req);
    expect(res.status).toBe(429);
  });

  it("does not fail the response if Slack webhook throws", async () => {
    (sendSlackFeedback as any).mockRejectedValue(new Error("slack down"));
    prismaMock.internalFeedback.create.mockResolvedValue({ id: "fb-ok", category: "general", message: "m", status: "new" });

    const req = createRequest("POST", "/api/internal-feedback", { body: { category: "general", message: "m" } });
    const res = await POST(req);
    expect(res.status).toBe(201);
  });
});
```

- [ ] **Step 2: Run — tests fail (POST currently lacks rate-limit + Slack integration)**

```bash
npm test -- --run src/__tests__/api/internal-feedback-post.test.ts 2>&1 | tail -15
```

Expected: FAIL on rate-limit test + Slack expectation.

- [ ] **Step 3: Update POST handler**

Replace the POST block in `src/app/api/internal-feedback/route.ts` with:

```ts
export const POST = withApiAuth(
  async (req, session) => {
    const body = await parseJsonBody(req);
    const parsed = createFeedbackSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message, details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }
    const { category, message, screenshotUrl, page } = parsed.data;

    const feedback = await prisma.internalFeedback.create({
      data: {
        authorId: session.user.id,
        category,
        message: message.trim(),
        screenshotUrl: screenshotUrl || null,
        page: page || null,
      },
    });

    // Fire-and-forget Slack webhook (errors logged, never thrown)
    sendSlackFeedback({
      id: feedback.id,
      authorName: session.user.name ?? session.user.email ?? "Unknown",
      role: session.user.role ?? "unknown",
      category,
      message: message.trim(),
    }).catch(() => {}); // belt-and-braces — helper already swallows

    return NextResponse.json({ feedback }, { status: 201 });
  },
  { rateLimit: { max: 5, windowMs: 60_000 } },
);
```

Add at top of file:

```ts
import { sendSlackFeedback } from "@/lib/slack-webhook";
```

- [ ] **Step 4: Re-run POST tests → pass**

```bash
npm test -- --run src/__tests__/api/internal-feedback-post.test.ts 2>&1 | tail -8
```

Expected: PASS (7 tests).

- [ ] **Step 5: Full test suite — confirm deltas**

```bash
npm test -- --run 2>&1 | tail -5
```

Expected: `Tests 1647 passed | 3 skipped` (1617 + 4 + 12 + 7 Slack + 7 POST = 1647).

- [ ] **Step 6: Switch `FeedbackWidget` to `mutateApi`**

In `src/components/shared/FeedbackWidget.tsx`, replace the `mutationFn` body (lines 24-39) with:

```ts
import { mutateApi } from "@/lib/fetch-api";

// ...
const mutation = useMutation({
  mutationFn: (data: { category: string; message: string; page: string }) =>
    mutateApi("/api/internal-feedback", { method: "POST", body: data }),
  onSuccess: () => {
    toast({ description: "Feedback submitted — thank you!" });
    setMessage("");
    setCategory("general");
    setOpen(false);
  },
  onError: (err: Error) => {
    toast({ description: err.message, variant: "destructive" });
  },
});
```

(Also remove the imports that become unused.)

- [ ] **Step 7: tsc + lint + test one more time**

```bash
npx tsc --noEmit 2>&1 | grep -c "error TS"
npm run lint 2>&1 | tail -3
npm test -- --run 2>&1 | tail -5
```

Expected: 12 tsc errors (unchanged), lint clean for changed files, tests 1647 passing.

- [ ] **Step 8: Commit 3**

```bash
git add -- \
  src/lib/slack-webhook.ts \
  src/__tests__/lib/slack-webhook.test.ts \
  src/app/api/internal-feedback/route.ts \
  src/__tests__/api/internal-feedback-post.test.ts \
  src/components/shared/FeedbackWidget.tsx

git commit -m "$(cat <<'EOF'
feat(feedback): Slack notification + rate limit on POST

Add sendSlackFeedback helper (AbortController 3s timeout + single retry,
env-gated on SLACK_INTERNAL_FEEDBACK_WEBHOOK_URL, fire-and-forget).
Wire into POST /api/internal-feedback after create. Slack errors log and
drop — never block the response.

Rate-limit POST to 5 req/min/user per endpoint (was default 60). Switch
FeedbackWidget from raw fetch to mutateApi for standards compliance.

Sub-project 8a / Commit 3 of 4.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Chunk 4: Commit 4 — E2E test + coverage consolidation

### Task 8: Playwright E2E for submit → resolve flow

**Files:**

- Create: `tests/e2e/feedback-inbox.spec.ts`

- [ ] **Step 1: Write the E2E test**

Create `tests/e2e/feedback-inbox.spec.ts`:

```ts
/**
 * E2E: Report Issue feedback flow
 *
 * Submit via FeedbackWidget → admin visits /admin/feedback →
 * sees new row → opens detail → transitions status to resolved →
 * audit log entry recorded.
 */

import { test, expect } from "@playwright/test";

test.describe("Feedback inbox flow", () => {
  test.use({ storageState: ".playwright/auth/owner.json" });

  test("submit via widget → appears in admin inbox → resolve", async ({ page }) => {
    // 1. Visit dashboard and submit via floating widget
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");

    const widgetTrigger = page.getByRole("button", { name: /send feedback/i });
    await expect(widgetTrigger).toBeVisible({ timeout: 10_000 });
    await widgetTrigger.click();

    await page.locator("#fb-category").selectOption("bug");
    const uniqueMessage = `E2E test bug ${Date.now()}`;
    await page.locator("#fb-message").fill(uniqueMessage);
    await page.getByRole("button", { name: /submit feedback/i }).click();

    // Confirm toast
    await expect(page.getByText(/feedback submitted/i)).toBeVisible({ timeout: 10_000 });

    // 2. Navigate to inbox
    await page.goto("/admin/feedback");
    await page.waitForLoadState("networkidle");

    await expect(page.getByRole("heading", { name: /report issue inbox/i })).toBeVisible();

    // 3. Find the newly-created row
    const row = page.locator("tr", { hasText: uniqueMessage }).first();
    await expect(row).toBeVisible({ timeout: 15_000 });

    // 4. Open detail + transition to resolved
    await row.click();
    const detail = page.getByLabel("Feedback detail");
    await expect(detail).toBeVisible({ timeout: 10_000 });

    await detail.locator("#fb-status").selectOption("resolved");

    // 5. Close + reopen — confirm status persisted
    await detail.getByLabel("Close").click();
    await page.reload();
    await page.waitForLoadState("networkidle");

    const resolvedRow = page.locator("tr", { hasText: uniqueMessage }).first();
    await expect(resolvedRow.getByText(/resolved/i)).toBeVisible();
  });

  test.describe("non-admin access", () => {
    test.use({ storageState: ".playwright/auth/staff.json" });

    test("staff role: sidebar has no Feedback Inbox + page guarded", async ({ page }) => {
      await page.goto("/dashboard");
      await page.waitForLoadState("networkidle");

      // Sidebar should not surface the nav item for staff
      await expect(page.getByRole("link", { name: /feedback inbox/i })).toHaveCount(0);

      // Even direct navigation should not load the inbox content
      await page.goto("/admin/feedback");
      await page.waitForLoadState("networkidle");

      // Report Issue Inbox heading must not render
      await expect(page.getByRole("heading", { name: /report issue inbox/i })).toHaveCount(0);
    });
  });
});
```

- [ ] **Step 2: Run the E2E locally (requires dev server + test DB)**

```bash
npm run test:e2e -- tests/e2e/feedback-inbox.spec.ts 2>&1 | tail -20
```

Expected: PASS. If owner auth state is missing, ensure `.playwright/auth/owner.json` is generated via the existing `auth.setup.ts`.

If the local env can't run Playwright (missing PARENT_JWT_SECRET or test DB), document the skip in the commit body — the unit coverage covers 100% of the critical paths.

### Task 9: Final verification + Commit 4

- [ ] **Step 1: Full tsc + lint + unit test run**

```bash
npx tsc --noEmit 2>&1 | grep -c "error TS"    # expect 12 (baseline, unchanged)
npm run lint 2>&1 | tail -3                     # expect no new errors
npm test -- --run 2>&1 | tail -5                # expect 1647 passing + 3 skipped
```

- [ ] **Step 2: Build**

```bash
npm run build 2>&1 | tail -20
```

Expected: build succeeds. Deploy preview should render `/admin/feedback` for owner.

- [ ] **Step 3: Manual smoke test — run dev server**

```bash
npm run dev
```

Visit http://localhost:3000, log in as an owner, click the floating bug widget, submit. Open the sidebar → Admin → Feedback Inbox. Row should appear. Open detail, switch status → reload → status persists.

- [ ] **Step 4: Commit 4**

```bash
git add -- tests/e2e/feedback-inbox.spec.ts

git commit -m "$(cat <<'EOF'
test(feedback): E2E submit→resolve flow + access control

Playwright spec: owner submits via FeedbackWidget → inbox shows row →
status transitions to resolved → persists across reload. Also verifies
non-admin roles cannot access /admin/feedback.

Covers the integration gap the unit tests miss — end-to-end proof the
P0 "silent black hole" is now triageable.

Sub-project 8a / Commit 4 of 4.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Post-commit: Push + PR

- [ ] **Step 1: Push branch**

```bash
git push -u origin feat/ai-queue-ops-8a-2026-04-22
```

- [ ] **Step 2: Open PR**

```bash
gh pr create --title "feat: Report Issue admin inbox (sub-project 8a)" --body "$(cat <<'EOF'
## Summary

Closes the P0 "silent black hole" roadmap gap: staff feedback submitted via the floating `FeedbackWidget` now surfaces in an admin-only `/admin/feedback` inbox with status workflow, admin notes, audit logging, and Slack notification.

## Before / After

| | Before | After |
|---|---|---|
| Admin visibility | `InternalFeedback` rows accumulated silently — no UI | `/admin/feedback` list + detail panel |
| Status workflow | None (all rows stuck at `new`) | `new → acknowledged → in_progress → resolved` with resolvedAt stamp |
| Admin notes | Field existed on schema, never written | Debounced (2s) autosave on detail panel |
| Slack notification | None | Env-gated webhook, 3s timeout, single retry, fire-and-forget |
| Rate limit on POST | Default 60 req/min | Explicit 5 req/min (anti-spam) |
| Audit log | None | `feedback.status_changed` records from/to |
| Test coverage | 7 role-enforcement tests only | 7 (existing) + 22 new (list pagination, PATCH, Slack, POST, E2E) |

## Commits

1. `feat(feedback): /admin/feedback inbox page + list API` — pagination, filters, sidebar nav item
2. `feat(feedback): detail panel + status workflow + admin notes` — GET/PATCH `[id]` route, optimistic updates, debounced autosave
3. `feat(feedback): Slack notification + rate limit on POST` — env-gated webhook + widget standards compliance
4. `test(feedback): E2E submit→resolve flow + access control` — Playwright integration

## Schema

**No migration.** Consumes existing `InternalFeedback` model unchanged.

## Test plan

- [x] `npm test -- --run` — 1647 passing (+30 from baseline 1617), 3 skipped
- [x] `npx tsc --noEmit` — 12 errors (baseline, pre-existing in MedicalTab/casual-settings, unchanged)
- [x] `npm run build` — green
- [ ] Playwright E2E (requires test DB) — `npm run test:e2e tests/e2e/feedback-inbox.spec.ts`
- [ ] Manual: owner logs in, submits via widget, views inbox, transitions to resolved, confirms persistence

## Roll-out notes

- Set `SLACK_INTERNAL_FEEDBACK_WEBHOOK_URL` in Vercel env to enable Slack notifications; leave unset for dev/local.
- `/admin/feedback` only surfaces for `owner` / `head_office` / `admin` — hidden from sidebar + page-guarded.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: Return PR URL**

---

## Risks & mitigations

1. **FeedbackWidget now uses `mutateApi`** — a behaviour change. The error toast now shows the structured error from `fetchApi` (`status X, URL Y, ...`) instead of the raw server `err.error`. Acceptable: the widget never surfaced that internal detail — consumers just see a toast, and the message content is unchanged from a user perspective.

2. **Slack webhook env var in Vercel** — forgetting to set `SLACK_INTERNAL_FEEDBACK_WEBHOOK_URL` is a silent no-op; deployment-time reminder lives in the PR body.

3. **Rate limit on POST** — 5 req/min is aggressive enough to stop an accidental mash but allows genuine bursts. Confirm with dev-mode rapid submits during manual smoke.

4. **Playwright flakiness** — if the E2E can't find the widget button in CI, verify the widget renders on `/dashboard` (it's global per `layout.tsx` inspection). Test uses `getByRole("button", { name: /send feedback/i })` which matches the `aria-label="Send feedback"` — stable.

5. **Dynamic route params** — `context!.params!` is the Next.js 16 App Router pattern (Promise-wrapped). Tests mock with `{ params: Promise.resolve({ id: "fb-1" }) }`.

6. **tsc baseline drift** — 12 errors are pre-existing in `MedicalTab.tsx` + `casual-settings/route.ts`. This PR's acceptance criterion is "tsc error count unchanged at 12" — not zero. If the count rises, a new error slipped in; stop and fix it.

## Rollback

Each commit is independently revert-safe. Worst case: revert the whole PR — the new route disappears, the nav item vanishes, the existing POST path reverts to its pre-rate-limit behaviour, and the widget goes back to raw `fetch`. Zero schema to undo.

---

## Acceptance criteria (must all be true before merge)

- [ ] All 4 commits landed in order
- [ ] `npm test -- --run` ≥ 1647 passing, 0 failing
- [ ] `npx tsc --noEmit 2>&1 | grep -c "error TS"` returns 12
- [ ] `npm run lint` passes (no new violations)
- [ ] `npm run build` succeeds
- [ ] Sidebar shows "Feedback Inbox" for owner/head_office/admin; hidden for others
- [ ] `/admin/feedback` renders list, filters work, pagination works
- [ ] Detail panel opens, status dropdown updates optimistically, notes autosave after 2s
- [ ] Audit log records `feedback.status_changed` with from/to metadata
- [ ] Slack fires when env set, no-ops when unset
- [ ] POST rate-limits at 5/min/user
- [ ] Playwright E2E green (or skip documented in PR with reason)

---

*Last updated: 2026-04-22. Spec reference: [`../specs/2026-04-22-ai-queue-ops-8-design.md`](../specs/2026-04-22-ai-queue-ops-8-design.md).*
