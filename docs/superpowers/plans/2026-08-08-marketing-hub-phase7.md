# Marketing Hub — Phase 7 (Consolidation) Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** (a) **layout integrity** — fix the pre-existing bug where server-side block-mode sends ignore layout options entirely (2-arg `renderBlocksToHtml` calls → hardcoded defaults, not even org branding) AND escape `marketingLayout`'s interpolations, then (b) thread the composer's **layoutOptions through send/test-send/preview** with a strict whitelist schema so the preview finally matches the sent email; (c) **scheduled→sent status sync** via the Brevo webhook (closes the post-dispatch-cancel honesty gap); (d) **org-configurable frequency cap**; (e) **ledger completeness** — four parent-facing lifecycle sends recorded per the decision table; (f) **polish batch** (cron-auth consistency, composer dead vars, cowork sentAt stamp). **Phase 7 is migration-free** — verify at the end.

**Out of scope** (flagged, not forgotten): tour stage (parked for Jayden's product decision), CSAT on cowork work, Resend-side scheduled cancel, MarketingSendRecipient uniqueness (over-count is the documented bias).

---

## ⚠️ Critical context (investigation-verified — file:line refs current as of branch cut)

1. **Layout bug facts:** `EmailLayoutOptions` (email-marketing-layout.ts:31-49, all optional, `DEFAULT_LAYOUT` merge at :54). Server-side `renderBlocksToHtml(blocks, vars)` is called with TWO args in campaign/send (:136,:146), test-send (:79,:92), preview (:80,:90) — the third `layoutOptions` param is dead on the server, so block-mode mail gets `DEFAULT_LAYOUT`, not org branding. `marketingLayout` does NOT escape `o.*` interpolations (`headerLogoUrl`/`headerText` at :56-57, `headerColor` style at :76, `footerUrl`/`footerText`/`footerUrlLabel` at :90) while `renderBlock` does escape (:119). Fix escaping FIRST — it hardens the existing branding path and is a prerequisite for accepting user layout input. `isTrustedBlobUrl` (src/lib/trusted-urls.ts:12) is the image-host allowlist precedent.
2. **Composer facts:** `layoutOptions` is local `useState` seeded with hardcoded literals (EmailComposer.tsx:73-81), consumed ONLY by the client preview (:166-186), never sent, not in the form draft (`useFormDraft` at :41-46 tracks subject/blocks/htmlContent/mode only). Three server twins build layoutOpts from `getEmailBranding()`: campaign/send:114-121, test-send:59-66, preview:52-58 (the "twin" comments say TWO — they're stale; there are three composer-relevant + nurture-send's own).
3. **Status-sync facts:** Brevo webhook resolves `deliveryLogId` tag-first (webhooks/brevo/route.ts:56-71) then writes the event behind best-effort dedupe (:74-88). Scheduled rows come from three writers: campaign <50 (`brevo_message_per_recipient`, dl-tagged), campaign ≥50 (`brevo_campaign`, camp_id fallback), cowork (`brevo_message`/`brevo_campaign`, NO tag, NO sentAt ever). The sync is ONE conditional update — `updateMany({ where: { id: deliveryLogId, status: "scheduled" }, data: { status: "sent", sentAt: new Date() } })` — nested inside the `if (!existing)` dedupe branch, guarded on `parsed.type === "delivered" && deliveryLogId`. No-op against cancelled/partial/failed/sent/sending (never resurrects a cancel — Postgres serialises against cancel's claim; comment the invariant). Ignore count; never 4xx. Cowork <50 multi-recipient correlation only matches the first recipient's message-id — ACCEPTED gap, note in code. Resend webhook needs nothing (no deliveryLogId correlation; no scheduled Resend rows).
4. **Org-settings facts:** singleton `OrgSettings` row, everything new lives in `config Json` validated by `orgSettingsConfigSchema` (org-settings-shared.ts:179-224) with `ORG_SETTINGS_DEFAULTS` (:265-366) and a HAND-ROLLED per-field `mergeOrgSettings` (:378+ — a missed field silently never merges). PATCH is strict full-replace → new fields MUST carry `.default(3)` (precedent :85-87) or every existing document fails validation. `getOrgSettings()` is 60s in-process cached with `_clearOrgSettingsCache()` (tests must clear in beforeEach). UI: settings/organisation/OrganisationSettingsClient.tsx "Outbound email sender" Section (:485-516), numeric-field precedent `groceryRates` (:541-629). `getFrequencyCapped` must NOT call getOrgSettings internally (keeps the lib prisma-free/testable) — change signature to `getFrequencyCapped(db, emails, opts?: { cap?: number; now?: Date })`, call sites resolve the cap.
5. **Ledger decision table (record = counts toward weekly volume; blocking stays bulk-only):** RECORD — enquiries/[id]:134 waitlist confirmation, enrol/send-link:31 enrol link, families/[id]/remind:72 enrolment reminder, cron/touchpoint-scheduler:122 CRM drip. DO NOT RECORD — waitlist offer/expiry (time-critical transactional), enrolment confirmation/approval (receipts), magic links (auth), secondary-carer invites, new-family-welcome (goes to STAFF despite the name — verified), card-expiry (billing), all staff mail. New `MarketingSendSource` value `"lifecycle"` (plain String column — doc-comment update only, NO migration). All four sites use fire-and-forget `sendEmail(...).catch(...)` — record inside `.then()` ONLY when `sent` is non-empty (sendEmail returns `{sent, suppressed}`; suppressed → sent: []). Reuse the recorded-not-blocked comment wording from campaign/send:276-282.
6. **Polish batch:** auto-measurables hand-rolls its Bearer check (route.ts:20-31) — swap to `verifyCronSecret` WITHOUT touching the weekOf lines (byte-parity constraint); EmailComposer dead vars `hasDraft` (:45) + `previewMutation`/`useEmailPreview` import (:163/:16) — remove (the /api/email/preview ROUTE stays; it has other uses); cowork/email/send never stamps `sentAt` even for immediate sends — stamp `sentAt: scheduledAt ? undefined : new Date()` on its DeliveryLog create (consistency with the schema doc comment).
7. **Latest migration** `20260808200000_csat_send_ledger`. Phase 7 should create NO migration — if any task appears to need one, stop and re-check.
8. Same build/test conventions as Phases 1–6 (never `npm run build` locally; feature eslint zero-errors; house test preambles).

## File structure

| File | Responsibility |
|---|---|
| `src/lib/email-marketing-layout.ts` (modify) | Escape ALL option interpolations in `marketingLayout` (reuse/inline an escapeHtml; hex color already regex-safe once schema lands but escape anyway) |
| `src/lib/email-layout-schema.ts` (create) | Strict zod `layoutOptionsSchema` — headerColor hex regex, headerText ≤120, headerLogoUrl via `isTrustedBlobUrl` refine (or empty string), footerText ≤200, footerUrl https-only, footerUrlLabel ≤120, showUnsubscribe boolean; all optional, `.strict()` |
| `src/app/api/email/campaign/send/route.ts` (modify) | Accept `layoutOptions`; merge over branding base; pass merged opts to BOTH branches (3-arg renderBlocksToHtml) |
| `src/app/api/email/test-send/route.ts` + `preview/route.ts` (modify) | Same (all three twins; update the stale twin comments to name all three) |
| `src/components/email/EmailComposer.tsx` (modify) | Send layoutOptions in composedContent + test-send; ADD layoutOptions to the form draft; remove dead vars |
| `src/hooks/useEmailTemplates.ts` (modify) | Param types gain layoutOptions |
| `src/app/api/webhooks/brevo/route.ts` (modify) | scheduled→sent sync inside the dedupe branch |
| `src/lib/org-settings-shared.ts` + `OrganisationSettingsClient.tsx` (modify) | `email.marketingWeeklyCap` (schema `.default(3)` + defaults + merge + UI field) |
| `src/lib/frequency-cap.ts` (modify) | `getFrequencyCapped(db, emails, opts?)`; call sites resolve cap from `getOrgSettings()` |
| `src/app/api/{enquiries/[id],enrol/send-link,families/[id]/remind}/route.ts` + `cron/touchpoint-scheduler/route.ts` (modify) | `.then()`-gated `recordMarketingSends` (source "lifecycle") |
| `src/app/api/cron/auto-measurables/route.ts` (modify) | verifyCronSecret swap |
| `src/app/api/cowork/email/send/route.ts` (modify) | sentAt stamp on immediate sends |
| `prisma/schema.prisma` (modify) | `MarketingSendRecipient.source` doc comment only (+ "lifecycle") — NO SQL |
| Tests | extend: email-marketing-layout (new/extend — check exists), campaign-send, test-send, webhooks-brevo, frequency-cap, cowork-email-send, org-settings tests (check exists), the four lifecycle route tests (extend where files exist — enquiries has one; check the others), cron-auto-measurables |

---

## Tasks

### Task 1: Layout escaping + server block-branch parity (TDD — this is a bugfix)

- [ ] Failing tests first (find/extend the email-marketing-layout test file or create `src/__tests__/lib/email-marketing-layout.test.ts`): `marketingLayout` escapes a `"` in headerText/footerText/footerUrlLabel (attribute-breakout pin: `headerText: '"><script>'` must not appear raw); headerLogoUrl/footerUrl escaped in attributes; existing branding defaults still render (regression). Then implement the escaping (mirror `renderBlock`'s existing escape approach).
- [ ] Server parity: pass the branding-derived `layoutOpts` as the 3rd arg to EVERY server `renderBlocksToHtml` call (campaign/send ×2, test-send ×2, preview ×2). Tests: extend campaign-send + test-send — a blocks-mode send renders with the branding header (assert via the mocked layout lib call args OR the produced html containing branding text — pick what the existing test style supports). This alone fixes block emails ignoring org branding.
- [ ] Commit `fix(email): escape layout interpolations + block-mode sends get org branding`.

### Task 2: layoutOptions through the pipeline (TDD)

- [ ] `src/lib/email-layout-schema.ts` (TDD): the strict schema per the file table; tests — each field's guard (bad hex 400-shape, off-host logo rejected, javascript: footerUrl rejected, empty-string logo allowed, unknown key rejected).
- [ ] Routes: zod field `layoutOptions: layoutOptionsSchema.optional()` on campaign/send + test-send + preview; merged as `{ ...brandingLayoutOpts, ...body.layoutOptions }` (branding base so unset fields track org settings); update all three stale twin comments to name all three routes. Tests per route: custom headerText reaches the render call; omitted → branding base unchanged (regression).
- [ ] Composer: include `layoutOptions` in `composedContent` (thus send + test-send payloads); add `layoutOptions` to the `useFormDraft` state so settings survive reload; hook param types. eslint + build.
- [ ] Commit `feat(email): composer layout options flow through send — preview finally matches`.

### Task 3: scheduled→sent sync (TDD)

- [ ] Extend webhooks-brevo tests: delivered event for a `scheduled` row → `updateMany({where:{id, status:"scheduled"}, data:{status:"sent", sentAt: Date}})`; delivered for `cancelled` row → update matches 0 (mock returns count 0), response still 200, no other write; `partial` untouched (no updateMany call? — the updateMany fires but matches 0; assert the WHERE is status-guarded rather than asserting no call); duplicate delivered (dedupe hit) → NO sync attempt (nested in `!existing`); non-delivered event types → no sync. Implement per Critical context 3 with the cancel-race invariant comment.
- [ ] Cowork sentAt: stamp on immediate sends (`sentAt: scheduledAt ? undefined : new Date()`); extend cowork-email-send tests. Note the accepted <50 cowork correlation gap in a comment near the webhook fallback.
- [ ] Commit `feat(email): scheduled sends flip to sent on first delivery event`.

### Task 4: Org-configurable cap (TDD)

- [ ] org-settings-shared: `email.marketingWeeklyCap: z.number().int().min(1).max(20).default(3)` + defaults + the hand-rolled merge branch. Check for existing org-settings tests (grep) — extend for the new field (merge + default + PATCH round-trip if covered there).
- [ ] frequency-cap: `getFrequencyCapped(db, emails, opts?: { cap?: number; now?: Date })` — default cap stays `MARKETING_EMAIL_WEEKLY_CAP`; update lib tests (boundary against a custom cap). Call sites (campaign/send, cowork) resolve `(await getOrgSettings()).email.marketingWeeklyCap` — comment the 60s staleness window; extend both route tests (mock getOrgSettings — check how getEmailBranding is mocked there and mirror). `_clearOrgSettingsCache()` in beforeEach where needed.
- [ ] UI: numeric Field in the Outbound email sender Section (label "Weekly marketing email cap per parent", helper text naming the bulk-only enforcement). eslint + build.
- [ ] Commit `feat(email): org-configurable weekly frequency cap`.

### Task 5: Lifecycle ledger writes (TDD)

- [ ] Add `"lifecycle"` to `MarketingSendSource` + schema doc comment (NO migration — verify `prisma migrate diff` yields empty against HEAD schema... actually comment-only changes yield no SQL; still run validate). At each of the four sites: `.then((r) => { if (r.sent.length > 0) recordMarketingSends(prisma, r.sent.map(...), { source: "lifecycle", ... }) })` — read each route's actual sendEmail usage first (some may await; match the local idiom; contactId where available). Reuse the recorded-not-blocked rationale comment. Tests: extend the existing test files where present (enquiries/[id] has coverage — check the others; where a route has NO test file, add a minimal one covering just the ledger write + its sent-gating, using the house preamble).
- [ ] Commit `feat(email): lifecycle sends recorded in the frequency ledger`.

### Task 6: Polish batch (TDD where applicable)

- [ ] auto-measurables → `verifyCronSecret` (weekOf lines untouched — the existing 15 tests must stay green; the 401 test may need its expected error-shape updated to verifyCronSecret's — check both shapes first; if they differ, updating the test is correct).
- [ ] EmailComposer: remove `hasDraft`, `previewMutation`, the `useEmailPreview` import. eslint on the file must now be warning-free.
- [ ] Commit `chore: cron-auth consistency + composer dead-var cleanup`.

### Task 7: Final verification + PR

- [ ] Full gates; CONFIRM no migration was created (`git status prisma/migrations` clean). CLAUDE.md: layout-options flow + escaping note, status-sync invariant, configurable cap, lifecycle source. Final holistic reviewer (cross-cutting: three-twin layout consistency, sync-vs-cancel race comment, cap resolution staleness, ledger gating on sent). Merge origin/main; push; PR (deploy notes: no migration, no env vars; admins can now set the cap in Settings → Organisation; block-mode emails will change appearance — they now correctly carry org branding, flag to Jayden as an intentional visual fix) + remaining backlog (tour stage decision, CSAT-on-cowork, Resend scheduled cancel).
