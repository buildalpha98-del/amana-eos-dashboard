# Sprint 5 — WhatsApp Ecosystem Compliance Implementation Plan

> **For agentic workers:** REQUIRED — execute via superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax for tracking. Mirror the user's spec verbatim where it specifies behaviour; this plan only resolves the spec onto the codebase's actual conventions and lays out the bite-sized step order.

**Goal:** Operationalise the Sprint 2 WhatsApp tile — Akram has a daily 5-min entry flow, a 7-day grid for corrections, side panel for his own engagement/announcements posts, and the cockpit tile reads real data with correct 50/35 targets.

**Architecture:** Two new tiny Prisma models (`WhatsAppNetworkPost`) plus enum additions; one helper lib (`whatsapp-compliance.ts`); seven API routes under `/api/marketing/whatsapp/*` (all `withApiAuth`, marketing+owner role-gated, Zod-validated); one Mon–Fri 9am cron with idempotent `acquireCronLock`; one client page at `/communication/whatsapp-compliance` with quick-entry + 7-day grid + network panel + two-week-concern panel + 8-week history side panel; cockpit tile thresholds updated 70/50 → 50/35 and counts wired to real `WhatsAppNetworkPost` data.

**Tech Stack:** Next.js 16 App Router, Prisma 5.22, PostgreSQL, Zod validation, React Query (TanStack), Tailwind, Vitest unit/integration, Playwright E2E (deferred — manual smoke acceptable per spec).

---

## Context anchors (verified in codebase)

- Sprint 2 stub at `prisma/schema.prisma:1437-1453` — `WhatsAppCoordinatorPost { id, serviceId, postedDate (Date), posted (Bool default false), coordinatorId?, recordedById?, notes?, createdAt, updatedAt; @@unique([serviceId, postedDate]); @@index([postedDate]) }`. **Don't change `posted` default — spec G.10.**
- Cockpit summary aggregator: `src/lib/cockpit/summary.ts:422-427` — `whatsapp = { coordinator: buildRagMetric({ current: whatsappCoordPosts, target: 70, floor: 50 }), engagement: buildRagMetric({ current: engagementPosts, target: 3, floor: 2 }), announcements: buildRagMetric({ ..., target: 2, floor: 2 }) }`. **Targets to flip: 70→50, 50→35.**
- Cockpit summary route: `src/app/api/marketing/cockpit/summary/route.ts` (calls `computeCockpitSummary()`).
- Cockpit tile UI: `src/components/marketing/MarketingCockpit.tsx:441-449` (`WhatsAppTile`).
- `withApiAuth` from `@/lib/server-auth` — pass `{ roles: ["marketing", "owner"] }`.
- `withApiHandler` from `@/lib/api-handler` — for cron route (no session).
- `ApiError`, `parseJsonBody` from `@/lib/api-error`.
- `verifyCronSecret`, `acquireCronLock(name, "daily")` from `@/lib/cron-guard` — period type is enum, not date string. Daily lock keys by `YYYY-MM-DD`.
- `Service` has no `coordinatorId`; coordinator is best-effort lookup: first `User` with `role: 'coordinator'`, `serviceId: service.id`.
- `Service.managerId` exists; `User.serviceId` exists (relation `ServiceStaff`).
- `User.phone?: String` exists for wa.me links.
- AiTaskDraft model at `prisma/schema.prisma:4861-4911` — use `source: "whatsapp-compliance"`, `taskType: "admin"`, `status: "ready"`, set `targetId` to coordinator's serviceId for pattern flags or empty for daily reminder.
- Test scaffolding: `src/__tests__/helpers/{prisma-mock,auth-mock,request}.ts` + `_clearUserActiveCache()` in `beforeEach`. Mock `@/lib/logger` and `@/lib/rate-limit` at top of test file (see `src/__tests__/api/audits.test.ts:5-22`).
- Toast: `import { toast } from "@/hooks/useToast"` — `toast({ description, variant: "destructive"? })`.
- Nav config at `src/lib/nav-config.ts:90-159`; role permissions at `src/lib/role-permissions.ts`.
- `vercel.json` cron entries — pattern: `{ "path": "/api/cron/...", "schedule": "..." }`.

---

## Chunk 1: Schema + migration

**Files:**
- Modify: `prisma/schema.prisma` — add enums, extend `WhatsAppCoordinatorPost`, add `WhatsAppNetworkPost`, inverse relations on `User` and `MarketingPost`.
- Create: migration via `npx prisma migrate dev --name sprint5_whatsapp_compliance`.

- [ ] **Step 1.1: Add `WhatsAppNonPostReason` enum** after the existing `WhatsAppCoordinatorPost` model.
- [ ] **Step 1.2: Add `WhatsAppNetworkGroup` enum** with `engagement | announcements`.
- [ ] **Step 1.3: Extend `WhatsAppCoordinatorPost`** with `notPostingReason WhatsAppNonPostReason?` field. Keep `notes` as-is.
- [ ] **Step 1.4: Add `WhatsAppNetworkPost` model** per spec A.2 (id, group, postedAt, recordedAt, recordedById/recordedBy, topic?, notes?, marketingPostId?/marketingPost?, createdAt, updatedAt; `@@index([group, postedAt])`, `@@index([recordedById, postedAt])`).
- [ ] **Step 1.5: Add inverse relation on User**: `whatsappNetworkPostsRecorded WhatsAppNetworkPost[] @relation("WhatsAppNetworkPostRecordedBy")`.
- [ ] **Step 1.6: Add inverse relation on MarketingPost**: `whatsappNetworkPosts WhatsAppNetworkPost[] @relation("MarketingPostWhatsAppNetwork")`.
- [ ] **Step 1.7: Generate client**: `npx prisma generate`.
- [ ] **Step 1.8: Create migration**: `npx prisma migrate dev --name sprint5_whatsapp_compliance --create-only` then review SQL, then `npx prisma migrate deploy` locally to apply (or just `migrate dev` without `--create-only` if local DB is throwaway).
- [ ] **Step 1.9: Commit** — `feat(schema): add WhatsAppNetworkPost + non-post reason enum (Sprint 5)`.

---

## Chunk 2: Helper lib + unit tests

**Files:**
- Create: `src/lib/whatsapp-compliance.ts`
- Create: `src/__tests__/lib/whatsapp-compliance.test.ts`

**Functions to export:**
1. `getWeekBounds(now = new Date()): { start: Date; end: Date; weekNumber: number; year: number }` — Mon 00:00 to Sun 23:59:59.999 in UTC. (Carry forward Sprint 2's Mon–Sun convention.)
2. `getYesterdayCheckDate(now = new Date()): Date` — date Akram should be checking. Mon → previous Fri; Tue–Fri → previous day; Sat/Sun → previous Fri.
3. `isWeekday(date: Date): boolean` — Mon–Fri.
4. `getWeekdaysInWeek(weekStart: Date): Date[]` — 5 entries Mon–Fri.
5. `detectTwoWeekConcerns(opts?: { now?: Date }): Promise<TwoWeekConcern[]>` — for each Service that has at least one `WhatsAppCoordinatorPost` record, count `posted=true` rows for current week and previous week (ignore `notPostingReason: coordinator_on_leave` — those days don't count against the coordinator). Flag if BOTH weeks `< 4`. Return `{ serviceId, serviceName, coordinatorName, lastWeekPosted, thisWeekPosted, reason: 'two_consecutive_below_floor' }`.
6. `resolveCoordinatorForService(serviceId: string): Promise<{ id: string; name: string; phone: string | null } | null>` — first `User` with `role: 'coordinator'` and `serviceId`. Best-effort.

**Unit tests:**
- [ ] **Step 2.1: Write `getWeekBounds` test** — Sun → previous Mon; Mon → that Mon; Wed → preceding Mon; week number computation.
- [ ] **Step 2.2: Write `getYesterdayCheckDate` test** — fixtures for each day-of-week.
- [ ] **Step 2.3: Write `isWeekday` + `getWeekdaysInWeek` tests** — basic.
- [ ] **Step 2.4: Write `detectTwoWeekConcerns` tests** — clean (no concerns); single concern (3+3); excluded by leave (3 + 5 with `coordinator_on_leave` filtered to count as "not didn't post"); recovered (3 + 5 normal); never-flagged (5 + 5).
- [ ] **Step 2.5: Implement helpers minimally to pass tests.**
- [ ] **Step 2.6: Run tests** — `npm test -- whatsapp-compliance`.
- [ ] **Step 2.7: Commit** — `feat(lib): WhatsApp compliance helpers + two-week pattern detection`.

---

## Chunk 3: API routes (read endpoints)

**Files:**
- Create: `src/app/api/marketing/whatsapp/grid/route.ts` — GET grid.
- Create: `src/app/api/marketing/whatsapp/coordinator-history/[serviceId]/route.ts` — GET 8-week history.
- Create: `src/__tests__/api/whatsapp-grid.test.ts`
- Create: `src/__tests__/api/whatsapp-coordinator-history.test.ts`

**Pattern for every route:**
```ts
export const GET = withApiAuth(
  async (req) => {
    const url = new URL(req.url);
    const weekStart = url.searchParams.get("weekStart");
    // ... compute, return NextResponse.json(payload);
  },
  { roles: ["marketing", "owner"] },
);
```

- [ ] **Step 3.1: Write `/grid` test** — auth (401), role denied (403 for staff), happy path returns 50 cells + summary + networkPosts.
- [ ] **Step 3.2: Implement `/grid`** per spec B.1 — compute week bounds, fetch all active services (`status: 'active'`), fetch records for that week, build cell array, fetch `WhatsAppNetworkPost` for the week grouped by group, call `detectTwoWeekConcerns()`.
- [ ] **Step 3.3: Run /grid test** — pass.
- [ ] **Step 3.4: Write coordinator-history test** — happy path 8 weeks, 404 on bad serviceId.
- [ ] **Step 3.5: Implement coordinator-history** per spec B.7 — 8 weeks back, group by week, compute status (green/amber/red against floor 4 / target 5).
- [ ] **Step 3.6: Run coordinator-history test** — pass.
- [ ] **Step 3.7: Commit** — `feat(api): WhatsApp grid + coordinator-history GET endpoints`.

---

## Chunk 4: API routes (write endpoints)

**Files:**
- Create: `src/app/api/marketing/whatsapp/quick-entry/route.ts` — POST bulk upsert.
- Create: `src/app/api/marketing/whatsapp/cell/route.ts` — PATCH single cell.
- Create: `src/app/api/marketing/whatsapp/cell/flag/route.ts` — POST flag.
- Create: `src/app/api/marketing/whatsapp/network-post/route.ts` — POST create.
- Create: `src/app/api/marketing/whatsapp/network-post/[id]/route.ts` — DELETE.
- Create one test file per route under `src/__tests__/api/`.

**Validation (Zod schemas inline at top of each route):**
- `WhatsAppNonPostReason` and `WhatsAppNetworkGroup` enums via `z.nativeEnum(WhatsAppNonPostReason)` from `@prisma/client`.
- Date validation: `z.string().refine(d => !isNaN(Date.parse(d)))`.
- Reject Sat/Sun in `quick-entry` and `cell` PATCH (use `isWeekday` helper).

**Per-route TDD steps (repeat for all 5 routes):**
- [ ] **Step 4.1: Write test** — auth (401), validation (400), role denied (403), happy path, weekend rejection (where applicable).
- [ ] **Step 4.2: Implement route** with `withApiAuth`, Zod validation, Prisma upsert/create/delete logic per spec B.2–B.6.
- [ ] **Step 4.3: Run test** — pass.

After all 5 routes:
- [ ] **Step 4.4: Run all WhatsApp tests** — `npm test -- whatsapp`.
- [ ] **Step 4.5: Commit** — `feat(api): WhatsApp quick-entry, cell edit, flag, network-post routes`.

**Pre-drafted message templates** (B.4 spec) — extract into a helper inside the flag route module: `buildFlagMessage(context, coordinatorName, centreName, day)` returning the message string. wa.me link: `https://wa.me/${normalisePhone(phone)}?text=${encodeURIComponent(message)}`. Strip `+`, spaces, dashes from phone.

---

## Chunk 5: Cron — whatsapp-compliance-reminder

**Files:**
- Create: `src/app/api/cron/whatsapp-compliance-reminder/route.ts`
- Create: `src/__tests__/api/cron-whatsapp-compliance-reminder.test.ts`
- Modify: `vercel.json` — add cron entry.

- [ ] **Step 5.1: Write cron tests** — runs Mon–Fri only (skips weekends defensively); creates queue item when yesterday incomplete; idempotent (running twice → one item); two-week pattern detection creates separate queue items; doesn't re-flag same pattern within same period.
- [ ] **Step 5.2: Implement cron** per spec C.2:
  - `verifyCronSecret(req)` — return early on 401.
  - `acquireCronLock("whatsapp-compliance-reminder", "daily")` — return `{ skipped: true }` if not acquired.
  - Skip if today is Sat/Sun (defensive).
  - Compute `yesterday = getYesterdayCheckDate(new Date())`.
  - Query `WhatsAppCoordinatorPost` for `postedDate = yesterday`. If count < active service count, create one `AiTaskDraft` per missing centre OR one summary draft per spec ("queue item with title `Check yesterday's WhatsApp groups ({date}) — N centres unchecked` and deep link"). Spec says one summary item with N — go with summary.
  - Call `detectTwoWeekConcerns()`. For each new concern (look up if a draft with `source: "whatsapp-compliance"`, `targetId: serviceId`, `metadata.kind: "two_week_pattern"` already exists in the current week — if not, create one).
  - `await guard.complete({ remindersCreated, patternsCreated })`.
- [ ] **Step 5.3: Run cron tests** — pass.
- [ ] **Step 5.4: Add to vercel.json** — `{ "path": "/api/cron/whatsapp-compliance-reminder", "schedule": "0 22 * * 1-5" }` (9am AEST = 22:00 UTC previous day).
- [ ] **Step 5.5: Commit** — `feat(cron): daily WhatsApp compliance reminder + two-week pattern flagging`.

---

## Chunk 6: Cockpit tile updates

**Files:**
- Modify: `src/lib/cockpit/summary.ts` — change targets, switch eng/annc to real `WhatsAppNetworkPost` counts, add patterns badge data.
- Modify: `src/components/marketing/MarketingCockpit.tsx` — add drill link + patterns badge to `WhatsAppTile`.
- Modify: `src/__tests__/api/cockpit-summary.test.ts` (and `src/__tests__/lib/cockpit-week.test.ts` if applicable) — update target/floor expectations and assert pattern data.

- [ ] **Step 6.1: Update existing cockpit tests** to expect `target: 50, floor: 35` for coordinator and the new patterns count.
- [ ] **Step 6.2: Update `summary.ts`** — flip targets; add `engagementPosts = await prisma.whatsAppNetworkPost.count({ where: { group: "engagement", postedAt: { gte: weekStart } } })` and analogous for announcements (these are currently mocked or zero); add `patternsFlagged = (await detectTwoWeekConcerns()).length`.
- [ ] **Step 6.3: Update `WhatsAppTile`** — wrap in a `<Link href="/communication/whatsapp-compliance">` (or button → router.push). Add small badge "🚩 N patterns" when `data.patternsFlagged > 0`.
- [ ] **Step 6.4: Run cockpit tests** — pass.
- [ ] **Step 6.5: Commit** — `feat(cockpit): wire real WhatsApp data, 50/35 targets, pattern badge`.

---

## Chunk 7: UI — page + components

**Files:**
- Create: `src/app/(dashboard)/communication/whatsapp-compliance/page.tsx` (server component shell).
- Create: `src/app/(dashboard)/communication/whatsapp-compliance/WhatsAppComplianceContent.tsx` (client orchestrator).
- Create: `src/components/whatsapp-compliance/QuickEntryPanel.tsx`
- Create: `src/components/whatsapp-compliance/WeekGrid.tsx`
- Create: `src/components/whatsapp-compliance/CellEditPopover.tsx`
- Create: `src/components/whatsapp-compliance/NetworkGroupPanel.tsx`
- Create: `src/components/whatsapp-compliance/TwoWeekConcernsPanel.tsx`
- Create: `src/components/whatsapp-compliance/CoordinatorHistorySidePanel.tsx`
- Create: `src/hooks/useWhatsAppCompliance.ts` — React Query hooks (`useWhatsAppGrid`, `useQuickEntry`, `useCellPatch`, `useFlagCoordinator`, `useCreateNetworkPost`, `useDeleteNetworkPost`, `useCoordinatorHistory`).

**Hook standards** (per CLAUDE.md):
- Every `useQuery`: `retry: 2, staleTime: 30_000`.
- Every `useMutation`: `onError: (err) => toast({ variant: "destructive", description: err.message || "Something went wrong" })`.
- Use `fetchApi`/`mutateApi` from `@/lib/fetch-api`.

**Layout** (matches spec D.2 ASCII):
```
PageHeader (title, week label, "Daily check-in takes ~5 min")
  → CoverageBanner (only if < 80%)
  → QuickEntryPanel (or "✓ already complete" state)
  → WeekGrid
  → NetworkGroupPanel × 2 (engagement, announcements) side-by-side on lg, stacked on mobile
  → TwoWeekConcernsPanel
  → CoordinatorHistorySidePanel (slide-over, opens from concerns or grid 🚩)
```

- [ ] **Step 7.1: Build server-page shell** — auth check via `getServerSession`, redirect to login if no session; fetch initial grid via direct Prisma call OR via internal API (use API for consistency).
- [ ] **Step 7.2: Build hooks** in `useWhatsAppCompliance.ts`.
- [ ] **Step 7.3: Build `QuickEntryPanel`** — 10 services in 2-col grid, checkbox per row, reason chip pills below (only enabled when checkbox unchecked), Save button, post-save collapsed state. Monday label-swap to "Last Friday".
- [ ] **Step 7.4: Build `WeekGrid`** — 10 × 5 grid, ✓/✗/—, click cell → `CellEditPopover`. Coverage indicator at top.
- [ ] **Step 7.5: Build `CellEditPopover`** — toggle posted, reason dropdown, notes textarea, "Flag this coordinator" link, save/cancel.
- [ ] **Step 7.6: Build `NetworkGroupPanel`** — current week count vs target/floor + RAG dot, posts list (most recent first), "+ Log post" form, delete affordance per row.
- [ ] **Step 7.7: Build `TwoWeekConcernsPanel`** — card per concern, "View 8-week history" / "Flag coordinator" / "Add to 1:1" actions; empty state.
- [ ] **Step 7.8: Build `CoordinatorHistorySidePanel`** — slide-over with stacked bar chart (8 weeks × posted/not posted/not checked) + notes log on right. Use existing chart primitives (search for `recharts` or similar — fall back to simple CSS bars if none).
- [ ] **Step 7.9: Wire everything into `WhatsAppComplianceContent.tsx`.**
- [ ] **Step 7.10: A11y check** — ✓ ✗ — symbols readable; aria-labels on icon-only buttons; tab order sane; colour not sole indicator.
- [ ] **Step 7.11: Component tests** — `QuickEntryPanel` save-all, `WeekGrid` cell click → popover, `NetworkGroupPanel` create+delete, `TwoWeekConcernsPanel` renders with data + empty state.
- [ ] **Step 7.12: Commit** — `feat(ui): WhatsApp compliance page + 6 components + hooks`.

---

## Chunk 8: Nav + role permissions + final wiring

**Files:**
- Modify: `src/lib/nav-config.ts` — add nav item under Communication/Growth.
- Modify: `src/lib/role-permissions.ts` — add `/communication/whatsapp-compliance` to `allPages` and to `marketing`, `owner`, `head_office`, `admin` access lists.
- Modify: `vercel.json` (already done in Chunk 5) — verify cron entry present.

- [ ] **Step 8.1: Add nav item** — `{ href: "/communication/whatsapp-compliance", label: "WhatsApp Compliance", icon: MessageCircle, section: "Growth", tooltip: "Daily 5-min check-in. Coordinator + network group posts.", roles: ["marketing"] }`. (Check existing Communication section structure before placing.)
- [ ] **Step 8.2: Add to role-permissions** — add to `allPages`; add explicit entries to `rolePageAccess.marketing` (and verify owner/head_office/admin via `allPages`).
- [ ] **Step 8.3: Run dev server and smoke test** — `npm run dev`, login as marketing, navigate to page, verify renders.
- [ ] **Step 8.4: Final verification suite** — `npm run lint && npm run build && npm test`.
- [ ] **Step 8.5: Commit** — `feat(nav): wire /communication/whatsapp-compliance for marketing role`.

---

## Acceptance gate (Part H from spec)

Run through spec section H 1–19 manually before declaring done:
- Functional 1–11: walk through quick-entry, grid edit, network post lifecycle, coverage indicator, Monday label, weekend reject, concerns panel, flag, add-to-1:1.
- Cron 12–14: trigger `/api/cron/whatsapp-compliance-reminder` manually (with `Authorization: Bearer $CRON_SECRET`) twice; assert one queue item; verify pattern detection.
- Cockpit 15–17: visit cockpit, assert real counts, click drill.
- Visual 18–19: 1280px desktop + tablet + mobile graceful + colour-blind sanity check on ✓/✗/—.

---

## Out-of-scope (Part G — DO NOT DO)

1. No WhatsApp Business API integration.
2. No webhook receivers.
3. No public holiday awareness — manual `notPostingReason: public_holiday` only.
4. No coordinator self-reporting UI.
5. No SMS/email send from "Flag" — wa.me link only.
6. No bulk historical CSV import.
7. No analytics page.
8. No other cockpit tile changes.
9. No 7-day-week mode — strict 5-day.
10. Do NOT modify `WhatsAppCoordinatorPost.posted` default.

---

## Risks / unknowns

- **MarketingTask vs. Todo for "Add to 1:1"**: spec says MarketingTask. `MarketingTask` model exists at `prisma/schema.prisma:1623-1650`. Use it. Set `serviceId`, `dueDate` = next Monday, `title` = "Discuss WhatsApp compliance with {coordinator}".
- **Chart library**: if `recharts` isn't installed, the 8-week history side panel uses simple CSS-based stacked bars. Don't add a dep mid-sprint.
- **Cron timezone**: 22:00 UTC = 09:00 AEDT (DST) / 08:00 AEST (no DST). Spec accepts approximate; existing cron entries follow same convention so don't try to be cleverer.
- **Coordinator phone normalisation**: Australian numbers — ensure `+614…` → `614…` for wa.me.
