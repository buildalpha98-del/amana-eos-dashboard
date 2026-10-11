# Parent email login confirmation — review

Branch: `codex/parent-email-login-confirmation`.
Base: main after branded enrolment PR #328 (`39261889`).
Status: implemented for review; production release requires user approval.

## Problem and behavior

Two freshly delivered Outlook login links reached the expired-link screen before their one-hour expiry. Both had been marked used. The old verification GET consumed tokens immediately; email inspection or duplicate requests could consume them, and concurrent requests were not atomically fenced. The specific source of the observed duplicate redemption remains unproven.

New emails open `/parent/login/confirm` with the credential in a URL fragment. The Amana confirmation page removes that fragment after hydration and redeems only after the parent presses **Continue to my account**. Existing emailed `/api/parent/auth/verify?token=…` URLs still work: GET and HEAD redirect to confirmation without consuming or looking up a token.

POST accepts same-origin JSON only. Read-only session preparation has a 20-second deadline; late work cannot claim a token. The atomic claim runs in a bounded database transaction (3-second statement timeout, 5-second transaction timeout, 1-second connection wait). Client and handler response timers do not race the write. A database timeout rolls back, leaving the token usable. Session cookies, account activation checks, session revocation versions and legacy parent access are retained.

Sentry is disabled before initialization for this confirmation document; Speed Insights is not mounted there. The page is dynamic, uses no-referrer/no-store, and is excluded from service-worker caching. Successful login fully navigates to the family hub, restoring the normal authenticated experience. Public screens do not start the shell's authenticated messages query.

Login and password-reset emails use a transactional footer with account-access wording and no unsubscribe placeholder. Marketing layout behavior is preserved.

## Acceptance and review

- Repeated GET/HEAD inspection leaves tokens unused.
- Explicit desktop/mobile confirmation creates a usable session once.
- Concurrent and replay attempts cannot create another session.
- Expired links explain recovery; temporary failures allow retry.
- Slow preparation and blocked database writes cannot consume a token after an error.
- The confirmation page has no horizontal overflow; keyboard activation and Axe checks pass.
- Transactional email footer has no unresolved unsubscribe placeholder, including with staff template overrides.

Independent reviewer: `/root/login_confirmation_review`, read-only design/code review of the branch diff. Initial findings: credential telemetry before hydration and a response timeout racing token consumption. Both resolved and focused re-review found no remaining actionable defects. Reviewer could not independently execute tests because of the shared dependency cache permissions. Primary verification includes actual PostgreSQL rollback and concurrency browser tests.

## Verification

- Full repository unit suite: 730 files passed; 7,667 tests passed and 3 skipped.
- Integration: 78/78 passed on an isolated local database, migrations replayed.
- New login browser checks: 6/6 passed on the local development server, including desktop/mobile Axe, keyboard, replay/concurrency and real database lock rollback.
- Full repository lint: no errors; existing warnings remain. Final changed-file lint: clean.
- Production build and existing parent portal browser regressions: in progress.

The initial local integration attempt was rejected by test-database naming guards. A correctly named isolated database was created without weakening the guards. Refreshing the generated Prisma client resolved the separate missing StatementDelivery model in local checks. No schema or migration changes are part of this branch.

## Remaining parent journey

After review and an approved production release, request a fresh login email in the authorized test inbox and verify the Outlook-to-portal path live. Then continue Greenacre enrolment, parent receipt/confirmation delivery and OWNA handoff. Legal enrolment and direct-debit acceptance must be performed by the user. This branch has not submitted an enrolment or changed a real family's handoff records.
