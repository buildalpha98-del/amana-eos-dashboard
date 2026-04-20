# Hygiene Sweep — Implementation Plan

> **For agentic workers:** REQUIRED: Use `superpowers:subagent-driven-development` (if subagents available) or `superpowers:executing-plans` to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship 8 stacked commits on one feature branch that bring the codebase into convention compliance — fixing CI env var, extracting the `ADMIN_ROLES` constant (scoped), replacing 46 silent catches, locking 10 crons (health excluded — it's a UI endpoint), clearing 26 TS errors, narrowing 17 unsafe `as Role` casts, adding 46 missing `onError` toasts, and migrating 247 `req.json()` sites to `parseJsonBody()` — without breaking 997 tests.

**Architecture:** One feature branch (`hygiene/sweep-2026-04-20`) off local `main` HEAD (which has the reviewer-approved spec+plan docs on top of `origin/main@dd0a1d9`). Docs and implementation ship in one PR, matching Sub-project 1's pattern. Commits stacked smallest-blast-radius-first so CI gates the smaller changes before the 242-file migration lands. Each commit independently revert-safe. Standard merge (not squash) to preserve bisect history. Mechanical changes at scale use codemods (committed to `scripts/one-shots/` for audit trail).

**Tech Stack:** Next.js 16, TypeScript, Prisma 5.22 (`npx prisma generate` required after pulling), Vitest, GitHub Actions CI, Tailwind. Existing conventions: `withApiAuth` / `withApiHandler` / `parseJsonBody` / `ApiError` / `acquireCronLock` / `logger`.

**Parent spec:** [`docs/superpowers/specs/2026-04-20-hygiene-sweep-design.md`](../specs/2026-04-20-hygiene-sweep-design.md)

---

## File Structure Overview

| Commit | Category | Files touched (approx.) |
|---|---|---|
| 1 | CI infra | `.github/workflows/test.yml`, `.env.example` (2 files) |
| 2 | Code quality | `src/lib/role-permissions.ts` (add export), `src/app/api/owna/centres/route.ts`, `src/app/api/owna/test/route.ts`, `src/app/(dashboard)/policies/page.tsx`, `src/app/(dashboard)/getting-started/GettingStartedContent.tsx`, `src/app/(dashboard)/guides/GuidesContent.tsx` (6 files) |
| 3 | Reliability | 33 files across `src/app/api/**`, `src/lib/**`, `src/components/**`, `src/app/parent/**`, `src/app/(dashboard)/**` (see commit 3 task for full list) |
| 4 | Reliability | 10 cron route files under `src/app/api/cron/**` (health excluded — UI endpoint) |
| 5 | Type safety | 10 test files under `src/__tests__/**` + 1 under `tests/integration/**` + potentially `src/__tests__/helpers/auth-mock.ts` |
| 6 | Type safety | 10 files (`src/app/api/settings/api-keys/**`, `src/app/api/crm/**`) + `src/lib/role-permissions.ts` (add `parseRole`) + new test file |
| 7 | UX reliability | 21 files across `src/hooks/**`, `src/components/**`, `src/app/(dashboard)/**` + `scripts/audit-mutation-onerror.py` (new) |
| 8 | Error handling | 242 files under `src/app/api/**` + `scripts/one-shots/codemod-parseJsonBody.ts` (new) |

No Prisma migrations. No new nav routes. No schema changes. One new import path (`parseRole` from `@/lib/role-permissions`), one new shared constant (`ADMIN_ROLES`), one new helper script directory (`scripts/one-shots/` + `scripts/`).

---

## Chunk 1: Setup & Baseline

### Task 1.1: Sync main and create worktree branch

- [ ] **Step 1: Fetch latest main**

Run: `git fetch origin`
Expected: fetches without error; may show new branches.

- [ ] **Step 2: Confirm origin/main is at dd0a1d9 and local main is ahead with docs only**

Run: `git log origin/main --oneline -1` → expected: `dd0a1d9 fix: P0 bug batch — 15 user-reported bugs + security fix`
Run: `git log main..origin/main` → expected: empty (origin/main is an ancestor of local main)
Run: `git log origin/main..main --oneline` → expected: 7 docs-only commits (spec iterations + plan iterations)
If origin/main is ahead of local main, or if local main has non-docs commits ahead of origin/main, stop and escalate.

- [ ] **Step 3: Create the worktree off local main HEAD**

Run: `git worktree add -b hygiene/sweep-2026-04-20 .worktrees/hygiene-sweep main`
Expected: new worktree at `.worktrees/hygiene-sweep/` on new branch `hygiene/sweep-2026-04-20` tracking local `main` HEAD. This ensures the feature branch INCLUDES the reviewer-approved spec+plan docs — they ship with the implementation in one PR.

- [ ] **Step 4: Switch into the worktree for all subsequent work**

Run: `cd .worktrees/hygiene-sweep`
All remaining steps run from here. The rest of this plan assumes `pwd` ends in `.worktrees/hygiene-sweep`.

- [ ] **Step 5: Install dependencies + regenerate Prisma client in the worktree**

Run:
```bash
npm ci
npx prisma generate
```
Expected: `npm ci` installs cleanly; `prisma generate` prints `✔ Generated Prisma Client`.
The regenerate is mandatory — without it, `tsc` reports bogus errors against stale VapiCall types.

### Task 1.2: Capture baseline metrics

- [ ] **Step 1: Run build baseline**

Run: `npm run build 2>&1 | tail -15`
Record: build result (pass/fail) in a scratch file `/tmp/hygiene-baseline.txt`.
Expected: build succeeds with possible warnings.

- [ ] **Step 2: Run unit test baseline**

Run: `npm test -- --run 2>&1 | tail -10`
Record: passing test count in `/tmp/hygiene-baseline.txt` — should be around 997.
Expected: `Test Files NN passed (NN)`, `Tests 997 passed (997)` or similar — exact number recorded.

- [ ] **Step 3: Run tsc baseline**

Run: `npx tsc --noEmit 2>&1 | grep -c "error TS"`
Record: TS error count in `/tmp/hygiene-baseline.txt` — should be 26.
Expected: `26`.

- [ ] **Step 4: Run lint baseline**

Run: `npm run lint 2>&1 | tail -10`
Record: lint result in `/tmp/hygiene-baseline.txt`.
Expected: passes (or known-pre-existing warnings — note them).

- [ ] **Step 5: Verify baseline grep counts match the spec**

Run each and confirm the count:
```bash
# req.json sites: expected 247
grep -rn "await req\.json" src/app/api/ 2>/dev/null | wc -l

# req.json files: expected 242
grep -rl "await req\.json" src/app/api/ 2>/dev/null | wc -l

# silent catches: expected 46 sites in 33 files
grep -rn "\.catch(() *=> *{})" src/ 2>/dev/null | wc -l
grep -rl "\.catch(() *=> *{})" src/ 2>/dev/null | wc -l

# unlocked crons: expected 11 (10 in-scope + health which is not a real cron)
for f in src/app/api/cron/*/route.ts; do
  grep -L acquireCronLock "$f" 2>/dev/null
done | wc -l

# hasFeature(... as Role) sites: expected 16
grep -rn "hasFeature(.*as Role" src/ 2>/dev/null | wc -l
```
If any number differs by more than ±2 from the spec's baseline, STOP and escalate — the codebase has drifted and the plan's counts need re-verification.

- [ ] **Step 6: Commit baseline record (in tmp, not repo)**

The `/tmp/hygiene-baseline.txt` file is a local scratch file and is NOT committed. Keep it around for the duration of the work.

No git commits in Chunk 1 — setup only.

---

## Chunk 2: Commit 1 — CI env var fix

### Task 2.1: Add `DATABASE_URL_UNPOOLED` to workflow + env.example

**Problem:** `prisma/schema.prisma` line 8 uses `directUrl = env("DATABASE_URL_UNPOOLED")`. CI workflow sets `DATABASE_URL` but never `DATABASE_URL_UNPOOLED`, so integration tests fail on main.

**Files:**
- Modify: `.github/workflows/test.yml`
- Modify: `.env.example`

- [ ] **Step 1: Read current workflow state**

Run: `grep -n "DATABASE_URL" .github/workflows/test.yml`
Expected: shows two `DATABASE_URL: postgresql://test:test@localhost:5432/amana_eos_test` lines (one in integration job env, one in e2e job env) and no `DATABASE_URL_UNPOOLED` lines.

- [ ] **Step 2: Add DATABASE_URL_UNPOOLED to the integration job**

Use the Edit tool. Find the integration job env block that looks like:
```yaml
    env:
      DATABASE_URL: postgresql://test:test@localhost:5432/amana_eos_test
      NEXTAUTH_SECRET: test-secret
      CRON_SECRET: test-cron-secret
      COWORK_API_KEY: test-cowork-api-key
```

Replace with:
```yaml
    env:
      DATABASE_URL: postgresql://test:test@localhost:5432/amana_eos_test
      DATABASE_URL_UNPOOLED: postgresql://test:test@localhost:5432/amana_eos_test
      NEXTAUTH_SECRET: test-secret
      CRON_SECRET: test-cron-secret
      COWORK_API_KEY: test-cowork-api-key
```

- [ ] **Step 3: Add DATABASE_URL_UNPOOLED to the e2e job**

Find the e2e job env block:
```yaml
    env:
      DATABASE_URL: postgresql://test:test@localhost:5432/amana_eos_test
      NEXTAUTH_SECRET: test-secret
      NEXTAUTH_URL: http://localhost:3000
      CRON_SECRET: test-cron-secret
      COWORK_API_KEY: test-cowork-api-key
      PLAYWRIGHT_BASE_URL: http://localhost:3000
```

Replace with:
```yaml
    env:
      DATABASE_URL: postgresql://test:test@localhost:5432/amana_eos_test
      DATABASE_URL_UNPOOLED: postgresql://test:test@localhost:5432/amana_eos_test
      NEXTAUTH_SECRET: test-secret
      NEXTAUTH_URL: http://localhost:3000
      CRON_SECRET: test-cron-secret
      COWORK_API_KEY: test-cowork-api-key
      PLAYWRIGHT_BASE_URL: http://localhost:3000
```

- [ ] **Step 4: Verify anchor-based count**

Run: `grep -c "DATABASE_URL" .github/workflows/test.yml`
Expected: 4 (2 DATABASE_URL entries + 2 DATABASE_URL_UNPOOLED entries).

- [ ] **Step 5: Update .env.example**

Read `.env.example` with `head -5` to see the current top.

Use Edit tool to find:
```
DATABASE_URL=postgresql://postgres:password@localhost:5432/amana_eos
```

Replace with:
```
DATABASE_URL=postgresql://postgres:password@localhost:5432/amana_eos
# Prisma directUrl — bypasses connection pooler for migrations (CI/local: same as DATABASE_URL)
DATABASE_URL_UNPOOLED=postgresql://postgres:password@localhost:5432/amana_eos
```

- [ ] **Step 6: Build + test gate**

Run:
```bash
npm run build 2>&1 | tail -5
npm test -- --run 2>&1 | tail -5
npx tsc --noEmit 2>&1 | grep -c "error TS"
```
Expected: build passes, 997 tests still pass, 26 TS errors (unchanged — commit 1 does not touch src code).

- [ ] **Step 7: Commit**

```bash
git add .github/workflows/test.yml .env.example
git commit -m "$(cat <<'EOF'
fix(ci): add DATABASE_URL_UNPOOLED to test workflow env

prisma/schema.prisma uses directUrl = env("DATABASE_URL_UNPOOLED"), but
the integration and e2e jobs only set DATABASE_URL. Add the unpooled
URL (same value for CI's local Postgres) so Prisma can resolve directUrl
and db push succeeds.

Also document the var in .env.example.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Chunk 3: Commit 2 — ADMIN_ROLES constant (scoped)

### Task 3.1: Add `ADMIN_ROLES` export to role-permissions lib

**Problem:** Three page files declare their own local `ADMIN_ROLES` constant and 2 owna routes use an inline array. Consolidate to a shared export. The ~178 `withApiAuth` sites are OUT OF SCOPE.

**Files:**
- Modify: `src/lib/role-permissions.ts`

- [ ] **Step 1: Read the current role-permissions file**

Run: `head -30 src/lib/role-permissions.ts`
Expected: see existing `Role` import from `@prisma/client` and existing constants.

- [ ] **Step 2: Add the export near the top of the file**

Use Edit. Find the existing imports block and add, immediately after the Role import:

```typescript
/**
 * The set of roles considered "admin" for page-level and feature-level access.
 * Owner, head_office, admin — consolidated to prevent drift across call sites.
 */
export const ADMIN_ROLES = ["owner", "admin", "head_office"] as const;
```

(Place it right after the last top-of-file import but before the first function/const declaration.)

- [ ] **Step 3: Verify build still passes**

Run: `npx tsc --noEmit 2>&1 | grep -c "error TS"`
Expected: 26 (unchanged — declaring a constant doesn't introduce errors).

### Task 3.2: Replace 2 owna inline sites

**Files:**
- Modify: `src/app/api/owna/centres/route.ts:37`
- Modify: `src/app/api/owna/test/route.ts:27`

- [ ] **Step 1: Read owna/centres/route.ts:37**

Run: `sed -n '30,45p' src/app/api/owna/centres/route.ts`
Expected: see `}, { roles: ["owner", "admin", "head_office"] });` as the last line of the wrapper call.

- [ ] **Step 2: Replace in owna/centres**

Use Edit to find:
```ts
}, { roles: ["owner", "admin", "head_office"] });
```
Replace with:
```ts
}, { roles: [...ADMIN_ROLES] });
```

Add the import at top of file if not present:
```ts
import { ADMIN_ROLES } from "@/lib/role-permissions";
```

- [ ] **Step 3: Replace in owna/test**

Same procedure on `src/app/api/owna/test/route.ts:27`. Import the constant at the top.

- [ ] **Step 4: Verify build + type**

Run: `npx tsc --noEmit 2>&1 | grep -c "error TS"`
Expected: 26 (unchanged).

### Task 3.3: Consolidate 3 local `ADMIN_ROLES` declarations

**Files:**
- Modify: `src/app/(dashboard)/policies/page.tsx:42`
- Modify: `src/app/(dashboard)/getting-started/GettingStartedContent.tsx:56`
- Modify: `src/app/(dashboard)/guides/GuidesContent.tsx:12`

- [ ] **Step 1: Fix policies/page.tsx**

Read the relevant lines: `sed -n '38,50p' src/app/(dashboard)/policies/page.tsx`. Replace:
```tsx
const ADMIN_ROLES: string[] = ["owner", "admin", "head_office"];
```
With an import (add to top of file) and remove the local const:
```tsx
import { ADMIN_ROLES } from "@/lib/role-permissions";
```
Then audit how `ADMIN_ROLES` is used in this file — it's a `string[]` used in `.includes(role)` checks. The imported `readonly ["owner", "admin", "head_office"]` tuple is assignable to `readonly string[]` for `.includes()`, but TS may complain about widening. If TS complains, wrap: `const ADMIN_ROLES_SET = new Set<string>(ADMIN_ROLES);` and use `.has(role)` — OR type the usage site explicitly.

- [ ] **Step 2: Fix getting-started/GettingStartedContent.tsx**

Read: `sed -n '50,65p' src/app/(dashboard)/getting-started/GettingStartedContent.tsx`. Same pattern — remove local const, add import.

- [ ] **Step 3: Fix guides/GuidesContent.tsx**

Read: `sed -n '8,20p' src/app/(dashboard)/guides/GuidesContent.tsx`. Current form: `const ADMIN_ROLES = new Set<string>(["owner", "admin", "head_office"]);` — returns a Set used with `.has()`.

Rename the local const to `ADMIN_ROLE_SET` to avoid collision with the shared export AND satisfy the spec's acceptance grep (`grep -rn "const ADMIN_ROLES" src/app/` must return 0):

```tsx
// at top of file (add import):
import { ADMIN_ROLES } from "@/lib/role-permissions";

// replace the local const declaration:
const ADMIN_ROLE_SET = new Set<string>(ADMIN_ROLES);
```

Then use Grep to find every `ADMIN_ROLES.has(` usage in this file and rename to `ADMIN_ROLE_SET.has(`. Search-and-replace must be scoped to this file ONLY.

- [ ] **Step 4: Check for any other hits I might have missed**

Run: `grep -rn "const ADMIN_ROLES" src/app/ src/components/ src/hooks/`
Expected: 0 remaining local declarations. If anything shows up, repeat the consolidation pattern above.

- [ ] **Step 5: Full verification gate**

Run:
```bash
npm run build 2>&1 | tail -5
npm test -- --run 2>&1 | tail -5
npx tsc --noEmit 2>&1 | grep -c "error TS"
npm run lint 2>&1 | tail -5
```
Expected: build passes, 997 tests, 26 tsc errors (still unchanged — only cleaning up role list declarations), lint passes.

- [ ] **Step 6: Commit**

```bash
git add src/lib/role-permissions.ts \
        src/app/api/owna/centres/route.ts \
        src/app/api/owna/test/route.ts \
        src/app/\(dashboard\)/policies/page.tsx \
        src/app/\(dashboard\)/getting-started/GettingStartedContent.tsx \
        src/app/\(dashboard\)/guides/GuidesContent.tsx
git commit -m "$(cat <<'EOF'
refactor(auth): extract ADMIN_ROLES constant (scoped)

Consolidate 3 local ADMIN_ROLES declarations (policies/page,
getting-started, guides) and 2 inline owna admin-role arrays to a
single shared export in src/lib/role-permissions.ts.

Scope bound: only 5 files. The ~178 withApiAuth({ roles: ["owner",
"head_office", "admin"] }) sites in a DIFFERENT ordering are OUT OF
SCOPE for this hygiene sweep — they warrant their own uniform
migration PR.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Chunk 4: Commit 3 — Silent catches (46 sites, 33 files)

### Task 4.1: Triage each silent catch site

For each of the 33 files, each `.catch(() => {})` call falls into one of 3 categories:

- **(A) `logger.error`** — server-side fire-and-forget where failure is a bug. Default for `src/app/api/**`, `src/app/api/cron/**`, `src/lib/**`.
- **(B) dev-only `console.warn`** — client-side best-effort (UI clipboard, optimistic UI cleanup). Default for `src/components/**`, `src/app/parent/**`, `src/app/(dashboard)/**` UI files.
- **(C) intentional silent** — with a single-line comment explaining why. Use sparingly.

**Per-site default rules:**

| Path prefix | Default category |
|---|---|
| `src/app/api/` (non-cron) | A |
| `src/app/api/cron/` | A |
| `src/lib/` | A (review `cache.ts` specifically — may be (C)) |
| `src/components/` | B (review each — marketing/team UI effects likely (B); could be (A)) |
| `src/app/parent/` | B |
| `src/app/(dashboard)/` non-API | B |
| `src/app/survey/` | B |

### Task 4.2: Process each file (one sub-step per file)

Each sub-step: read the file around each `.catch(() => {})` site, assess category per the rules above, apply fix, document in PR body note.

For category (A):
```ts
// before
sendX(args).catch(() => {});
// after
sendX(args).catch((err) => logger.error("sendX failed", { err, ...contextIds }));
```
Add the import if missing: `import { logger } from "@/lib/logger";`.

**Guidance for `...contextIds`:** each call site must include whatever IDs are in local scope — pick the minimum set that would let an engineer reading the log reproduce the failure:
- From URL/route params: `bookingId`, `ticketId`, `leadId`, `enrollmentId`, etc.
- From the request body (if already parsed): `userId`, `messageId`, etc.
- From the surrounding Prisma query: `serviceId`, the primary entity ID from the `findUnique` / `create` just above
- At minimum, a short verb/noun descriptor of what the fire-and-forget call was doing (embedded in the log message, e.g. `"failed to send booking-confirmed email"` rather than `"sendX failed"`)

For category (B):
```ts
// before
doX().catch(() => {});
// after
doX().catch((err) => {
  if (process.env.NODE_ENV !== "production") console.warn("doX failed:", err);
});
```

For category (C):
```ts
// before (silent with no comment)
doX().catch(() => {});
// after (with justification)
// Intentional: <reason for silence>
doX().catch(() => {});
```

Process files in this order (smallest site count first, so the pattern is familiar before hitting the 5-site `ai-drafts` file):

- [ ] **Step 1: Fix 1-site files in src/app/api/ (17 files)**

For each file listed below, read the relevant line (use grep to locate), classify as (A), fix, run `grep -c "\.catch(() *=> *{})" <file>` → should decrement by 1 per fix.

Files (each has exactly 1 site; all category (A) `logger.error`):
- `src/app/api/bookings/[id]/approve/route.ts`
- `src/app/api/bookings/[id]/decline/route.ts`
- `src/app/api/crm/leads/[id]/route.ts`
- `src/app/api/cron/attendance-alerts/route.ts`
- `src/app/api/cron/attendance-to-financials/route.ts`
- `src/app/api/cron/weekly-report/route.ts`
- `src/app/api/exit-survey/trigger/route.ts`
- `src/app/api/issues/route.ts`
- `src/app/api/messaging/broadcasts/route.ts`
- `src/app/api/messaging/conversations/[id]/messages/route.ts`
- `src/app/api/messaging/conversations/route.ts`
- `src/app/api/parent/absences/route.ts`
- `src/app/api/parent/bookings/route.ts`
- `src/app/api/parent/enrolments/route.ts`
- `src/app/api/parent/messages/[id]/reply/route.ts`
- `src/app/api/parent/messages/route.ts`
- `src/app/api/rocks/route.ts`

For each: locate line, extract context (what function is being called, what IDs are in scope), write the logger.error call with those IDs.

- [ ] **Step 2: Fix 2-site files in src/app/api/ (2 files)**

Same pattern, two sites per file:
- `src/app/api/attendance/roll-call/route.ts` (2 sites)
- `src/app/api/tickets/[id]/route.ts` (2 sites)

- [ ] **Step 3: Fix 3-site file src/app/api/enrol/route.ts**

Read around each of the 3 sites. All (A) `logger.error`.

- [ ] **Step 4: Fix 3-site file src/app/api/cron/auto-escalation/route.ts**

All (A).

- [ ] **Step 5: Fix 5-site file src/app/api/ai-drafts/[id]/route.ts**

All (A). Most likely: fire-and-forget notification / email sends / audit writes after a response is already returned.

- [ ] **Step 6: Fix src/lib files (3 files)**

Special scrutiny — library code:
- `src/lib/cache.ts` (2 sites) — cache invalidation is a classic "best-effort" pattern. Likely (C) intentional; add justification comments if so. If reading the code shows a non-cache operation, upgrade to (A).
- `src/lib/ai-task-agent.ts` (1 site) — almost certainly (A) `logger.error`.
- `src/lib/api-key-auth.ts` (1 site) — (A) or (C) depending on context.

For each: read the code, decide, apply.

- [ ] **Step 7: Fix src/components/ files (5 files, 6 sites)**

Classification per file:
- `src/components/enrol/steps/BookingStep.tsx` (1 site) — likely (B) UI effect
- `src/components/marketing/ActivationAssignmentGrid.tsx` (2 sites) — likely (B)
- `src/components/marketing/CreateTaskModal.tsx` (1 site) — likely (B)
- `src/components/marketing/TaskDetailPanel.tsx` (1 site) — likely (B)
- `src/components/team/SeatEditModal.tsx` (1 site) — likely (B)

Read the surrounding code to confirm UI-side best-effort; apply (B) dev-only warn.

- [ ] **Step 8: Fix src/app/(dashboard) + src/app/parent + src/app/survey (3 files)**

- `src/app/(dashboard)/settings/SettingsContent.tsx` (1 site) — likely (B) UI
- `src/app/parent/children/[id]/page.tsx` (2 sites) — likely (B)
- `src/app/survey/feedback/[serviceId]/page.tsx` (1 site) — likely (B)

- [ ] **Step 9: Verify the count**

Run: `grep -rn "\.catch(() *=> *{})" src/ 2>/dev/null | grep -v "// Intentional:" | wc -l`
Expected: 0 non-commented silent catches.

Run: `grep -rn "\.catch(() *=> *{})" src/ 2>/dev/null | wc -l`
This shows total remaining — should match the number of (C) intentional-silent sites you documented. If unexpectedly high, a site was missed.

- [ ] **Step 10: Run build + test**

```bash
npm run build 2>&1 | tail -5
npm test -- --run 2>&1 | tail -5
npx tsc --noEmit 2>&1 | grep -c "error TS"
```
Expected: build passes, 997 tests pass (logger.error is observational; no behaviour change), 26 tsc errors unchanged.

- [ ] **Step 11: Commit**

```bash
git add src/app/api/ src/app/parent/ src/app/\(dashboard\)/ src/app/survey/ src/lib/ src/components/
git commit -m "$(cat <<'EOF'
fix(errors): replace 46 silent .catch(() => {}) with logger calls

Triaged all 46 silent-catch sites across 33 files:
- Category A (logger.error): server-side fire-and-forget in api/ and
  lib/ files — real failures shouldn't vanish
- Category B (dev-only console.warn): client-side best-effort UI
  effects where user-facing errors aren't warranted
- Category C (intentional silent + comment): <count> sites in
  src/lib/cache.ts and similar, where swallowing is correct per
  the function's contract

Full triage list in PR body.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

Include the full per-file classification in the PR body (not the commit message).

---

## Chunk 5: Commit 4 — Cron locks (10 crons; health excluded)

**Scope note (critical):** The spec initially listed 11 unlocked routes in `src/app/api/cron/`, but `health/route.ts` is NOT a Vercel cron — it's a UI-invoked admin monitoring endpoint that uses `withApiAuth` (no `verifyCronSecret`) and is NOT in `vercel.json`'s `crons` array. Adding `acquireCronLock` would reject the second admin visiting the health page in the same period. **Do NOT add a lock to `health/route.ts`.** Leave it as-is; it's a follow-up to move outside the cron dir.

### Task 5.1: Apply lock template to each in-scope cron

**Insertion rule (critical):** each target cron ALREADY has an existing wrapper — `withApiHandler`, `withApiAuth`, plain function, or `POST` form. **Do NOT rewrite the export shape.** Preserve it. Insert the `acquireCronLock` guard block INSIDE the existing handler body, wrap the existing work in the try/catch.

**Before shape — 3 variants to recognize and preserve** (none of the 10 in-scope crons use `withApiAuth`, so that wrapper is NOT a variant to handle):

```ts
// Variant A (most common — 8 of 10): withApiHandler + arrow
export const GET = withApiHandler(async (req) => {
  const authCheck = verifyCronSecret(req);
  if (authCheck) return authCheck.error;
  // ... work ...
});
```

```ts
// Variant B — plain async function (e.g. unactioned-bookings)
export async function GET(req: NextRequest) {
  const authCheck = verifyCronSecret(req);
  if (authCheck) return authCheck.error;
  // ... work ...
}
```

```ts
// Variant C — POST instead of GET (e.g. waitlist-expiry)
export const POST = withApiHandler(async (req: NextRequest) => {
  const authCheck = verifyCronSecret(req);
  if (authCheck) return authCheck.error;
  // ... work ...
});
```

**After shape** (preserving whichever variant the file uses):

```ts
// Inside the existing handler body, immediately after the verifyCronSecret check:
const guard = await acquireCronLock("<cron-name>", "<period>");
if (!guard.acquired) {
  return NextResponse.json({ message: guard.reason, skipped: true });
}

try {
  // ... existing work body (everything that was after the verifyCronSecret check) ...
  await guard.complete({ /* meaningful metrics */ });
  return NextResponse.json({ /* existing result */ });
} catch (err) {
  await guard.fail(err);
  throw err;
}
```

Add import if missing: `import { acquireCronLock } from "@/lib/cron-guard";` (the existing file probably already imports `verifyCronSecret` from the same module — extend that import).

**Per-cron period — DERIVED FROM `vercel.json` SCHEDULES** (10 crons):

| Cron directory | vercel.json schedule | `<cron-name>` arg | `<period>` arg |
|---|---|---|---|
| `cleanup-tokens` | `0 14 * * *` (daily) | `"cleanup-tokens"` | `"daily"` |
| `document-expiry` | `0 21 * * 1` (weekly Mon) | `"document-expiry"` | `"weekly"` |
| `social-sync` | `0 */4 * * *` (every 4h) | `"social-sync"` | `"2hourly"` |
| `auto-onboarding` | `30 21 * * *` (daily) | `"auto-onboarding"` | `"daily"` |
| `enquiry-alerts` | `30 21 * * *` (daily) | `"enquiry-alerts"` | `"daily"` |
| `enquiry-auto-cold` | `0 10 * * 0` (weekly Sun) | `"enquiry-auto-cold"` | `"weekly"` |
| `waitlist-expiry` | `0 * * * *` (hourly) | `"waitlist-expiry"` | `"hourly"` |
| `unactioned-bookings` | `0 23 * * *` (daily) | `"unactioned-bookings"` | `"daily"` |
| `attendance-to-financials` | `0 13 * * 0` (weekly Sun) | `"attendance-to-financials"` | `"weekly"` |
| `financials-monthly-rollup` | `0 14 1 * *` (monthly, 1st) | `"financials-monthly-rollup"` | `"monthly"` |

**On `social-sync` `"2hourly"`:** cadence is every 4h (hours 0, 4, 8, 12, 16, 20 UTC). The `"2hourly"` period floors to even hours, giving period keys `T00, T04, T08, T12, T16, T20` — each run gets a unique key; duplicate invocations within the same 2h window are correctly rejected.

### Task 5.2: Apply to each cron file

For each file, read it first, identify the existing wrapper variant, preserve the export shape, insert the guard block inside the body.

- [ ] **Step 1: Read an existing compliant cron as a reference**

Run: `cat src/app/api/cron/daily-digest/route.ts | head -80`
Expected: see the standard `verifyCronSecret` → `acquireCronLock` → `try/finally with complete/fail` pattern used inside `withApiHandler`.

- [ ] **Step 2: Apply to cleanup-tokens (daily, withApiHandler variant)**

Read `src/app/api/cron/cleanup-tokens/route.ts` (full file). It uses `export const GET = withApiHandler(async (req) => { ... })`. Preserve that. Insert the guard block after `verifyCronSecret`, wrap the work in try/catch. Metrics: `{ tokensDeleted: count }` or similar based on the work.

Verify: `grep -c "acquireCronLock\|guard.fail\|guard.complete" src/app/api/cron/cleanup-tokens/route.ts` → 3 or more.

- [ ] **Step 3: Apply to document-expiry (WEEKLY, withApiHandler variant)**

Period: `"weekly"` per vercel.json. Metrics: `{ remindersSent: n, expired: m }`.

- [ ] **Step 4: Apply to social-sync (2HOURLY, withApiHandler variant)**

Period: `"2hourly"`. Reason: cron runs every 4h (0, 4, 8...), each run lands in a distinct 2h period key.

- [ ] **Step 5: Apply to auto-onboarding (daily, withApiHandler variant)**

Period: `"daily"`. Metrics: `{ usersOnboarded: n }`.

- [ ] **Step 6: Apply to enquiry-alerts (DAILY, withApiHandler variant)**

Period: `"daily"` per vercel.json `30 21 * * *` (was `"hourly"` in spec v1 — incorrect). Metrics: `{ alertsSent: n }`.

- [ ] **Step 7: Apply to enquiry-auto-cold (WEEKLY, withApiHandler variant)**

Period: `"weekly"` per vercel.json `0 10 * * 0`.

- [ ] **Step 8: Apply to waitlist-expiry (hourly, withApiHandler + POST variant)**

Period: `"hourly"`. NOTE: this file uses `export const POST = withApiHandler(async (req: NextRequest) => { ... })` — preserve the POST export, don't rewrite as GET. Metrics: `{ offersExpired: n }`.

- [ ] **Step 9: Apply to unactioned-bookings (DAILY, plain async function variant)**

Period: `"daily"` per vercel.json `0 23 * * *`. NOTE: this file uses `export async function GET(req: NextRequest) { ... }` (plain function, no wrapper) — preserve that form.

- [ ] **Step 10: Apply to attendance-to-financials (WEEKLY, withApiHandler variant)**

Period: `"weekly"` per vercel.json `0 13 * * 0`.

- [ ] **Step 11: Apply to financials-monthly-rollup (monthly, withApiHandler variant)**

Period: `"monthly"` per vercel.json `0 14 1 * *`.

- [ ] **Step 12: Verify count of locked crons**

Run:
```bash
for f in src/app/api/cron/*/route.ts; do
  if ! grep -q "acquireCronLock" "$f" 2>/dev/null; then echo "MISSING: $f"; fi
done
```
Expected: exactly one output — `MISSING: src/app/api/cron/health/route.ts`. Every other cron is locked. `health` is explicitly out of scope.

- [ ] **Step 13: Run full verification gate**

```bash
npm run build 2>&1 | tail -5
npm test -- --run 2>&1 | tail -5
npx tsc --noEmit 2>&1 | grep -c "error TS"
npm run lint 2>&1 | tail -5
```
Expected: build passes, 997 tests pass, 26 tsc errors unchanged, lint passes.

- [ ] **Step 14: Commit**

```bash
git add src/app/api/cron/
git commit -m "$(cat <<'EOF'
fix(cron): add acquireCronLock to 10 missing crons

Previously-unlocked crons (10): cleanup-tokens, document-expiry,
social-sync, auto-onboarding, enquiry-alerts, enquiry-auto-cold,
waitlist-expiry, unactioned-bookings, attendance-to-financials,
financials-monthly-rollup.

Each now follows the standard pattern: verifyCronSecret →
acquireCronLock(name, period) → try { work; guard.complete(metrics) }
catch (err) { guard.fail(err); throw }. Existing wrapper styles
(withApiHandler, POST, plain async function) preserved.

Duplicate Vercel cron invocation or manual retry within the same period
now returns { skipped: true } instead of corrupting state.

Periods derived from vercel.json schedules (not assumed): document-
expiry/enquiry-auto-cold/attendance-to-financials = weekly; social-sync
= 2hourly (runs every 4h, fits uniquely in 2h period keys); others
daily or monthly per spec.

Out of scope: src/app/api/cron/health/route.ts — despite its location,
it's a UI-invoked admin monitoring endpoint (withApiAuth, not in
vercel.json crons array). Locking it would reject legitimate admin
refreshes.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Chunk 6: Commit 5 — TS error cleanup (26 errors, 10 files)

### Task 6.1: Fix MockUser errors (3 files)

**Problem:** `MockUser` type requires `name` but 3 fixtures omit it. One also uses `role: any`.

- [ ] **Step 1: Read the MockUser helper**

Run: `cat src/__tests__/helpers/auth-mock.ts`
Expected: see the `MockUser` interface. Understand what fields it requires.

- [ ] **Step 2: Decide strategy — inline fix vs. type update**

Per the spec's Q-B2: only 3 files need MockUser fixes → inline fix is correct. Do NOT modify the `MockUser` interface itself.

- [ ] **Step 3: Fix src/__tests__/api/contracts.test.ts:245**

Read line 245 ± 5 lines. Expected: `mockSession({ id: "u1", role: "admin" })` or similar with missing `name`. Add `name: "Test User"` to the mock.

- [ ] **Step 4: Fix src/__tests__/api/contracts.test.ts:309**

Same pattern. Same fix.

- [ ] **Step 5: Fix src/__tests__/api/internal-feedback.test.ts:37**

Read line 37 ± 5 lines. Expected: `{ id: "u1", role: "admin" as any }` → change to `{ id: "u1", role: "admin", name: "Test User" }`. Remove both the `as any` AND add `name`.

- [ ] **Step 6: Verify MockUser errors gone**

Run: `npx tsc --noEmit 2>&1 | grep "MockUser" | wc -l`
Expected: 0.

### Task 6.2: Fix BlobPart errors (7 sites, 1 file)

**Problem:** `new Blob([uint8Array])` — TS lib types for `Uint8Array<ArrayBufferLike>` no longer satisfy `BlobPart[]` under recent Node types.

- [ ] **Step 1: Read the first BlobPart error site**

Run: `sed -n '88,100p' src/__tests__/api/upload.test.ts`
Understand the pattern: likely `new Blob([pdfBuffer], { type: "application/pdf" })` where `pdfBuffer` is a `Uint8Array`.

- [ ] **Step 2: Apply the cast fix to each of the 7 sites**

For each line (93, 116, 140, 156, 191, 204, 214): update `new Blob([buffer], { type: "..." })` to `new Blob([buffer as BlobPart], { type: "..." })`.

Use Edit tool per site. If the same expression appears multiple times, `replace_all: false` with sufficient context to pin each one.

Alternative: fix once at fixture creation — if all 7 sites use a shared `const pdfBuffer = new Uint8Array([...])` helper, cast the helper's type: `const pdfBuffer: BlobPart = new Uint8Array([...])`. Prefer this if the fixture is centralized.

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit 2>&1 | grep "BlobPart" | wc -l`
Expected: 0.

### Task 6.3: Fix duplicate-key errors (1 file)

**Problem:** `src/__tests__/components/IssueKanban.test.tsx:30,31` — `id` and `title` specified twice in an object literal.

- [ ] **Step 1: Read lines 25-35**

Run: `sed -n '25,35p' src/__tests__/components/IssueKanban.test.tsx`
Expected: see an object literal like `{ ...baseIssue, id: "x", title: "y", ... }` where `baseIssue` already contains `id` and `title`.

- [ ] **Step 2: Remove the duplicates**

If the override is intentional (e.g. spread first, override later), this is a benign TS2783 warning — but the spec requires 0 errors, so restructure:
```tsx
const issue = { ...baseIssue, id: "x", title: "y" };  // if intentional override
```
TS2783 fires when the override happens BEFORE the spread. Check whether the fix is to reorder (spread first) or to remove the redundant property.

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit 2>&1 | grep "2783" | wc -l`
Expected: 0.

### Task 6.4: Fix RequestInit.signal errors (2 files)

**Problem:** `src/__tests__/function-seat-endpoints.test.ts:62` and `service-tab-endpoints.test.ts:60` — `RequestInit.signal` is `AbortSignal | null | undefined` but Next's shape requires `AbortSignal | undefined`.

- [ ] **Step 1: Locate and read the failing line**

Run: `sed -n '58,66p' src/__tests__/function-seat-endpoints.test.ts`
Expected: see a `new NextRequest(url, init)` call where `init` has a `signal` of incompatible type.

- [ ] **Step 2: Narrow the signal**

Find the init-construction line. Change:
```ts
signal: someSignal,
```
To:
```ts
signal: someSignal ?? undefined,
```
Or if the entire `init` is passed from a wrapper, narrow there.

- [ ] **Step 3: Same fix in service-tab-endpoints.test.ts**

Same pattern at line 60.

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit 2>&1 | grep "signal" | wc -l`
Expected: 0.

### Task 6.5: Fix missing imports (5 sites, 3 files)

**Problem:**
- `src/__tests__/lib/api-error.test.ts:245,259` — `NextResponse` not imported
- `src/__tests__/lib/cert-expiry.test.ts:66` — `afterAll` not imported
- `src/__tests__/lib/nurture-scheduler.test.ts:39` — `afterAll` not imported

- [ ] **Step 1: Fix api-error.test.ts**

Add to top of file: `import { NextResponse } from "next/server";`

- [ ] **Step 2: Fix cert-expiry.test.ts**

Ensure the vitest import at the top includes `afterAll`:
```ts
import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
```

- [ ] **Step 3: Fix nurture-scheduler.test.ts — import + param types**

Import fix same as step 2.

Then fix the implicit `any` at lines 273, 274, 275, 295, 296, 297:
```ts
// before
.map((s) => ...)
// after (with the expected element type — read the enclosing query to determine)
.map((s: SequenceStep) => ...)
```
(The exact type depends on what's being mapped — look at the `prisma.xxx.findMany` call above to get the element type, or use `any[]` if that's the existing convention, though the whole point is to remove implicit `any`.)

- [ ] **Step 4: Verify all 3 files clean**

Run: `npx tsc --noEmit 2>&1 | grep -E "(api-error|cert-expiry|nurture-scheduler)\.test" | wc -l`
Expected: 0.

### Task 6.6: Fix integration test errors (1 file)

**Problem:** `tests/integration/cowork-api.test.ts:130,148` — `afterEach` not imported; `.status` on Promise.

- [ ] **Step 1: Import afterEach**

At top of file, update the vitest import:
```ts
import { describe, it, expect, beforeEach, afterEach, afterAll } from "vitest";
```

- [ ] **Step 2: Fix line 148 — await the promise**

Read line 148. Likely: `const res = somePromise; expect(res.status).toBe(...)` — add `await`:
```ts
const res = await somePromise;
expect(res.status).toBe(...);
```

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit 2>&1 | grep "cowork-api" | wc -l`
Expected: 0.

### Task 6.7: Full verification + commit

- [ ] **Step 1: Confirm ZERO tsc errors**

Run: `npx tsc --noEmit 2>&1 | grep -c "error TS"`
Expected: `0`.

- [ ] **Step 2: Confirm ZERO production-code changes**

Run: `git diff --stat HEAD -- src/app src/components src/hooks src/lib`
Expected: empty output or zero insertions/deletions.

- [ ] **Step 3: Run full test suite**

Run: `npm test -- --run 2>&1 | tail -10`
Expected: 997 tests pass (unchanged).

- [ ] **Step 4: Run build + lint**

```bash
npm run build 2>&1 | tail -5
npm run lint 2>&1 | tail -5
```
Expected: both clean.

- [ ] **Step 5: Commit**

```bash
git add src/__tests__/ tests/
git commit -m "$(cat <<'EOF'
fix(tests): resolve 26 TS errors (24 test-file + 2 integration-test)

Bring tsc --noEmit to 0 errors. Fixes by category:
- MockUser: add missing name field to 3 fixtures
- BlobPart: cast Uint8Array fixtures to BlobPart (7 sites, 1 file)
- Duplicate keys: remove/reorder in IssueKanban test fixture
- RequestInit.signal: narrow to AbortSignal | undefined (2 sites)
- Missing imports: NextResponse, afterAll, afterEach (5 sites)
- Implicit any: type callback parameters in nurture-scheduler (6 sites)

No production code touched in this commit — src/app, src/components,
src/hooks, src/lib are untouched by design.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Chunk 7: Commit 6 — Session role narrowing (17 sites, 10 files)

### Task 7.1: Add `parseRole` helper + unit tests

**Files:**
- Modify: `src/lib/role-permissions.ts` (add function)
- Create: `src/__tests__/lib/role-permissions.test.ts` (or extend if it exists)

- [ ] **Step 1: Check for existing role-permissions test**

Run: `ls src/__tests__/lib/role-permissions.test.ts 2>/dev/null || echo "MISSING"`

- [ ] **Step 2: Write failing unit test for parseRole**

Create `src/__tests__/lib/role-permissions.test.ts` (or append to existing):

```typescript
import { describe, it, expect } from "vitest";
import { parseRole } from "@/lib/role-permissions";
import { Role } from "@prisma/client";

describe("parseRole", () => {
  it("returns the Role enum value for a valid role string", () => {
    expect(parseRole("admin")).toBe(Role.admin);
    expect(parseRole("owner")).toBe(Role.owner);
    expect(parseRole("coordinator")).toBe(Role.coordinator);
  });

  it("returns null for undefined", () => {
    expect(parseRole(undefined)).toBeNull();
  });

  it("returns null for null", () => {
    expect(parseRole(null)).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(parseRole("")).toBeNull();
  });

  it("returns null for nonsense strings", () => {
    expect(parseRole("nonsense")).toBeNull();
    expect(parseRole("administrator")).toBeNull();
  });

  it("is case-sensitive — returns null for wrong case", () => {
    expect(parseRole("ADMIN")).toBeNull();
    expect(parseRole("Admin")).toBeNull();
  });

  it("returns null for non-string types", () => {
    expect(parseRole(123 as unknown)).toBeNull();
    expect(parseRole({} as unknown)).toBeNull();
  });
});
```

- [ ] **Step 3: Run test, confirm it fails**

Run: `npx vitest run src/__tests__/lib/role-permissions.test.ts`
Expected: FAIL — `parseRole` not exported.

- [ ] **Step 4a: Convert `import type { Role }` to value import**

The file currently has `import type { Role } from "@prisma/client";` at line 1. `parseRole` needs `Role` as a VALUE (for `Object.values(Role)` — Prisma generates Role as an enum object at runtime, not just a type). Change line 1:

```ts
// before
import type { Role } from "@prisma/client";
// after
import { Role } from "@prisma/client";
```

Without this change, `Object.values(Role)` produces TS2693: "Role only refers to a type but is being used as a value here."

- [ ] **Step 4b: Implement `parseRole`**

Edit `src/lib/role-permissions.ts`. Add after `ADMIN_ROLES` (the `Role` import is already at the top from Step 4a):

```typescript
/**
 * Safely narrow a session role value to the Prisma Role enum.
 *
 * Returns the Role enum if valid, null otherwise. Case-sensitive.
 * Use this instead of `session.user.role as Role` to avoid unsafe casts
 * on potentially-corrupt session data.
 */
export function parseRole(value: unknown): Role | null {
  if (typeof value !== "string") return null;
  return (Object.values(Role) as string[]).includes(value) ? (value as Role) : null;
}
```

- [ ] **Step 5: Run tests, confirm pass**

Run: `npx vitest run src/__tests__/lib/role-permissions.test.ts`
Expected: all tests pass.

### Task 7.2: Replace `hasFeature(... as Role, ...)` across 9 files (16 sites)

**Pattern per site:**

```ts
// before
if (!hasFeature(session!.user.role as Role, "some.feature")) {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

// after
const role = parseRole(session!.user.role);
if (!role || !hasFeature(role, "some.feature")) {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}
```

Add the import at the top of each file (if not already present):
```ts
import { parseRole } from "@/lib/role-permissions";
```

Remove the `Role` import from `@prisma/client` in that file IF it's no longer needed anywhere else in the file.

- [ ] **Step 1: Fix src/app/api/settings/api-keys/route.ts (2 sites)**

Read lines 26 and 51. Apply the pattern. Run `grep -n "as Role" <file>` to confirm 0 remaining.

- [ ] **Step 2: Fix src/app/api/settings/api-keys/[id]/route.ts (1 site)**

Line 10. Same pattern.

- [ ] **Step 3: Fix src/app/api/crm/email-templates/route.ts (2 sites)**

Lines 33, 46. Same pattern.

- [ ] **Step 4: Fix src/app/api/crm/email-templates/[id]/route.ts (2 sites)**

Lines 33, 86. Same pattern.

- [ ] **Step 5: Fix src/app/api/crm/leads/route.ts (2 sites)**

Lines 37, 93. Same pattern.

- [ ] **Step 6: Fix src/app/api/crm/leads/[id]/touchpoints/route.ts (2 sites)**

Lines 20, 39. Same pattern.

- [ ] **Step 7: Fix src/app/api/crm/leads/[id]/send-email/route.ts (1 site)**

Line 28. Same pattern.

- [ ] **Step 8: Fix src/app/api/crm/leads/[id]/route.ts (3 sites)**

Lines 43, 73, 176. Same pattern.

- [ ] **Step 9: Fix src/app/api/crm/scraper-status/route.ts (1 site)**

Line 9. Same pattern.

### Task 7.3: Fix the `const role = ... as Role` variant in score/route.ts

- [ ] **Step 1: Read src/app/api/crm/leads/[id]/score/route.ts:18**

Run: `sed -n '14,25p' src/app/api/crm/leads/[id]/score/route.ts`
Expected: `const role = session!.user.role as Role;` followed by downstream use of `role`.

- [ ] **Step 2: Replace with parseRole + guard**

```ts
// before
const role = session!.user.role as Role;
// use role later...

// after
const role = parseRole(session!.user.role);
if (!role) {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}
// use role later (now correctly narrowed to Role, not Role | null)...
```

Adjust the error shape if the route uses `ApiError.forbidden()` or similar — check nearby lines for the existing error-return convention.

### Task 7.4: Verify + commit

- [ ] **Step 1: Verify 0 `hasFeature(... as Role)` remaining**

Run: `grep -rn "hasFeature(.*as Role" src/`
Expected: empty output.

- [ ] **Step 2: Verify the score-route const role cast is gone**

Run: `grep -n "const role = session.*as Role" src/app/api/crm/leads/\[id\]/score/route.ts`
Expected: empty output.

- [ ] **Step 3: Full verification gate**

```bash
npm run build 2>&1 | tail -5
npm test -- --run 2>&1 | tail -5
npx tsc --noEmit 2>&1 | grep -c "error TS"
npm run lint 2>&1 | tail -5
```
Expected: build passes, 997+ tests pass (plus new parseRole tests — should be ~1004), 0 tsc errors (maintained from commit 5), lint passes.

- [ ] **Step 4: Commit**

```bash
git add src/lib/role-permissions.ts \
        src/__tests__/lib/role-permissions.test.ts \
        src/app/api/settings/api-keys/ \
        src/app/api/crm/
git commit -m "$(cat <<'EOF'
refactor(auth): narrow session.user.role — replace unsafe as Role in scoped files

Add parseRole(value: unknown): Role | null helper in role-permissions.
Replace 17 unsafe `as Role` casts across 10 files with safe narrowing:

- 16 hasFeature(session!.user.role as Role, "...") → parseRole + guard
- 1 const role = session!.user.role as Role (crm/leads/[id]/score) →
  parseRole + guard

Files: settings/api-keys × 2, crm/email-templates × 2, crm/leads × 5,
crm/scraper-status, crm/leads/[id]/score.

Out of scope (different semantics): e.target.value as Role in UI forms,
session?.user?.role as Role | undefined in components, as Role in
src/lib/server-auth.ts's role-validation function, and as Role in
RoleGate.tsx. Those belong in a separate sweep.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Chunk 8: Commit 7 — onError toasts (46 sites, 21 files)

### Task 8.1: Commit the audit script first

**Files:**
- Create: `scripts/audit-mutation-onerror.py`

- [ ] **Step 1: Create scripts/ directory if needed**

Run: `mkdir -p scripts && ls scripts/`

- [ ] **Step 2: Write the audit script**

Create `scripts/audit-mutation-onerror.py`:

```python
#!/usr/bin/env python3
"""
Audit useMutation() calls missing onError handlers.

Scope: src/hooks, src/components, src/app excluding test paths and
src/app/parent (parent portal — different UX pattern, separate scope).

Exits 0 if zero missing, 1 otherwise. Prints missing site locations.
"""
import re
import pathlib
import sys

SCAN_ROOTS = [pathlib.Path("src/hooks"), pathlib.Path("src/components"), pathlib.Path("src/app")]
# Exclude test files and parent-portal paths.
# Note: actual dirs are src/app/parent/ (no parens — not a Next.js route group).
# No cowork portal dir exists today.
EXCLUDE_PATH_PARTS = ("__tests__", "/parent/")

missing = []
total = 0

for root in SCAN_ROOTS:
    if not root.exists():
        continue
    for f in sorted(list(root.rglob("*.ts")) + list(root.rglob("*.tsx"))):
        if any(p in str(f) for p in EXCLUDE_PATH_PARTS) or ".test." in str(f):
            continue
        src = f.read_text()
        for m in re.finditer(r"useMutation\s*(<[^>]*>)?\s*\(\s*\{", src):
            start = m.start()
            i = src.index("{", start)
            depth = 0
            end = i
            for j in range(i, len(src)):
                if src[j] == "{":
                    depth += 1
                elif src[j] == "}":
                    depth -= 1
                    if depth == 0:
                        end = j
                        break
            block = src[start:end + 1]
            total += 1
            if "onError" not in block:
                lineno = src[:start].count("\n") + 1
                missing.append((str(f), lineno))

print(f"Total useMutation(object) calls scanned: {total}")
print(f"Missing onError: {len(missing)}")
for f, ln in missing:
    print(f"  {f}:{ln}")

sys.exit(1 if missing else 0)
```

- [ ] **Step 3: Make it executable**

Run: `chmod +x scripts/audit-mutation-onerror.py`

- [ ] **Step 4: Run it to confirm current state**

Run: `python3 scripts/audit-mutation-onerror.py`
Expected: `Missing onError: 46` and the list of 46 sites. Record for comparison.

### Task 8.2: Apply onError pattern per file

**Default pattern:**

```tsx
useMutation({
  mutationFn: async (input) => { ... },
  onSuccess: (data) => { ... },
  onError: (err: Error) => {
    toast({ variant: "destructive", description: err.message || "Something went wrong" });
  },
});
```

**Intentional-silent exception pattern** (rare — use only if you can articulate why the user should NOT see an error):

```tsx
useMutation({
  mutationFn: async (input) => { ... },
  // Intentional: <reason for silence>
  onError: (err) => {
    if (process.env.NODE_ENV !== "production") console.error("<mutation name> failed:", err);
  },
});
```

**Before editing each file:** verify `toast` is imported from `@/hooks/useToast` (canonical path — verified via existing usages in `src/components/calls/CallsTab.tsx`, `src/components/settings/BulkInviteModal.tsx`, and many other files). If not imported, add: `import { toast } from "@/hooks/useToast";`.

### Task 8.3: Process each file

For each file, apply the pattern to every `useMutation` call that lacks `onError`. Some files have 1 site, some have 10.

- [ ] **Step 1: src/hooks/useHolidayQuest.ts (1 site)**

Read the file, locate the useMutation, add onError. Verify `toast` import.

- [ ] **Step 2: src/hooks/useParentNotifications.ts (1 site)**

Same.

- [ ] **Step 3: src/components/charts/CashFlowChart.tsx (1 site)**

- [ ] **Step 4: src/components/dashboard/DashboardProjectTodos.tsx (1 site)**

- [ ] **Step 5: src/components/projects/ProjectDetailPanel.tsx (3 sites)**

Three mutations — likely create/update/delete or similar. Each gets the default pattern.

- [ ] **Step 6: src/components/rocks/RockDetailPanel.tsx (10 sites)**

This is the biggest — 10 mutations in one file. Read the full file first to understand the mutation purposes. Apply the default pattern to each. Scrutinize: any one of the 10 could conceivably be "background auto-save" where intentional-silent applies — but default to destructive toast unless obviously wrong.

- [ ] **Step 7: src/components/scorecard/AddMeasurableModal.tsx (2 sites)**

- [ ] **Step 8: src/components/services/ServiceChecklistsTab.tsx (2 sites)**

- [ ] **Step 9: src/components/services/ServiceIssuesTab.tsx (3 sites)**

- [ ] **Step 10: src/components/services/ServiceProgramTab.tsx (4 sites)**

- [ ] **Step 11: src/components/services/ServiceQIPTab.tsx (2 sites)**

- [ ] **Step 12: src/components/services/ServiceScorecardTab.tsx (2 sites)**

- [ ] **Step 13: src/components/services/ServiceTodosTab.tsx (1 site)**

- [ ] **Step 14: src/components/services/WeeklyDataEntry.tsx (1 site)**

- [ ] **Step 15: src/components/settings/BannerManagementSection.tsx (2 sites)**

- [ ] **Step 16: src/app/(dashboard)/financials/page.tsx (1 site)**

- [ ] **Step 17: src/app/(dashboard)/help/HelpContent.tsx (1 site)**

- [ ] **Step 18: src/app/(dashboard)/my-portal/page.tsx (2 sites)**

- [ ] **Step 19: src/app/(dashboard)/profile/page.tsx (2 sites)**

- [ ] **Step 20: src/app/(dashboard)/scorecard/page.tsx (1 site)**

- [ ] **Step 21: src/app/(dashboard)/settings/SettingsContent.tsx (4 sites)**

### Task 8.4: Verify + commit

- [ ] **Step 1: Re-run the audit script**

Run: `python3 scripts/audit-mutation-onerror.py`
Expected: `Missing onError: 0`. Exit code 0.

- [ ] **Step 2: If any intentional-silent sites exist, document**

Any mutation using the intentional-silent exception must have a one-line `// Intentional: ...` comment adjacent. Collect these into a list for the PR body.

- [ ] **Step 3: Full verification gate**

```bash
npm run build 2>&1 | tail -5
npm test -- --run 2>&1 | tail -5
npx tsc --noEmit 2>&1 | grep -c "error TS"
npm run lint 2>&1 | tail -5
```
Expected: build passes, 997+ tests pass (+ the parseRole tests from commit 6), 0 tsc errors, lint passes.

- [ ] **Step 4: Commit**

```bash
git add scripts/audit-mutation-onerror.py \
        src/hooks/ \
        src/components/ \
        src/app/\(dashboard\)/
git commit -m "$(cat <<'EOF'
fix(hooks): add onError destructive toast to 46 mutations

Every useMutation call now has an onError handler that shows a
destructive toast on failure, matching the global convention in
CLAUDE.md. Closes the #1 UX regression (silent mutation failures).

Scope: src/hooks/, src/components/, src/app/(dashboard)/. Parent
portal (src/app/parent/) explicitly excluded — 0 mutations there
today but defensively gated in the audit script.

Audit script committed at scripts/audit-mutation-onerror.py for
future regression checks. Run with: python3 scripts/audit-mutation-
onerror.py (exits 0 if clean).

<optional: intentional-silent mutations, one line each>

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Chunk 9: Commit 8 — parseJsonBody migration (247 sites, 242 files)

### Task 9.1: Write + commit the codemod

**Files:**
- Create: `scripts/one-shots/codemod-parseJsonBody.ts`

- [ ] **Step 1: Create scripts/one-shots/ directory**

Run: `mkdir -p scripts/one-shots && ls scripts/one-shots/`

- [ ] **Step 2: Write the codemod**

Create `scripts/one-shots/codemod-parseJsonBody.ts`:

```typescript
#!/usr/bin/env tsx
/**
 * One-shot codemod: migrate `await req.json()` → `await parseJsonBody(req)`
 * across all src/app/api/** route handlers.
 *
 * Inserts `import { parseJsonBody } from "@/lib/api-error"` if not already
 * present. Idempotent — re-running on already-migrated files is a no-op.
 *
 * Usage: npx tsx scripts/one-shots/codemod-parseJsonBody.ts
 */
import { readdirSync, readFileSync, writeFileSync, statSync } from "fs";
import { join } from "path";

const IMPORT_STATEMENT = 'import { parseJsonBody } from "@/lib/api-error";';
const API_ROOT = "src/app/api";

function* walkFiles(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) yield* walkFiles(full);
    else if (entry === "route.ts") yield full;
  }
}

let filesChanged = 0;
let totalReplacements = 0;
const skipped: { file: string; reason: string }[] = [];

for (const file of walkFiles(API_ROOT)) {
  const before = readFileSync(file, "utf8");

  // Count how many `await req.json()` occurrences exist
  const occurrences = (before.match(/await\s+req\.json\(\s*\)/g) || []).length;
  if (occurrences === 0) continue;

  // Replace the expression
  let after = before.replace(/await\s+req\.json\(\s*\)/g, "await parseJsonBody(req)");

  // Inspect the IMPORT STATEMENT specifically (not the whole file) to decide
  // whether parseJsonBody is in scope. NOTE: checking `after.includes("parseJsonBody")`
  // is WRONG because the call-site replacement above just inserted that string
  // into the body — which would fool the check into thinking the import exists.
  const apiErrorImportMatch = after.match(/import\s*\{([^}]+)\}\s*from\s*"@\/lib\/api-error"\s*;/);
  const importedNames = apiErrorImportMatch
    ? apiErrorImportMatch[1].split(",").map((n: string) => n.trim()).filter(Boolean)
    : null;
  const importHasParseJsonBody = importedNames?.includes("parseJsonBody") ?? false;

  if (!apiErrorImportMatch) {
    // No import from @/lib/api-error yet — insert the full statement after the
    // last top-of-file import.
    const importRegex = /^import[^;\n]+;\s*$/gm;
    let lastImportEnd = 0;
    let match: RegExpExecArray | null;
    while ((match = importRegex.exec(after)) !== null) {
      lastImportEnd = match.index + match[0].length;
    }
    if (lastImportEnd === 0) {
      skipped.push({ file, reason: "could not locate import block to insert parseJsonBody" });
      continue;
    }
    after = after.slice(0, lastImportEnd) + "\n" + IMPORT_STATEMENT + after.slice(lastImportEnd);
  } else if (!importHasParseJsonBody) {
    // Import exists but doesn't include parseJsonBody — extend the named list.
    after = after.replace(
      /import\s*\{([^}]+)\}\s*from\s*"@\/lib\/api-error"\s*;/,
      (_match, named) => {
        const names = named.split(",").map((n: string) => n.trim()).filter(Boolean);
        if (!names.includes("parseJsonBody")) names.push("parseJsonBody");
        return `import { ${names.join(", ")} } from "@/lib/api-error";`;
      },
    );
  }
  // else: import already has parseJsonBody — nothing to do for imports

  if (after !== before) {
    writeFileSync(file, after, "utf8");
    filesChanged++;
    totalReplacements += occurrences;
    console.log(`  ${file}  (${occurrences} sites)`);
  }
}

console.log();
console.log(`Codemod summary: ${filesChanged} files changed, ${totalReplacements} sites migrated.`);
if (skipped.length) {
  console.log();
  console.log("Skipped:");
  for (const s of skipped) console.log(`  ${s.file} — ${s.reason}`);
  process.exit(1);
}
```

- [ ] **Step 3: Commit the codemod alone first (so it's in the history before running)**

Actually: don't commit yet. The codemod lands in the SAME commit as the migrated files. Keep going.

### Task 9.2: Run the codemod + verify

- [ ] **Step 1: Dry-run — see what the codemod would change**

Run: `npx tsx scripts/one-shots/codemod-parseJsonBody.ts`
Expected output: one line per changed file, ending with `Codemod summary: 242 files changed, 247 sites migrated.` (or close — ±2 is OK if counts drifted slightly).

If the "Skipped" list is non-empty: investigate each. Most likely cause is a file with no existing imports (unusual for route handlers). Fix the codemod OR fix the skipped files manually.

- [ ] **Step 2: Check the diff size**

Run: `git diff --stat | tail -5`
Expected: ~242 files changed with small line counts (typically 2-5 lines per file: one body-parse replace + one import addition).

- [ ] **Step 3: Spot-check 5 random files**

Pick 5 files that showed up in the codemod output. `git diff <file>` each. Verify:
- Before: `await req.json()`
- After: `await parseJsonBody(req)`
- Import `parseJsonBody` from `@/lib/api-error` is present
- No other changes

- [ ] **Step 4: Run tsc**

Run: `npx tsc --noEmit 2>&1 | grep -c "error TS"`
Expected: `0`. (Maintained from commit 5.)

- [ ] **Step 5: Run tests**

Run: `npm test -- --run 2>&1 | tail -20`
Expected: all tests pass (should be 997+ plus the parseRole tests).

If any test fails:
- Identify the failing test and the route it targets
- Read the diff on that route
- Determine if the codemod broke something (e.g. a file that had a custom req.json type annotation)
- Either fix the route (if it's a small tweak) or revert just that file (`git checkout HEAD -- <file>`) and add to skip list per the rollback procedure

- [ ] **Step 6: Run build + lint**

```bash
npm run build 2>&1 | tail -5
npm run lint 2>&1 | tail -5
```
Expected: both clean. If lint complains about import ordering (codemod may place imports in non-idiomatic order), run `npm run lint -- --fix` and verify the fix doesn't break anything.

- [ ] **Step 7: Rollback procedure (only if >20 files fail)**

If more than 20 files break after the codemod: abort. Do:
```bash
git reset --hard HEAD
```
Re-plan. Likely causes: codemod regex is too greedy, or a subset of routes have a shape parseJsonBody can't handle.

If fewer than 20 files fail:
- For each failing file: `git checkout HEAD -- <file>` (reverts to pre-codemod)
- Add file path + reason to a TODO list (scratch file `/tmp/codemod-skipped.txt`)
- Continue with the successful migrations

- [ ] **Step 8: Verify final count**

Run: `grep -rn "await req\.json" src/app/api/ 2>/dev/null | wc -l`
Expected: 0 (or the number of documented skip-list files × their per-file site count).

### Task 9.3: Commit

- [ ] **Step 1: Full verification gate**

```bash
npm run build 2>&1 | tail -5
npm test -- --run 2>&1 | tail -5
npx tsc --noEmit 2>&1 | grep -c "error TS"
npm run lint 2>&1 | tail -5
```
Expected: all clean. 0 TS errors. 997+ tests passing.

- [ ] **Step 2: Manual smoke — malformed JSON test (OPTIONAL, skip if auth is hard to set up)**

If an unauthenticated write route exists (e.g. a webhook receiver), curl it with malformed JSON and confirm 400 (not 500). Most dashboard routes require auth — if setting up a session cookie for smoke is non-trivial, skip this step. The test suite already covers `parseJsonBody`'s unit behaviour via `src/__tests__/lib/api-error.test.ts`; the route-level regression is covered by the fact that `npm test` passed on the codemod output.

- [ ] **Step 3: Commit**

```bash
git add scripts/one-shots/codemod-parseJsonBody.ts src/app/api/
git commit -m "$(cat <<'EOF'
refactor(api): migrate 247 req.json() sites in 242 files to parseJsonBody()

Every `await req.json()` in src/app/api/** now goes through
parseJsonBody(req), which returns 400 (not 500) on malformed JSON.

Mechanical change — one-shot codemod at scripts/one-shots/codemod-
parseJsonBody.ts (committed for audit trail). No handler wrapping,
no Zod additions, no logic changes.

<optional: skipped files list if rollback procedure triggered>

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Chunk 10: Pull request opening

### Task 10.1: Final verification sweep

- [ ] **Step 1: Confirm all 8 commits landed**

Run: `git log origin/main..HEAD --oneline`
Expected: exactly 8 commits, in the stated order (CI env, ADMIN_ROLES, silent catches, cron locks, TS errors, role narrowing, onError toasts, parseJsonBody).

- [ ] **Step 2: Run ALL gates fresh**

```bash
npm run build 2>&1 | tail -10
npm test -- --run 2>&1 | tail -10
npx tsc --noEmit 2>&1 | grep -c "error TS"
npm run lint 2>&1 | tail -10
```
Expected: build clean, 997+ tests pass (exact count = 997 + parseRole test count), 0 TS errors, lint clean.

- [ ] **Step 3: Re-run all baseline audits**

```bash
grep -rn "await req\.json" src/app/api/ 2>/dev/null | wc -l         # expected: 0
grep -rn "\.catch(() *=> *{})" src/ 2>/dev/null | grep -v "// Intentional:" | wc -l  # expected: 0
grep -rn "hasFeature(.*as Role" src/ 2>/dev/null | wc -l              # expected: 0
python3 scripts/audit-mutation-onerror.py ; echo "Exit: $?"           # expected: Missing onError: 0, Exit: 0
for f in src/app/api/cron/*/route.ts; do grep -L acquireCronLock "$f"; done | wc -l  # expected: 0
```

If any audit fails, locate the remaining violation and either fix it in a targeted amendment commit, or document as a skip in the PR body (preferred for parseJsonBody if the rollback procedure kicked in).

### Task 10.2: Push and open PR

- [ ] **Step 1: Push the branch**

Run: `git push -u origin hygiene/sweep-2026-04-20`
Expected: branch created on origin; CI starts automatically.

- [ ] **Step 2: Wait for CI to verify**

Watch GitHub Actions. The `unit` and `integration` jobs should both run and pass. If either fails, debug — the CI env var fix (commit 1) should have unblocked integration, so integration failures here are real.

- [ ] **Step 3: Open the PR via gh**

```bash
gh pr create --title "chore: hygiene sweep — parseJsonBody, cron locks, onError toasts, type safety, CI fix" --body "$(cat <<'EOF'
## Summary

Sub-project 2 of the 2026-04-20 dashboard bug-fix roadmap. Eight-commit
hygiene sweep bringing the codebase into convention compliance.

### Before / after

| Category | Before | After |
|---|---|---|
| `req.json()` sites | 247 in 242 files | 0 (+ skip list if any) |
| Silent `.catch(() => {})` | 46 in 33 files | 0 non-commented |
| Unlocked crons (in scope) | 10 | 0 |
| `session.user.role as Role` in scope | 17 in 10 files | 0 |
| `useMutation` missing `onError` | 46 in 21 files | 0 |
| `tsc --noEmit` errors | 26 (all in test files) | 0 |
| Inline 3-role `ADMIN_ROLES` arrays (scoped) | 5 files | 0 |
| CI integration tests | red (missing env var) | green |

### Per-commit

1. `fix(ci): add DATABASE_URL_UNPOOLED to test workflow env`
2. `refactor(auth): extract ADMIN_ROLES constant (scoped)`
3. `fix(errors): replace 46 silent .catch(() => {}) with logger calls`
4. `fix(cron): add acquireCronLock to 10 missing crons`
5. `fix(tests): resolve 26 TS errors (24 test-file + 2 integration-test)`
6. `refactor(auth): narrow session.user.role — replace unsafe as Role`
7. `fix(hooks): add onError destructive toast to 46 mutations`
8. `refactor(api): migrate 247 req.json() sites in 242 files to parseJsonBody()`

### Deferred / out of scope

- ~178 `withApiAuth({ roles: ["owner", "head_office", "admin"] })` sites — uniform mechanical migration, warrants its own follow-up PR
- Broader `as Role` sweep (~21 sites in form handlers, component role | undefined, server-auth role validation, RoleGate)
- Parent portal mutation audit (0 today, defensive skip in commit 7)
- Zod validation additions on routes that currently trust parsed JSON
- Handler wrapping (`withApiHandler` / `withApiAuth`) additions

### Intentional-silent mutations (commit 7)

<list of any mutations that use the intentional-silent pattern with justification>

### Silent-catch (C)-category sites (commit 3)

<list of any .catch(() => {}) sites deliberately kept silent with justification>

### Codemod skip list (commit 8)

<list of any files skipped during the parseJsonBody migration; empty if full sweep succeeded>

## Test plan

- [x] `npm run build` passes
- [x] `npm test -- --run` — all 997+ tests pass (baseline 997; + parseRole tests)
- [x] `npx tsc --noEmit` — 0 errors (was 26)
- [x] `npm run lint` passes
- [x] All baseline grep audits return 0 or documented
- [x] CI green (unit + integration)
- [ ] Manual smoke: dev-server preview of one route per fix category

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Note: fill in the `<list of any...>` placeholders BEFORE running `gh pr create` — collect these during the work.

- [ ] **Step 4: Return the PR URL to the user**

The `gh pr create` command prints the PR URL. Capture and share it.

### Task 10.3: Post-PR cleanup

- [ ] **Step 1: Clean up the worktree after merge**

AFTER the PR is merged (not during review):

```bash
# From the project root
git worktree remove .worktrees/hygiene-sweep
git branch -d hygiene/sweep-2026-04-20
```

---

## Acceptance criteria (sub-project done when)

- [ ] All 8 commits on `hygiene/sweep-2026-04-20` in the prescribed order
- [ ] Each commit's individual Acceptance section met (per spec)
- [ ] `npm run build` + `npm test -- --run` + `npx tsc --noEmit` (→ 0) + `npm run lint` all clean
- [ ] Baseline grep audits all at 0 or documented skip-list
- [ ] CI green on the branch (unit + integration)
- [ ] PR opened with before/after counts table + per-commit summary + skip lists populated
- [ ] User reviews and merges PR (standard merge — preserves the 8-commit bisect history per roadmap convention)

## Risk mitigations (reminder from spec)

- **Commit 8 breaks specific routes**: per rollback procedure — isolate failing files, revert only those, document in PR body. Abort only if >20 files fail.
- **CI red after commit 1**: the fix uncovers a second unrelated CI failure — fix only what's caused by our changes; defer the rest to a follow-up.
- **Commit 7 intentional-silent mutations**: enumerated in PR body.
- **Commit 5 scope creep from tsc surprises**: tests-only scope absolute; production TS errors (if any surface) split to a separate commit.

## Rollback

Each commit is `git revert`-safe standalone. Worst-case: the PR is reverted as a whole via the merge-commit revert. No migrations, no schema, no DB writes introduced.
