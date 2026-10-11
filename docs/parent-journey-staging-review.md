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

The initial full unit command incorrectly inherited the browser fixture's `MOCK_PDF=1` and used unrestricted workers during concurrent checks. That run failed 23 tests (including storage mocks bypassed by the flag and test timeouts). Reran with the normal unit environment and four workers; no assertions or timeouts were weakened. TypeScript then found an existing inferred-header-union error in the auth origin test; explicitly typed the test cases as `Record<string, string>` without changing behaviour. At the initial local-check checkpoint, a fresh production build and remote CI had not yet run. The branch was subsequently pushed as draft PR #332; see the continuation below. Nothing has been merged or deployed to production.

## Live content audit continuation

Read-only staff review of MFIS Greenacre's **What families see** configuration found no hero/tagline, location within school, meeting/pickup points, welcome message, key contacts, routine, food/dietary information, onboarding walkthrough, or centre-specific thank-you copy. No policies are selected; the only available entry shown was a ZIP archive. These are missing content/configuration, not proof of an application rendering defect.

The service information confirms **405 Waterloo Rd, Greenacre NSW 2190** and the main phone **1300 200 262**. School entrance, meeting location, named service contact and applicable individual policies require operational confirmation before publication. Asked the owner for those missing facts. No production fields were edited.

One confirmed Greenacre family's active Amana account and child linkage were inspected. Its email verification was pending; this is not evidence of inbox delivery or a failed OWNA invitation. OWNA's current-carer exact email search returned no match, and a first-name match belonged to different children and a different email, so it was not treated as the same family. Opening child records then required a fresh OWNA login. Invitation history, child transfer and booked sessions remain unverified; no live checklist items were checked and no invitation was sent.

### First-day guide draft — not published

**Welcome to Amana at Greenacre**

Your child's first day should feel familiar. Our team will confirm your child's start date and booked sessions before they attend.

**Find us:** the School Hall at Malek Fahd Islamic School Greenacre, 405 Waterloo Rd, Greenacre NSW 2190. The website includes a centre map. Contact the service on **0494 379 929** during service hours or **mfisgreenacre@amanaoshc.com.au** for arrival questions. The published Service Director is **Sarah Awad**. The precise entry gate is not specified in the published page; do not invent it.

**Before the first day:** confirm your booked sessions and OWNA access with our team, and let us know about any changes to medical needs or authorised pickup arrangements. Your Amana family hub contains school information and lets you message us; OWNA is used separately for bookings, fees and day-to-day updates. Your Amana password does not sign you into OWNA.

**Session hours:** before school care is 6:45–8:45 am Monday–Friday. After school care is 3:10–6:30 pm Monday, Tuesday, Thursday and Friday; Wednesday starts at 2:10 pm.

**Afternoon pickup:** you can collect your child at any time during the afternoon session, before 6:30 pm. Breakfast and afternoon tea are provided. The website says educators collect younger children from their classroom in the first week; families should confirm their child’s collection arrangement with the service.

Publishing checklist: carry the published School Hall location, centre map, service contact and session hours into the portal; confirm any gate-specific instructions and what-to-bring guidance; select readable parent policies. Do not publish placeholders or present proposed operational details as established facts.


## Follow-up after owner supplied the website source and restored OWNA

The owner identified the school pages on the Amana website as the source of existing centre information. Checked https://amanaoshc.com.au/centres/mfis-greenacre and the website repository’s `src/lib/centres.ts`: School Hall, service phone/email, Sarah Awad, morning/afternoon hours and Wednesday early finish are published there. Updated the unpublished guide above. The gap is duplicated content not reaching the portal; these facts are not wholly unavailable. The exact entry gate is not specified. No live configuration was edited.

Restored OWNA HQ access and selected Amana OSHC Greenacre. The child’s exact surname was not found in the current/upcoming or previous child lists checked. The parent’s exact email was not found in the all-current, inactive or previous carer lists checked. A first-name match previously found belongs to another family and must not be used as evidence. This does not prove no historical invitation exists: the matching provider record and its invitation/booking history remain unverified. Do not create duplicate records, resend invitations, or mark the handoff complete without reconciling the correct family. No personal identifiers are stored in this review document.

Draft PR: https://github.com/buildalpha98-del/amana-eos-dashboard/pull/332 . At revision `11b3a1b74774334c274f958d8c242c2d8781b6fc`, PR lint, unit, integration, migration replay and both Vercel preview builds passed. Explicit full browser workflow https://github.com/buildalpha98-del/amana-eos-dashboard/actions/runs/38126567056 completed successfully (E2E, unit, lint and migration; integration intentionally skipped in the dispatch run and passed in the PR run). This follow-up is documentation only. No merge or production deployment.


## Authorised Greenacre content completion and map-upload repair

Owner explicitly requested filling the portal from the website, reconciling the family and finishing journey checks without merging. Saved Greenacre’s parent-facing tagline, School Hall location, meeting/pickup guidance, welcome copy, Service Director contact, session hours including Wednesday early finish, weekly programs, food information, onboarding/OWNA explanation and thank-you message through the live staff content editor. The save toast confirmed success and the School Hall text persisted after reload. This is a live content update, not a code release. No service fees, room hours, family records or policies were changed.

Uploaded the website repository’s existing public Greenacre map through the content editor. The live request failed with Internal server error; no map is configured. Code inspection found the route writes into the app’s public directory. Built a narrow fix reusing the existing public Blob storage helper, preserving owner/admin roles, rate limit, MIME/signature validation, size limits and the URL response contract. No new dependency, provider or credential changes. Existing maps remain unchanged. This code fix is not deployed; actual Blob credentials/upload/download remain unverified.

Six regression checks passed (JPEG/PDF on read-only app filesystem, anonymous/non-admin denial, signature rejection, storage failure); TypeScript and focused lint passed. Independent reviewer `/root/content_upload_review` directly inspected route, tests and consumers and found no concrete defects. Storage is mocked; live end-to-end map upload awaits release.

Copied only the saved public centre text into the approved isolated synthetic fixture and checked the actual My Centre page at 390×844 and 1440×1000. School Hall, service phone/email, Wednesday hours, flexible pickup and OWNA guidance rendered, with no horizontal overflow. Visual inspection passed. The local seed still has a synthetic service name/address; this is parent-rendering evidence, not a signed-in real-family check.

Extended OWNA reconciliation to All Enrolments submissions, searching both exact child surname and parent email; no matching submission found. Owner answered: “Not sure—leave it for staff reconciliation.” Stopped provider investigation and left live family records, invitations and checklist steps unchanged. Actual OWNA transfer/invite/booking/access is unresolved staff work, not a completed journey milestone.

Remaining: upload the map after the reviewed storage fix is released; select appropriate readable parent policies (only a ZIP was available); staff reconcile the correct OWNA family record and verify invitation/bookings/access; separately decide the day-30 check-in. No real-family impersonation, production synthetic submission, financial/legal authorisation or invitation sending occurred.
