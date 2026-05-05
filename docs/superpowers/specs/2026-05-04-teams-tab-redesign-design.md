# Teams Tab Redesign — Design Spec

**Date:** 2026-05-04
**Author:** Jayden + Claude Opus 4.7 (brainstormed)
**Status:** Draft for review

---

## Background

The current `/team` page is two things mashed together:

1. The **Accountability Chart** — an EOS org-structure visualization (boxes-and-lines, who-reports-to-whom).
2. The **Performance List** — a table of per-person EOS metrics (active rocks, todo completion %, open issues, centres managed).

Neither view is "browse the people who work here." Rows in the Performance List don't even click through to a profile. There's no search, no filtering, no contact info — it's an EOS dashboard, not an employee directory.

Meanwhile, `/staff/[id]` already has the rich profile structure (8 vertical tabs covering employment, personal, leave, timesheet, compliance, documents, contracts) but no list-page entry point. The only ways to land there are deep links and the staff selector inside other features.

This spec covers the redesign that makes `/team` the **employee directory** (modeled on Employment Hero's Employees screen), reworks `/staff/[id]` into a **long-scroll profile** with horizontal section pills, and re-homes the existing Accountability Chart + Performance List to surfaces where they belong.

## Goals

- `/team` becomes a searchable, filterable list of all employees the viewer is allowed to see.
- Every row in `/team` clicks through to the per-employee profile.
- The profile uses an EH-style long-scroll layout with sticky horizontal section pills (Employment records · Pay & compensation · Documents · Performance), each pill anchoring to a card section with its own internal sub-tabs.
- The profile header has a quick-actions column and a snapshot stats panel on the right.
- The Accountability Chart finds a new home accessible to all roles; the Performance List moves to `/leadership`.
- Service-scoping and PII-stripping are enforced server-side, matching the existing roster + incident patterns.
- Phased rollout behind the existing `staffV2Tab` feature flag, no big-bang switch.

## Non-goals (explicitly v2 or out)

- Payslips section pill — Xero is the payroll provider; payslip data model + ingestion is its own brainstorm + spec, not bundled here.
- Asset management section pill — no Asset model exists; deferred.
- AI People Insights / Scorecard right-panel content — separate AI feature.
- Employee Code column / Preferred Name column — `User` model has neither today.
- Payroll Issues tab on the list page — no payroll-issues data model.
- "Find more people like X", "View recruitment profile", "Smarter file management" — recruiting / vague EH features.
- Bulk actions beyond invite (bulk archive, bulk message).
- Privacy mode toggle.
- "Start offboarding" button — no offboarding flow exists yet.

---

## Design

### Section 1 — Architecture & URLs

**URL strategy.** Keep `/staff/[id]` as the profile path. The new `/team` list links every row to it. URLs stay asymmetric on purpose — `/team` is the index, `/staff/[id]` is a single record (same way GitHub uses `/users` and `/<handle>`). No redirects, no aliases.

**Page hierarchy:**

```
/team                                     ← REPLACED (Employees list)
/staff/[id]                               ← REWORKED (long-scroll EH layout)
/leadership                               ← +1 new card (Performance List)
/accountability-chart                     ← NEW (chart, visible to all roles)
```

**Component layout:**

```
src/app/(dashboard)/team/page.tsx              ← thin client wrapper, replaces existing 191-line page
src/components/team/
  EmployeeListView.tsx                          ← top-level list shell
  EmployeeFilters.tsx                           ← search input + filter chips
  EmployeeRow.tsx                               ← single row, clickable
  EmployeeListEmptyState.tsx                    ← zero-results empty state

src/app/(dashboard)/staff/[id]/page.tsx        ← KEPT (server component, expanded data load)
src/components/staff/
  StaffProfileLayout.tsx                        ← NEW — replaces StaffProfileTabs
  StaffProfileHeader.tsx                        ← NEW — avatar + identity + quick actions column
  StaffProfileStatsPanel.tsx                    ← NEW — right-side snapshot
  StaffProfilePills.tsx                         ← NEW — sticky horizontal section nav with scroll-spy
  sections/
    EmploymentRecordsSection.tsx                ← NEW
    PayCompensationSection.tsx                  ← NEW
    DocumentsSection.tsx                        ← NEW
    PerformanceSection.tsx                      ← NEW

src/app/(dashboard)/accountability-chart/page.tsx   ← NEW
src/components/leadership/
  PerformanceListCard.tsx                       ← MOVED from src/components/team/TeamListView.tsx
```

**Existing tab components are reused inside the new sections, not rewritten:**

- `OverviewTab` — content folds into the snapshot panel + scattered across sections; the tab itself is removed.
- `PersonalTab`, `EmploymentTab` → mounted inside `EmploymentRecordsSection` as sub-tabs.
- `LeaveTab`, `TimesheetTab` → mounted inside `PayCompensationSection`.
- `ComplianceTab`, `DocumentsTab`, `ContractsTab` → mounted inside `DocumentsSection`.
- Existing review surface → `PerformanceSection`.

The wrapping changes (vertical-tabs → horizontal-pill-sections); the inner content stays. This keeps the rewrite scoped to layout + new list page.

**API surface:**

| Endpoint | Method | Purpose | Auth | Status |
|----------|--------|---------|------|--------|
| `/api/employees` | GET | New list — paginated, filterable, scoped | session | NEW |
| `/api/employees/[id]/quick-action` | POST | Reset password / Trigger onboarding / Deactivate / Make admin | admin / owner | NEW |
| `/api/team` | GET | EOS metrics for `/leadership` performance card | admin-tier | UNCHANGED (now sole consumer) |
| `/api/staff/[id]` | n/a | Profile uses server component (Prisma direct) | server-side `canAccessProfile` | UNCHANGED |

### Section 2 — The list page (`/team`)

**Layout** (top to bottom):

- `PageHeader` with title "Team" + description + action buttons (Bulk invite, Add Employee — admin-tier only).
- Search bar (full width on mobile, ~50% on desktop) + filter trigger row.
- Filter chips: Status (Active / Pending / Deactivated), Service (multi-select), Role (multi-select).
- Active-filters chip strip (each chip dismissible).
- Table: Name (avatar + full name) · Role · Service · Status · Actions kebab.
- Pagination: page size 50 (max 200), server-side.

**Data fetch — `/api/employees`:**

```
GET /api/employees?
  q=<search>&
  status=active|pending|deactivated&
  s=<serviceId>[,<serviceId>]&         ← short codes; multi-select comma-delimited
  r=<role>[,<role>]&
  page=1&
  pageSize=50&
  sort=name|role|service|status

Response: {
  employees: [
    { id, name, email, avatar, role, service: {id, name}, status, employmentStatus },
    ...
  ],
  total, page, pageSize, totalPages
}
```

URL params use short codes (`s=`, `r=`) over verbose ones (`serviceId=`, `role=`) to keep heavily-filtered URLs ≤ 80 characters even with 11 services × 6 roles selected. The shape is part of the public contract (shareable links) so the codes are locked at spec time, not implementation time.

- Server-side filtering + pagination (don't pull full list and filter client-side).
- Search is name + email substring match, case-insensitive (`ILIKE %q%`). Add an index on `User.email` if not present.
- Filter state is URL-encoded (`?status=active&serviceId=svc-1&role=staff`) so the list is shareable. Multi-select via comma-separated values.
- Sort is single-column at a time, server-validated against a whitelist.
- Search/filter changes debounce ~300 ms before pushing to URL.

**Service-scoping** uses the existing `getCentreScope(session)` helper — same pattern as `/api/incidents/recent` (see PR #71). Marketing role: contact details (`email`, `phone`) stripped from the response payload **server-side**, not just hidden in the client.

**Status pill values:**
- `ACTIVE` (green) — `User.active === true && User.lastLoginAt !== null`
- `PENDING` (amber) — `User.active === true && User.lastLoginAt === null` (invited but not yet logged in)
- `DEACTIVATED` (gray) — `User.active === false`, admin-only visibility

No new schema needed — derives the status from existing `User.active` + `User.lastLoginAt` fields. Confirm `lastLoginAt` exists on `User`; if not, add a non-blocking migration to track it (set on successful credential sign-in).

**Row click-through.** Whole row is a `<Link>` to `/staff/[id]?…` (preserves filter state for Previous/Next nav on the profile). The Actions kebab is its own click target — opens a dropdown with Edit / Reset password / Trigger onboarding / Deactivate (each gated by viewer role).

**Empty states:**
- Zero employees in scope: "No employees yet — invite your first one" + the Add Employee button.
- Zero results from filter combination: "No matches — clear filters?" with a Clear-all button.

**Loading states:** Skeleton table — 8 placeholder rows. Reuses existing `Skeleton` component.

**Mobile responsive (< sm):**
- Search bar collapses but stays visible.
- Filters move into a bottom-sheet behind a "Filters (n)" trigger.
- Table → stacked cards (avatar + name + role + service + status pill).
- Pagination becomes "Load more" rather than numbered pages.

**CSV export** preserved from existing `/team` — adapts to new shape (Name / Email / Role / Service / Status / Active since / Last login). Admin-tier only.

**Add Employee** → opens existing `BulkInviteModal` in single-invite mode. **Bulk invite** → same modal in CSV mode.

### Section 3 — The profile page (`/staff/[id]`)

The biggest visual change. Long-scroll layout with sticky horizontal section pills, modeled on Employment Hero's profile screenshot.

**Top-of-page strip:**

```
[← Back to Team]   [< Previous employee]  [Next employee >]   [Quick link 🔗]
```

Previous/Next cycle within the **filtered list state** persisted on the list. If the admin opened the profile from a "Educators at Mawson Lakes" filter, Next goes to the next Educator at Mawson Lakes, not the next user globally. URL state on the list, read on profile mount.

**Profile header (3 columns, ~280px gutter on the right):**

Left column: avatar + identity block — name, role display name, service name, tenure, ACTIVE badge, email, phone, location, employee ID.

Center: Quick actions column (vertical button list).

Right gutter (~280px): Snapshot stats panel.

**Quick actions in v1:**

| Action | Auth | Wires to |
|--------|------|----------|
| Edit profile | self or admin | existing user-edit dialog |
| Reset password | admin only | existing `/api/auth/admin-reset` |
| Trigger onboarding checklists | admin only | `onboarding-seed.ts` — wrap in idempotency guard before button wires up: `findFirst({ where: { assigneeId: userId, source: "onboarding-seed" } })` short-circuits if any seeded todo already exists. Required, not optional — without this, re-firing the action duplicates 7 todos. |
| Make admin (toggle) | owner only | renders only for owner viewer |
| Deactivate / Reactivate | admin only | flips `User.active`, two-tap-confirm |

**Snapshot stats panel (right gutter)** — five blocks:

1. **Tenure** — computed from `min(User.createdAt, EmploymentContract.startDate)`.
2. **Next shift** — nearest published `RosterShift` where `userId === target && date >= today`. When the user has no upcoming shift, render a muted "No upcoming shift" placeholder; do not collapse the block (preserves panel layout consistency).
3. **Active rocks count** — already in the current `/staff/[id]` data load.
4. **Open todos count** — already in the current data load.
5. **Compliance** — via existing `getCertStatus` helper: ✓ valid / ⚠ expiring (<30 d) / ✗ expired.

**Sticky horizontal pills** (just below header):

```
[ Employment records ] [ Pay & compensation ] [ Documents ] [ Performance ]
       purple                  teal               yellow         orange
```

Pills stick to the top of the scroll viewport once the header scrolls off-screen. Click → smooth-scroll to the section anchor + URL hash. Active pill highlights via scroll-spy on which section is in the viewport.

**Section card bodies (long scroll):**

Each section is its own card with internal sub-tabs (no further long-scroll within a section — sub-tabs swap content):

**§ Employment records** (purple)
- Sub-tabs: Employment details · Personal details · Emergency contacts · View more (overflow: leave, timesheet)
- Reuses `EmploymentTab` + `PersonalTab` content.

**§ Pay & compensation** (teal)
- Sub-tabs: Salary history · Work hours · Leave balances
- Salary history: `EmploymentContract` rows over time, "Add salary" button (admin) — reuses the existing PR #73 contract-issuance flow (no new salary endpoint; "Add salary" launches the existing template-based contract issue modal pre-filled with the user).
- Work hours: from `EmploymentContract.hoursPerWeek` (read-only display).
- Leave balances: existing `LeaveTab` content.
- Wage data is **role-gated server-side** — `member` viewing another member's pay sees a "Pay information is admin-only" placeholder.

**§ Documents** (yellow)
- Sub-tabs: Certifications · Documents · Policies · Induction content · Forms · Contracts
- Certifications: existing `ComplianceTab` content (uses cert-status helper from PR #69).
- Documents: existing `DocumentsTab` content (uploaded files).
- Contracts: existing `ContractsTab` content (issued contracts from PR #73).
- Policies / Induction / Forms: lists of acknowledged policies / completed induction modules / submitted forms — data already exists.

**§ Performance** (orange)
- Sub-tabs: Reviews · 9-Box talent grid · Management notes
- All three already exist in some form; we regroup under one section.

**Mobile responsive (< sm):**
- Header collapses: avatar + name + role only; quick actions become a "⋯" sheet trigger; snapshot panel becomes a horizontal scroll strip below the header.
- Pills become a horizontal scroll bar.
- Sections stack with their sub-tabs as vertical-tabs inside.

### Section 4 — Re-homing the chart and performance list

**Performance List → `/leadership`.**

The performance table (rocks count, todo %, open issues, centres managed) is admin-tier content. Slot it as a new section on `/leadership`, between the Recent Incidents card (PR #71) and the Quarterly Rocks rollup. Component is renamed from `TeamListView.tsx` to `PerformanceListCard.tsx`. Data shape unchanged — still uses `useTeam()` hook against `/api/team`.

**Accountability Chart → new `/accountability-chart` page.**

The chart should remain visible to all roles (it's the EOS canonical "who reports to whom" surface — hiding it behind admin-tier on `/leadership` would regress the EOS philosophy). Mounted as a new dedicated route in the EOS sidebar group, accessible to owner / head_office / admin / marketing / member / staff.

```
src/app/(dashboard)/accountability-chart/page.tsx       ← NEW
src/components/leadership/PerformanceListCard.tsx       ← MOVED + RENAMED
```

The current `OrgChartView.tsx` is moved to either `src/components/accountability-chart/OrgChartView.tsx` or stays in `src/components/team/` if other components reference it.

`/team` page no longer renders either — it's the employee list, full stop.

### Section 5 — APIs, testing, and rollout

**Pure helpers (testable, no DB):**

- `src/lib/employees/format-employee-row.ts` — projects a Prisma `User` + service join into the list-shape DTO. Strips PII for marketing role.
- `src/lib/employees/build-list-where.ts` — builds the Prisma `where` clause from query params (status, serviceId, role, search). Composes with `getCentreScope`.
- `src/lib/staff/snapshot-stats.ts` — computes the right-panel snapshot block (tenure, cert counts, etc.) from already-fetched data.

**Test plan:**

| Layer | Tests |
|-------|-------|
| Helpers | `format-employee-row` (PII stripping per role), `build-list-where` (filter combos, search regex, sort whitelist), `snapshot-stats` (tenure rounding, cert classification edges) — ~15 cases |
| Route `/api/employees` | 401 unauth, 403 deactivated, scoped-list shape per role (admin / member / staff / marketing), pagination boundaries, filter combinations, search behaviour, sort validation, 400 on bad input — ~12 cases |
| Route `/api/employees/[id]/quick-action` | Each action × auth matrix (owner / admin / member / staff / self). Audit-log written. Idempotency on trigger-onboarding. — ~10 cases |
| Component `EmployeeListView` | Empty state, loading, filter-chip removal, pagination, click-through nav. RTL with mocked hook. — ~6 cases |
| Component `StaffProfileLayout` | Sticky pill scroll-spy active state, mobile fallback, quick-actions visibility per viewer role. — ~6 cases |
| `canAccessProfile` | Add a marketing-role case asserting `false` — confirms the server-side guard rejects profile access even though marketing sees the row in the list. — 1 case |
| E2E (Playwright) | Admin opens `/team` → searches → filters → clicks row → profile renders → uses Quick action → returns. ~1 happy-path test added to existing suite. |

Total ~50 new tests. Existing tests for `EmploymentTab`, `PersonalTab`, `LeaveTab`, etc. remain untouched (those components are reused inside the new sections).

**Rollout strategy:**

A new dedicated flag `NEXT_PUBLIC_TEAMS_REDESIGN` exposed via a new `useTeamsRedesignFlag()` hook, modeled on the existing `useStaffV2Flag` pattern. **Do not reuse `useStaffV2Flag`** — that flag is already shipping a 14-page v2 token-cascade rollout (commits 1–43 of staff-dashboard-v2 spec) and its commit-44 flag-removal PR is already pending. Coupling the Teams rewrite to a flag that's about to be retired would conflate "v2 token cascade is live" with "Teams rewrite is live" and force the Phase 8 cleanup to race the v2-flag removal.

Two-phase rollout:

1. **Phase 1 — Build behind the flag.** All work lands on `main` with the new flag off. Old `/team` experience continues; new code is dead unless `NEXT_PUBLIC_TEAMS_REDESIGN=true`.
2. **Phase 2 — Flip on.** Enable the flag for owner/admin first (week 1), then everyone (week 2). Roll back is one env-var change if any issue surfaces.

Old code (`OrgChartView`, `TeamListView`) **stays in place** during Phase 1 — the new code mounts inside a `useTeamsRedesignFlag()` conditional. Once we're stable (1 month post-flip), open a cleanup PR (PR 8) that removes the old code path.

**Phasing — the PRs (in dependency order):**

| PR | Scope | Depends on |
|----|-------|------------|
| 1 | New `/api/employees` endpoint + helpers + tests | none |
| 2 | `EmployeeListView` + `EmployeeFilters` + `EmployeeRow` + `/team` page rewrite (behind flag) | PR 1 |
| 3 | `StaffProfileLayout` + section pills + 4 sections + reuses existing tab components | none (parallel with PR 2) |
| 4 | Quick-action endpoint + UI buttons | PR 3 |
| 5 | Re-home Performance List → `/leadership` | none |
| 6 | New `/accountability-chart` page + nav entry + role-permissions registration (add to `allPages` and every role's `rolePageAccess` entry per the CLAUDE.md "New Feature/Page" checklist) | none |
| 7 | Flip flag (owner/admin first, then all) | PRs 1–6 merged |
| 8 | Cleanup — delete `src/components/team/OrgChartView.tsx`, `src/components/team/TeamListView.tsx`, `src/components/staff/StaffProfileTabs.tsx`, `src/components/staff/tabs/OverviewTab.tsx` (subsumed by the snapshot panel; the other 7 tab files are still imported by the new sections), the `useTeamsRedesignFlag` flag itself, and any conditional renders in `/team`/`/staff/[id]` pages | 1 month after PR 7 |

PRs 1, 3, 5, 6 can land in parallel. PRs 2 and 4 are sequenced. Total estimated effort: 6–8 working days end-to-end.

---

## Auth model summary (Q7)

| Role | List access | Rows shown | Profile access |
|------|-------------|------------|----------------|
| owner / head_office / admin | Full | Every active user, every centre | Anyone |
| member (Director of Service) | Service-scoped | Users at their service | Self + own service |
| staff (Educator) | Service-scoped | Users at their service | Self + own service |
| marketing | Full but limited | All users, contact details (email/phone) stripped | Self only |

Edge cases:
- Deactivated users: hidden by default; Status filter chip flips them on (admin-tier only).
- Pending-invite users: visible only to admin-tier.
- Self-row always visible, even if scoping would otherwise hide it.

---

## Open questions / risks

- **`User.email` index.** Search uses substring match on email; need to confirm index exists or add one. Performance risk on a 200-user table is low, but worth a quick `EXPLAIN` during PR 1.
- **`User.lastLoginAt` field existence.** Spec assumes this column exists (used by Status pill derivation). If not present, PR 1 includes a non-blocking migration and updates the credentials-sign-in handler in `src/lib/auth.ts` to set it on success.
- **Sticky pills scroll-spy.** IntersectionObserver-based scroll-spy can fight with smooth-scroll on click. Implementation must debounce the active-pill updates during click-driven scroll vs user-scroll.
- **Mobile pill overflow.** Four pills + state colour fit on a single mobile row at ~360 px. When the 5th (Payslips) ships, it overflows — pre-plan a horizontal-scroll fallback in PR 3.
- **`canAccessProfile` for marketing.** Today returns `false` for marketing (not in admin / not member at same service). Marketing's list-access shows the row but profile click would 403. Decision: marketing rows in the list are NOT wrapped in `<Link>` — cursor:default, no navigation. Spec enforces both client-side (no link wrap) and server-side (`canAccessProfile` returns false unchanged).

---

## Acceptance criteria

- `/team` is a searchable, filterable employee list. Rows click into `/staff/[id]`.
- Marketing role: contact details stripped server-side; rows non-clickable.
- Service-scoped roles only see rows within their assigned service.
- `/staff/[id]` renders the long-scroll layout with sticky horizontal pills, header, snapshot panel, and 4 section cards.
- Sub-tabs inside each section reuse the existing tab components.
- Quick-action buttons in the profile header work for the 5 actions listed (Edit / Reset password / Trigger onboarding / Make admin / Deactivate).
- `/leadership` has a new Performance List card.
- `/accountability-chart` is a new route accessible to all roles.
- All work behind `NEXT_PUBLIC_TEAMS_REDESIGN` flag; old `/team` view still works while flag is off.
- 50+ new tests pass; existing tests untouched.
- `npx tsc --noEmit`, `npx eslint`, full `vitest run` clean.
