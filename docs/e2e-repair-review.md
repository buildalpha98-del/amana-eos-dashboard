# E2E repair review — 11 October 2026

Review branch: `codex/amana-parent-journey`. No merge or deployment is authorised. Automatic Vercel Git deployment remains disabled for this branch.

## Failure evidence and changes

The initial browser CI run (38057552700, b0a20433) had 13 failures, 95 passes, one flaky test and 22 skips. Twelve failures also occurred on main's prior nightly (38036907253).

- Parent/login checks expected retired EOS branding, the old sessions/children UI and a Log out label. They now verify the approved Amana family home, family-scoped school link, OWNA lockdown boundary, support links and Sign out with cleared session.
- Occupancy moved under Daily Ops → Attendances → Occupancy. Tests now open that actual route.
- Recruitment redirects to Hiring; Configure contains a separate Session times tab; reimbursements now link to My Pay's expenses tab. Assertions follow those routes.
- Service navigation previously sampled visibility immediately after clicks and silently treated locator errors as false. It now waits for destination URLs and asserts specific controls.

## Contract acknowledgement

The test waited for a button named Confirm signature to disappear. The button changes its name to Signing… as soon as the request starts, allowing a premature database read. Later retries lacked an ID set by a prior test because Playwright restarts its worker.

Issuance, database verification and staff signing now run as one independently retryable test. It waits for HTTP 200, the positive Signed just now state, a persisted acknowledgement timestamp and signature, then verifies the parent page and a full reload. Cleanup selects only contracts belonging to the synthetic staff member and guards all IDs; undefined Prisma filters previously risked broad deletion in the test database.

The investigation also found a product cache mismatch: signing invalidated my-portal but the current My Contract page queries my-contracts. Both caches now invalidate. A deferred-response regression test verifies no success while pending and both invalidations after success. No authentication, signature validation or database mutation semantics changed.

## Acceptance

- No assertion skips or widened success alternatives added to suppress failures.
- Contract signature verified from browser action through API, stored state and refreshed page.
- Named navigation and parent-policy expectations agree with current approved behaviour.
- Local focused tests, build and browser checks, plus final cloud CI results, must be recorded before completion.

## Independent reviews

`contract_e2e_investigation` independently identified the pending-label race, retry dependency, cache mismatch and unsafe undefined-ID cleanup.

`e2e_repair_review` inspected the implementation directly and found no actionable defect in the ten-file code/test diff. It checked assertions against current routes, cache keys, retry independence and cleanup isolation. It did not execute the tests; runtime verification belongs to the primary agent.

## Verification

- Contract component tests: 9 passed, including delayed success/cache invalidation.
- Focused lint: zero errors, one existing unused-helper warning in the roadmap spec.
- Playwright discovers 129 tests (two dependent contract tests were combined into the issuance/signing journey, with their assertions retained).
- Full local production build passed: compile, TypeScript, all 769 pages and traces.
- Targeted browser run: all 63 tests passed, with retries disabled, against a production build and an isolated PostgreSQL database. This includes every previously failing scenario and the service-navigation flaky case.
- Cloud CI results on the final pushed revision are recorded in draft PR #327 after execution.

Suggested testing-guideline addition: a disappearing label is not a completed mutation; wait for a positive success state or response and persisted data. Tests must create their own prerequisites across worker retries, and cleanup must never pass optional IDs directly into Prisma filters. No project instruction file was changed.
