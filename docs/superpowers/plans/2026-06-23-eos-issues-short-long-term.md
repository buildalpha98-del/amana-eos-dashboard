# EOS Short/Long-Term Issues — Implementation Plan

> Execution: in-session (superpowers:executing-plans) with TDD per unit. Units share core contracts (enum / `IssueData` / `useIssues`), so they run sequentially. Steps use `- [ ]`.

**Goal:** Make `Issue.category` a first-class short-term/long-term discriminator with selection + movement, and wire the two lists to the EOS cadence (L10 ↔ short-term, V/TO ↔ long-term, promote-to-Rock).

**Architecture:** One `Issue` table, enum discriminator. API gains a `category` filter + a race-safe promote endpoint. UI gains a Short-Term|Long-Term toggle; L10 IDS filters to short-term; V/TO renders the long-term list.

**Tech Stack:** Next.js 16, Prisma 5.22 (Postgres/Neon), React Query, Vitest.

**Spec:** `docs/superpowers/specs/2026-06-23-eos-short-long-term-issues-design.md`

**Per-unit loop:** write failing test → run (fail) → implement → run (pass) → `npm run build` when types change → commit.

---

## Unit 1 — Schema enum + migration + backfill
**Files:** Modify `prisma/schema.prisma` (Issue.category → enum, +2 indexes); Create `prisma/migrations/20260623130000_issue_category_enum/migration.sql`.
- [ ] Hand-write migration (ordered, Neon-safe): backfill null/unknown → `short_term`; `CREATE TYPE "IssueCategory"`; `ALTER COLUMN` drop-default → type-cast `USING category::"IssueCategory"` → set-default `short_term` → set NOT NULL; create `@@index([category])`, `@@index([category, status])`.
- [ ] `npx prisma migrate dev --name issue_category_enum` against local; verify `prisma generate` types `category: IssueCategory`.
- [ ] Commit.

## Unit 2 — API foundation (schemas + GET filter + bulk tighten)
**Files:** Modify `src/lib/schemas/issue.ts`; `src/app/api/issues/[id]/route.ts` (inline `updateIssueSchema`); `src/app/api/issues/route.ts` (GET); `src/app/api/issues/bulk/route.ts`. **Tests:** `src/__tests__/api/issues.test.ts` (+ bulk/[id] as present).
- [ ] Test: POST without category defaults `short_term`; GET `?category=long_term` returns only long-term; PATCH sets category; bulk rejects non-enum category (400).
- [ ] Implement: `createIssueSchema.category` enum default short_term; `updateIssueSchema.category` enum optional; GET reads `category` param → `where.category`; bulk `category` → enum.
- [ ] Run tests (pass), `npm run build`, commit.

## Unit 3 — `useIssues` passthrough + `IssueData` type
**Files:** Modify `src/hooks/useIssues.ts`. **Test:** `src/__tests__/hooks` (query-key) or co-located.
- [ ] Test: query key includes `category` + `serviceId` (no cache bleed between lists).
- [ ] Implement: add `category`/`serviceId` to filter type + querystring + key; add `category: IssueCategory` to `IssueData`/`IssueDetail`; new `usePromoteIssueToRock` (stub wired in Unit 6).
- [ ] Run, build, commit.

## Unit 4 — Issues page Short-Term | Long-Term toggle
**Files:** Modify `src/app/(dashboard)/issues/page.tsx`. **Test:** `src/__tests__/app/issues/page.test.tsx` (toggle switches list, passes category to hook).
- [ ] Test: toggle renders; selecting Long-Term calls `useIssues` with `category:"long_term"`; bulk-move labels reflect lists.
- [ ] Implement: segmented toggle (state `category`, default short_term) above status tabs; Short-Term = existing board; Long-Term = calm list (no IDS columns) with Promote/Move actions; relabel bulk move.
- [ ] Run, build, commit.

## Unit 5 — Create-modal selector + detail-panel move + per-service tab
**Files:** Modify `CreateIssueModal.tsx`, `IssueDetailPanel.tsx`, `ServiceIssuesTab.tsx`. **Tests:** component tests for each.
- [ ] Test: create-modal List selector defaults short_term + submits category; detail-panel move toggles category via `useUpdateIssue`; service tab toggle filters.
- [ ] Implement the three. Confirm `serviceId` prefill in create-modal contexts.
- [ ] Run, build, commit.

## Unit 6 — Promote-to-Rock endpoint + hook
**Files:** Create `src/app/api/issues/[id]/promote-to-rock/route.ts`; finish `usePromoteIssueToRock`. **Test:** `src/__tests__/api/issues-promote-to-rock.test.ts`.
- [ ] Test: 401 unauth; 403 staff/eos_viewer; happy path creates Rock + links rockId + closes issue (one txn); already-promoted → 409 (rockId not null); 404 missing.
- [ ] Implement: `withApiAuth(..., { roles: ["owner","head_office","admin","marketing","eos_implementer"] })`; `$transaction` with `updateMany({ where:{ id, rockId:null }, data:{ status:"closed" }})` guard (count 0 → 409), create Rock (`quarter` body||`getCurrentQuarter()`, `rockType` default company), set `rockId`, activity-log.
- [ ] Wire `usePromoteIssueToRock` (onError toast; invalidate issues+rocks). Run, build, commit.

## Unit 7 — L10 IDS works the short-term list
**Files:** Modify `src/components/meetings/ActiveMeetingView.tsx` (~L88), `IDSSection.tsx`. **Test:** meeting/IDS test.
- [ ] Test: IDS query excludes long-term; mid-meeting raise defaults short_term; drop-to-long-term removes from IDS list.
- [ ] Implement: add `category:"short_term"` to the IDS `useIssues`; `handleCreateIssue` → short_term; new `onDropToLongTerm` prop on `IDSSection` → single move to long_term.
- [ ] Run, build, commit.

## Unit 8 — V/TO long-term list box
**Files:** Modify `src/app/(dashboard)/vision/page.tsx`. **Test:** vision page test.
- [ ] Test: box shows only `category==="long_term"` open issues; add/pull/promote actions present.
- [ ] Implement: re-point `companyIssues` filter to `category==="long_term"` && open; retitle "Long-Term Issues" + EOS copy; inline Add (prefill long_term), Pull-to-Short-Term, Promote-to-Rock.
- [ ] Run, build, commit.

## Final verification
- [ ] `npm run build` (exit 0) and `npm test` (zero new failures vs origin/main baseline).
- [ ] PR with the V/TO behaviour-change note (long-term box starts empty post-backfill).
