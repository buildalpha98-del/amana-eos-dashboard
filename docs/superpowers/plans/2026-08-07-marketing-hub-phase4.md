# Marketing Hub — Phase 4 (Audiences, Reports, Umbrella) Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** (a) Saved email **audiences** — AND-combined condition rules replacing the raw centre-picker, evaluated at send time (never a frozen list); (b) a **per-send report panel** — open/click rates, first-24h curve, per-link clicks — built on Phase 3's `EmailEvent.deliveryLogId` correlation; (c) the **campaign umbrella** — creative requests and email sends linked to `MarketingCampaign` with an Assets section; (d) **per-recipient sends** for the <50 path (today every recipient sees the whole `to:` array).

**Architecture:** `EmailAudience` stores `rules Json` compiled by ONE shared lib (`audience-rules.ts`) into a `Prisma.CentreContactWhereInput` — used identically by the count preview, the send route, and audience CRUD (the Survey-audience precedent: evaluate at read time, don't materialise). The <50 send path pre-creates its `DeliveryLog` (status `sending`), dispatches per-recipient `sendTransactionalEmail` calls with `tags: ["dl:<id>"]` under bounded concurrency, and finishes by updating status (`sent`/`partial`/`failed`); the webhook gains a tag-first correlation branch (O(1), immune to Brevo's `"unknown"` messageId fallback). Campaign attribution reuses `DeliveryLog.entityType="MarketingCampaign"` (indexed, served by the existing generic `/api/email/history`) — no new column; `CreativeRequest` gains the house-pattern nullable `campaignId` FK.

---

## ⚠️ Critical context

1. **Same DB/migration/build rules as Phases 1–3** (prod DATABASE_URL; offline schema-diff migrations; `npx prisma generate && npx next build`; `set -a; source .env.local; set +a` for prisma CLI). Migration timestamps must sort after `20260806150000_family_debt_contacts` — use `20260807100000_...`.
2. **Key facts from investigation** (verified, with locations):
   - `CentreContact` (schema ~4842): conditions surface = `serviceId` (indexed), `status` (FREE-TEXT string — "active/withdrawn/paused" by comment only), `subscribed`, `createdAt` (NOT indexed — we add the index), `smsOptIn`. NO tags, NO enquiry/child relations. Waitlist/enquiry targeting is out of scope for v1 audiences.
   - Recipient `where` is currently duplicated across `campaign/send/route.ts` (~155) and `recipient-count/route.ts` (~10) — Phase 4 replaces BOTH with the shared compiler.
   - `EmailEvent` dedupe key is `(messageId, type, email)` → stored counts are unique-per-recipient; a recipient's 2nd click (even on a different link) is dropped. Per-link numbers are therefore "recipients whose FIRST click was this link" — label them exactly that.
   - Brevo click events carry `link` at top level; the webhook stores the raw body, so `payload.link` works. Resend events nest under `payload.data` — scope per-link aggregation to rows whose payload has a top-level `link` (Brevo) and ignore others.
   - `sendTransactionalEmail` already forwards `tags[]` (brevo.ts ~70) — unused until now. Brevo echoes `tag` back on transactional webhook events.
   - `messageId` fallback is the literal `"unknown"` (brevo.ts ~82) — never correlate on it; tag correlation avoids the trap.
   - `CampaignDetailPanel.tsx` (~823 lines) is a scroll stack of `<h3>` sections, NO tabs; the Assets section slots between "Linked Posts" (~line 675) and "Comments" (~677), copying the Linked Posts block shape.
   - Campaign GET (`marketing/campaigns/[id]`) is role-gated `["owner","head_office","admin","marketing"]` — Assets data rides inside it, so no new exposure. `useEmailHistory("MarketingCampaign", id)` (existing generic hook/route) serves the sends list as-is.
   - `MarketingPost` already carries `campaignId`; post sends keep `entityType="MarketingPost"` and are attributed to campaigns TRANSITIVELY (post → campaignId). `entityType="MarketingCampaign"` is ONLY for direct campaign sends — never set both; the post double-send guard depends on the MarketingPost branch staying intact.
   - The templateId→blocks→htmlContent resolution block has a documented twin in test-send — Phase 4 does not touch content resolution.
3. **Denominator convention (document in code + UI):** rate = unique events / `DeliveryLog.recipientCount`, where recipientCount is the post-suppression attempted count. Reports for sends created before the Phase 3 deploy show "No tracking data" (no correlated events), keyed on zero events + a caption.
4. Survey-audience precedent: `prisma/schema.prisma` ~8971 (`SurveyAudience`) + `src/lib/survey-audience.ts` — copy its evaluate-at-read-time doc rationale.

## File structure

| File | Responsibility |
|---|---|
| `prisma/schema.prisma` (modify) | `EmailAudience` model; `CreativeRequest.campaignId` FK + index + `MarketingCampaign.creativeRequests` back-relation; `CentreContact @@index([createdAt])` |
| `prisma/migrations/20260807100000_audiences_campaign_links/migration.sql` (create) | Offline, additive-only |
| `src/lib/audience-rules.ts` (create) | Zod rules schema (whitelisted fields), compiler → `CentreContactWhereInput`, engagement pre-query resolver |
| `src/app/api/email/audiences/route.ts` + `[id]/route.ts` (create) | CRUD, marketing-side roles |
| `src/app/api/email/recipient-count/route.ts` (modify) | Accept `audienceId`/rules via the shared compiler |
| `src/app/api/email/campaign/send/route.ts` (modify) | Accept `audienceId`; per-recipient <50 dispatch w/ tags + partial-failure statuses; `marketingCampaignId` → entityType |
| `src/lib/brevo-events.ts` (modify) | Parse `tag` (+ keep `link` accessible), `dl:` extraction |
| `src/app/api/webhooks/brevo/route.ts` (modify) | Tag-first correlation branch |
| `src/app/api/email/reports/[deliveryLogId]/route.ts` (create) | Per-send report aggregates |
| `src/components/marketing/EmailAnalytics.tsx` (modify) | Clickable recent-send rows → report panel |
| `src/components/marketing/SendReportPanel.tsx` (create) | Rates, 24h curve, per-link table, caveats |
| `src/components/email/EmailComposer.tsx` (modify) | Audience picker in the Recipients card |
| `src/components/email/AudienceManagerModal.tsx` (create) | Create/edit audiences, condition rows, live count |
| `src/hooks/useEmailTemplates.ts` (modify) | audiences hooks, widened send response (`deliveryLogId`, `suppressedCount`), report hook |
| `src/app/api/marketing/campaigns/[id]/route.ts` (modify) | Include `creativeRequests`; response `assets.emailSends` via second query |
| `src/components/marketing/CampaignDetailPanel.tsx` (modify) | Assets section |
| `src/app/api/creative-requests/route.ts` + `[id]/route.ts` (modify) | `campaignId` on create/PATCH (fulfiller-only) + list filter |
| `src/components/requests/RequestDetailPanel.tsx` (modify) | Fulfiller campaign link picker |
| Tests | new `audience-rules.test.ts`, `email-audiences.test.ts`, `email-reports.test.ts`; extend campaign-send, webhooks-brevo, brevo-events, marketing-campaigns, creative-requests |

Out of scope (Phase 5): attribution funnel (enquiries/enrolments), term autopilot, EOS scorecard feed, CSAT, frequency caps, scheduled-send cancel, Brevo temp-list cleanup (ticket noted in PR).

---

## Chunk 1: Audiences

### Task 1: Schema + migration

- [ ] **Step 1:** Add after the `EmailSuppression` model:

```prisma
/// Saved email audience — stores RULES, never a frozen recipient list
/// (Survey-audience precedent: evaluate at read/send time so membership is
/// always current). Rules shape is validated by src/lib/audience-rules.ts.
model EmailAudience {
  id          String  @id @default(cuid())
  name        String
  description String?
  /// AudienceRules JSON — see audienceRulesSchema. Conditions are AND-combined:
  /// { serviceIds?: string[], statuses?: string[], joinedAfter?: ISO,
  ///   joinedBefore?: ISO, engagement?: { kind: "opened"|"clicked"|"not_opened", days: number } }
  rules       Json
  archived    Boolean @default(false)

  createdById String?
  createdBy   User?   @relation("EmailAudiencesCreated", fields: [createdById], references: [id], onDelete: SetNull)

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([archived])
}
```

- [ ] **Step 2:** `CreativeRequest`: add the house-pattern nullable campaign link (UNNAMED relation, matching posts/tasks):

```prisma
  campaignId String?
  campaign   MarketingCampaign? @relation(fields: [campaignId], references: [id], onDelete: SetNull)
```

plus `@@index([campaignId])`; on `MarketingCampaign` add `creativeRequests CreativeRequest[]`; on `User` add `emailAudiencesCreated EmailAudience[] @relation("EmailAudiencesCreated")`.

- [ ] **Step 3:** `CentreContact`: add `@@index([createdAt])` (needed for joinedAfter/Before conditions).
- [ ] **Step 4:** format/validate → offline migration `20260807100000_audiences_campaign_links` (verify additive-only: 1 CREATE TABLE, ADD COLUMN campaignId, 3–4 CREATE INDEX, FKs) → generate → commit `feat(email): EmailAudience model + campaign links`.

### Task 2: Audience rules lib (TDD)

**Files:** Create `src/lib/audience-rules.ts`; Test `src/__tests__/lib/audience-rules.test.ts`

- [ ] **Step 1: Failing tests** covering:
- `audienceRulesSchema` accepts each condition alone and combined; rejects unknown fields (strict), empty-string serviceIds, `engagement.days` outside 1–365, unknown statuses (whitelist `["active","withdrawn","paused"]`).
- `compileAudienceWhere(rules)` (pure): `{}` → `{ subscribed: true }` (base is ALWAYS subscribed-only); serviceIds → `serviceId: { in }`; statuses → `status: { in }`; joinedAfter/Before → `createdAt: { gte/lte }` (both combine into one createdAt object).
- `resolveAudienceWhere(prisma, rules)` (async, handles engagement): `engagement.kind: "opened"` → queries `emailEvent.findMany({ where: { type: "opened", createdAt: { gte: <now - days> } }, select: { email: true }, distinct: ["email"] })` and ANDs `email: { in: [...] }` (lowercased); `"not_opened"` → `email: { notIn: [...] }`; no engagement → identical to compile, NO emailEvent query.
- Field whitelist: the compiler never interpolates rule keys into the where — assert a rules object smuggling `{ "email": {...} }` is rejected by the schema (strict zod).

- [ ] **Step 2: Implement** — `audienceRulesSchema` (`z.object({...}).strict()`), `type AudienceRules = z.infer<...>`, `compileAudienceWhere`, `resolveAudienceWhere` (takes a `Pick<PrismaClient,"emailEvent">`). Doc comment carries the evaluate-at-read-time rationale + the AND-combination contract + the note that `status` values mirror the free-text convention on CentreContact (comment-enforced, not enum).
- [ ] **Step 3:** Green; commit `feat(email): audience rules schema + where compiler`.

### Task 3: Audience CRUD + count/send integration (TDD)

**Files:** Create `src/app/api/email/audiences/route.ts` (GET list active + POST create), `src/app/api/email/audiences/[id]/route.ts` (GET w/ live count, PATCH, DELETE=archive); Modify `recipient-count` + `campaign/send`; Tests: new `email-audiences.test.ts`, extend `email-campaign-send.test.ts`

- [ ] **Step 1: Failing tests:**
- CRUD: roles `["owner","head_office","admin","marketing"]` (member → 403); create validates rules via `audienceRulesSchema` (bad rules → 400); PATCH updates name/rules; DELETE sets `archived: true` (never hard-deletes); GET `[id]` returns the audience + `count` (resolved live via `resolveAudienceWhere` + suppression subtraction like recipient-count).
- recipient-count: `?audienceId=` resolves rules → count post-suppression; unknown audienceId → 404; archived audience → 409.
- campaign/send: body `audienceId` (mutually exclusive with serviceIds/allCentres — zod refine) resolves recipients via the SAME `resolveAudienceWhere`; archived → 409; also body `marketingCampaignId?: string` sets `entityType: "MarketingCampaign"`, `entityId` (validated: campaign must exist → else 404; mutually exclusive with postId/enquiryId — the existing MarketingPost/ParentEnquiry branches take precedence per the transitive-attribution rule, so refine that at most one of enquiryId/postId/marketingCampaignId is set).
- [ ] **Step 2: Implement.** The recipient resolution in send + count collapses to: `const where = await resolveAudienceWhere(prisma, rules)` where rules come from audienceId lookup OR the legacy serviceIds mapping (`{ serviceIds }` compiled through the SAME lib — delete the hand-written where in both routes). Keep response shapes; count keeps `{count}`.
- [ ] **Step 3:** Green + api sweep; commit `feat(email): audience CRUD + unified recipient resolution`.

### Task 4: Composer audience UI

**Files:** Modify `EmailComposer.tsx`, `useEmailTemplates.ts`; Create `src/components/email/AudienceManagerModal.tsx`

- [ ] **Step 1:** Hooks: `useAudiences()` (list), `useAudience(id)` (detail+count), `useCreateAudience`, `useUpdateAudience`, `useArchiveAudience` — house standards. Widen `useSendEmail` param (`audienceId?`) and response type (`deliveryLogId`, `suppressedCount`).
- [ ] **Step 2:** Recipients card (self-contained block ~482–524): three-way mode — `All centres` / `Pick centres` (existing list) / `Saved audience` (select from useAudiences + "Manage audiences" link opening the modal). recipient-count query key gains the audienceId; send payload sends exactly one of the three shapes.
- [ ] **Step 3:** `AudienceManagerModal.tsx`: list existing (name, live count via detail fetch on expand, archive button w/ ConfirmDialog), create/edit form — name, then condition rows: centres multi-select, status multi-select (active/withdrawn/paused), joined after/before date inputs, engagement select (`opened`/`clicked`/`not_opened` within N days). Live count preview (debounced call to recipient-count with draft rules? — recipient-count takes audienceId only; ADD support for POSTing draft rules to `/api/email/audiences/preview-count` as part of Task 3 if not already — implementer: check Task 3's routes; if preview-count wasn't built, add it there first with a test, roles same as CRUD). `useEscapeClose`, tokens, aria-labels.
- [ ] **Step 4:** eslint + build; commit `feat(email): audience picker + manager in composer`.

---

## Chunk 2: Reports + per-recipient sends

### Task 5: Per-recipient <50 dispatch + tag correlation (TDD)

**Files:** Modify `campaign/send/route.ts`, `src/lib/brevo-events.ts`, `webhooks/brevo/route.ts`; extend `email-campaign-send.test.ts`, `brevo-events.test.ts`, `webhooks-brevo.test.ts`

- [ ] **Step 1: Failing tests:**
- brevo-events: `parseBrevoWebhookBody` returns `deliveryLogTag` (string|null) extracted from `body.tag` (string) or `body.tags[0]` (array form) when it matches `/^dl:(.+)$/` — returns the captured id; non-matching tags → null; existing fields unchanged.
- webhook: event with `tag: "dl:dl123"` → NO deliveryLog.findFirst, event created with `deliveryLogId: "dl123"`; event without tag falls through to the existing externalId branches (regression: existing correlation tests untouched).
- send route (<50): pre-creates DeliveryLog with `status: "sending"`, `externalIdType: "brevo_message_per_recipient"`, `externalId: null`; calls sendTransactionalEmail ONCE PER RECIPIENT each with `to: [single]` and `tags: ["dl:<thatLogId>"]`; on all-success updates the SAME row to `status: body.scheduledAt ? "scheduled" : "sent"`; on partial failure (mock one rejection) → `status: "partial"`, payload gains `_failedRecipients: [emails]`, response 200 with `failedCount`; on total failure → `status: "failed"` + 502. ≥50 campaign path unchanged (regression).
- [ ] **Step 2: Implement.** Bounded concurrency (chunks of 5, `Promise.allSettled` per chunk). Extend the `externalIdType` doc comment in schema? — NO schema edit needed (String column); update the comment in a later docs pass if desired. Keep the enquiry single-recipient branch on the same per-recipient machinery (it's 1 recipient — trivially compatible).
- [ ] **Step 3:** Green + full webhook/send/brevo-events files + api sweep; commit `feat(email): per-recipient sends with tag correlation — recipients no longer see each other`.

### Task 6: Per-send report API + panel (TDD route)

**Files:** Create `src/app/api/email/reports/[deliveryLogId]/route.ts`, `src/components/marketing/SendReportPanel.tsx`; Modify `EmailAnalytics.tsx`, `useEmailTemplates.ts`; Test new `email-reports.test.ts`

- [ ] **Step 1: Failing route tests:**
- Roles `["owner","head_office","admin","marketing"]`; unknown id → 404.
- Response: `{ log: { id, subject, status, recipientCount, createdAt, messageType }, stats: { delivered, uniqueOpens, uniqueClicks, bounced, openRate, clickRate }, hourly: [{ hour: 0..23, opens, clicks }], topLinks: [{ link, clickers }] }` — rates computed against `recipientCount` (assert divide-by-zero → 0 when recipientCount 0), hourly bucketed from event `createdAt` minus log `createdAt` clamped to 0–23 (events past 24h fold into bucket 23? NO — excluded from hourly, still in totals; assert), topLinks grouped from `payload.link` (top-level only; events without it ignored), sorted desc, top 10.
- Events fetched via `emailEvent.findMany({ where: { deliveryLogId } , select: { type, email, createdAt, payload } })` — single query, aggregation in JS (prisma-mock friendly; volumes are small).
- [ ] **Step 2: Implement route** with a `NO_TRACKING` shape: zero events → `stats: null`-ish flag `hasEvents: false` so the UI shows "No tracking data — this send predates event tracking or hasn't been opened yet".
- [ ] **Step 3: UI.** `useSendReport(deliveryLogId)` hook. `SendReportPanel` slide-over (house pattern: `useEscapeClose`, `role="dialog"`, tokens): headline rate pair (unique opens/clicks + % of recipients), delivered/bounced row, 24h bars (pure CSS flex bars like the mockup — no chart lib), "Recipients whose first click was this link" table, captions for the denominator convention and first-click-only caveat. `EmailAnalytics` recent-send rows become buttons opening the panel (keyboard operable, aria-label).
- [ ] **Step 4:** Green + eslint + build; commit `feat(email): per-send report — rates, 24h curve, first-click links`.

---

## Chunk 3: Campaign umbrella

### Task 7: Campaign links — API + panels (TDD)

**Files:** Modify `marketing/campaigns/[id]/route.ts`, `CampaignDetailPanel.tsx`, `creative-requests/route.ts` + `[id]/route.ts`, `RequestDetailPanel.tsx`, `useCreativeRequests.ts`, `useMarketing.ts` (campaign type); extend `marketing-campaigns.test.ts`, `creative-requests.test.ts`

- [ ] **Step 1: Failing tests:**
- creative-requests POST accepts `campaignId` (optional; validated existing campaign → else 400) — any role may set it at create (it's informational); PATCH `campaignId` (including null to unlink) is FULFILLER-only (extend the isCancelOnly guard to require `patch.campaignId === undefined` for requesters); list `?campaignId=` filter.
- campaigns [id] GET: include gains `creativeRequests` (select: id, requestNumber, title, status, dueDate, assignee name) and the response carries `emailSends` (second query: `deliveryLog.findMany({ where: { entityType: "MarketingCampaign", entityId: id }, select: { id, subject, status, recipientCount, createdAt }, orderBy createdAt desc, take: 20 })`).
- [ ] **Step 2: Implement APIs.** Update `requestInclude`? — NO: the campaign GET uses its own select for requests (avoid bloating the shared include).
- [ ] **Step 3: UI.**
  - `CampaignDetailPanel`: "Assets" section between Linked Posts and Comments, copying the Linked Posts block shape — creative requests (REQ number, title, `STATUS_LABELS` chip, click → navigate to `/requests?open=<id>` in a new tab or router push) and email sends (subject, recipientCount, date, status chip; click opens nothing in Phase 4 — the report panel lives on the analytics page; add a small "View in analytics" hint only if trivial).
  - `RequestDetailPanel`: fulfiller-only "Campaign" row — select populated from `useCampaigns()` (existing hook — verify name in `src/hooks/useMarketing.ts`), patching `campaignId` via `usePatchRequest`; requester sees the campaign name read-only when set.
  - Composer: when opened with `?campaignId=` query param (future entry point from the campaign panel — add the param handling now, one-liner), send includes `marketingCampaignId`.
- [ ] **Step 4:** Green + eslint + build; commit `feat(marketing): campaign umbrella — requests + email sends linked to campaigns`.

### Task 8: Final verification + PR

- [ ] Full gates: all phase test files green; `npm test` fully green (stash-verify any new failure against base before attributing); feature-file eslint (0 errors, no new warnings); `npx prisma generate && npx next build`.
- [ ] CLAUDE.md: extend the email + creative-request sections — audiences (rules-not-lists, shared compiler), per-recipient tag correlation (`brevo_message_per_recipient`), report route, campaign umbrella conventions (transitive post attribution rule).
- [ ] Final holistic reviewer (cross-cutting: compiler shared by count/send/CRUD — no drift; tag correlation backward-compat with Phase 3 rows; report caveats honest; campaign attribution exclusivity rule enforced; migration byte-diff).
- [ ] Merge latest origin/main first; push; `gh pr create` with: summary, deploy note (no new env vars; Brevo webhook config from Phase 3 must be live for reports to populate), the Brevo temp-list cleanup ticket note, and the Phase 5 backlog.
