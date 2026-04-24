# Staff Dashboard v2 + NQS OSHC Feature Build

**Date**: 2026-04-24
**Status**: Approved (brainstorming complete — 2026-04-24 session)
**Area**: Staff Dashboard (`/app/(dashboard)/*`) + new parent-facing surfaces for NQS features

## Problem

The Amana staff dashboard is 71 pages across six sections (Home / EOS / Operations / Growth / People / Admin). After the Parent Portal v2 redesign, parents experience a polished, opinionated app; staff still live in the older, pre-v2 UI. Two compounding issues:

1. **Visual gap** — staff and parents are now seeing two different products. Inconsistent Amana.
2. **OSHC/NQS gap** — dashboard has solid EOS/governance tooling (QIP, Audits, Policies), but is missing day-to-day evidence features a compliant Australian OSHC needs: educator reflective practice, individual-child observations, medication administration records, risk assessments, educator:child ratio tracking. Without these, we can't honestly replace OWNA or pass an NQS audit.

## Overview

Redesign the 71-page dashboard with the parent-portal v2 design system — **same palette, different density** — and build five new NQS-critical features + AI assistance + scoped offline capture + one staff quality-of-life feature (shift handover) + one parent-engagement feature (AI weekly newsletter).

Three threads:

1. **Design system** — promote the eight v2 primitives out of `src/components/parent/ui/` into shared `src/components/ui/v2/`. Add three staff-specific primitives: `DataTable` (dense, virtualized, keyboard-first), `CommandMenu` (⌘K global palette), `FilterBar` (chip filters). Token-sweep hardcoded hex across the dashboard. Update shared components (`Button`, `Dialog`, `BottomSheet`, `PageHeader`, etc.) to v2 rhythm without behaviour change.
2. **Deep rebuilds + passive polish** — rebuild 16 high-traffic pages behind a `NEXT_PUBLIC_STAFF_DASHBOARD_V2` flag with a `?v2=1/0` override (identical pattern to parent portal). The remaining ~55 pages get passive token/primitive upgrades in place.
3. **New NQS + AI + offline features** — add five NQS-critical features, five AI-drafting surfaces, one AI newsletter generator, scoped offline capture for four mutation paths, and shift handover notes.

**Visual direction:** "Professional sibling" — same Amana navy/gold/cream and v2 personality as parents see, but denser by default: `rounded-md` (14px) instead of `rounded-lg`, 13px base on data-dense views, 36px row height on tables, keyboard-first affordances everywhere. Warm where warmth matters (Dashboard greeting, empty states, leadership); dense everywhere else (Scorecard, Roll Call, Bookings, Timesheets).

## Baseline

- **Tests**: 2287/2287 passing as of the final parent portal merge (main SHA `17ffa71`).
- **Parent Portal v2**: live in production behind `NEXT_PUBLIC_PARENT_PORTAL_V2=true`.
- **Primitives**: `Avatar`, `KidPill`, `SessionCard`, `StatusBadge`, `SectionLabel`, `WarmCTA`, `PullSheet`, `SwipeActions`, `Lightbox` — all in `src/components/parent/ui/`. Promotable as-is.
- **Design tokens + `warm-card` utility + `.parent-portal` scoped press-scale** — already in `src/app/globals.css`, parent-scoped.
- **AI infrastructure**: `AiTaskDraft` model, `useAiGenerate` hook, `AiButton` + `AiDraftBadge` + `AiDraftReviewPanel` components, 32 existing prompt templates, `/admin/ai-drafts` review page. Used daily for existing task-drafting flows — proven infra.
- **Service worker**: already registered for parents via `registerParentServiceWorker` for push. Extendable to offline mutation queue.
- **43 of 71 pages already use the shared `PageHeader`** — structural bones are decent; the redesign is more polish + primitive swap than rewrite for most.
- **Services detail tabs (19 today)**: Attendance, Roll Call, Children, Weekly Roster, Checklists, Casual Bookings, Today, Overview, Daily Ops (group), Program (Activities + Menu), EOS (Scorecard / Rocks / Todos / Issues / Projects / Weekly Data), Audits, QIP, Comms, Budget, Financials. Five new tabs land here (Reflections, Observations, Medication, Risk, Ratios).
- **NQS schema-level pieces already present**: `QualityImprovementPlan` + `QIPQualityArea` models, `ServiceQIPTab.tsx` UI, `AuditTemplate` / `AuditInstance`, `IncidentRecord`, `Policy`, `PhotoComplianceLog`. The redesign integrates around these, doesn't replace them.

## In scope — stacked commits

~40 commits across 7 phases. Each commit is shippable independently behind the flag.

### Phase 1: Foundation (~6 commits)

| # | Commit subject |
|---|---|
| 1 | `refactor(ui): promote parent/ui primitives to ui/v2 with barrel re-exports + parent/ui re-exports for BC` |
| 2 | `feat(ui): DataTable primitive (dense, sticky header/col, virtualized, keyboard nav, selection, per-column sort)` |
| 3 | `feat(ui): CommandMenu primitive (⌘K palette — nav to any of 71 pages + 30 common actions)` |
| 4 | `feat(ui): FilterBar primitive (chip filter row for list pages)` |
| 5 | `feat(css): staff-dense tokens in globals.css (--radius-dense, --row-height-dense, --font-size-dense, --keyboard-focus-ring); drop .parent-portal scope on press-scale → data-v2 attr` |
| 6 | `refactor(ui): token sweep + v2 polish on shared Button / Dialog / BottomSheet / ConfirmDialog / PageHeader / Skeleton / ExportButton / StatCard / HelpTooltip` |

### Phase 2: NQS features + Services detail tab shell (~11 commits)

Schema, routes, and UI for the five NQS features. Bundled because four plug into Services detail as new tabs and we want to ship the shell once.

| # | Commit subject |
|---|---|
| 7 | `feat(db): EducatorReflection + LearningObservation + MedicationAdministration + RiskAssessment + RatioSnapshot models + migration` |
| 8 | `feat(services): tab shell v2 — grouped pill-chips, denser sub-pills, Today as default landing` |
| 9 | `feat(api): /api/services/[id]/reflections (GET list, POST create, PATCH/DELETE) + tests` |
| 10 | `feat(services): Reflections tab UI (timeline view, create modal, QA multi-select, mood tag)` |
| 11 | `feat(api): /api/services/[id]/observations + /api/parent/children/[id]/observations (parent read-only) + tests` |
| 12 | `feat(services): Observations tab UI (filter by child/MTOP/author, create modal, photo upload) + parent Learning Journal tab on /parent/children/[id]` |
| 13 | `feat(api): /api/services/[id]/medications (GET today's due + log dose with dual sign-off) + tests` |
| 14 | `feat(services): Medication tab UI (today view + log-dose modal) + parent medication-log read on /parent/children/[id]` |
| 15 | `feat(api): /api/services/[id]/risk-assessments (CRUD + approve endpoint) + excursion-booking validation hook + tests` |
| 16 | `feat(services): Risk tab UI (hazards table, likelihood×severity matrix, approval workflow)` |
| 17 | `feat(api): /api/services/[id]/ratios (computed live + snapshot capture) + /api/cron/ratio-capture hourly + tests; feat(services): Ratio widget on Today tab + Ratios sub-tab + /dashboard "services below ratio" alert` |

### Phase 3: High-traffic EOS rebuilds (~6 commits)

| # | Commit subject |
|---|---|
| 18 | `feat(dashboard): Dashboard v2 (Today strip + KPI row + recent activity + pinned rocks) behind flag` |
| 19 | `feat(dashboard): Scorecard v2 (DataTable 13-week grid, frozen first col, inline cell edit, arrow-key nav)` |
| 20 | `feat(dashboard): Rocks v2 (Kanban/list toggle, progress via StatusBadge, milestones via PullSheet)` |
| 21 | `feat(dashboard): Todos v2 (inbox-style, bulk complete, due-date badges)` |
| 22 | `feat(dashboard): Issues v2 (IDS Kanban 4-column, drag-to-progress + keyboard shortcuts)` |
| 23 | `feat(dashboard): Meetings v2 (L10 facilitator runner with timer + agenda walker)` |

### Phase 4: Operations rebuilds (~5 commits)

| # | Commit subject |
|---|---|
| 24 | `feat(dashboard): Services index v2 (DataTable + FilterBar + row-level quick actions)` |
| 25 | `feat(dashboard): Roll Call v2 (mobile-first sign-in/out cards with search + bulk actions + live ratio widget)` |
| 26 | `feat(dashboard): Bookings v2 (queue + weekly calendar split, quick-approve inline)` |
| 27 | `feat(dashboard): Enrolments v2 (status Kanban + detail PullSheet + resend-invite surfaced)` |
| 28 | `feat(dashboard): Contact Centre v2 (unified enquiries/tickets/VAPI inbox with FilterBar + DataTable)` |

### Phase 5: People + Settings + Queue (~4 commits)

| # | Commit subject |
|---|---|
| 29 | `feat(dashboard): Team v2 (DataTable directory + grid toggle + FilterBar)` |
| 30 | `feat(dashboard): Timesheets v2 (week-grid DataTable, approve column, Xero export prominent, bulk approve, inline edit via PullSheet)` |
| 31 | `feat(dashboard): Queue v2 (inbox with bulk-select + keyboard nav; AI draft panel unchanged)` |
| 32 | `feat(dashboard): Settings v2 (section-based left-nav + right-detail, searchable)` |

### Phase 6: AI drafting + newsletter + shift handover (~8 commits)

| # | Commit subject |
|---|---|
| 33 | `feat(ai): Reflection-draft template (reads 7d of observations + incidents + audits for the service) + AiButton on reflection editor` |
| 34 | `feat(ai): Observation-draft template (reads short notes + photos + child profile) + AiButton on observation create modal` |
| 35 | `feat(ai): Risk-hazards template (reads activity type + location) + AiButton on hazards editor` |
| 36 | `feat(ai): Parent message reply template (reads parent msg + conversation history + child context) + AiButton in messaging thread` |
| 37 | `feat(ai): Incident report template (reads short facts + child + time/location) + AiButton on incident create` |
| 38 | `feat(db): ParentPostType adds "newsletter"; feat(ai): weekly-newsletter template (reads program activities + menu + events + optional top observations) + "Generate Newsletter" button on Services Comms tab + publish flow (creates community ParentPost, fires parent push)` |
| 39 | `feat(services): Shift handover notes — Services Today tab widget, free-text + mention next coordinator, auto-clears after 48h (no schema — uses ephemeral Json field on Service.dailyOps blob or new lightweight ShiftHandover model)` |
| 40 | `feat(dashboard): bulk passive polish — remaining ~55 pages get token swap + primitive substitution (Button/Dialog/StatusBadge/SectionLabel) in one large PR` |

### Phase 7: Offline + cleanup (~4 commits)

| # | Commit subject |
|---|---|
| 41 | `feat(offline): extend service worker with IndexedDB mutation queue + useOfflineMutation hook + "Pending sync" top-bar chip + retry UI` |
| 42 | `feat(offline): wire useOfflineMutation into Roll Call sign-in/out + Observation create + Medication administration + Reflection create (append-only semantics)` |
| 43 | `test(e2e): Playwright specs for 5 NQS features + AI draft flows + offline round-trip for the 4 queued actions` |
| 44 | `feat(dashboard): remove NEXT_PUBLIC_STAFF_DASHBOARD_V2 flag + delete *V1 files (once all 16 rebuilds are verified in prod)` |

~44 commits total. No changes to authentication/role system; all features use existing `withApiAuth`.

## Key design decisions

### Design tokens (extend `src/app/globals.css`)

```css
@theme inline {
  /* Staff-dense additions */
  --radius-dense: 8px;
  --row-height-dense: 36px;
  --row-height-comfortable: 44px;
  --font-size-dense: 13px;
}

:root {
  --keyboard-focus-ring: 0 0 0 2px var(--color-brand), 0 0 0 4px var(--color-brand-soft);
}

/* Drop .parent-portal scoping on press-scale; use [data-v2="true"] attr instead
   so parent + staff can both opt in without separate selectors. */
[data-v2="true"] a[role="button"]:active,
[data-v2="true"] button:not([disabled]):active,
[data-v2="true"] [role="button"]:active { transform: scale(0.98); }
```

The staff root layout renders `<div data-v2="true">` when the v2 flag is on. Parent portal gets the same attribute (in addition to `.parent-portal` class it already has).

### Primitive promotion

`src/components/parent/ui/*` → `src/components/ui/v2/*` with one semantic rename: `KidPill` → `PersonPill` (generic — works for kids, educators, parents, or any person). Old `KidPill` name stays exported from `src/components/parent/ui/index.ts` as a re-export of `PersonPill` so nothing breaks.

New primitives added in `src/components/ui/v2/`:

| Primitive | Purpose |
|---|---|
| `DataTable<TRow>` | Virtualized (`@tanstack/react-virtual`), keyboard-nav (`j`/`k` row, `tab`/`shift+tab` col, `enter` open-row, `space` select, `shift+space` range-select), sticky header + sticky first column, per-column sort, row selection, empty/loading states. Props: `rows`, `columns: ColumnDef<TRow>[]`, `getRowId`, `onRowAction`, `selectable`, `onSelectionChange`. |
| `CommandMenu` | ⌘K palette. Fuzzy-matched nav to any of 71 pages (driven by `nav-config.ts`) + 30 common actions (e.g. "Log observation", "Sign in child", "Create rock", "New reflection", "Generate newsletter"). Action handlers plug in via a `useCommandAction({ id, label, icon, shortcut, handler })` hook that any page can call. |
| `FilterBar` | Chip-row filters with 4 filter types: single-select enum, multi-select enum, date range, search. Serializes to query string for URL-backed filter state. |

### Flag + v1/v2 switcher

`NEXT_PUBLIC_STAFF_DASHBOARD_V2` (build-time) + `?v2=1/0` query override. Helper at `src/app/(dashboard)/utils/useStaffV2Flag.ts` — mirrors parent's `useV2Flag` exactly. Each deep-rebuild page:

```
src/app/(dashboard)/scorecard/page.tsx     ← thin switcher
src/app/(dashboard)/scorecard/ScorecardV1.tsx  ← current
src/app/(dashboard)/scorecard/ScorecardV2.tsx  ← new
```

Passive-upgrade pages are edited in place (no V1/V2 split — they inherit new tokens via primitives and shared component refresh).

### Five new NQS feature specs

#### Reflections (QA1.3)

```prisma
model EducatorReflection {
  id           String   @id @default(cuid())
  serviceId    String
  authorId     String   // User (educator)
  type         String   // "weekly" | "monthly" | "critical" | "team"
  title        String
  content      String   @db.Text
  qualityAreas Int[]    @default([])  // NQS QA numbers 1..7
  linkedObservationIds String[] @default([])
  mood         String?  // "positive" | "neutral" | "concern"
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  service Service @relation(fields: [serviceId], references: [id], onDelete: Cascade)
  author  User    @relation("EducatorReflections", fields: [authorId], references: [id])

  @@index([serviceId, createdAt])
  @@index([authorId, createdAt])
}
```

Routes:
- `GET /api/services/[id]/reflections?type=&qa=&authorId=&cursor=&limit=`
- `POST /api/services/[id]/reflections` — Zod: `{ type, title, content, qualityAreas?, linkedObservationIds?, mood? }`
- `PATCH/DELETE /api/services/[id]/reflections/[reflectionId]` — author or `owner|head_office|admin` only

UI: new **Reflections** tab on `/services/[id]` (under a new Compliance/QA tab group alongside QIP and Audits). Timeline view with reflection cards grouped by week. Filter by author/type/QA. Create modal: markdown editor, QA multi-select chip row, linked observations picker (autocomplete), mood tag. Leadership widget on `/leadership` aggregating recent reflections across all services.

#### Learning Observations (QA1.1, 1.2)

```prisma
model LearningObservation {
  id              String   @id @default(cuid())
  childId         String
  serviceId       String
  authorId        String
  title           String
  narrative       String   @db.Text
  mtopOutcomes    String[] @default([])  // "Identity" | "Community" | "Wellbeing" | "Learners" | "Communicators"
  interests       String[] @default([])
  mediaUrls       String[] @default([])
  visibleToParent Boolean  @default(false)
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  child   Child   @relation(fields: [childId], references: [id], onDelete: Cascade)
  service Service @relation(fields: [serviceId], references: [id], onDelete: Cascade)
  author  User    @relation("LearningObservations", fields: [authorId], references: [id])

  @@index([childId, createdAt])
  @@index([serviceId, createdAt])
}
```

Routes (staff):
- `GET /api/services/[id]/observations?childId=&mtop=&authorId=&cursor=&limit=`
- `POST /api/services/[id]/observations` — Zod: `{ childId, title, narrative, mtopOutcomes?, interests?, mediaUrls?, visibleToParent? }`
- `PATCH/DELETE …/[obsId]`

Routes (parent):
- `GET /api/parent/children/[id]/observations` — reuses `canParentAccessChild` visibility helper; only returns observations where `visibleToParent=true`

UI (staff): new **Observations** tab on `/services/[id]` under the Program group (sibling to Activities + Menu). `FilterBar`: child / MTOP outcome / author / date range. Create modal: child picker, rich-text narrative, MTOP multi-select chips (5 outcomes), interest tags (free-form), photo upload (reuse `/api/upload/image`), "visible to parent" toggle.

UI (parent): new **Learning Journal** tab on `/parent/children/[id]` (v2). Chronological stream of observations for that child. Tap for full detail.

#### Medication Administration Record (QA2.1)

```prisma
model MedicationAdministration {
  id                String   @id @default(cuid())
  childId           String
  serviceId         String
  medicationName    String
  dose              String
  route             String   // "oral" | "topical" | "inhaled" | "injection" | "other"
  administeredAt    DateTime
  administeredById  String   // User
  witnessedById     String?  // User — required when medication route is "injection" or category is "schedule4plus"
  parentConsentUrl  String?
  notes             String?  @db.Text
  createdAt         DateTime @default(now())

  child          Child @relation(fields: [childId], references: [id], onDelete: Cascade)
  service        Service @relation(fields: [serviceId], references: [id], onDelete: Cascade)
  administeredBy User @relation("MedicationAdministered", fields: [administeredById], references: [id])
  witnessedBy    User? @relation("MedicationWitnessed", fields: [witnessedById], references: [id])

  @@index([childId, administeredAt])
  @@index([serviceId, administeredAt])
}
```

Routes:
- `GET /api/services/[id]/medications?date=YYYY-MM-DD&childId=`
- `POST /api/services/[id]/medications` — Zod enforces `witnessedById` when service policy flags require it. Route can't be overridden client-side.

UI: new **Medication** tab on `/services/[id]` under Daily Ops group. Today view = list of children with scheduled meds (derived from `child.medicationDetails`) + "Log dose" button per child. Log-dose modal: medication auto-filled from child's profile, dose/route editable, administered-by pre-filled with session.user, witnessed-by required for relevant categories (validation server-side), notes, optional consent-signature upload. Parent read-only log on `/parent/children/[id]` v2.

#### Risk Assessments (QA2.2)

```prisma
model RiskAssessment {
  id             String   @id @default(cuid())
  serviceId      String
  authorId       String
  title          String
  activityType   String   // "routine" | "incursion" | "excursion" | "special"
  date           DateTime @db.Date
  location       String?
  hazards        Json     // Array<{ hazard, likelihood: 1..5, severity: 1..5, controls }>
  approvedById   String?
  approvedAt     DateTime?
  attachmentUrls String[] @default([])
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  service    Service @relation(fields: [serviceId], references: [id], onDelete: Cascade)
  author     User    @relation("RiskAssessments", fields: [authorId], references: [id])
  approvedBy User?   @relation("RiskAssessmentApprovals", fields: [approvedById], references: [id])

  @@index([serviceId, date])
}
```

Routes:
- `GET /api/services/[id]/risk-assessments?activityType=&status=`
- `POST /api/services/[id]/risk-assessments`
- `POST /api/services/[id]/risk-assessments/[raId]/approve` — `owner|head_office|admin|coordinator` only
- `PATCH/DELETE …/[raId]`

UI: new **Risk** tab on `/services/[id]` under Compliance group. List with `StatusBadge` (Draft / Pending / Approved). Create form: hazards table — add rows, each with 1–5 likelihood × 1–5 severity dropdowns (computed risk score: product, colour-coded) + controls free-text, attachments upload, activity type dropdown, date picker. Submitting notifies coordinators. Approval flow: one click by coordinator+.

**Excursion booking gate**: when any booking with `type="excursion"` is created, API blocks unless a `RiskAssessment` exists for `(serviceId, date, activityType="excursion")` AND `approvedAt` is set. 400 response with clear message: "Approved risk assessment required before creating excursion bookings."

#### Ratio tracking (QA2.2 + QA4.1)

```prisma
model RatioSnapshot {
  id            String   @id @default(cuid())
  serviceId     String
  date          DateTime @db.Date
  sessionType   String   // "bsc" | "asc" | "vc"
  capturedAt    DateTime
  educatorCount Int
  childCount    Int
  ratioText     String   // "1:10"
  belowRatio    Boolean
  educatorIds   String[] @default([])
  notes         String?

  service Service @relation(fields: [serviceId], references: [id], onDelete: Cascade)

  @@index([serviceId, date, sessionType])
}
```

Plus a new JSON field on `Service.ratioSettings` holding per-session NQS minimums (federal defaults for OSHC: 1:15 for school-aged, adjustable if a service has different NQS registration).

Routes:
- `GET /api/services/[id]/ratios?date=YYYY-MM-DD&sessionType=` — computes live ratio from `DailyAttendance` + `Roster` snapshot data; returns current ratio + today's historical snapshots
- `POST /api/services/[id]/ratios/capture` — manual capture (button on Today tab)
- `GET /api/cron/ratio-capture` — hourly cron; captures for every active service × active session

UI:
- Live ratio widget at top of `/services/[id]` Today tab — shows current ratio + coloured indicator (green compliant, amber within 1, red below). Tooltip shows educators currently signed in vs children currently in care.
- `Ratios` sub-tab under Compliance group: historical list with `DataTable` + `FilterBar` (date range, session type).
- `/dashboard` gets a "Services below ratio" alert card that only renders if any active service is currently non-compliant.

### AI drafting surfaces

Pattern: AI drafts → staff reviews in `AiDraftReviewPanel` → edits → commits. Never auto-publishes. Every draft is persisted as an `AiTaskDraft` with a new `source` value per surface.

| Surface | Template ID | Input context | Draft produces |
|---|---|---|---|
| Reflection editor | `reflection-weekly` | last 7 days of observations (service-scoped), IncidentRecord (7d), audit results (30d), top-3 recurring themes | Title + content (markdown) + suggested QA tags + suggested linked observation IDs |
| Observation create | `observation-draft` | educator's short notes + uploaded photo URLs + child profile (age, interests, known triggers, current MTOP focus) | Title + structured narrative + suggested MTOP outcomes + interests |
| Risk-hazards editor | `risk-hazards` | activity type + location + season/weather optional | Suggested hazards list (6–10 items) with likelihood/severity/controls pre-filled |
| Parent message reply | `parent-reply` | parent's latest message + last 10 messages in thread + child context | Warm, policy-aware reply draft (2–4 sentences usually) |
| Incident report | `incident-draft` | educator's short facts + child profile + time/location + incident type | Compliant incident report narrative |
| Weekly newsletter | `weekly-newsletter` | past week's Activities (Program tab) + this week's + next week's Menu + scheduled events + top 3 observations (with `visibleToParent=true`) + service philosophy snippets | Full newsletter in markdown with sections: "This week we explored…" / "On the menu…" / "Coming up…" / "A reflection from the team…" |

All six templates are additive — no changes to existing AI infra. New source values in the `AiTaskDraft.source` discriminated union: `"reflection" | "observation" | "risk-hazards" | "parent-reply" | "incident" | "weekly-newsletter"`.

### Weekly newsletter publish flow

Button lives on the Services Comms tab (primary) with a duplicate on the Program tab (secondary entrypoint). Click:

1. `AiButton` opens draft modal, streams generated content
2. Staff edits markdown in-place
3. "Publish to parents" button:
   - Creates a `ParentPost` with `type="newsletter"` (new enum value) + `isCommunity=true` + `serviceId`
   - Fires existing parent-push-notification hook (`notifyParentNewPost`)
   - Records the newsletter in a history list on the same tab
4. Parents see it in Timeline with a newsletter-styled rendering (different from regular post — larger, banner-y header)

No new model — just a `ParentPostType` enum addition. Existing RLS + `canParentAccessPost` still applies.

### Offline capture (scoped)

Only four mutations get the offline treatment: Roll Call sign-in/out, Observation create, Medication administration, Reflection create. Everything else is online-only.

Mechanism:

1. Extend `public/sw.js` (already registered for push) with a `sync` event handler
2. Create `src/lib/offline/mutation-queue.ts` — IndexedDB store wrapping `idb` npm package, schema `{ id, endpoint, method, body, createdAt, retries }`
3. New hook `src/hooks/useOfflineMutation.ts` — wraps `useMutation`, stores mutation payload in queue first, POSTs when online. On failure: increments `retries`, capped at 5.
4. `src/components/layout/PendingSyncChip.tsx` — top-bar chip showing queued-mutation count + click-to-review list
5. On reconnect (window `online` event OR service worker `sync`), flushes queue in order. Each flush result updates a local "synced" status.

**Conflict strategy**: append-only semantics on all four actions — a second sign-in for the same (childId, sessionType, date) is rejected by the existing unique constraint server-side, so the client just drops the dupe. Observations / Reflections are creates-only (no offline editing). Medication is append-only (each dose is a row).

Tests: unit tests for the queue + hook. E2E test uses Playwright's `context.setOffline(true)` to simulate a flight mode sign-in/out, then asserts sync on reconnect.

### Shift handover

Tiny feature. New lightweight `ShiftHandover` model:

```prisma
model ShiftHandover {
  id        String   @id @default(cuid())
  serviceId String
  authorId  String
  content   String   @db.Text
  mentionedUserIds String[] @default([])
  expiresAt DateTime  // now + 48h
  createdAt DateTime @default(now())

  service Service @relation(fields: [serviceId], references: [id], onDelete: Cascade)
  author  User    @relation("ShiftHandovers", fields: [authorId], references: [id])

  @@index([serviceId, expiresAt])
}
```

Routes:
- `GET /api/services/[id]/handovers` — returns non-expired handovers
- `POST /api/services/[id]/handovers` — Zod: `{ content, mentionedUserIds? }`; sets `expiresAt = now + 48h`
- Cron `GET /api/cron/handover-cleanup` daily — deletes expired

UI: widget on Services Today tab showing latest 3 non-expired handovers + "Leave a handover" button. Creating a handover with `mentionedUserIds` fires an in-app notification to the mentioned staff.

## Rollout

Same flag pattern as parent portal. `NEXT_PUBLIC_STAFF_DASHBOARD_V2` + `?v2=1/0`. Each redesigned page has a `PageV1 / PageV2` split; passive-upgrade pages edit in place.

- **Dev**: flag on.
- **Staging**: flag on.
- **Prod**: flag off until each phase lands + is verified via `?v2=1` override in a production-built preview, then flip for everyone.
- **Cleanup (last commit)**: delete `*V1.tsx` files, remove flag reads, remove env var. Only done once phases 1–6 have been verified live in prod.

Phases 1–7 land in order but don't block each other strictly. NQS features (phase 2) can ship before the EOS rebuilds (phase 3) if we prioritize the OSHC-completeness story. Recommended order as listed.

## Testing

- **Unit** — every new primitive (`DataTable`, `CommandMenu`, `FilterBar`) with interaction tests (keyboard nav, selection, filter state), every NQS API route with auth/validation/happy-path/edge cases, AI template formatters (pure functions — no LLM calls in tests; mock the response).
- **Integration** — `withApiAuth` paths, service-membership enforcement, parent-visibility gates.
- **E2E** (Playwright) — new specs under `tests/e2e/`:
  - `staff-reflections.spec.ts` — educator writes, coordinator edits, shows in leadership dashboard
  - `staff-observations.spec.ts` — educator logs observation with MTOP tags + photo + "visible to parent" → parent sees in Learning Journal
  - `staff-medication.spec.ts` — log dose with dual sign-off, parent sees log
  - `staff-risk-assessment.spec.ts` — create risk assessment, approve, excursion booking now works
  - `staff-ratios.spec.ts` — live ratio displays correctly + cron capture writes snapshot
  - `staff-ai-newsletter.spec.ts` — generate newsletter → publish → parent timeline
  - `staff-offline-rollcall.spec.ts` — set offline, sign in child, reconnect, verify synced
- **Visual regression** (optional, post-v1) — Playwright screenshots at desktop + tablet for top 5 traffic pages.
- **Manual smoke** — real-device test on each v2 page before its commit lands in prod. Tablet in particular for Roll Call + Observations.
- **Parent portal regression** — run the parent portal E2E suite after Phase 1 (primitive promotion) to confirm nothing broke.

## Out of scope (explicit)

- ❌ **Native mobile app for staff.** Still queued as a separate future spec.
- ❌ **AI auto-publishing** anywhere. Staff reviews every draft.
- ❌ **ACECQA portal sync** (direct compliance reporting to the regulator).
- ❌ **Per-state NQS rule variations.** Federal defaults; states can override via service settings in a follow-on.
- ❌ **Offline for pages beyond the 4 mutations.** Online-only elsewhere.
- ❌ **Restructuring auth/role system.** All features use existing `withApiAuth` + role checks.
- ❌ **Settings feature additions.** Just restructure + refresh, don't add new settings.
- ❌ **Audio/video attachments** on observations. Images only; follow-on spec.
- ❌ **Observations editing** in offline mode. Creates-only offline.
- ❌ **Cross-service bulk actions** (e.g. "mark all children at all services absent today"). Single-service only in v1.
- ❌ **Parent-facing reflection visibility.** Reflections are educator-internal only.

## Success criteria

1. An NQS auditor walking the dashboard can find evidence for every Tier-1 QA requirement (Reflections / Observations / MAR / Risk / Ratios) in <2 clicks from `/services/[id]`.
2. ≥80% of active educators log ≥1 reflection/week after 1 month in prod.
3. ≥60% of observations published during the first 3 months have `visibleToParent=true` (educators feel comfortable sharing with families).
4. 100% of administered medications are logged with dual sign-off when required.
5. Every excursion booking in prod has an approved risk assessment attached (API-enforced).
6. Current ratio visible on Services Today tab for every service at a glance.
7. Weekly newsletter published by ≥1 service/week average across all services after 1 month.
8. 2287 existing tests still pass + ≥200 new unit/integration + 7 new E2E specs pass on CI.
9. No parent portal regression (their design system changes only in promotion, no behaviour change).
10. Staff report v2 "feels faster" — measurable via LCP + time-to-first-interaction on Dashboard and Scorecard (target LCP ≤2.5s on mid-tier laptop, cell-edit nav <50ms).

## Future follow-ons (next brainstorms, not this spec)

- **Native mobile app** for staff (Expo) — reuses design tokens + NQS feature APIs.
- **ACECQA portal sync** — direct regulator reporting.
- **AI auto-publish with guardrails** — e.g. auto-newsletter if no staff edits after 24h.
- **Voice-to-text** on Observations/Reflections (mobile).
- **Per-state NQS variations.**
- **Audio/video attachments** on observations + learning journal.
- **Parent visibility into Reflections** (with an anonymization layer).
- **Cross-service bulk ops** (leadership convenience).
- **Real-time ratio push** to staff phones when a service goes below minimum.
- **Behaviour / Inclusion Support plans** (QA5.2) — Tier 2 NQS feature deferred.
- **Professional Development log** (QA4.1).
- **Emergency drills log** (QA2.2).
- **Philosophy document accessor + NQS Self-Assessment tool** (QA7).
