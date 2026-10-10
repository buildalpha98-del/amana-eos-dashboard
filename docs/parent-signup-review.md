# Parent signup release review — 10 October 2026

User approved the design and explicitly authorised final mobile verification followed by merge and push. Current release branch: codex/parent-enrol-release, integrated onto origin/main afbe8f67. The original review branch codex/parent-enrol-welcome preserves commit 782a4c89; its unrelated earlier ancestry was excluded. Original dashboard checkout and its unrelated log remain unchanged.

The integration retains current main's login routing, parent enrolment and draft logic, policy-document visibility, attendance/bookings rules and communication permissions. Moved helper/component implementations preserve current main, with HTTP-only route exports and type-only wrapper overloads. No auth checks or tests disabled. Independent release_integration_review inspected the integrated diff and found no actionable code defects (source review only).

Verification: all 715 unit-test files pass: 7517 tests passed, 3 skipped. Lint: 0 errors, 1123 warnings. Log /private/tmp/amana-parent-release-tests.txt. The 8GB production build exhausted its heap; a 12GB retry is pending and must pass before merge. Log /private/tmp/amana-parent-release-build.txt. Webpack is used because dependencies are symlinked outside the isolated worktree.

Final mobile browser checks on current main integration: fresh synthetic signup, mismatch prevention, Greenacre interest, incomplete-step feedback, draft save/reload, reachable sign-out all pass. All five enrolment steps fit 390px without overflow, with Agreement also fitting 320px. The latest local schema is applied only to temporary PostgreSQL at 127.0.0.1:55438, amana_ux_review. No final enrolment, legal acceptance, payment or production email submitted. Cross-domain completion attribution not exercised.

Website PR: https://github.com/buildalpha98-del/amana-oshc-website/pull/4. Local comparison http://127.0.0.1:3122/; signup http://localhost:3111/parent/signup. Final next action: confirm production build and repository checks, then merge and push as authorised.
