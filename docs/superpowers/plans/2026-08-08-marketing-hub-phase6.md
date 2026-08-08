# Marketing Hub — Phase 6 (Quality Loop & Guardrails) Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** (a) **CSAT** — one-tap 👍/👎 (+ optional comment) from the requester when a creative request is delivered, aggregated per-type with first-proof-approval rate on the marketing analytics tab; (b) **frequency caps** — bulk marketing sends skip parents who already received ≥N marketing emails in the rolling week, enforced at send time like suppression, backed by a new per-recipient send ledger; (c) **scheduled-send cancel** — locally claim + Brevo-cancel scheduled sends of all three types; (d) **partial-failure re-send** — one click re-dispatches a partial send's failed recipients as a linked follow-up send; (e) **cleanup batch** — TERM_TABLE 2028+2029 (officially published, triple-verified), auto-measurables test backfill + guard completion, notification-defaults duplicate case.

**Architecture:** The ledger (`MarketingSendRecipient`) mirrors how suppression works — a local table consulted/written at every send path (campaign both branches, cowork, nurture), wrapped in ONE helper pair (`recordMarketingSends` / `getFrequencyCapped`) so a missed write site is a test failure, not a silent leak. Cap enforcement applies only to BULK paths (campaign/cowork); nurture and enquiry sends are 1:1 lifecycle mail — recorded (they count toward a parent's weekly volume) but never blocked. Cancel claims the local row first with a conditional update (race-proof, same pattern as proof decisions), then best-effort-cancels on Brevo (404-tolerant, per `externalIdType`). Re-send creates a NEW DeliveryLog row cross-linked via payload so the original report's rates/curve stay untouched. Per-recipient dispatch machinery (chunking + timeout race) is extracted to a shared lib used by send + resend.

---

## ⚠️ Critical context (investigation-verified)

1. **Same DB/migration/build rules as Phases 1–5.** Latest migration is `20260808100000_help_centre` → use `20260808200000_...`. Never run DB-connecting prisma commands; offline schema-to-schema diff only; build = `npx prisma generate && npx next build`.
2. **CSAT facts:** `delivered` is terminal and PATCH rejects non-status edits on closed requests — CSAT needs its OWN endpoint. The delivered notification (via `notifyRequestStatusChanged`, link `/requests?open=<id>`) is the real prompt-delivery mechanism (board archives delivered cards after 14d); it self-skips when requester==actor (acceptable sample skew, note in aggregate caption). `requestInclude` is requester-visible — adding the satisfaction relation there is fine (own-request data). First-proof-approval rate: `creativeRequestProof` where `version: 1, decision: { not: null }` — numerator `approved` ONLY (`approved_with_changes` stays in the denominator; comment why); per-type needs a findMany + JS fold (groupBy can't reach request.type).
3. **Ledger facts:** No send path stores recipient emails today (campaign <50: only `_failedRecipients`; ≥50: emails go into a Brevo temp list and vanish; cowork: count only; nurture: reachable via SequenceStepExecution join but provider is Resend). EmailEvent is webhook-dependent (unusable for enforcement). Ledger rows are ALWAYS lowercased (`getSuppressedEmails` precedent — "compare lowercase to lowercase or the filter silently matches nothing"). Cap query must be ONE indexed groupBy (`@@index([email, sentAt])`), inside withApiAuth's 55s budget. **The cowork send path currently applies NO suppression at all — Phase 6 fixes that hole while adding its ledger write.**
4. **Cancel facts (per `externalIdType`):**
   - `brevo_campaign`: `PUT /v3/emailCampaigns/{id}/status {"status":"suspended"}` (reversible, auditable) — `brevoFetch` already supports PUT.
   - `brevo_message` (cowork single messageId in `externalId`): `DELETE /v3/smtp/email/{messageId}`.
   - `brevo_message_per_recipient`: messageIds are currently DISCARDED in the dispatch loop — Phase 6 captures them into `payload._sentMessageIds` (filter the `"unknown"` fallback!) in the terminal update, enabling per-message DELETE. Pre-capture scheduled rows can't be Brevo-cancelled — cancel locally, report `brevoCancelled: false` with a message.
   - Legacy `externalIdType: null` → refuse (409), never guess.
   - Claim the row FIRST: `updateMany({ where: { id, status: "scheduled" }, data: { status: "cancelled" } })`, count 0 → 409 (already sent/cancelled). Do NOT clear `payload` (janitor's list cleanup reads `_brevoListId`; once status leaves "scheduled" the temp list becomes sweepable — desired). 404 from Brevo = success (precedent: `deleteBrevoList`).
   - `/api/email/analytics` stats hardcode sent/failed/scheduled — add `cancelled` (and status colors in EmailAnalytics + SendReportPanel; both currently fall back gracefully).
5. **Re-send facts:** `payload._failedRecipients` = `string[]` of emails (no names), only on <50 partial rows. Reuse stored `DeliveryLog.renderedHtml` (guard null — cowork/nurture rows lack it; campaign HTML is recipient-independent, NO unsubscribe-footer issue — that's nurture-only) + the `subject` COLUMN. Suppression re-check is mandatory (the failure may have caused an auto-suppression). NEW DeliveryLog row (`_resendOfDeliveryLogId` on the new row, `_resendDeliveryLogId` stamped onto the original) — never mutate the original's recipientCount (report denominators). Report route must expose a derived `failedCount`/`failedRecipients` — NEVER raw payload (it contains the full original request body). Panel button goes after the header block, BEFORE the `!hasEvents` early branch (a partial send with no opens would hide it). Re-send records its successes in the ledger (they were never counted) but is NOT cap-blocked (it's a retry of an already-attempted send).
6. **auto-measurables:** zero test coverage; guard never calls complete/fail (CronRun rows stranded "running"; weekly lock effectively only 10-min). Fix BOTH (fail in catch = strict improvement; complete = binds the weekly lock — safe because the upsert is idempotent and re-runs within a week become `{skipped}`; document in the commit message). Copy the marketing-measurables test file structure including its byte-identical local weekOf helper + comment. Title-dispatch ordering matters ("bsc occupancy" must not fall into bare "occupancy").
7. **TERM_TABLE 2028/2029** (officially published by NSW DoE, triple-source-verified, day-of-week sanity-checked — starts are Mondays, T4 ends Thursdays). EASTERN division starts (Amana = Sydney). Match the existing 2026/27 entry format in `src/lib/school-terms.ts` exactly:
   - 2028: T1 Jan 31 – Apr 7 · T2 Apr 24 – Jul 7 · T3 Jul 24 – Sep 29 · T4 Oct 16 – Dec 21
   - 2029: T1 Jan 29 – Apr 13 · T2 Apr 30 – Jul 6 · T3 Jul 23 – Sep 28 · T4 Oct 15 – Dec 20
   - Source comment: NSW DoE future-dates page (education.nsw.gov.au/schooling/calendars); note Term-1 starts are official commencement (SDD breakdown unpublished for these years).
8. **notification-defaults.ts:50-51**: literal duplicate `case "member":` label — delete line 51 ONLY (do NOT collapse the body to ALL_ON; a stale doc comment suggests unclear intent). Check for tests on `getDefaultNotificationPrefs("member")` first.

## File structure

| File | Responsibility |
|---|---|
| `prisma/schema.prisma` (modify) | `CreativeRequestSatisfaction` (unique per request) + `MarketingSendRecipient` ledger (+User/CreativeRequest relations) |
| `prisma/migrations/20260808200000_csat_send_ledger/migration.sql` | Offline, additive |
| `src/lib/frequency-cap.ts` (create) | `recordMarketingSends(db, emails, meta)` + `getFrequencyCapped(db, emails, now?)` (cap const + window const, commented) |
| `src/lib/email-dispatch.ts` (create) | Extracted `raceSendTimeout` + chunked per-recipient dispatch (used by campaign/send + resend) |
| `src/app/api/creative-requests/[id]/satisfaction/route.ts` (create) | POST one-tap CSAT (owner-only, delivered-only, once) |
| `src/app/api/marketing/creative-request-quality/route.ts` (create) | CSAT % + first-proof-approval rate, overall + per-type |
| `src/components/requests/RequestDetailPanel.tsx` (modify) | CSAT prompt (owner, delivered, unrated) + rated display |
| `src/components/marketing/AnalyticsTab.tsx` (+ new `RequestQualityCard.tsx`) | Quality section card |
| `src/app/api/email/campaign/send/route.ts` (modify) | Cap filter (bulk branches only) + `_cappedCount`; ledger writes both branches; `_sentMessageIds` capture; dispatch via shared lib |
| `src/app/api/cowork/email/send/route.ts` (modify) | Suppression filter (closing the hole) + cap + ledger write |
| `src/app/api/cron/nurture-send/route.ts` (modify) | Ledger write (source "nurture", ungated by the isParent/svc-code condition) |
| `src/app/api/email/scheduled/[deliveryLogId]/cancel/route.ts` (create) | Claim + Brevo cancel per type |
| `src/app/api/email/reports/[deliveryLogId]/resend/route.ts` (create) | Partial re-send |
| `src/app/api/email/reports/[deliveryLogId]/route.ts` (modify) | Expose derived failedCount/failedRecipients + resend/cancel affordance flags |
| `src/components/marketing/SendReportPanel.tsx` (modify) | Cancel button (scheduled) + re-send button (partial) w/ ConfirmDialogs |
| `src/app/api/email/analytics/route.ts` + `EmailAnalytics.tsx` (modify) | `cancelled` in stats + colors |
| `src/app/api/cron/email-janitor/route.ts` (modify) | Ledger retention sweep (delete > 30d) |
| `src/lib/school-terms.ts` (modify) | 2028 + 2029 TERM_TABLE entries |
| `src/lib/notification-defaults.ts` (modify) | Delete duplicate case label |
| `src/app/api/cron/auto-measurables/route.ts` (modify) | guard.complete/guard.fail |
| `src/lib/brevo.ts` (modify) | `cancelScheduledCampaign(id)` (PUT suspended) + `cancelScheduledMessage(messageId)` (DELETE), 404-tolerant |
| Tests | new: `creative-request-satisfaction.test.ts`, `creative-request-quality.test.ts`, `frequency-cap.test.ts`, `email-scheduled-cancel.test.ts`, `email-resend.test.ts`, `cron-auto-measurables.test.ts`; extend: campaign-send, cowork-email-send (check exists — create if not), cron-nurture-send (check exists), cron-email-janitor, email-reports, school-terms, brevo |

Out of scope (Phase 7 / backlog): org-settings-configurable cap value (const N=3/7d for now), tour stage, remaining stage-event writers (open chip), Resend-side scheduled cancel for nurture, CSAT on cowork-delivered work.

---

## Chunk 1: Schema + CSAT

### Task 1: Schema + migration

- [ ] `CreativeRequestSatisfaction` per the investigation's recommended shape (`requestId @unique`, `positive Boolean`, `comment String? @db.Text`, `ratedById` + named User relation, `@@index([createdAt])`; relations on CreativeRequest + User). `MarketingSendRecipient` (`email` lowercased-by-convention comment, `deliveryLogId String?`, `contactId String?`, `source String // "campaign" | "cowork" | "nurture" | "resend"`, `sentAt @default(now())`, `@@index([email, sentAt])`, `@@index([deliveryLogId])`, `@@index([sentAt])` for the retention sweep). Offline migration `20260808200000_csat_send_ledger`; validate additive-only; generate; commit `feat(marketing): CSAT + send-ledger models`.

### Task 2: CSAT endpoint + prompt + quality aggregate (TDD)

- [ ] **Route** `POST /api/creative-requests/[id]/satisfaction`: body `{ positive: boolean, comment?: string(max 2000) }` (zod); guards — request exists + participant (404 non-participant, same loadForParticipant pattern), REQUESTER-only (fulfillers 403 — it's the customer's voice; even owner-fulfiller self-requests may rate: requester==caller is the rule), status `delivered` (else 409), not already rated (rely on the `@@unique` — catch P2002 → 409 "already rated"). Creates the row; returns it. Tests: 404/403/409-status/409-duplicate/201 happy + comment length 400.
- [ ] **Quality route** `GET /api/marketing/creative-request-quality?days=90`: roles `["owner","head_office","admin","marketing"]`. Returns `{ csat: { positive, negative, rate }, firstProof: { approved, decided, rate }, byType: [{ type, csatRate, csatCount, firstProofRate, decidedCount }] }` — satisfaction findMany (window, select positive + request.type) + v1-proof findMany (window on decidedAt, `decision: { not: null }`, select decision + request.type), JS folds; `approved_with_changes` excluded from numerator with the comment. Divide-by-zero → null rates (UI shows em-dash). Tests: roles, window args, fold maths incl. the awc-denominator case, zero-data nulls.
- [ ] **UI**: RequestDetailPanel — for `isOwner && status === "delivered"`: unrated → inline prompt ("How was this delivery?" 👍 👎 buttons + optional comment textarea appearing after a tap, submit via new mutation in useCreativeRequests, aria-labels); rated → compact read-only "You rated this 👍" + comment. Fulfillers see the rating read-only when present (extend `requestInclude` with `satisfaction: { select: { positive, comment, createdAt } }`). New `RequestQualityCard.tsx` in AnalyticsTab (self-contained pattern like EmailAnalytics): CSAT % + first-proof % + per-type mini-table + caption "Ratings come from requesters after delivery; marketing self-requests are unprompted". Hook standards throughout.
- [ ] Green + eslint + build; commit `feat(marketing): delivery CSAT + request quality analytics`.

## Chunk 2: Frequency caps

### Task 3: Ledger lib + writes + enforcement (TDD)

- [ ] **Lib** `src/lib/frequency-cap.ts`: `MARKETING_EMAIL_WEEKLY_CAP = 3`, `CAP_WINDOW_DAYS = 7` (comment: bulk-send guardrail; org-settings configurability deferred). Include a doc note: ledger rows written for a <50 SCHEDULED send persist even if that send is later cancelled — deliberately conservative (over-caps, never under); do not "fix" as a bug. `recordMarketingSends(db, entries: Array<{email, contactId?}>, meta: { deliveryLogId?, source })` — lowercases, createMany. `getFrequencyCapped(db, emails, now = new Date())` — ONE groupBy(["email"]) where `email in lowered, sentAt >= now-7d`, `_count`, returns lowercased Set of emails with count >= CAP. Tests: lowercasing, single-query assertion, boundary (count == cap → capped; cap-1 → not), empty input no-query.
- [ ] **Writes + enforcement**:
  - campaign/send <50: after suppression filter add cap filter (`_cappedCount` into payload + response `cappedCount`; all-filtered → the existing badRequest/conflict mirror per branch; ENQUIRY branch EXEMPT from cap — 1:1 human send — but still recorded). After dispatch, `recordMarketingSends` for the non-failed subset (source "campaign").
  - campaign/send ≥50: cap filter before list creation; record ALL recipients post-send (source "campaign") — this is the only place those emails are ever known locally.
  - cowork/email/send: add suppression filter (getSuppressedEmails — closing the documented hole; response gains suppressedCount) + cap filter + ledger write (source "cowork"). Note in the route comment that this changes cowork behavior deliberately.
  - cron/nurture-send: `recordMarketingSends` beside the existing per-contact success handling, UNGATED by the `isParent && svc?.code` condition (source "nurture"). Nurture is never cap-BLOCKED.
  - email-janitor: retention sweep `marketingSendRecipient.deleteMany({ where: { sentAt: { lt: now-30d } } })` + count in guard.complete.
- [ ] Tests: extend campaign-send (cap filter both branches, enquiry exemption, ledger write args incl. lowercase + source), cowork send (check for an existing test file — extend or create with the cowork-auth mock pattern; suppression + cap + ledger), nurture-send (extend its existing test file if present — check; ledger write ungated), janitor (retention sweep). Green + api sweep; commit `feat(email): weekly frequency cap + per-recipient send ledger`.

## Chunk 3: Cancel + re-send

### Task 4: Scheduled cancel (TDD)

- [ ] brevo.ts: `cancelScheduledCampaign(campaignId)` (PUT status suspended, 404→success) + `cancelScheduledMessage(messageId)` (DELETE /smtp/email/{id}, 404→success). Unit tests beside the existing brevo tests.
- [ ] campaign/send <50 terminal update: capture `_sentMessageIds: Array<{email, messageId}>` from fulfilled results (filter `messageId === "unknown"`), always-write the payload rewrite. Test asserts capture + unknown filtering.
- [ ] **Cancel route** `POST /api/email/scheduled/[deliveryLogId]/cancel` (share REPORT_ROLES — export it from the reports route rather than re-declaring). **Canonical sequence (in this order):** (1) `findUnique` — missing → 404; `externalIdType` null/legacy → 409 refuse (status untouched); (2) conditional claim `updateMany({ where: { id, status: "scheduled" }, data: { status: "cancelled" } })` — count 0 → 409 (already sent/cancelled — race-safe); (3) Brevo best-effort per externalIdType: brevo_campaign → cancelScheduledCampaign(externalId); brevo_message → cancelScheduledMessage(externalId); brevo_message_per_recipient → loop payload._sentMessageIds (missing/empty → local-only cancel, `brevoCancelled: false` + message "scheduled before cancel support — cancel it in Brevo manually if needed"). findUnique-first is required regardless — claim-first can't distinguish 404 from 409. Response `{ cancelled: true, brevoCancelled, detail? }`. Brevo errors after claim: log + `brevoCancelled: false` (the local row stays cancelled — commented rationale: local truth beats Brevo best-effort). Tests: 403 role, 404 unknown, 409 not-scheduled (race: claim count 0), 409 legacy-null-type with status UNCHANGED asserted, each type's Brevo call, per-recipient missing-ids path, Brevo-throw → still 200 with brevoCancelled false.
- [ ] analytics route: `cancelled` count in stats; EmailAnalytics + SendReportPanel status colors + stat card (small). Report route: include `canCancel` (status scheduled) / `canResend` (status partial && failedCount>0 && renderedHtml present) flags + `failedCount`. Panel: Cancel button (scheduled) with ConfirmDialog(danger) → new mutation → invalidate report + analytics.
- [ ] Green; commit `feat(email): cancel scheduled sends — local claim + Brevo best-effort`.

### Task 5: Partial re-send (TDD)

- [ ] Extract `src/lib/email-dispatch.ts` from campaign/send: `dispatchPerRecipient({ recipients, subject, html, scheduledAt?, tags })` returning `{ sent: Array<{email, messageId}>, failed: string[] }` with chunking + timeout race; refactor campaign/send onto it (behavior-identical — its tests must stay green unmodified except mock targets if any).
- [ ] **Resend route** `POST /api/email/reports/[deliveryLogId]/resend` (REPORT_ROLES): guards — original exists (404), `status === "partial"` (409), `_failedRecipients` non-empty (409), `renderedHtml` non-null (409 with clear message). Suppression re-check over failed list (all-suppressed → 409 explaining why). Pre-create new DeliveryLog (`status: "sending"`, `messageType` copied, `externalIdType: "brevo_message_per_recipient"`, payload `{ _resendOfDeliveryLogId, _suppressedCount }`), dispatch via the shared lib with `dl:` tag of the NEW row, terminal update (sent/partial/failed + `_failedRecipients`/`_sentMessageIds`), stamp the ORIGINAL's payload `_resendDeliveryLogId`, `recordMarketingSends` for successes (source "resend"), NO cap check. Response `{ deliveryLogId, sentCount, failedCount, suppressedCount }`. Tests: guards each, suppression re-check, new-row lifecycle (create once + update), original stamped, ledger recorded, cap NOT consulted (assert getFrequencyCapped not called).
- [ ] Panel: Re-send button (visible when canResend) with ConfirmDialog ("Re-send to N failed recipients?") → success toast linking counts → invalidate. Report shows "Retried in a follow-up send" note when `_resendDeliveryLogId` present (derived flag from route, not raw payload).
- [ ] Green + eslint + build; commit `feat(email): one-click re-send of failed recipients`.

## Chunk 4: Cleanup batch + finish

### Task 6: Term table, auto-measurables, notification-defaults (TDD)

- [ ] school-terms.ts: add 2028 + 2029 entries (exact dates from Critical context 7, eastern starts, source comment); extend school-terms tests (spot dates + hasExactTermDates true for 28/29, false 2030).
- [ ] auto-measurables: NEW test file first (pin 401, lock-skip, early return, title-dispatch branches incl. bsc-vs-bare-occupancy ordering, serviceId-scoped vs aggregate fallback, divide-by-zero, errors[] collection) — then add `guard.fail(err)` in catch AND `guard.complete({...counts})` before the success return, with tests asserting both; commit message documents the weekly-lock semantic change (re-runs within the week now `{skipped}`; upsert was already idempotent).
- [ ] notification-defaults.ts: grep for member-prefs tests first; delete the duplicate `case "member":` line only. (esbuild warning gone — verify in a test run's stderr.)
- [ ] Green; commit `chore: term dates 2028-29, auto-measurables tests + guard, dedupe case label`.

### Task 7: Final verification + PR

- [ ] Full gates: all phase files + `npm test` fully green; feature eslint (0 errors, no new warnings); build. CLAUDE.md: CSAT model + quality route, frequency-cap ledger conventions (ALWAYS record via recordMarketingSends — 4 sources; bulk-only enforcement), cancel/resend semantics, cowork suppression note. Final holistic reviewer (cross-cutting: ledger write-site completeness — grep every sendTransactionalEmail/sendCampaignEmail/sendEmail marketing call; cancel race-safety; resend row lifecycle; dispatch-lib extraction behavior parity; term dates against the sourced table). Merge origin/main; push; PR with deploy notes (cap starts counting from deploy — first week is under-counted; cancelled status is new in analytics; cowork sends now suppression-filtered — flag to whoever owns cowork automations) + Phase 7 backlog.
