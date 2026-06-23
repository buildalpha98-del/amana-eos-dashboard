# EOS Implementer role + fixing the EOS Viewer wiring

**Date:** 2026-06-23
**Status:** Approved design — ready for implementation plan
**Branch:** `feat/eos-implementer-scoped-access`

## Trigger

Cameron (Amana's external EOS implementer) logs in, gets a cascade of error toasts, and is dropped to an error screen. He is on the `eos_viewer` role (shipped 2026-06-22), which is **view-only** and **incompletely wired**. Two problems:

1. `eos_viewer` is broken (three+ gaps, below) so it errors and crashes.
2. Even fixed, `eos_viewer` is read-only — Cameron needs to **run** EOS (create/edit Rocks, To-Dos, Issues, Scorecard, Meetings, V/TO, Accountability Chart), i.e. **write** access.

## Decision

- **Keep `eos_viewer`** as the read-only EOS tier (board observers / advisors) and **fix its wiring bugs**.
- **Add `eos_implementer`** — a write-capable EOS role, sibling to `eos_viewer`, organisation-wide, EOS-only.
- **Fix the shared bugs** (scope, dashboard, sidebar, landing) so *both* EOS roles work.
- Set Cameron to `eos_implementer`.

Chosen over "Admin + per-user page-scope" because the codebase already established a first-class EOS-role pattern yesterday; a second per-user scoping mechanism would create drift and leave `eos_viewer` broken. A dedicated role also matches the user's mental model ("his role") and gives a clean dropdown identity ("EOS Implementer").

## The `eos_viewer` bugs (root cause of the crash)

Confirmed on `main`. Every one of these is a site the TypeScript compiler does **not** catch — plain `Role[]` arrays, string unions, or file-local role types — which is why `eos_viewer` shipped broken:

1. **`VALID_ROLES` rejects the role — THE dominant blocker.** `src/lib/server-auth.ts:159` keeps a hand-maintained `VALID_ROLES: Role[]` (a 3rd parallel list, separate from `ROLES` in `role-enum.ts`). Every `withApiAuth` request checks it first: an unknown role → **401 "Unauthorized" before any `roles:`/feature/handler logic runs**. `eos_viewer` is absent, so **every authenticated API call Cameron makes 401s** — this is the real engine of the error-toast cascade. Fix: source `VALID_ROLES` from `role-enum.ts`'s `ROLES` (eliminate the parallel list — `role-enum.ts`'s own docstring warns about exactly this drift) and make `ROLES` complete.
2. **Missing from the data-scope helpers.** `src/lib/centre-scope.ts` (`UNSCOPED_ROLES = ["owner","head_office"]`, plus an `admin` branch) and `src/lib/service-scope.ts` (unscoped only for owner/head_office/admin) have **no `eos_viewer` case**, so it falls through to "no centre assigned" → `centre-scope` returns `{ serviceIds: [] }` → `applyCentreFilter` injects `__no_access__` → every EOS read returns **empty**. (`service-scope` returns `null`=unscoped for a role with no `serviceId`, so the two helpers *disagree* — the shared `EOS_ROLES` constant resolves this.)
3. **Wrong dashboard branch.** `DashboardContent.tsx`'s `getDashboardRole()` (file-local string union, `…includes(role) ? role : "staff"`) returns `"staff"` for any unrecognised role, so an EOS user renders the **Educator** `<StaffDashboard/>` — the wrong surface (not a crash from this file, but wrong). Needs an EOS-role branch + the `DashboardRole` union/array updated.
4. **Missing from `ROLES`** in `src/lib/role-enum.ts` (the hand-maintained runtime array) — `isRole`/`parseRoleParam` reject `eos_viewer`. Feeds bug #1 once `VALID_ROLES` sources from `ROLES`.
5. **Not in `EOS_SIDEBAR_ROLES`** (`src/lib/nav-config.ts`) — even with page access, the EOS nav links are gated to `["head_office","admin","marketing"]`, so an EOS-role user sees no EOS links in the sidebar.

**Lower-severity uncaught sites (cosmetic, fall back gracefully — fix or note):** `src/lib/getting-started-checklists.ts` + `GettingStartedContent.tsx` (`Record<RoleKey,…>` with a file-local `RoleKey` → EOS user sees the Educator checklist via `?? staff` fallback); `src/lib/command-actions.ts:62-64` (`ORG_WIDE_ROLES`/`ADMIN_ROLES`/`COORD_UP` `Role[]` literals → EOS implementer gets no command-palette EOS actions like "Create Rock" unless added to `COORD_UP`).

The fixes for 1, 2, 3, 5 are shared by both EOS roles; fix 4 covers both too.

## `eos_implementer` capabilities

- **Pages** (`rolePageAccess`): same EOS surface as `eos_viewer` plus `/queue` — `/rocks, /vision, /scorecard, /todos, /issues, /meetings, /accountability-chart`, plus `/dashboard, /getting-started, /my-portal, /profile, /assistant, /queue, /guides, /help, /directory`. Ordered so `/rocks` is first (landing).
- **Features** (`roleFeatures` → new `eosImplementerFeatures`): write across EOS — `rocks.view/create/edit/delete`, `todos.view/create/edit/delete`, `issues.view/create/edit/delete`, `meetings.view/create/edit`, `scorecard.view/edit`, plus `my_portal.view`. (V/TO, Goals, Accountability are role-array-gated, not feature-gated.)
- **Priority** (`rolePriority`): low (e.g. `1`) — never satisfies a `minRole` gate for non-EOS admin surfaces. EOS write APIs use explicit `roles:` arrays, so priority is irrelevant to EOS access.
- **Scope:** organisation-wide (added to unscoped sets) — an implementer works across all centres, not one state.

## EOS write APIs — add `eos_implementer` to `roles:`

Confirmed sites (all `withApiAuth(..., { roles: [...] })`):

| Route | Current roles | Action |
|---|---|---|
| `POST /api/rocks` | owner, head_office, admin, member, marketing | + eos_implementer |
| `PATCH/DELETE /api/rocks/[id]` | owner, head_office, admin | + eos_implementer |
| `POST /api/todos/bulk` | owner, head_office, admin | + eos_implementer |
| `POST /api/meetings` | owner, head_office, admin, marketing | + eos_implementer |
| `PATCH/DELETE /api/meetings/[id]` | owner, head_office, admin | + eos_implementer |
| `POST /api/measurables` | owner, head_office, admin, member | + eos_implementer |
| `PATCH/DELETE /api/measurables/[id]` | owner, head_office, admin | + eos_implementer |
| `POST /api/goals`, `PATCH/DELETE /api/goals/[id]` | owner, head_office, admin | + eos_implementer |
| `PATCH /api/vto` | owner, head_office, admin | + eos_implementer |
| `POST /api/accountability-chart`, `PATCH/DELETE /[id]` | owner, head_office, admin | + eos_implementer |

`POST /api/todos`, `POST /api/issues`, and the un-gated EOS sub-routes (`/api/rocks/[id]/milestones`, `/api/measurables/[id]/entries`, `/api/measurables/reorder`, `/api/todos/bulk-actions`, `/api/issues/bulk`, plus `/api/todos/[id]`, `/api/issues/[id]`) have **no** `roles:` gate — so `eos_implementer` passes them **once `VALID_ROLES` is fixed** (until then the `server-auth.ts` gate 401s them regardless of the missing `roles:` array). No code change on these routes; the test plan must still cover them. Scorecard cells are written via the un-gated `POST /api/measurables/[id]/entries` (there is no role-gated scorecard write route — `scorecard.edit` is UI-gating only). **Not** changed (genuine admin-maintenance): `POST /api/scorecard/seed` (owner-only), `POST /api/scorecard/rollup` (ADMIN_ROLES).

## Role wiring — mirror `eos_viewer` everywhere, add `eos_implementer`

`eos_viewer` is the template. TypeScript's exhaustive `Record<Role, …>` maps make most omissions a **build error** — relied on as a safety net. Sites (from grep):

- `prisma/schema.prisma` enum + new migration `…_role_eos_implementer/migration.sql` (`ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'eos_implementer'`).
- `src/lib/role-permissions.ts`: `rolePageAccess`, `roleFeatures` (+`eosImplementerFeatures`), `rolePriority`, `PermissionRow` optional key.
- `src/lib/role-enum.ts`: `ROLES` — add **both** `eos_viewer` (fix) and `eos_implementer`.
- `src/lib/org-settings-shared.ts`: inline `Role` union, `roleLabels`, `rolePageOverrides`, `roleGuides`, checklist-overrides schemas + their defaults + the `pick`/`pickRole`/`pickLabel` merge helpers.
- `src/app/api/settings/role-permissions/route.ts` (schema + default).
- `src/app/api/users/route.ts`, `src/app/api/users/[id]/route.ts`, `src/app/api/users/bulk-invite/route.ts` (`z.enum` role lists).
- `src/app/(dashboard)/settings/SettingsContent.tsx` (invite dropdown), `settings/permissions/page.tsx` (role list + sets + defaults), `settings/organisation/OrganisationSettingsClient.tsx` (role list + description + welcome default).
- `src/app/(dashboard)/position-descriptions/page.tsx`, `src/components/staff/RoleBadge.tsx`, `src/components/staff/PositionDescriptionTab.tsx`, `src/lib/derive-membership-defaults.ts` (label + membership default).

## Shared behavioural fixes (benefit both EOS roles)

- **Auth gate (critical)** — `src/lib/server-auth.ts`: replace the hand-maintained `VALID_ROLES` literal with `ROLES` imported from `role-enum.ts` (after `ROLES` is completed), so no role can ever be silently 401'd by a stale parallel list again. This alone unblocks every API call for both EOS roles.
- **Scope** — `src/lib/centre-scope.ts` + `src/lib/service-scope.ts`: treat `eos_viewer` and `eos_implementer` as organisation-wide (unscoped). Introduce a shared `EOS_ROLES` constant so the two helpers and the nav stay in sync.
- **Sidebar** — `src/lib/nav-config.ts`: add both EOS roles to `EOS_SIDEBAR_ROLES` and to the `/scorecard` nav item's `roles`.
- **Dashboard** — `DashboardContent.tsx`: extend `getDashboardRole()`'s union/array and add an EOS-role branch rendering a lightweight EOS overview (Rocks / To-Dos / Issues summary) instead of the Educator `StaffDashboard`. Must not call admin-only widgets.
- **Command palette** — `src/lib/command-actions.ts`: add `eos_implementer` to `COORD_UP` (and `eos_viewer` where read actions belong) so EOS actions (e.g. "Create Rock") appear; benign if skipped.
- **Getting Started** — `src/lib/getting-started-checklists.ts` + `GettingStartedContent.tsx`: add EOS-role entries (or accept the Educator-checklist fallback as a known cosmetic gap).
- **Landing** — `destinationForSession` in `src/app/(auth)/login/page.tsx` (the interactive-login decider): route EOS roles to `/rocks` via a shared `getLandingPage(role)` helper in `role-permissions.ts`. `src/app/page.tsx` is a server component that today `redirect("/dashboard")` with **no session**; wire `getServerSession` there so bare-domain visits also resolve EOS roles to `/rocks` (or accept that they hit `/dashboard` → the new EOS dashboard branch, which is fine).

## Cameron

Set `role = eos_implementer` (state irrelevant — EOS roles are unscoped). Applied via an idempotent `scripts/set-cameron-eos.ts` (upsert by email) at rollout, or via the role dropdown in user-management (now offering "EOS Implementer"). Ship together — no interim change.

## Security

- Read vs write is enforced by the EOS write APIs' `roles:` arrays: `eos_viewer` is excluded from all of them (stays read-only); `eos_implementer` is added only to EOS writes — neither touches Financials, Services, HR, Marketing, Settings, user management, API keys.
- `eos_implementer` is organisation-wide for EOS data only; it is not in `ADMIN_ROLES`, so admin-gated non-EOS routes (`[...ADMIN_ROLES]`) reject it.
- Priority `1` prevents accidental `minRole` satisfaction elsewhere.

## Testing

- **Scope** (unit): `getCentreScope`/`getServiceScope` return unscoped for both EOS roles → org-wide EOS reads.
- **Dashboard** (component): EOS-role users render the EOS overview, not the admin command-centre; no admin-only query fires; no throw.
- **Nav** (unit): both EOS roles see EOS links (Vision/Rocks/Scorecard/To-Dos/Issues/Meetings/Accountability) and nothing else; `eos_viewer` unchanged elsewhere.
- **API authz** (route): `eos_implementer` accepted on every EOS write route above; `eos_viewer` rejected (403) on all of them but allowed on EOS reads.
- **Landing** (unit): `destinationForSession`/`getLandingPage` → `/rocks` for both EOS roles; unchanged for others.
- **Enum/labels** (unit): `ROLES` includes both; `parseRoleParam("eos_implementer")` valid; RoleBadge/labels resolve.
- **Regression:** every existing role's pages, nav, scope, and dashboard are byte-for-byte unchanged.

## Out of scope

- Per-route API scoping beyond role arrays.
- Trimming individual admin-dashboard widgets (EOS roles get their own dashboard branch instead).
- Migrating `scorecard/seed` or `scorecard/rollup` to EOS roles.

## Deferred cosmetic gaps (graceful fallbacks, noted not fixed)

- **Command palette** (`src/lib/command-actions.ts`): `isCoordUp` gates EOS *and* non-EOS create actions (enrolment, medication, menu, roster). Adding `eos_implementer` to `COORD_UP` would surface non-EOS actions that just bounce off the page guard. The implementer creates rocks/todos/issues from the page buttons (feature-gated, which they have). Left as-is.
- **Getting Started** (`src/lib/getting-started-checklists.ts`): EOS roles fall back to the Educator checklist on `/getting-started` — a non-primary page they don't land on. Functional; inventing EOS onboarding content was out of scope.

## Build/test verification (2026-06-23)

- `next build` → exit 0, "Compiled successfully". All `Record<Role,…>` sites resolved.
- Vitest full run: 0 new failures vs the `origin/main` baseline (23 files / 59 pre-existing failures unchanged), +22 new passing EOS tests.
- Rollout: deploy runs the additive `ALTER TYPE … ADD VALUE 'eos_implementer'` migration; set Cameron via the Settings → Team role dropdown ("EOS Implementer") or `npx tsx scripts/set-user-role.ts <email> eos_implementer`.
