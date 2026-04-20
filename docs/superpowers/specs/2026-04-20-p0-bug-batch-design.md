# Sub-project 1 — P0 Visible Bug Batch

**Date**: 2026-04-20
**Status**: Draft
**Parent roadmap**: [`2026-04-20-dashboard-bugfix-roadmap.md`](./2026-04-20-dashboard-bugfix-roadmap.md)

## Overview

Fix 15 bugs total (14 user-reported visible bugs and 1 auth/security bug — the auth bug is item #14 in the table, not a separate count), shipping as a single feature branch / single PR. Each fix is root-cause, not a symptom patch. Each UI-observable fix gets a regression test or Playwright scenario in the same PR.

No new features, no module rebuilds, no cross-cutting refactors — those are Sub-projects 2–9.

## In scope — bugs to fix

| # | Area | Symptom | Root-cause evidence | Fix approach | Regression test |
|---|------|---------|---------------------|--------------|-----------------|
| 1 | **Contracts** | POST/PATCH returns `"Invalid input: expected string, null"` | Zod schema requires `z.string()` on a field the UI sometimes submits as `null` (likely an optional text field) | Locate the Zod schema for contracts POST/PATCH; convert affected fields to `z.string().nullable().optional()` to match real UI payload; re-test save with empty optional fields | API test: create contract with null optional field |
| 2 | **Recruitment / New Vacancy** | Modal open → `d.map is not a function` crash | [NewVacancyModal.tsx:30](../../src/components/recruitment/NewVacancyModal.tsx): `return d.services \|\| d;` — but `/api/services` paginated path ([services/route.ts:64](../../src/app/api/services/route.ts:64)) returns `{ items, total, page, ... }`, so `d.services` is undefined and fallback returns `{items, total, page}` which has no `.map`. Confirmed root cause. | Replace with: `const list = Array.isArray(d) ? d : (d.items ?? d.services ?? []);` | Component test: mock `/api/services` returning `{ items: [...] }` and verify no crash |
| 3 | **Timesheets** | `POST /api/timesheets` → Internal Server Error | [timesheets/route.ts:41](../../src/app/api/timesheets/route.ts) and `[id]/entries/route.ts:96` use `where: where as any` / `data: entriesToCreate as any` — masks a Prisma type mismatch | Replace `as any` with typed Prisma input types (`Prisma.TimesheetWhereInput`, `Prisma.TimesheetEntryCreateManyInput[]`); add Zod validation on request body; run the failing case locally to confirm it's the same issue | API test: happy path create; validation test: reject bad payload with 400 |
| 4 | **Documents** | PDF upload fails | Unknown root cause — needs diagnosis. Likely MIME whitelist rejects `application/pdf`, or Vercel Blob size/type config, or a client-side validator | Trace the upload pipeline: form → client hook → `POST /api/documents` (or similar) → Blob storage. Check MIME filter, size limits, Content-Type handling. Fix at the first broken link. | E2E: upload a small PDF, assert success toast, assert file appears in list |
| 5 | **Documents** | Open a document → "FORBIDDEN" | Auth check rejects; either role list too strict for the opener, or ownership check miswired, or signed-URL generation fails | **Diagnostic step:** reproduce as a non-admin role, capture the exact session role and the document record's scope fields. Then audit `/api/documents/[id]` GET: role gate + service-scope gate + signed-URL code path. Fix the specific check that's rejecting the legitimate user — do not broaden auth beyond intent. | API test: each role (admin, owner, coordinator, member, staff) → correct 200/403 matrix for owned + unowned docs |
| 6 | **Training / LMS** | Click into a training module → nothing opens | Unknown — likely a broken link (wrong href), missing route, or the click handler errors silently | Trace LMS list item click → navigate → module page. Fix broken wiring. If route is missing, confirm with user whether to build it (may fall to Sub-project 5) vs. disable the click. | E2E: click a module, assert module content renders |
| 7 | **Weekly Pulse** | One character at a time — input loses focus after each keystroke | [WeeklyPulseTab.tsx:79-107](../../src/components/communication/WeeklyPulseTab.tsx): `useEffect` deps include `myPulses` object ref which changes on every `useQuery` refetch → effect resets form state mid-typing. Existing `loadedWeekRef` guard only handles week change, not intra-week refetch. | Add `staleTime: Infinity` + `refetchOnWindowFocus: false` to `usePulses` for the current-week query (or extract a stable `myPulse` via `useMemo` keyed on `myPulse.id`); remove state-reset inside the effect unless `weekOf` actually changed. Invalidate manually on submit. | Component test: render, type 50 chars rapidly, assert full string landed in textarea |
| 8 | **Communication editor** | Same one-char-at-a-time bug in broader Communication UI | Likely same pattern as #7 — stale query ref triggering re-render/reset | Audit `/communication` for same anti-pattern; apply same fix | Component test analogous to #7 |
| 9 | **Enrolments / Child detail** | Selecting a child glitches the UI | Unknown — likely stale state on selection, controlled input using wrong `value`, or a focused useEffect running on every render | Reproduce; capture the React component tree during glitch; root-cause to state or effect loop; fix. | E2E: open enrolments, click 3 different children in sequence, assert no glitch |
| 10 | **Projects** | "New project" / "Launch from Template" freezes UI, forces app restart | Likely an infinite render loop or an error thrown inside a modal with no error boundary | Add error boundary around the modal to capture the throw; fix root cause (likely a state-update-in-render or an unstable dependency triggering mount loop) | Component test: open + close new-project modal + template modal; no errors in console |
| 11 | **Postcode field** | Accepts only 3 chars (user report) — should be 4 | Spec-phase grep found **no** `slice(0, 3)`, `maxLength={3}`, or `z.string().max(3)` on any postcode field. Enrol steps use `slice(0, 4)`. CRM `CreateLeadModal` and parent `account/page.tsx` have **no** length limit at all (raw `onChange={setPostcode(e.target.value)}`). Bug as described may not exist, or may be on a form not yet located, or may be a UX misperception (e.g. font sizing causing the 4th char to look clipped). | **Diagnostic step:** confirm with Jayden which specific screen shows the 3-char limit, then fix there. If no such screen exists, scope-shrink this bug to zero work and note in PR. | Only if bug is real: unit test submitting 4-char postcode, assert accepted |
| 12 | **LMS completion tick** | After completing a course, the green tick doesn't appear on staff portal | Mutation fires but no `queryClient.invalidateQueries(...)` on success; list view shows stale data | Audit the LMS completion mutation; add `onSuccess: () => queryClient.invalidateQueries(["lms-courses"])` (or the actual key); confirm the list query re-fetches | E2E: complete a mock course, assert tick appears without page reload |
| 13 | **Issues "Show Closed" toggle** | Toggling reveals no closed issues | Toggle IS wired ([issues/page.tsx:220-223](../../src/app/(dashboard)/issues/page.tsx:220)). Filter works. Most likely the `issues` query itself is **excluding closed at the API level** — need to confirm | Check `GET /api/issues` and `useIssues` hook: if the query filters by status server-side and never requests closed, fix by fetching all statuses; if the query is fine, check the board-view rendering of the closed column | E2E: set one issue to closed, toggle "Show Closed", assert issue visible |
| 14 | **Report Issue / Internal Feedback GET** | Endpoint claims admin-only, no role enforcement — security bug | [internal-feedback/route.ts:13](../../src/app/api/internal-feedback/route.ts:13): `withApiAuth(...)` with no `{ roles: ["admin", "head_office", "owner"] }` option | Add role option to the GET wrapper; match role list to intent ("admin+") | API test: each role → 200/403 matrix |

**Note on #4, #5, #6, #9, #10, #11, #13:** root cause requires live reproduction or user clarification. Diagnostic step happens in the implementation phase, not during spec-writing. #8 is NOT in this list — its root cause is already known (same stale-query-ref pattern as #7).

## Explicitly out of scope

- **Report Issue admin inbox UI** (build it in Sub-project 8)
- **Contracts template system** (Sub-project 6)
- **Recruitment hiring pipeline, candidates, configurable stages** (Sub-project 6)
- **128-route `parseJsonBody` migration** (Sub-project 2)
- **11 missing mutation `onError` toasts** (Sub-project 2 — unless the fix for a bug in this sub-project is literally adding an `onError`, in which case it goes in here)
- **6 cron `acquireCronLock` additions** (Sub-project 2)
- **13 TypeScript compile errors** (Sub-project 2)
- **Multi-centre document select**, **Policies tab**, **Audit calendar editability** (Sub-project 5)
- Any UI polish, rename, or refactor beyond what's necessary to resolve a listed bug

## Diagnostic approach

For bugs with certain root causes (#1, #2, #3, #7, #8, #12, #14) — go straight to fix + test.

For bugs needing live reproduction or user clarification (#4, #5, #6, #9, #10, #11, #13):
1. Start the dev server
2. Reproduce the bug in a browser via `preview_*` tools (see preview workflow in global CLAUDE.md)
3. Capture the console error / network error / state snapshot
4. Read the code path implied by the trace
5. Formulate fix
6. Verify the fix in the browser
7. Write a regression test that would have caught the bug

## Testing & verification plan

**Per-bug:**
- At minimum: 1 regression test per bug (unit, component, API, or E2E — whichever is most appropriate for that bug's surface)
- Where the bug is UI-observable: dev-server preview check (via `preview_*` tools) before marking the bug done

**Sweep at the end of the sub-project, before PR:**
- `npm run build` — must pass clean
- `npm test` — all existing tests still pass
- `npx tsc --noEmit` — no new TS errors introduced (pre-existing 13 errors in test files tracked as Sub-project 2)
- `npm run lint` — no new lint errors
- Manual smoke: open each fixed screen in the dev server, confirm the bug is gone + no regression to adjacent flows
- Confirm role-permissions still align (no new nav items, so this should be a no-op, but per global CLAUDE.md memory note we check)

## Sequencing within the implementation phase

Diagnose in parallel (research subagents), fix in an order that minimises merge-conflict risk:

1. **Schema / validation fixes first** (#1 Contracts, #3 Timesheets) — backend, limited blast radius
2. **Known-cause hook / query fixes** (#7 Pulse, #8 Communication, #12 LMS tick) — same-shape fixes, cheap
3. **Auth fix** (#14 Report Issue GET) — one-liner
4. **Known-cause UI wiring** (#2 Recruitment defensive parse) — one-liner
5. **Live-diagnosis bugs, ordered cheapest → expensive:** #11 Postcode (need one user clarification) → #13 Issues filter (trace hook) → #5 Documents FORBIDDEN (auth trace) → #4 Documents PDF upload (pipeline trace) → #6 Training module (route trace) → #9 Enrolments glitch (React tree trace) → #10 Projects glitch (error boundary + trace)

Each fix = its own commit on the feature branch, named `fix(bug-N): <short description>` (e.g. `fix(bug-7): stable pulse query to prevent state reset`), so the PR has a self-documenting bisect history.

## Acceptance criteria (sub-project done when)

- [ ] All 15 bugs (items #1–#14 in the table) shipped on a feature branch, OR bugs determined to not exist after diagnosis have a documented note in the PR
- [ ] Every fix has a matching regression test in the same commit
- [ ] `npm run build` + `npm test` + `npm run lint` all clean
- [ ] No new `as any` casts introduced; existing ones touched by this PR are replaced with typed inputs
- [ ] No new Prisma migrations introduced (this is a bug-fix sub-project; schema changes belong in feature sub-projects)
- [ ] Role-permissions (`src/lib/role-permissions.ts`) still aligned with `nav-config.ts` per the gotcha in `MEMORY.md` (no-op expected since no new nav items)
- [ ] Dev-server preview confirms every UI-observable bug is gone
- [ ] PR description lists each bug by number, the root cause, the fix, and the test added
- [ ] User reviews and approves PR

## Open questions (resolve during implementation)

These are questions the spec cannot answer from static analysis — they must be resolved in the implementation phase:

- **Q1 (Bug #4 Documents PDF upload):** which pipeline — direct client-to-Blob upload, or via a `/api/documents` POST route? Ground truth needs reading the current upload code.
- **Q2 (Bug #6 Training module):** does the module detail route `/lms/courses/[id]` / `/training/[id]` exist today? If not, this is a missing route — defer to Sub-project 5 (LMS is owned there) and disable the click in this sub-project, OR escalate to user.
- **Q3 (Bug #11 Postcode):** grep found no 3-char limit on any postcode field. User confirmation needed on which specific screen this occurs, OR the bug may not exist.
- **Q4 (Bug #13 Issues Show Closed):** is the bug in the API query filter or in the list rendering? Toggle state is wired ([issues/page.tsx:220-223](../../src/app/(dashboard)/issues/page.tsx:220)); need to read `useIssues` hook and `/api/issues` to find the real break.

These Qs don't block spec approval; they're flagged for the implementation plan (Sub-project 1's `plan.md`).
