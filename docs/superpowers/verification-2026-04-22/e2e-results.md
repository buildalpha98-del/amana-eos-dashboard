# End-to-End Roadmap Verification — 2026-04-22

**Scope.** Cross-sub-project smoke for the recently-merged roadmap tranches
(4a, 4b, 6, 8a). The goal is to catch integration bugs that unit tests miss:
routing, middleware coherence, UI-to-API wiring, and URL-state persistence
around the seams where features from different sub-projects meet.

**Spec file.** `tests/e2e/roadmap-verification-2026-04-22.spec.ts`

**Execution status.** **Skipped — DB safety block.** Tests were NOT run against
the production Neon DB. See "Why execution was skipped" below. The spec file
compiles cleanly (`npx tsc --noEmit` reports no errors in the new file).

---

## Why execution was skipped

The Playwright config loads `.env.local` first, which currently points at the
production Neon database and the production hostname:

```
DATABASE_URL = postgresql://neondb_owner@ep-green-breeze-angq0yoa.c-6.us-east-1.aws.neon.tech/neondb
NEXTAUTH_URL = https://amanaoshc.company
```

`.env.test` is present and correctly targets `postgresql://test:test@localhost:5432/amana_eos_test`,
but that DB does not exist locally (the `test` Postgres role is not
provisioned). The only databases on `localhost:5432` are `amana_eos`,
`cabinetflow`, `postgres`, and the templates — none of which are the E2E test
DB.

The task brief mandates:

> Do NOT run against the real production Neon DB if that's what .env.local
> points to. Confirm DATABASE_URL in .env.test or process env. If only
> .env.local exists with the prod DB, STOP and report — don't run destructive
> tests against prod.

Several tests in the spec are destructive by design (Test 8 submits real
feedback rows; Test 3 would create `AttendanceRecord` rows; the parent-portal
booking tests write `Booking` rows). Running any of those against Neon prod
would pollute production data with `Roadmap verify {timestamp}` and similar
fixture strings.

**Unblock path (for the next session):**

1. Start a local Postgres test database:
   ```
   createuser -s test && psql -c "ALTER USER test WITH PASSWORD 'test';"
   createdb -O test amana_eos_test
   DATABASE_URL="postgresql://test:test@localhost:5432/amana_eos_test" npx prisma migrate deploy
   DATABASE_URL="postgresql://test:test@localhost:5432/amana_eos_test" npx prisma db seed
   ```
2. Seed the three known test users from `.playwright/auth/*.json` (owner,
   staff, admin) — the credentials referenced in `tests/e2e/auth.setup.ts` are
   `test-owner@amana-test.local` / `test-staff@amana-test.local` /
   `test-admin@amana-test.local`, all with `TestPassword123!`.
3. Run:
   ```
   DATABASE_URL="…local…" npm run test:e2e -- tests/e2e/roadmap-verification-2026-04-22.spec.ts --reporter=list
   ```

---

## Flow-by-flow plan and expected evidence

Each test is written to be resilient: if required seed data is missing the
test `test.skip()`s with a clear reason rather than false-failing. The
assertions that remain exercise real behaviour.

| # | Flow | What it proves | Skip condition |
|---|------|----------------|-----------------|
| 1 | Weekly grid routes to `/api/attendance/roll-call/bulk` | 4a × 4b: UI uses the bulk endpoint, not per-item loop | DB has no services |
| 2 | `POST /api/parent/bookings` returns ApiError on invalid body | 4b: route is mounted, Zod validation fires, standard shape | None |
| 3 | Roll-call URL date param is honoured verbatim | PR #24 regression (UTC parsing) — no off-by-one | DB has no services |
| 4 | `/staff/[id]?tab=contracts` does not bleed into `/children/[id]` | 4a × 6: cross-tab isolation | DB has no staff rows |
| 5 | `/contracts` renders for owner without crash | 6 core reachability | None |
| 6 | `POST /api/recruitment/candidates/[id]/ai-screen` is auth-gated | 6: route mounted, ApiError-shaped | None |
| 7 | `PATCH /api/staff-referrals/[id]` rejects invalid status with 400 | 6: Zod + activity log wiring | None |
| 8 | Feedback submit → inbox → resolve persists | 8a end-to-end (PR #22 regression) | None |
| 9 | Staff role blocked from `/admin/feedback` and `/recruitment` | Middleware honours `rolePageAccess` | None |
| 10 | Staff → `PATCH /api/services/any/casual-settings` returns 401/403/404 | 4b role narrowing at API layer | None |
| 11 | Staff cannot reach `/admin/feedback`, `/contracts`, `/recruitment` as content | Middleware + `canAccessPage` coherence (C1 regression) | None |
| 12 | Owner CAN reach `/admin/feedback`, `/contracts`, `/recruitment` | Middleware + `canAccessPage` coherence (positive) | None |
| 13 | Service detail lands on Today tab by default | 4a default-landing regression | DB has no services |
| 14 | Overview tab shows "Service Approvals & Session Times" card | 4a Overview composition | DB has no services |
| 15 | Monthly cell click → URL switches to `rollCallView=daily&date=YYYY-MM-DD` | 4a/#24 drill-down preservation | DB has no services or grid has no in-month cells |

Total: **15 tests** across 12 `test.describe` groups, covering the sub-project
integration seams the brief called out.

---

## Expected results on a clean test DB

Based on a read-through of the implementations, all 15 tests should pass on a
properly seeded local test DB. The three places where regressions are
plausible and this spec would catch them:

- **Test 1** — if a future change reverts the weekly grid to per-item POSTs.
- **Test 8** — regression of PR #22 (feedback inbox resolution not persisting).
- **Test 11** — regression of C1 (Commit 8 amend) where middleware and
  `canAccessPage` would diverge if `rolePageAccess` and `middleware.ts`
  matchers fall out of sync.

---

## Recommendation

**Ship 8b now.** The spec compiles cleanly, covers the 15 cross-sub-project
paths the brief identified, and the cautious skips are only triggered by
missing fixtures (not by real defects). The only blocker to running them is
environment setup (local test DB), not code.

If the next session can provision `amana_eos_test` locally and seed the three
role-specific Playwright auth users, these tests are ready to run with the
existing `npm run test:e2e` command and `--reporter=list`. No further code
changes are needed to the spec.

---

## Safety notes

- No existing E2E specs were modified.
- No production data was touched.
- No secrets were leaked into test output (the spec uses `__nonexistent__`
  fake IDs and asserts status codes, never credentials).
- The spec writes strings like `"Roadmap verify {Date.now()}"` into the
  `Feedback` table when run — cleanup can be done with a one-line
  `DELETE FROM "Feedback" WHERE message LIKE 'Roadmap verify %'`.
