# Daily Reflections → Evidence → Living SAT/QIP — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One daily staff reflection fans out to child portfolios and the parent feed, gets AI-tagged to NQS quality areas / MTOP outcomes, and a Friday AI run proposes review-gated SAT/QIP updates backed by that evidence.

**Architecture:** Extend existing models (`StaffReflection`, `LearningObservation`) rather than adding an evidence table — tags ARE the ledger. One new model (`QipSuggestion`) holds AI-proposed document changes with evidence refs; a director accepts/edits/rejects. Two new crons (weekday 5pm nudge; Friday tag-sweep + suggestion run).

**Spec:** `docs/superpowers/specs/2026-07-07-daily-reflections-qip-engine-design.md` — read it first.

**Tech Stack:** Next.js 16 App Router, Prisma 5.22 (Neon PG), Zod, Vitest, Anthropic SDK (direct `ai.messages.create` with `AiPromptTemplate` rows — mirror `src/app/api/cron/sentiment-analysis/route.ts`), React Query hooks.

**House rules that apply to every task** (from CLAUDE.md — non-negotiable):
- Routes: `withApiAuth` (session) or `withApiHandler` + Bearer CRON_SECRET (crons); `parseJsonBody`; Zod with exact enums; `ApiError` factories.
- Crons: `verifyCronSecret` pattern (`authorization === Bearer ${CRON_SECRET}`), `acquireCronLock(name, period)`, entry in `vercel.json`, tests for auth-reject + lock-skip + happy path.
- Client: mutations get `onError` destructive toasts; queries get `retry: 2` + `staleTime`; use `fetchApi`/`mutateApi`; query keys use primitives only.
- Tests: `mockImplementation` with input-based routing (never `mockResolvedValueOnce` chains); helpers in `src/__tests__/helpers/` (`prisma-mock`, `auth-mock`, `request`); AI calls always mocked.
- No `console.*` in prod code — use `logger`.

---

## Chunk 1: Schema, validation, AI templates

### Task 1: Prisma schema changes

**Files:**
- Modify: `prisma/schema.prisma` (StaffReflection ~2458, LearningObservation ~2481, QualityImprovementPlan ~5342, User model)

- [ ] **Step 1: Edit models**

`StaffReflection` — change the `type` comment and add three fields after `mood`:

```prisma
  type                 String // "daily" | "weekly" | "monthly" | "critical" | "team"
  ...
  mood                 String? // "positive" | "neutral" | "concern"
  mtopOutcomes         String[] @default([]) // Identity | Community | Wellbeing | Learners | Communicators
  parentPostId         String? // ParentPost fanned out from this daily reflection, if shared
  /// True when qualityAreas/mtopOutcomes were backfilled by the weekly AI sweep
  /// (no human confirmed them). Human-confirmed tags leave this false.
  aiTagged             Boolean  @default(false)
```

`LearningObservation` — add after `visibleToParent`:

```prisma
  aiTagged           Boolean @default(false)
  /// Daily StaffReflection this observation was fanned out from, if any.
  sourceReflectionId String?
```

New model after `QIPQualityArea` (~line 5377):

```prisma
/// AI-proposed SAT/QIP updates awaiting director review. Rows are never
/// deleted — accepted/edited/rejected rows are the audit trail of what
/// changed, when, on what evidence, approved by whom.
model QipSuggestion {
  id           String                 @id @default(cuid())
  qipId        String
  qip          QualityImprovementPlan @relation(fields: [qipId], references: [id], onDelete: Cascade)
  qualityArea  Int // 1-7
  field        String // "strengths" | "areasForImprovement" | "progressNotes" | "evidenceCollected"
  currentText  String?                @db.Text
  proposedText String                 @db.Text
  rationale    String                 @db.Text
  evidenceRefs Json // [{ type: "reflection"|"observation", id, excerpt }]
  status       String                 @default("pending") // pending | accepted | edited | rejected
  reviewedById String?
  reviewedBy   User?                  @relation("QipSuggestionReviewer", fields: [reviewedById], references: [id])
  reviewedAt   DateTime?
  weekOf       DateTime // Monday 00:00 Australia/Sydney of the evidence week
  createdAt    DateTime               @default(now())

  @@index([qipId, status])
  @@index([weekOf])
}
```

Wire back-relations: `QualityImprovementPlan` gets `suggestions QipSuggestion[]`; `User` gets `qipSuggestionReviews QipSuggestion[] @relation("QipSuggestionReviewer")`.

- [ ] **Step 2: Migrate**

Run: `npx prisma migrate dev --name daily_reflections_qip_suggestions`
Expected: additive-only migration (3 + 2 new columns, 1 new table), applies cleanly. If Neon reports a failed prior migration, see memory `reference_neon_migration_recovery.md` (`prisma migrate resolve`).

- [ ] **Step 3: Commit** — `feat(schema): daily reflection fan-out fields + QipSuggestion model`

### Task 2: Zod schema updates

**Files:**
- Modify: `src/lib/schemas/staff-reflection.ts`
- Test: `src/__tests__/lib/staff-reflection-schema.test.ts` (create)

- [ ] **Step 1: Failing tests** — new test file asserting: `"daily"` parses as a valid type; `mtopOutcomes: ["Identity"]` accepted, `["Bogus"]` rejected; `childIds` accepts cuids; `shareWithParents` boolean; all three optional; weekly reflection without new fields still parses.

- [ ] **Step 2: Implement**

```ts
export const REFLECTION_TYPES = ["daily", "weekly", "monthly", "critical", "team"] as const;
export const MTOP_OUTCOMES = ["Identity", "Community", "Wellbeing", "Learners", "Communicators"] as const;
export const mtopOutcomeSchema = z.enum(MTOP_OUTCOMES);

export const createReflectionSchema = z.object({
  // ...existing fields unchanged...
  mtopOutcomes: z.array(mtopOutcomeSchema).max(5).optional(),
  childIds: z.array(z.string().cuid()).max(50).optional(),
  shareWithParents: z.boolean().optional(),
});
```

`updateReflectionSchema` additionally omits `childIds`/`shareWithParents` (no retroactive re-fan-out — spec).

- [ ] **Step 3: Run** `npm test -- staff-reflection-schema` → PASS. Commit.

### Task 3: Seed the two AI templates

**Files:**
- Modify: `prisma/seed.ts` (template array ~2400–2828; upsert loop at ~2809 handles new entries)

- [ ] **Step 1: Add `nqs/tag-content`** (match the haiku model string used by `knowledge/answer` in the same file; maxTokens 1024). Variables: `["items"]`. Prompt: educator content excerpts (numbered) in, strict JSON out —

```
You tag Australian OSHC educator content against the NQS and MTOP frameworks.

NQS Quality Areas: 1 Educational Program and Practice, 2 Children's Health and Safety, 3 Physical Environment, 4 Staffing Arrangements, 5 Relationships with Children, 6 Collaborative Partnerships, 7 Governance and Leadership.
MTOP Outcomes: Identity, Community, Wellbeing, Learners, Communicators.

Content items:
{{items}}

For each item, pick ONLY the areas/outcomes genuinely evidenced (max 3 quality areas, max 2 outcomes; empty arrays if nothing clearly applies).
Respond with ONLY valid JSON, no markdown fences:
{"items":[{"index":1,"qualityAreas":[5],"mtopOutcomes":["Wellbeing"]}]}
```

- [ ] **Step 2: Add `compliance/qip-weekly-update`** (sonnet model string matching `nqs/observation-draft`; maxTokens 1500). Variables: `["documentType","qualityArea","qualityAreaName","currentFields","evidence","pendingProposals"]`. Prompt requires: propose changes ONLY where the week's evidence materially adds to or contradicts current text; never invent evidence; don't re-propose anything in pendingProposals; output strict JSON `{"changes":[{"field":"strengths|areasForImprovement|progressNotes|evidenceCollected","proposedText":"...","rationale":"..."}]}` or `{"changes":[]}`. proposedText must be the full replacement text for the field (not a diff), preserving anything still true in the current text.

- [ ] **Step 3: Verify + commit** — `npx tsx prisma/seed.ts` upserts without error (idempotent). Commit.

---

## Chunk 2: Server routes

### Task 4: Daily-reflection fan-out in reflections POST

**Files:**
- Modify: `src/app/api/services/[id]/reflections/route.ts`
- Test: `src/__tests__/api/reflections.test.ts` (extend)

- [ ] **Step 1: Failing tests** — extend the existing suite (reuse its mock scaffolding):
1. daily + 2 childIds + shareWithParents → 201; `learningObservation.create` called twice with `sourceReflectionId`, `visibleToParent: true`, inherited `mtopOutcomes`; `parentPost.create` called once (`type: "observation"`, `isCommunity: false`, 2 tag creates); reflection row gets `linkedObservationIds` (2) + `parentPostId`; `notifyParentNewPost` called.
2. daily + no children + shareWithParents → community post (`isCommunity: true`, no tags), no observations.
3. daily + children + shareWithParents=false → observations with `visibleToParent: false`, NO parentPost, NO notify.
4. weekly (unchanged path) → no observation/post creates.
5. daily + childId not in service → 400, nothing created (transaction).

- [ ] **Step 2: Implement** — inside the existing `$transaction`, placed **after the `activityLog.create` call** (route.ts:110-122 — do NOT skip it), when `data.type === "daily"`. The conditional `staffReflection.update` below **replaces the transaction's final `return reflection`** (when no fan-out happened, still `return reflection`):

```ts
let observationIds: string[] = [];
let parentPostId: string | null = null;
const childIds = data.childIds ?? [];

if (childIds.length > 0) {
  const valid = await tx.child.findMany({
    where: { id: { in: childIds }, serviceId: id },
    select: { id: true, firstName: true },
  });
  if (valid.length !== childIds.length)
    throw ApiError.badRequest("One or more tagged children do not belong to this service");

  for (const child of valid) {
    const obs = await tx.learningObservation.create({
      data: {
        childId: child.id, serviceId: id, authorId: session.user.id,
        title: data.title, narrative: data.content,
        mtopOutcomes: data.mtopOutcomes ?? [],
        visibleToParent: data.shareWithParents === true,
        sourceReflectionId: reflection.id,
      },
      select: { id: true },
    });
    observationIds.push(obs.id);
  }
}

if (data.shareWithParents) {
  const post = await tx.parentPost.create({
    data: {
      serviceId: id, authorId: session.user.id,
      title: data.title, content: data.content, type: "observation",
      isCommunity: childIds.length === 0,
      tags: childIds.length > 0 ? { create: childIds.map((childId) => ({ childId })) } : undefined,
    },
    select: { id: true },
  });
  parentPostId = post.id;
}

if (observationIds.length > 0 || parentPostId) {
  return tx.staffReflection.update({
    where: { id: reflection.id },
    data: { linkedObservationIds: observationIds, parentPostId },
    include: { author: { select: { id: true, name: true, avatar: true } } },
  });
}
```

Pass `mtopOutcomes: data.mtopOutcomes ?? []` in the reflection create too. After the transaction, if `parentPostId && childIds.length > 0`, fire-and-forget `notifyParentNewPost(parentPostId, data.title, "observation", childIds)` with `.catch(logger.error)` — mirror `parent-posts/route.ts:155-159`.

- [ ] **Step 3: Run tests** → PASS (all existing reflections tests too). Commit: `feat(reflections): daily type fans out to observations + parent post`.

### Task 5: Evidence endpoint

**Files:**
- Create: `src/app/api/services/[id]/qip-evidence/route.ts`
- Test: `src/__tests__/api/qip-evidence.test.ts` (create)

- [ ] **Step 1: Failing tests** — 401 unauthenticated; 403 wrong-service member; 200 merges reflections (filtered `qualityAreas has qa`) + observations (filtered `mtopOutcomes has mtop`) sorted desc by createdAt; date-range params respected; `limit` capped.

- [ ] **Step 2: Implement** — `GET` via `withApiAuth`. `ensureServiceAccess` is file-local to the reflections route — copy the 8-line helper into this route (or extract to a shared module if touching both anyway). Query params: `qa` (1–7), `mtop` (enum), `from`, `to` (ISO dates), `limit` (default 50, max 100 via `safeLimit`). When `qa` set → reflections where `qualityAreas has qa` PLUS observations only if no `mtop` filter conflicts; simplest correct shape:
  - reflections: `{ serviceId, createdAt range, ...(qa ? {qualityAreas:{has:qa}} : {}), ...(mtop ? {mtopOutcomes:{has:mtop}} : {}) }`
  - observations: `{ serviceId, createdAt range, ...(mtop ? {mtopOutcomes:{has:mtop}} : {}) }` — observations carry no QA tags, so **when `qa` is set and `mtop` is not, return reflections only**.
  - Map both to `{ kind: "reflection"|"observation", id, title, excerpt: content/narrative first 300 chars, qualityAreas?, mtopOutcomes, aiTagged, author, childId?, createdAt }`, merge, sort desc, slice to limit. Return `{ items }`.

- [ ] **Step 3: Run tests** → PASS. Commit: `feat(qip): evidence browser endpoint`.

### Task 6: Suggestions API

**Files:**
- Create: `src/app/api/qip/[id]/suggestions/route.ts` (GET)
- Create: `src/app/api/qip/[id]/suggestions/[suggestionId]/route.ts` (PATCH)
- Test: `src/__tests__/api/qip-suggestions.test.ts` (create)

**CRITICAL:** the segment MUST be `[id]`, not `[qipId]` — `src/app/api/qip/[id]/` already exists and Next.js forbids sibling dynamic segments with different names (build error: "You cannot use different slug names for the same dynamic path"). Destructure `const { id: qipId } = await context!.params!`.

- [ ] **Step 1: Failing tests** — GET: 401; 200 returns pending (default) or `?status=all`; scoped: member of another service gets 403 (compare QIP's serviceId to `session.user.serviceId` unless org-wide role, same `ORG_WIDE_ROLES` pattern). PATCH: accept → `qIPQualityArea.update` called with `{ [field]: proposedText }` + suggestion → accepted + qip `lastReviewDate`/`reviewedById` bumped; edit with `text` → field patched with edited text, status `edited`; reject → no QA update, status `rejected`; 404 when suggestion doesn't belong to qipId; 400 invalid action; 409 when suggestion already reviewed.

- [ ] **Step 2: Implement PATCH** core (roles `["owner","head_office","admin","member"]`, matching the areas route):

```ts
const patchSchema = z.object({
  action: z.enum(["accept", "edit", "reject"]),
  text: z.string().trim().min(1).max(20_000).optional(),
});
// edit requires text: if (action === "edit" && !text) throw ApiError.badRequest(...)

const result = await prisma.$transaction(async (tx) => {
  const suggestion = await tx.qipSuggestion.findFirst({
    where: { id: suggestionId, qipId },
    include: { qip: { select: { serviceId: true } } },
  });
  if (!suggestion) throw ApiError.notFound("Suggestion not found");
  // service scoping for non-org-wide roles
  if (suggestion.status !== "pending") throw ApiError.conflict("Suggestion already reviewed");

  if (action !== "reject") {
    const finalText = action === "edit" ? text! : suggestion.proposedText;
    await tx.qIPQualityArea.update({
      where: { qipId_qualityArea: { qipId, qualityArea: suggestion.qualityArea } },
      data: { [suggestion.field]: finalText },
    });
    await tx.qualityImprovementPlan.update({
      where: { id: qipId },
      data: { lastReviewDate: new Date(), reviewedById: session.user.id },
    });
  }
  return tx.qipSuggestion.update({
    where: { id: suggestion.id },
    data: {
      status: action === "accept" ? "accepted" : action === "edit" ? "edited" : "rejected",
      ...(action === "edit" ? { proposedText: text! } : {}),
      reviewedById: session.user.id, reviewedAt: new Date(),
    },
  });
});
```

Plus an `activityLog` create (`action: "reviewed_qip_suggestion"`).

- [ ] **Step 3: Run tests** → PASS. Commit: `feat(qip): suggestion review endpoints`.

---

## Chunk 3: Crons

### Task 7: `daily-reflection-nudge` cron

**Files:**
- Create: `src/app/api/cron/daily-reflection-nudge/route.ts`
- Modify: `vercel.json` (add `{ "path": "/api/cron/daily-reflection-nudge", "schedule": "0 7 * * 1-5" }` — 5pm AEST)
- Test: `src/__tests__/api/cron/daily-reflection-nudge.test.ts` (create)

- [ ] **Step 1: Failing tests** — 401 without Bearer; lock-skip when `acquireCronLock` returns not-acquired; happy path: service WITH a daily reflection today → no email; service WITHOUT → `sendNotificationEmail` called once per active staff/member user of that service; inactive users skipped.

- [ ] **Step 2: Implement** — mirror `ai-task-agent` auth + lock (`acquireCronLock("daily-reflection-nudge", "daily")`). Sydney day boundary:

```ts
function sydneyDayStartUtc(now = new Date()): Date {
  const syd = new Date(now.toLocaleString("en-US", { timeZone: "Australia/Sydney" }));
  const offsetMs = syd.getTime() - now.getTime();
  const sydMidnight = new Date(syd); sydMidnight.setHours(0, 0, 0, 0);
  return new Date(sydMidnight.getTime() - offsetMs);
}
```

For each active service (`prisma.service.findMany({ where: { status: "active" } })` — Service has `status ServiceStatus`, NOT an `active` boolean; mirror `sentiment-analysis/route.ts:59`): count `staffReflection` where `type: "daily"`, `createdAt >= sydneyDayStartUtc()`. If 0 → recipients = `prisma.user.findMany({ where: { serviceId, active: true, role: { in: ["staff", "member"] } } })` (User's flag is `active`, not `isActive`); send `sendNotificationEmail({ to, toName, subject: "Daily reflection reminder — ${service.name}", html, type: "daily_reflection_nudge", relatedId: serviceId, relatedType: "Service" })`. Simple branded HTML (borrow `wrapEmail` shape from `src/lib/notifications/attendance.ts`, or plain paragraph + CTA link to `/services/${serviceId}?tab=compliance&sub=reflections`). **Also push** (spec Unit 2): look up each recipient's push subscriptions (find the PushSubscription model's user/email linkage in `src/lib/push/webPush.ts` and mirror whichever existing staff-push lookup the codebase uses) and `sendPush(sub, { title, body, url })` per subscription — failures logged via `logger.warn`, never fatal. Return counts `{ servicesChecked, servicesMissing, emailsSent, pushesSent }` and `guard.complete(...)`.

- [ ] **Step 3: Run tests** → PASS. Commit: `feat(cron): 5pm daily reflection nudge`.

### Task 8: `qip-weekly-update` cron (tag sweep + suggestions + notify)

**Files:**
- Create: `src/app/api/cron/qip-weekly-update/route.ts`
- Create: `src/lib/qip-weekly.ts` (pure helpers so the cron stays thin + testable)
- Modify: `vercel.json` (add `{ "path": "/api/cron/qip-weekly-update", "schedule": "0 6 * * 5" }` — Fri ~4pm AEST)
- Test: `src/__tests__/api/cron/qip-weekly-update.test.ts` + `src/__tests__/lib/qip-weekly.test.ts`

- [ ] **Step 1: `qip-weekly.ts` helpers (TDD)** —
  - `mondayOfWeekSydney(now): Date` — Monday 00:00 Sydney as UTC instant (reuse the sydneyDayStartUtc approach, minus `(dayOfWeek+6)%7` days).
  - `buildEvidenceExcerpts(reflections, observations): string` — numbered excerpt block (300-char clips, dated) for the prompt.
  - `parseTagResponse(text, expectedCount)` / `parseChangesResponse(text)` — strict JSON.parse with shape validation (Zod), returning `null` on malformed. Tests: valid, malformed, fenced-JSON (strip ```json fences), wrong-shape.

- [ ] **Step 2: Failing cron tests** — 401; lock-skip; `ANTHROPIC_API_KEY` missing → skip; happy path with mocked Anthropic client: untagged reflection gets tags written (`aiTagged: true`); QA with evidence + AI change → `qipSuggestion.create` with snapshot `currentText`, `evidenceRefs`, correct `weekOf`; QA whose AI returns `{"changes":[]}` → no create; malformed AI JSON → logged, skipped, cron still succeeds; suggestions created → one notification email per member/admin recipient.

- [ ] **Step 3: Implement cron** — auth + `acquireCronLock("qip-weekly-update", "weekly")`. Window: `weekStart = mondayOfWeekSydney(now)` → now. Per service with a QIP (`prisma.qualityImprovementPlan.findMany({ include: { qualityAreas: true, service: ... } })`):
  1. **Sweep:** fetch week's reflections with `qualityAreas: { isEmpty: true }` and observations with `mtopOutcomes: { isEmpty: true }`; batch ≤10 items into the `nqs/tag-content` template (load via `prisma.aiPromptTemplate.findUnique({ where: { slug } })`, `replaceAll("{{items}}", ...)`, `ai.messages.create` — the `sentiment-analysis` pattern); write tags back with `aiTagged: true`; malformed → `logger.warn`, leave untagged. **Cache/dedupe:** before each model call, sha256-hash the rendered prompt and check `AiGenerationCache` (`kind: "nqs-tag-content"`, `@@unique([kind, inputHash])`); on hit reuse `output`, on miss call the model and write the cache row with token/cost fields — mirror an existing `aiGenerationCache` call site in the repo for the exact field mapping. Same pattern for phase 2 with `kind: "qip-weekly-update"`.
  2. **Suggest:** re-fetch the week's tagged content; group evidence by QA with ONE rule: **reflections drive QA grouping** (a reflection appears under every QA in its `qualityAreas`); each reflection's fanned-out observations (matched via `sourceReflectionId`) ride along inside that reflection's excerpt block (adding their MTOP outcomes + child count, never names). Standalone observations (no `sourceReflectionId`) are not QA-grouped and contribute nothing in v1 — they carry MTOP tags only. For each QA with ≥1 evidence item: build variables (currentFields = the 4 target fields' text, evidence block, pendingProposals = that QA's pending suggestions' proposedText), call `compliance/qip-weekly-update`, parse; create one `QipSuggestion` per returned change with `currentText` snapshot, `evidenceRefs` `[{type,id,excerpt}]`, `weekOf: weekStart`.
  3. **Notify:** if any suggestions created for a service → email service-assigned `member` users + all active `admin`/`head_office`/`owner` users: subject `"${n} ${documentType === "sat" ? "SAT" : "QIP"} update(s) ready for review — ${service.name}"`, link `/services/${serviceId}?tab=compliance&sub=qip`.
  Return `{ services, tagged, suggestionsCreated, notified }`.

- [ ] **Step 4: Run tests** → PASS. Commit: `feat(cron): Friday QIP weekly update — tag sweep + AI suggestions`.

### Task 9: Compliance-risk-report addition

**Files:**
- Modify: `src/app/api/cron/compliance-risk-report/route.ts`
- Test: extend its existing test file if one exists (check `src/__tests__/api/` for it; `cron-compliance-alerts.test.ts` is a different cron)

- [ ] **Step 1:** Read the route; add a section computing, per service, count of `type: "daily"` reflections in the previous Mon–Fri Sydney week; include services with count < 5 in the report body ("Daily reflection gaps: {service} — {n}/5 days"). Follow whatever report-assembly shape the file already uses. Test the counting query logic if the file has tests; otherwise add a minimal happy-path assertion.
- [ ] **Step 2:** Commit: `feat(cron): daily-reflection gaps in compliance risk report`.

---

## Chunk 4: UI

General: all new client data access goes through `useReflections.ts` / new `useQipSuggestions.ts` hooks using `fetchApi`/`mutateApi`; every mutation has the destructive-toast `onError`; queries `retry: 2, staleTime: 30_000`.

### Task 10: Daily entry card

**Files:**
- Create: `src/components/services/DailyReflectionCard.tsx`
- Modify: `src/hooks/useReflections.ts` (create-mutation gains the new fields; add tag-suggest helper)
- Modify: `src/app/(dashboard)/services/[id]/page.tsx` (render card at top of the reflections sub-tab, or "daily" group if a better slot exists — inspect `ServiceReflectionsTab.tsx` first and follow its composition)

- [ ] Build: textarea (placeholder "How did today go? What did the children engage with?"), optional child multi-select (source the service's children the same way `CreateParentPostForm.tsx` does), "Share with parents" toggle (Switch), tag chips for QA 1–7 + 5 MTOP outcomes (toggleable pills), "Suggest tags" button → `useAiGenerate` with `templateSlug: "nqs/tag-content"`, `variables: { items: "1. " + content }`, parse JSON client-side (wrap in try/catch; on malformed just toast "Couldn't suggest tags — pick manually"); pre-select returned chips (user can still toggle). Submit → existing create-reflection mutation with `type: "daily"`, title auto-generated `"Daily reflection — {date en-AU}"` if blank, `childIds`, `shareWithParents`, `qualityAreas`, `mtopOutcomes`. Success toast confirms fan-out ("Shared with N families" when applicable). Disabled submit while pending; mobile-first (`sm:` breakpoint conventions).
- [ ] Commit: `feat(services): daily reflection quick-entry card`.

### Task 11: Mon–Fri status strip

**Files:**
- Modify: `src/components/services/ServiceReflectionsTab.tsx` (+ small `DailyStatusStrip` subcomponent in the same file or sibling)
- Modify: reflections GET route — add `from`/`to` date params (definitely absent today: GET only supports type/qa/authorId/cursor/limit) so the strip can fetch this week's dailies cheaply

- [ ] Build: five cells Mon–Fri (current Sydney week); green check when a `type=daily` reflection exists that day, grey dot otherwise, today outlined. Data: one query `type=daily&from={monday}&to={now}` mapped to weekday buckets client-side (Sydney tz via `toLocaleDateString("en-AU", { timeZone: "Australia/Sydney", weekday: "short" })`).
- [ ] Add route test for the new date params in `reflections.test.ts`. Commit.

### Task 12: Evidence browser panel

**Files:**
- Create: `src/components/services/QipEvidenceBrowser.tsx`
- Modify: `src/components/services/ServiceQIPTab.tsx` (add an "Evidence" toggle/section rendering the browser)
- Modify: `src/hooks/useReflections.ts` or new `src/hooks/useQipEvidence.ts`

- [ ] Build: filter row (QA select 1–7 with names, MTOP select, date-range presets: This term ≈ last 10 weeks default / last 4 weeks / custom), result list of excerpt cards (kind badge, date, author, `aiTagged` "AI-tagged" badge, tagged child count for observations). Each card **click-throughs to the source item** (spec Unit 3): link to `/services/${id}?tab=compliance&sub=reflections` / `?tab=program&sub=observations` — highlight-by-id query param optional; the tab link is the v1 requirement. Empty state: "No evidence for this filter yet — daily reflections feed this automatically."
- [ ] Commit: `feat(qip): evidence browser`.

### Task 13: Suggestion review panel + pending banner

**Files:**
- Create: `src/components/services/QipSuggestionsPanel.tsx`
- Create: `src/hooks/useQipSuggestions.ts` (list query + review mutation, invalidates both suggestions and the QIP query on success)
- Modify: `src/components/services/ServiceQIPTab.tsx` (banner: "N pending AI updates — Review" when list non-empty)

- [ ] Build: slide-over (follow `ReportViewer.tsx` slide-over pattern) grouping suggestions by quality area, then week. Per suggestion: field label, current text (muted) vs proposed text side-by-side (stacked on mobile), rationale line, evidence excerpts (expandable). Actions: Accept / Edit & accept (inline textarea prefilled with proposedText) / Reject. Optimistic-free (simple invalidate-on-success). All three mutations share one `useMutation` with `{ suggestionId, action, text? }`.
- [ ] Commit: `feat(qip): AI suggestion review panel`.

### Task 14: Copy-for-portal export

**Files:**
- Modify: `src/components/services/ServiceQIPTab.tsx`

- [ ] Build: "Copy for portal" button (whole document) + per-QA copy icon. Client-side only: render plain text — `{QA n}. {name}` heading, then labelled sections (Strengths / Areas for improvement / Improvement goal / Strategies / Progress notes) skipping empty ones; `navigator.clipboard.writeText`; success toast "Copied — paste into the {SAT|QIP} portal". Respect `documentType` for wording.
- [ ] Commit: `feat(qip): copy-for-portal plain-text export`.

---

## Chunk 5: Verification (Definition of Done)

- [ ] `npm run build` passes.
- [ ] `npm test` — all new tests pass; no NEW failures vs the ~59 pre-existing known failures (memory: Current State).
- [ ] `npm run lint` clean on touched files.
- [ ] Self-review the full diff like a senior dev: no `console.*`, no `as Role`/`as any`, every mutation has `onError`, every query has `retry`/`staleTime`, crons in `vercel.json`, no dead code.
- [ ] CLAUDE.md: add the new crons + suggestion routes to the relevant sections if conventions changed (at minimum nothing to add — verify).
- [ ] Commit any stragglers; do NOT push or open a PR until the user says so... (user asked for completion through execution — open a PR on a feature branch at the end, since `main` is the PR target and direct-to-main is not the repo convention; recent history shows PR-based merges).
