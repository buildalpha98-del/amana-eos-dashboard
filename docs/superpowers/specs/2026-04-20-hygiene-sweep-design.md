# Sub-project 2 — Hygiene Sweep

**Date**: 2026-04-20
**Status**: Draft
**Parent roadmap**: [`2026-04-20-dashboard-bugfix-roadmap.md`](./2026-04-20-dashboard-bugfix-roadmap.md)
**Predecessor**: Sub-project 1 P0 Bug Batch (merged as `dd0a1d9`)

## Overview

Systemic convention-compliance sweep across the codebase. Eight categories of hygiene debt surfaced by the Sub-project 0 audit and the Sub-project 1 review. One feature branch, one PR, **eight stacked commits in smallest-blast-radius-first order**. Each commit is independently revert-safe. No new features, no schema changes, no module rebuilds — strictly applying already-established conventions to existing code.

**Branch**: `hygiene/sweep-2026-04-20` off `origin/main` at `dd0a1d9`
**Worktree**: `.worktrees/hygiene-sweep`
**Starting baseline**: 997 tests passing, ~60 `tsc --noEmit` errors (all in test files), 245 routes using raw `req.json()`, 11 crons lacking `acquireCronLock`, 46 mutations lacking `onError` toasts, 20 `as Role` casts across 8 files, 5 silent `.catch(() => {})` sites, CI integration tests failing on main due to missing `DATABASE_URL_UNPOOLED` env var.
**Target end state**: 997+ tests passing, 0 `tsc --noEmit` errors, 0 raw `req.json()`, 0 unlocked crons, 0 mutations lacking `onError`, 0 `as Role` casts in touched files, 0 silent catches, CI green.

## In scope — 8 stacked commits

| # | Commit subject | Category | Blast radius | Files touched |
|---|---|---|---|---|
| 1 | `fix(ci): add DATABASE_URL_UNPOOLED to test workflow env` | Infrastructure | 1 workflow file | 2 |
| 2 | `refactor(auth): extract ADMIN_ROLES constant` | Code quality | Single constant + callsites | 5–8 |
| 3 | `fix(errors): replace silent .catch(() => {}) with logger.error` | Reliability | 3 confirmed files | 3 |
| 4 | `fix(cron): add acquireCronLock to 11 missing crons` | Reliability | Cron surface | 11 |
| 5 | `refactor(auth): replace session.user.role as Role with safe narrowing` | Type safety | 8 files, 20 casts | 13 |
| 6 | `fix(tests): resolve ~60 TS errors in test files` | Type safety | Tests only | 15–25 |
| 7 | `fix(hooks): add onError destructive toast to 46 mutations` | UX reliability | 22 files | 22 |
| 8 | `refactor(api): migrate 245 routes from req.json() to parseJsonBody()` | Error handling | Full API surface | 245 |

Rule: if a commit breaks CI, fix it before stacking the next — no piling broken commits.

---

### Commit 1: `fix(ci): add DATABASE_URL_UNPOOLED to test workflow env`

**Problem**: `prisma/schema.prisma:8` uses `directUrl = env("DATABASE_URL_UNPOOLED")`. `.github/workflows/test.yml` integration and e2e jobs set `DATABASE_URL` but never set `DATABASE_URL_UNPOOLED`. Integration tests on main fail because Prisma can't resolve `directUrl`.

**Fix**:
- `.github/workflows/test.yml`: add `DATABASE_URL_UNPOOLED: postgresql://test:test@localhost:5432/amana_eos_test` to the `integration` job env block (after line 73) and the `e2e` job env block (after line 120). Same value as `DATABASE_URL` — in CI's local Postgres there is no pooler so direct = pooled.
- `.env.example`: add a commented line documenting the var right after the `DATABASE_URL=` line.

**Acceptance**: Next GitHub Actions run on this branch reaches test execution without the Prisma directUrl error. The integration job either passes or fails on legitimate test reasons.

---

### Commit 2: `refactor(auth): extract ADMIN_ROLES constant`

**Problem**: `["admin", "head_office", "owner"]` is repeated as an inline string-array in many route-handler `withApiAuth({ roles: [...] })` calls. Flagged during the Sub-project 1 bug #14 review. Drift risk — if one site adds a new admin role and others don't, we silently diverge.

**Fix**: Add `export const ADMIN_ROLES = ["admin", "head_office", "owner"] as const;` to `src/lib/role-permissions.ts` (or a new `src/lib/auth-constants.ts` if circular import). Replace inline arrays at call sites.

**Acceptance**: `grep -rn '\["admin",\s*"head_office",\s*"owner"\]' src/app/ src/lib/ src/components/` returns only the `ADMIN_ROLES` declaration. No duplicated inline admin-role arrays in routes.

---

### Commit 3: `fix(errors): replace silent .catch(() => {}) with logger.error`

**Problem**: Five call sites discard errors from fire-and-forget async operations. Real failures vanish.

**Fix** — exact sites:
- `src/app/api/tickets/[id]/route.ts:142` — email notify
- `src/app/api/tickets/[id]/route.ts:152` — SMS notify
- `src/app/api/bookings/[id]/approve/route.ts:42` — `sendBookingConfirmedNotification(bookingId)`
- `src/app/api/crm/leads/[id]/route.ts:130` — `scheduleCrmSequence(id, newStage)`

Pattern per site:
```ts
// Before
sendX(args).catch(() => {});
// After
sendX(args).catch((err) => logger.error("sendX failed", { err, <contextIds> }));
```

Include the logger import if missing. Route handlers already have request-ID context via wrapper.

**Acceptance**: `grep -rn "\.catch(() => {})" src/` returns 0. No existing tests break (logging is observational).

---

### Commit 4: `fix(cron): add acquireCronLock to 11 missing crons`

**Problem**: 11 cron routes run without idempotency locks. A duplicate Vercel cron invocation (or manual replay) can corrupt state.

**Fix** — 11 routes, template from `src/app/api/cron/owna-sync/route.ts`:

```ts
const periodKey = /* date / date+hour / year+month — per cron */;
const guard = await acquireCronLock(`<cron-name>-${periodKey}`, "<period>");
if (!guard.acquired) return NextResponse.json({ message: guard.reason, skipped: true });

try {
  // existing work
  await guard.complete({ /* metrics */ });
  return NextResponse.json({ /* result */ });
} catch (err) {
  await guard.complete({ error: String(err) });
  throw err;
}
```

Period choice per cron:

| Cron | Period | Key shape |
|---|---|---|
| `cleanup-tokens` | daily | `YYYY-MM-DD` |
| `document-expiry` | daily | `YYYY-MM-DD` |
| `social-sync` | daily | `YYYY-MM-DD` |
| `health` | daily | `YYYY-MM-DD` |
| `auto-onboarding` | daily | `YYYY-MM-DD` |
| `enquiry-alerts` | hourly | `YYYY-MM-DD-HH` |
| `enquiry-auto-cold` | hourly | `YYYY-MM-DD-HH` |
| `waitlist-expiry` | hourly | `YYYY-MM-DD-HH` |
| `unactioned-bookings` | hourly | `YYYY-MM-DD-HH` |
| `attendance-to-financials` | daily | `YYYY-MM-DD` |
| `financials-monthly-rollup` | monthly | `YYYY-MM` |

**Acceptance**:
- All 62 cron routes in `src/app/api/cron/` have `acquireCronLock`
- Calling any of these crons twice within the same period returns `{ skipped: true }` on the second call
- No cron's existing success path is broken

---

### Commit 5: `refactor(auth): replace session.user.role as Role with safe narrowing`

**Problem**: 20 `as Role` casts across 8 files assume `session.user.role` is always a valid Prisma `Role` enum value. If a corrupt session arrives, the cast silently proceeds and downstream permission checks may return unexpected results.

**Fix**: Introduce a runtime helper in `src/lib/role-permissions.ts`:

```ts
import { Role } from "@prisma/client";

export function parseRole(value: unknown): Role | null {
  if (typeof value !== "string") return null;
  return (Object.values(Role) as string[]).includes(value) ? (value as Role) : null;
}
```

Replace each call site:
```ts
// Before
if (!hasFeature(session!.user.role as Role, "crm.view")) { ... }
// After
const role = parseRole(session!.user.role);
if (!role || !hasFeature(role, "crm.view")) throw ApiError.forbidden();
```

Exact sites (13 files, 20 casts):

| File | Sites |
|---|---|
| `src/app/api/settings/api-keys/route.ts` | 2 (lines 26, 51) |
| `src/app/api/settings/api-keys/[id]/route.ts` | 1 (line 10) |
| `src/app/api/crm/email-templates/route.ts` | 2 (lines 33, 46) |
| `src/app/api/crm/email-templates/[id]/route.ts` | 2 (lines 33, 86) |
| `src/app/api/crm/leads/route.ts` | 2 (lines 37, 93) |
| `src/app/api/crm/leads/[id]/touchpoints/route.ts` | 2 (lines 20, 39) |
| `src/app/api/crm/leads/[id]/score/route.ts` | 1 (line 18) |
| `src/app/api/crm/leads/[id]/send-email/route.ts` | 1 (line 28) |
| `src/app/api/crm/leads/[id]/route.ts` | 3 (lines 43, 73, 176) |
| `src/app/api/crm/scraper-status/route.ts` | 1 (line 9) |
| `src/app/(dashboard)/settings/SettingsContent.tsx` | 1 (line 237 — `e.target.value as Role` in a `<select>` onChange; narrow with `parseRole` and guard) |
| `src/app/(dashboard)/activity-library/page.tsx` | 1 (line 79) |
| `src/app/(dashboard)/contracts/page.tsx` | 1 (line 775) |

**Acceptance**:
- `grep -rn "as Role" src/app src/components src/hooks | grep -v __tests__` returns 0 (helper's own narrowing does not count — it's a cast inside the helper, but expressed as a narrowed return)
- All existing CRM + settings tests still pass
- New unit test for `parseRole`: valid role → Role, `undefined`/`null`/`""`/`"nonsense"` → null

---

### Commit 6: `fix(tests): resolve ~60 TS errors in test files`

**Problem**: `npx tsc --noEmit` currently reports ~60 errors, all in test files (~20 pre-existing + ~40 introduced by Sub-project 1). CI does not run tsc today but this should be 0 as a baseline.

**Fix classes**:
- **MockUser typing** — align mock-user shapes with current Prisma `User` shape. Recent schema added `parentContactId`, `coordinatorIds`, and related fields.
- **BlobPart** — test fixtures calling `new Blob([data])` where `data` is `ArrayBuffer | Buffer` and doesn't satisfy `BlobPart[]`.
- **`role as any` in tests** — replace with proper `Role` literal types.

**Approach**: run `npx tsc --noEmit 2>&1 > /tmp/tsc.log` once, group errors by root cause, fix root causes (often one helper fix cascades to many files). Production code MUST NOT change in this commit.

**Acceptance**:
- `npx tsc --noEmit` → exit 0, 0 errors
- All 997+ tests still pass
- No files in `src/app`, `src/components`, `src/hooks`, or `src/lib` touched

---

### Commit 7: `fix(hooks): add onError destructive toast to 46 mutations`

**Problem**: 46 `useMutation` call sites across 22 files do not handle errors, so mutation failures are silent and the user sees stale UI with no explanation. #1 UX regression per global CLAUDE.md.

**Full site list** (from audit script, 2026-04-20):

| File | Site count |
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
| **Total** | **46** |

**Pattern per site**:
```ts
useMutation({
  mutationFn: async (...) => { ... },
  // existing onSuccess, etc.
  onError: (err: Error) => {
    toast({ variant: "destructive", description: err.message || "Something went wrong" });
  },
});
```

**Edge case**: if a mutation is *intentionally* silent (best-effort background work), add an explicit comment + log-only handler instead of a destructive toast:
```ts
onError: (err) => {
  if (process.env.NODE_ENV !== "production") console.error("<name> background mutation failed:", err);
},
```
These cases must be flagged to the user in the PR description so the choice is reviewable.

**Acceptance**:
- Re-run the audit script → 0 mutations missing `onError`
- Every toast call uses `variant: "destructive"` and has a non-empty `description`
- Mutations deliberately silent are documented with a code comment + listed in PR body

---

### Commit 8: `refactor(api): migrate 245 routes from req.json() to parseJsonBody()`

**Problem**: 245 API route handlers parse JSON bodies with raw `await req.json()`. If the client sends malformed JSON, this throws an unhandled `SyntaxError` that becomes a 500 Internal Server Error — should be 400 Bad Request.

**Fix** — line-level replacement in every file under `src/app/api/` that contains `await req.json()`:

```ts
// Before
const body = await req.json();
// After
const body = await parseJsonBody(req);
```

Ensure `import { parseJsonBody } from "@/lib/api-error";` is present (it's the canonical export path per the file definition).

**Rule — no opportunistic refactoring**: do NOT add `withApiHandler()` wrapping, Zod validation, or error-class conversion in this commit. This is a line-level parser swap only. Those other migrations are separate sub-projects.

**Approach**:
1. Generate the list of 245 files with `grep -rl "await req\.json" src/app/api/`
2. Write a codemod script (`scripts/codemod-parseJsonBody.ts`) that reads each file, replaces the pattern, adds the import if missing, writes back
3. Run on all files
4. Manually review the diff (245 files but uniform shape — scan for any file where the replacement is incorrect, e.g. `const body: SomeShape = await req.json()` where the type annotation needs to stay)
5. Run `npm run build` — must succeed
6. Run `npm test -- --run` — must pass
7. Delete the codemod script before commit (one-shot tool, not source code)

**Acceptance**:
- `grep -rn "await req\.json" src/app/api/` returns 0
- All tests still pass (997+)
- Build clean, lint clean, tsc clean
- API smoke: POST a route with malformed JSON → 400 (not 500)
- No route's existing behavior on valid JSON changed

---

## Testing & verification plan

**Per commit** (run before stacking the next):
```bash
npm run build
npm test -- --run
npx tsc --noEmit
npm run lint
```
Record outputs. Any regression in test count or tsc count blocks the next commit.

**Additional per-commit checks** (see each commit's Acceptance section).

**End-of-PR sweep** (before opening PR):
- All 8 commits' acceptance criteria met
- `grep` audits: 0 raw `req.json`, 0 silent catches, 0 `as Role` in touched code, 0 missing onError, 0 unlocked crons
- CI on the branch is green (unit + integration)
- Manual smoke: dev server boots, at least one route per fix category exercised in browser
- PR body table: before/after counts for each category

## Sequencing rationale

Ordering by blast radius (smallest → largest) protects the bisect history and the reviewer:
1. **CI first** (commit 1) so every downstream commit is actually verified on CI
2. **Constant extraction** (commit 2) — tiny, a warm-up
3. **Silent catches** (commit 3) — 5 sites, real bug fix, low risk
4. **Cron locks** (commit 4) — same template 11×, reliability win
5. **Type safety cast fixes** (commit 5) — 20 sites, narrow scope, isolated to CRM + settings
6. **Test TS errors** (commit 6) — tests only, pre-work for confident regression on the big commits
7. **Mutation onError** (commit 7) — 46 sites, mechanical, high UX value
8. **parseJsonBody migration** (commit 8) — 245 files, the biggest. Reviewer has built confidence in everything before this.

If a reviewer stops mid-PR or wants to revert anything, the smallest and safest commits are already in, and the biggest mechanical change is most easily revertible standalone.

## Explicitly out of scope

- **Wrapping routes in `withApiHandler()` / `withApiAuth()`**: commit 8 migrates body parsing but does not add handler wrapping. Wrapping is a separate convention sweep.
- **Adding Zod validation**: `parseJsonBody` returns `unknown`. Routes that previously trusted `await req.json()` without Zod still do so after this PR. Adding Zod is a separate sub-project.
- **All 75 `as any` casts in production**: commit 5 only touches the 20 `as Role` sites and the auth/CRM files flagged. Broader `as any` sweep deferred.
- **Parent portal + cowork portal mutation audits** — if additional `useMutation` sites without `onError` exist in `src/app/(parent)` or `src/app/(cowork)` beyond the 46 counted, they're flagged for a future sweep (not held to block this PR).
- **Rate limit tuning, logger schema changes, new request-ID conventions** — orthogonal.
- **Routes using `FormData` / `req.formData()`** — not affected by `parseJsonBody` migration.
- **Acquiring locks on cron routes already locked (58 of 62)** — they're already compliant.
- **ADMIN_ROLES in parent portal / cowork portal auth** — separate auth layer; in scope only if the exact same inline array is used there.

## Open questions — resolve during implementation

1. **Q-B1 (commit 2)**: place `ADMIN_ROLES` in `src/lib/role-permissions.ts` or a new `src/lib/auth-constants.ts`? Default: `role-permissions.ts`. Escalate only if circular import appears.
2. **Q-B2 (commit 4)**: confirm exact period-enum values accepted by `acquireCronLock(key, period)` in `src/lib/cron-guard.ts` before picking template. If the helper accepts only `"daily" | "hourly"`, the `financials-monthly-rollup` cron needs a custom key (e.g. `YYYY-MM-01`-style daily key that skips all days except the first).
3. **Q-B3 (commit 5)**: `parseRole` return type — `Role | null` (silent) or throw on invalid. Decision: return `Role | null`, let callers decide the 403 shape, consistent with existing `parseJsonBody` pattern (parser returns safely; caller decides the error).
4. **Q-B4 (commit 7)**: if any of the 46 mutations are deliberately silent, document each case in the PR body with reasoning. Escalate to user only if unclear.
5. **Q-B5 (commit 8)**: `parseJsonBody` is exported from `src/lib/api-error.ts`. Keep that import path. If a file already uses `@/lib/api-handler` for `ApiError`, add a separate import from `@/lib/api-error` — don't re-export.
6. **Q-B6 (commit 6)**: scope of test TS errors might exceed ~60 once real tsc is run. If the number is materially different (±30%), flag count but proceed to 0 regardless.

## Acceptance criteria (sub-project done when)

- [ ] All 8 commits landed on `hygiene/sweep-2026-04-20` in the prescribed order
- [ ] Each commit satisfies its own Acceptance section
- [ ] `npm run build` + `npm test` + `npx tsc --noEmit` + `npm run lint` all clean at HEAD
- [ ] Baseline grep audits all return 0 for their negative invariants
- [ ] CI green on the branch (unit + integration)
- [ ] PR opened with a before/after counts table and a per-commit summary
- [ ] No new features, no schema changes, no new migrations introduced
- [ ] User reviews and merges PR (standard merge, not squash — preserves the 8-commit bisect history per roadmap convention)

## Risks & mitigations

- **Commit 8 (245 files) breaks a specific route**: isolate the route's hunk, revert that one file, continue with the other 244, add a `TODO` note, flag in PR body. Do not block the whole commit on a single route.
- **CI red after commit 1**: if the DATABASE_URL_UNPOOLED fix uncovers a second unrelated CI failure, fix only what's caused by our changes; flag the rest as a follow-up.
- **Codemod error in commit 8**: manual review of the 245-file diff before committing; codemod is one-shot (not merged to source).
- **onError edge cases in commit 7**: deliberately-silent mutations documented in the PR body for reviewability.
- **Commit 6 scope creep**: tsc error list may reveal production-code TS errors mixed in. If so, split — commit 6 fixes only test-file errors; any production TS errors are deferred to a separate commit (breaks "tests-only" principle but preserves the commit's review scope).

## Rollback

Each commit is `git revert`-safe standalone. Worst-case: the PR is reverted as a whole via the merge-commit revert. No migrations, no schema, no DB writes introduced.

---

*Document conventions per `docs/superpowers/specs/2026-04-20-dashboard-bugfix-roadmap.md`. Implementation plan will live at `docs/superpowers/plans/2026-04-20-hygiene-sweep-plan.md`.*
