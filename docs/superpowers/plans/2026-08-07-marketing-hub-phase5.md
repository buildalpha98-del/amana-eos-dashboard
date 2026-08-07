# Marketing Hub — Phase 5 (Attribution, Autopilot, Scorecard) Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** (a) the **attribution funnel** on campaign detail — attributed reach → email clicks + QR scans → enquiries → enrolments, plus an occupancy delta over the campaign window (the mockup's "did it fill places?" layer); (b) **term autopilot** — a cron that creates each centre's pre-briefed creative-request pack N weeks before term start; (c) **EOS scorecard feed** — weekly marketing measurables auto-populated; (d) **ops hygiene** — `DeliveryLog.sentAt`, a janitor for stranded `sending` rows, Brevo temp-list cleanup, role gates on the count endpoints; (e) a **stage-event logging fix** in the parent journey (prerequisite for honest enrolment counts).

**Architecture:** All funnel numbers are **attributed or clearly-labeled contextual** — never presented as totals (most enquiries carry no campaign linkage; pretending otherwise reads as a conversion collapse). One pure-ish lib (`campaign-attribution.ts`) owns window resolution and every funnel query; the API endpoint and the measurables cron both call it. Term autopilot reuses the existing creative-request libs directly (number generator, checklist seeding, include) — no route extraction needed — with sequential creation (the number generator is count-based/racy) and a single digest notification instead of per-request spam. The scorecard feed copies the `auto-measurables` title-substring convention and the `handover-cleanup` guard shape (NOT auto-measurables' guard handling, which never completes its lock).

---

## ⚠️ Critical context (investigation-verified; trust these over assumptions)

1. **Same DB/migration/build rules as Phases 1–4.** Migration timestamps sort after `20260807100000_audiences_campaign_links` → use `20260807200000_...`.
2. **Attribution data model facts:**
   - QR→campaign is TRANSITIVE ONLY: `QrCode.activationId → CampaignActivationAssignment.campaignId` (schema ~2310). QRs without an activation are unattributable — funnel labels must say "via linked activations". `QrScan.scannedAt` + `@@index([qrCodeId, scannedAt])`; uniques via `ipHash`. Use `count`/`groupBy` — NEVER the fetch-all-scans pattern from `qr-codes/route.ts:59`.
   - Enquiry→campaign linkage is ONLY `ParentEnquiry.sourceActivationId` (populated from QR UTMs). Stages: `new_enquiry→info_sent→nurturing→form_started→enrolled→first_session→day3→week2→month1→retained`+`cold` — there is NO tour stage. Use the shared constants `OPEN_PIPELINE_STAGES`/`CONVERTED_STAGES` from `src/lib/forecast.ts:141-155`.
   - `ParentEnquiryStageEvent` has `@@index([toStage, createdAt])` — ideal for "entered `enrolled` during window" — BUT `src/lib/parent-journey.ts:114-125` writes stages directly without `logEnquiryStageEvent`, so portal enrolments are missing from events (Task 2 fixes this; historical rows stay missing — caption it).
   - Campaign `startDate`/`endDate` both nullable, unvalidated. Window fallback: `start = startDate ?? createdAt`, `end = min(endDate ?? now, now)`, and clamp `end >= start`.
   - Campaign "reached" = direct sends (`DeliveryLog.entityType="MarketingCampaign"`) ∪ transitive post sends (`entityType="MarketingPost"` where that post's `campaignId` matches). Email engagement via `EmailEvent.deliveryLogId IN (...)`.
   - Occupancy: `DailyAttendance` (`serviceId`, `date`, `sessionType`, `attended`, `capacity`, `enrolled`). "Current" in the occupancy route is latest-ever — for window deltas use ±7-day windowed averages around each endpoint (`sum(attended)/sum(capacity)` per linked service, skip services with no rows).
3. **Scorecard facts:** `Measurable` (`scorecardId` required, `serviceId?`, `goalValue`, `goalDirection`, `frequency`) + `MeasurableEntry` upsert key `@@unique([measurableId, weekOf])`. Auto-feed convention = title-substring match (NO source column — pick NARROW substrings so we don't hijack manual measurables; `auto-measurables` already claims "occupancy/attendance/enrolled/attended"). `weekOf` MUST be computed byte-identically to `auto-measurables/route.ts:39-46` (last Monday) or the unique key duplicates. `evaluateOnTrack` exists there too. `scorecard-missing` nags Mondays — schedule our cron Sunday, after auto-measurables (`"30 20 * * 0"`) → use `"45 20 * * 0"`.
4. **Term facts:** use `getTermsForYear`/`getCurrentTerm` from `src/lib/school-terms.ts` (NSW table for 2026–27, tested) — NOT the divergent month-index duplicate inside `marketing/term-calendar/route.ts:7-21`. `TERM_TABLE` covers 2026–27 only; the cron must log a warning when falling back to approximate dates (2028+). Dates are server-local (Vercel=UTC) — acceptable, note in comments.
5. **Creative-request reuse for cron:** call the libs directly — `generateRequestNumber`+`createWithNumberRetry` (count-based → create packs SEQUENTIALLY, never Promise.all), `DEFAULT_CHECKLISTS`, `defaultDueDate`, `requestInclude`. `requestedById` = resolved system user (`user.findFirst({ where: { role: "marketing", active: true }, orderBy: { createdAt: "asc" } })`; abort the run with a logged error if none). Do NOT call `notifyRequestSubmitted` per request (20 packs × marketers = spam) — ONE digest `UserNotification` per active marketing user.
6. **Cron conventions:** `verifyCronSecret(req)` + `acquireCronLock(name, period)` from `@/lib/cron-guard`; COPY the `handover-cleanup/route.ts` shape (guard.complete/fail in try/catch) — NOT auto-measurables (never completes its guard). Wrap in `withApiHandler`. `vercel.json` crons array; schedules are UTC. Test template: `src/__tests__/api/cron-draft-activation-recap.test.ts` (guard mock + 401 + skipped + happy path).
7. **Brevo cleanup facts:** `sendCampaignEmail` creates list `delivery-<epoch>` and DROPS the id (brevo.ts:118) — every ≥50 send leaks a list. `brevoFetch` is POST-only; generalise to `brevoFetch(path, body?, method = "POST")` (the file already bypasses it with raw fetch for PUT/sendNow — fold those onto the generalised version ONLY if trivial, else leave). Never delete a list a `scheduled` campaign still targets.
8. **`sending` rows:** single writer (`send/route.ts` pre-create) + single terminator (same-request update); a crash strands them forever. Janitor: `status:"sending" AND createdAt < now-1h → failed` with a distinctive errorMessage.
9. **recipient-count** (`GET`, bare `withApiAuth`, single caller = composer) and **audiences/preview-count**: gate both to `["owner","head_office","admin","marketing"]`. Members can open the composer but can only send enquiry emails (which don't use these endpoints) — losing the count preview for members is correct, not a regression. Verify no other callers (grep).

## File structure

| File | Responsibility |
|---|---|
| `prisma/schema.prisma` (modify) | `DeliveryLog.sentAt DateTime?` (+ `@@index([status, createdAt])` if absent — check; plain `status` index exists, composite optional → skip unless free) |
| `prisma/migrations/20260807200000_delivery_sent_at/migration.sql` | Offline, additive |
| `src/lib/parent-journey.ts` (modify) | `syncParentJourney` logs stage events |
| `src/lib/campaign-attribution.ts` (create) | Window resolution + every funnel query (counts only) |
| `src/app/api/marketing/campaigns/[id]/performance/route.ts` (create) | Funnel endpoint (same roles as campaign GET) |
| `src/components/marketing/CampaignDetailPanel.tsx` (modify) | "Performance" section (funnel + occupancy delta + captions) |
| `src/app/api/cron/marketing-measurables/route.ts` (create) | Weekly scorecard feed |
| `src/app/api/cron/email-janitor/route.ts` (create) | Stranded-row sweep + Brevo list cleanup |
| `src/app/api/cron/term-autopilot/route.ts` (create) | Term pack creation |
| `src/lib/term-pack.ts` (create) | Pack definition + idempotency marker + digest notification |
| `src/lib/brevo.ts` (modify) | `sendCampaignEmail` returns `listId`; `brevoFetch` method param; list GET/DELETE helpers |
| `src/app/api/email/campaign/send/route.ts` (modify) | `sentAt` stamps; persist `payload._brevoListId` |
| `src/app/api/email/recipient-count/route.ts` + `audiences/preview-count/route.ts` (modify) | Role gates |
| `vercel.json` (modify) | 3 new cron entries |
| `src/hooks/useMarketing.ts` (modify) | `useCampaignPerformance(id)` |
| Tests | new: `campaign-attribution.test.ts`, `campaigns-performance.test.ts`, `cron-marketing-measurables.test.ts`, `cron-email-janitor.test.ts`, `cron-term-autopilot.test.ts`, `term-pack.test.ts`; extend: `parent-journey` coverage (find existing file or add), `email-campaign-send.test.ts` (sentAt + listId), role-gate tests |

Out of scope (backlog): CSAT on delivery, frequency caps, scheduled-send local cancel, partial-failure re-send, tour stage, `EnrolmentSubmission` FK hardening.

---

## Chunk 1: Hygiene + prerequisites

### Task 1: sentAt schema + send-route stamps + role gates (TDD)

- [ ] **Step 1:** Schema: `DeliveryLog.sentAt DateTime?` after `createdAt` with comment `/// When dispatch actually completed (createdAt is row creation; differs for scheduled + pre-created "sending" rows).` Offline migration `20260807200000_delivery_sent_at` (1 ADD COLUMN); generate.
- [ ] **Step 2 (TDD):** extend `email-campaign-send.test.ts`: <50 terminal update sets `sentAt` (Date) for sent/partial (NOT for scheduled — dispatch hasn't happened; assert null/absent); ≥50 create sets `sentAt` when status "sent", not when "scheduled". Implement in the send route (both stamping points).
- [ ] **Step 3 (TDD):** role gate on `recipient-count`: `{ roles: ["owner","head_office","admin","marketing"] }`; test: member → 403. NOTE: `audiences/preview-count` is ALREADY gated (`AUDIENCE_ROLES`, preview-count/route.ts ~8/32) — verify the gate + that a member-403 test exists (add one only if missing); no code change there. Grep for other recipient-count callers first; report any found.
- [ ] **Step 4:** Green + sweep; commit `feat(email): sentAt stamp + count endpoint role gates`.

### Task 2: Stage-event logging fix (TDD)

- [ ] **Step 1 (TDD):** `src/__tests__/lib/parent-journey.test.ts` EXISTS — extend it. Failing tests: (a) when `syncParentJourney` moves an enquiry's stage (e.g. → `enrolled`), `logEnquiryStageEvent` is called with (enquiryId, fromStage, toStage); (b) no event when the stage is unchanged; (c) **the CREATE path (~lines 88–105) also writes an initial stage** — it must log `logEnquiryStageEvent(id, null, stage)` like all four route callers do (a portal enquiry created directly at `enrolled` otherwise never gets its `toStage: "enrolled"` event, silently undercounting Task 5's attributed enrolments) — explicit test.
- [ ] **Step 2:** Implement — import `logEnquiryStageEvent` from `@/lib/enquiry-stage-events` and call it at every direct stage write in `parent-journey.ts` (~114-125; check the whole file for other stage writes). It's fire-and-forget/swallowing — call un-awaited or awaited per the existing call-site convention (read one of the 4 route callers and match).
- [ ] **Step 3:** Green + sweep (enquiry/journey suites); commit `fix(enquiries): portal stage changes now log stage events`.

### Task 3: Email janitor + Brevo list cleanup cron (TDD)

- [ ] **Step 1:** `src/lib/brevo.ts`: `brevoFetch(path, body?, method: "GET"|"POST"|"PUT"|"DELETE" = "POST")` (GET sends no body); `sendCampaignEmail` returns `{ campaignId, listId }`; add `listBrevoLists(offset, limit)` (`GET /contacts/lists?...`) and `deleteBrevoList(id)` helpers. Do NOT touch the existing raw-fetch PUT/sendNow calls unless folding is a 2-line change. Extend/adjust any brevo mocks in existing tests broken by the return-shape change (send route ignores extra field — check).
- [ ] **Step 2:** send route: persist `_brevoListId: listId` inside the ≥50 path's payload (alongside `_suppressedCount`). Test asserts it.
- [ ] **Step 3 (TDD):** cron `email-janitor` (daily, copy handover-cleanup shape): (a) `deliveryLog.updateMany({ where: { status: "sending", createdAt: { lt: now-1h } }, data: { status: "failed", errorMessage: "Stranded in 'sending' — dispatch did not complete (janitor)" } })`; (b) list cleanup: find DeliveryLogs `channel: "email"` with `payload._brevoListId` set, `status: { notIn: ["scheduled"] }`, `createdAt < now-2d`, and payload NOT yet marked `_brevoListCleaned` → `deleteBrevoList`, then mark `_brevoListCleaned: true` in payload (update per row; cap 20 per run); (c) legacy sweep: `listBrevoLists` pagination, delete lists named `/^delivery-\d+$/` older than 7 days by their epoch-ms name (cap 20 per run, and SKIP any id referenced by a `scheduled` row's `_brevoListId`). Tests: 401; lock-skip; stranded-row update asserted; cleanup happy path (mock brevo helpers via vi.mock @/lib/brevo); scheduled rows untouched; caps respected. `vercel.json`: `{"path": "/api/cron/email-janitor", "schedule": "0 19 * * *"}`.
- [ ] **Step 4:** Green + sweep; commit `feat(email): janitor cron — stranded sends + Brevo temp-list cleanup`.

---

## Chunk 2: Attribution

### Task 4: Attribution lib (TDD)

**Create `src/lib/campaign-attribution.ts`** — takes an injected `db` (PrismaClient-ish) for prisma-mock testability. Functions (all COUNT-shaped, no row fetching except tiny id lists):

- `resolveCampaignWindow(campaign: { startDate, endDate, createdAt }, now = new Date())` → `{ start, end }` per the fallback rules (pure; tested for all null/partial/future/inverted cases — inverted → `end = start`).
- `getCampaignSendIds(db, campaignId)` → DeliveryLog ids + summed recipientCount for direct sends ∪ transitive post sends (two indexed queries; posts via `marketingPost.findMany({ where: { campaignId, deliveryLogId: { not: null } }, select: { deliveryLogId } })`).
- `getEmailEngagement(db, sendIds, window)` → `{ uniqueOpens, uniqueClicks }` via one `emailEvent.groupBy({ by: ["type", "email"], where: { deliveryLogId: { in }, createdAt: window, type: { in: ["opened","clicked"] } } })` and counting DISTINCT emails per type in JS (grouping by type alone counts total events — a recipient opening 5× would count 5; the ["type","email"] grouping is bounded because it's sendIds-scoped).
- `getQrScans(db, campaignId, window)` → `{ scans, uniqueScanners }` — scans via `qrScan.count({ where: { scannedAt: window, qrCode: { activation: { campaignId } } } })`; uniques via `groupBy(["ipHash"])` length on the same where PLUS `ipHash: { not: null }` (null hashes would collapse into one bogus group).
- `getAttributedEnquiries(db, campaignId, window)` → `{ attributed, contextual }`: attributed = `parentEnquiry.count({ where: { deleted: false, createdAt: window, sourceActivation: { campaignId } } })`; contextual = count at the campaign's linked services (`service: { marketingCampaigns... }` — read the join model; via `serviceId: { in: linkedServiceIds }`) in window. Caller passes linkedServiceIds to avoid re-query.
- `getEnrolmentsWon(db, campaignId, linkedServiceIds, window)` → `{ attributed, contextual }`: attributed = stage events `toStage: "enrolled"` in window whose enquiry has `sourceActivation.campaignId` (join via `enquiry: { sourceActivation: { campaignId } }` — check the relation name on ParentEnquiryStageEvent → enquiry); contextual = stage events `toStage: "enrolled"` in window with `enquiry: { serviceId: { in }, deleted: false }`. Caption caveat (portal gap pre-fix) lives in the UI, not the lib.
- `getOccupancyDelta(db, serviceIds, window)` → per-service `{ serviceId, startPct, endPct }` using ±7-day `DailyAttendance` windowed sums (`attended/capacity`, skip capacity 0/no rows → null entry), plus an overall weighted delta.

TDD every function against prismaMock with exact where-clause assertions (the queries ARE the product). Commit `feat(marketing): campaign attribution lib`.

### Task 5: Performance endpoint + panel section (TDD route)

- [ ] Route `GET /api/marketing/campaigns/[id]/performance` — roles `["owner","head_office","admin","marketing"]`, 404 unknown/deleted campaign; loads campaign + linked serviceIds, calls the lib, returns `{ window: {start, end}, reach: { sends, recipients }, engagement: { uniqueOpens, uniqueClicks }, qr: { scans, uniqueScanners }, enquiries: { attributed, contextual }, enrolments: { attributed, contextual }, occupancy: { services: [...], overallStartPct, overallEndPct } }`. Tests: role/404/shape + the lib called with the resolved window + a zero-data campaign returns zeros (not nulls) with `hasData` flag.
- [ ] Hook `useCampaignPerformance(id)` (house standards, enabled-gated). Panel: "Performance" section directly ABOVE Assets in `CampaignDetailPanel` — funnel strip (4 stat blocks: Reached / Clicks + scans / Enquiries / Enrolments — attributed prominent, contextual as `text-2xs` muted "(+N at linked centres in window)"), occupancy delta chips per service (`71% → 78%`), and REQUIRED captions: "Attributed = traced via QR/activation links and tracked email — phone and walk-in enquiries aren't captured" and "Enrolment tracking via the parent portal begins with this deploy". Tokens, house classes.
- [ ] Green + eslint + build; commit `feat(marketing): campaign performance funnel`.

---

## Chunk 3: Crons

### Task 6: Marketing measurables cron (TDD)

- [ ] `/api/cron/marketing-measurables` — weekly Sunday `"45 20 * * 0"` (after auto-measurables, before Monday's scorecard-missing). handover-cleanup guard shape, lock `("marketing-measurables", "weekly")`. `weekOf` computed EXACTLY like auto-measurables:39-46 (copy the lines + comment). Matches measurables by NARROW title substrings (insensitive): `"creative request"`/`"design request"` → on-time % (delivered in past week where `deliveredAt <= effectiveDue(dueDate, pausedMs)` — reuse `effectiveDueDate` from creative-request constants) AND (separate substring `"turnaround"`) avg business-day turnaround; `"email open"` → unique opens last 7d; `"qr scan"` → scans last 7d; `"marketing enquir"` → attributed+contextual enquiries last 7d at the measurable's `serviceId` when set (reuse the attribution lib's query shapes where sensible). Skip substrings with no matching measurable silently; upsert `MeasurableEntry` with `notes: "Auto-populated from marketing hub data"`, `onTrack` via the same evaluate logic (copy `evaluateOnTrack` into a shared spot or reimplement locally with a comment — check if it's exported; if not exported, extract it to `src/lib/measurable-eval.ts` and refactor auto-measurables to import it ONLY if a 5-line change, else duplicate with a sync comment). Tests: 401/lock-skip/happy (title matching, weekOf, upsert args)/no-matching-measurables no-op. `vercel.json` entry.
- [ ] Commit `feat(eos): weekly marketing measurables auto-feed`.

### Task 7: Term autopilot (TDD)

- [ ] `src/lib/term-pack.ts`: `TERM_PACK: Array<{ type: CreativeRequestType, title: (term, year, serviceName) => string, purpose: (term, year) => string, weeksBefore: number }>` — v1 pack: poster (`"Term X welcome poster — <centre>"`, 4wk), flyer (`"Term X program flyer — <centre>"`, 4wk), social_tile (`"Term X countdown tiles — <centre>"`, 3wk), email_header (`"Term X newsletter headers — <centre>"`, 3wk). Idempotency marker: every generated request's `purpose` ENDS with `\n[auto:term-pack:<year>-T<term>]`. Idempotency is checked PER SERVICE inside the creation loop — `serviceAlreadyPacked(db, year, term, serviceId)` = `creativeRequest.count({ where: { serviceId, purpose: { contains: "[auto:term-pack:<year>-T<term>]" } } }) > 0`, skip that service — so a run that crashes after service 3 of 20 resumes the remaining 17 next week instead of a global marker locking them out forever. (Index-less contains scan is fine — low-hundreds-row table, weekly cadence.) `createTermPack(db, { year, term, termStart, services, requestedById })` — SEQUENTIAL creation via `createWithNumberRetry`, checklist seeding + `defaultDueDate` overridden to `termStart - 7d` clamped ≥ today+type turnaround; returns created count. `notifyTermPackCreated(db, { count, term, year })` — ONE UserNotification per active marketing user (type reuse `CREATIVE_REQUEST_SUBMITTED` or add `TERM_PACK_CREATED` — add the new constant, dated comment), link `/requests`.
- [ ] `/api/cron/term-autopilot` — weekly Monday `"0 21 * * 1"`. Uses `getCurrentTerm`/`getTermsForYear` from `@/lib/school-terms` (NEVER the term-calendar route's duplicate): find the NEXT term whose `startsOn` is within 4 weeks from now (incl. term 1 of next year — search this year + next); if none → `{skipped}` (per-service idempotency handles already-packed services inside the loop). Fallback-date warning: `getTermsForYear` falls back SILENTLY for years outside TERM_TABLE — add a tiny export to `src/lib/school-terms.ts`: `export function hasExactTermDates(year: number): boolean` (checks the table; one line + one test in the existing school-terms test files), and the cron logs `logger.warn("term-autopilot using approximate term dates", { year })` when false. Resolve requestedById (`role: "marketing", active: true`, oldest; none → guard.fail-style logged error + 200 `{skipped}`). Services = active services (`service.findMany({ where: { status: "active" } })` — CHECK the actual field for active services and use it; report what you find). Create pack sequentially, one digest notification. Tests: 401/lock-skip/no-term-window skip/already-created skip/happy path (asserts sequential creates with marker + digest notification + due-date clamps)/no-marketing-user skip. `vercel.json` entry.
- [ ] Commit `feat(marketing): term autopilot — pre-briefed request packs`.

### Task 8: Final verification + PR

- [ ] Full gates (all phase files + `npm test` fully green + eslint + build). CLAUDE.md: attribution conventions (attributed vs contextual), the three crons, sentAt semantics, term-pack marker. Final holistic reviewer (cross-cutting: attribution queries vs indexes, weekOf byte-parity, janitor safety vs scheduled sends, autopilot per-service idempotency, no notification spam). Merge origin/main; push; PR with: summary, deploy notes (no new env vars; crons live in vercel.json; scorecard measurables need matching TITLES created in the UI — document the exact substrings; scheduled sends keep `sentAt` null by design — a future Brevo-webhook stamp could backfill), Phase 6 backlog (CSAT, frequency caps, scheduled-cancel, partial re-send, tour stage).
