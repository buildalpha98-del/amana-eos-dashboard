# Staff security and usability review — 26 October 2026

## Decision

Keep PR #347 in draft. The privacy and passkey changes are useful, but they are not a complete security clearance. The next release gate is consistent record access, particularly certificates and state-manager summaries. Do not merge a broad visual redesign ahead of these fixes.

This review used the feature branch based on main `8ec329ed`, a disposable local PostgreSQL database (`amana_security_test`, localhost:55439), synthetic educator/centre/owner/state-manager accounts, browser checks at 375px and 1440px, source inspection and automated tests. No production data, real family files or provider credentials were accessed. Supplier comparisons use public documentation, not access to their private applications.

## Changes completed in this batch

- A blocked AI assistant no longer invites staff to type private questions. Help offers a privacy explanation and working handbook/policy links. The floating chat launcher is absent; the chat hook also refuses a request before retaining the question or calling the API.
- Meeting recording and agenda-generation entry points no longer offer blocked work. Existing drafts remain readable. Pending recordings say processing is paused and no longer trigger endless polling.
- Private meeting notes have inline save/error feedback, retain text after an unsuccessful save, and prevent edits while that save is pending. A list-refresh failure cannot incorrectly report an already-saved note as unsaved. Unsaved drafts do not cross into another meeting and are not persisted in browser storage. Browser close/reload warns for unsaved text; in-app navigation is not fully intercepted, so a clear save-before-leaving instruction remains.
- Historical transcript text is readable even when no AI review exists. Saved records show their date in Sydney time and their author. List failures offer retry instead of claiming that records do not exist.
- Unfinished device recordings remain on the device while processing is blocked. Deleting the only local copy requires a clear confirmation.

## Findings requiring remediation

### P1 — Certificate list can cross account/centre boundaries (reproduced)

`src/app/api/compliance/route.ts:63` uses `getServiceScope` and `getStateScope`. The former returns null for an educator without a service; the latter always returns null. The own-record filter is inside `else if (scope)`, so an unassigned educator without `?scope=self` receives the unfiltered list. State managers also get no state filter.

Synthetic HTTP reproduction against the actual local route returned status 200 and the other-centre certificate for both an unassigned educator and a NSW state manager. The fixture contained a service-only certificate (no staff owner) filed under a synthetic Victorian centre; no real certificate was opened. The NSW state manager could also PATCH that synthetic Victorian certificate (200). This was reproduced against the locally built production server as well as the development route. `?scope=self` protects the normal personal page, but a client parameter cannot be the security boundary.

Also inspect download, PATCH, renewal and DELETE together: the detail routes generally treat `isAdminRole(head_office)` as unrestricted, while DELETE only has the role gate. POST must validate the target staff/centre before uploading or creating. Fixing only the list leaves direct record IDs usable.

**Required change:** one certificate access policy shared by list, download, create, update, renewal and deletion. Educators/volunteers see their own certificates even with no centre; state managers use their state plus explicit active memberships; centre accounts use their authorised centres. Personal certificates without a service must resolve through their staff owner's current assignments. Owner/admin privileges remain explicit. Decide and test transferred-staff treatment rather than relying on a stale certificate serviceId.

**Acceptance:** test no-centre staff, two states, additional memberships, expired/inactive memberships, personal certificates with null service, transferred staff, forged service/user IDs and every read/write/download path. A forbidden request performs no storage or database mutation.

### P1 — State-manager dashboard mixes scoped and organisation-wide information (reproduced)

A synthetic NSW manager saw only the NSW centre in Centre Performance but saw both NSW and Victorian centres in School Relationship Health; the metrics bar counted two centres. This is both confusing and an access-boundary problem.

`src/app/api/partnerships/school-health/route.ts:19` queries all active services. It has session authentication but no role or centre restriction. It returns centre identities, principal names, contract dates and health breakdowns. `src/lib/dashboard-aggregator.ts:578` also counts every active centre inside `buildKeyMetrics`, although that function receives `serviceIds`.

**Required change:** scope every widget's underlying query before aggregation. Use one authorised-centre selection for cards, counts, drill-downs and exports; never trust the header selector as authorisation. Review other metrics in the same function, not just the centre count.

**Acceptance:** with one NSW and one VIC centre, a NSW-only manager must receive only NSW data in the API and browser. An explicit additional membership should add its centre consistently. Clearing the selector must mean all authorised centres, not all organisational data.

### P1 — Certificate replacement can remove the valid file before saving its replacement (code-confirmed)

`src/app/api/compliance/[id]/route.ts:94` deletes the old file after uploading the new one, before schema validation at line 104 and the database update at line 132. Invalid metadata or a database error can leave the current certificate pointing at a deleted file. Concurrent replacements also need protection. This was established by source ordering; no destructive live test was run.

**Required change:** validate and authorise first; upload a new private object; atomically switch the reference with a revision/compare-and-set guard; only then schedule the old object for controlled cleanup. A failed commit cleans up only the new, server-owned upload. Never delete an arbitrary client URL.

**Acceptance:** invalid dates, validation failures, storage failures, database failures and simultaneous replacements all preserve the last successfully saved certificate. Cleanup must not delete a file referenced elsewhere.

### P1 — Staff certificates/contracts still use public file storage (code-confirmed; known rollout gap)

`src/lib/storage.ts` defaults to public Blob access. Compliance create/update/renew and contract quick-upload/issue/acknowledge still call that helper without private access. The authenticated download proxy does not make the underlying public URL private. PR #347 protects new family/meeting paths; it does not solve these staff/HR paths or revoke old public URLs.

**Required change:** complete the staff/HR caller and reader migration with staff/centre access metadata, private streaming, audit and large-file verification. Keep public marketing assets separate. Inventory/copy/hash-check/compare-and-set old sensitive objects, then revoke public copies only as a separately approved production operation.

**Acceptance:** no public fallback, underlying URL denied without storage authentication, another staff account/centre denied, 4MB+ scans still upload correctly, failed upload leaves the current record intact.

### P2 — Dashboard can present missing information as reassuring data (code-confirmed)

`L10PrepWidget` hard-codes `missingMeasurables: 0`; it cannot truthfully certify there are no missing figures. School health substitutes defaults for absent metrics and can show a numerical score even when no real operational/satisfaction evidence exists. In the synthetic empty database, school health showed 63 and the dashboard announced all clear.

**Required change:** distinguish recorded zero, unavailable, not configured, stale and loading. Show “Not checked” for unimplemented measures. All-clear language must name the checks actually completed. Use the existing Today freshness/retry behaviour as the model.

**Acceptance:** failed/stale/empty data cannot produce green reassurance. A staff member can tell when the last successful refresh occurred and has a retry action.

### P2 — Permission and context changes need a systematic route audit

The repository still has 48 call sites matching the legacy `getServiceScope(session)` / `getStateScope(session)` helpers. This is an inventory count, not 48 confirmed vulnerabilities. The null-as-unrestricted pattern explains the certificate issue and warrants a route-by-route check of sensitive reads, counts, exports and mutations. Navigation hiding alone does not protect the API.

## Staff experience recommendations

These are proposed changes, not implemented features or a claim about staff preferences observed in research.

1. **Educator home:** retain the current shift-first layout. Give the next shift, clock action, children present, medical/pick-up alerts and incomplete shift tasks priority. Keep finance and management controls out of that view. Use one clear centre name and date wherever an action creates a record.
2. **Centre accounts:** keep Today as the entry point, with large direct actions for attendance, headcount, incident, medication and handover. Avoid a generic “all clear” when safety checks have not run. Show waiting-to-sync, saved and needs-review distinctly; preserve the existing account-bound offline queue and mutation receipts.
3. **State managers:** after the scope fixes, lead with “My centres today”, a centre comparison and a ranked action list (staffing gaps, unresolved incidents, overdue documents, approvals). Put EOS/financial trends below operational decisions. Each row should open the exact centre and task, retaining the selected period/filter.
4. **Private records:** show “Who can see this?” in plain language using actual server permissions. Avoid switches that imply the user can enable external AI. Keep existing manual work usable when a protected integration is paused.
5. **Mobile acceptance:** 44px main tap targets, no horizontal page overflow at 375px, labels on icon-only actions, visible error/retry, screen-reader status, and tested empty/busy/offline states. Use the current brand tokens in both themes.

## Relevant patterns from other platforms

| Platform and source | Documented pattern | Recommendation for Amana |
| --- | --- | --- |
| [OWNA feature matrix](https://forms.owna.com.au/features/) | Attendance/history, headcounts/evacuations, responsible-person check-in, checklists, handover and staff document expiry features sit within its operational coverage. | Group the corresponding existing Amana workflows by the shift task. Do not add long-daycare routines just to match a feature list. |
| [Xplor Playground educator app](https://www.ourxplor.com/playground-educator-childcare-software/) | Educator-facing health/incident recording, transport/headcount records and mobile/web documentation. | Put child safety actions beside the live room/attendance context, with clear author/time and a reliable save state. |
| [Xplor learning experience](https://www.ourxplor.com/playground-learning-experience/) | Attendance-based child filters, fewer required fields and preview before sharing. | Reuse known centre/room/session details; show only relevant children; preview the recipients and content before a communication is sent. |
| [Storypark sharing permissions](https://help.storypark.com/en/articles/422801-educators-sharing-plans-who-can-access-a-plan-and-its-links) | Explicit sharing audiences and a visible list of who can access a plan; membership changes affect access. | Make access understandable without weakening server checks. A saved private record should state its audience, and staff transfers should be reflected immediately. |

These vendor documents describe capabilities, not independent proof of their security or usability. No competitor login, penetration test or purchase recommendation was made.

## Recommended delivery order

1. Repair certificate authorisation and replacement safety as one focused change, with database-backed cross-role tests.
2. Fix state-manager API scoping and misleading unknown/all-clear states before rearranging the dashboard.
3. Complete staff/HR private uploads and the isolated cloud preview database/storage tests. Plan historical public-file migration separately.
4. Present a small state-manager layout preview, then implement and test the agreed layout. Keep the educator shift-first model.
5. Run a fresh adversarial regression pass with synthetic records: cross-centre IDs, revoked sessions, race conditions, offline retries, file URLs, role changes and export boundaries. Arrange an independent penetration test before claiming broad assurance.

## Verification and limits

The privacy-UX batch has 19 focused passing checks, plus the full suite and lint/build evidence recorded in `docs/security/private-data-rollout.md`. Browser checks confirmed educator handbook/policy links, centre-account help, meeting transcript visibility and retained note text after an actual private-storage configuration failure. Both phone and desktop layouts were inspected. No new schema migration was needed for this batch.

Private-cloud success remains untested because Preview inherits production's database connection; this review did not bypass that isolation requirement. Successful note saving is covered by component and route tests, not a real cloud upload. No real-device passkey ceremony, historical-file revocation, load test, third-party bot audit or independent penetration test was completed here. The findings above remain open and are not fixed by the UI changes in this batch.
