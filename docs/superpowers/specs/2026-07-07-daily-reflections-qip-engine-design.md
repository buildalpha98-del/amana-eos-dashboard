# Daily Reflections → Evidence → Living SAT/QIP

**Date:** 2026-07-07
**Status:** Approved design, pending implementation plan

## Problem

NSW services must keep a Self-Assessment Tool (SAT) current at all times; VIC services maintain a Quality Improvement Plan (QIP). Regulators can arrive unannounced and ask for it. Today the dashboard has a `QualityImprovementPlan` model with per-quality-area fields, but its evidence fields sit empty and nothing keeps the document current. Separately, educators have no daily reflection habit in the product, and parent-facing observation content is authored manually.

This feature makes one daily staff entry serve three audiences — parents (feed post), children (portfolio observation), and the regulator (SAT/QIP evidence) — and uses a weekly AI run to keep the SAT/QIP draft current with reviewable, evidence-linked updates.

## Decisions already made (with user)

1. **Review-gated SAT/QIP editing** — AI proposes changes; the director approves each. AI never writes directly into the regulator-facing document.
2. **One entry, staff picks audiences** — educator writes once; the system fans out to parent post and child observations based on their choices.
3. **Weekly Friday cadence** for the AI SAT/QIP update run.
4. **"Tags are the ledger" architecture** — existing `StaffReflection.qualityAreas` and `LearningObservation.mtopOutcomes` tags ARE the evidence system; no dedicated evidence table.
5. **Completion nudges in v1** — 5pm reminder to staff who haven't logged a daily reflection.

## Architecture Overview

```
Educator daily entry (service Daily tab)
  ├─ StaffReflection (type "daily", QA + MTOP tags, AI-suggested)
  ├─ fan-out: LearningObservation per tagged child
  └─ fan-out: ParentPost (if "Share with parents") → existing parent notification

Friday cron (qip-weekly-update)
  ├─ Phase 1: backfill tags on the week's untagged content (Haiku, aiTagged=true)
  ├─ Phase 2: per service, per quality area — gather week's evidence,
  │           propose updates via Sonnet template → QipSuggestion rows
  └─ Phase 3: notify directors of pending suggestions

Director (QIP tab)
  ├─ Evidence browser: query content by QA / MTOP tag
  ├─ Review panel: accept / edit / reject each QipSuggestion
  └─ "Copy for portal" plain-text export
```

## Unit 1: Daily reflection entry with fan-out

### Schema changes

`StaffReflection` (exists, `prisma/schema.prisma:2457`):
- Add `"daily"` to allowed `type` values (String field; enforced in Zod at `src/lib/schemas/staff-reflection.ts`).
- Add `mtopOutcomes String[]` (same vocabulary as `LearningObservation`: Identity, Community, Wellbeing, Learners, Communicators).
- Add `parentPostId String?` — link to the fanned-out `ParentPost`, if any.
- Add `aiTagged Boolean @default(false)` — provenance: tags were AI-backfilled rather than human-chosen.

`LearningObservation` (exists, `prisma/schema.prisma:2480`):
- Add `aiTagged Boolean @default(false)`.
- Add `sourceReflectionId String?` — link back to the daily reflection that created it.

Migration via `npx prisma migrate dev`.

### Entry UI

New quick-entry card on the service Daily tab (`src/components/services/`, wired into `src/app/(dashboard)/services/[id]/page.tsx` daily group):
- One textarea ("How did today go? What did the children engage with?").
- Optional child multi-select (children of this service, from existing children data).
- "Share with parents" toggle (only meaningful when children are tagged; a community post without child tags is also allowed, matching `ParentPost.isCommunity`).
- Tag chips: after the educator finishes typing (on explicit "Suggest tags" tap or on save), a Haiku call via new template `nqs/tag-content` suggests NQS quality areas (1–7) and MTOP outcomes; educator can toggle chips on/off. Suggested-then-confirmed tags are saved with `aiTagged=false` (human confirmed them); tags applied by the weekly sweep with no human in the loop are `aiTagged=true`.
- Saving never blocks on tagging. An untagged entry is valid; the weekly sweep backfills.

### Fan-out behavior (server-side, in the POST handler)

Extend `POST /api/services/[id]/reflections` (exists) — when `type === "daily"`:
1. Create the `StaffReflection`.
2. For each tagged child: create a `LearningObservation` (narrative = reflection content, `mtopOutcomes` inherited, `visibleToParent` = the share toggle, `sourceReflectionId` set). Store created IDs in `linkedObservationIds`.
3. If share-to-parents: create one `ParentPost` (type `observation`, `isCommunity` = false when children tagged / true otherwise, child tags = tagged children, content = reflection content, `authorId` = educator). Call existing `notifyParentNewPost()`. Store the post ID in `parentPostId`.
4. All three steps run in a single `prisma.$transaction`.

Validation: Zod schema extends the existing reflection schema with `childIds: z.array(z.string()).optional()`, `shareWithParents: z.boolean().optional()`, `mtopOutcomes: z.enum([...5 values]).array().optional()`. Uses `parseJsonBody`. Existing role access (staff and above) unchanged.

Error handling: if fan-out fails, the transaction rolls back and the educator sees the standard mutation error toast (existing `mutateApi` + `onError` pattern). No partial fan-out states.

### Editing/deleting

v1 keeps the existing reflection edit surface. Editing a daily reflection does NOT retroactively rewrite fanned-out observations/posts (they are independent artifacts once created — matches how educators think about a published post). Deleting a daily reflection leaves observations/posts in place; their edit/delete flows already exist.

## Unit 2: Completion tracking + 5pm nudge

### Status strip
On the reflections sub-tab: a Mon–Fri strip for the current week showing, per day, whether a daily reflection exists for this service (green check / grey dot). Data comes from the existing reflections list endpoint with a `type=daily` + date-range filter (already supports type filtering; add date filter params if absent).

### Nudge cron
New cron `daily-reflection-nudge`, weekdays 07:00 UTC (= 5pm AEST; accept the 1-hour drift under AEDT in v1 — same convention as existing crons):
- For each active service: if no `StaffReflection` with `type="daily"` was created today (Australia/Sydney day boundary), notify that service's educators/coordinator.
- Recipient resolution: users assigned to the service with roles staff/member (reuse the existing service-user assignment used by roster/service pages).
- Delivery: `sendNotificationEmail()` and `sendPush()` where a push subscription exists; respect `EmailSuppression`.
- Standard cron checklist: `verifyCronSecret`, `acquireCronLock("daily-reflection-nudge", "daily")`, `withApiHandler`, entry in `vercel.json` (Mon–Fri schedule), tests for auth-rejection + lock-skip + happy path.

### Weekly visibility
The existing Monday `compliance-risk-report` cron gains one section: services with fewer than 5 daily reflections last week, with the count.

## Unit 3: Weekly tag sweep + Evidence browser

### Tag sweep (Phase 1 of the Friday cron)
Find the week's `StaffReflection` rows with empty `qualityAreas` and `LearningObservation` rows with empty `mtopOutcomes`. Batch them (several items per prompt) through the `nqs/tag-content` Haiku template; write tags back with `aiTagged=true`. Malformed AI output for an item → leave it untagged and log a warning; the item simply contributes no evidence this week. Uses the existing `AiGenerationCache` for dedupe.

### Evidence browser
New panel on the QIP tab (`ServiceQIPTab.tsx` or a sibling component):
- Filter by NQS quality area (1–7) or MTOP outcome, plus date range (default: current term).
- Results: excerpts of matching reflections and observations with date, author, tagged children, and an `aiTagged` badge; click-through to the source item.
- Backed by one new read endpoint `GET /api/services/[id]/qip-evidence?qa=&mtop=&from=&to=` (thin query over the two existing tables, `withApiAuth`, standard `useQuery` with `retry: 2` + `staleTime`).

## Unit 4: QipSuggestion model + Friday cron

### New model

```prisma
model QipSuggestion {
  id            String   @id @default(cuid())
  qipId         String
  qip           QualityImprovementPlan @relation(...)
  qualityArea   Int      // 1–7
  field         String   // "strengths" | "areasForImprovement" | "progressNotes" | "evidenceCollected"
  currentText   String?  // snapshot of the field at proposal time
  proposedText  String
  rationale     String   // one-paragraph "why" from the AI
  evidenceRefs  Json     // [{ type: "reflection"|"observation", id, excerpt }]
  status        String   @default("pending") // pending | accepted | edited | rejected
  reviewedById  String?
  reviewedAt    DateTime?
  weekOf        DateTime // Monday of the evidence week
  createdAt     DateTime @default(now())
}
```

Accepted/edited/rejected rows are never deleted — they are the audit trail ("what changed, when, on what evidence, approved by whom").

### Friday cron `qip-weekly-update`
Schedule: Friday 06:00 UTC (~4pm AEST). Full cron checklist as in Unit 2.

Per service that has a `QualityImprovementPlan`:
1. Run the tag sweep (Unit 3) for that service's week.
2. For each quality area with ≥1 new evidence item this week: call new Sonnet template `compliance/qip-weekly-update` with the QA's current field values + the week's evidence excerpts. The template instructs: propose an update ONLY if the evidence materially adds to or contradicts the current text; otherwise return a no-change marker. Quiet areas produce no suggestions.
3. Parse the response (JSON-shaped output with `onMalformed`-style validation; malformed → log and skip that QA, do not create a garbage suggestion).
4. Create `QipSuggestion` rows (one per field the AI wants to change), with `currentText` snapshotted and `evidenceRefs` pointing at the source items.
5. If any suggestions were created for a service: notify the service's director/coordinator + admins via `sendNotificationEmail` (subject: "N SAT/QIP updates ready for review"). Deep link to the QIP tab.

Guard: if a QA already has pending suggestions from a prior week, still generate this week's (the review panel groups by week); do not silently skip — but the prompt includes pending proposals so the AI doesn't re-propose the same change.

Cost note: ≤7 Sonnet calls per service per week + Haiku tagging — cents per service. Tracked via existing `AiGenerationCache` cost fields.

## Unit 5: Director review UI + portal export

On the QIP tab:
- "Pending updates (n)" banner when pending `QipSuggestion` rows exist.
- Review panel (slide-over, matching existing ReportViewer pattern): suggestions grouped by quality area and week. Each shows current text vs. proposed text (visual diff highlight is a nice-to-have; side-by-side is the v1 requirement), the rationale, and evidence excerpts linking to source items.
- Actions per suggestion: **Accept** (patch the `QIPQualityArea` field with `proposedText`), **Edit & accept** (editable textarea, patch with edited text, status `edited`), **Reject** (status `rejected`, no document change). Accepting any suggestion bumps `QualityImprovementPlan.lastReviewDate` and `reviewedById`.
- Endpoints: `GET /api/qip/[qipId]/suggestions`, `PATCH /api/qip/[qipId]/suggestions/[suggestionId]` (`withApiAuth`, roles: member and above — matches existing QIP edit access; Zod-validated `{ action: "accept"|"edit"|"reject", text? }`).
- **"Copy for portal"**: button on the QIP tab producing a plain-text rendering of the full document (or a single QA) — heading per quality area, then strengths / areas for improvement / goal / strategies / progress — copied to clipboard. Client-side only; no new endpoint.

## Roles & permissions

- Daily reflection entry: staff, member, admin, head_office, owner (existing reflections route access).
- Suggestion review + QIP edits: member and above (existing QIP tab access).
- No new pages — everything lives on existing service tabs, so no `role-permissions.ts` / nav changes needed. (If the Evidence browser becomes its own page later, follow the new-page checklist.)

## New AI templates (seeded in `prisma/seed.ts`)

1. `nqs/tag-content` (Haiku): input = one or more content excerpts; output = JSON `{ items: [{ qualityAreas: number[], mtopOutcomes: string[] }] }`.
2. `compliance/qip-weekly-update` (Sonnet): input = QA number/name, current field texts, evidence excerpts, pending proposals; output = JSON `{ changes: [{ field, proposedText, rationale }] }` or `{ changes: [] }`.

## Testing

- Route tests (Vitest, existing helpers/mock patterns): reflections POST fan-out (daily type creates observations + post in transaction; non-daily unchanged; validation 400s; role 403s), qip-evidence GET, suggestions GET/PATCH (accept patches QA, edit stores edited text, reject leaves document untouched, 404 on wrong qip/suggestion pairing).
- Cron tests for both new crons: auth rejection, lock-skip, happy path; `qip-weekly-update` happy path asserts no-suggestion-on-no-change and malformed-AI-output skip.
- AI calls mocked throughout (existing pattern — never hit providers in tests).

## Out of scope (v1) — explicit fast-follows

- On-demand "refresh now" button on the QIP tab.
- Incidents, audits, menus, programs as additional evidence sources.
- Portfolio timeline view per child (observations already accumulate; the view is a later feature).
- Offline/mobile capture beyond the existing `clientMutationId` dedupe.
- Multi-tenant productization ("sell to other companies") — the tag data converts cleanly into a dedicated evidence ledger if/when that happens.
- Retroactive re-fan-out on reflection edit.
