# Parent Portal v2 — UX & UI Redesign

**Date**: 2026-04-23
**Status**: Approved (brainstorming complete — 2026-04-23 session)
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

Redesign the 8-page Parent Portal in place, keeping every existing route, Prisma model, API contract, and React Query hook. Two things change:

1. **Design system** — extend `globals.css` with new tokens (radius scale, soft-cream surfaces, warm status palette, kid-avatar gradients, overshoot easing), add 7 parent-scoped component primitives (`Avatar`, `KidPill`, `SessionCard`, `StatusBadge`, `SectionLabel`, `WarmCTA`, `PullSheet`).
2. **Core flows** — rebuild 4 high-traffic screens around those primitives: Home, Child Detail / Attendance, Bookings (with fast-book sheet), Messages (with optimistic send).

Four remaining pages (Children list, Billing, Account, Getting Started) inherit the new design system passively — no rewrites.

Ship **page-by-page behind a `PARENT_PORTAL_V2` env flag** so the redesign can be rolled out incrementally and A/B compared with parents. Each commit is independently shippable.

Visual direction was picked in the brainstorm: **"Soft & Human" layout** (warmer spacing, rounded 20px corners, gradient kid-avatars, generous typography) applied with the **existing Amana brand palette** (navy `#004E64`, gold `#FECE00`, cream `#FAF8F5`).

## Baseline

- Current tests: 700/700 passing, 46 test files (parent portal covered by existing route tests + one E2E spec).
- Data model complete — zero schema changes required.
- Existing APIs untouched: `/api/parent/profile`, `/api/parent/bookings`, `/api/parent/children/[id]`, `/api/parent/conversations`, `/api/parent/enrolment-applications`, `/api/parent/onboarding`.
- Existing hooks untouched: `useParentProfile`, `useParentBookings`, `useParentChild`, `useParentConversations`, `useParentOnboarding`, `useParentEnrolmentApplications`.
- Auth untouched: `ParentAuthProvider`, magic-link issuance, `PARENT_JWT_SECRET` session cookie.
- PWA untouched: `/parent-manifest.webmanifest` + apple-mobile-web-app title override.
- Existing `src/components/ui/` library (`Skeleton`, `BottomSheet`, `EmptyState`, etc.) remains used by the staff dashboard; new parent primitives live under `src/components/parent/ui/` to keep the two surfaces cleanly separated.
- `src/app/globals.css` already defines brand colours, fonts (DM Sans + Bricolage Grotesque), warm shadows, reduced-motion support, 44px touch targets, and dark mode.

## In scope — stacked commits

| # | Commit subject | Category | Files (approx.) |
|---|---|---|---|
| 1 | `feat(parent): design system tokens + 7 primitives under src/components/parent/ui/` | Foundation | ~10 |
| 2 | `test(parent): unit tests for new primitives (Avatar, KidPill, SessionCard, StatusBadge, SectionLabel, WarmCTA, PullSheet)` | Tests | ~7 |
| 3 | `feat(parent): Home v2 behind PARENT_PORTAL_V2 flag` | Feature | ~4 |
| 4 | `feat(parent): Child Detail / Attendance v2 behind PARENT_PORTAL_V2 flag` | Feature | ~4 |
| 5 | `feat(parent): Bookings v2 + fast-book PullSheet behind PARENT_PORTAL_V2 flag` | Feature | ~5 |
| 6 | `feat(parent): Messages v2 with optimistic send behind PARENT_PORTAL_V2 flag` | Feature | ~4 |
| 7 | `feat(parent): passive visual upgrade for Children / Billing / Account / Getting Started` | Feature | ~4 |
| 8 | `test(parent): e2e specs for redesigned flows (book / attendance / message / home)` | Tests | 1–2 |
| 9 | `feat(parent): remove PARENT_PORTAL_V2 flag + cleanup v1 files` | Cleanup | ~8 |

~9 commits. No changes to API routes, no schema migrations, no hook signatures changed.

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

Add a global `:active` scale for interactive elements **scoped to the parent portal** (so the staff dashboard is unaffected):

```css
.parent-portal a[role="button"]:active,
.parent-portal button:not([disabled]):active,
.parent-portal [role="button"]:active {
  transform: scale(0.98);
}
```

The `.parent-portal` class gets applied to the outer div in `src/app/parent/layout.tsx`.

### Component primitives (`src/components/parent/ui/`)

All under `src/components/parent/ui/`, scoped to the parent portal so staff surface is untouched. Each is <100 lines, single purpose, fully typed, and has a unit test.

| Component | Purpose | Key props |
|---|---|---|
| `Avatar` | Circle with initial or photo, gradient fill keyed off `seed` (so same kid always gets same colour), 4 sizes | `name`, `seed?`, `size?: 'sm'\|'md'\|'lg'\|'xl'`, `src?` |
| `KidPill` | Avatar + name + subtitle + right-side `StatusBadge`, tappable | `child`, `status?`, `href?`, `onPress?` |
| `SessionCard` | Date tile (DAY / NUM) + label + sublabel + status, horizontal or list variant | `date`, `label`, `sublabel?`, `status`, `variant?` |
| `StatusBadge` | Rounded-full pill, soft-palette variants | `variant: 'in-care' \| 'confirmed' \| 'requested' \| 'declined' \| 'new' \| 'overdue'` |
| `SectionLabel` | Small uppercase label + optional right action, replaces three inconsistent label patterns in v1 | `label`, `action?: { href: string, text: string }` |
| `WarmCTA` | Gradient-accent call block (icon + title + sub + chevron) | `icon`, `title`, `sub?`, `href`, `tone?` |
| `PullSheet` | Mobile-native bottom sheet with drag-to-dismiss + snap points (peek / half / full) | `open`, `onOpenChange`, `snap?`, `children` |

`PullSheet` wraps the existing `BottomSheet` in `src/components/ui/` — it doesn't replace it. It adds snap-point behaviour specifically for parent-portal flows (fast-book, compose). Staff dashboard continues using plain `BottomSheet`.

Avatar gradient presets (6, keyed off `hash(seed) % 6`):
- Teal (`#7FD3D9 → #4A9BA3`)
- Peach (`#FFB48E → #E08A5E`)
- Amber (`#FFC94D → #E89F1E`)
- Sage (`#A8C8A8 → #6D9A6D`)
- Rose (`#F4A5B5 → #D07089`)
- Lilac (`#C4A8E0 → #8C6FB8`)

### Home (`src/app/parent/page.tsx`)

Full rebuild. State- and time-aware greeting; live status hero for each kid; compact week strip; inline messages; single warm CTA for fast-book.

**Structure:**

1. **Greeting header** — large heading ("Hi Jayden."), dynamic subline. Subline copy rules:
    - Before 3pm on a weekday: "School's still in — pickup at 3:15."
    - During care (one or more kids signed in): "Sophia & Zayd are in good hands today."
    - After care (all signed out): "Everyone's home safe — signed out at 6:02pm."
    - Weekend: "No bookings today — see you Monday."
2. **Kid status strip** — one `KidPill` per child. Shows live `StatusBadge` ("In care", "Signed out", "Not in today") + timestamp.
3. **This week strip** — `SectionLabel` with count. Horizontal-scroll row of `SessionCard`s, today tile highlighted.
4. **Messages inline** — `SectionLabel` with unread count. Up to 2 compact message rows with centre avatar + preview. Tap → thread.
5. **`WarmCTA` "Book a casual"** — opens the `PullSheet` inline (no navigation).
6. **Quick actions row** — 3 `warm-card` tiles: `Today's menu`, `Pay`, `Help`.
7. **Onboarding banner** — existing component, kept but re-skinned to the new system (when `completedCount < totalCount`).
8. **Enrol-a-sibling CTA** — existing component, re-skinned.

All data sourced from existing `useParentProfile`, `useParentBookings("upcoming")`, `useParentConversations`, `useParentOnboarding` — no new hooks.

### Child Detail / Attendance (`src/app/parent/children/[id]/page.tsx`)

**Structure:**

1. **Hero** — large `Avatar size="xl"` + kid name + live status badge with pulse animation when in care. Year level + service name below.
2. **14-day attendance strip** — horizontal scroll, today tile larger and branded. Each day tile: coloured dot (`attended` / `absent` / `booked` / `holiday`), time signed in/out. Tap a day → sheet with full day detail.
3. **Weekly pattern card** — `warm-card` showing the kid's recurring pattern ("Mon–Fri ASC · 3:15pm pickup") + inline "Change pattern" link.
4. **Medical & allergies card** — collapsed-by-default if conditions exist, just shows the count ("2 medical notes"). Expand → full detail. If no conditions: single muted line "No medical notes on file · Update".
5. **This week's menu (service-scoped, filtered to this child's allergens)** — single tappable `warm-card` showing today's meal + allergen flags relevant *to this child* (via `child.allergies` intersect `menu.allergens`). Tap → full week menu sheet.
6. **Sticky action bar (bottom, above tab bar)** — 3 buttons: `Message centre`, `Book casual`, `Request change`. Uses `safe-area-inset-bottom`.

All data from existing `useParentChild(id)` — no new endpoint.

### Bookings (`src/app/parent/bookings/page.tsx`)

One screen, three modes via segmented control.

**Structure:**

1. **Segmented control** — `Upcoming · Past · Requests`. Underline style, soft. Syncs to `?tab=` query param.
2. **Grouped list** — grouped by week label ("This week", "Next week", "Week of 5 May"). `SessionCard` rows, list variant.
3. **Swipe-left gesture on upcoming cards** — reveals `Modify` / `Cancel` actions. Uses existing touch gesture infrastructure (the project already has swipe gestures per memory).
4. **Floating "+ Book" FAB** — gold `#FECE00` button, bottom-right, positioned above bottom tab bar. Opens fast-book `PullSheet`.

**Fast-book `PullSheet` — 3 steps, all within the sheet:**
- **Step 1**: Pick child (chip row if >1 child).
- **Step 2**: Pick date(s). Mini calendar with session types (`bsc` / `asc` / `vc`) pre-filtered to what the service offers that day. Multi-select dates.
- **Step 3**: Review & confirm. Shows total sessions + cost estimate (reuse existing session-fee logic). Primary button: `Confirm booking`.

Snap points: `peek` (just the handle + "Book a casual" header), `half` (step 1–2), `full` (step 3 with confirmation). Drag-down from any snap → collapses to the next-lower point, not immediate dismiss.

All data from existing `useParentBookings` + `POST /api/parent/bookings` (already exists, no change).

### Messages (`src/app/parent/messages/page.tsx` + `[id]/page.tsx`)

Conversational UX like iMessage, centre-branded.

**List screen:**
- Each row: centre `Avatar` + centre name + unread dot + 2-line preview.
- Unread visual: subtle left accent bar in gold (`#FECE00`), not a full-border highlight.
- Empty state: illustrated "No conversations yet. Say hi to your centre →" + `WarmCTA` that opens a compose sheet.

**Thread screen:**
- Centre bubbles: left-aligned, `--color-cream-deep` background, dark ink.
- Parent bubbles: right-aligned, `--color-brand` background, white text.
- Timestamps: shown on long-press or when the gap between consecutive messages exceeds 15 minutes.
- Photo attachments: inline, large, tappable → full-screen viewer.
- Centre phone numbers: auto-linkified → `tel:` href.
- Composer: pinned to bottom with `safe-area-inset-bottom`. Auto-growing textarea. Attach icon (future — out of scope for v1, button is visible but disabled with tooltip "Attachments coming soon"). Send button only appears when text exists.
- **Optimistic send**: on submit, message appears instantly with a pending state (faded tick). Turns solid when server confirms. Uses React Query `onMutate` + rollback on error.

All data from existing `useParentConversations` + `POST /api/parent/conversations/[id]/messages` (already exists).

### Passive-upgrade screens

Each gets ~1–2 hours of polish — tokens apply automatically, components swapped to new primitives where relevant. No structural changes.

- **Children list (`/parent/children`)** — grid of `KidPill` cards (larger, "hero" variant of the same component), 2-col on mobile, 3-col on tablet.
- **Billing (`/parent/billing`)** — invoice list becomes `warm-card` rows, `StatusBadge` for paid / due / overdue, inline `WarmCTA` on unpaid items.
- **Account (`/parent/account`)** — section cards with `SectionLabel`, warm form styles (input focus → soft brand glow — already in `globals.css`), inline save on each section (no full-page form).
- **Getting Started (`/parent/getting-started`)** — progress uses `WarmCTA`; each step becomes a checklist row with friendly copy.

## Rollout

Each commit ships incrementally behind an env flag so we can ship without holding the entire redesign for one big-bang release.

- **Flag name**: `NEXT_PUBLIC_PARENT_PORTAL_V2` (string — `"true"` to enable). Checked in `src/app/parent/layout.tsx` and each redesigned page via `const v2 = process.env.NEXT_PUBLIC_PARENT_PORTAL_V2 === "true"`.
- **In dev**: flag defaults on via `.env.local`. In staging: on. In prod: off until each commit lands and is verified.
- **Fallback**: each redesigned page keeps its v1 export in place (renamed to `PageV1`) and renders `v2 ? <PageV2 /> : <PageV1 />`. When the last redesigned page ships, commit 9 removes the flag + deletes all `*V1` files.

The user can stop at any commit — if we ship only through commit 3 (Home v2), parents already see a meaningful visual lift on the highest-traffic screen.

## Testing

- **Unit (Vitest)** — commit 2 covers every new primitive. Each primitive test asserts render, prop variants, onPress callback, aria attributes, keyboard focus, and (for Avatar) deterministic gradient output for a given seed.
- **Integration** — no new API routes → no new integration tests. Existing route tests continue to cover the data layer.
- **E2E (Playwright)** — commit 8 adds 4 specs to `src/__tests__/e2e/`:
    - `parent-portal-home.spec.ts` — login → greeting reflects kid state → click kid → arrives on child detail
    - `parent-portal-bookings.spec.ts` — open fast-book sheet → pick child / date / session → confirm → card appears in Upcoming
    - `parent-portal-attendance.spec.ts` — open child detail → 14-day strip renders → tap a day → sheet opens
    - `parent-portal-messages.spec.ts` — thread view → type + send → optimistic message appears → confirmation tick

    Specs require `.env.local` with `NEXTAUTH_URL=http://localhost:3000` and `PARENT_JWT_SECRET` set, per existing Playwright setup. Specs respect the `PARENT_PORTAL_V2` flag by setting it in `playwright.config.ts`.

- **Accessibility** — run the `accessibility-review` skill on final mockups before each redesigned page ships. Target WCAG 2.1 AA. Touch targets already enforced at 44px globally by `globals.css`. All new components must have proper `aria-label` / `aria-live` (status badges) / `aria-current` (tabs).
- **Manual smoke test** — test each redesigned page on real iOS Safari (PWA mode) and Chrome Android before marking its commit done, per the Amana completion standard.

## Out of scope (explicit)

- ❌ **Native mobile app.** Queued as the next brainstorm *after* this spec ships. Expo/React Native via SOLVR's precedent stack (`solvr-mobile/`). Will reuse the design tokens + component patterns from v1 of this spec.
- ❌ **Staff-side native app.** Separate strategic discussion — staff dashboard is 60+ pages and mobile-native makes sense for only a tiny subset (likely roll-call, timesheets, messages, leave, incidents). Out of this entire scope.
- ❌ **API or schema changes.** All data lives in existing Prisma models. Any new endpoint would be a separate spec.
- ❌ **Push notifications.** Already working via `NotificationBell` — untouched.
- ❌ **Offline mode / service worker data caching.** Future phase.
- ❌ **Photo upload for kid avatars.** v1 uses colour-seeded initials. Photos are a later phase and would need storage + moderation policy.
- ❌ **New routes or route renames.** Everything stays at `/parent/*`.
- ❌ **Staff dashboard redesign.** Once parent patterns prove out, they'll inherit into the staff dashboard as a separate spec.
- ❌ **Attachments in messaging.** Compose button visible but disabled with tooltip. Full attachment flow is a later phase.
- ❌ **Cross-service booking or new session types.** Uses only session types each service already offers.

## Success criteria

When this spec is fully shipped (commit 9 merged, flag removed):

1. A parent can see their kid's live status within 1 second of opening the home screen.
2. Booking a casual session takes 3 taps or fewer from any screen (FAB → pick child/date → confirm).
3. Sending a message to the centre is inline, with optimistic feedback — no loading wall.
4. Every screen has a primary action visible without scrolling — zero dead-end screens.
5. Visual style is consistent across all 8 parent pages.
6. All 700+ existing tests still pass. New E2E specs pass on CI.
7. No regression in existing staff-dashboard screens (they don't share the parent primitives).

## Future follow-ons (next brainstorms, not this spec)

- **`amana-parent-mobile`** — Expo/React Native app in a new repo (or monorepo subpath) reusing the design tokens + component patterns from this spec. TestFlight + Play Internal. Pushes via APNs/FCM. Likely 8–12 weeks.
- **Staff mobile app (scope TBD)** — strategic conversation: which 5–6 staff screens deserve a native experience?
- **Photo uploads for kid avatars** — storage, moderation, rollout.
- **Offline mode** — service worker caching of profile / upcoming bookings / last-seen messages.
- **Attachments in messaging** — file upload + inline preview.
