# Roster system — design decisions

> **Why this doc exists.** The staff-roster system in this codebase is the
> result of ~20 PRs landed across 2026-05-02 → 2026-05-04, plus the
> earlier staff-dashboard-v2 work. The "what" is captured per-PR; the
> "why" is scattered across commit messages, code comments, and Slack
> threads. This file consolidates the architectural decisions that
> would otherwise be folklore — written for someone porting the system
> to a different app, or onboarding to it cold.
>
> **Treat this as the canonical source for design intent.** If you're
> changing one of these patterns, update the doc in the same PR.

---

## 1. Race-safe assignment via `updateMany`

### Pattern

When a write resolves a contested resource (claim an open shift, release
a claimed shift, accept a swap), the assignment is done via
`prisma.rosterShift.updateMany({ where: { id, ...preconditions }, data: {...} })`
instead of read-then-write. The preconditions are the same conditions
the application-layer check would have asserted; baking them into the
SQL `WHERE` clause means the database resolves concurrency, not us.

Concrete example (PR #53, claim):

```ts
// Pre-check at the application layer for a friendly fast-path 409.
if (shift.userId) throw ApiError.conflict("This shift has already been claimed");

// The actual assignment — race-safe.
const result = await prisma.rosterShift.updateMany({
  where: { id, userId: null },                 // ← guard
  data:  { userId: session.user.id, staffName: claimer.name },
});
if (result.count === 0) {
  // Another request beat us to it between the pre-check and the update.
  throw ApiError.conflict("This shift was just claimed by another staff member");
}
```

The pre-check is purely UX — it gives a fast 409 with a useful message
when the contention is detectable up front. The `updateMany` filter is
the real concurrency boundary.

### Why

Two staff hitting "Claim" within the same millisecond would both pass a
read-then-write check, and the second `update` would silently overwrite
the first. The `updateMany` filter ensures only one winner: the loser
sees `count: 0` and gets a clean 409.

### Where it shows up

- `src/app/api/roster/shifts/[id]/claim/route.ts` — `where: { id, userId: null }`
- `src/app/api/roster/shifts/[id]/release/route.ts` — `where: { id, userId: caller.id, actualStart: null }`
- `src/app/api/roster/shifts/[id]/clock-in/route.ts` — `where: { id, actualStart: null }`
- `src/app/api/roster/shifts/[id]/clock-out/route.ts` — `where: { id, actualStart: { not: null }, actualEnd: null }`

### Translation note

If your target ORM doesn't have `updateMany` (e.g. some Drizzle
configurations), use a single `UPDATE ... WHERE ...` with the same
guard predicates and check the affected-row count. The pattern is
about the SQL `WHERE` clause, not the Prisma method name.

---

## 2. Idempotent endpoints

### Pattern

Endpoints that resolve a state transition return success, not 409, when
the requested state is already in effect. The response payload tells
the caller whether it was a no-op.

Concrete example (PR #64, release):

```ts
if (shift.userId === null) {
  return NextResponse.json({ ok: true, alreadyOpen: true }, { status: 200 });
}
```

### Why

A user double-tapping "Release" on a flaky mobile connection sees the
toast fire twice but neither attempt errors. The second tap is a no-op,
not a "Couldn't release that shift — already open" error that would
imply they did something wrong. Same logic applies to clock-in (already
clocked in → return current state with `alreadyClockedIn: true`) and
publish (re-publishing a draft-free week → `publishedCount: 0`).

### Translation note

Distinguish "the state you asked for is already true" (200, with a
flag) from "the state you asked for is impossible from the current
state" (409, with an error). Releasing an already-open shift is the
former. Releasing a clocked-in shift is the latter.

---

## 3. `HH:mm` strings + `@db.Date` for shift times

### Pattern

`RosterShift.shiftStart` and `shiftEnd` are stored as 5-character
`"HH:mm"` strings. `RosterShift.date` is stored as `@db.Date` (no time
component).

```prisma
model RosterShift {
  date        DateTime @db.Date
  shiftStart  String   // "HH:mm"
  shiftEnd    String   // "HH:mm"
  // ...
  actualStart DateTime?  // ← clocked-in timestamps ARE full DateTime
  actualEnd   DateTime?
}
```

### Why

Shifts repeat across days at the same wall-clock time. "ASC educator
3pm–6pm" should mean 3pm local time on every Monday, regardless of
DST. A full `DateTime` would silently drift in/out of DST every six
months and force the entire app to reason about timezones at every
display + comparison site.

`HH:mm` strings sidestep that — the string is the source of truth,
the database doesn't try to "help" with timezone conversion, and date
arithmetic is cheap (`hoursBetween("15:00", "18:00")` is a sub-line
helper).

The `actualStart` / `actualEnd` columns ARE full `DateTime` because
they record a moment-in-time event (the user pressed Clock In at this
specific instant), not a recurring wall-clock pattern.

### Where it shows up

- `prisma/schema.prisma` model RosterShift
- `src/lib/roster-cost.ts` — `hoursBetween`, `timeToMinutes`
- `src/lib/timeclock-pick.ts` — converts shift `HH:mm` + shift `date` into a
  comparable `Date` only at the moment of comparison, not at storage time

### Translation note

If your target stack has first-class "time of day" + "date" types
(Postgres `time` + `date`, Swift `Date` + `DateInterval`), prefer those
over `String` + `Date`. The principle is: don't store a `DateTime`
when you mean "a wall-clock time on a recurring date."

---

## 4. Pure helpers split from routes

### Pattern

Every non-trivial route has a pure helper extracted into `src/lib/`,
exporting functions that take primitives + return primitives. The
route is glue: load DB rows → call helper → return JSON.

| Route | Pure helper |
|-------|-------------|
| `/api/roster/cost-projection` | `src/lib/roster-cost.ts` → `projectCost`, `payRateForShift` |
| `/api/roster/clock-in/auto` | `src/lib/timeclock-pick.ts` → `pickEligibleShift`, `inferSessionType` |
| `/api/services/[id]/cert-expiry-summary` | `src/lib/cert-expiry-summary.ts` → `bucketCertExpiry` |
| Variance badges in the grid | `src/lib/timeclock-variance.ts` → `computeVariance`, `varianceLabel` |
| Leadership recent-incidents widget | `src/lib/incident-priority.ts` → `priorityScore`, `pickTopRecentIncidents` |
| Ratio breach banner | `src/lib/roster-ratio.ts` → `computeRatio` |
| Cert expiry guard | `src/app/api/roster/_lib/cert-guard.ts` |

### Why

- **Testability.** Pure helpers are fast unit tests with no `prismaMock`
  setup. The roster system has ~80 helper-only test cases that run in
  under a second each.
- **Reusability.** `pickEligibleShift` is called by both the
  self-service and the kiosk clock-in routes. `bucketCertExpiry` will
  be called by a future leadership-rollup endpoint.
- **Clarity at the route boundary.** When the route file is just
  "load → helper → respond," the auth + scoping logic isn't drowning
  in business rules.

### Translation note

The split is cheap and almost never wrong. If you're tempted to inline
"this is just a single sort" — that's the moment to split it; the
test you'll write next week is what justifies the extraction today.

---

## 5. Service-scoping at the SQL boundary

### Pattern

Cross-service authorization is enforced in the database `WHERE` clause
via two helpers, called near the top of every multi-tenant route:

```ts
const { serviceIds } = await getCentreScope(session);
const stateScope     = getStateScope(session);

const where: Record<string, unknown> = { /* ...other filters */ };
if (serviceIds !== null) applyCentreFilter(where, serviceIds);
if (stateScope)          where.service = { state: stateScope };
```

`getCentreScope` returns `{ serviceIds: ["svc-1", "svc-7"] }` for a
`member` user attached to two services, or `{ serviceIds: null }` for
admin / head_office / owner (who see everything). `applyCentreFilter`
expands the array onto the `where` object.

### Why

- **Security.** A bug in the application-layer "did they pass auth?"
  check would otherwise leak rows from other services. With the filter
  baked into SQL, the worst case is "the query returns nothing" —
  not "the query returns rows the caller shouldn't see."
- **Consistency.** Pagination, counts, and `findMany` all use the
  same `where` filter. There's no risk of "the count says 5 but the
  list returns 8" when scope drift is possible.
- **Performance.** Postgres can use the `(serviceId, ...)` index for
  filtering. Filtering in JS would mean fetching all rows and
  discarding most.

### Where it shows up

- `src/lib/centre-scope.ts` — both helpers
- `src/lib/service-scope.ts` — state-scope (head_office is region-scoped)
- Every cross-service route: `/api/incidents`, `/api/incidents/recent`,
  `/api/audits`, `/api/children`, `/api/users` (when listing)

### Translation note

If your target has a single-tenant model (no multi-centre concept),
skip the helpers and the `serviceId` filter. If your target has a
different scoping concept (region, organization, school district),
preserve the SQL-boundary discipline — extract a helper named for
your concept (`getRegionScope` etc.) and use it identically.

---

## 6. Quiet-by-default UI

### Pattern

Cards, banners, and sidebar surfaces hide themselves entirely when the
underlying data is empty. They do **not** show "No items" placeholder
text, "All good!" badges, or empty-state illustrations.

```tsx
// ServiceCertExpiryCard
if (totalProblems === 0) return null;

// OpenShiftsCard
if (shifts.length === 0) return null;

// LeadershipRecentIncidentsCard
if (data.incidents.length === 0) return null;
```

### Why

The dashboard is dense — pages have 6–10 cards each. Reserving real
estate for "nothing to show" cards trains users to ignore them. By
hiding empty cards, the cards that ARE visible mean "this needs your
attention."

### Translation note

Counter-pattern: cards that ARE the primary purpose of a page (e.g.
the staff-list table on `/staff`) should still show an empty state,
because their absence would be confusing. The rule applies to
**secondary informational cards** — risk surfaces, expiring-soon
banners, "you have N tasks" widgets — that are noise when they're
green.

---

## 7. Single source of truth for thresholds

### Pattern

When a domain concept has graduated thresholds (cert expiry: 30/14/7
days; clock-in variance: 5min on-time / 6-29min late / 30+min very
late), those numbers are defined once and imported into every site
that uses them — the cron, the email template, the on-screen card,
the test fixtures.

### Why

The cert-expiry alert system is the worst-case study: if the cron
emails about certs ≤30 days but the on-screen card only highlights
≤7 days, an admin sees no banner and assumes nothing is wrong while
their inbox has 12 alerts. Even worse if the email bell-counter and
the email content disagree.

### Where it shows up

- `src/lib/cert-expiry-summary.ts` — `classifyStatus(days)` is the
  single classifier; the cron at `/api/cron/compliance-alerts` and
  the per-service `ServiceCertExpiryCard` both rely on it.
- `src/lib/timeclock-variance.ts` — `computeVariance` is shared
  between the grid badge, the timesheet export, and (eventually) the
  payroll proration that lives in `src/lib/roster-cost.ts`.

### Translation note

If you're tempted to hardcode "30 days" in three different files —
extract a constant or a helper, even if it feels like overkill at
two-call-sites scope. The third call site shows up six months later.

---

## 8. Cert-expiry guard on assignment **AND** on claim

### Pattern

The same `assertStaffCertsValidForShift({ userId, shiftDate })` helper
is called from BOTH:

- `POST /api/roster/shifts` (admin assigns a shift to a user)
- `POST /api/roster/shifts/[id]/claim` (staff claims an open shift)

Not just one. Both.

### Why

Open shifts let staff self-assign without admin involvement. If the
guard ran only on the admin-assignment path, an educator with an
expired WWCC could legally claim an open shift and the system wouldn't
know. The compliance regime doesn't care which code path created the
assignment — it cares about the resulting `(userId, shiftDate)` pair.

### Translation note

Audit every code path that produces an assignment. Currently in this
codebase: create shift, claim open shift, accept swap. Each one runs
the guard. A future "shift template auto-fill" or "cron auto-assign"
must do the same.

---

## 9. Two-tap confirm for low-frequency destructive UI

### Pattern

Buttons that perform a hard action (release a shift, revoke a kiosk,
delete a template) do NOT use a separate confirmation dialog. Instead,
the button itself flips into a confirm state for ~5 seconds:

```tsx
<button onClick={() => {
  if (!confirming) { setConfirming(true); return; }
  setConfirming(false);
  onAction();
}}>
  {confirming ? "Tap to confirm" : "Release"}
</button>
```

### Why

A modal dialog for "Are you sure?" interrupts flow. Two-tap-confirm is
fast for confident users (two consecutive taps) and forgiving for
accidental ones (the timeout undoes it). It's the right tradeoff for
actions that are reversible-with-effort but not catastrophic.

### Where it shows up

- Release shift on `MyUpcomingShiftsCard`
- Revoke kiosk on `KiosksPanel`
- Delete shift template on `ShiftTemplatesPanel`

### Translation note

For genuinely destructive irreversible actions (delete a child's
attendance record, terminate a contract), keep a full modal. The
two-tap pattern is for medium-stakes actions where the user is right
99% of the time and the 1% accidental tap undoes itself.

---

## 10. Side-effect fan-out runs OUTSIDE the transaction

### Pattern

Routes that both write DB rows AND send emails / hit external APIs
commit the DB transaction first, then run the fan-out outside.

```ts
const result = await prisma.$transaction(async (tx) => {
  // ... updateMany, createMany — all the DB writes
  return { /* data the fan-out needs */ };
});

// Fan-out runs after commit. Wrap in try/catch so an email meltdown
// doesn't fail the request whose user-visible work already succeeded.
try {
  await notifyOpenShiftsPosted(prisma, { ... });
} catch (err) {
  logger.error("publish: fan-out failed", { err, ... });
}
```

### Why

Email infrastructure failures (Resend down, recipient list invalid,
rate limit hit) shouldn't roll back the publish. The user already
saw the publish succeed; if the email fails the worst case is "the
banner says published but staff didn't get the email" — recoverable
by re-firing the notification later. The OPPOSITE order — emails
inside the transaction — would mean a publish silently fails because
SMTP timed out, which is much worse.

### Where it shows up

- `src/app/api/roster/publish/route.ts` — open-shift fan-out
- `src/app/api/roster/shifts/[id]/claim/route.ts` — would put any
  future "claim notification to admin" outside the transaction
- The compliance-alerts cron

### Translation note

The principle is: keep transactions short and DB-only. Side effects
(email, push notifications, third-party APIs) run after commit, with
their own error handling. If the side-effect MUST happen
synchronously with the DB write, you've designed something wrong
that needs an outbox table.

---

## Anti-patterns to refuse

A few things that keep getting suggested and we keep saying no to.
Listing them here saves the next reviewer the discussion.

- **`as Role` unsafe casts** to coerce session role types. Use a type
  guard or validate against the Prisma enum at the boundary.
- **Storing wall-clock times as full `DateTime`** (see #3 above).
- **`mockResolvedValueOnce` chains** in route tests. They leak state
  between tests and break when the route's call order changes. Use
  `mockImplementation` with input-based routing — see
  `src/__tests__/helpers/prisma-mock.ts`.
- **`raw fetch()` in client hooks** — use `fetchApi` / `mutateApi`
  from `src/lib/fetch-api.ts` so timeout, error context, and
  content-type validation are uniform.
- **Sending email from inside a transaction** (see #10).
- **Application-layer concurrency checks without a SQL guard**
  (see #1).

---

## When you change one of these decisions

Don't quietly. Open a PR titled `change(roster): <decision>` that
updates this doc in the same change. Reviewers should be able to
read the diff and understand why the rule changed.
