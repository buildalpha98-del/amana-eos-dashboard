# OWNA handoff — review build

Branch: `codex/amana-parent-journey`. Feature commit: `c1257b3d`. Implementation is local and unmerged. No production records, OWNA invitations or emails were changed for this feature.

## Scope and acceptance

The internal enrolment list displays OWNA progress. Its detail drawer records an accountable owner, next action and four evidence-backed checks: all children linked in OWNA, invitation sent or existing access verified, parent app access, and agreed first sessions for every child. Checks cover all assigned children and services, rather than only the primary child. Staff can reopen checks and inspect recent activity; the full audit remains stored.

Saving is a staff attestation, not an OWNA integration. No automatic invitation, OWNA record creation or enrolment confirmation is implied. Existing families can record existing access without sending another invitation. The separate Amana resend button is explicitly labelled.

Authorisation is checked for the enrolment and every child's service. Raw handoff evidence is stripped from list responses. Mutations use serializable transactions, revision checks and atomic actor-stamped audit records. Concurrent edits return a reload conflict. Completion requires confirmed placement and active child records.

Real changes to child association, service, status or booking preferences, and enrolment status/service, persistently invalidate checks. Returning to the prior placement does not restore old completion. Routine unchanged OWNA syncs do not invalidate checks. Old evidence is preserved. A reasoned reset is required before checking again.

## Database and release boundary

New additive migration: `20261010190000_enrolment_owna_handoff`. It creates the separate handoff table and database triggers; both are required before releasing the application. Prisma schema push alone will not install the triggers.

The repository's existing migration history cannot replay in a Prisma shadow database: `20260422120000_add_enrolment_owna_exported_at` references an absent `EnrolmentApplication` (P3006). The new table SQL was generated from a schema diff, then the table and triggers were applied only to the isolated localhost review database. No historic migration was rewritten or marked resolved. Before production release, verify the target's actual migration history and apply through the project's approved deployment process. Full fresh-history replay is not claimed.

`scripts/verify-owna-handoff-local.cjs` only accepts the isolated localhost review database and rolls back its synthetic transaction. It checks invalidation, reassociation, lifecycle round trips, booking changes, evidence preservation and unchanged-sync stability.

## Review and verification

Independent design review: `owna_handoff_design_review`. Identified cross-service scope, privacy and lifecycle/concurrency requirements; implemented.

Independent integrated review: `owna_handoff_integrated_review`. Found lifecycle round-trip restoration and false invalidation from generic child timestamps. Replaced timestamp invalidation with selective database triggers. Focused re-review cleared both findings and found no further actionable defect. Reviewer inspected SQL and verification script; database/browser execution was performed by the primary agent.

Browser verification used synthetic local data only: claim ownership, evidence-backed completion of all four steps, existing-family access mode, reopen first sessions, save next action, full reload and list progress persistence, and activity history. Responsive layout checked at 390px and 320px; keyboard focus reached the action buttons. The existing status filter strip scrolls horizontally; the new checklist stays within the drawer.

Automated verification:
- Full Vitest suite: 718 files passed; 7,542 tests passed, 3 skipped. Two workers were used after the first unrestricted concurrent run hit resource contention and was stopped. A known jsdom navigation diagnostic appeared without failing tests.
- New handoff regression tests: 22 passed, including authorisation, stale/concurrent edits and list evidence privacy.
- Full lint: zero errors, 1,122 warnings. A focused lint pass after final test additions also passed (one explicit-any warning in the transaction mock).
- Isolated PostgreSQL trigger verification: passed, rollback-only synthetic transaction.
- `git diff --check`: passed.
- Full production build passed (`next build --webpack`, following Prisma client generation): compilation, TypeScript, all 769 pages and build traces. The interrupted first run was rerun to completion using the isolated review environment.

## Next action

Review the local Enrolments drawer at http://localhost:3111/enrolments. The synthetic example is deliberately left at 3/4, with a first-day follow-up outstanding. Do not merge or deploy until the user approves the review and the migration release prerequisite is resolved.
