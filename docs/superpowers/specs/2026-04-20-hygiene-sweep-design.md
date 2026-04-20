# Sub-project 2 — Hygiene Sweep

**Date**: 2026-04-20
**Status**: Approved (v3, post-baseline-reverification, spec-reviewer-approved)
**Parent roadmap**: [`2026-04-20-dashboard-bugfix-roadmap.md`](./2026-04-20-dashboard-bugfix-roadmap.md)
**Predecessor**: Sub-project 1 P0 Bug Batch (merged as `dd0a1d9`)

## Overview

Systemic convention-compliance sweep across the codebase. Eight categories of hygiene debt surfaced by the Sub-project 0 audit, the Sub-project 1 review, and a baseline re-verification pass. One feature branch, one PR, **eight stacked commits in smallest-blast-radius-first order**. Each commit is independently revert-safe. No new features, no schema changes, no module rebuilds — strictly applying already-established conventions to existing code.

**Branch**: `hygiene/sweep-2026-04-20` off `origin/main` at `dd0a1d9`
**Worktree**: `.worktrees/hygiene-sweep`

## Baseline (captured 2026-04-20, post `npx prisma generate`)

Numbers used throughout this spec, verified against the current codebase state. Every subagent MUST re-verify these at commit-start with the grep commands shown.

| Metric | Count | Verification command |
|---|---|---|
| Tests passing | 997 | `npm test -- --run 2>&1 \| tail -5` |
| `tsc --noEmit` errors | 26 total (24 in `src/__tests__/**`, 2 in `tests/integration/**`, 0 in prod code) | `npx tsc --noEmit 2>&1 \| grep -c "error TS"` |
| `await req.json()` sites | 247 across 242 files in `src/app/api/` (some files have multiple) | `grep -rn "await req\.json" src/app/api/ \| wc -l` (sites) and `\| cut -d: -f1 \| sort -u \| wc -l` (files) |
| Silent `.catch(() => {})` sites | 46 across 33 files | `grep -rn "\.catch(() *=> *{})" src/ \| wc -l` |
| `hasFeature(... as Role)` sites | 16 across 10 files | `grep -rn "hasFeature(.*as Role" src/ \| wc -l` |
| `session.user.role as Role` sites (scope for commit 6) | 17 across 10 files (16 `hasFeature(... as Role)` + 1 `const role = session!.user.role as Role` in `crm/leads/[id]/score/route.ts`) | see commit 6 table |
| `as Role` total in production | 38 sites across 27 files (broader; not all in scope) | `grep -rn "as Role" src/ \| grep -v __tests__ \| grep -v "\.d\.ts" \| wc -l` |
| Cron routes total | 61 | `ls src/app/api/cron/ \| wc -l` |
| Crons missing `acquireCronLock` | 10 (of 11 unlocked routes, `health` is excluded — it's a UI admin monitoring endpoint in the cron dir, NOT listed in `vercel.json`'s `crons` array; locking it would reject legitimate admin UI refreshes) | see commit 4 table |
| `useMutation` missing `onError` | 46 across 21 files (dashboard + hooks + shared components; parent portal explicitly excluded — no cowork portal dir exists) | audit script committed at `scripts/audit-mutation-onerror.py` (commit 7 includes it) |
| Inline 3-role admin arrays — broken down by shape | `["owner", "head_office", "admin"]`: ~178 in `withApiAuth({ roles: [...] })` shape (dominant). `["owner", "admin", "head_office"]`: 2 in `owna/*`. Local `const ADMIN_ROLES = [...]` declarations: 3 files (policies, getting-started, guides pages). `role: { in: [...] }` Prisma queries: 4 sites. `.includes(...)` audit checks: ~6 sites. **In scope for commit 2**: only 5 files — add `ADMIN_ROLES` export, consolidate 3 local declarations, replace 2 owna sites. **Out of scope**: the ~178 `withApiAuth` sites (separate sub-project — uniform mechanical migration candidate). | commit 2's Acceptance section |

**Target end state**: baseline clean on all in-scope metrics (247→0 req.json sites, 46→0 silent catches, 17→0 `session.user.role as Role` in scoped files, 10→0 unlocked crons in scope, 46→0 missing onError, 26→0 tsc errors, 5→0 target inline ADMIN_ROLES sites) AND 997+ tests still passing AND CI green on the branch.

## In scope — 8 stacked commits

| # | Commit subject | Category | Files touched |
|---|---|---|---|
| 1 | `fix(ci): add DATABASE_URL_UNPOOLED to test workflow env` | Infrastructure | 2 |
| 2 | `refactor(auth): extract ADMIN_ROLES constant (scoped)` | Code quality | ~5 |
| 3 | `fix(errors): replace 46 silent .catch(() => {}) with logger calls` | Reliability | 33 |
| 4 | `fix(cron): add acquireCronLock to 10 missing crons` | Reliability | 10 |
| 5 | `fix(tests): resolve 26 TS errors (24 test-file, 2 integration-test)` | Type safety | ~10 |
| 6 | `refactor(auth): narrow session.user.role — replace unsafe as Role in scoped files` | Type safety | ~11 |
| 7 | `fix(hooks): add onError destructive toast to 46 mutations` | UX reliability | 22 + 1 (audit script) |
| 8 | `refactor(api): migrate 247 req.json() sites in 242 files to parseJsonBody()` | Error handling | 242 + 1 (one-shot codemod) |

**Ordering change from v1**: commits 5 and 6 are swapped. TS errors are fixed first (commit 5) to ensure the type-narrowing refactor in commit 6 lands on a clean tsc baseline — so any error introduced by the refactor is visible immediately, not lost in noise.

Rule: if a commit breaks CI, fix it before stacking the next — no piling broken commits.

---

### Commit 1: `fix(ci): add DATABASE_URL_UNPOOLED to test workflow env`

**Problem**: `prisma/schema.prisma:8` uses `directUrl = env("DATABASE_URL_UNPOOLED")`. `.github/workflows/test.yml` integration and e2e jobs set `DATABASE_URL` but never set `DATABASE_URL_UNPOOLED`. Integration tests on main fail because Prisma cannot resolve `directUrl`.

**Fix** — anchor-based (robust to line drift):
- `.github/workflows/test.yml`: in any `env:` block that currently contains a `DATABASE_URL:` line for the CI Postgres service, add a sibling `DATABASE_URL_UNPOOLED:` line with the same value. As of baseline, this is 2 blocks (integration job + e2e job).
- `.env.example`: below the `DATABASE_URL=` line, add a `DATABASE_URL_UNPOOLED=` line with the same placeholder value and a comment: `# Prisma directUrl — bypasses connection pooler for migrations (CI/local: same as DATABASE_URL)`.

**Acceptance**:
- `grep -A 10 "DATABASE_URL:" .github/workflows/test.yml | grep -c DATABASE_URL_UNPOOLED` → matches the count of `DATABASE_URL:` entries
- Next GitHub Actions run reaches test execution; no Prisma directUrl error
- `.env.example` documents the var

---

### Commit 2: `refactor(auth): extract ADMIN_ROLES constant (scoped)`

**Problem**: Flagged during Sub-project 1 bug #14 review. Three page files already declare their own local `ADMIN_ROLES` constant, and 2 owna routes use an inline `["owner", "admin", "head_office"]` array. Consolidate to a single shared export. The *dominant* admin-role array shape in the codebase is `["owner", "head_office", "admin"]` (~178 sites in `withApiAuth({ roles: [...] })` shape) — explicitly OUT OF SCOPE for this commit (separate follow-up sub-project; too big to fold in here).

**Scope — exactly 5 files**:
1. Add export: `src/lib/role-permissions.ts` → `export const ADMIN_ROLES = ["owner", "admin", "head_office"] as const;`
2. Replace 2 owna inline sites:
   - `src/app/api/owna/centres/route.ts:37` — `{ roles: ["owner", "admin", "head_office"] }` → `{ roles: [...ADMIN_ROLES] }`
   - `src/app/api/owna/test/route.ts:27` — same
3. Consolidate 3 local declarations (replace with import of shared constant):
   - `src/app/(dashboard)/policies/page.tsx:42` — `const ADMIN_ROLES: string[] = ["owner", "admin", "head_office"];`
   - `src/app/(dashboard)/getting-started/GettingStartedContent.tsx:56` — `const ADMIN_ROLES = ["owner", "admin", "head_office"];`
   - `src/app/(dashboard)/guides/GuidesContent.tsx:12` — `const ADMIN_ROLES = new Set<string>(["owner", "admin", "head_office"]);` → either construct a Set from `ADMIN_ROLES` locally (`new Set(ADMIN_ROLES)`) or rework the usage site to `.includes()`

**Follow-up (documented in PR body)**: `~178 withApiAuth({ roles: ["owner", "head_office", "admin"] })` sites should be migrated to `[...ADMIN_ROLES]` in a dedicated follow-up sub-project. That migration is uniform-mechanical and warrants its own PR — not folded into this hygiene sweep.

**Acceptance**:
- `ADMIN_ROLES` exported from `src/lib/role-permissions.ts`
- `grep -rn "const ADMIN_ROLES" src/app/" returns 0 (all local declarations removed / imported from shared)
- `grep -rn '\["owner",\s*"admin",\s*"head_office"\]' src/app/api/owna/` returns 0 (owna sites use `[...ADMIN_ROLES]`)
- `npm run build` clean, `npm test -- --run` passes
- PR body explicitly documents the `~178 withApiAuth` follow-up (name + scope)

**YAGNI note**: do NOT migrate the `~178 withApiAuth` sites in this commit even if it looks mechanical. That's out of scope — respect the scope bound.

---

### Commit 3: `fix(errors): replace 46 silent .catch(() => {}) with logger calls`

**Problem**: 46 sites across 33 files use `.catch(() => {})` to discard async errors. Real failures vanish. Baseline audit below.

**Files affected — exact counts per file (33 files, 46 sites)**:

| File | Sites |
|---|---|
| `src/app/api/ai-drafts/[id]/route.ts` | 5 |
| `src/app/api/enrol/route.ts` | 3 |
| `src/app/api/cron/auto-escalation/route.ts` | 3 |
| `src/lib/cache.ts` | 2 |
| `src/components/marketing/ActivationAssignmentGrid.tsx` | 2 |
| `src/app/parent/children/[id]/page.tsx` | 2 |
| `src/app/api/tickets/[id]/route.ts` | 2 |
| `src/app/api/attendance/roll-call/route.ts` | 2 |
| `src/lib/api-key-auth.ts` | 1 |
| `src/lib/ai-task-agent.ts` | 1 |
| `src/components/team/SeatEditModal.tsx` | 1 |
| `src/components/marketing/TaskDetailPanel.tsx` | 1 |
| `src/components/marketing/CreateTaskModal.tsx` | 1 |
| `src/components/enrol/steps/BookingStep.tsx` | 1 |
| `src/app/survey/feedback/[serviceId]/page.tsx` | 1 |
| `src/app/api/rocks/route.ts` | 1 |
| `src/app/api/parent/messages/route.ts` | 1 |
| `src/app/api/parent/messages/[id]/reply/route.ts` | 1 |
| `src/app/api/parent/enrolments/route.ts` | 1 |
| `src/app/api/parent/bookings/route.ts` | 1 |
| `src/app/api/parent/absences/route.ts` | 1 |
| `src/app/api/messaging/conversations/route.ts` | 1 |
| `src/app/api/messaging/conversations/[id]/messages/route.ts` | 1 |
| `src/app/api/messaging/broadcasts/route.ts` | 1 |
| `src/app/api/issues/route.ts` | 1 |
| `src/app/api/exit-survey/trigger/route.ts` | 1 |
| `src/app/api/cron/weekly-report/route.ts` | 1 |
| `src/app/api/cron/attendance-to-financials/route.ts` | 1 |
| `src/app/api/cron/attendance-alerts/route.ts` | 1 |
| `src/app/api/crm/leads/[id]/route.ts` | 1 |
| `src/app/api/bookings/[id]/decline/route.ts` | 1 |
| `src/app/api/bookings/[id]/approve/route.ts` | 1 |
| `src/app/(dashboard)/settings/SettingsContent.tsx` | 1 |
| **Total** | **46 sites, 33 files** |

**Triage** — each site must be assigned to one of 3 categories at fix time:
- **(A) Convert to `logger.error`** — server-side fire-and-forget notification / scheduler where a failure is a bug. Default for most API-route and cron sites.
  ```ts
  sendX(args).catch((err) => logger.error("sendX failed", { err, <contextIds> }));
  ```
- **(B) Convert to dev-only `console.warn`** — client-side best-effort that genuinely should fail silently in prod (e.g. `navigator.clipboard.writeText(...)` failing silently is correct; dev feedback still useful).
  ```ts
  doX().catch((err) => { if (process.env.NODE_ENV !== "production") console.warn("doX failed:", err); });
  ```
- **(C) Intentional silent, document** — legit invariant where the error cannot be acted on (e.g. cache invalidation best-effort, where recovery is expected).
  ```ts
  // Intentional: cache invalidation is best-effort — downstream readers will retry.
  doX().catch(() => {});
  ```

**Assignment rule**: default to (A) for server-side code (`src/app/api/**`, `src/app/api/cron/**`, `src/lib/**`); default to (B) for client-side UI effects; only use (C) with a single-line comment explaining why.

**Acceptance**:
- `grep -rn "\.catch(() *=> *{})" src/` returns only (C)-category sites, each adjacent to a one-line justification comment
- `grep -B 1 "\.catch(() *=> *{})" src/` every returned site has a `//` comment above it
- PR body lists all (C)-category sites with justification
- `npm test -- --run` passes (no behaviour change — logging is observational)

---

### Commit 4: `fix(cron): add acquireCronLock to 10 missing crons`

**Problem**: 10 cron routes run without idempotency locks. A duplicate Vercel cron invocation can corrupt state.

**Excluded from scope**: `src/app/api/cron/health/route.ts` — despite living in the cron directory, it's a UI-invoked admin monitoring endpoint (uses `withApiAuth`, not `withApiHandler` + `verifyCronSecret`) and is NOT listed in `vercel.json`'s `crons` array. Adding `acquireCronLock` would reject the second admin user who visits the health page in the same period. Out of scope; either leave as-is or move outside `/api/cron/` in a separate follow-up.

**Exact list** (10 crons — verified via `grep -L acquireCronLock src/app/api/cron/*/route.ts`, cross-checked against `vercel.json` `crons` array):

1. `src/app/api/cron/cleanup-tokens/route.ts`
2. `src/app/api/cron/document-expiry/route.ts`
3. `src/app/api/cron/social-sync/route.ts`
4. `src/app/api/cron/auto-onboarding/route.ts`
5. `src/app/api/cron/enquiry-alerts/route.ts`
6. `src/app/api/cron/enquiry-auto-cold/route.ts`
7. `src/app/api/cron/waitlist-expiry/route.ts`
8. `src/app/api/cron/unactioned-bookings/route.ts`
9. `src/app/api/cron/attendance-to-financials/route.ts`
10. `src/app/api/cron/financials-monthly-rollup/route.ts`

**Fix template** — verified against `src/lib/cron-guard.ts` and `src/app/api/cron/daily-digest/route.ts` (canonical usage example; `owna-sync` is a special case that constructs an external half-hour slot):

```ts
const guard = await acquireCronLock("<cron-name>", "<period>");
if (!guard.acquired) {
  return NextResponse.json({ message: guard.reason, skipped: true });
}

try {
  // existing work...
  await guard.complete({ /* metrics */ });
  return NextResponse.json({ /* result */ });
} catch (err) {
  await guard.fail(err);
  throw err;
}
```

Key points (per `src/lib/cron-guard.ts`):
- `acquireCronLock(cronName, period)` — pass cron name and period type ONLY. The period key is computed internally by `getPeriodKey(period)` (produces `YYYY-MM-DD` for daily, `YYYY-MM-DDTHH` for hourly, `YYYY-MM` for monthly, `YYYY-Www` for weekly).
- `guard.complete(details)` — mark run as **successfully completed**. Call on the success path only.
- `guard.fail(err)` — mark run as **failed** (distinct state). Call on the error path. NEVER use `guard.complete({ error })` to represent failure — that records success and defeats idempotency for retry after a real failure.

**Period per cron** (derived from `vercel.json` schedules; CronPeriod types per `src/lib/cron-guard.ts:28` — `CronPeriod = "hourly" | "2hourly" | "daily" | "weekly" | "monthly"`):

| Cron | vercel.json schedule | Period |
|---|---|---|
| `cleanup-tokens` | `0 14 * * *` (daily) | `daily` |
| `document-expiry` | `0 21 * * 1` (weekly Mon) | `weekly` |
| `social-sync` | `0 */4 * * *` (every 4h) | `2hourly` (4h runs fit uniquely in 2h period keys) |
| `auto-onboarding` | `30 21 * * *` (daily) | `daily` |
| `enquiry-alerts` | `30 21 * * *` (daily) | `daily` |
| `enquiry-auto-cold` | `0 10 * * 0` (weekly Sun) | `weekly` |
| `waitlist-expiry` | `0 * * * *` (hourly) | `hourly` |
| `unactioned-bookings` | `0 23 * * *` (daily) | `daily` |
| `attendance-to-financials` | `0 13 * * 0` (weekly Sun) | `weekly` |
| `financials-monthly-rollup` | `0 14 1 * *` (1st of month) | `monthly` |

**Acceptance**:
- All 60 real cron routes in `src/app/api/cron/` (i.e. all except `health`, which is a UI endpoint) have `acquireCronLock`
- For each of the 10, run the cron twice in the same period; second returns `{ skipped: true }`
- Existing cron tests (if any) still pass
- No cron's existing success path is broken
- Existing wrapper (`withApiHandler`, plain function, or `POST`) preserved — commit does NOT rewrite the export shape

---

### Commit 5: `fix(tests): resolve 26 TS errors (24 test-file + 2 integration-test)`

**Problem**: `npx tsc --noEmit` currently reports 26 errors — 24 in `src/__tests__/**` and 2 in `tests/integration/**`. 0 errors in production code (verified post `npx prisma generate`). Should be 0 total.

**Exact error list** (from `npx tsc --noEmit 2>&1 | grep "error TS"`):

| File | Errors | Root cause |
|---|---|---|
| `src/__tests__/api/contracts.test.ts` | 2 (lines 245, 309) | `MockUser` missing required `name` property |
| `src/__tests__/api/internal-feedback.test.ts` | 1 (line 37) | `MockUser` missing `name`; `role: any` |
| `src/__tests__/api/upload.test.ts` | 8 (lines 93, 116, 140, 156, 191, 204, 214) | `Uint8Array<ArrayBufferLike>` not assignable to `BlobPart` |
| `src/__tests__/components/IssueKanban.test.tsx` | 2 (lines 30, 31) | Duplicate object keys |
| `src/__tests__/function-seat-endpoints.test.ts` | 1 (line 62) | `RequestInit.signal` type mismatch (AbortSignal \| null \| undefined) |
| `src/__tests__/lib/api-error.test.ts` | 2 (lines 245, 259) | `NextResponse` not imported |
| `src/__tests__/lib/cert-expiry.test.ts` | 1 (line 66) | `afterAll` not imported from vitest |
| `src/__tests__/lib/nurture-scheduler.test.ts` | 7 (lines 39, 273, 274, 275, 295, 296, 297) | `afterAll` not imported; implicit `any` on callback params |
| `src/__tests__/service-tab-endpoints.test.ts` | 1 (line 60) | Same as function-seat-endpoints |
| `tests/integration/cowork-api.test.ts` | 2 (lines 130, 148) | `afterEach` not imported; `.status` accessed on Promise |
| **Total** | **26** | |

**Fixes** (all mechanical):
- **MockUser missing name** → add `name: "Test User"` (or similar) to mock user fixtures. Consider updating the `MockUser` helper in `src/__tests__/helpers/auth-mock.ts` to either default `name` or mark it optional.
- **Uint8Array BlobPart** → the TS lib types for `Uint8Array<ArrayBufferLike>` changed in Node 20. Fix: cast to `BlobPart` at fixture creation, e.g. `new Blob([buffer as BlobPart], { type: "..." })`.
- **Duplicate object keys in IssueKanban test** → remove the literal duplicates.
- **RequestInit.signal** → in the custom request helper, the signal type is `AbortSignal | null | undefined` but Next's `RequestInit` expects `AbortSignal | undefined`. Fix: narrow at construction — `signal: init?.signal ?? undefined`.
- **Missing imports (`NextResponse`, `afterAll`, `afterEach`)** → add the imports from `next/server` and `vitest`.
- **Implicit any parameters** → add type annotations (`(s: Sequence) => ...`).
- **`.status` on Promise** → `await` the promise first.

**Rule**: production code (`src/app`, `src/components`, `src/hooks`, `src/lib`) MUST NOT change in this commit. Only test files and test helpers (`src/__tests__/helpers/**`).

**Acceptance**:
- `npx tsc --noEmit` → exit 0, 0 errors
- All 997+ tests still pass (`npm test -- --run`)
- `git diff --stat origin/main..HEAD -- src/app src/components src/hooks src/lib` shows 0 lines changed

---

### Commit 6: `refactor(auth): narrow session.user.role — replace unsafe as Role in scoped files`

**Problem**: 17 sites across 10 files unsafely cast `session.user.role` (or similar) to the Prisma `Role` enum using `as Role`. The value might not be a valid enum variant. Breakdown:
- 16 sites: `hasFeature(... as Role, ...)` — the dominant pattern
- 1 site: `const role = session!.user.role as Role;` in `src/app/api/crm/leads/[id]/score/route.ts:18` — same semantic, different syntax

**Scope bound** (narrow — the broader 38-site `as Role` sweep is deferred): this commit touches ONLY the session-role narrowing pattern. Out of scope:
- `e.target.value as Role` in form `<select>` onChange handlers (different semantic — user input, not session value)
- `session?.user?.role as Role | undefined` in components (union type including undefined — handled differently)
- `as Role` in `src/lib/server-auth.ts` and `src/components/ui/RoleGate.tsx` (infrastructure-level — may deserve deeper refactor)

**Fix**: Add a runtime helper in `src/lib/role-permissions.ts`:

```ts
import { Role } from "@prisma/client";

/**
 * Safely narrow a session role value to the Prisma Role enum.
 * Returns null if the value is absent or not a valid Role.
 */
export function parseRole(value: unknown): Role | null {
  if (typeof value !== "string") return null;
  return (Object.values(Role) as string[]).includes(value) ? (value as Role) : null;
}
```

Replace each `hasFeature(... as Role, ...)` site:

```ts
// Before
if (!hasFeature(session!.user.role as Role, "crm.view")) {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

// After
const role = parseRole(session!.user.role);
if (!role || !hasFeature(role, "crm.view")) {
  throw ApiError.forbidden();
}
```

(If the file already imports from `@/lib/api-error`, use `ApiError.forbidden()` to align with standard; if not, keep the existing error-return shape. Don't introduce a new dependency in a type-safety commit.)

**Exact sites** (17 total, 11 files — from `grep -rn "hasFeature(.*as Role\|const role = session.*as Role" src/`):

| File | Sites | Pattern |
|---|---|---|
| `src/app/api/settings/api-keys/route.ts` | 2 | `hasFeature(... as Role)` |
| `src/app/api/settings/api-keys/[id]/route.ts` | 1 | `hasFeature(... as Role)` |
| `src/app/api/crm/email-templates/route.ts` | 2 | `hasFeature(... as Role)` |
| `src/app/api/crm/email-templates/[id]/route.ts` | 2 | `hasFeature(... as Role)` |
| `src/app/api/crm/leads/route.ts` | 2 | `hasFeature(... as Role)` |
| `src/app/api/crm/leads/[id]/touchpoints/route.ts` | 2 | `hasFeature(... as Role)` |
| `src/app/api/crm/leads/[id]/send-email/route.ts` | 1 | `hasFeature(... as Role)` |
| `src/app/api/crm/leads/[id]/route.ts` | 3 | `hasFeature(... as Role)` |
| `src/app/api/crm/scraper-status/route.ts` | 1 | `hasFeature(... as Role)` |
| `src/app/api/crm/leads/[id]/score/route.ts` | 1 | `const role = session!.user.role as Role;` (narrow + replace downstream usages) |
| **Total** | **17 sites, 10 files** | |

**Note**: `src/components/ui/RoleGate.tsx` (1 site: `as Role | undefined`) and `src/lib/server-auth.ts` (2 sites: `role as Role` in a role-validation function) contain `as Role` but NOT the `hasFeature(... as Role)` or `session.user.role as Role` patterns covered by this commit. They're out of scope per the scope bound above.

**Acceptance**:
- `grep -rn "hasFeature(.*as Role" src/` returns 0
- `grep -n "const role = session.*as Role" src/app/api/crm/leads/\[id\]/score/route.ts` returns 0
- `parseRole` unit test added: valid role → `Role`; `undefined` → `null`; `null` → `null`; `""` → `null`; `"nonsense"` → `null`; wrong-case `"ADMIN"` → `null` (case-sensitive match)
- Build + lint + tsc clean
- All existing CRM + settings tests still pass
- Manual smoke: hit one CRM endpoint as admin → 200; as a non-CRM role → 403

---

### Commit 7: `fix(hooks): add onError destructive toast to 46 mutations`

**Problem**: 46 `useMutation` call sites across 21 files don't handle errors. Silent UX failure — #1 anti-pattern per global CLAUDE.md.

**Audit script** (committed at `scripts/audit-mutation-onerror.py` in this commit for future re-use):

```python
#!/usr/bin/env python3
"""Audit useMutation() calls missing onError handlers in src/hooks, src/components, src/app."""
import re, pathlib

SCAN_ROOTS = [pathlib.Path("src/hooks"), pathlib.Path("src/components"), pathlib.Path("src/app")]
# Exclude test files and parent-portal paths. Note: actual dirs are src/app/parent/
# (no parens — not a Next.js route group). No cowork portal dir exists today.
EXCLUDE_PATH_PARTS = ("__tests__", "/parent/")

missing = []
total = 0

for root in SCAN_ROOTS:
    if not root.exists(): continue
    for f in sorted(list(root.rglob("*.ts")) + list(root.rglob("*.tsx"))):
        if any(p in str(f) for p in EXCLUDE_PATH_PARTS) or ".test." in str(f): continue
        src = f.read_text()
        for m in re.finditer(r"useMutation\s*(<[^>]*>)?\s*\(\s*\{", src):
            start = m.start()
            # Find matching close brace
            i = src.index("{", start)
            depth = 0
            end = i
            for j in range(i, len(src)):
                if src[j] == "{": depth += 1
                elif src[j] == "}":
                    depth -= 1
                    if depth == 0: end = j; break
            block = src[start:end+1]
            total += 1
            if "onError" not in block:
                lineno = src[:start].count("\n") + 1
                missing.append((str(f), lineno))

print(f"Total useMutation(object) calls scanned: {total}")
print(f"Missing onError: {len(missing)}")
for f, ln in missing:
    print(f"  {f}:{ln}")

import sys
sys.exit(1 if missing else 0)
```

**Scope bound**: `src/hooks/`, `src/components/`, and `src/app/(dashboard)/**` page files, excluding test paths and `src/app/parent/**` (parent portal). As of baseline, `src/app/parent/` contains 0 `useMutation` calls, so the exclusion is defensive. There is no cowork portal directory in the current codebase.

**Full site list** (46 sites, 21 files):

| File | Sites |
|---|---|
| `src/hooks/useHolidayQuest.ts` | 1 |
| `src/hooks/useParentNotifications.ts` | 1 |
| `src/components/charts/CashFlowChart.tsx` | 1 |
| `src/components/dashboard/DashboardProjectTodos.tsx` | 1 |
| `src/components/projects/ProjectDetailPanel.tsx` | 3 |
| `src/components/rocks/RockDetailPanel.tsx` | 10 |
| `src/components/scorecard/AddMeasurableModal.tsx` | 2 |
| `src/components/services/ServiceChecklistsTab.tsx` | 2 |
| `src/components/services/ServiceIssuesTab.tsx` | 3 |
| `src/components/services/ServiceProgramTab.tsx` | 4 |
| `src/components/services/ServiceQIPTab.tsx` | 2 |
| `src/components/services/ServiceScorecardTab.tsx` | 2 |
| `src/components/services/ServiceTodosTab.tsx` | 1 |
| `src/components/services/WeeklyDataEntry.tsx` | 1 |
| `src/components/settings/BannerManagementSection.tsx` | 2 |
| `src/app/(dashboard)/financials/page.tsx` | 1 |
| `src/app/(dashboard)/help/HelpContent.tsx` | 1 |
| `src/app/(dashboard)/my-portal/page.tsx` | 2 |
| `src/app/(dashboard)/profile/page.tsx` | 2 |
| `src/app/(dashboard)/scorecard/page.tsx` | 1 |
| `src/app/(dashboard)/settings/SettingsContent.tsx` | 4 |
| **Total** | **46 sites, 21 files** |

**Pattern per site** (default):
```ts
useMutation({
  mutationFn: async (...) => { ... },
  // existing onSuccess, etc.
  onError: (err: Error) => {
    toast({ variant: "destructive", description: err.message || "Something went wrong" });
  },
});
```

**Edge case — deliberately silent mutations**: if a mutation is genuinely best-effort background work where user-facing errors aren't warranted (e.g., analytics ping, auto-save to remote store with retry elsewhere), use:
```ts
onError: (err) => {
  if (process.env.NODE_ENV !== "production") console.error("<name> background failed:", err);
},
```
…with a one-line comment explaining why. All such sites MUST be listed in the PR body so the reviewer can audit the decision.

**Acceptance**:
- `python3 scripts/audit-mutation-onerror.py` exits 0 (no missing sites in scope)
- `scripts/audit-mutation-onerror.py` is committed and shebang-executable
- Every new `onError` call has either (a) `variant: "destructive"` toast OR (b) a documented silent-mutation exception listed in PR body
- All 997+ tests still pass
- Build + lint clean

---

### Commit 8: `refactor(api): migrate 247 req.json() sites in 242 files to parseJsonBody()`

**Problem**: 247 sites across 242 files use raw `await req.json()`. Malformed JSON throws unhandled `SyntaxError` → 500. Should be 400 via `parseJsonBody()`.

**Fix** — line-level replacement:

```ts
// Before
const body = await req.json();
// After
const body = await parseJsonBody(req);
```

Ensure `import { parseJsonBody } from "@/lib/api-error";` is present in every modified file.

**Rule — no opportunistic refactoring**: do NOT add `withApiHandler()` wrapping, Zod validation, or error-class conversion. Line-level parser swap only. Other convention migrations are separate sub-projects.

**Codemod**: because the replacement is strictly mechanical across 247 sites, a one-shot codemod is the right tool. Committed at `scripts/one-shots/codemod-parseJsonBody.ts` in this commit (per reviewer recommendation — preserves audit trail).

Codemod pseudocode:
```ts
// For each file under src/app/api/** matching "await req.json":
// 1. Count occurrences
// 2. Replace all occurrences (text replace, idempotent)
// 3. Ensure import { parseJsonBody } from "@/lib/api-error" is present (insert after last import if not)
// 4. Write back
// 5. Log filename + occurrence count
```

**Procedure**:
1. Commit codemod script at `scripts/one-shots/codemod-parseJsonBody.ts` (no refactor yet — just the tool)
2. Run codemod: `npx tsx scripts/one-shots/codemod-parseJsonBody.ts`
3. Run `npm run build` — must succeed
4. Run `npm run lint` — must pass (fix import order if codemod created disorder)
5. Run `npm test -- --run` — must pass
6. Run `npx tsc --noEmit` — must be 0 errors (continues the clean state from commit 5)
7. Manual diff scan: `git diff --stat` — expect ~242 files, small line counts each
8. Git add + commit (includes codemod script + 242 modified files)

**Rollback procedure** (concrete, per reviewer issue #10):
- If step 3/4/5 fails on specific files: identify the failing files from the output
- For each failing file: `git checkout HEAD -- <file>` (reverts just that file to pre-codemod state, keeps the migration for other files)
- Add those files to a `// TODO(hygiene-sweep):` list at the top of the codemod script with the reason
- Commit 8 then ships with N<247 sites migrated; the TODO list goes in the PR body
- No revert PR needed — fewer files migrated doesn't invalidate the successful ones
- If more than 20 files fail, abort the commit entirely — that signals a deeper issue (e.g., `parseJsonBody` incompatibility with some route shape), stop and re-plan

**Acceptance**:
- `grep -rn "await req\.json" src/app/api/` returns 0 (or documented skip-list items per rollback procedure)
- All tests still pass (997+)
- `npm run build`, `npm run lint`, `npx tsc --noEmit` all clean
- `scripts/one-shots/codemod-parseJsonBody.ts` committed (not deleted)
- PR body table: before (247 sites, 242 files) → after (0 sites — or N sites skipped, listed)

**Smoke** (optional but recommended): start dev server, curl a POST endpoint with `Content-Type: application/json` and malformed JSON body → expect 400, not 500.

---

## Testing & verification plan

**Per commit** (run before stacking the next):
```bash
npm run build 2>&1 | tail -10
npm test -- --run 2>&1 | tail -10
npx tsc --noEmit 2>&1 | grep -c "error TS"
npm run lint 2>&1 | tail -10
```
Record outputs. Any regression in test count or tsc count blocks the next commit. Each commit's individual Acceptance section is additive.

**End-of-PR sweep** (before opening PR):
- All 8 commits' acceptance criteria met
- All baseline grep audits return 0 for negative invariants (no raw req.json, no silent catches without comments, no hasFeature-cast pattern, no unlocked crons, no onError gaps in scope)
- CI on the branch is green (unit + integration)
- Manual smoke: dev server boots, login works, at least one route per fix category exercised
- PR body table: before/after counts for each category

## Sequencing rationale (updated)

| Order | Commit | Why this position |
|---|---|---|
| 1 | CI env var fix | Every downstream commit needs CI to verify cleanly |
| 2 | ADMIN_ROLES constant | Tiny warm-up, isolated |
| 3 | Silent catches | ~33 files, real reliability fix, still small |
| 4 | Cron locks | 11 files, template-repeat, easy review |
| 5 | TS error cleanup | Tests-only; lands a clean tsc baseline so commit 6 is verifiable |
| 6 | `hasFeature` role narrowing | Ties in `parseRole` helper; commit 5's clean tsc baseline makes any regression visible |
| 7 | onError toasts | 21 files, mechanical repetition, UX-critical |
| 8 | parseJsonBody migration | 242 files, mechanical, biggest — reviewer's confidence is highest by now |

If a reviewer stops mid-PR or wants to revert anything, the smallest and safest commits are already in, and the biggest mechanical change is most easily revertible standalone.

## Explicitly out of scope

- **Wrapping routes in `withApiHandler()` / `withApiAuth()`**: commit 8 migrates body parsing but does not add handler wrapping. Wrapping is a separate convention sweep.
- **Adding Zod validation**: `parseJsonBody` returns `unknown`. Routes that previously trusted raw JSON still do so after this PR. Zod coverage is a separate sub-project.
- **Broader `as Role` sweep**: commit 6 handles only the `session.user.role as Role` pattern (17 sites — 16 `hasFeature(... as Role)` + 1 `const role = ... as Role`). The remaining ~21 `as Role` sites (form event handlers, component-level `as Role | undefined`, server-auth's role validation) are out of scope — different semantics.
- **All 75 production `as any` casts**: broader `as any` sweep deferred.
- **Parent portal mutation audits** — `src/app/parent/**` `useMutation` sites explicitly excluded from commit 7 (currently 0 sites but defensively gated). No cowork portal directory exists. If parent-portal mutations grow later, they warrant a follow-up sub-project.
- **Rate limit tuning, logger schema changes, new request-ID conventions** — orthogonal.
- **Routes using `FormData` / `req.formData()`** — not affected by `parseJsonBody` migration.
- **Crons already locked (50 of 61)** — already compliant.
- **ADMIN_ROLES in parent portal / cowork portal auth** — separate auth layer, out of scope.
- **Production code TS errors** — baseline shows 0 in prod (post `npx prisma generate`). Commit 5 is tests-only.

## Open questions — resolvable during implementation

1. **Q-B1 (commit 2)**: `ADMIN_ROLES` lives in `src/lib/role-permissions.ts` by default. Escalate only if circular import appears. If the broader 3-role audit surfaces 0 additional inline arrays, commit 2 is just the declaration + 2 call-site fixes (~5 lines).
2. **Q-B2 (commit 5)**: the `MockUser` helper change — if the fix is literally "add `name: "Test User"` to every mock-user fixture in 3 files", do that. If it's "make `name` optional on the `MockUser` type", do that instead. Decision rule: 1-3 fixtures → fix inline; 4+ fixtures → update the type.
3. **Q-B3 (commit 6)**: `parseRole` default return for invalid is `null` (consistent with `parseJsonBody` pattern — parsers return safely, callers decide the error). Callers use `if (!role || !hasFeature(role, "x")) throw ApiError.forbidden()`.
4. **Q-B4 (commit 7)**: deliberately silent mutations documented in the PR body with justification. Escalate to user only if judgment is ambiguous — prefer the destructive toast unless obviously wrong.
5. **Q-B5 (commit 3)**: silent-catch triage — for `src/lib/cache.ts` and `src/lib/ai-task-agent.ts` specifically (library-level code): prefer category (A) `logger.error` unless the function's contract documents that errors are swallowed.

## Acceptance criteria — sub-project done when

- [ ] All 8 commits landed on `hygiene/sweep-2026-04-20` in prescribed order
- [ ] Each commit's individual Acceptance section met
- [ ] Final `npm run build`, `npm test -- --run`, `npx tsc --noEmit` (→ 0 errors), `npm run lint` all clean
- [ ] Baseline grep audits all at 0 or documented skip-list
- [ ] CI green on the branch (unit + integration)
- [ ] PR opened with before/after counts table + per-commit summary + any skip-list items
- [ ] No new features, schema changes, or migrations introduced
- [ ] User reviews and merges PR (standard merge — preserves the 8-commit bisect history per roadmap convention)

## Risks & mitigations

- **Commit 8 (242 files) breaks on a specific route**: per rollback procedure above — isolate failing files, revert only those, document in PR body. Abort only if >20 files fail.
- **CI red after commit 1**: the fix uncovers a second unrelated CI failure — fix only what's caused by our changes; defer the rest to a follow-up.
- **Codemod in commit 8 mis-handles a file shape**: manual `git diff --stat` review before committing; codemod is committed to `scripts/one-shots/` so reviewers can audit it alongside the diff.
- **onError edge cases in commit 7**: silent-mutation exceptions enumerated in PR body.
- **Commit 5 scope creep from tsc surprises**: if tsc error count grows after `npx prisma generate` cleared the local cache, the 26-error target is a lower bound — the real count drives the work, but the bound on scope (tests-only) is absolute.
- **Silent-catch triage (commit 3) drift**: the 46-site count is the floor; if any site was incorrectly categorized (e.g., a client-side effect that should have been server-logged), flag in PR body — review before merge.

## Rollback

Each commit is `git revert`-safe standalone. Worst-case: the PR is reverted as a whole via the merge-commit revert. No migrations, no schema, no DB writes introduced.

---

*Document conventions per `docs/superpowers/specs/2026-04-20-dashboard-bugfix-roadmap.md`. Implementation plan will live at `docs/superpowers/plans/2026-04-20-hygiene-sweep-plan.md`.*
