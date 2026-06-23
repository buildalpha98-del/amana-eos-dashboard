# EOS Short-Term & Long-Term Issues Lists — Design

**Date:** 2026-06-23
**Status:** Approved (model + full scope) — pending spec review
**Scope:** Phase 1 (first-class two-list model + selection) **and** Phase 2 (EOS cadence wiring: L10 ↔ short-term, V/TO ↔ long-term, promote-to-Rock)

---

## 1. Problem

EOS keeps **two** issues lists, on two cadences:

| | Short-Term List | Long-Term List |
|---|---|---|
| Worked at | Weekly **L10** via IDS (Identify, Discuss, Solve) | **Quarterly / Annual** sessions |
| Lives on | the team's Issues List | the **V/TO** (bottom-right box) |
| Horizon | solve *this quarter* | parked for *next quarter+* |
| Resolution | usually spawns a 7-day **To-Do** | becomes a **Rock**, or drops to short-term |

The discipline is the **movement between the lists**: *drop down* (a weekly issue too big for this week → long-term) and *promote up* (at quarterly, a long-term issue → a Rock or → short-term for immediate IDS).

Our data model stubs this with `Issue.category` (`String?`, commented `"short_term" | "long_term"`) but it is ~20% wired:

- **Create** (`createIssueSchema`) has no `category` → new issues are born `null` (on neither list).
- **Single update** (`/api/issues/[id]`, `updateIssueSchema`) has no `category` → can't move one issue from its detail panel.
- **GET** (`/api/issues`) has no `category` filter → can't fetch a list.
- Only **bulk** (`/api/issues/bulk`, `action: "move"`) sets it. The page/board organise solely by **status**; nothing separates the two lists.
- The V/TO "Company Issues" box ([vision/page.tsx:60](../../src/app/(dashboard)/vision/page.tsx)) filters by open status only (the "no owner" comment is stale) — it is *not* the long-term list.

Result: one undifferentiated pile sorted by IDS status. This spec makes the two lists first-class and wires them to the EOS cadence.

## 2. Goals / Non-Goals

**Goals**
- `category` becomes a real, defaulted, validated discriminator with a clean backfill.
- Selection at all three EOS moments: pick a list when **raising** an issue; **move** an issue between lists (single + bulk); **promote** a long-term issue into a Rock.
- The Issues page and per-service Issues tab present **Short-Term | Long-Term** as distinct lists.
- The Weekly **L10** IDS works the **short-term** list only.
- The **V/TO** surfaces the **long-term** list as its parking lot, with add / move / promote.

**Non-Goals (this iteration)**
- No new "team" entity — leadership-team vs per-service scope continues to use existing `serviceId`/centre-scope.
- No automated cadence/calendar (quarterly reminders). Promotion is manual.
- No change to the IDS status workflow (`open → in_discussion → solved → closed`) or the issue→To-Do spawn flow (already modelled via `Issue.spawnedTodos`).

## 3. Data Model

Promote the discriminator to a Prisma enum (matches house standard: enums, not `z.string()`), keeping the **column name `category`** to minimise churn (the bulk route already uses it).

```prisma
enum IssueCategory {
  short_term
  long_term
}

model Issue {
  // ...
  category IssueCategory @default(short_term)   // was: String?
  // ...
  @@index([category])
  @@index([category, status])   // list view: filter by list, sort by IDS status
}
```

**Migration** (hand-written `migration.sql`, ordered to be Neon-safe — see §8):
1. `UPDATE "Issue" SET category = 'short_term' WHERE category IS NULL OR category NOT IN ('short_term','long_term');`
2. `CREATE TYPE "IssueCategory" AS ENUM ('short_term','long_term');`
3. `ALTER TABLE "Issue" ALTER COLUMN "category" DROP DEFAULT, ALTER COLUMN "category" TYPE "IssueCategory" USING category::"IssueCategory", ALTER COLUMN "category" SET DEFAULT 'short_term', ALTER COLUMN "category" SET NOT NULL;`
4. `CREATE INDEX ...` for the two new indexes.

Default `short_term` is correct: in EOS everything enters the working list; you *deliberately* drop items to long-term.

## 4. API

The EOS Rock/Meeting write routes already accept `eos_implementer` (PR #133). The issues write routes (`POST /api/issues`, `PATCH /api/issues/[id]`, `/api/issues/bulk`) pass **no** `roles` option to `withApiAuth` — open to any authenticated user, unchanged here. Validation uses the shared enum.

- `src/lib/schemas/issue.ts` — add `category: z.enum(["short_term","long_term"]).default("short_term")` to `createIssueSchema`.
- `src/app/api/issues/[id]/route.ts` — `updateIssueSchema` is defined **inline here** (not in the schemas file); add `category: z.enum(["short_term","long_term"]).optional()` to it for single-issue moves.
- `GET /api/issues` — accept `?category=short_term|long_term`; add `if (category) where.category = category`. (Leaves existing status/priority/owner/service filters intact.)
- `/api/issues/bulk` — already supports `action:"move"`; tighten its `category` validation from `z.string()` to the enum.
- **New** `POST /api/issues/[id]/promote-to-rock` (roles: owner, head_office, admin, marketing, eos_implementer) — atomic in a `prisma.$transaction`, **race-guarded** so concurrent promotes can't double-create:
  1. `updateMany({ where: { id, rockId: null }, data: { status: "closed" } })` — if `count === 0`, the issue is missing or already promoted → **409** (TOCTOU-safe, mirrors the shift-claim pattern);
  2. create a `Rock` (title/description/ownerId/serviceId from the issue; `quarter` = body or `getCurrentQuarter()` from `@/lib/utils`; `rockType` set **explicitly**, default `company` — overrides the schema's `personal` default);
  3. set `issue.rockId` to the new rock; write an activity-log entry.
  Returns `{ rock, issue }`. Body: `{ quarter?, ownerId?, rockType? }` (Zod-validated).

## 5. Hooks

- `useIssues(filters)` — add `category` (and the already-server-supported `serviceId`) to the filter type at `useIssues.ts:47`, thread both into the query string and the query key as primitives (`["issues", filters?.status, filters?.category, filters?.serviceId, ...]`). Add a `category: IssueCategory` field to the `IssueData`/`IssueDetail` interfaces (lines 15-45) so the list views and toggle can read it.
- `useUpdateIssue` — already PATCHes; now also carries `category` for single-issue move.
- **New** `usePromoteIssueToRock` — mutation to the promote endpoint; `onError` destructive toast; invalidates issues + rocks.

## 6. UI

**6a. Issues page** (`/issues`) — add a top-level **Short-Term | Long-Term** segmented toggle (state `category`, default `short_term`), above the existing status tabs / board. Pass it into `useIssues`. 
- *Short-Term* keeps the full IDS board + status tabs (unchanged).
- *Long-Term* renders a calmer parked list (no IDS status columns; prioritisable; primary action = **Promote to Rock**, secondary = **Move to Short-Term**).
- Keep the existing multi-select bulk **move**; relabel as "Move to Short-Term / Long-Term".

**6b. Create modal** (`CreateIssueModal`) — add a List selector (Short-Term default). When raised from a context that implies a list (e.g. the V/TO box → long-term), prefill accordingly. Natural place to also confirm `serviceId` prefill for per-service / V/TO contexts (the modal doesn't pass it today).

**6c. Detail panel** (`IssueDetailPanel`) — add a List control showing the current list with a one-click switch (single-issue move). When `rockId` is set, show a "Promoted to Rock →" link.

**6d. Per-service Issues tab** (`ServiceIssuesTab`) — mirror the Short-Term | Long-Term toggle so a Director of Service manages both lists for their centre.

**6e. L10 / IDS** (`ActiveMeetingView` + `IDSSection`) — change the IDS query at [ActiveMeetingView.tsx:88](../../src/components/meetings/ActiveMeetingView.tsx) from `useIssues({ status: "open,in_discussion" })` to `useIssues({ status: "open,in_discussion", category: "short_term" })`. Issues raised mid-meeting (`handleCreateIssue`) default to `short_term`. Add a **"Drop to Long-Term"** action per IDS row (the "too big for this week, park it" move) → single-issue move to `long_term`; this threads a new `onDropToLongTerm` callback through `IDSSection`'s props (current signature has only `onCreateIssue`/`onCreateTodo`).

**6f. V/TO** (`vision/page.tsx`) — re-point the "Company Issues" box to the **Long-Term Issues List**: filter `category === "long_term"` && open. Retitle "Long-Term Issues" with EOS helper copy. Add inline **Add long-term issue**, **Promote to Rock**, and **Pull to Short-Term** actions (quarterly workflow). Respects the viewer's existing centre scope.

## 7. Testing (house standard: Vitest unit/route + integration)

- **Migration/enum**: backfill maps null/unknown → `short_term`; default applies on insert.
- **Schemas**: create defaults to short_term; update accepts category; bulk rejects non-enum.
- **GET filter**: `?category=long_term` returns only long-term; absent → unfiltered; combines with status/scope.
- **Promote route**: auth (401), role (403 for staff/eos_viewer), happy path (creates Rock, links rockId, closes issue, one transaction), not-found (404); issue already promoted → 409.
- **Hooks**: `useIssues` query key includes category (no cache bleed between lists).
- **L10**: IDS list excludes long-term issues; mid-meeting raise is short-term; drop-to-long-term removes it from the IDS list.
- **V/TO**: box shows only long-term open issues; promote/pull actions move correctly.
- **Components**: page toggle switches lists; detail-panel move; create-modal selector.

## 8. Rollout / Risk

- Additive-ish migration, but it **converts an existing column to a Postgres enum** — heavier than yesterday's `ADD VALUE` enum work. Neon migrations have stalled mid-deploy before (`reference_neon_migration_recovery.md`, hit 3×). Mitigation: order the SQL as in §3 (backfill *before* `SET NOT NULL`), test against a branch DB first, and keep the `prisma migrate resolve --applied/--rolled-back` recovery steps handy.
- **Behaviour change:** the V/TO "Company Issues" box stops showing all open issues and shows only long-term ones. After backfill (everything → short_term) it starts **empty** until issues are dropped to long-term. This is intended (clean slate); call it out in the PR so it isn't read as a regression.
- No breaking API changes; `category` filter is additive; existing bulk-move keeps working.

## 9. Build order (units, each independently testable)

1. Schema enum + migration + backfill.
2. Schemas + GET filter + bulk tighten (API foundation).
3. `useIssues` category passthrough.
4. Issues page toggle + Long-Term list view.
5. Create-modal selector + detail-panel move + per-service tab.
6. Promote-to-Rock endpoint + `usePromoteIssueToRock`.
7. L10 IDS short-term filter + drop-to-long-term.
8. V/TO long-term box + add / pull / promote.

Each step builds on the prior and ships green; 1–5 are Phase 1, 6–8 are Phase 2.
