# Sub-project 3a — Staff / People Module Rebuild (Part 1)

**Date**: 2026-04-21
**Status**: Draft
**Parent roadmap**: [`2026-04-20-dashboard-bugfix-roadmap.md`](./2026-04-20-dashboard-bugfix-roadmap.md)
**Predecessors**: Sub-project 1 P0 Bug Batch (merged `dd0a1d9`), Sub-project 2 Hygiene Sweep (merged `2ca8289`)

## Overview

Part 1 of a two-part Staff / People module rebuild. Focuses on the three highest-leverage changes that can ship in a single PR:

1. **Individual staff profile page** (`/staff/[id]`) — 7-tab unified "employee file" in the Employment Hero style
2. **Compliance Expiry Alert System** (Tier 1 backlog priority) — regulatory-risk fix with 30/14/7/0 cadence, in-app + email, heat map UI, cert upload/download/renew
3. **Employment Hero-inspired UX polish** — `/directory` card grid, `/team` action inbox widget, consistent headers on `/leave` + `/timesheets`, self-service cards on `/my-portal`, shared staff components (`<StaffAvatar>`, `<RoleBadge>`, `<CertStatusBadge>`, `<LeaveBalanceCard>`)

Part 2 (**Sub-project 3b**, deferred) handles Staff Rostering & Shift Management — estimated ~1 week on its own, warrants its own PR.

**Branch**: `feat/staff-people-3a-2026-04-21` off `origin/main` at `2ca8289`
**Worktree**: `.worktrees/staff-people-3a`

## Baseline (captured 2026-04-21)

| Metric | Current state | Target |
|---|---|---|
| Tests passing | 1004 | 1004+ (new tests added for each new component/route) |
| `tsc --noEmit` | 0 errors | 0 |
| Individual staff profile page | Does not exist (only API routes at `/api/users/[id]/*`) | `/staff/[id]` with 7 tabs + access control |
| Compliance alert system | Partial: `cert-expiry-alert` (weekly) + `compliance-alerts` (daily 7am) crons exist; `compliance-alerts` sends emails via `complianceAlertEmail` / `complianceAdminSummaryEmail` templates | Single rationalised system: 30/14/7/0 cadence, staff + coordinator CC + admin weekly digest, email + in-app, dedup tracking |
| Compliance matrix API | Exists at `/api/compliance/matrix` with 11 cert types + CertStatus logic | UI (heat map grid) added on `/compliance` page; toggle between list view and matrix view |
| In-app notification model | No generic `UserNotification` model (only `ParentNotification` + `NotificationLog`-for-email-audit) | New `UserNotification` model added for staff-facing in-app notifications |
| Cert file upload | `ComplianceCertificate.fileUrl` + `fileName` fields exist in schema; no dedicated upload UI | Upload/renew flow on cert cards, download button everywhere |
| Shared staff UI components | `src/components/team/PersonCard.tsx` only; no consistent avatar/role/status primitives | 4 shared components used across module |
| `/directory` page | Exists, 10-line page + DirectoryContent component | People card grid with search + filters |
| `/team` action inbox | Does not exist | Widget above accountability chart: "N certs expiring / M leave pending / K timesheets to approve" |
| `/leave` page | 1379 lines | Apply consistent `<PageHeader>` + filter row + mobile responsive; NOT a rebuild |
| `/timesheets` page | 1650 lines | Same polish pattern as `/leave`; NOT a rebuild |
| `/compliance` page | 1111 lines | Add matrix view toggle; keep existing list view |
| `/my-portal` page | 1172 lines | Add "My Certs", "My Leave Balance" cards; link to own profile; NOT a rebuild |

## In scope — stacked commits

One feature branch, one PR, **12 stacked commits** in logical-dependency order. Not strictly small-to-large this time because some features depend on others.

| # | Commit subject | Category | Files (approx.) |
|---|---|---|---|
| 1 | `feat(schema): UserNotification + ComplianceCertificateAlert models + migration` | Schema | 2 (schema + migration) |
| 2 | `feat(components): shared staff UI primitives (StaffAvatar, RoleBadge, CertStatusBadge, LeaveBalanceCard)` | Shared UI | ~8 (4 components + 4 test files) |
| 3 | `feat(api): UserNotification CRUD routes + markAsRead + list` | API | ~4 (routes + tests) |
| 4 | `feat(staff): individual profile page /staff/[id] with 7 tabs + access control` | Feature | ~12 (page + 7 tab components + layout + tests) |
| 5 | `feat(compliance): cert upload/renew/download flow` | Feature | ~5 (new POST /api/compliance/[id]/file; UI on cert cards; Vercel Blob helper reuse) |
| 6 | `feat(compliance): heat map matrix view on /compliance page` | Feature | ~3 (new matrix component; page toggle; matrix API already exists) |
| 7 | `refactor(crons): rationalise compliance-alerts + cert-expiry-alert to single 30/14/7/0 cadence with dedup` | Reliability | ~4 (consolidate crons, add dedup via ComplianceCertificateAlert) |
| 8 | `feat(notifications): in-app notification for cert expiry + leave submitted + timesheet approved` | Feature | ~6 (bell icon, notification popover, wiring at alert trigger points) |
| 9 | `feat(team): Action Required widget above accountability chart` | Feature | ~3 (widget component, integration, tests) |
| 10 | `feat(directory): people card grid with search + filters + access control` | Feature | ~5 (new DirectoryContent, filter, card grid, access rules) |
| 11 | `feat(my-portal): My Certs + My Leave Balance cards + link to profile` | Feature | ~2 (extend MyPortalContent; no full rewrite) |
| 12 | `feat(polish): consistent PageHeader + filter row on /leave + /timesheets + mobile cards` | UX polish | ~4 (scoped changes to existing pages) |

**Ordering rationale**: schema first (unblocks all features); shared components second (reused in 4+ places); API third; then features layered on. The polish commits come last because they have the lowest blast radius.

---

### Commit 1: `feat(schema): UserNotification + ComplianceCertificateAlert models + migration`

**Purpose**: Add schema support for in-app notifications and cert-alert deduplication.

**New models**:

```prisma
/// In-app notification for a staff user. Surfaced via bell icon.
model UserNotification {
  id        String   @id @default(cuid())
  userId    String
  user      User     @relation("UserNotifications", fields: [userId], references: [id], onDelete: Cascade)
  type      String   // "cert_expiring_30d" | "cert_expiring_14d" | "cert_expiring_7d" | "cert_expired" | "leave_submitted" | "leave_approved" | "leave_denied" | "timesheet_submitted" | "timesheet_approved"
  title     String
  body      String
  link      String?  // deep link path, e.g. "/staff/{userId}?tab=compliance"
  read      Boolean  @default(false)
  readAt    DateTime?
  createdAt DateTime @default(now())

  @@index([userId, read, createdAt])
  @@index([userId, createdAt])
}

/// Tracks which compliance alerts have been sent, preventing duplicate emails across cron runs.
model ComplianceCertificateAlert {
  id             String   @id @default(cuid())
  certificateId  String
  certificate    ComplianceCertificate @relation("CertificateAlerts", fields: [certificateId], references: [id], onDelete: Cascade)
  threshold      Int      // 30 | 14 | 7 | 0 — which cadence milestone this alert represents
  sentAt         DateTime @default(now())
  channels       String[] // "email" | "in_app" — both recorded for observability

  @@unique([certificateId, threshold])
  @@index([certificateId])
  @@index([sentAt])
}
```

**User model update**: add `notifications UserNotification[] @relation("UserNotifications")` back-relation.
**ComplianceCertificate model update**: add `alerts ComplianceCertificateAlert[] @relation("CertificateAlerts")` back-relation.

**Migration name**: `20260421_add_user_notification_and_cert_alert_dedup`

**Acceptance**: `npx prisma migrate dev --name add_user_notification_and_cert_alert_dedup` runs clean locally. `npx prisma generate` produces types. `npm test` still passes (0 schema-related TS errors).

---

### Commit 2: `feat(components): shared staff UI primitives`

**Purpose**: Build 4 reusable components used across every surface in the rebuild.

**Components**:

1. **`src/components/staff/StaffAvatar.tsx`**
   - Props: `user: { id, name, avatar? }`, `size: "xs" | "sm" | "md" | "lg"`, `className?`
   - Renders: `<Image>` if `avatar` URL present; otherwise initials with deterministic background colour (hash of userId → HSL)
   - Tailwind size mapping: xs=24px, sm=32px, md=48px, lg=96px

2. **`src/components/staff/RoleBadge.tsx`**
   - Props: `role: Role`, `className?`
   - Renders: Pill with colour per role. Example:
     - owner / head_office: slate-800 bg, white text
     - admin: blue-600 bg, white text
     - marketing: purple-500 bg
     - coordinator: green-600 bg
     - member: emerald-500 bg
     - staff: neutral-500 bg

3. **`src/components/staff/CertStatusBadge.tsx`**
   - Props: `expiryDate: Date | null`, `className?`
   - Logic: computes `{ status, daysLeft }` using same rules as `getCertStatus` in `/api/compliance/matrix/route.ts` (reuse the helper by extracting to `src/lib/cert-status.ts`)
   - Statuses:
     - `missing` (no expiry): gray pill, "Not uploaded"
     - `expired` (<0 days): red pill, "Expired N days ago"
     - `expiring` (<=30 days): amber pill, "Expires in N days"
     - `valid` (>30 days): green pill, "Valid"

4. **`src/components/staff/LeaveBalanceCard.tsx`**
   - Props: `balance: { accrued, taken, remaining }`, `type: "annual" | "personal" | "long_service"`
   - Renders: card with 3 stats (accrued / taken / remaining), coloured progress bar (remaining as % of accrued)

**Tests**: 1 test file per component, covering:
- Avatar renders photo when URL present, initials otherwise
- RoleBadge shows correct colour + label per role
- CertStatusBadge respects day thresholds (boundary tests at 31, 30, 15, 14, 8, 7, 1, 0, -1)
- LeaveBalanceCard renders correct %remaining

**Extract**: `src/lib/cert-status.ts` — helper `getCertStatus(expiryDate)` pulled from `/api/compliance/matrix/route.ts` (used by both the API and the badge).

**Acceptance**: 4 components render in Storybook-style preview files (or in the profile page in commit 4). All tests pass.

---

### Commit 3: `feat(api): UserNotification CRUD routes`

**Purpose**: API surface for in-app notifications.

**Routes**:

- `GET /api/notifications` — list current user's notifications (paginated, `?unread=true` filter)
- `POST /api/notifications/[id]/mark-read` — mark single notification read
- `POST /api/notifications/mark-all-read` — mark all as read
- `GET /api/notifications/unread-count` — count of unread (for the bell badge)

All wrapped in `withApiAuth`, user can only access their own notifications.

**Tests**: auth (401), own-data only (403 if trying to access another user's), happy path, mark-read updates `read` + `readAt`, `mark-all-read` is a batch update.

**Acceptance**: 4 routes, 4 passing API test files. `grep -rn "UserNotification" src/app/api/` shows only these 4 routes (no stray creation — creation happens inside cron + trigger code, not user-facing).

---

### Commit 4: `feat(staff): individual profile page /staff/[id] with 7 tabs + access control`

**Purpose**: The centerpiece of the rebuild — a single unified page for viewing a staff member's data.

**Route structure**:

```
src/app/(dashboard)/staff/[id]/
  layout.tsx           — sticky header with StaffAvatar + name + role + service + edit/back actions
  page.tsx             — reads `?tab=` search param, renders the active tab
  loading.tsx
```

**Tab components** (in `src/components/staff/tabs/`):

1. `OverviewTab.tsx` — hero card (avatar, name, role, service, tenure, active status) + stats strip (active rocks, open todos, leave balance, compliance status, "next shift" placeholder with "Coming soon" label)
2. `PersonalTab.tsx` — emergency contacts, phone, address, DOB, start date
3. `EmploymentTab.tsx` — role, service, contract summary (read-only with "View in Contracts" link to `/contracts/[id]`), start date
4. `LeaveTab.tsx` — balance (accrued/taken/remaining using `<LeaveBalanceCard>`), upcoming approved leave, recent requests, link to `/leave` full view
5. `TimesheetTab.tsx` — current week + last 4 weeks summary, link to `/timesheets` full view
6. `ComplianceTab.tsx` — `StaffQualification` records + `ComplianceCertificate` list with `<CertStatusBadge>`, upload/renew/download actions (per commit 5)
7. `DocumentsTab.tsx` — files owned by this user (use existing Documents auth model; filter by `userId`)

**Access control** (per Q3 approved):

| Role | Directory (list of others) | Own profile | Another staff's profile |
|---|---|---|---|
| staff | name + centre only | all tabs, edit Personal + submit on Leave/Timesheet | access denied (403) OR redirect to directory |
| coordinator | name + centre + role, service-scoped | all tabs (own), read everything at their service | read-only at their service; edit denied |
| admin / head_office / owner | all data | all tabs | all tabs editable |

Implemented via `withApiAuth` role gating on each sub-API endpoint + server-side check in `page.tsx` for profile access.

**Files touched** (approx. 12):
- `src/app/(dashboard)/staff/[id]/layout.tsx`, `page.tsx`, `loading.tsx`
- `src/components/staff/tabs/{Overview,Personal,Employment,Leave,Timesheet,Compliance,Documents}Tab.tsx`
- `src/app/(dashboard)/staff/[id]/__tests__/page.test.tsx` (or colocated)
- `src/lib/role-permissions.ts` (add `/staff/[id]` to `allPages` + role access)

**Acceptance**:
- Visiting `/staff/[id]` as admin shows all 7 tabs
- Visiting as staff user with `id === session.user.id` shows all tabs, only Personal editable
- Visiting as staff user with different id returns 403 (OR redirects — pick based on existing pattern in the codebase)
- URL sync: `?tab=compliance` loads compliance tab directly
- Route added to `role-permissions.ts` per the MEMORY.md checklist

---

### Commit 5: `feat(compliance): cert upload/renew/download flow`

**Purpose**: Staff can download their own certs; admins can upload new certs / renewals for anyone.

**New route**: `POST /api/compliance/[id]/file` — upload a file to Vercel Blob, store URL on the cert record. Handles both "new cert" (when id is a placeholder or sentinel) and "renewal" (updates existing).

Actually — simpler: reuse existing `POST /api/compliance` (create with file) + `PATCH /api/compliance/[id]` (update, accepting new file). Add file handling to both routes.

**UI on cert cards**:
- Download button → links to `fileUrl` (already public per Sub-project 1 bug #5 fix for Vercel Blob defaults)
- Upload button (admin + cert owner): file input → uploads → updates cert record
- Renew button: creates NEW cert record with same type + user + updated expiry; keeps old record for history

**Download access** (per user clarification):
- Staff: own certs only
- Coordinator: certs at their service
- Admin: any cert
Enforced server-side on a new route `GET /api/compliance/[id]/download` which checks access then returns a redirect to the blob URL (avoids exposing raw URL to unauthorized staff).

**Acceptance**:
- As admin, can upload a cert for a staff member; see it on their profile Compliance tab
- As staff, can download own cert via download button
- As staff, attempting to download another staff's cert returns 403
- Renew flow creates a new cert record; old one remains for history

---

### Commit 6: `feat(compliance): heat map matrix view on /compliance page`

**Purpose**: EH-style compliance heat map. Rows = staff, columns = cert types, cells = colored status.

**UI**: on existing `/compliance/page.tsx`, add a toggle at top: "List view" / "Matrix view". Matrix view renders a grid using data from existing `/api/compliance/matrix`.

**Cell colors**:
- Green: valid
- Amber: expiring (<=30 days)
- Red: expired
- Gray: missing

**Click cell** → opens a slide-over panel with cert details + upload/renew/download actions (reuses commit 5 flow).

**Files**:
- `src/components/compliance/ComplianceMatrix.tsx` (new)
- `src/components/compliance/ComplianceMatrixCell.tsx` (cell + tooltip)
- `src/app/(dashboard)/compliance/page.tsx` — add view toggle

**Acceptance**:
- Matrix renders all staff × 11 cert types
- Toggle switches view without losing filter state
- Clicking a cell opens the detail panel

---

### Commit 7: `refactor(crons): rationalise compliance-alerts + cert-expiry-alert to single 30/14/7/0 cadence with dedup`

**Purpose**: Two overlapping crons exist (`compliance-alerts` daily, `cert-expiry-alert` weekly). Consolidate to one cron running at the right cadence with dedup.

**Approach**: keep `compliance-alerts` as the primary (daily is right for catching 30/14/7 transitions). Remove `cert-expiry-alert` OR repurpose it to the admin weekly digest.

**Logic**:
```ts
for each ComplianceCertificate with expiryDate in [-∞, +30d]:
  daysUntil = daysBetween(now, cert.expiryDate)
  threshold = pickThreshold(daysUntil)  // 30 | 14 | 7 | 0
  if threshold === null: skip  // between thresholds
  exists = ComplianceCertificateAlert.findUnique({ certId, threshold })
  if exists: skip  // already sent at this threshold
  send email to cert.user
  cc coordinator (user at service with role === "coordinator")
  create UserNotification for cert.user
  create ComplianceCertificateAlert(certId, threshold, channels: ["email", "in_app"])
```

Admin weekly digest: `cert-expiry-alert` cron (weekly Monday) — aggregates all expiring certs org-wide, sends single email to admins.

**Dedup invariant**: one `ComplianceCertificateAlert` row per `(certificateId, threshold)`. Unique constraint enforces.

**Email templates**: extend existing `complianceAlertEmail` / `complianceAdminSummaryEmail` (keep; adjust body text for new cadence).

**Acceptance**:
- Running the cron twice on the same day produces 0 new alerts on second run (dedup working)
- New cert created 29 days before expiry → next cron run sends 30-day alert + 14/7/0 at right cadence
- Admin digest sends weekly summary, deduped separately from per-staff alerts

---

### Commit 8: `feat(notifications): in-app notification trigger points + bell icon UI`

**Purpose**: Wire up `UserNotification` creation in the right places + expose bell icon in top nav.

**Trigger points**:
- Compliance cron (commit 7) — on each threshold crossing
- Leave request submitted → notify coordinator/admin
- Leave request approved/denied → notify requesting staff
- Timesheet submitted → notify coordinator/admin
- Timesheet approved → notify submitting staff

**UI**:
- `src/components/layout/NotificationBell.tsx` — bell icon in top nav, badge with unread count
- `src/components/layout/NotificationPopover.tsx` — dropdown list of recent notifications, click → navigate to `link` + mark read
- Poll unread count every 60s (or use SWR-style revalidation)

**Files**: ~6 (bell + popover + tests + wiring in 4 trigger sites)

**Acceptance**:
- Create a cert expiring in 30 days → run cron → bell shows "1"
- Click notification → navigates to `/staff/[id]?tab=compliance` + marks read
- Submit a leave request as staff → coordinator sees bell update

---

### Commit 9: `feat(team): Action Required widget above accountability chart`

**Purpose**: Give admins/coordinators a quick inbox of outstanding items.

**Widget content**:
- "{N} certs expiring within 30 days" — links to `/compliance?filter=expiring`
- "{M} leave requests pending approval" — links to `/leave?filter=pending`
- "{K} timesheets awaiting review" — links to `/timesheets?filter=pending`

**Visibility rule**: admin / head_office / owner sees org-wide counts. Coordinator sees counts scoped to their service. Staff sees nothing (widget hidden).

**API**: new `GET /api/team/action-counts` → returns `{ certsExpiring, leavePending, timesheetsPending }` scoped to caller's permissions.

**Files**: `src/components/team/ActionRequiredWidget.tsx`, API route, integration on `/team/page.tsx`, tests.

**Acceptance**:
- Widget visible to admin, shows org-wide counts
- Widget visible to coordinator, counts service-scoped
- Widget hidden for staff role
- Counts update every 60s or on window refocus

---

### Commit 10: `feat(directory): people card grid with search + filters + access control`

**Purpose**: Rebuild `/directory` as an EH-style people browser.

**Current state**: `DirectoryContent.tsx` exists; page is 10 lines. Replace the content component.

**UI**:
- Search bar (fuzzy by name)
- Filters: service, role
- Grid of cards (responsive: 1 column mobile, 2 tablet, 3+ desktop)
- Each card: `<StaffAvatar>`, name, role badge (admin view) or empty (staff view), service name
- Click card → `/staff/[id]` (access-controlled — staff who click a card see limited profile per access rules)

**Access**:
- Staff users see cards with only name + service (no role badge, no email)
- Admins/coordinators see full info
- Clicking a card as staff → redirects to directory with "You don't have permission to view this profile" (or a stripped public profile — decide during impl)

**Files**: `src/app/(dashboard)/directory/DirectoryContent.tsx` (rewrite), tests.

**Acceptance**:
- Grid renders all staff
- Search filters by name (debounced)
- Role filter works (admin view only)
- Service filter works
- Mobile responsive
- Staff view hides role + email

---

### Commit 11: `feat(my-portal): My Certs + My Leave Balance cards + link to profile`

**Purpose**: Minimal additions to existing `/my-portal` page — NOT a rewrite.

**New sections**:
1. "My Certificates" card — list of user's certs with `<CertStatusBadge>` + download button
2. "My Leave Balance" — uses `<LeaveBalanceCard>`
3. "View my full profile" link → `/staff/[userId]`

Skip "My Next Shift" (rostering deferred to 3b).

**Files**: extend `src/app/(dashboard)/my-portal/page.tsx` OR factor into a component (decide during impl — if the page is already 1172 lines, adding 100 more is OK but factoring is cleaner).

**Acceptance**: own certs + leave balance visible on `/my-portal`; profile link works.

---

### Commit 12: `feat(polish): consistent PageHeader + filter row + mobile on /leave + /timesheets`

**Purpose**: Apply the same header pattern across the People module's big existing pages. No logic changes.

**Scope**:
- `/leave/page.tsx` (1379 lines) — wrap existing content with consistent `<PageHeader>` if not already; add sticky filter row at top; ensure table has mobile-card fallback
- `/timesheets/page.tsx` (1650 lines) — same
- `/directory` (commit 10 already) — consistent with these

**Out of scope for this commit**: logic changes, bug fixes, schema changes. Purely UX alignment.

**Rule**: if a section is >200 lines contiguous in a single JSX block, this commit DOES NOT restructure it. Only the top-of-page chrome is aligned.

**Acceptance**:
- `/leave` and `/timesheets` have consistent header + filter pattern
- Mobile views acceptable (tables collapse to cards or horizontal scroll gracefully)
- No test failures

---

## Testing & verification plan

**Per commit**:
```bash
npm test -- --run     # tests still pass
npx tsc --noEmit      # 0 errors
npm run lint          # no new problems
```

**Per-commit acceptance criteria listed in each commit section above.**

**End-of-PR sweep**:
- All 12 commits landed in order
- All acceptance criteria met
- CI green
- Manual smoke: create a cert expiring in 30d, run compliance-alerts cron, verify email sent + in-app notification created + bell updates
- Manual smoke: visit `/staff/[id]` as admin, staff (own), staff (other) — verify access matrix
- Manual smoke: `/compliance` matrix view renders
- Manual smoke: `/directory` grid renders

## Out of scope

- **Staff Rostering & Shift Management** — deferred to Sub-project 3b
- **Recruitment pipeline** — Sub-project 6
- **Employment contracts detail/editing** — Sub-project 6 (profile shows read-only summary only)
- **Onboarding flow / LMS / Offboarding** — Sub-project 8
- **Pulse admin visibility** — Sub-project 9
- **Parent portal changes** — orthogonal
- **`/leave` or `/timesheets` internal logic rewrites** — polish only
- **Any schema changes beyond `UserNotification` + `ComplianceCertificateAlert`** — contained to what the features need
- **Push notifications** (PWA / Teams) — in-app bell + email only; push deferred

## Open questions — resolve during implementation

1. **Q-A1**: New cert upload vs. renew — single UI flow or separate? Decision: single flow with radio toggle "Replace current" vs "New version (keep history)". Implementation decides.
2. **Q-A2**: `GET /api/compliance/[id]/download` — redirect to blob URL (302) or proxy-stream the file? Redirect is simpler; proxy hides URL. Default to redirect.
3. **Q-A3**: If `/staff/[id]` accessed by staff user for another person, return 403 or redirect to `/directory` with toast? Match existing pattern; check a similar page first.
4. **Q-A4**: Coordinator "service-scoped" access — derive service from `User.serviceId` of the coordinator, OR lookup via a relation? Check existing coordinator role definition.
5. **Q-A5**: `UserNotification.type` — enum or free-form string? Start with free-form string (matches `ParentNotification.type`); can tighten to Prisma enum later if value set stabilises.
6. **Q-A6**: When a user has multiple coordinators (multi-service case), who gets the CC on compliance alerts? Default to all. If performance becomes an issue, switch to "primary service coordinator" (requires schema signal — defer until problem manifests).
7. **Q-A7**: Bell icon polling interval — 60s is a guess. Measure actual user patterns post-ship and tune.

## Acceptance criteria — sub-project done when

- [ ] All 12 commits landed on `feat/staff-people-3a-2026-04-21` in prescribed order
- [ ] Each commit's individual Acceptance section met
- [ ] `npm test`, `tsc --noEmit` (=0), `npm run lint` all clean
- [ ] CI green
- [ ] Manual smoke tests pass (compliance alert end-to-end; profile access matrix; heat map; directory grid)
- [ ] Prisma migration applied locally + runs cleanly in CI
- [ ] `/staff/[id]` added to `src/lib/role-permissions.ts` per MEMORY.md checklist
- [ ] PR body describes before/after with per-commit summary

## Risks & mitigations

- **Big PR risk** (~12 commits, 50+ files): mitigated by stacked-commit bisect history + detailed per-commit Acceptance.
- **Schema migration in prod**: `UserNotification` and `ComplianceCertificateAlert` are additive-only; no column drops; safe to deploy ahead of code.
- **Existing compliance-alerts cron refactor** (commit 7): could disrupt already-working alerts. Mitigation: run the new code in a dry-run mode first (log intended alerts without sending), verify count/shape matches expectations, then enable send.
- **Big existing pages** (`/leave` 1379 lines, `/timesheets` 1650 lines, `/compliance` 1111 lines, `/my-portal` 1172 lines): commits 6, 11, 12 apply targeted surgical additions — explicitly NOT rewrites. If a page becomes unreadable, factor out the new sections as components but do not refactor unrelated existing code.
- **Access control regressions**: /staff/[id] access matrix is complex. Mitigation: per-role test case + manual smoke as 3 distinct roles before merge.

## Rollback

- Schema migration (commit 1) is additive-only — safe to keep even if feature is rolled back.
- Each commit is `git revert`-safe standalone.
- Compliance cron refactor (commit 7): if it over-alerts, revert that specific commit and the two old crons resume behaviour.

---

*Document conventions per `docs/superpowers/specs/2026-04-20-dashboard-bugfix-roadmap.md`. Implementation plan will live at `docs/superpowers/plans/2026-04-21-staff-people-module-3a-plan.md`.*
