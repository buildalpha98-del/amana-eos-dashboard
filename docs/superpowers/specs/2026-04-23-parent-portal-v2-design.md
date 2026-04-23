# Parent Portal v2 — UX & UI Redesign

**Date**: 2026-04-23
**Status**: Approved (brainstorming complete — 2026-04-23 session; spec reviewer pass v2)
**Area**: Parent Portal (`/parent/*`)

## Problem

Parents moving from OWNA to the Amana Parent Portal identified the same five complaints that made OWNA painful to use. Verified with the user (2026-04-23 brainstorm):

1. **Looked dated / cheap** — "government-form ugly", no personality, didn't feel like a caring partner.
2. **Didn't feel native / mobile-first** — desktop web squeezed onto a phone, no real touch affordances.
3. **Clunky core flows** — booking a casual, checking attendance, messaging the centre, and updating details each took too many screens.
4. **Confusing navigation / hard to find information** — "where's the menu?", "where's today's sign-in time?".
5. **Didn't feel trustworthy for something this personal** — parents see their kid's day on this screen; it needs to feel like a caring partner, not a billing portal.

The current Parent Portal (`/parent/*`, 8 pages) already has working data, auth (magic link + JWT), and PWA support. Routes, Prisma models, and React Query hooks are complete. **The problem is entirely presentational and interactional** — no backend work is required.

## Overview

Redesign the 8-page Parent Portal in place, keeping every existing route, Prisma model, API contract, and React Query hook. Three things change:

1. **Design system** — extend `globals.css` with new tokens (radius scale, soft-cream surfaces, warm status palette, kid-avatar gradients, overshoot easing), add 8 parent-scoped component primitives (`Avatar`, `KidPill`, `SessionCard`, `StatusBadge`, `SectionLabel`, `WarmCTA`, `PullSheet`, `SwipeActions`).
2. **Core flows** — rebuild 4 high-traffic screens around those primitives: Home, Child Detail / Attendance, Bookings (with fast-book sheet), Messages (with optimistic send).
3. **End-to-end connectivity** — verify every redesigned flow is wired cross-portal (parent action → staff visible, staff action → parent visible). The only gap surfaced during E2E audit is **likes + comments on parent posts** — that's added to scope (schema + API + UI on both sides). Everything else (bookings → staff bookings page → roll-call; messaging bidirectional; staff posts → parent timeline) is already E2E-wired and only needs verification coverage.

Four remaining pages (Children list, Billing, Account, Getting Started) inherit the new design system passively — no rewrites.

Ship **page-by-page behind a build-time `NEXT_PUBLIC_PARENT_PORTAL_V2` flag** (per-deploy cutover) with a `?v2=1` query-string override for internal verification in any environment. Each commit is independently shippable.

Visual direction was picked in the brainstorm: **"Soft & Human" layout** (warmer spacing, rounded 20px corners, gradient kid-avatars, generous typography) applied with the **existing Amana brand palette** (navy `#004E64`, gold `#FECE00`, cream `#FAF8F5`).

## Baseline

- Current tests: 700/700 passing, 46 test files (parent portal covered by existing route tests + one E2E spec).
- Data model complete — zero schema changes required.
- Existing APIs untouched: `/api/parent/profile`, `/api/parent/bookings`, `/api/parent/children/[id]`, `/api/parent/messages`, `/api/parent/messages/[id]`, `/api/parent/enrolment-applications`, `/api/parent/onboarding`, `/api/parent/timeline`.
- Existing hooks untouched: `useParentProfile`, `useParentBookings`, `useParentChild`, `useParentChildren`, `useParentConversations`, `useParentOnboarding`, `useParentEnrolmentApplications`. `useParentConversations` already returns `lastMessage` / `unreadCount` / `lastMessageAt` — Home preview needs no API change.
- Auth untouched: `ParentAuthProvider`, magic-link issuance, `PARENT_JWT_SECRET` session cookie.
- PWA untouched: `/parent-manifest.webmanifest` + apple-mobile-web-app title override.
- All parent `page.tsx` files already start with `"use client"` — v1/v2 switching happens inside the client component; no server/client boundary changes.
- Existing `src/components/ui/` library (`Skeleton`, `BottomSheet`, `EmptyState`, etc.) remains used by the staff dashboard; new parent primitives live under `src/components/parent/ui/` to keep the two surfaces cleanly separated.
- `src/app/globals.css` already defines brand colours, fonts (DM Sans + Bricolage Grotesque), warm shadows, reduced-motion support (`prefers-reduced-motion`), 44px touch targets, and dark mode.
- **New dependency**: `vaul` (~2kb gzipped) for `PullSheet` — industry-standard Next.js bottom-sheet with native snap + drag-to-dismiss. Eliminates ~200 LOC of custom pointer-event handling.

## In scope — stacked commits

| # | Commit subject | Category | Files (approx.) |
|---|---|---|---|
| 1 | `feat(parent): design system tokens + 8 primitives under src/components/parent/ui/` | Foundation | ~11 |
| 2 | `test(parent): unit tests for new primitives (Avatar incl. hydration stability, KidPill, SessionCard, StatusBadge, SectionLabel, WarmCTA, PullSheet, SwipeActions)` | Tests | ~8 |
| 3 | `feat(db): ParentPostLike + ParentPostComment models + migration` | Schema | 2 (schema + migration) |
| 4 | `feat(api): parent-posts like + comment routes (parent like/unlike/list-comments/create-comment + staff reply + staff-delete + aggregate counts on existing endpoint + shared visibility/contact helpers)` | API | ~9 (6 routes + 2 helpers + extension + tests) |
| 5 | `feat(parent): Home v2 behind NEXT_PUBLIC_PARENT_PORTAL_V2 flag` | Feature | ~4 |
| 6 | `feat(parent): Child Detail / Attendance v2 behind flag` | Feature | ~4 |
| 7 | `feat(parent): Bookings v2 + fast-book PullSheet behind flag` | Feature | ~5 |
| 8 | `feat(parent): Messages v2 with optimistic send behind flag` | Feature | ~4 |
| 9 | `feat(parent): Timeline v2 — like + comment UI on parent posts, inline on Home` | Feature | ~4 |
| 10 | `feat(services): surface like + comment counts on staff parent-posts view` | Feature | ~3 |
| 11 | `feat(parent): passive visual upgrade for Children / Billing / Account / Getting Started` | Feature | ~4 |
| 12 | `test(parent): e2e specs for redesigned flows + cross-portal flows (book→rollcall, post→like→staff-sees-count)` | Tests | 3–4 |
| 13 | `feat(parent): remove NEXT_PUBLIC_PARENT_PORTAL_V2 flag + delete v1 versions of the 4 redesigned pages` | Cleanup | ~5 |

~13 commits. One schema migration (additive, two new models, no existing table touched). Six new API routes (four parent-side, two staff-side) plus one aggregate-field extension to an existing staff endpoint. No existing hook signatures changed.

**Commit sequencing notes:**
- Commits 3 → 4 are a strict chain (schema must land before API).
- Commit 9 (Timeline v2 UI) depends on commits 3 + 4 shipping.
- Commits 5, 6, 7, 8 (Home, Child, Bookings, Messages v2) do **not** depend on the likes/comments work and can ship in any order or in parallel.
- Commit 12 (E2E tests) depends on every feature commit it exercises — run last among feature commits.
- Commit 13 (flag removal + cleanup) requires all four redesigned pages to be live and verified in prod for at least one staging window.

## End-to-end integration audit

Every redesigned flow must work cross-portal. Below is the current wiring state + required coverage:

| Flow | Parent action | Staff side | State | Required work |
|---|---|---|---|---|
| **Casual booking** | `POST /api/parent/bookings` → `Booking` record (`status: "requested"`; `type` = `"casual"` for BSC/ASC or `"vacation_care"` for VC session days) | Coordinator email via `sendBookingRequestNotification`; appears on `/bookings` page; approve/decline updates status; confirmed bookings feed `/roll-call` attendance view | ✅ **Wired E2E** | E2E test only: parent books → staff sees on /bookings → confirm → appears in /roll-call for the booked date |
| **Messaging** | `POST /api/parent/messages` (list) / `POST /api/parent/messages/[id]` (thread reply) | Staff replies from `/messaging` page; parent sees via `useParentConversations` | ✅ **Wired E2E** | E2E test only: bidirectional thread (parent sends → staff receives → staff replies → parent receives) |
| **Attendance** | Parent checks `useParentChild` | Staff marks via `/roll-call` (sign in/out) → `Attendance` record → surfaces on parent Child Detail | ✅ **Wired E2E** | Covered by `parent-portal-attendance.spec.ts` |
| **Staff post → parent timeline** | Parent views via `/api/parent/timeline` → `TimelineWidget` | Staff creates via `CreateParentPostForm` → `POST /api/services/[id]/parent-posts` → `ParentPost` record | ✅ **Wired E2E** (read-only) | E2E test: staff creates post → parent sees in timeline |
| **Parent likes post** | Parent taps like → `POST /api/parent/posts/[id]/like` | Staff sees like count on `/services/[id]/parent-communication` | ❌ **Not wired** — no schema, no API, no UI | **New scope in this spec** — see "Likes & comments on parent posts" below |
| **Parent comments on post** | Parent types + submits → `POST /api/parent/posts/[id]/comments` | Staff sees thread on `/services/[id]/parent-communication`, can reply | ❌ **Not wired** | **New scope in this spec** |
| **Enrolment submission** | Parent completes `/enrol` form | Staff reviews on `/enrolments` → approve/decline | ✅ Wired E2E | Not in this spec (separate scope) |
| **Booking request notifications** | — | Staff coordinator receives email + in-app notification | ✅ Wired E2E | — |

The only gap surfaced by the audit is **post likes + comments**. All other cross-portal wiring already exists — the redesign only needs to *display* it cleanly and verify the connection holds via E2E tests.

## Key design decisions

### Design tokens (extend `src/app/globals.css`)

Add inside the existing `@theme inline` block — do **not** rewrite existing tokens.

```css
/* Radius scale — current cards use rounded-xl (12px); new default for parent cards is 20px */
--radius-xs: 6px;
--radius-sm: 10px;
--radius-md: 14px;
--radius-lg: 20px;
--radius-xl: 28px;

/* Soft cream surfaces */
--color-cream-deep: #F5EFE7;   /* ambient surface / sheet background */
--color-cream-soft: #FFFDF9;   /* lifted card surface */
--color-brand-soft: rgba(0, 78, 100, 0.06);  /* selected/hover tint */

/* Warm status palette (parent-specific — softer than the existing error/success/etc.) */
--color-status-in-care-bg: #D4F4D4;     --color-status-in-care-fg: #1F5E1F;
--color-status-confirmed-bg: #E6F3F7;   --color-status-confirmed-fg: #004E64;
--color-status-pending-bg: #FFE9D6;     --color-status-pending-fg: #8B4513;
--color-status-alert-bg: #FFE4E4;       --color-status-alert-fg: #8B2525;

/* Overshoot easing for tap affordances */
--ease-spring-gentle: cubic-bezier(0.34, 1.56, 0.64, 1);
```

Add a new utility:

```css
@utility warm-card {
  background: var(--color-cream-soft);
  border-radius: var(--radius-lg);
  border: 1px solid var(--color-border);
  box-shadow: var(--shadow-warm);
  padding: 1rem;
  transition: transform 0.2s var(--ease-spring-gentle), box-shadow 0.2s ease;
}
```

Add a global `:active` scale for interactive elements **scoped to the parent portal** via the `.parent-portal` class applied to the outermost `<div>` in `src/app/parent/layout.tsx` (the `min-h-screen` wrapper). Staff dashboard is unaffected.

```css
.parent-portal a[role="button"]:active,
.parent-portal button:not([disabled]):active,
.parent-portal [role="button"]:active {
  transform: scale(0.98);
}

/* Respect user motion preferences — disable press-scale under prefers-reduced-motion */
@media (prefers-reduced-motion: reduce) {
  .parent-portal a[role="button"]:active,
  .parent-portal button:not([disabled]):active,
  .parent-portal [role="button"]:active {
    transform: none;
  }
}
```

**Dark-mode values** for new tokens live in the existing `.dark` block:

```css
.dark {
  --color-cream-deep: #1e1e28;
  --color-cream-soft: #242430;
  --color-brand-soft: rgba(254, 206, 0, 0.08);
  /* status tokens: mute lightness ~20% and invert fg/bg */
  --color-status-in-care-bg: #1e3a1e;     --color-status-in-care-fg: #9FD49F;
  --color-status-confirmed-bg: #1c3440;   --color-status-confirmed-fg: #9CC5D3;
  --color-status-pending-bg: #3a2a18;     --color-status-pending-fg: #E0B68A;
  --color-status-alert-bg: #3a1e1e;       --color-status-alert-fg: #E09A9A;
}
```

### Component primitives (`src/components/parent/ui/`)

All under `src/components/parent/ui/`, scoped to the parent portal. Each is <100 lines, single purpose, fully typed, and has a unit test.

| Component | Purpose | Key props |
|---|---|---|
| `Avatar` | Circle with initial or photo, deterministic gradient fill keyed off `seed`, 4 sizes | `name`, `seed?`, `size?: 'sm'\|'md'\|'lg'\|'xl'`, `src?` |
| `KidPill` | Avatar + name + subtitle + right-side `StatusBadge`, tappable | `child`, `status?`, `href?`, `onPress?` |
| `SessionCard` | Date tile (DAY / NUM) + label + sublabel + status; horizontal or list variant | `date`, `label`, `sublabel?`, `status`, `variant?` |
| `StatusBadge` | Rounded-full pill, soft-palette variants | `variant: 'in-care' \| 'confirmed' \| 'requested' \| 'waitlisted' \| 'declined' \| 'new' \| 'overdue'` (covers the full `BookingStatus` enum's user-facing states; `waitlisted` and `absent_notified` fall back to `requested` styling if variant omitted) |
| `SectionLabel` | Small uppercase label + optional right action ("View all") | `label`, `action?: { href: string, text: string }` |
| `WarmCTA` | Gradient-accent call block (icon + title + sub + chevron) | `icon`, `title`, `sub?`, `href`, `tone?` |
| `PullSheet` | `vaul`-based bottom sheet with snap points | `open`, `onOpenChange`, `snapPoints?`, `activeSnapPoint?`, `children` |
| `SwipeActions` | Left-swipe reveals trailing action buttons on a list item | `children`, `actions: { label: string; tone?: 'neutral'\|'danger'; onPress: () => void }[]` |

Staff-side `BottomSheet` in `src/components/ui/` stays in use for the staff dashboard — `PullSheet` replaces it only for parent flows that need snap behaviour.

#### Avatar gradient determinism

The Avatar component renders on both server and client, so the gradient selection must be deterministic and byte-identical across environments to avoid React hydration warnings.

```ts
// src/components/parent/ui/Avatar.tsx
function djb2(input: string): number {
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) + hash) + input.charCodeAt(i); // hash * 33 + c
    hash = hash | 0; // force to 32-bit signed int
  }
  return Math.abs(hash);
}

const GRADIENT_PRESETS = [
  { name: 'teal',   start: '#7FD3D9', end: '#4A9BA3' },
  { name: 'peach',  start: '#FFB48E', end: '#E08A5E' },
  { name: 'amber',  start: '#FFC94D', end: '#E89F1E' },
  { name: 'sage',   start: '#A8C8A8', end: '#6D9A6D' },
  { name: 'rose',   start: '#F4A5B5', end: '#D07089' },
  { name: 'lilac',  start: '#C4A8E0', end: '#8C6FB8' },
] as const;

function gradientFor(seed: string): string {
  const preset = GRADIENT_PRESETS[djb2(seed) % GRADIENT_PRESETS.length];
  return `linear-gradient(135deg, ${preset.start}, ${preset.end})`;
}
```

`seed` defaults to the child's `id` (stable primary key). Same kid → same colour forever, across server and client renders. Unit test asserts stability: same input → same output across multiple runs.

#### PullSheet snap behaviour

Built on `vaul` (`npm i vaul`), which handles pointer events, velocity, and snap logic natively. Spec-level config:

```ts
// Snap points as fractions of viewport height (vaul accepts `number | string`)
const SNAP_POINTS = [0.2, 0.6, 0.95] as const; // peek, half, full
```

- `peek` (20% of dvh) — header + drag handle only. Used as the resting state when the sheet is "minimized" but not dismissed.
- `half` (60% of dvh) — shows the main step content (e.g., child picker + date grid).
- `full` (95% of dvh) — full-screen with keyboard space for forms.

**Behaviour (handled by vaul defaults, which we accept):**
- Velocity-based: a fast downward fling skips intermediate snaps and either dismisses or snaps to the lowest point.
- Distance-based: dragging <20% of the distance between snaps snaps back; ≥20% snaps to the nearest point in the drag direction.
- Dragging down from `peek` dismisses the sheet.
- Drag up is capped at `full`.
- Tap-outside or Escape key dismisses the sheet (per `vaul` default).

Opening a sheet snaps to `half` by default; the fast-book flow steps the sheet up to `full` on reaching step 3 (forms + keyboard).

Vaul respects `prefers-reduced-motion` natively.

### Home (`src/app/parent/page.tsx`)

Full rebuild. State- and time-aware greeting; live status hero for each kid; compact week strip; inline messages; single warm CTA for fast-book.

**Structure:**

1. **Greeting header** — large heading ("Hi Jayden."), dynamic subline driven by the following rules (first match wins):
    - **Weekend (Sat/Sun):** "No bookings today — see you Monday."
    - **Any kid has a VC booking today (school holiday):** "Vacation care day — Sophia's in with {Centre}."
    - **Any kid currently signed in:** "{Names} in good hands today." — uses `attendance.signedInAt` present, `signedOutAt` null.
    - **Any kid booked but not yet signed in, and current time ≥ session start:** "{Names} haven't signed in yet — should be there soon."
    - **All kids signed out (session ended):** "Everyone's home safe — signed out at {last signOut time}."
    - **Weekday morning before BSC start (<7:00am):** "Early start — BSC opens at 7:00."
    - **Weekday between BSC end and school pickup (9:00am–3:00pm):** "School's still in — pickup at 3:15."
    - **Weekday evening after ASC closes (>6:30pm) with no future bookings today:** "Day's wrapped — see you tomorrow."
    - **Fallback:** "Here's today at a glance."

    The rules live in a pure function `getGreetingSubline({ children, bookings, now }): string` under `src/app/parent/utils/greeting.ts` with its own unit-test file covering each branch.

2. **Kid status strip** — one `KidPill` per child. `StatusBadge` reflects current state: `in-care` | `confirmed` (booked, not yet signed in) | `new` (no booking today, explicit "Not in today"). Timestamp sublabel when available.
3. **This week strip** — `SectionLabel` with count. Horizontal-scroll row of `SessionCard`s, today tile branded.
4. **Messages inline** — `SectionLabel` with unread count. Up to 2 compact message rows (`useParentConversations` already returns `lastMessage.preview` + `senderType` — verified, no API change). Tap → thread.
5. **`WarmCTA` "Book a casual"** — opens the `PullSheet` fast-book flow inline (no navigation).
6. **Quick actions row** — 3 `warm-card` tiles: `Today's menu`, `Pay`, `Help`.
7. **Onboarding banner** — existing component, re-skinned to the new system (when `completedCount < totalCount`).
8. **Enrol-a-sibling CTA** — existing component, re-skinned.

### Child Detail / Attendance (`src/app/parent/children/[id]/page.tsx`)

**Structure:**

1. **Hero** — large `Avatar size="xl"` + kid name + live `StatusBadge` with pulse animation when `in-care`. Year level + service name below.
2. **14-day attendance strip** — horizontal scroll, today tile larger and branded. Each day tile: coloured dot (`attended` / `absent` / `booked` / `holiday`), time signed in/out. Tap a day → sheet with full day detail.
3. **Weekly pattern card** — `warm-card` showing the kid's recurring pattern ("Mon–Fri ASC · 3:15pm pickup") + inline "Change pattern" link.
4. **Medical & allergies card** — collapsed-by-default if conditions exist, showing the count ("2 medical notes"). Expand → full detail. If no conditions: single muted line "No medical notes on file · Update".
5. **This week's menu (service-scoped, filtered to this child's allergens)** — single tappable `warm-card` showing today's meal + allergen flags relevant *to this child* (via `child.allergies` intersect `menu.allergens`). Tap → full week menu sheet.
6. **Sticky action bar (bottom, above tab bar)** — 3 buttons: `Message centre`, `Book casual`, `Request change`. Uses `safe-area-inset-bottom`.

All data from existing `useParentChild(id)` — no new endpoint.

### Bookings (`src/app/parent/bookings/page.tsx`)

One screen, three modes via segmented control.

**Structure:**

1. **Segmented control** — `Upcoming · Past · Requests`. Underline style, soft. Syncs to `?tab=` query param.
2. **Grouped list** — grouped by week label ("This week", "Next week", "Week of 5 May"). `SessionCard` rows, list variant.
3. **Swipe-left gesture on upcoming cards** — `SwipeActions` primitive reveals `Modify` / `Cancel` trailing buttons.
4. **Floating "+ Book" FAB** — gold `#FECE00` button, bottom-right, positioned above bottom tab bar (uses `safe-area-inset-bottom`). Opens fast-book `PullSheet` at `half` snap.

**Fast-book `PullSheet` — 3 steps, all within the sheet:**
- **Step 1**: Pick child (chip row if >1 child).
- **Step 2**: Pick date(s). Mini calendar with session types (`bsc` / `asc` / `vc`) pre-filtered to what the service offers that day. Multi-select dates.
- **Step 3**: Review & confirm. Step up to `full` snap for keyboard space. Primary button: `Confirm booking`.

**Cost estimate — explicitly deferred:** current rates (`Service.bscCasualRate` etc.) are not exposed through existing parent APIs. Rather than adding a new API surface (out of scope), v1 shows no inline cost — parents receive the fee in the booking confirmation email (existing behaviour). If inline cost becomes a requirement, it's a one-field addition to `/api/parent/children/[id]` in a follow-on.

All writes go through the existing `POST /api/parent/bookings` route — no change.

### Likes & comments on parent posts (schema + API + UI)

#### Schema additions

Two new models, both scoped to `ParentPost`. Additive only — no existing table modified.

```prisma
// ── Parent Post Engagement ─────────────────────────────────

model ParentPostLike {
  id         String          @id @default(cuid())
  postId     String
  post       ParentPost      @relation(fields: [postId], references: [id], onDelete: Cascade)
  // Liker is a ParentContact (magic-link auth identity) — not a staff User.
  likerId    String
  liker      CentreContact   @relation("ParentPostLikes", fields: [likerId], references: [id], onDelete: Cascade)
  createdAt  DateTime        @default(now())

  @@unique([postId, likerId])   // one like per parent per post
  @@index([postId])
  @@index([likerId])
}

model ParentPostComment {
  id         String          @id @default(cuid())
  postId     String
  post       ParentPost      @relation(fields: [postId], references: [id], onDelete: Cascade)
  // Comments can come from parents (CentreContact) OR staff (User) — nullable FK pattern.
  parentAuthorId  String?
  parentAuthor    CentreContact? @relation("ParentPostComments", fields: [parentAuthorId], references: [id], onDelete: SetNull)
  staffAuthorId   String?
  staffAuthor     User?        @relation("ParentPostStaffComments", fields: [staffAuthorId], references: [id], onDelete: SetNull)
  body       String          @db.Text
  createdAt  DateTime        @default(now())
  updatedAt  DateTime        @updatedAt

  @@index([postId, createdAt])
}
```

The matching relations added to `ParentPost`, `CentreContact`, and `User`:

```prisma
// ParentPost additions
likes     ParentPostLike[]
comments  ParentPostComment[]

// CentreContact additions
parentPostLikes     ParentPostLike[]    @relation("ParentPostLikes")
parentPostComments  ParentPostComment[] @relation("ParentPostComments")

// User additions
parentPostStaffComments  ParentPostComment[]  @relation("ParentPostStaffComments")
```

Migration: `npx prisma migrate dev --name add_parent_post_likes_and_comments` — purely additive, no data backfill needed.

#### API routes (five new endpoints + one aggregate extension)

All new routes follow existing project conventions — parent routes use `withParentAuth`, staff routes use `withApiAuth`; all mutations validated via Zod.

**Shared helpers (added once, reused by all routes):**

- `src/lib/parent-post-visibility.ts` — `canParentAccessPost(parent: ParentJwtPayload, postId: string): Promise<{ post: ParentPost; allowed: boolean }>`. Encapsulates the existing visibility rule from `/api/parent/timeline` (post's `serviceId` ∈ parent's services from their `enrolmentIds` AND (post `isCommunity === true` OR post has a tag matching one of the parent's children)). One predicate, all four parent routes use it — eliminates drift.
- `src/lib/parent-contact.ts` — `resolveParentContactForService(parent: ParentJwtPayload, serviceId: string): Promise<CentreContact | null>`. Mirrors the existing pattern in `/api/parent/messages` — looks up `CentreContact` by `(email.toLowerCase(), serviceId)`. All like/comment routes call this to get the `CentreContact.id` used as the `likerId` / `parentAuthorId`. Returns `null` → route responds 403 (not 500) — parent authenticated but has no contact record for the post's service.

**Parent side:**

1. `POST /api/parent/posts/[postId]/like` — create like (idempotent upsert on `(postId, likerId)`).
    - Flow: `canParentAccessPost` → 403 if not allowed. `resolveParentContactForService(parent, post.serviceId)` → 403 if null. Prisma `upsert` on the unique `(postId, likerId)` composite.
    - Response: `{ liked: true, likeCount: number }`
2. `DELETE /api/parent/posts/[postId]/like` — remove like.
    - Same auth + visibility. Prisma `deleteMany` (idempotent — returns 0 or 1 rows deleted).
    - Response: `{ liked: false, likeCount: number }`
3. `GET /api/parent/posts/[postId]/comments?cursor&limit` — list comments, cursor by `createdAt` desc, default limit 20, max 50 (via `safeLimit`).
    - Response: `{ items: Array<{ id, body, createdAt, authorName, authorType: 'parent' | 'staff', authorAvatar? }>, nextCursor?: string }`
    - `authorName`: first name + last-initial only (`"Sarah K."`) — no full-name PII leakage. Same treatment for both parent and staff commenters.
4. `POST /api/parent/posts/[postId]/comments` — create comment.
    - Body (Zod): `{ body: z.string().trim().min(1).max(2000) }`.
    - Auth: `canParentAccessPost` + `resolveParentContactForService`.
    - Rate limit: **reuses the default `withParentAuth` limit of 60 req/min per parent per endpoint** (verified in `src/lib/parent-auth.ts` line 144). No per-route override needed — 60/min is already strict for comment creation at this product's scale.
    - Response: the created comment object with author fields resolved.

**Staff side:**

5. `POST /api/services/[serviceId]/parent-posts/[postId]/comments` — staff reply to a comment thread on one of their service's posts.
    - Auth: `withApiAuth` with role `owner | head_office | admin | coordinator` (matches existing `/api/services/[id]/parent-posts` permissions).
    - Verifies `post.serviceId === serviceId` (route-param consistency) — 404 if mismatch.
    - Writes a `ParentPostComment` with `staffAuthorId` populated, `parentAuthorId` null.
    - Body (Zod): `{ body: z.string().trim().min(1).max(2000) }`.
    - Response: created comment object.
6. `DELETE /api/services/[serviceId]/parent-posts/[postId]/comments/[commentId]` — staff delete any comment on their service's post (moderation).
    - Auth: same as above.
    - Verifies comment's `postId === postId` and `post.serviceId === serviceId`.
    - Response: `{ deleted: true }`.

**Extension (not a new endpoint):**

7. Existing `GET /api/services/[id]/parent-posts` response — add `likeCount: number` and `commentCount: number` per post (Prisma `_count` aggregate on the new `@@index([postId])` indexes). Additive field — existing clients ignore unknown fields.

#### UI: parent side

- Each post card in `TimelineWidget` (on Home + a new dedicated `/parent/timeline` route) gets:
    - **Like button** — heart icon, toggles filled/outline. Tap triggers optimistic update via React Query (`onMutate` flips the state + increments count; `onError` rolls back + shows destructive toast).
    - **Comment button** — opens a `PullSheet` at `half` snap with the comment thread (newest at bottom), composer pinned to bottom.
    - **Counts** — `42 likes · 3 comments` below the post body; tappable to open the thread sheet.

#### UI: staff side

- `src/app/(dashboard)/services/[id]/parent-communication/page.tsx` — each post row gains:
    - `likeCount` / `commentCount` badges.
    - Expand to view full comment thread inline + staff-reply composer.
- No new page — just additions to the existing view.

#### Notifications — explicitly deferred to a follow-on spec

Verified: `StaffNotification` model does not exist in the schema. Introducing staff-side in-app notifications is a non-trivial architectural decision (new model? email only? existing in-dashboard feed?) and does not belong in this spec.

- **In this spec**: no new notifications for likes or comments. Staff discovers comments by opening the parent-communication view on their service, which already displays posts — updated comment counts and inline threads surface there.
- **Follow-on spec (`parent-engagement-notifications`)**: staff notification for new comments (reuses coordinator-email pattern from bookings, and/or introduces `StaffNotification` model); parent notification for staff replies (via existing `ParentNotification` + `NotificationBell`).

This keeps the current spec shippable and avoids "infrastructure without adoption" — we can measure engagement volume first and pick the right notification pattern based on actual data.

### Messages (`src/app/parent/messages/page.tsx` + `[id]/page.tsx`)

Conversational UX like iMessage, centre-branded.

**List screen:**
- Each row: centre `Avatar` + centre name + unread dot + 2-line preview.
- Unread visual: subtle left accent bar in gold (`#FECE00`), not a full-border highlight.
- Empty state: illustrated "No conversations yet. Say hi to your centre →" + `WarmCTA` that opens a compose sheet.

**Thread screen:**
- Centre bubbles: left-aligned, `var(--color-cream-deep)` background, dark ink.
- Parent bubbles: right-aligned, `var(--color-brand)` background, white text.
- Timestamps: shown on long-press or when the gap between consecutive messages exceeds 15 minutes.
- Photo attachments: inline, large, tappable → full-screen viewer.
- Centre phone numbers: auto-linkified → `tel:` href.
- Composer: pinned to bottom with `safe-area-inset-bottom`. Auto-growing textarea. Attach icon visible but disabled with tooltip "Attachments coming soon" (explicitly out of scope for v1). Send button appears only when text exists.
- **Optimistic send**: on submit, message appears instantly with a pending tick (faded). Turns solid when server confirms. Implemented with React Query `useMutation.onMutate` → optimistic cache update; `onError` rolls back and shows a destructive toast.

All data from existing `useParentConversations` + `POST /api/parent/messages/[id]` (already exists).

### Passive-upgrade screens

Each gets ~1–2 hours of polish — tokens apply automatically, components swapped to new primitives where relevant. **No v1/v2 split** for these — they're edited in place (no flag guard), so they remain visually coherent with whichever page state is live at any given time.

- **Children list (`/parent/children`)** — grid of `KidPill` cards (larger, "hero" variant), 2-col on mobile, 3-col on tablet.
- **Billing (`/parent/billing`)** — invoice list becomes `warm-card` rows, `StatusBadge` for paid / due / overdue, inline `WarmCTA` on unpaid items.
- **Account (`/parent/account`)** — section cards with `SectionLabel`, warm form styles (input focus → soft brand glow — already in `globals.css`), inline save on each section (no full-page form).
- **Getting Started (`/parent/getting-started`)** — progress uses `WarmCTA`; each step becomes a checklist row with friendly copy.

## Rollout

Build-time flag + query-string override — ship each redesigned page when it's ready without holding all 4 for a big-bang release.

- **Flag**: `NEXT_PUBLIC_PARENT_PORTAL_V2` (string, `"true"` to enable). Because this is inlined by Next.js at build time, it's a **per-deployment cutover**, not a per-request A/B — calling it "A/B compared with parents" would be incorrect.
- **Query override for verification in any env**: if the URL includes `?v2=1`, treat the flag as on regardless of env var; `?v2=0` forces it off. This lets us staging-test v2 pages in a production build before flipping the flag for everyone.
- **Env defaults**: `.env.local` enables the flag (`NEXT_PUBLIC_PARENT_PORTAL_V2=true`); staging on; prod off until each commit lands and is verified on the `?v2=1` override.
- **File layout for each redesigned page** — the four redesigned routes use a consistent pattern. Both v1 and v2 live in the same directory; the `page.tsx` remains a thin client component and conditionally renders:

    ```
    src/app/parent/page.tsx           ← "use client"; reads flag + ?v2; renders <HomeV1/> or <HomeV2/>
    src/app/parent/HomeV1.tsx         ← current implementation (renamed from inline content in page.tsx)
    src/app/parent/HomeV2.tsx         ← new implementation
    ```

    Same pattern for `children/[id]/` (ChildDetailV1/V2), `bookings/` (BookingsV1/V2), `messages/` (MessagesV1/V2 + each `messages/[id]` variant).

- **Flag-reading helper** — `src/app/parent/utils/useV2Flag.ts`:

    ```ts
    "use client";
    import { useSearchParams } from "next/navigation";
    export function useV2Flag(): boolean {
      const override = useSearchParams().get("v2");
      if (override === "1") return true;
      if (override === "0") return false;
      return process.env.NEXT_PUBLIC_PARENT_PORTAL_V2 === "true";
    }
    ```

- **Cleanup (commit 13)**: when all four redesigned pages are live in prod, delete `HomeV1.tsx` / `ChildDetailV1.tsx` / `BookingsV1.tsx` / `MessagesV1.tsx` / `messages/[id]/ThreadV1.tsx`, inline `<HomeV2/>` logic back into `page.tsx` (rename to remove V2 suffix), and delete `useV2Flag`. ~5 files deleted, ~5 files simplified.

## Testing

- **Unit (Vitest)** — commit 2 covers every new primitive:
    - Each primitive: render, prop variants, onPress callback, aria attributes, keyboard focus.
    - **Avatar hydration stability**: assert `djb2("child-uuid-abc") % 6` is deterministic; render the component twice (simulating SSR + CSR) with the same seed and assert identical gradient output.
    - `StatusBadge`: assert correct bg/fg tokens referenced per variant.
    - `SwipeActions`: simulate pointer events that drag the item left and assert the action buttons become visible; drag right assert snap-back.
    - `PullSheet`: assert snap points are passed through to `vaul`; skip interactive drag assertions (covered by vaul's own tests).
    - **Reduced-motion**: mock `matchMedia('(prefers-reduced-motion: reduce)')` returning `true`; assert interactive elements don't get a transform on `:active` (via computed style check).
    - **Dark-mode**: mount with `.dark` class on the root; assert the new `--color-cream-*` and `--color-status-*-*` tokens resolve to the dark values (via `getComputedStyle`).
    - **Greeting pure function**: `getGreetingSubline` — one assertion per rule branch (11 branches).
- **Integration** — no new API routes → no new integration tests. Existing route tests continue to cover the data layer.
- **E2E (Playwright)** — commit 12 adds specs to `src/__tests__/e2e/`:
    - `parent-portal-home.spec.ts` — login → greeting reflects kid state → click kid → arrives on child detail.
    - `parent-portal-bookings.spec.ts` — open fast-book sheet → pick child / date / session → confirm → card appears in Upcoming.
    - `parent-portal-attendance.spec.ts` — open child detail → 14-day strip renders → tap a day → sheet opens.
    - `parent-portal-messages.spec.ts` — thread view → type + send → optimistic message appears → confirmation tick.
    - **`parent-portal-booking-e2e.spec.ts`** — cross-portal: parent books casual → staff coordinator sees it on `/bookings` → confirms → same booking appears on `/roll-call` for the booked date. Verifies the wired E2E flow the redesign depends on.
    - **`parent-portal-post-engagement.spec.ts`** — cross-portal: staff creates a parent post via `/services/[id]/parent-communication` → parent sees it in timeline → parent likes → parent comments → staff sees updated counts + the comment appears in the staff view → staff replies → parent sees reply in notification.
    - **`parent-portal-messaging-e2e.spec.ts`** — cross-portal: parent sends message → staff receives on dashboard → staff replies → parent receives reply.

    Specs require `.env.local` with `NEXTAUTH_URL=http://localhost:3000` and `PARENT_JWT_SECRET` set. `playwright.config.ts` sets `NEXT_PUBLIC_PARENT_PORTAL_V2=true` for the test run so the specs hit v2 code paths.

- **Accessibility** — run the `accessibility-review` skill on final mockups before each redesigned page ships. Target WCAG 2.1 AA. Touch targets already enforced at 44px globally by `globals.css`. All new components must have proper `aria-label` / `aria-live` (status badges) / `aria-current` (tabs).
- **Manual smoke test** — test each redesigned page on real iOS Safari (PWA mode) and Chrome Android before marking its commit done, per the Amana completion standard.

## Metrics to instrument

Per-feature visibility so we can measure whether v2 is actually working:

- **Time-to-first-interaction on Home** — log when the greeting + kid status is rendered (via `performance.mark` + a `reportWebVitals`-style ingest). Target: < 1.5s on mid-tier Android.
- **Fast-book completion rate** — fire analytics events on sheet-open, step-advance, and confirm. Ratio = confirms / opens. Target: > 60%.
- **Message send success rate** — optimistic vs. confirmed. Target: > 99% (anything lower signals a server-side issue surfacing only now that parents send more messages).
- **V2 adoption** — count `?v2=1` hits + v2-flag-on page views; ensure v2 is actually hit in production before removing the flag.

Instrumentation lives inside each redesigned page; no new analytics infrastructure is required if existing PostHog / Vercel Analytics / equivalent is wired up. If no analytics exists yet, use `console.info` marker logs and defer the ingest pipeline to a later spec.

## Out of scope (explicit)

- ❌ **Native mobile app.** Queued as the next brainstorm *after* this spec ships. Expo/React Native via SOLVR's precedent stack (`solvr-mobile/`). Will reuse the design tokens + component patterns from v1 of this spec.
- ❌ **Staff-side native app.** Separate strategic discussion — staff dashboard is 60+ pages and mobile-native makes sense for only a tiny subset (likely roll-call, timesheets, messages, leave, incidents). Out of this entire scope.
- ❌ **API or schema changes *beyond* the additive likes/comments on parent posts.** The only schema addition is `ParentPostLike` + `ParentPostComment` (both new tables, no existing data touched). Four new API routes are added for that feature set. Everything else uses existing routes + models.
- ❌ **Inline cost estimate in fast-book.** Deferred — would require exposing rates on `/api/parent/children/[id]`. Fee appears in booking confirmation email (existing behaviour).
- ❌ **Push notifications.** Already working via `NotificationBell` — untouched.
- ❌ **Offline mode / service worker data caching.** Future phase.
- ❌ **Photo upload for kid avatars.** v1 uses colour-seeded initials. Photos are a later phase and would need storage + moderation policy.
- ❌ **New routes or route renames.** Everything stays at `/parent/*`.
- ❌ **Staff dashboard redesign.** Once parent patterns prove out, they'll inherit into the staff dashboard as a separate spec.
- ❌ **Attachments in messaging.** Compose button visible but disabled with tooltip. Full attachment flow is a later phase.
- ❌ **Cross-service booking or new session types.** Uses only session types each service already offers.
- ❌ **Comment editing by the author, self-delete, or report-abuse.** v1 has staff-delete only (per moderation in commit 4). Author-edit / author-delete / report-abuse are deliberately out — they need their own policy discussion.
- ❌ **Profanity filter / automated moderation on comments.** Length-limited (2000 chars) but no content filter. Separate spec if needed.
- ❌ **Staff or parent notifications for likes/comments.** Explicitly deferred to the follow-on `parent-engagement-notifications` spec.
- ❌ **Realtime (WebSocket/SSE) updates for comments or likes.** v1 uses React Query polling / stale-time. Realtime is a separate infra discussion.
- ❌ **Percentage / cohort rollout.** The build-time flag does all-or-nothing per deployment. If cohort rollout becomes a requirement, it's a separate spec (needs Edge Config or similar runtime flag source).

## Success criteria

When this spec is fully shipped (commit 9 merged, flag removed):

1. **Home LCP** < 2.5s on mid-tier Android; kid status visible in DOM within 1s of route mount.
2. **Booking a casual** completes in ≤ 3 taps from any screen (FAB → pick child/date → confirm).
3. **Sending a message** is inline and optimistic — no blocking spinner between send and first visible bubble.
4. **Every screen** has a primary action visible without scrolling — no dead-end screens.
5. **Visual consistency** — same spacing scale, same `warm-card` treatment, same `StatusBadge` palette across all 8 parent pages.
6. **All 700+ existing tests still pass.** New unit + E2E specs pass on CI.
7. **No regression in existing staff-dashboard screens** (they don't share the parent primitives).
8. **Fast-book completion rate** > 60% from the instrumentation above.
9. **Like action feels instant** — optimistic UI flips the heart in < 100ms perceived latency; failure rolls back within 2s with a destructive toast.
10. **Comment count refresh for staff** — staff viewing `/services/[id]/parent-communication` sees comment-count increment within 30s of a parent posting a comment (React Query stale-time-based refresh, no realtime push needed).

## Future follow-ons (next brainstorms, not this spec)

- **`amana-parent-mobile`** — Expo/React Native app in a new repo (or monorepo subpath) reusing the design tokens + component patterns from this spec. TestFlight + Play Internal. Pushes via APNs/FCM. Likely 8–12 weeks.
- **Staff mobile app (scope TBD)** — strategic conversation: which 5–6 staff screens deserve a native experience?
- **Photo uploads for kid avatars** — storage, moderation, rollout.
- **Offline mode** — service worker caching of profile / upcoming bookings / last-seen messages.
- **Attachments in messaging** — file upload + inline preview.
- **Inline cost estimate in fast-book** — small additive API change + sheet UI refinement.
- **Percentage / cohort rollout** — if we ever need gradual flag rollout instead of big-bang, introduce Vercel Edge Config or similar.
