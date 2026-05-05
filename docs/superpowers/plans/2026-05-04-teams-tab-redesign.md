# Teams Tab Redesign Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `/team` with an Employment Hero–style searchable employee directory; rework `/staff/[id]` into a long-scroll profile with sticky horizontal section pills; re-home the Accountability Chart to its own page and the Performance List to `/leadership`.

**Architecture:** New flag (`NEXT_PUBLIC_TEAMS_REDESIGN`) gates the rewrite. New code mounts conditionally next to the old surfaces; old code stays in place until a 1-month-later cleanup PR. Existing `/staff/[id]` server-component data load expands; existing tab components (`PersonalTab`, `EmploymentTab`, `LeaveTab`, `TimesheetTab`, `ComplianceTab`, `DocumentsTab`, `ContractsTab`) are reused inside new section wrappers — only `OverviewTab` is fully retired (its content folds into the snapshot panel).

**Tech Stack:** Next.js 16 (App Router) · TypeScript · Prisma 5.22 + Postgres · NextAuth.js · React Query · Tailwind · Vitest · Playwright. Auth via existing `withApiAuth`; service-scoping via existing `getCentreScope`; error format via existing `ApiError` + `parseJsonBody`.

**Spec:** `docs/superpowers/specs/2026-05-04-teams-tab-redesign-design.md` (PR #77).

---

## How to use this plan

This plan is structured as **8 PRs across 6 chunks**, in the dependency order from the spec:

| Chunk | PRs | Parallelizable? |
|-------|-----|-----------------|
| 1 | PR 0 (flag scaffolding) + PR 1 (`/api/employees`) | After PR 0, PR 1 is independent |
| 2 | PR 2 (`/team` list view, behind flag) | depends on PR 1 |
| 3 | PR 3 (`/staff/[id]` rework, behind flag) | parallel with PR 2 (depends only on PR 0) |
| 4 | PR 4 (quick-action endpoint + UI) | depends on PR 3 |
| 5 | PR 5 (re-home Performance List) + PR 6 (`/accountability-chart` page) | independent of everything else |
| 6 | PR 7 (flag flip) + PR 8 (cleanup) | PR 7 depends on PRs 1–6; PR 8 is 1 month later |

Each PR has its own worktree, branch, tests, and review cycle. Each task within a PR follows TDD: **write the failing test, run it to confirm it fails, write the minimal implementation, run it to confirm it passes, commit.**

**Conventions used throughout:**
- Worktrees live under `.worktrees/<short-name>/` (per existing patterns).
- Branches: `feat/teams-redesign-<scope>`.
- Commit format: `feat(scope): subject` / `test(scope): subject` / `fix(scope): subject` / `chore(scope): subject` (matching existing repo style).
- Test files mirror source paths: `src/lib/foo/bar.ts` ↔ `src/__tests__/lib/foo/bar.test.ts`; `src/app/api/foo/route.ts` ↔ `src/__tests__/api/foo.test.ts`.
- Mocks: use `prismaMock` from `src/__tests__/helpers/prisma-mock.ts`, `mockSession`/`mockNoSession` from `src/__tests__/helpers/auth-mock.ts`, `createRequest` from `src/__tests__/helpers/request.ts`.
- All authenticated server routes use `withApiAuth`; throw `ApiError` rather than returning custom shapes.
- All client mutations have `onError` toast handlers; all client queries have `retry: 2` and a `staleTime`.

---

## Chunk 1: PR 0 (flag scaffolding) + PR 1 (`/api/employees`)

**Why these two together:** PR 0 is a tiny prerequisite PR (one file, ~30 lines). PR 1 is the foundational API the list page will consume. Landing them as one chunk lets PR 2 and PR 3 start in parallel as soon as the chunk is merged.

### PR 0 — Flag scaffolding

**Branch:** `feat/teams-redesign-flag`
**Files:**
- Create: `src/lib/useTeamsRedesignFlag.ts`
- Modify: `.env.example` (add `NEXT_PUBLIC_TEAMS_REDESIGN`)

#### Task 0.1: Create the flag hook (mirror `useStaffV2Flag` pattern)

**Files:**
- Create: `src/lib/useTeamsRedesignFlag.ts`

- [ ] **Step 1: Write the file**

```ts
// src/lib/useTeamsRedesignFlag.ts
"use client";

import { useEffect, useState } from "react";

/**
 * Determines whether the Teams tab redesign should render.
 *
 * Priority:
 *   1. `?teams=1` → always true (for staging verification)
 *   2. `?teams=0` → always false (kill switch from a global rollout)
 *   3. `process.env.NEXT_PUBLIC_TEAMS_REDESIGN === "true"` → env default
 *
 * Mirrors `useStaffV2Flag` in shape; deliberately a SEPARATE flag because
 * `staffV2Tab` is in late-stage retirement (commit 44 of staff-dashboard-v2
 * is queued to remove it). Coupling two unrelated rollouts to the same
 * flag would force one to wait on the other.
 */
export function useTeamsRedesignFlag(): boolean {
  const envDefault = process.env.NEXT_PUBLIC_TEAMS_REDESIGN === "true";
  const [enabled, setEnabled] = useState<boolean>(envDefault);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const override = params.get("teams");
    if (override === "1") setEnabled(true);
    else if (override === "0") setEnabled(false);
    else setEnabled(envDefault);
  }, [envDefault]);

  return enabled;
}
```

- [ ] **Step 2: Add env example**

Append to `.env.example`:

```
# Teams tab redesign feature flag (2026-05). Set to "true" to enable
# the new EH-style employee directory + long-scroll profile.
NEXT_PUBLIC_TEAMS_REDESIGN=false
```

- [ ] **Step 3: Verify typecheck + lint**

Run: `npx tsc --noEmit src/lib/useTeamsRedesignFlag.ts` (or full `npx tsc --noEmit`)
Expected: clean

Run: `npx eslint src/lib/useTeamsRedesignFlag.ts`
Expected: clean

- [ ] **Step 4: Commit**

```bash
git add src/lib/useTeamsRedesignFlag.ts .env.example
git commit -m "feat(teams): add useTeamsRedesignFlag hook + env scaffold"
```

#### PR 0 wrap-up

- [ ] **Step 5: Push branch + open PR**

```bash
git push -u origin feat/teams-redesign-flag
gh pr create --title "feat(teams): flag scaffolding for Teams tab redesign" --body "..."
```

PR body: brief, points to spec PR #77 + explains it's the prerequisite for PRs 1-6.

- [ ] **Step 6: Merge** once CI passes (no tests to add — pure scaffolding).

---

### PR 1 — `/api/employees` endpoint + helpers + tests

**Branch:** `feat/teams-redesign-api-employees`
**Depends on:** none (PR 0 isn't strictly required since this PR is API-only).

**Files:**
- Create: `src/lib/employees/format-employee-row.ts`
- Create: `src/lib/employees/build-list-where.ts`
- Create: `src/__tests__/lib/employees/format-employee-row.test.ts`
- Create: `src/__tests__/lib/employees/build-list-where.test.ts`
- Create: `src/app/api/employees/route.ts`
- Create: `src/__tests__/api/employees.test.ts`
- Modify: `prisma/schema.prisma` — add `@@index([email])` on `User` if absent (verify first)

#### Task 1.1: Pure helper — `format-employee-row`

The DTO projector. Takes a Prisma `User & { service }` row + viewer role, returns the response shape. PII-stripping for `marketing` role is the critical behaviour to test.

**Files:**
- Create: `src/lib/employees/format-employee-row.ts`
- Create: `src/__tests__/lib/employees/format-employee-row.test.ts`

- [ ] **Step 1: Write the failing test file**

```ts
// src/__tests__/lib/employees/format-employee-row.test.ts
import { describe, it, expect } from "vitest";
import {
  formatEmployeeRow,
  type EmployeeRowInput,
} from "@/lib/employees/format-employee-row";

function makeInput(overrides: Partial<EmployeeRowInput> = {}): EmployeeRowInput {
  return {
    id: "u-1",
    name: "Alice Adams",
    email: "alice@example.com",
    avatar: null,
    phone: "0400000001",
    role: "staff",
    active: true,
    lastLoginAt: new Date("2026-04-01"),
    service: { id: "svc-1", name: "Mawson Lakes" },
    ...overrides,
  };
}

describe("formatEmployeeRow", () => {
  it("projects all fields for an admin viewer", () => {
    const out = formatEmployeeRow(makeInput(), "admin");
    expect(out).toMatchObject({
      id: "u-1",
      name: "Alice Adams",
      email: "alice@example.com",
      avatar: null,
      phone: "0400000001",
      role: "staff",
      service: { id: "svc-1", name: "Mawson Lakes" },
      status: "active",
    });
  });

  it("projects all fields for member / staff viewers", () => {
    for (const role of ["member", "staff"] as const) {
      const out = formatEmployeeRow(makeInput(), role);
      expect(out.email, `viewer=${role}`).toBe("alice@example.com");
      expect(out.phone, `viewer=${role}`).toBe("0400000001");
    }
  });

  it("strips email + phone for marketing viewer", () => {
    const out = formatEmployeeRow(makeInput(), "marketing");
    expect(out.email).toBe(null);
    expect(out.phone).toBe(null);
    // Other fields preserved
    expect(out.name).toBe("Alice Adams");
    expect(out.role).toBe("staff");
    expect(out.service).toEqual({ id: "svc-1", name: "Mawson Lakes" });
  });

  it("derives status=active when active=true and lastLoginAt is set", () => {
    expect(formatEmployeeRow(makeInput(), "admin").status).toBe("active");
  });

  it("derives status=pending when active=true but lastLoginAt is null", () => {
    const out = formatEmployeeRow(
      makeInput({ lastLoginAt: null }),
      "admin",
    );
    expect(out.status).toBe("pending");
  });

  it("derives status=deactivated when active=false (regardless of lastLoginAt)", () => {
    expect(
      formatEmployeeRow(makeInput({ active: false, lastLoginAt: null }), "admin").status,
    ).toBe("deactivated");
    expect(
      formatEmployeeRow(makeInput({ active: false, lastLoginAt: new Date() }), "admin").status,
    ).toBe("deactivated");
  });

  it("returns null service when user has no service assigned", () => {
    const out = formatEmployeeRow(
      makeInput({ service: null }),
      "admin",
    );
    expect(out.service).toBe(null);
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

Run: `npx vitest run src/__tests__/lib/employees/format-employee-row.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement the helper**

```ts
// src/lib/employees/format-employee-row.ts
import type { Role } from "@prisma/client";

export interface EmployeeRowInput {
  id: string;
  name: string;
  email: string;
  avatar: string | null;
  phone: string | null;
  role: string;
  active: boolean;
  lastLoginAt: Date | null;
  service: { id: string; name: string } | null;
}

export type EmployeeStatus = "active" | "pending" | "deactivated";

export interface EmployeeRow {
  id: string;
  name: string;
  email: string | null; // null when stripped (marketing viewer)
  avatar: string | null;
  phone: string | null; // null when stripped
  role: string;
  service: { id: string; name: string } | null;
  status: EmployeeStatus;
}

function deriveStatus(input: EmployeeRowInput): EmployeeStatus {
  if (!input.active) return "deactivated";
  return input.lastLoginAt === null ? "pending" : "active";
}

export function formatEmployeeRow(
  input: EmployeeRowInput,
  viewerRole: Role | string,
): EmployeeRow {
  const stripped = viewerRole === "marketing";
  return {
    id: input.id,
    name: input.name,
    email: stripped ? null : input.email,
    avatar: input.avatar,
    phone: stripped ? null : input.phone,
    role: input.role,
    service: input.service,
    status: deriveStatus(input),
  };
}
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `npx vitest run src/__tests__/lib/employees/format-employee-row.test.ts`
Expected: 7/7 passing

- [ ] **Step 5: Commit**

```bash
git add src/lib/employees/format-employee-row.ts src/__tests__/lib/employees/format-employee-row.test.ts
git commit -m "feat(employees): formatEmployeeRow helper with PII stripping for marketing"
```

#### Task 1.2: Pure helper — `build-list-where`

Builds the Prisma `where` clause from query params. Composes with `getCentreScope`. Whitelists sort columns.

**Files:**
- Create: `src/lib/employees/build-list-where.ts`
- Create: `src/__tests__/lib/employees/build-list-where.test.ts`

- [ ] **Step 1: Write the failing test file**

```ts
// src/__tests__/lib/employees/build-list-where.test.ts
import { describe, it, expect } from "vitest";
import { buildListWhere, isValidSort } from "@/lib/employees/build-list-where";

describe("buildListWhere", () => {
  it("returns a baseline where clause with no filters", () => {
    const out = buildListWhere({ params: {}, scopedServiceIds: null });
    expect(out).toEqual({});
  });

  it("applies search across name + email (case-insensitive)", () => {
    const out = buildListWhere({
      params: { q: "ali" },
      scopedServiceIds: null,
    });
    expect(out.OR).toEqual([
      { name: { contains: "ali", mode: "insensitive" } },
      { email: { contains: "ali", mode: "insensitive" } },
    ]);
  });

  it("applies status=active filter (active && lastLoginAt!=null)", () => {
    const out = buildListWhere({
      params: { status: "active" },
      scopedServiceIds: null,
    });
    expect(out.active).toBe(true);
    expect(out.lastLoginAt).toEqual({ not: null });
  });

  it("applies status=pending filter (active && lastLoginAt==null)", () => {
    const out = buildListWhere({
      params: { status: "pending" },
      scopedServiceIds: null,
    });
    expect(out.active).toBe(true);
    expect(out.lastLoginAt).toBe(null);
  });

  it("applies status=deactivated filter", () => {
    const out = buildListWhere({
      params: { status: "deactivated" },
      scopedServiceIds: null,
    });
    expect(out.active).toBe(false);
  });

  it("hides deactivated by default when no status filter is passed", () => {
    const out = buildListWhere({
      params: {},
      scopedServiceIds: null,
      hideDeactivatedByDefault: true,
    });
    expect(out.active).toBe(true);
  });

  it("applies multi-select serviceId filter (s=svc-1,svc-2)", () => {
    const out = buildListWhere({
      params: { s: "svc-1,svc-2" },
      scopedServiceIds: null,
    });
    expect(out.serviceId).toEqual({ in: ["svc-1", "svc-2"] });
  });

  it("applies multi-select role filter (r=staff,member)", () => {
    const out = buildListWhere({
      params: { r: "staff,member" },
      scopedServiceIds: null,
    });
    expect(out.role).toEqual({ in: ["staff", "member"] });
  });

  it("intersects scopedServiceIds with the s= filter (defense in depth)", () => {
    // If the caller is scoped to [svc-1] but tries to filter by s=svc-2,
    // the intersection is empty — should produce serviceId in [].
    const out = buildListWhere({
      params: { s: "svc-2" },
      scopedServiceIds: ["svc-1"],
    });
    expect(out.serviceId).toEqual({ in: [] });
  });

  it("uses scopedServiceIds when no s= filter is passed", () => {
    const out = buildListWhere({
      params: {},
      scopedServiceIds: ["svc-1", "svc-2"],
    });
    expect(out.serviceId).toEqual({ in: ["svc-1", "svc-2"] });
  });
});

describe("isValidSort", () => {
  it("accepts whitelisted sort columns", () => {
    expect(isValidSort("name")).toBe(true);
    expect(isValidSort("role")).toBe(true);
    expect(isValidSort("service")).toBe(true);
    expect(isValidSort("status")).toBe(true);
  });

  it("rejects everything else", () => {
    expect(isValidSort("email")).toBe(false); // not whitelisted
    expect(isValidSort("password")).toBe(false);
    expect(isValidSort("")).toBe(false);
    expect(isValidSort("name; DROP TABLE users")).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

Run: `npx vitest run src/__tests__/lib/employees/build-list-where.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement the helper**

```ts
// src/lib/employees/build-list-where.ts
import type { Prisma } from "@prisma/client";

export interface ListQueryParams {
  q?: string;
  status?: string; // "active" | "pending" | "deactivated"
  s?: string; // comma-separated serviceIds
  r?: string; // comma-separated roles
}

export interface BuildListWhereInput {
  params: ListQueryParams;
  /** From getCentreScope. null = caller has org-wide access. */
  scopedServiceIds: string[] | null;
  /** When true and no status filter is passed, exclude deactivated. */
  hideDeactivatedByDefault?: boolean;
}

const VALID_SORTS = new Set(["name", "role", "service", "status"]);

export function isValidSort(value: string): boolean {
  return VALID_SORTS.has(value);
}

export function buildListWhere(
  input: BuildListWhereInput,
): Prisma.UserWhereInput {
  const where: Prisma.UserWhereInput = {};
  const { params, scopedServiceIds, hideDeactivatedByDefault } = input;

  // Search
  if (params.q && params.q.trim()) {
    where.OR = [
      { name: { contains: params.q, mode: "insensitive" } },
      { email: { contains: params.q, mode: "insensitive" } },
    ];
  }

  // Status
  if (params.status === "active") {
    where.active = true;
    where.lastLoginAt = { not: null };
  } else if (params.status === "pending") {
    where.active = true;
    where.lastLoginAt = null;
  } else if (params.status === "deactivated") {
    where.active = false;
  } else if (hideDeactivatedByDefault) {
    where.active = true;
  }

  // Service filter (intersect with scope)
  const requestedServices = params.s?.split(",").filter(Boolean) ?? [];
  if (requestedServices.length > 0 && scopedServiceIds !== null) {
    const intersection = requestedServices.filter((id) =>
      scopedServiceIds.includes(id),
    );
    where.serviceId = { in: intersection };
  } else if (requestedServices.length > 0) {
    where.serviceId = { in: requestedServices };
  } else if (scopedServiceIds !== null) {
    where.serviceId = { in: scopedServiceIds };
  }

  // Role filter — validate every value against the runtime enum.
  // Unknown values are dropped (not 400-ed) so a typo'd URL still
  // returns a sensible result; if the caller passes ONLY junk, the
  // filter ends up applying nothing, which is fine.
  const requestedRoles = (params.r?.split(",") ?? [])
    .map((r) => r.trim())
    .filter(Boolean)
    .filter(isRole);
  if (requestedRoles.length > 0) {
    where.role = { in: requestedRoles };
  }

  return where;
}
```

Add the import at the top:

```ts
import { isRole } from "@/lib/role-enum";
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `npx vitest run src/__tests__/lib/employees/build-list-where.test.ts`
Expected: 11/11 passing

- [ ] **Step 5: Commit**

```bash
git add src/lib/employees/build-list-where.ts src/__tests__/lib/employees/build-list-where.test.ts
git commit -m "feat(employees): buildListWhere helper + sort whitelist"
```

#### Task 1.3: API route — `GET /api/employees`

Wires the helpers together with `withApiAuth` + `getCentreScope`.

**Files:**
- Create: `src/app/api/employees/route.ts`
- Create: `src/__tests__/api/employees.test.ts`

- [ ] **Step 1: Write the failing route test file**

```ts
// src/__tests__/api/employees.test.ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession, mockNoSession } from "../helpers/auth-mock";
import { createRequest } from "../helpers/request";
import { _clearUserActiveCache } from "@/lib/server-auth";

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() =>
    Promise.resolve({ limited: false, remaining: 59, resetIn: 60_000 }),
  ),
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    withRequestId: () => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
  },
  generateRequestId: () => "test-req-id",
}));

vi.mock("@/lib/centre-scope", () => ({
  getCentreScope: vi.fn(async () => ({ serviceIds: null })),
  applyCentreFilter: vi.fn(),
}));

import { GET } from "@/app/api/employees/route";
import { getCentreScope } from "@/lib/centre-scope";

const mockedGetCentreScope = vi.mocked(getCentreScope);

function makeUser(overrides: Record<string, unknown> = {}) {
  return {
    id: "u-1",
    name: "Alice Adams",
    email: "alice@example.com",
    avatar: null,
    phone: "0400000001",
    role: "staff",
    active: true,
    lastLoginAt: new Date("2026-04-01"),
    service: { id: "svc-1", name: "Mawson Lakes" },
    ...overrides,
  };
}

beforeEach(() => {
  _clearUserActiveCache();
  vi.clearAllMocks();
  prismaMock.user.findUnique.mockImplementation((args: unknown) => {
    const { select } = args as { select?: Record<string, boolean> };
    if (select && "active" in select) return Promise.resolve({ active: true });
    return Promise.resolve({ active: true });
  });
  mockedGetCentreScope.mockResolvedValue({ serviceIds: null });
});

describe("GET /api/employees", () => {
  it("returns 401 when not authenticated", async () => {
    mockNoSession();
    const res = await GET(createRequest("GET", "/api/employees"));
    expect(res.status).toBe(401);
  });

  it("returns paginated list for admin viewer", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    prismaMock.user.findMany.mockResolvedValue([makeUser()]);
    prismaMock.user.count.mockResolvedValue(1);
    const res = await GET(createRequest("GET", "/api/employees"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.employees).toHaveLength(1);
    expect(body.total).toBe(1);
    expect(body.page).toBe(1);
    expect(body.pageSize).toBe(50);
  });

  it("strips PII for marketing viewer", async () => {
    mockSession({ id: "m-1", name: "Marketing", role: "marketing" });
    prismaMock.user.findMany.mockResolvedValue([makeUser()]);
    prismaMock.user.count.mockResolvedValue(1);
    const res = await GET(createRequest("GET", "/api/employees"));
    const body = await res.json();
    expect(body.employees[0].email).toBe(null);
    expect(body.employees[0].phone).toBe(null);
    expect(body.employees[0].name).toBe("Alice Adams");
  });

  it("marketing viewer gets cross-service visibility (NOT scoped to own service)", async () => {
    // The default getCentreScope behavior would scope marketing to their
    // own serviceId. The route bypasses that — confirm the WHERE clause
    // has NO serviceId filter for marketing role.
    mockSession({
      id: "m-1",
      name: "Marketing",
      role: "marketing",
      serviceId: "svc-1",
    });
    // Even though getCentreScope would return ["svc-1"], the route
    // ignores it for marketing.
    mockedGetCentreScope.mockResolvedValue({ serviceIds: ["svc-1"] });
    prismaMock.user.findMany.mockResolvedValue([]);
    prismaMock.user.count.mockResolvedValue(0);
    await GET(createRequest("GET", "/api/employees"));
    const where = prismaMock.user.findMany.mock.calls[0][0].where;
    expect(where.serviceId).toBeUndefined();
  });

  it("applies centre-scope filter when caller is scoped", async () => {
    mockSession({
      id: "u-1",
      name: "Director",
      role: "member",
      serviceId: "svc-1",
    });
    mockedGetCentreScope.mockResolvedValue({ serviceIds: ["svc-1"] });
    prismaMock.user.findMany.mockResolvedValue([]);
    prismaMock.user.count.mockResolvedValue(0);
    await GET(createRequest("GET", "/api/employees"));
    const findManyCall = prismaMock.user.findMany.mock.calls[0][0];
    expect(findManyCall.where.serviceId).toEqual({ in: ["svc-1"] });
  });

  it("returns 400 on invalid sort", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    const res = await GET(
      createRequest("GET", "/api/employees?sort=password"),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 on out-of-range pageSize", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    const res = await GET(
      createRequest("GET", "/api/employees?pageSize=999"),
    );
    expect(res.status).toBe(400);
  });

  it("hides deactivated rows by default; surfaces them when status=deactivated", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    prismaMock.user.findMany.mockResolvedValue([]);
    prismaMock.user.count.mockResolvedValue(0);

    // Default: active=true filter
    await GET(createRequest("GET", "/api/employees"));
    let where = prismaMock.user.findMany.mock.calls[0][0].where;
    expect(where.active).toBe(true);

    vi.clearAllMocks();
    prismaMock.user.findMany.mockResolvedValue([]);
    prismaMock.user.count.mockResolvedValue(0);

    // status=deactivated: active=false filter
    await GET(
      createRequest("GET", "/api/employees?status=deactivated"),
    );
    where = prismaMock.user.findMany.mock.calls[0][0].where;
    expect(where.active).toBe(false);
  });

  it("paginates correctly with page=2 pageSize=25", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    prismaMock.user.findMany.mockResolvedValue([]);
    prismaMock.user.count.mockResolvedValue(60);
    const res = await GET(
      createRequest("GET", "/api/employees?page=2&pageSize=25"),
    );
    const body = await res.json();
    expect(body.page).toBe(2);
    expect(body.pageSize).toBe(25);
    expect(body.totalPages).toBe(3);
    const findManyCall = prismaMock.user.findMany.mock.calls[0][0];
    expect(findManyCall.skip).toBe(25);
    expect(findManyCall.take).toBe(25);
  });

  it("applies search filter across name + email", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    prismaMock.user.findMany.mockResolvedValue([]);
    prismaMock.user.count.mockResolvedValue(0);
    await GET(createRequest("GET", "/api/employees?q=ali"));
    const where = prismaMock.user.findMany.mock.calls[0][0].where;
    expect(where.OR).toEqual([
      { name: { contains: "ali", mode: "insensitive" } },
      { email: { contains: "ali", mode: "insensitive" } },
    ]);
  });

  it("returns 403 for staff viewer who hasn't been service-scoped (defensive)", async () => {
    // staff role with no serviceId / no scope returned: forbidden.
    mockSession({ id: "u-1", name: "Staff", role: "staff", serviceId: null });
    mockedGetCentreScope.mockResolvedValue({ serviceIds: [] });
    const res = await GET(createRequest("GET", "/api/employees"));
    expect(res.status).toBe(403);
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

Run: `npx vitest run src/__tests__/api/employees.test.ts`
Expected: FAIL — route module not found

- [ ] **Step 3: Implement the route**

```ts
// src/app/api/employees/route.ts
/**
 * GET /api/employees
 *
 * Paginated employee directory for the new Teams tab. Service-scoped per role
 * (admin: all; member/staff: own service; marketing: all but PII stripped).
 *
 * Query params (all optional):
 *   q          - search across name + email (case-insensitive substring)
 *   status     - active | pending | deactivated (default: hide deactivated)
 *   s          - comma-separated serviceIds
 *   r          - comma-separated roles
 *   sort       - name | role | service | status (default: name)
 *   page       - 1-indexed (default 1)
 *   pageSize   - 1..200 (default 50)
 *
 * Returns: { employees, total, page, pageSize, totalPages }
 *
 * 2026-05-04: introduced for the Teams tab redesign (spec PR #77).
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-error";
import { getCentreScope } from "@/lib/centre-scope";
import {
  buildListWhere,
  isValidSort,
} from "@/lib/employees/build-list-where";
import { formatEmployeeRow } from "@/lib/employees/format-employee-row";

const querySchema = z.object({
  q: z.string().optional(),
  status: z.enum(["active", "pending", "deactivated"]).optional(),
  s: z.string().optional(),
  r: z.string().optional(),
  sort: z.enum(["name", "role", "service", "status"]).default("name"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

export const GET = withApiAuth(async (req, session) => {
  const { searchParams } = new URL(req.url);
  const parsed = querySchema.safeParse({
    q: searchParams.get("q") ?? undefined,
    status: searchParams.get("status") ?? undefined,
    s: searchParams.get("s") ?? undefined,
    r: searchParams.get("r") ?? undefined,
    sort: searchParams.get("sort") ?? undefined,
    page: searchParams.get("page") ?? undefined,
    pageSize: searchParams.get("pageSize") ?? undefined,
  });
  if (!parsed.success) {
    throw ApiError.badRequest("Invalid query", parsed.error.flatten());
  }
  const params = parsed.data;
  // Sort already validated by z.enum; isValidSort kept exported for tests
  // and any future callers that build queries dynamically.

  const role = session.user.role ?? "";

  // Marketing has full org-wide list access (with PII stripping in
  // formatEmployeeRow below) — explicitly bypass getCentreScope's
  // single-service restriction for this role on this route only. Other
  // routes that use getCentreScope retain marketing's service scoping.
  const scopedServiceIds: string[] | null =
    role === "marketing"
      ? null
      : (await getCentreScope(session)).serviceIds;

  // Defensive: a centre-scoped role with an empty scope (no service
  // attached) should 403 rather than return everyone with `serviceId in []`.
  if (scopedServiceIds !== null && scopedServiceIds.length === 0) {
    throw ApiError.forbidden(
      "You don't have a service assigned. Contact an admin.",
    );
  }

  const where = buildListWhere({
    params,
    scopedServiceIds,
    hideDeactivatedByDefault: true,
  });

  // Sort mapping. Whitelist enforced via isValidSort above.
  const orderBy = (() => {
    switch (params.sort) {
      case "role":
        return { role: "asc" as const };
      case "service":
        return { service: { name: "asc" as const } };
      case "status":
        return { active: "desc" as const };
      case "name":
      default:
        return { name: "asc" as const };
    }
  })();

  const skip = (params.page - 1) * params.pageSize;

  // Narrow select is the FIRST line of PII defense — it deliberately
  // excludes `User.taxFileNumber`, `bankAccountNumber`, `dateOfBirth`,
  // `address`, etc. so those fields can't accidentally leak via a future
  // formatter change. `formatEmployeeRow` is the SECOND line (strips
  // email + phone for marketing role).
  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy,
      skip,
      take: params.pageSize,
      select: {
        id: true,
        name: true,
        email: true,
        avatar: true,
        phone: true,
        role: true,
        active: true,
        lastLoginAt: true,
        service: { select: { id: true, name: true } },
      },
    }),
    prisma.user.count({ where }),
  ]);

  const employees = users.map((u) =>
    formatEmployeeRow(
      {
        id: u.id,
        name: u.name,
        email: u.email,
        avatar: u.avatar ?? null,
        phone: u.phone ?? null,
        role: u.role,
        active: u.active,
        lastLoginAt: u.lastLoginAt,
        service: u.service ?? null,
      },
      role,
    ),
  );

  return NextResponse.json({
    employees,
    total,
    page: params.page,
    pageSize: params.pageSize,
    totalPages: Math.max(1, Math.ceil(total / params.pageSize)),
  });
});
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `npx vitest run src/__tests__/api/employees.test.ts`
Expected: 11/11 passing

- [ ] **Step 5: Commit**

```bash
git add src/app/api/employees/route.ts src/__tests__/api/employees.test.ts
git commit -m "feat(employees): GET /api/employees endpoint (paginated, scoped, PII-aware)"
```

#### Task 1.4: Verify the `User.email` index

The spec called out a quick `EXPLAIN` check during PR 1. Confirm an index exists on `User.email` and `User.name`. If not, add one.

- [ ] **Step 1: Inspect the schema**

Run: `grep -A 30 "model User " prisma/schema.prisma | grep '@@index\|@unique'`
Expected: `email String @unique` (already implies a btree index in Postgres) and at minimum `@@index([name])` if name search is to be performant.

- [ ] **Step 2: If `@@index([name])` is missing, add it**

Edit `prisma/schema.prisma`, locate `model User`, add `@@index([name])` to the indexes block.

Then create + apply the migration in one shot:

```bash
npx prisma migrate dev --name add_user_name_index
```

Inspect the generated SQL in `prisma/migrations/<timestamp>_add_user_name_index/migration.sql` — should be a single `CREATE INDEX "User_name_idx" ON "User"("name");`. Confirm `npx prisma generate` ran clean.

- [ ] **Step 3: If migration was created, commit**

```bash
git add prisma/schema.prisma prisma/migrations/<timestamp>_add_user_name_index
git commit -m "chore(prisma): index User.name for /api/employees search performance"
```

- [ ] **Step 4: If no migration was needed, skip**

Note: `User.email` already has `@unique` which Postgres backs with a btree index automatically — no separate `@@index([email])` needed.

#### PR 1 wrap-up

- [ ] **Step 5: Run the full test suite** to confirm no regressions

Run: `npx vitest run`
Expected: previous green count + 29 new tests passing (7 from `format-employee-row` + 11 from `build-list-where` + 11 from the route)

- [ ] **Step 6: Typecheck + lint**

```bash
npx tsc --noEmit && npx eslint src/lib/employees src/app/api/employees src/__tests__/lib/employees src/__tests__/api/employees.test.ts
```

Expected: clean

- [ ] **Step 7: Push + open PR**

```bash
git push -u origin feat/teams-redesign-api-employees
gh pr create --title "feat(employees): GET /api/employees + helpers (PR 1 of teams redesign)" --body "..."
```

PR body includes the test counts, scope (helpers + route), and links to spec PR #77 + plan PR.

---

**End of Chunk 1.**

---

## Chunk 2: PR 2 — list view + `/team` page rewrite (behind flag)

**Branch:** `feat/teams-redesign-list-view`
**Depends on:** PR 1 merged (the API the list consumes), PR 0 merged (the flag).

**Files:**
- Create: `src/hooks/useEmployeesList.ts` — React Query hook
- Create: `src/components/team/EmployeeListView.tsx` — top-level list component
- Create: `src/components/team/EmployeeFilters.tsx` — search + filter chips
- Create: `src/components/team/EmployeeRow.tsx` — single row
- Create: `src/components/team/EmployeeListPagination.tsx` — pagination controls
- Create: `src/__tests__/hooks/useEmployeesList.test.ts`
- Create: `src/__tests__/components/team/EmployeeListView.test.tsx`
- Create: `src/__tests__/components/team/EmployeeFilters.test.tsx`
- Create: `src/__tests__/components/team/EmployeeRow.test.tsx`
- Modify: `src/app/(dashboard)/team/page.tsx` — gate new view behind `useTeamsRedesignFlag()`

### Task 2.1: `useEmployeesList` hook

Wraps `/api/employees` with React Query. URL state ↔ query state via `useSearchParams` + `useRouter`.

**Files:**
- Create: `src/hooks/useEmployeesList.ts`
- Create: `src/__tests__/hooks/useEmployeesList.test.ts`

- [ ] **Step 1: Write failing test** — covers (a) URL params translate to query params, (b) `retry: 2` + `staleTime: 30_000`, (c) returned data shape.

```ts
// src/__tests__/hooks/useEmployeesList.test.ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEmployeesList } from "@/hooks/useEmployeesList";

vi.mock("@/lib/fetch-api", () => ({
  fetchApi: vi.fn(),
}));
import { fetchApi } from "@/lib/fetch-api";
const mockedFetch = vi.mocked(fetchApi);

function wrap() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

beforeEach(() => {
  mockedFetch.mockReset();
  mockedFetch.mockResolvedValue({
    employees: [],
    total: 0,
    page: 1,
    pageSize: 50,
    totalPages: 1,
  });
});

describe("useEmployeesList", () => {
  it("calls /api/employees with default params when none passed", async () => {
    renderHook(() => useEmployeesList({}), { wrapper: wrap() });
    await waitFor(() => expect(mockedFetch).toHaveBeenCalled());
    const url = mockedFetch.mock.calls[0][0] as string;
    expect(url).toContain("/api/employees?");
    expect(url).toContain("page=1");
    expect(url).toContain("pageSize=50");
    expect(url).toContain("sort=name");
  });

  it("translates filter params to URL query string with short codes (s=, r=)", async () => {
    renderHook(
      () =>
        useEmployeesList({
          q: "ali",
          status: "active",
          serviceIds: ["svc-1", "svc-2"],
          roles: ["staff", "member"],
          sort: "role",
          page: 2,
          pageSize: 25,
        }),
      { wrapper: wrap() },
    );
    await waitFor(() => expect(mockedFetch).toHaveBeenCalled());
    const url = mockedFetch.mock.calls[0][0] as string;
    expect(url).toContain("q=ali");
    expect(url).toContain("status=active");
    expect(url).toContain("s=svc-1%2Csvc-2");
    expect(url).toContain("r=staff%2Cmember");
    expect(url).toContain("sort=role");
    expect(url).toContain("page=2");
    expect(url).toContain("pageSize=25");
  });

  it("returns the unwrapped employees + pagination shape", async () => {
    mockedFetch.mockResolvedValueOnce({
      employees: [{ id: "u-1", name: "Alice" }],
      total: 1,
      page: 1,
      pageSize: 50,
      totalPages: 1,
    });
    const { result } = renderHook(() => useEmployeesList({}), { wrapper: wrap() });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data?.employees).toHaveLength(1);
    expect(result.current.data?.total).toBe(1);
  });
});
```

- [ ] **Step 2: Run failing test**

Run: `npx vitest run src/__tests__/hooks/useEmployeesList.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement the hook**

```ts
// src/hooks/useEmployeesList.ts
"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchApi } from "@/lib/fetch-api";

export interface EmployeesListParams {
  q?: string;
  status?: "active" | "pending" | "deactivated";
  serviceIds?: string[];
  roles?: string[];
  sort?: "name" | "role" | "service" | "status";
  page?: number;
  pageSize?: number;
}

export interface EmployeeListItem {
  id: string;
  name: string;
  email: string | null;
  avatar: string | null;
  phone: string | null;
  role: string;
  service: { id: string; name: string } | null;
  status: "active" | "pending" | "deactivated";
}

export interface EmployeesListResponse {
  employees: EmployeeListItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

function buildUrl(p: EmployeesListParams): string {
  const sp = new URLSearchParams();
  if (p.q) sp.set("q", p.q);
  if (p.status) sp.set("status", p.status);
  if (p.serviceIds?.length) sp.set("s", p.serviceIds.join(","));
  if (p.roles?.length) sp.set("r", p.roles.join(","));
  sp.set("page", String(p.page ?? 1));
  sp.set("pageSize", String(p.pageSize ?? 50));
  sp.set("sort", p.sort ?? "name");
  return `/api/employees?${sp.toString()}`;
}

export function useEmployeesList(params: EmployeesListParams) {
  return useQuery<EmployeesListResponse>({
    queryKey: [
      "employees-list",
      params.q ?? "",
      params.status ?? "",
      params.serviceIds?.join(",") ?? "",
      params.roles?.join(",") ?? "",
      params.sort ?? "name",
      params.page ?? 1,
      params.pageSize ?? 50,
    ],
    queryFn: () => fetchApi<EmployeesListResponse>(buildUrl(params)),
    retry: 2,
    staleTime: 30_000,
  });
}
```

- [ ] **Step 4: Run test, expect pass**

Run: `npx vitest run src/__tests__/hooks/useEmployeesList.test.ts`
Expected: 3/3 passing

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useEmployeesList.ts src/__tests__/hooks/useEmployeesList.test.ts
git commit -m "feat(employees): useEmployeesList hook"
```

### Task 2.2: `EmployeeRow` component

Single row in the list table. Click → `<Link>` to `/staff/[id]?…` (preserves filter state). Marketing rows are NOT wrapped in `<Link>` (server-side `canAccessProfile` returns false for marketing → would 403).

**Files:**
- Create: `src/components/team/EmployeeRow.tsx`
- Create: `src/__tests__/components/team/EmployeeRow.test.tsx`

- [ ] **Step 1: Write failing test**

```tsx
// src/__tests__/components/team/EmployeeRow.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { EmployeeRow } from "@/components/team/EmployeeRow";

const ALICE = {
  id: "u-1",
  name: "Alice Adams",
  email: "alice@example.com",
  avatar: null,
  phone: "0400000001",
  role: "staff",
  service: { id: "svc-1", name: "Mawson Lakes" },
  status: "active" as const,
};

describe("EmployeeRow", () => {
  it("renders name + role + service + status", () => {
    render(<EmployeeRow employee={ALICE} viewerRole="admin" listSearchString="" />);
    expect(screen.getByText("Alice Adams")).toBeInTheDocument();
    expect(screen.getByText(/Educator/i)).toBeInTheDocument(); // role display name
    expect(screen.getByText("Mawson Lakes")).toBeInTheDocument();
    expect(screen.getByText(/active/i)).toBeInTheDocument();
  });

  it("wraps row in <Link> for non-marketing viewers", () => {
    render(<EmployeeRow employee={ALICE} viewerRole="admin" listSearchString="?q=ali" />);
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute(
      "href",
      "/staff/u-1?q=ali",
    );
  });

  it("does NOT wrap row in <Link> for marketing viewers", () => {
    render(<EmployeeRow employee={ALICE} viewerRole="marketing" listSearchString="" />);
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("renders 'pending' status pill in amber", () => {
    render(
      <EmployeeRow
        employee={{ ...ALICE, status: "pending" }}
        viewerRole="admin"
        listSearchString=""
      />,
    );
    const pill = screen.getByText(/pending/i);
    expect(pill.className).toMatch(/amber/);
  });

  it("renders an em-dash for null email/phone (marketing viewer's PII-stripped row)", () => {
    render(
      <EmployeeRow
        employee={{ ...ALICE, email: null, phone: null }}
        viewerRole="marketing"
        listSearchString=""
      />,
    );
    // Specific assertion on what the row displays for null contact —
    // depends on final layout; tighten when component is built.
    expect(screen.queryByText("alice@example.com")).toBeNull();
  });
});
```

- [ ] **Step 2: Run failing test**

Expected: FAIL — module not found

- [ ] **Step 3: Implement the component**

```tsx
// src/components/team/EmployeeRow.tsx
"use client";

import Link from "next/link";
import { ROLE_DISPLAY_NAMES } from "@/lib/role-permissions";
import { StaffAvatar } from "@/components/staff/StaffAvatar";
import { cn } from "@/lib/utils";
import type { EmployeeListItem } from "@/hooks/useEmployeesList";

const STATUS_TONE: Record<EmployeeListItem["status"], string> = {
  active: "bg-emerald-100 text-emerald-800 border-emerald-300",
  pending: "bg-amber-100 text-amber-800 border-amber-300",
  deactivated: "bg-gray-100 text-gray-700 border-gray-300",
};

const STATUS_LABEL: Record<EmployeeListItem["status"], string> = {
  active: "Active",
  pending: "Pending",
  deactivated: "Deactivated",
};

export interface EmployeeRowProps {
  employee: EmployeeListItem;
  viewerRole: string;
  /** The current `?…` search string from the list, passed through so
   *  the profile's Previous/Next nav can re-derive the filter state. */
  listSearchString: string;
}

export function EmployeeRow({ employee, viewerRole, listSearchString }: EmployeeRowProps) {
  const profileHref = `/staff/${employee.id}${listSearchString}`;
  const roleLabel =
    ROLE_DISPLAY_NAMES[employee.role as keyof typeof ROLE_DISPLAY_NAMES] ?? employee.role;
  const isClickable = viewerRole !== "marketing";

  // Single Link on the name cell only — semantically valid (no <tr> wrap),
  // single test target (getByRole("link") returns exactly one), and the
  // surrounding cells get cursor:pointer styling so the whole row LOOKS
  // clickable. Click delegation can be added later via JS without breaking
  // the test.
  const nameCell = isClickable ? (
    <Link href={profileHref} className="flex items-center gap-3" prefetch={false}>
      <StaffAvatar user={{ id: employee.id, name: employee.name, avatar: employee.avatar }} size="sm" />
      <div>
        <p className="font-medium text-foreground">{employee.name}</p>
        {employee.email ? <p className="text-xs text-muted">{employee.email}</p> : null}
      </div>
    </Link>
  ) : (
    <div className="flex items-center gap-3">
      <StaffAvatar user={{ id: employee.id, name: employee.name, avatar: employee.avatar }} size="sm" />
      <div>
        <p className="font-medium text-foreground">{employee.name}</p>
        {employee.email ? <p className="text-xs text-muted">{employee.email}</p> : null}
      </div>
    </div>
  );

  return (
    <tr className={cn("border-t border-border", isClickable && "hover:bg-surface/30 cursor-pointer")}>
      <td className="px-4 py-3">{nameCell}</td>
      <td className="px-4 py-3 text-sm text-foreground/80">{roleLabel}</td>
      <td className="px-4 py-3 text-sm text-foreground/80">{employee.service?.name ?? "—"}</td>
      <td className="px-4 py-3">
        <span
          className={cn(
            "inline-flex items-center rounded-full border px-2 py-0 text-[10px] font-bold uppercase tracking-wide",
            STATUS_TONE[employee.status],
          )}
        >
          {STATUS_LABEL[employee.status]}
        </span>
      </td>
      {/* Actions kebab — implemented in PR 4 */}
      <td className="px-4 py-3 text-right text-muted">⋯</td>
    </tr>
  );
}
```

Note on testing: when rendering a single `<EmployeeRow>` in RTL, wrap it with `<table><tbody>...</tbody></table>` to silence React's `validateDOMNesting` warning:

```tsx
function renderRow(props) {
  return render(
    <table><tbody>{<EmployeeRow {...props} />}</tbody></table>,
  );
}
```

Update the test cases above to use this helper.

- [ ] **Step 4: Run test, expect pass**

Expected: 5/5 passing

- [ ] **Step 5: Commit**

```bash
git add src/components/team/EmployeeRow.tsx src/__tests__/components/team/EmployeeRow.test.tsx
git commit -m "feat(employees): EmployeeRow component"
```

### Task 2.3: `EmployeeFilters` component

Search input + Status / Service / Role multi-select chips. Active-filters strip below.

**Files:**
- Create: `src/components/team/EmployeeFilters.tsx`
- Create: `src/__tests__/components/team/EmployeeFilters.test.tsx`

- [ ] **Step 1: Write failing test** — covers (a) typing in search calls `onChange` after debounce, (b) status chip toggle calls `onChange` with new status, (c) clearing chips calls `onChange` with cleared filter.

```tsx
// Compact test outline — full file follows the same RTL pattern as EmployeeRow.test.tsx
// Cases:
//   - "renders search input that calls onChange after typing"
//   - "renders Status chip; clicking opens menu; selecting fires onChange"
//   - "renders Service chip with multi-select; selections fire onChange with comma-joined ids"
//   - "renders Role chip with multi-select"
//   - "active-filters strip shows current filters; clicking ✕ on a chip clears it"
//   - "Clear all button resets all filters at once"
```

- [ ] **Step 2: Run failing test** — module not found

- [ ] **Step 3: Implement the component**

The component is a controlled-input pattern. Props:
- `value: { q, status, serviceIds, roles }`
- `onChange(next)` — fires with the FULL new filter state
- `services: { id, name }[]` — available services for the chip
- `viewerRole` — used to hide the "Status: Deactivated" option for non-admin viewers

Structure:
```tsx
<div className="flex flex-col gap-3">
  <SearchBar value={value.q} onChange={...} />  {/* debounced */}
  <FilterTriggers ... />                         {/* Status / Service / Role buttons */}
  <ActiveFiltersStrip ... />                     {/* removable chips */}
</div>
```

Filter trigger buttons open small popovers with multi-select checkbox lists. Use the existing `FilterPresets` component pattern from `src/components/ui/FilterPresets.tsx` as a reference for the popover styling.

The full implementation is roughly 200-300 lines. The executing agent writes it following the test contract.

- [ ] **Step 4: Run test, expect pass**

Expected: 6/6 passing

- [ ] **Step 5: Commit**

```bash
git add src/components/team/EmployeeFilters.tsx src/__tests__/components/team/EmployeeFilters.test.tsx
git commit -m "feat(employees): EmployeeFilters component (search + multi-select chips)"
```

### Task 2.4: `EmployeeListPagination` component

Server-side pagination controls. Numbered pages on desktop, "Load more" on mobile.

**Files:**
- Create: `src/components/team/EmployeeListPagination.tsx`
- Test: skipped (trivial component, only renders standard buttons)

- [ ] **Step 1: Implement directly** (no test — pure presentation)

```tsx
// src/components/team/EmployeeListPagination.tsx
"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export interface PaginationProps {
  page: number;
  totalPages: number;
  pageSize: number;
  total: number;
  onChange: (page: number) => void;
}

export function EmployeeListPagination({ page, totalPages, pageSize, total, onChange }: PaginationProps) {
  if (totalPages <= 1) return null;
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);
  return (
    <div className="flex items-center justify-between text-sm text-muted">
      <span>Showing {start}–{end} of {total}</span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onChange(page - 1)}
          disabled={page <= 1}
          className="p-1 rounded hover:bg-surface disabled:opacity-30"
          aria-label="Previous page"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        {/* Numbered page buttons — render up to 5 with ellipsis */}
        {/* ... */}
        <button
          type="button"
          onClick={() => onChange(page + 1)}
          disabled={page >= totalPages}
          className="p-1 rounded hover:bg-surface disabled:opacity-30"
          aria-label="Next page"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/team/EmployeeListPagination.tsx
git commit -m "feat(employees): EmployeeListPagination component"
```

### Task 2.5: `EmployeeListView` top-level component

The shell that owns URL ↔ filter state and composes everything.

**Files:**
- Create: `src/components/team/EmployeeListView.tsx`
- Create: `src/__tests__/components/team/EmployeeListView.test.tsx`

- [ ] **Step 1: Write failing test**

```tsx
// Cases:
//   - "renders skeleton table when loading"
//   - "renders rows when data loads"
//   - "renders empty state when zero results from filter"
//   - "renders 'no employees yet' empty state when total=0 with no filters"
//   - "clicking a filter chip pushes the new state to the URL"
//   - "pagination button click pushes ?page=N"
//   - "CSV export button only renders for admin-tier viewers"
//   - "Add Employee + Bulk Invite buttons only render for admin-tier viewers"
```

- [ ] **Step 2: Run failing test**

- [ ] **Step 3: Implement the component**

Structure:
```tsx
"use client";

export interface EmployeeListViewProps {
  viewerRole: string;
  services: { id: string; name: string }[]; // pre-fetched once via the page
}

export function EmployeeListView({ viewerRole, services }: EmployeeListViewProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Read filter state from URL
  const filters = useMemo(() => parseFiltersFromUrl(searchParams), [searchParams]);

  const { data, isLoading, error } = useEmployeesList(filters);

  // Handler that updates URL state (debounced for search)
  const setFilters = (next) => {
    const sp = new URLSearchParams();
    if (next.q) sp.set("q", next.q);
    if (next.status) sp.set("status", next.status);
    if (next.serviceIds?.length) sp.set("s", next.serviceIds.join(","));
    if (next.roles?.length) sp.set("r", next.roles.join(","));
    if (next.page && next.page !== 1) sp.set("page", String(next.page));
    router.replace(`/team?${sp.toString()}`);
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Team"
        description="Browse, search, and open employee profiles."
        primaryAction={isAdminTier(viewerRole) ? { label: "Add Employee", onClick: ... } : undefined}
        secondaryActions={[
          isAdminTier(viewerRole) && { label: "Bulk Invite", onClick: ... },
          isAdminTier(viewerRole) && { label: "Export CSV", onClick: ... },
        ].filter(Boolean)}
      />
      <EmployeeFilters value={filters} onChange={setFilters} services={services} viewerRole={viewerRole} />
      {isLoading ? (
        <SkeletonTable rows={8} />
      ) : error ? (
        <ErrorState ... />
      ) : data?.employees.length === 0 ? (
        <EmptyState ... />
      ) : (
        <table>
          <thead>...</thead>
          <tbody>
            {data?.employees.map((e) => (
              <EmployeeRow key={e.id} employee={e} viewerRole={viewerRole} listSearchString={`?${searchParams}`} />
            ))}
          </tbody>
        </table>
      )}
      <EmployeeListPagination ... />
      {/* BulkInviteModal mounted conditionally */}
    </div>
  );
}
```

The test contract above defines correctness; the executing agent implements at this rough sketch.

- [ ] **Step 4: Run test, expect pass**

- [ ] **Step 5: Commit**

```bash
git add src/components/team/EmployeeListView.tsx src/__tests__/components/team/EmployeeListView.test.tsx
git commit -m "feat(employees): EmployeeListView shell"
```

### Task 2.6: Wire the new view behind the flag in `/team` page

**Files:**
- Modify: `src/app/(dashboard)/team/page.tsx`

- [ ] **Step 1: Open the existing page**

Read existing 191-line `src/app/(dashboard)/team/page.tsx`. The new page is a thin wrapper:

- [ ] **Step 2: Replace the page with a flag-gated version**

```tsx
// src/app/(dashboard)/team/page.tsx
"use client";

import { useTeamsRedesignFlag } from "@/lib/useTeamsRedesignFlag";
import { useSession } from "next-auth/react";
import { useServices } from "@/hooks/useServices";
import { EmployeeListView } from "@/components/team/EmployeeListView";
import { LegacyTeamView } from "@/components/team/LegacyTeamView"; // extracted from current code

export default function TeamPage() {
  const teamsRedesign = useTeamsRedesignFlag();
  const { data: session } = useSession();
  const { data: services } = useServices();

  if (teamsRedesign && session?.user) {
    return (
      <EmployeeListView
        viewerRole={session.user.role ?? ""}
        services={services?.map((s) => ({ id: s.id, name: s.name })) ?? []}
      />
    );
  }

  return <LegacyTeamView />; // existing 191-line content lifted into a component
}
```

- [ ] **Step 3: Extract the legacy view**

Move the existing page body (the chart/list toggle, stats cards, ActionRequiredWidget, etc.) into a new `src/components/team/LegacyTeamView.tsx` component. No logic changes — just extract.

- [ ] **Step 4: Verify the legacy view still works**

Run: `npm run dev`
Manual smoke: visit `/team`, confirm it still renders Accountability Chart + Performance List exactly as before.

Run: `npx vitest run` — confirm no existing tests break.

- [ ] **Step 5: Verify the new view renders behind the flag**

Manual smoke: visit `/team?teams=1`, confirm the new EmployeeListView renders.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(dashboard)/team/page.tsx" src/components/team/LegacyTeamView.tsx
git commit -m "feat(team): gate new EmployeeListView behind useTeamsRedesignFlag"
```

### PR 2 wrap-up

- [ ] **Step 7: Run typecheck + lint + full tests**

```bash
npx tsc --noEmit && npx eslint src/hooks src/components/team src/app/\(dashboard\)/team && npx vitest run
```

Expected: clean, all tests pass.

- [ ] **Step 8: Push + open PR**

```bash
git push -u origin feat/teams-redesign-list-view
gh pr create --title "feat(employees): list view + /team page rewrite (PR 2 of teams redesign)" --body "..."
```

PR body covers the test counts (3 hook + 5 row + 6 filter + 8 list-view = ~22 new tests), notes the legacy view is preserved, and the rollout is gated by `?teams=1`.

---

**End of Chunk 2.**

---

## Chunk 3: PR 3 — `/staff/[id]` profile rework (behind flag)

**Branch:** `feat/teams-redesign-profile-layout`
**Depends on:** PR 0 merged (the flag).

**Files:**
- Create: `src/lib/staff/snapshot-stats.ts` + test
- Create: `src/components/staff/StaffProfileLayout.tsx` (top-level)
- Create: `src/components/staff/StaffProfileHeader.tsx` (avatar + identity + quick actions placeholder)
- Create: `src/components/staff/StaffProfileStatsPanel.tsx` (right gutter snapshot)
- Create: `src/components/staff/StaffProfilePills.tsx` (sticky horizontal nav with scroll-spy)
- Create: `src/components/staff/sections/EmploymentRecordsSection.tsx`
- Create: `src/components/staff/sections/PayCompensationSection.tsx`
- Create: `src/components/staff/sections/DocumentsSection.tsx`
- Create: `src/components/staff/sections/PerformanceSection.tsx`
- Modify: `src/app/(dashboard)/staff/[id]/page.tsx` — flag-gate between old `StaffProfileTabs` and new `StaffProfileLayout`

### Task 3.1: `snapshot-stats` pure helper + test

Computes the right-panel content from already-fetched data. Handles empty next-shift case.

**Test cases:**
- `tenureDescription` rounds to "X years Y months" correctly (e.g. 0/3 → "0 years 3 months", 14/0 → "1 year 2 months")
- `cert classification`: distinguishes `valid` / `expiring` (<30d) / `expired` per existing `getCertStatus`
- `nextShift === null` returns the placeholder message "No upcoming shift", does NOT collapse the block

**Implementation contract:**

```ts
// src/lib/staff/snapshot-stats.ts
export interface SnapshotStatsInput {
  user: { createdAt: Date };
  earliestContractStart: Date | null;
  nextShift: { date: Date; shiftStart: string; shiftEnd: string; sessionType: string; service?: { name: string } | null } | null;
  certificates: Array<{ expiryDate: Date }>;
  activeRocks: number;
  openTodos: number;
}
export interface SnapshotStats {
  tenure: string; // "0 years 3 months"
  nextShiftLabel: string | null; // null → render placeholder
  certCounts: { valid: number; expiring: number; expired: number };
  activeRocks: number;
  openTodos: number;
}
export function computeSnapshotStats(input: SnapshotStatsInput): SnapshotStats { /* ... */ }
```

TDD steps as in Chunk 1 Task 1.1: write test, run fail, implement, run pass, commit.

Commit: `feat(staff): snapshot-stats helper for profile right panel`

### Task 3.2: `StaffProfilePills` component (the sticky horizontal nav)

The most JS-heavy piece — IntersectionObserver-based scroll-spy debounced against programmatic clicks.

**Test cases (RTL + jsdom):**
- Renders 4 pills with correct labels + colours
- Click on a pill scrolls to the matching anchor (assert `scrollIntoView` called on `#section-employment` etc.)
- Clicking a pill sets the URL hash
- Mounting respects `?#section-pay` hash on initial load (scrolls + highlights)
- Active pill highlights based on which section is in the viewport (mock IntersectionObserver entries)
- Suppresses scroll-spy updates within 500ms of a programmatic click (the debounce — confirms click-driven scroll won't toggle the pill mid-flight)

**Implementation contract:**

```tsx
// src/components/staff/StaffProfilePills.tsx
"use client";

const SECTIONS = [
  { id: "employment", label: "Employment records", color: "bg-purple-100 text-purple-800 border-purple-300" },
  { id: "pay",        label: "Pay & compensation", color: "bg-teal-100 text-teal-800 border-teal-300" },
  { id: "documents",  label: "Documents",          color: "bg-yellow-100 text-yellow-800 border-yellow-300" },
  { id: "performance", label: "Performance",       color: "bg-orange-100 text-orange-800 border-orange-300" },
] as const;

export function StaffProfilePills() {
  const [active, setActive] = useState<typeof SECTIONS[number]["id"]>("employment");
  const ignoreSpyUntil = useRef<number>(0);

  // IntersectionObserver setup, with the debounce against ignoreSpyUntil
  // ...

  return (
    <div className="sticky top-0 z-10 flex gap-2 overflow-x-auto bg-card border-b border-border py-2 px-4">
      {SECTIONS.map((s) => (
        <button
          key={s.id}
          type="button"
          onClick={() => {
            ignoreSpyUntil.current = Date.now() + 500;
            window.history.replaceState(null, "", `#section-${s.id}`);
            document.getElementById(`section-${s.id}`)?.scrollIntoView({ behavior: "smooth" });
            setActive(s.id);
          }}
          className={cn(
            "px-3 py-1 rounded-full border text-xs font-semibold whitespace-nowrap",
            active === s.id ? s.color : "bg-card text-muted border-border",
          )}
        >
          {s.label}
        </button>
      ))}
    </div>
  );
}
```

Tests use `vi.spyOn(Element.prototype, "scrollIntoView")` to assert smooth-scroll. IntersectionObserver in jsdom needs polyfilling — use `vi.stubGlobal("IntersectionObserver", class { ... })` or similar.

Commit: `feat(staff): StaffProfilePills sticky nav with scroll-spy`

### Task 3.3: `StaffProfileStatsPanel` component

Right gutter, ~280px wide. Uses `computeSnapshotStats` from Task 3.1.

**Test cases:**
- Renders all 5 blocks (tenure, next shift, active rocks, open todos, compliance)
- "No upcoming shift" placeholder renders when nextShiftLabel is null (block still occupies space)
- Compliance block renders 3 line items with counts; muted check icons next to each

Implementation: pure presentation. Props are the `SnapshotStats` object.

Commit: `feat(staff): StaffProfileStatsPanel right-gutter snapshot`

### Task 3.4: `StaffProfileHeader` component

Avatar + identity block + quick-actions column. **Quick actions are stub buttons in this PR** — wiring happens in PR 4.

**Test cases:**
- Renders avatar, name, role display name, service name, tenure, ACTIVE badge
- Renders email + phone + employee ID with copy-to-clipboard buttons
- Renders Edit / Reset password / Trigger onboarding buttons (disabled placeholder, role-gated visibility)
- "Make admin" toggle ONLY renders when viewer is `owner`
- Mobile fallback (< sm): avatar + name + role only; quick actions move into a sheet trigger

Commit: `feat(staff): StaffProfileHeader (quick actions stubbed for PR 4)`

### Task 3.5: Section components (4 sub-tasks)

Each section is a card with its own internal sub-tabs that render the existing tab components.

**Pattern (same for all 4 sections):**

```tsx
// src/components/staff/sections/EmploymentRecordsSection.tsx
"use client";

import { useState } from "react";
import { EmploymentTab } from "@/components/staff/tabs/EmploymentTab";
import { PersonalTab } from "@/components/staff/tabs/PersonalTab";
import type { StaffProfileData } from "@/components/staff/StaffProfileTabs"; // type re-used

const SUB_TABS = [
  { key: "employment", label: "Employment details" },
  { key: "personal", label: "Personal details" },
  { key: "emergency", label: "Emergency contacts" },
] as const;

export function EmploymentRecordsSection({ data, canEditPersonal, canEditEmployment }: Props) {
  const [tab, setTab] = useState<typeof SUB_TABS[number]["key"]>("employment");
  return (
    <section id="section-employment" className="rounded-xl border border-purple-200 bg-card p-6 mb-6">
      <header className="flex items-center justify-between mb-4">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <span className="w-2 h-2 rounded-full bg-purple-500" />
          Employment records
        </h2>
        <SubTabBar tabs={SUB_TABS} active={tab} onChange={setTab} />
      </header>
      {tab === "employment" && <EmploymentTab data={data} canEdit={canEditEmployment} />}
      {tab === "personal" && <PersonalTab data={data} canEdit={canEditPersonal} />}
      {tab === "emergency" && <EmergencyContactsView contacts={data.emergencyContacts} />}
    </section>
  );
}
```

The 4 sections:

| Section | Sub-tabs | Reuses |
|---------|----------|--------|
| EmploymentRecordsSection | Employment details · Personal details · Emergency contacts | `EmploymentTab`, `PersonalTab` |
| PayCompensationSection | Salary history · Work hours · Leave balances | `LeaveTab`, contract history list (build inline), work-hours read-only display |
| DocumentsSection | Certifications · Documents · Policies · Induction · Forms · Contracts | `ComplianceTab`, `DocumentsTab`, `ContractsTab`, lighter list views for Policies/Induction/Forms (use existing data) |
| PerformanceSection | Reviews · 9-Box · Management notes | existing review surfaces |

**Test cases per section** (a tight set — 3 tests each, 12 total):
- Renders the section's sub-tab bar with correct labels
- Default sub-tab renders correct child component
- Switching sub-tabs updates the rendered child

Commit per section: `feat(staff): <SectionName> with sub-tab navigation`

### Task 3.6: `StaffProfileLayout` top-level component

Composes header + pills + 4 sections. Replaces `StaffProfileTabs.tsx` for users on the new flag.

**Test cases:**
- Renders header, pills, all 4 sections
- Sections appear in correct order: Employment / Pay / Documents / Performance
- URL hash on mount scrolls to matching section
- Mobile fallback: pills become horizontal scroll, snapshot panel becomes a top-of-page horizontal strip

Implementation:

```tsx
// src/components/staff/StaffProfileLayout.tsx
"use client";

export function StaffProfileLayout(props: Props) {
  return (
    <div className="max-w-7xl mx-auto">
      <ProfileTopStrip /> {/* Back to Team + Prev/Next nav */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6 px-4 py-6">
        <div>
          <StaffProfileHeader {...} />
          <StaffProfilePills />
          <EmploymentRecordsSection {...} />
          <PayCompensationSection {...} />
          <DocumentsSection {...} />
          <PerformanceSection {...} />
        </div>
        <aside className="lg:sticky lg:top-4 lg:self-start">
          <StaffProfileStatsPanel stats={props.snapshotStats} />
        </aside>
      </div>
    </div>
  );
}
```

Commit: `feat(staff): StaffProfileLayout long-scroll EH-style layout`

### Task 3.7: Wire the new layout behind the flag in `/staff/[id]/page.tsx`

The page is a server component; the flag hook is client-side. So we add a thin client wrapper that decides which layout to render.

**Files:**
- Modify: `src/app/(dashboard)/staff/[id]/page.tsx`
- Create: `src/components/staff/StaffProfilePageClient.tsx` (client wrapper that calls the flag)

```tsx
// src/components/staff/StaffProfilePageClient.tsx
"use client";

import { useTeamsRedesignFlag } from "@/lib/useTeamsRedesignFlag";
import { StaffProfileTabs, type StaffProfileData, type StaffProfileTabKey } from "@/components/staff/StaffProfileTabs";
import { StaffProfileLayout } from "@/components/staff/StaffProfileLayout";
import type { SnapshotStats } from "@/lib/staff/snapshot-stats";

export interface StaffProfilePageClientProps {
  data: StaffProfileData;
  snapshotStats: SnapshotStats;
  activeTab: StaffProfileTabKey;
  canEditPersonal: boolean;
  canEditEmployment: boolean;
  canManageCompliance: boolean;
  isSelf: boolean;
  isAdmin: boolean;
}

export function StaffProfilePageClient(props: StaffProfilePageClientProps) {
  const teamsRedesign = useTeamsRedesignFlag();
  if (teamsRedesign) {
    return <StaffProfileLayout {...props} />;
  }
  return <StaffProfileTabs {...props} />;
}
```

`page.tsx` then computes `snapshotStats` server-side via the helper and passes both data + snapshotStats into the client wrapper.

Commit: `feat(staff): gate StaffProfileLayout behind useTeamsRedesignFlag`

### PR 3 wrap-up

- [ ] **Step 1: Run typecheck + lint + full tests**

```bash
npx tsc --noEmit && npx eslint src/components/staff src/lib/staff "src/app/(dashboard)/staff/[id]/page.tsx" && npx vitest run
```

Expected: clean, all tests pass.

- [ ] **Step 2: Manual smoke**

```
npm run dev
# Visit /staff/<some-id> — old layout
# Visit /staff/<some-id>?teams=1 — new long-scroll layout
```

- [ ] **Step 3: Push + open PR**

```bash
git push -u origin feat/teams-redesign-profile-layout
gh pr create --title "feat(staff): long-scroll profile layout (PR 3 of teams redesign)" --body "..."
```

Test counts: ~30 new tests (3 helper + 6 pills + 3 stats + 5 header + 12 sections + 4 layout).

---

**End of Chunk 3.**

---

## Chunk 4: PR 4 — Quick-action endpoint + UI buttons

**Branch:** `feat/teams-redesign-quick-actions`
**Depends on:** PR 3 merged (the header has stub buttons; this PR wires them).

**Files:**
- Create: `src/app/api/employees/[id]/quick-action/route.ts` + test
- Modify: `src/lib/onboarding-seed.ts` — add idempotency guard
- Modify: `src/components/staff/StaffProfileHeader.tsx` — wire stub buttons to the endpoint

### Task 4.0: Confirm `Todo.source` field exists

The idempotency guard in Task 4.1 keys off a `Todo.source` column. Verify whether it exists before writing the guard.

- [ ] **Step 1: Inspect schema**

```bash
grep -A 30 "model Todo " prisma/schema.prisma | grep -E "source\s+String"
```

- [ ] **Step 2: Decide branch**
- **If `Todo.source` exists** → proceed straight to Task 4.1 with `findFirst({ where: { assigneeId, source: "onboarding-seed" } })`.
- **If `Todo.source` does NOT exist** → add a migration in this PR. Edit `prisma/schema.prisma` to add `source String?` (nullable) to `Todo`, then `npx prisma migrate dev --name add_todo_source`. Backfill: existing rows stay null; the `onboarding-seed` writer will set `source: "onboarding-seed"` going forward; the idempotency guard correctly short-circuits only if a seeded row exists.

The plan assumes the **migration path** (the safer of the two — keyed identification beats title-string matching). If the field already exists, skip Steps 2's migration work but keep the rest of Task 4.1 unchanged.

Commit (only if migration was added): `chore(prisma): add Todo.source for onboarding idempotency`

### Task 4.1: Idempotency guard on `onboarding-seed.ts`

The reviewer flagged this as a blocker for the trigger-onboarding action. Without it, re-firing the action duplicates 7 todos.

**Test case (add to existing onboarding-seed test file if any, otherwise create `src/__tests__/lib/onboarding-seed-idempotency.test.ts`):**
- First call seeds 7 todos
- Second call seeds 0 todos (`findFirst` short-circuit)
- Audit-log records the no-op result

**Implementation:**

```ts
// src/lib/onboarding-seed.ts (modify)

export async function seedOnboardingTodos(userId: string): Promise<{ created: number }> {
  // Idempotency guard (Task 4.1).
  const existing = await prisma.todo.findFirst({
    where: { assigneeId: userId, source: "onboarding-seed", deleted: false },
    select: { id: true },
  });
  if (existing) {
    return { created: 0 };
  }

  // ... existing seeding logic, with `source: "onboarding-seed"` added to each
  // create call so the guard works on the next invocation.
  return { created: 7 };
}
```

Commit: `fix(onboarding): idempotency guard on seedOnboardingTodos`

### Task 4.2: `/api/employees/[id]/quick-action` route + test

**Body shape:**
```ts
{ action: "reset-password" | "trigger-onboarding" | "deactivate" | "reactivate" | "make-admin" | "remove-admin", confirm?: boolean }
```

**Auth matrix:**
- `reset-password` — admin only
- `trigger-onboarding` — admin only
- `deactivate` / `reactivate` — admin only; cannot deactivate self
- `make-admin` / `remove-admin` — owner only

**Test cases (10):**
- 401 unauth
- 400 unknown action
- 400 unknown user id
- 403 reset-password as member
- 200 reset-password as admin (calls existing reset endpoint)
- 200 trigger-onboarding as admin (idempotent — returns `created: 0` on second call)
- 403 deactivate own self
- 200 deactivate as admin (User.active flipped)
- 403 make-admin as admin (only owner)
- 200 make-admin as owner

Each successful action writes an audit-log row via the existing pattern (search for `activityLog.create` or similar).

Commit: `feat(employees): /api/employees/[id]/quick-action endpoint`

### Task 4.3: Wire the header buttons

Replace the stub buttons in `StaffProfileHeader` with real handlers that call the new endpoint via `mutateApi`.

**Pattern (one mutation per action):**

```tsx
const triggerOnboarding = useMutation({
  mutationFn: () => mutateApi(`/api/employees/${employeeId}/quick-action`, {
    method: "POST",
    body: { action: "trigger-onboarding" },
  }),
  onSuccess: () => toast({ description: "Onboarding checklist sent." }),
  onError: (err: Error) => toast({ variant: "destructive", description: err.message }),
});
```

Buttons:
- **Edit profile** — opens existing user-edit dialog (no API call)
- **Reset password** — confirm modal then `action: "reset-password"`
- **Trigger onboarding** — confirm modal then `action: "trigger-onboarding"`
- **Make admin** — toggle, calls `make-admin` or `remove-admin` based on current state. Owner only.
- **Deactivate / Reactivate** — two-tap-confirm pattern (matches the release-shift button from PR #64). 5-second window. Calls `deactivate` or `reactivate`.

Commit: `feat(staff): wire profile quick-action buttons to /api/employees/[id]/quick-action`

### PR 4 wrap-up

- [ ] **Step 1: Verify auth matrix passes via tests**

Run: `npx vitest run src/__tests__/api/employees-quick-action.test.ts`

- [ ] **Step 2: Manual smoke**

As admin, visit `/staff/<some-id>?teams=1`, click each button, confirm:
- Reset password fires confirm modal → 200 → toast
- Trigger onboarding fires → toast → re-firing returns "already triggered" or "0 created" message
- Deactivate two-tap-confirm → user.active flipped (verify in DB or in another tab)
- Make admin toggle (only visible as owner)

- [ ] **Step 3: Push + open PR**

```bash
git push -u origin feat/teams-redesign-quick-actions
gh pr create --title "feat(employees): quick-action endpoint + profile header wiring (PR 4)"
```

Test counts: 10 route + 1 onboarding-idempotency = 11 new tests.

---

**End of Chunk 4.**

---

## Chunk 5: PR 5 — Re-home Performance List + PR 6 — `/accountability-chart` page

These are two small, independent PRs. Bundled into one chunk because each is ≤200 lines of churn.

### PR 5 — Performance List → `/leadership`

**Branch:** `feat/teams-redesign-perf-list-rehome`
**Depends on:** none (independent of teams redesign work).

**Files:**
- Create: `src/components/leadership/PerformanceListCard.tsx` (renamed copy of `src/components/team/TeamListView.tsx`)
- Modify: `src/app/(dashboard)/leadership/page.tsx` — mount the card between Recent Incidents and Quarterly Rocks
- Note: `src/components/team/TeamListView.tsx` stays in place — it's still used by `LegacyTeamView` until cleanup in PR 8

#### Tasks

- [ ] **Step 1: Copy `TeamListView.tsx` → `PerformanceListCard.tsx`**

Identical content. Wrap in a `<section>` shell matching `LeadershipRecentIncidentsCard` (header with title + icon, then the table).

- [ ] **Step 2: Mount on `/leadership/page.tsx`**

Find the "Section 1.6: Org-wide compliance cert expiry rollup" block (from PR #75). Add `<PerformanceListCard />` between Section 1.5 (Recent Incidents) and Section 2 (Quarterly Rocks).

- [ ] **Step 3: Verify**

Existing `useTeam()` hook + `/api/team` endpoint already work. No backend changes.

Manual smoke: visit `/leadership` as admin, confirm Performance List renders.

- [ ] **Step 4: Commit + push + PR**

Commit: `feat(leadership): mount PerformanceListCard between Recent Incidents and Quarterly Rocks`

### PR 6 — `/accountability-chart` page

**Branch:** `feat/teams-redesign-accountability-chart`
**Depends on:** none.

**Files:**
- Create: `src/app/(dashboard)/accountability-chart/page.tsx`
- Create: `src/app/(dashboard)/accountability-chart/loading.tsx` (Skeleton)
- Modify: `src/lib/role-permissions.ts` — register the new route in `allPages` and every role's `rolePageAccess`
- Modify: `src/lib/nav-config.ts` — add a new nav entry under the EOS sidebar group, visible to all roles

#### Tasks

- [ ] **Step 0: Move `OrgChartView` to its new home**

Before creating the page, relocate the component:

```bash
git mv src/components/team/OrgChartView.tsx \
       src/components/accountability-chart/OrgChartView.tsx
```

Update the **only existing import** (in `src/components/team/LegacyTeamView.tsx` from PR 2) to point to the new path:

```bash
grep -rn "@/components/team/OrgChartView" src
# fix any matches with sed or manual edit
```

This decouples PR 8's cleanup from PR 6 — the deletion in PR 8 then only needs to remove `LegacyTeamView` and its imports, not move files.

- [ ] **Step 1: Create the page**

```tsx
// src/app/(dashboard)/accountability-chart/page.tsx
"use client";

import { OrgChartView } from "@/components/accountability-chart/OrgChartView";
import { PageHeader } from "@/components/layout/PageHeader";

export default function AccountabilityChartPage() {
  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <PageHeader
        title="Accountability Chart"
        description="Organisational structure and seat assignments."
      />
      <OrgChartView />
    </div>
  );
}
```

- [ ] **Step 2: Register in `role-permissions.ts`**

Per the CLAUDE.md "New Feature/Page" checklist:
1. Add `"/accountability-chart"` to the `allPages` array.
2. Add `"/accountability-chart"` to **every role's** `rolePageAccess` entry — yes, including `staff`, `member`, `marketing` (per spec, the chart is visible to all).

Verify via `grep` after editing that the route appears in 7 places (1 in `allPages` + 6 in role entries).

- [ ] **Step 3: Add to `nav-config.ts`**

Add an entry like:

```ts
{
  href: "/accountability-chart",
  label: "Accountability Chart",
  icon: Users,
  section: "EOS",
  roles: ALL_ROLES, // visible to everyone
  tooltip: "Org structure and seat assignments",
},
```

Place after `/team` in the EOS section.

- [ ] **Step 4: Verify**

Manual smoke: visit `/accountability-chart` as each role (use seed users). Confirm:
- Chart renders for all roles
- Sidebar shows the entry for all roles
- 404/403 do NOT happen

- [ ] **Step 5: Add a route-permissions test**

`src/__tests__/lib/role-permissions.test.ts` — add a case asserting `/accountability-chart` is in every role's allowlist.

Commit: `feat(eos): /accountability-chart page accessible to all roles`

### Chunk 5 wrap-up

- [ ] Both PRs merged independently. Test counts: 1 (the role-permissions check).

---

**End of Chunk 5.**

---

## Chunk 6: PR 7 — Flag flip + PR 8 — Cleanup

### PR 7 — Flag flip + production verification

**Branch:** N/A (this is a Vercel env-var change, not a code PR — but a tracking issue + smoke checklist is helpful).

**Phase 1: Flip for owner/admin only (week 1)**

- [ ] **Step 1: Set `NEXT_PUBLIC_TEAMS_REDESIGN=true` in Vercel preview** (not production yet)
- [ ] **Step 2: Smoke as owner**, confirm:
  - `/team` renders new EmployeeListView
  - Search, all filter combinations work
  - Click a row → `/staff/[id]` renders new long-scroll layout
  - All 4 quick actions work
  - Pills scroll-spy works
  - Mobile responsive (use Chrome DevTools device mode)
- [ ] **Step 3: Same smoke as admin / head_office / member / staff / marketing**
- [ ] **Step 4: Set the env var on production**
- [ ] **Step 5: Monitor Sentry / logs for 24 hours** for errors against `/api/employees`, `/api/employees/*/quick-action`, `/staff/*`

**Phase 2: Open up to everyone (week 2)**

The flag is "on" globally already; this just means we proactively communicate the change in the next staff bulletin. No code change.

If anything regresses: set `NEXT_PUBLIC_TEAMS_REDESIGN=false` in production env vars. Old `/team` and old `/staff/[id]` continue to work.

### PR 8 — Cleanup (1 month after PR 7 ships)

**Branch:** `chore/teams-redesign-cleanup`
**Depends on:** PR 7 deployed and stable for 1 month.

**Files to delete:**
- `src/components/team/OrgChartView.tsx`
- `src/components/team/TeamListView.tsx`
- `src/components/team/LegacyTeamView.tsx`
- `src/components/staff/StaffProfileTabs.tsx`
- `src/components/staff/tabs/OverviewTab.tsx` (subsumed by snapshot panel)
- `src/lib/useTeamsRedesignFlag.ts` (the flag itself)
- The `NEXT_PUBLIC_TEAMS_REDESIGN` line in `.env.example`

**Files to simplify:**
- `src/app/(dashboard)/team/page.tsx` — remove the flag check; render `EmployeeListView` directly
- `src/components/staff/StaffProfilePageClient.tsx` — remove the flag check; render `StaffProfileLayout` directly OR remove the wrapper entirely and call `StaffProfileLayout` from `page.tsx`
- The 7 staff/tabs files (PersonalTab, EmploymentTab, LeaveTab, TimesheetTab, ComplianceTab, DocumentsTab, ContractsTab) STAY — they're still imported by the new sections.

**Tests to remove:** any test files that exclusively test the deleted components (`OrgChartView.test.tsx`, `TeamListView.test.tsx`, etc. — if they exist).

#### Tasks

- [ ] **Step 1: Verify nothing else imports the to-be-deleted files**

```bash
grep -rn "from \"@/components/team/OrgChartView\"" src
grep -rn "from \"@/components/team/TeamListView\"" src
grep -rn "from \"@/components/team/LegacyTeamView\"" src
grep -rn "from \"@/components/staff/StaffProfileTabs\"" src
grep -rn "from \"@/components/staff/tabs/OverviewTab\"" src
grep -rn "from \"@/lib/useTeamsRedesignFlag\"" src
```

For each file: should ONLY return import lines from `team/page.tsx`, `staff/[id]/page.tsx`, or the file itself. If anything else imports them, investigate.

- [ ] **Step 2: Delete the dead files**

```bash
git rm src/components/team/TeamListView.tsx \
       src/components/team/LegacyTeamView.tsx \
       src/components/staff/StaffProfileTabs.tsx \
       src/components/staff/tabs/OverviewTab.tsx \
       src/lib/useTeamsRedesignFlag.ts
```

`OrgChartView.tsx` was already moved to `src/components/accountability-chart/` during PR 6 Step 0 — no action needed for it here.

- [ ] **Step 3: Simplify the page entry points**

Edit `src/app/(dashboard)/team/page.tsx` and `src/app/(dashboard)/staff/[id]/page.tsx` to remove the flag conditional.

- [ ] **Step 4: Remove env-var scaffolding**

Edit `.env.example` to delete the `NEXT_PUBLIC_TEAMS_REDESIGN` line. Delete the env var from Vercel project settings.

- [ ] **Step 5: Run typecheck + lint + tests**

```bash
npx tsc --noEmit && npx eslint . && npx vitest run
```

Expected: clean, no test removals required (the deleted files weren't directly tested unless `OrgChartView.test.tsx` exists — if it does, delete it too).

- [ ] **Step 6: Commit + push + PR**

```bash
git add -A
git commit -m "chore(teams): remove legacy /team + /staff layouts and feature flag"
git push -u origin chore/teams-redesign-cleanup
gh pr create --title "chore(teams): cleanup legacy layouts after 1 month stable rollout" --body "..."
```

PR body lists the files removed + confirms the flag has been on globally with no rollback needed.

---

**End of Chunk 6.**

---

## Acceptance criteria (final)

When all 8 PRs are merged:

- ✅ `/team` is a searchable, filterable employee list. Rows click into `/staff/[id]`.
- ✅ Marketing role: contact details stripped server-side (in both narrow `select` AND `formatEmployeeRow`); rows non-clickable in the list.
- ✅ Service-scoped roles only see rows within their assigned service.
- ✅ `/staff/[id]` renders the long-scroll layout with sticky horizontal pills, header, snapshot panel, and 4 section cards.
- ✅ Sub-tabs inside each section reuse the existing tab components.
- ✅ Quick-action buttons in the profile header work for the 5 actions (Edit / Reset password / Trigger onboarding / Make admin / Deactivate). Trigger onboarding is idempotent.
- ✅ `/leadership` has a Performance List card.
- ✅ `/accountability-chart` is a new route accessible to all roles.
- ✅ All work behind `NEXT_PUBLIC_TEAMS_REDESIGN` flag during phased rollout; old views still work while flag is off.
- ✅ ~95 new tests pass (29 PR 1 + 22 PR 2 + 30 PR 3 + 11 PR 4 + 1 PR 5/6 + a few infrastructure cases). Existing tests untouched.
- ✅ `npx tsc --noEmit`, `npx eslint`, full `vitest run` clean throughout.
- ✅ After PR 7 rolls out + 1 month stable, PR 8 deletes the legacy code.

