# Service Staff Assignments — Design

**Date**: 2026-05-14
**Status**: Draft
**Branch**: `claude/modest-lovelace-282a5d` (worktree)

## Overview

Add UI + APIs to manage which staff are assigned to which service, in two surfaces:

1. **Staff tab inside each service** (`/services/[id]?tab=staff`) — list, add, edit, remove assignments scoped to that service.
2. **"Assign to Service" action in the global Teams page** (`/team`) — kebab action per staff row that opens a modal to bulk-add memberships across services.

Backed by a new `UserServiceMembership` table that represents *additional* service memberships on top of the existing `User.serviceId` (which continues to model the staff member's home / primary service). This is the "hybrid" approach: zero changes to existing one-to-many queries, multi-service educators unlocked via the new join.

## Baseline (captured 2026-05-14)

| Concern | Current state | Target |
|---|---|---|
| Staff → service relation | `User.serviceId String?` (one-to-many) | Hybrid: `User.serviceId` stays as primary + new `UserServiceMembership` for additional |
| "Who works at service X?" query | `useServiceMembers(serviceId)` → `/api/users?serviceId=X&active=true` | New `useServiceStaff(serviceId)` → `/api/services/[id]/staff` returning primary + additional unified |
| Service detail tabs | 7 groups in `tabGroups` array with keys: `today`, `overview`, `daily`, `program`, `eos`, `compliance`, `finance` | 8 groups — new key `staff` inserted between `overview` (index 1) and `daily` (index 2) |
| Teams page row actions | Existing `EmployeeRow.tsx` with kebab menu | Add "Assign to service…" menu item |
| Server APIs | `/api/services/[id]/staff` does not exist; `/api/services/[id]/staff-certificates` exists for compliance only (different responsibility — fine to coexist; the new staff route operates on `UserServiceMembership` rows, the certs route operates on `ComplianceCertificate` rows) | New CRUD routes under `/api/services/[id]/staff` + `/api/users/[id]/service-memberships` |
| Permissions enforcement | Service-level role gating via `useServiceMembers` in roster/EOS | Same model — admin-tier + Director of own service can mutate; everyone else read-only |

## Data model

Additive migration. No backfill required (existing `User.serviceId` values keep working as primary). Migration path: `prisma/migrations/20260514000000_user_service_membership/`.

```prisma
enum ServiceAccessLevel {
  view_only
  contributor
  admin
}

enum ServiceMembershipStatus {
  active
  inactive
}

model UserServiceMembership {
  id            String                  @id @default(cuid())
  userId        String
  user          User                    @relation("UserMemberships", fields: [userId], references: [id], onDelete: Cascade)
  serviceId     String
  service       Service                 @relation("ServiceMemberships", fields: [serviceId], references: [id], onDelete: Cascade)
  roleAtService String                  // free-text label, 1-50 chars
  accessLevel   ServiceAccessLevel      @default(contributor)
  startDate     DateTime                @db.Date
  endDate       DateTime?               @db.Date
  status        ServiceMembershipStatus @default(active)
  createdAt     DateTime                @default(now())
  updatedAt     DateTime                @updatedAt

  @@unique([userId, serviceId])
  @@index([serviceId, status])
  @@index([userId, status])
}
```

Adds inverse relations:

```prisma
model User {
  // ... existing fields
  memberships UserServiceMembership[] @relation("UserMemberships")
}

model Service {
  // ... existing fields
  memberships UserServiceMembership[] @relation("ServiceMemberships")
}
```

**Why free-text `roleAtService` and not an enum?** Operational titles ("Educator", "Room Leader", "Director", "Cook", "Cleaner", "Casual Float") vary across centres and don't map cleanly to the global `Role` enum. Free text avoids a forced taxonomy in v1. If/when the OSHC roster spec stabilises these titles, the column gets a constrained CHECK or a lookup table — that's a future PR.

**Why a `status` enum instead of hard delete?** Soft remove preserves audit history (who was assigned at this service when X happened). The DELETE endpoint flips `status` to `inactive`; subsequent re-add is a separate POST that creates a new row (or, if the row exists in inactive state, flips it back to active and updates fields).

**Why no enforcement of `accessLevel`?** Marked out of scope by the user. The field captures intent now so a later PR can layer policy on top without a second migration.

## Behaviour rules

### Primary vs additional
- A user shows up in a service's Staff tab if either: `User.serviceId === thisServiceId` (primary), OR there is an active `UserServiceMembership` row for `(userId, thisServiceId)`.
- The two paths are mutually exclusive in practice: a user is either primary OR additional at a given service, never both. (Enforced server-side on POST — see below.)
- Primary rows render with a **Primary** badge. Their `roleAtService` and `accessLevel` are derived from the user's global role (not editable here):

| Global `Role` | Derived `roleAtService` | Derived `accessLevel` |
|---|---|---|
| `owner` | "Owner" | `admin` |
| `head_office` | "State Manager" | `admin` |
| `admin` | "Admin" | `admin` |
| `member` | "Director of Service" | `admin` |
| `marketing` | "Marketing" | `contributor` |
| `staff` | "Educator" | `contributor` |

  Derived `startDate` falls back to `User.createdAt` cast to a date.

- **Admin-tier primary edge case.** `owner` / `head_office` / `admin` users typically have `User.serviceId === null` (they oversee the network, not a single centre). If one of them does have `serviceId` set — e.g., an `admin` who's also operationally the Director of one centre — they DO appear as a Primary row at that service with their derived label ("Admin"). This is intentional: the Staff tab shows who's actually attached to the service, regardless of seniority. Their Primary row is still read-only here.

- Edit and remove controls are **disabled** on primary rows in this UI. Tooltip: *"Manage primary service on the user's profile."* The "Transfer/Move primary" flow is a separate feature, out of scope here.

### Add / Edit / Remove on additional rows
- **Add** (service Staff tab → "Add Staff Member"): pick from users who are NOT already primary at this service AND do NOT already have an active membership row here. Submit creates a `UserServiceMembership` row.
- **Edit** (pencil on row): update `roleAtService`, `accessLevel`, `startDate`, `endDate`, `status`. PATCH on the membership id.
- **Remove** (trash on row → confirm dialog): DELETE flips `status` to `inactive` and sets `endDate` to today if null. The row stays in the table greyed out only if the table view explicitly opts in to inactive rows; default view filters to `status = active`.

### Teams page modal
- Kebab → "Assign to service…" on a staff row opens `AssignToServiceDialog`.
- On open, fires `GET /api/users/[userId]/service-memberships` to know the user's primary service and existing memberships.
- Modal body: scrollable list of all services. Each row has a checkbox + service name + (if assigned) a greyed-out "Already assigned — Primary" or "Already assigned — Additional" pill. Disabled rows cannot be unchecked.
- For each newly-checked row, inline `roleAtService` text input + `accessLevel` select reveal. `startDate` defaults to today, not exposed per-row in v1 (keeps the modal usable).
- "Save Assignments" calls bulk `POST /api/users/[userId]/service-memberships` with the selected items. Server-side: skip items where user is already primary/active-member (idempotent).
- Modal only ADDS new memberships. Edit / remove happens in the service's Staff tab. This keeps modal scope tight.

### Self-assignment + Director-of-own-service
- `member` users can manage staff only at their own primary service (`session.user.serviceId === serviceId`). Cross-service mutations from a Director are 403.
- `admin`, `head_office`, `owner` can manage staff at any service.
- `marketing`, `staff` cannot mutate, only read.

## API surface

All wrapped in `withApiAuth` with session + role gating. Zod validation on every write. Rate-limited at the default (60 req/min per user per endpoint).

### Service-scoped CRUD

```
GET /api/services/[id]/staff
```
Response shape:
```ts
{
  members: Array<{
    userId: string;
    name: string;
    email: string;
    avatar: string | null;
    role: Role;                // global role
    isPrimary: boolean;
    isActive: boolean;         // from User.active
    membership: {
      id: string | null;       // null when primary-only
      roleAtService: string;
      accessLevel: "view_only" | "contributor" | "admin";
      startDate: string;       // ISO date
      endDate: string | null;
      status: "active" | "inactive";
    };
  }>;
}
```
- Returns all primary users + all active membership users at the service.
- For primary rows, `membership.id` is `null` and the other fields are derived (see table above).
- **Read access**: any authenticated session role. This is intentionally permissive (matches the existing `useServiceMembers` precedent, which is used for cross-service assignee pickers in EOS). Reads do not leak anything beyond name / role / assignment metadata that is already visible elsewhere in the dashboard. Write gating happens on POST/PATCH/DELETE.

```
POST /api/services/[id]/staff
```
Body (Zod):
```ts
{
  userId: string;
  roleAtService: string;       // 1–50 chars
  accessLevel: ServiceAccessLevel;
  startDate: string;           // ISO date
}
```
- 404 if user not found or inactive.
- 409 if user is primary at this service or has **active** membership here.
- **Inactive-row reactivation**: if a `(userId, serviceId)` row exists with `status = inactive` (left over from a prior soft-remove), the POST handler upserts it back to `status = active`, applies the new `roleAtService` / `accessLevel` / `startDate`, and clears `endDate`. The response indicates `{ reactivated: true }` so the client can show a "re-added" toast variant. This keeps the `@@unique([userId, serviceId])` constraint honest and matches the "soft delete preserves history" intent.
- **Race condition handling**: if two concurrent POSTs collide on the unique constraint (Prisma `P2002`), the handler maps the second to a 409 — never a 500. Test coverage explicitly includes this case.
- 200 returns the new (or reactivated) membership row.
- Allowed: `owner`, `head_office`, `admin`, OR `member` whose `session.user.serviceId === serviceId`.

```
PATCH /api/services/[id]/staff/[membershipId]
```
Body (all optional):
```ts
{
  roleAtService?: string;
  accessLevel?: ServiceAccessLevel;
  startDate?: string;
  endDate?: string | null;
  status?: ServiceMembershipStatus;
}
```
- 404 if membership not found or not at this service.
- 200 returns updated row.
- Same allowed-roles rule as POST.

```
DELETE /api/services/[id]/staff/[membershipId]
```
- Sets `status = inactive`, sets `endDate = today` if null. Soft delete.
- 200 returns `{ ok: true }`.
- Same allowed-roles rule.

### User-scoped (for Teams modal)

```
GET /api/users/[userId]/service-memberships
```
Response:
```ts
{
  primaryServiceId: string | null;
  memberships: Array<{
    id: string;
    serviceId: string;
    serviceName: string;     // for display
    roleAtService: string;
    accessLevel: ServiceAccessLevel;
    startDate: string;
    endDate: string | null;
    status: ServiceMembershipStatus;
  }>;
}
```
- Returns only `status === active` memberships in v1.
- Allowed: `owner`, `head_office`, `admin` (any user); OR any session role viewing **their own** user record (`userId === session.user.id`). `member` viewing another user's memberships is 403 — the modal that consumes this endpoint is admin-only anyway, so this is a defensive default.

```
POST /api/users/[userId]/service-memberships
```
Body:
```ts
{
  items: Array<{
    serviceId: string;
    roleAtService: string;
    accessLevel: ServiceAccessLevel;
    startDate: string;       // ISO date
  }>;
}
```
- Bulk-create memberships.
- For each item: skip if user is already primary at that service or has active membership there (idempotent — no error, just `skipped: true` per item in response).
- Inactive-row reactivation applies per-item, same as single POST.
- Race-condition resilience: each item is processed in its own try/catch; if Prisma returns `P2002` (unique violation from a concurrent write), the item lands in `skipped` with `reason: "already_assigned"` — never a 500.
- Returns `{ created: [...], skipped: [...] }`.
- Allowed: `owner`, `head_office`, `admin` only (cross-user bulk assignment is admin-tier).

## UI

### Service detail — Staff tab

**Location**: insert new tab group between Overview (group #2) and Daily Ops (group #3) in `src/app/(dashboard)/services/[id]/page.tsx` tabGroups array.

```ts
{
  key: "staff",
  label: "Staff",
  icon: Users,
  subTabs: [{ key: "staff", label: "Staff" }],
}
```

URL: `?tab=staff&sub=staff`.

**Component**: `src/components/services/ServiceStaffTab.tsx`.

**Layout**:
- Header row: page-internal title + count chip · search input (filters by name/role) · "Add Staff Member" button (top-right, primary action — gated on permissions).
- Table with sortable columns: Name · Role at service · Access · Start date · Status · (row actions).
- Empty state: friendly message + "Add the first staff member" CTA (gated).
- Rows: primary rows show a "Primary" badge next to the name; their action cell is empty (no edit/remove icons).

**Hook**: `src/hooks/useServiceStaff.ts`.
- `useServiceStaff(serviceId)` — `retry: 2`, `staleTime: 30_000`.
- `useAddServiceStaff(serviceId)` — mutation with `onError` destructive toast.
- `useUpdateServiceStaff(serviceId)` — same.
- `useRemoveServiceStaff(serviceId)` — same.

**Dialogs**:
- `AddServiceStaffDialog` — `Combobox` of un-assigned users (server-filtered or client-filtered against the existing roster), `roleAtService` text input, `accessLevel` select, `startDate` date input (defaults today). Submit + cancel.
- `EditServiceStaffDialog` — same fields prefilled, with `endDate` + `status` exposed.
- Remove flow uses the existing `ConfirmDialog` pattern.

### Teams page — Assign to service

**Location**: `src/components/team/EmployeeRow.tsx`. Add a new item to the existing kebab menu, gated to `owner | head_office | admin`.

**Component**: `src/components/team/AssignToServiceDialog.tsx`.

**Behaviour**:
- Open → fires `GET /api/users/[userId]/service-memberships` and a list-services query in parallel. The list-services query reuses whatever hook the codebase already exposes for "all services" data (search for an existing `useServices()` / `useServicesList()` first; if none, create a thin `useAllServices()` hook backed by an existing `/api/services` GET endpoint).
- Renders scrollable list of all services (sorted alphabetically). Each row: checkbox · service name · status pill if already assigned.
- Already-assigned rows are checked + disabled with a pill: "Primary" or "Additional".
- For each newly-checked row, an inline `roleAtService` text input + `accessLevel` select reveal below the row. `startDate` is not surfaced per-row in v1 (defaulted server-side to today).
- "Save assignments" button bottom-right (disabled when zero new checks, or when any new-check row has empty `roleAtService`).
- On save: bulk POST → success toast with count → refetch any open service-staff queries via React Query invalidation.

**Reuse / patterns**:
- Existing `Dialog` component from `src/components/ui/Dialog.tsx`.
- Toast: `toast({ description, variant })` from existing utility.
- Combobox: existing patterns from EOS modals (e.g., assignee picker in `useServiceMembers`).

## Permissions

| Capability | `owner` | `head_office` | `admin` | `member` (own service) | `member` (other service) | `marketing` | `staff` |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| View Staff tab | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Add / edit / remove (Staff tab) | ✓ | ✓ | ✓ | ✓ | — | — | — |
| Open Teams "Assign to service" modal | ✓ | ✓ | ✓ | — | — | — | — |
| Bulk POST `/api/users/[id]/service-memberships` | ✓ | ✓ | ✓ | — | — | — | — |

UI gating ↔ server gating must match. UI gating alone is never trusted (matches existing CLAUDE.md standards).

## Testing

| Test type | Coverage |
|---|---|
| Unit | `deriveMembershipDefaults(user)` — for each `Role` value, returns correct `{ roleAtService, accessLevel, startDate }` derived from user. |
| Unit | `useServiceStaff` merge logic — given mocked primary users + memberships, returns single unified `members` array with correct `isPrimary` flags. |
| Route | `GET /api/services/[id]/staff` — 200 includes both primary + active memberships; inactive memberships excluded; auth 401. |
| Route | `POST /api/services/[id]/staff` — 200 happy path; 400 Zod fail; 404 user not found; 409 already primary; 409 already active member; 200 with `reactivated: true` when an inactive `(userId, serviceId)` row exists; 409 (not 500) on simulated `P2002` race; 403 from Director of another service; 403 from staff/marketing. |
| Route | `PATCH /api/services/[id]/staff/[membershipId]` — 200 partial update; 404 not found; 404 wrong service; 403 from other-service Director. |
| Route | `DELETE /api/services/[id]/staff/[membershipId]` — 200 soft delete sets `status=inactive` + `endDate`; 403 same rules. |
| Route | `GET /api/users/[id]/service-memberships` — 200 returns primaryServiceId + active memberships; 401 auth; 403 from non-admin viewing other user. |
| Route | `POST /api/users/[id]/service-memberships` — 200 bulk create with `{ created, skipped }`; idempotency on already-primary / already-active; inactive-row reactivation per item; simulated `P2002` race landing in `skipped` (never 500); 403 from non-admin. |
| E2E (Playwright) | Admin opens service Staff tab → adds an unassigned staff → sees them in the list → edits role → removes (soft) → row disappears from default view. |

Lift in the existing test count of ≈3014. New: 1 unit + 1 hook + 5 route files + 1 E2E ≈ 25–35 new tests, all passing before the PR is opened. Test helpers reused from `src/__tests__/helpers/`.

## Migration plan

1. Create migration `20260514000000_user_service_membership` with the new model + enums + inverse relations.
2. Apply via `npx prisma migrate dev` locally; verify with `npx prisma studio`.
3. Production: deploys via existing `migrate deploy` step on push to main. Additive, no downtime risk.
4. No data backfill — existing `User.serviceId` rows remain authoritative as "primary".

## Out of scope (explicit)

- Creating new staff members / user accounts.
- Editing the user's global profile, including changing `User.serviceId` ("Transfer/Move primary" flow).
- Enforcement of `accessLevel` against any feature (purely metadata in this PR).
- Email or push notifications on assignment.
- Per-service role taxonomy / lookup table (free text in v1).
- Surfacing inactive memberships in the default Staff tab view (table filters to `status = active`; toggle for inactive is a future PR).
- Showing additional-service membership info on staff profile pages (`/staff/[id]`) — they should be added in a follow-up so the profile mirrors the new model, but it's not blocking this feature.

## Acceptance criteria (mirrors the user's spec)

- [ ] Staff tab appears in every service view alongside existing tabs.
- [ ] Staff tab lists all staff assigned to the service (primary + additional, primary badged).
- [ ] Admin / Director-of-own-service can add an existing system user via the modal.
- [ ] Admin / Director-of-own-service can edit additional-row assignment details (role, access, dates, status).
- [ ] Admin / Director-of-own-service can soft-remove an additional-row staff member with confirmation.
- [ ] Re-adding a previously-removed staff member reactivates their inactive membership row (no duplicate row created).
- [ ] Teams kebab menu has an "Assign to service" action visible to admin-tier users.
- [ ] Assign modal pre-checks + disables services where the user is already primary or active member.
- [ ] Assign modal supports bulk-add across multiple services in one save.
- [ ] Empty state, loading state, error toasts handled on both surfaces.
- [ ] All changes persist via the new APIs; React Query invalidation keeps the UI fresh.
- [ ] Build passes (`npm run build`), `npm test` passes, lint clean, no `console.*` in production code.
