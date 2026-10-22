# Private files, AI privacy and bank passkeys — 23 October 2026

## Behaviour in this change

- External Anthropic/Groq generation and Deepgram transcription are blocked before dispatch, including existing SDK singleton clients, task-agent calls and program-plan extraction. There is no environment flag, user prompt or UI checkbox that bypasses this block. Reopening a workflow requires a reviewed data-release design.
- Cowork bearer-key access is blocked even with a valid key. This deliberately pauses Cowork automations as well as interactive AI access. Ordinary manual dashboard workflows and Knox rules/alerting remain available. Knox model calls fail into its existing `rules_only` path.
- Live recording/transcription and AI regeneration are paused. Existing device recovery recordings are retained. Meeting records accepts written notes/transcripts and saves the text to private Blob storage. Existing transcripts remain in their database rows, behind meeting role and centre/attendee checks. Reading either representation must be authorised.
- New family enrolment uploads, legacy enrolment-upload requests, child documents, parent message photos and absence certificates use private storage. File links lead to an authenticated, non-cacheable application route; raw private Blob addresses stay on the server. Missing private configuration fails closed, without uploading publicly.
- Owners/admins enrol their first bank passkey after password verification and their existing authenticator/backup code when MFA is enabled. Later bank reveals and changes require a user-verified passkey. The device PIN/biometric/private key is never stored by Amana. Passkeys are for bank confirmation in this release, not a new login/recovery method.
- Challenges expire after two minutes, are single-use and bound to this login, person, origin and purpose. Proofs expire after five minutes and are checked against the current account/token version and credential. Shared accounts and other roles are denied. Additional passkey enrolment requires an existing passkey proof; there is deliberately no password-only bypass once enrolled.
- Bank updates and their audit entries commit together. Historical card cleanup compares the current payment method and full original JSON before updating; a concurrent bank edit is skipped and reported.

## Provisioning and staged verification

No production records, files or database migrations were changed during development.

A new empty private store was created in Sydney: `amana-sensitive-files`, ID `store_ZE8JRwGIHOEw1XQH`, team `team_pdlOXg26CYiePBbBlckWyteN`. It is not yet connected to the project. Inspection also found an older private store already connected (`amana-eos-dashboard-blob`); its contents were not opened or migrated.

Before merging/deploying:

1. Connect the new store to `amana-eos-dashboard` with a **separate PRIVATE prefix**. Preserve the existing public store/credentials for marketing assets. Set `PRIVATE_BLOB_STORE_ID` to the new store ID, with the project authorised to that store and Vercel OIDC available. A separately scoped `PRIVATE_BLOB_READ_WRITE_TOKEN` is supported for local testing; Daniel enters credentials himself.
2. Give this branch a disposable, empty preview database. The repository rulebook says previews currently inherit the production database: **do not run a preview functional test or migration against that connection**. The additive migration is `20261023100000_private_files_passkeys`; it was generated file-to-file without a shadow database. Apply it only to the isolated test database first.
3. Set `NEXTAUTH_URL`/`PASSKEY_ORIGIN` to the exact stable test origin. Do not accept an Origin/Host supplied by the browser as configuration. A passkey created on a preview origin is separate from the production passkey. Test a real iPhone/Android device and a second device/security key before relying on recovery.
4. Test using synthetic records: upload/open a family PDF, another-family denial, logged-out denial, centre A/B denial, educator medical access, coordinator message access, owner/admin bank setup and reveal/change, head-office/educator/shared-account bank denial, expired challenges, replay, logout/token invalidation, and storage/audit failures. Check at 375px and desktop. Confirm the underlying private Blob URL is inaccessible without storage authentication.
5. Review the passing build/preview and all test evidence, then ask Daniel before merging. The first production migration/configuration must be a reviewed rollout. Do not claim private storage is live before deployment and a successful authorised end-to-end test.

## Existing public files need a separate migration

Changing upload code cannot revoke a public URL that already exists. Do not delete old files or overwrite references as part of this rollout.

Inventory each field containing a sensitive public URL (enrolment JSON, ChildDocument, medical/court documents, Absence, Message attachments, HR/contracts, recruitment, exports and recording remnants). A reviewed migration must:

1. Record only record IDs, field names and classification in its report, never file contents or financial values.
2. Copy each approved sensitive object to the private store with the correct family/child/meeting/staff access scope. Use random object names.
3. Verify content hashes and authorised download, including phone viewers and any server-side PDF readers.
4. Update database references with a compare-and-set against the original URL/JSON. Skip changed records. Retain a rollback mapping privately.
5. After acceptance and the agreed rollback period, revoke/delete the public copy and verify its old URL no longer works. This is a separately approved production operation; deployment alone does not do it.

Public marketing assets and generic staff upload paths are unchanged. HR/contracts, recruitment, billing PDFs and other legacy upload routes still need their own caller/read-path migration; do not describe every dashboard file as private after this patch.

## Boundaries and recovery

- The block covers this dashboard's AI dispatch and Cowork bridge. It cannot retract information already sent to providers, stop someone manually exporting data, or disable a separately configured phone/meeting bot outside the dashboard. Review VAPI/Teams/Zoom and existing provider retention/configuration separately. Do not submit real family data to an AI-assisted audit.
- Before rollout, provide a verified recovery procedure and a way to enrol a second passkey. The API supports additional keys after passkey confirmation, but this release has no self-service passkey management/recovery screen. Loss of every passkey requires a separately verified operator recovery process; never remove the bank gate or add a short PIN bypass.
- Private Blob storage is access-controlled provider storage, not end-to-end encryption against the hosting provider. Database and storage encryption, key permissions, backup retention, breach response and staff export privileges remain separate controls.
- This is a targeted security change with synthetic tests, not a completed independent penetration test or a claim that all dashboard security issues are resolved.

## Development verification

- Full suite under `TZ=UTC`: 8,631 passing, 39 failures across only the three known parent install-banner/platform files, 3 skipped. These same 39 failures existed before this change.
- Follow-up tests cover manual transcript save/audit failure, local private-file URLs, blank passkey-origin fallback and transferred-staff denial; all pass.
- Lint: zero errors. TypeScript and the production build passed with synthetic configuration and an unreachable database address. No database was needed for these checks.
- Reproduce the synthetic browser check with `node scripts/security/verify-bank-passkeys.cjs` (installed Playwright Chromium required; binds localhost:4199 and writes screenshots to `/tmp/amana-security-browser`).
- Browser harness exercised the actual passkey/recent-auth server code and bank-confirmation components with a synthetic in-memory Prisma adapter and a Chromium virtual authenticator. Real WebAuthn registration and repeat authentication passed. Screens were inspected at 375px and 1440px. This is not a real-device test or a real-database/storage integration test.
- Centre/educator denials are covered by automated tests. Full centre/educator browser workflows, private-store connectivity, migrations and underlying-URL denial still require the isolated environment above.
