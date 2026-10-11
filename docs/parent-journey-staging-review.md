# Parent journey staging review — 11 October 2026

## Scope and environment

User approved the existing synthetic fixture for full submission in staging instead of completing payment/legal authorisation in production. Tested in the local isolated PostgreSQL database `amana_parent_login_test_20261011`, app port 3114, and local Resend-compatible capture port 3115. The app has no production email/API credentials. No real OWNA records, invitations, financial authorisations or production submissions were created.

Operational route checks used the production build from the merged login-confirmation change (395fb744; included in main 913119f1). Email corrections are on `codex/parent-welcome-email-polish`, based on main 913119f1; their templates were executed directly and the generated welcome link tested against the same confirmation route. This is not a claim that the corrections are deployed.

## Observed results

- Seeded the complete `validDraft()` and `BANK` fixtures from `src/__tests__/api/parent-enrolment-submit.test.ts`, adapting synthetic names, school and start date to Greenacre and 19 October. Document URLs remain fixture references; live file uploading was not exercised.
- Real authenticated submission returned HTTP 200, matched the test Greenacre service, and created one pending child. Required second-carer validation rejected an incomplete fixture first.
- Captured the actual receipt and secondary-carer notification locally.
- Approval initially returned HTTP 400 for missing afternoon-room configuration. Added a synthetic room to the isolated test service; approval then returned HTTP 200, activated the child and generated eight test bookings. No production service configuration was changed.
- Captured the actual Greenacre welcome invitations and approval email. These are local captures, not delivered inbox messages. The welcome capture exposed an unresolved unsubscribe token.
- Authenticated parent Home and My Centre rendered the matched Greenacre service, confirmed enrolment, OWNA responsibilities and flexible afternoon pickup. At 390×844 neither screen overflowed horizontally. Empty centre-content fallback appeared because the test seed has only a synthetic address.
- New welcome email link showed the explicit Continue button and successfully authenticated to the parent hub. A first test URL assertion incorrectly excluded the hub's `?v2=1` query; corrected the test matcher to inspect the pathname.
- OWNA handoff refused completion before approval (400). Claim, four simulated checklist completions and audit history persisted. A stale revision was rejected (409). Every test completion is explicitly labelled a staging simulation; it provides no evidence of an actual OWNA action.
- Seeded the repository's canonical First Session Onboarding sequence. Approval set the enquiry to `first_session` with the requested first-session date and created six pending executions.

## Email corrections built for review

- Welcome/resend now uses `/parent/login/confirm#token=…`, matching the already-approved explicit sign-in interaction.
- Welcome/resend uses the existing branded transactional footer; no unresolved marketing unsubscribe token.
- Receipt and approval use the existing full Amana parent email layout.
- Welcome HTML escapes parent, child and centre names.
- Rejected or suppressed provider sends are no longer recorded as successful welcome invitations. Provider acceptance still does not establish inbox delivery.
- Shared confirmation copy refers parents to the email for expiry, accommodating both short login links and 30-day welcome invites.

## Follow-up decisions and verification limits

The canonical sequence schedules reminder −24h, day-1 check-in +24h, day-3 +72h, week-2 +336h, referral +1080h (day 45) and NPS +1440h (day 60). It does not currently provide a day-30 review. Recommend agreeing on an explicit first-month feedback step before changing communications timing. Scheduling was observed; future sends/cron delivery were not exercised.

Actual Greenacre meeting points, contacts, documents and service content still need checking in the live parent account. Actual OWNA child transfer, invitation delivery, parent app access and first booked sessions need genuine staff/provider evidence. Keep the live checklist unchecked until that evidence exists. The production test draft remains partial and unsubmitted.

Independent reviews: `/root/welcome_email_review` inspected the welcome increment and then the integrated changes, with no new actionable findings. Its observed one-hour/30-day copy mismatch was fixed. The reviewer did not run tests or verify delivery; primary checks and visual review are recorded below.

## Verification

Full unit rerun passed all 733 files: 7,726 tests passed, 3 skipped. Lint passed with 0 errors and 1,115 existing warnings. Focused checks after the final auth-test typing correction passed 25 tests. TypeScript rerun passed (`tsc --noEmit`). `git diff --check` passed. Mobile email previews and parent screens were visually inspected; corrected welcome-link browser check exited successfully.

The initial full unit command incorrectly inherited the browser fixture's `MOCK_PDF=1` and used unrestricted workers during concurrent checks. That run failed 23 tests (including storage mocks bypassed by the flag and test timeouts). Reran with the normal unit environment and four workers; no assertions or timeouts were weakened. TypeScript then found an existing inferred-header-union error in the auth origin test; explicitly typed the test cases as `Record<string, string>` without changing behaviour. No production build or remote CI rerun was performed for this small follow-up branch. No merge, push or production deployment performed.
