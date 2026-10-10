# Parent signup and build review — 10 October 2026

Branch codex/parent-enrol-welcome, base 4fa13185, isolated worktree /private/tmp/amana-parent-enrol-review. Uncommitted; do not merge or deploy before user review. Original dashboard checkout and unrelated log unchanged.

Production build passes with webpack and 8GB Node heap (dependency symlink requires webpack). Type-only route handler overloads fix generated Next route contracts without changing auth execution. Invalid route helpers/components moved to ordinary modules with HTTP-only route exports; outdated fixtures corrected. No type checks disabled.

479 unique tests / 44 files pass; focused 14-test rerun passes. Lint 0 errors / 1121 existing warnings. Build log /private/tmp/amana-parent-production-build.txt. Independent build_contract_review found two test defects, both fixed and clean on re-review. Prior signup source reviews clean.

Local browser checks: signup, mismatch prevention, duplicate-account guidance, allowed centre context, incomplete-step feedback, saved draft reload, sign-out and returning sign-in pass against synthetic local PostgreSQL only (127.0.0.1:55438, amana_ux_review). No final enrolment, legal acceptance, payment or live email submitted; cross-domain completion attribution unverified. Preview http://localhost:3111/parent/signup, local runner /private/tmp/amana-parent-run-local.py.

Website comparison http://127.0.0.1:3122/. User visual review next; nothing merged, pushed or deployed.
