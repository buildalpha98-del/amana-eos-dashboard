# Staff / People Module Rebuild (Part 1) — Implementation Plan

> **For agentic workers:** REQUIRED: Use `superpowers:subagent-driven-development` (if subagents available) or `superpowers:executing-plans` to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship 12 stacked commits that add a `/staff/[id]` unified profile page, a rationalised Compliance Expiry Alert System (30/14/7/0 cadence, email + in-app), and Employment Hero-inspired UX polish across the People section — without breaking 1004 tests.

**Architecture:** One feature branch (`feat/staff-people-3a-2026-04-21`) off local `main` HEAD (which has the reviewer-approved spec + plan docs on top of `origin/main` at `2ca8289`). Commits stacked in dependency order: schema → shared components → API → profile page → cert flow → heat map → cron consolidation → notifications → widget → directory → my-portal → polish. Each commit independently revert-safe. Standard merge (not squash) to preserve bisect history.

**Tech Stack:** Next.js 16, TypeScript, Prisma 5.22, Vitest, Tailwind. Existing conventions established in Sub-project 2: `withApiAuth` / `withApiHandler` / `parseJsonBody` / `ApiError` / `acquireCronLock` / `logger` / `ADMIN_ROLES` / `parseRole` / `isAdminRole` / `toast` from `@/hooks/useToast`.

**Parent spec:** [`docs/superpowers/specs/2026-04-21-staff-people-module-3a-design.md`](../specs/2026-04-21-staff-people-module-3a-design.md)

---

## File Structure Overview

| Commit | Files created | Files modified |
|---|---|---|
| 1 Schema | `src/lib/notification-types.ts`, `prisma/migrations/<ts>_add_user_notification_and_cert_alert_dedup/migration.sql` | `prisma/schema.prisma` |
| 2 Shared components | `src/components/staff/StaffAvatar.tsx`, `RoleBadge.tsx`, `CertStatusBadge.tsx`, `LeaveBalanceCard.tsx`, `src/lib/cert-status.ts`, 4 test files | `src/app/api/compliance/matrix/route.ts` (import `getCertStatus` from `cert-status.ts`) |
| 3 Notification API | `src/app/api/notifications/route.ts`, `[id]/mark-read/route.ts`, `mark-all-read/route.ts`, `unread-count/route.ts`, 4 test files | (none) |
| 4 Profile page | `src/app/(dashboard)/staff/[id]/{layout,page,loading}.tsx`, `src/components/staff/tabs/{Overview,Personal,Employment,Leave,Timesheet,Compliance,Documents}Tab.tsx`, tests | `src/lib/role-permissions.ts` (add `/staff/[id]` + access rules) |
| 5 Cert upload flow | `src/app/api/compliance/[id]/download/route.ts`, UI action bar component | `src/app/api/compliance/route.ts` (accept multipart), `[id]/route.ts` (accept file on PATCH), `src/app/api/users/[id]/avatar/route.ts` (widen auth) |
| 6 Heat map | `src/components/compliance/ComplianceMatrix.tsx`, `ComplianceMatrixCell.tsx` | `src/app/(dashboard)/compliance/page.tsx` (view toggle) |
| 7 Cron consolidation | (no new files) | `src/app/api/cron/compliance-alerts/route.ts` (dedup + 30/14/7/0), `cert-expiry-alert/route.ts` (repurpose to admin digest), `src/lib/cert-expiry.ts` (helper refactor) |
| 8 Bell UI + non-compliance triggers | `src/components/layout/NotificationBell.tsx`, `NotificationPopover.tsx`, trigger wiring | `src/app/api/leave/*`, `src/app/api/timesheets/*` (add notification creation on state transitions) |
| 9 Action widget | `src/components/team/ActionRequiredWidget.tsx`, `src/app/api/team/action-counts/route.ts` | `src/app/(dashboard)/team/page.tsx` |
| 10 Directory | `src/components/directory/StaffGrid.tsx`, `StaffCard.tsx`, `DirectoryFilters.tsx` | `src/app/(dashboard)/directory/DirectoryContent.tsx` (rewrite), `src/app/api/team/route.ts` (add service/role filters) |
| 11 My Portal | (none) | `src/app/(dashboard)/my-portal/page.tsx` (add 2 cards + profile link) |
| 12 Polish | (none) | `src/app/(dashboard)/leave/page.tsx`, `timesheets/page.tsx` (PageHeader + filter row + mobile card fallback) |

No new Prisma models beyond `UserNotification` + `ComplianceCertificateAlert`. No other schema changes.

---

## Chunk 1: Setup & Baseline

### Task 1.1: Sync main and create worktree branch

- [ ] **Step 1: Fetch latest origin and confirm state**

Run:
```bash
git fetch origin
git log origin/main --oneline -1
```
Expected: origin/main is at `2ca8289` (Sub-project 2 merge) or later. If later, verify no breaking changes were introduced that would affect this plan (e.g., the `User` or `ComplianceCertificate` model fields changing).

- [ ] **Step 2: Confirm local main is clean and ahead of origin with docs-only commits**

Run:
```bash
git status
git log origin/main..main --oneline
```
Expected: status clean (or .env.save / launch.json dirty, which is pre-existing); local main is ahead of origin by 2 docs commits (spec + plan).

- [ ] **Step 3: Create the worktree off local main HEAD**

Run: `git worktree add -b feat/staff-people-3a-2026-04-21 .worktrees/staff-people-3a main`
Expected: new worktree at `.worktrees/staff-people-3a/` on new branch `feat/staff-people-3a-2026-04-21` tracking local `main` HEAD. The feature branch inherits the docs commits so spec + plan ship with the implementation in one PR.

- [ ] **Step 4: Switch into the worktree**

`cd .worktrees/staff-people-3a` — all remaining steps from here.

- [ ] **Step 5: Install dependencies + regenerate Prisma client**

Run:
```bash
npm ci
npx prisma generate
```
Expected: `npm ci` installs cleanly; `prisma generate` prints `✔ Generated Prisma Client`.

### Task 1.2: Capture baseline metrics

- [ ] **Step 1: Test + tsc + lint baseline**

```bash
npm test -- --run 2>&1 | tail -5
npx tsc --noEmit 2>&1 | grep -c "error TS"
npm run lint 2>&1 | tail -3
```
Expected: 1004 passing, 0 tsc errors, 1228/331/897 lint baseline.

Record to `/tmp/3a-baseline.txt`. Any deviation from 1004 / 0 / 1228 blocks the start.

No git commits in Chunk 1.

---

## Chunk 2: Commit 1 — Schema + notification-types constants

### Task 2.1: Add new models to schema

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Locate insertion points**

Run: `grep -n "^model ComplianceCertificate\|^model User " prisma/schema.prisma`
Expected: two lines. User near line 421, ComplianceCertificate near line 2373.

- [ ] **Step 2: Add `UserNotification` model at end of file (or in a logical group — staff-related models are around line 2700-2900)**

Append near the other notification models (search for `model NotificationLog` and insert just before/after):

```prisma
/// In-app notification for a staff user. Surfaced via bell icon.
model UserNotification {
  id        String    @id @default(cuid())
  userId    String
  user      User      @relation("UserNotifications", fields: [userId], references: [id], onDelete: Cascade)
  type      String    // see src/lib/notification-types.ts for known values
  title     String
  body      String
  link      String?   // deep link path, e.g. "/staff/{userId}?tab=compliance"
  read      Boolean   @default(false)
  readAt    DateTime?
  createdAt DateTime  @default(now())

  @@index([userId, read, createdAt])
  @@index([userId, createdAt])
}
```

- [ ] **Step 3: Add `ComplianceCertificateAlert` model near ComplianceCertificate**

Insert just after the `ComplianceCertificate` model block:

```prisma
/// Dedup tracking for compliance expiry alerts. One row per (cert, threshold).
/// Ensures the cron doesn't send duplicate emails on re-runs or retries.
model ComplianceCertificateAlert {
  id            String                @id @default(cuid())
  certificateId String
  certificate   ComplianceCertificate @relation("CertificateAlerts", fields: [certificateId], references: [id], onDelete: Cascade)
  threshold     Int                   // 30 | 14 | 7 | 0 — which cadence milestone
  sentAt        DateTime              @default(now())
  channels      String[]              // "email" | "in_app"

  @@unique([certificateId, threshold])
  @@index([certificateId])
  @@index([sentAt])
}
```

- [ ] **Step 4: Add back-relations on existing models**

In the `User` model (around line 421), add to the relations section:
```prisma
  notifications UserNotification[] @relation("UserNotifications")
```

In the `ComplianceCertificate` model, add:
```prisma
  alerts        ComplianceCertificateAlert[] @relation("CertificateAlerts")
```

- [ ] **Step 5: Format schema**

Run: `npx prisma format`
Expected: schema is reformatted (alignment of field types). Commit both the logical changes and formatting.

### Task 2.2: Create migration

- [ ] **Step 1: Generate migration**

Run: `npx prisma migrate dev --name add_user_notification_and_cert_alert_dedup`
Expected: prompts to apply; say yes. Creates `prisma/migrations/<timestamp>_add_user_notification_and_cert_alert_dedup/migration.sql`. Regenerates Prisma client.

If migration fails due to a connection issue, fall back to: `npx prisma migrate dev --name add_user_notification_and_cert_alert_dedup --skip-seed --create-only` (creates the migration file without applying). Then apply later in CI.

- [ ] **Step 2: Spot-check migration SQL**

Open the generated `migration.sql`. Expected to contain `CREATE TABLE "UserNotification"`, `CREATE TABLE "ComplianceCertificateAlert"`, the unique index on (`certificateId`, `threshold`), and foreign keys with `ON DELETE CASCADE`. If anything looks off, investigate before committing.

### Task 2.3: Create notification-types constants

**Files:**
- Create: `src/lib/notification-types.ts`

- [ ] **Step 1: Write the constants file**

```ts
/**
 * All known UserNotification.type string literals. Import from here
 * instead of hand-typing strings at creation sites to prevent drift
 * between notification creators and the bell UI.
 */
export const NOTIFICATION_TYPES = {
  CERT_EXPIRING_30D: "cert_expiring_30d",
  CERT_EXPIRING_14D: "cert_expiring_14d",
  CERT_EXPIRING_7D: "cert_expiring_7d",
  CERT_EXPIRED: "cert_expired",
  LEAVE_SUBMITTED: "leave_submitted",
  LEAVE_APPROVED: "leave_approved",
  LEAVE_DENIED: "leave_denied",
  TIMESHEET_SUBMITTED: "timesheet_submitted",
  TIMESHEET_APPROVED: "timesheet_approved",
} as const;

export type NotificationType = typeof NOTIFICATION_TYPES[keyof typeof NOTIFICATION_TYPES];
```

### Task 2.4: Verify + commit

- [ ] **Step 1: Run verification gate**

```bash
npx prisma generate
npm test -- --run 2>&1 | tail -5
npx tsc --noEmit 2>&1 | grep -c "error TS"
```
Expected: prisma generates cleanly; tests still 1004 passing; tsc 0.

- [ ] **Step 2: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/ src/lib/notification-types.ts
git commit -m "$(cat <<'EOF'
feat(schema): UserNotification + ComplianceCertificateAlert + notification-types constants

Adds two new models:
- UserNotification: in-app staff-facing notifications (bell icon)
- ComplianceCertificateAlert: dedup tracking for compliance expiry
  alerts (unique on certId + threshold)

Plus a shared constants file src/lib/notification-types.ts to prevent
string drift between notification creators and the bell UI.

Back-relations added on User (notifications[]) and
ComplianceCertificate (alerts[]).

Additive schema only — no column drops, no type changes. Safe to
deploy ahead of code that uses it.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Chunk 3: Commit 2 — Shared staff UI primitives

### Task 3.1: Extract cert-status helper

**Files:**
- Create: `src/lib/cert-status.ts`
- Modify: `src/app/api/compliance/matrix/route.ts`

- [ ] **Step 1: Read existing getCertStatus from matrix route**

Run: `sed -n '15,45p' src/app/api/compliance/matrix/route.ts`
Expected: see `CertStatus` type and `getCertStatus` function.

- [ ] **Step 2: Create `src/lib/cert-status.ts` with the extracted helper**

```ts
export type CertStatus = "valid" | "expiring" | "expired" | "missing";

export interface CertStatusResult {
  status: CertStatus;
  daysLeft: number | null;
}

/**
 * Compute the status of a compliance certificate based on its expiry date.
 *
 * - missing: no expiry date recorded
 * - expired: expiry is in the past
 * - expiring: expiry within 30 days
 * - valid: expiry more than 30 days out
 */
export function getCertStatus(expiryDate: Date | null): CertStatusResult {
  if (!expiryDate) {
    return { status: "missing", daysLeft: null };
  }

  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const expiry = new Date(expiryDate);
  expiry.setHours(0, 0, 0, 0);

  const msPerDay = 24 * 60 * 60 * 1000;
  const daysLeft = Math.floor((expiry.getTime() - now.getTime()) / msPerDay);

  if (daysLeft < 0) return { status: "expired", daysLeft };
  if (daysLeft <= 30) return { status: "expiring", daysLeft };
  return { status: "valid", daysLeft };
}
```

- [ ] **Step 3: Update matrix route to import from the new helper**

In `src/app/api/compliance/matrix/route.ts`, remove the inline `CertStatus` type + `getCertStatus` function and replace with:

```ts
import { getCertStatus, type CertStatus } from "@/lib/cert-status";
```

### Task 3.2: StaffAvatar component

**Files:**
- Create: `src/components/staff/StaffAvatar.tsx`
- Create: `src/__tests__/components/staff/StaffAvatar.test.tsx`

- [ ] **Step 1: Write failing test**

```tsx
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { StaffAvatar } from "@/components/staff/StaffAvatar";

describe("StaffAvatar", () => {
  it("renders photo when avatar URL present", () => {
    const { container } = render(
      <StaffAvatar user={{ id: "u1", name: "Jane Doe", avatar: "/avatars/u1.jpg" }} size="md" />,
    );
    const img = container.querySelector("img");
    expect(img).not.toBeNull();
    expect(img?.getAttribute("src")).toContain("/avatars/u1.jpg");
    expect(img?.getAttribute("alt")).toBe("Jane Doe");
  });

  it("renders initials when avatar URL absent", () => {
    const { container } = render(
      <StaffAvatar user={{ id: "u1", name: "Jane Doe", avatar: null }} size="md" />,
    );
    expect(container.textContent).toContain("JD");
    expect(container.querySelector("img")).toBeNull();
  });

  it("renders single initial when name is one word", () => {
    const { container } = render(
      <StaffAvatar user={{ id: "u1", name: "Jane", avatar: null }} size="sm" />,
    );
    expect(container.textContent?.trim()).toBe("J");
  });

  it("applies size classes", () => {
    const { container: xs } = render(
      <StaffAvatar user={{ id: "u1", name: "J", avatar: null }} size="xs" />,
    );
    expect(xs.firstChild).toHaveClass("h-6", "w-6");

    const { container: lg } = render(
      <StaffAvatar user={{ id: "u1", name: "J", avatar: null }} size="lg" />,
    );
    expect(lg.firstChild).toHaveClass("h-24", "w-24");
  });
});
```

- [ ] **Step 2: Run test, confirm it fails**

Run: `npx vitest run src/__tests__/components/staff/StaffAvatar.test.tsx`
Expected: FAIL — StaffAvatar not defined.

- [ ] **Step 3: Implement StaffAvatar**

```tsx
import Image from "next/image";
import { cn } from "@/lib/utils";

interface StaffAvatarProps {
  user: { id: string; name: string; avatar?: string | null };
  size?: "xs" | "sm" | "md" | "lg";
  className?: string;
}

const SIZE_CLASSES = {
  xs: "h-6 w-6 text-[10px]",
  sm: "h-8 w-8 text-xs",
  md: "h-12 w-12 text-sm",
  lg: "h-24 w-24 text-xl",
} as const;

const SIZE_PX = { xs: 24, sm: 32, md: 48, lg: 96 } as const;

function hashToHue(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 360;
  return h;
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0]?.[0]?.toUpperCase() ?? "?";
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function StaffAvatar({ user, size = "md", className }: StaffAvatarProps) {
  const px = SIZE_PX[size];
  if (user.avatar) {
    return (
      <Image
        src={user.avatar}
        alt={user.name}
        width={px}
        height={px}
        className={cn("rounded-full object-cover", SIZE_CLASSES[size], className)}
      />
    );
  }
  const hue = hashToHue(user.id);
  return (
    <div
      aria-label={user.name}
      className={cn(
        "rounded-full flex items-center justify-center font-medium text-white select-none",
        SIZE_CLASSES[size],
        className,
      )}
      style={{ backgroundColor: `hsl(${hue} 65% 45%)` }}
    >
      {initialsOf(user.name)}
    </div>
  );
}
```

- [ ] **Step 4: Run test, confirm passes**

Run: `npx vitest run src/__tests__/components/staff/StaffAvatar.test.tsx`
Expected: all 4 tests pass.

### Task 3.3: RoleBadge component

**Files:**
- Create: `src/components/staff/RoleBadge.tsx`
- Create: `src/__tests__/components/staff/RoleBadge.test.tsx`

- [ ] **Step 1: Write failing test**

```tsx
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { RoleBadge } from "@/components/staff/RoleBadge";
import { Role } from "@prisma/client";

describe("RoleBadge", () => {
  it("renders role label", () => {
    const { container } = render(<RoleBadge role={Role.admin} />);
    expect(container.textContent).toContain("Admin");
  });

  it("applies distinct classes per role", () => {
    const { container: a } = render(<RoleBadge role={Role.owner} />);
    const { container: b } = render(<RoleBadge role={Role.staff} />);
    expect(a.firstChild?.className).not.toBe(b.firstChild?.className);
  });
});
```

- [ ] **Step 2: Implement**

```tsx
import { Role } from "@prisma/client";
import { cn } from "@/lib/utils";

const ROLE_STYLES: Record<Role, { label: string; className: string }> = {
  owner: { label: "Owner", className: "bg-slate-900 text-white" },
  head_office: { label: "Head Office", className: "bg-slate-700 text-white" },
  admin: { label: "Admin", className: "bg-blue-600 text-white" },
  marketing: { label: "Marketing", className: "bg-purple-500 text-white" },
  coordinator: { label: "Coordinator", className: "bg-green-600 text-white" },
  member: { label: "Member", className: "bg-emerald-500 text-white" },
  staff: { label: "Staff", className: "bg-neutral-500 text-white" },
};

export function RoleBadge({ role, className }: { role: Role; className?: string }) {
  const style = ROLE_STYLES[role];
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium",
        style.className,
        className,
      )}
    >
      {style.label}
    </span>
  );
}
```

- [ ] **Step 3: Run tests pass**

### Task 3.4: CertStatusBadge component

**Files:**
- Create: `src/components/staff/CertStatusBadge.tsx`
- Create: `src/__tests__/components/staff/CertStatusBadge.test.tsx`

- [ ] **Step 1: Write test (boundary-heavy — this is where bugs hide)**

```tsx
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { CertStatusBadge } from "@/components/staff/CertStatusBadge";

function daysFromNow(n: number): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + n);
  return d;
}

describe("CertStatusBadge", () => {
  it("shows 'Not uploaded' for null", () => {
    const { container } = render(<CertStatusBadge expiryDate={null} />);
    expect(container.textContent).toContain("Not uploaded");
  });

  it.each([
    [-10, /Expired/],
    [-1, /Expired/],
    [0, /Expires.*0|today/i],
    [1, /Expires in 1/],
    [7, /Expires in 7/],
    [14, /Expires in 14/],
    [30, /Expires in 30/],
    [31, /Valid/],
    [365, /Valid/],
  ])("days=%d → matches %s", (days, pattern) => {
    const { container } = render(<CertStatusBadge expiryDate={daysFromNow(days)} />);
    expect(container.textContent ?? "").toMatch(pattern);
  });
});
```

- [ ] **Step 2: Implement using `getCertStatus` from cert-status.ts**

```tsx
import { getCertStatus } from "@/lib/cert-status";
import { cn } from "@/lib/utils";

const STATUS_STYLES = {
  valid: "bg-green-100 text-green-800 border-green-200",
  expiring: "bg-amber-100 text-amber-800 border-amber-200",
  expired: "bg-red-100 text-red-800 border-red-200",
  missing: "bg-gray-100 text-gray-600 border-gray-200",
} as const;

export function CertStatusBadge({
  expiryDate,
  className,
}: { expiryDate: Date | null; className?: string }) {
  const { status, daysLeft } = getCertStatus(expiryDate);
  let label: string;
  if (status === "missing") label = "Not uploaded";
  else if (status === "expired") label = `Expired ${Math.abs(daysLeft!)} days ago`;
  else if (status === "expiring") {
    label = daysLeft === 0 ? "Expires today" : `Expires in ${daysLeft} days`;
  } else label = "Valid";

  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded border text-xs font-medium",
        STATUS_STYLES[status],
        className,
      )}
    >
      {label}
    </span>
  );
}
```

- [ ] **Step 3: Tests pass** — all 10 cases including boundary checks at 30, 31, 0, -1.

### Task 3.5: LeaveBalanceCard component

**Files:**
- Create: `src/components/staff/LeaveBalanceCard.tsx`
- Create: `src/__tests__/components/staff/LeaveBalanceCard.test.tsx`

- [ ] **Step 1: Write test**

```tsx
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { LeaveBalanceCard } from "@/components/staff/LeaveBalanceCard";

describe("LeaveBalanceCard", () => {
  it("renders accrued, taken, remaining", () => {
    const { container } = render(
      <LeaveBalanceCard balance={{ accrued: 20, taken: 5, remaining: 15 }} type="annual" />,
    );
    expect(container.textContent).toContain("20");
    expect(container.textContent).toContain("5");
    expect(container.textContent).toContain("15");
    expect(container.textContent).toMatch(/annual/i);
  });

  it("handles zero accrued without divide-by-zero", () => {
    const { container } = render(
      <LeaveBalanceCard balance={{ accrued: 0, taken: 0, remaining: 0 }} type="personal" />,
    );
    // Should render without throwing and without "NaN%"
    expect(container.textContent ?? "").not.toContain("NaN");
  });
});
```

- [ ] **Step 2: Implement**

```tsx
import { cn } from "@/lib/utils";

interface LeaveBalanceCardProps {
  balance: { accrued: number; taken: number; remaining: number };
  type: "annual" | "personal" | "long_service";
  className?: string;
}

const TYPE_LABELS = { annual: "Annual leave", personal: "Personal leave", long_service: "Long service" };

export function LeaveBalanceCard({ balance, type, className }: LeaveBalanceCardProps) {
  const pct = balance.accrued > 0 ? Math.min(100, (balance.remaining / balance.accrued) * 100) : 0;
  return (
    <div className={cn("border rounded-lg p-4 bg-white", className)}>
      <div className="text-sm font-medium text-gray-900">{TYPE_LABELS[type]}</div>
      <div className="grid grid-cols-3 gap-2 my-3 text-center">
        <div>
          <div className="text-2xl font-semibold">{balance.accrued}</div>
          <div className="text-xs text-gray-500">Accrued</div>
        </div>
        <div>
          <div className="text-2xl font-semibold">{balance.taken}</div>
          <div className="text-xs text-gray-500">Taken</div>
        </div>
        <div>
          <div className="text-2xl font-semibold text-green-700">{balance.remaining}</div>
          <div className="text-xs text-gray-500">Remaining</div>
        </div>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className="h-full bg-green-500 transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Tests pass**

### Task 3.6: Verify + commit

- [ ] **Step 1: Full verification gate**

```bash
npm test -- --run 2>&1 | tail -5    # expect 1008+ tests (1004 baseline + 4 new suites)
npx tsc --noEmit 2>&1 | grep -c "error TS"   # 0
npm run lint 2>&1 | tail -3
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/cert-status.ts src/components/staff/ src/__tests__/components/staff/ src/app/api/compliance/matrix/route.ts
git commit -m "$(cat <<'EOF'
feat(components): shared staff UI primitives

Add 4 reusable staff components used across the People module:
- StaffAvatar: photo or deterministic-color initials, 4 sizes
- RoleBadge: colored pill per Role enum value
- CertStatusBadge: valid/expiring/expired/missing, uses shared helper
- LeaveBalanceCard: accrued/taken/remaining with progress bar

Extracts getCertStatus to src/lib/cert-status.ts (reused by badge + matrix route).

Each component has boundary-tested unit tests (15+ cases across 4 suites).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Chunk 4: Commit 3 — Notification API routes

### Task 4.1: List notifications route

**Files:**
- Create: `src/app/api/notifications/route.ts`
- Create: `src/__tests__/api/notifications.test.ts`

- [ ] **Step 1: Write test (auth + happy path + unread filter)**

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { GET } from "@/app/api/notifications/route";
import { createRequest } from "@/__tests__/helpers/request";
import { mockSession, mockNoSession } from "@/__tests__/helpers/auth-mock";
import { prisma, _clearUserActiveCache } from "@/__tests__/helpers/prisma-mock";

describe("GET /api/notifications", () => {
  beforeEach(() => {
    _clearUserActiveCache();
    vi.clearAllMocks();
  });

  it("401 without session", async () => {
    mockNoSession();
    const res = await GET(createRequest("GET", "/api/notifications"));
    expect(res.status).toBe(401);
  });

  it("returns current user's notifications", async () => {
    mockSession({ id: "u1", role: "staff" });
    prisma.user.findUnique.mockResolvedValue({ id: "u1", active: true, role: "staff" });
    prisma.userNotification.findMany.mockResolvedValue([
      { id: "n1", userId: "u1", type: "cert_expiring_30d", title: "Test", body: "x", read: false, link: null, readAt: null, createdAt: new Date() },
    ]);
    const res = await GET(createRequest("GET", "/api/notifications"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.notifications).toHaveLength(1);
  });

  it("filters by unread when ?unread=true", async () => {
    mockSession({ id: "u1", role: "staff" });
    prisma.user.findUnique.mockResolvedValue({ id: "u1", active: true, role: "staff" });
    prisma.userNotification.findMany.mockResolvedValue([]);
    await GET(createRequest("GET", "/api/notifications?unread=true"));
    expect(prisma.userNotification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "u1", read: false } }),
    );
  });
});
```

- [ ] **Step 2: Implement**

```ts
import { NextResponse } from "next/server";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";

export const GET = withApiAuth(async (req, session) => {
  const { searchParams } = new URL(req.url);
  const unread = searchParams.get("unread") === "true";

  const notifications = await prisma.userNotification.findMany({
    where: { userId: session!.user.id, ...(unread ? { read: false } : {}) },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return NextResponse.json({ notifications });
});
```

- [ ] **Step 3: Tests pass**

### Task 4.2: mark-read + mark-all-read + unread-count routes

**Files:**
- Create: `src/app/api/notifications/[id]/mark-read/route.ts`
- Create: `src/app/api/notifications/mark-all-read/route.ts`
- Create: `src/app/api/notifications/unread-count/route.ts`
- Extend: `src/__tests__/api/notifications.test.ts`

- [ ] **Step 1: Write tests for all three**

```ts
// mark-read — own notification only; sets read=true + readAt
// mark-all-read — batch update for session user
// unread-count — returns { count: N }
// plus 403 tests for attempting to mark another user's notification
```

(Full test snippet elided for brevity — subagent should include auth, happy path, and 403 for cross-user access.)

- [ ] **Step 2: Implement mark-read (POST /api/notifications/[id]/mark-read)**

```ts
import { NextResponse } from "next/server";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-error";

export const POST = withApiAuth(async (_req, session, context) => {
  const { id } = await context!.params!;
  const notif = await prisma.userNotification.findUnique({ where: { id } });
  if (!notif) throw ApiError.notFound("Notification not found");
  if (notif.userId !== session!.user.id) throw ApiError.forbidden();

  const updated = await prisma.userNotification.update({
    where: { id },
    data: { read: true, readAt: new Date() },
  });
  return NextResponse.json({ notification: updated });
});
```

- [ ] **Step 3: Implement mark-all-read (POST /api/notifications/mark-all-read)**

```ts
import { NextResponse } from "next/server";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";

export const POST = withApiAuth(async (_req, session) => {
  const result = await prisma.userNotification.updateMany({
    where: { userId: session!.user.id, read: false },
    data: { read: true, readAt: new Date() },
  });
  return NextResponse.json({ updated: result.count });
});
```

- [ ] **Step 4: Implement unread-count (GET /api/notifications/unread-count)**

```ts
import { NextResponse } from "next/server";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";

export const GET = withApiAuth(async (_req, session) => {
  const count = await prisma.userNotification.count({
    where: { userId: session!.user.id, read: false },
  });
  return NextResponse.json({ count });
});
```

### Task 4.3: Verify + commit

- [ ] **Step 1: Run tests for the 4 routes**

Expect ~8-10 test cases total. All pass.

- [ ] **Step 2: Full gate** — tests pass, tsc 0, lint clean.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/notifications/ src/__tests__/api/notifications.test.ts
git commit -m "feat(api): UserNotification CRUD routes

Four endpoints for the bell icon UI:
- GET /api/notifications (list, with ?unread=true filter)
- POST /api/notifications/[id]/mark-read (single)
- POST /api/notifications/mark-all-read (batch)
- GET /api/notifications/unread-count (for bell badge)

All wrapped in withApiAuth; user can only access own notifications
(403 on cross-user access attempts).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Chunk 5: Commit 4 — /staff/[id] profile page

### Task 5.1: Create route skeleton + add to role-permissions

**Files:**
- Create: `src/app/(dashboard)/staff/[id]/layout.tsx`
- Create: `src/app/(dashboard)/staff/[id]/page.tsx`
- Create: `src/app/(dashboard)/staff/[id]/loading.tsx`
- Modify: `src/lib/role-permissions.ts` (add `/staff/[id]` to `allPages` and per-role access)

- [ ] **Step 1: Add route to role-permissions**

Read `src/lib/role-permissions.ts`. Find the `allPages` constant; append `"/staff/[id]"`. Then find `rolePageAccess` — for each role that should see this route, ensure it's present:
- admin, owner, head_office: auto-included via allPages spread (confirm by reading the file — they get everything)
- coordinator: add `"/staff/[id]"` to their list
- member: add (they can view own profile + others per community rule)
- marketing: add
- staff: add

Reference MEMORY.md note: "when adding ANY new page or nav item, you MUST also add the route to `allPages` + every role that should see it in `rolePageAccess`."

- [ ] **Step 2: Server-side access check helper**

In `src/app/(dashboard)/staff/[id]/page.tsx`, before rendering, the page must verify the viewer can access this profile. Create an internal helper:

```ts
// At top of page.tsx
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { parseRole, isAdminRole } from "@/lib/role-permissions";
import { prisma } from "@/lib/prisma";
import { notFound, redirect } from "next/navigation";

async function canAccessProfile(viewerId: string, viewerRole: string | null, targetUser: { id: string; serviceId: string | null }): Promise<boolean> {
  if (viewerId === targetUser.id) return true; // own profile
  if (isAdminRole(viewerRole ?? "")) return true; // admin sees all
  if (viewerRole === "coordinator") {
    const viewer = await prisma.user.findUnique({ where: { id: viewerId }, select: { serviceId: true } });
    return viewer?.serviceId === targetUser.serviceId;
  }
  return false; // staff/member/marketing see only own
}
```

- [ ] **Step 3: Implement page.tsx**

```tsx
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { StaffProfileTabs } from "@/components/staff/StaffProfileTabs";
// (canAccessProfile helper as above)

export default async function StaffProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const { tab = "overview" } = await searchParams;
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) notFound();

  const user = await prisma.user.findUnique({
    where: { id },
    include: { service: true },
  });
  if (!user) notFound();

  const allowed = await canAccessProfile(session.user.id, session.user.role ?? null, user);
  if (!allowed) {
    return (
      <div className="p-6">
        <div className="max-w-md mx-auto text-center">
          <h1 className="text-lg font-semibold">Access denied</h1>
          <p className="text-sm text-gray-600 mt-2">You don't have permission to view this profile.</p>
        </div>
      </div>
    );
  }

  return <StaffProfileTabs user={user} session={session} activeTab={tab} />;
}
```

- [ ] **Step 4: Implement layout.tsx + loading.tsx** (sticky header with StaffAvatar + name + role badge; loading skeleton)

### Task 5.2: Build the 7 tabs (one per task)

**For each tab**, create:
1. Component file under `src/components/staff/tabs/<Name>Tab.tsx`
2. Test file under `src/__tests__/components/staff/tabs/<Name>Tab.test.tsx`

Pattern per tab: query data server-side (preferred) or via a hook; render with shared components from Chunk 3; editable fields guarded by access check.

- [ ] **Step 1: OverviewTab**

Hero card (StaffAvatar lg + name + RoleBadge + service + tenure + active status) + stats strip:
- Active rocks count (query `prisma.rock.count({ where: { ownerId: user.id } })`)
- Open todos count
- Current leave balance (accrued/remaining from LeaveBalance record)
- Compliance status (worst-case from user's cert list)
- Next shift placeholder: `<div class="text-xs text-gray-400">Coming soon</div>`

- [ ] **Step 2: PersonalTab**

Render emergency contacts, phone, address, DOB, start date. If `isSelf || isAdmin`, render as form with edit; otherwise read-only.

- [ ] **Step 3: EmploymentTab**

Admin-only edit. Show role, service, start date, contract summary (find latest `EmploymentContract` for user, display read-only card with fields + "View in Contracts" link).

- [ ] **Step 4: LeaveTab**

`<LeaveBalanceCard>` for annual, personal, long_service. Recent 5 requests table. "Request leave" button → opens leave request form (reuse existing `/leave` page form component if exported, else link to `/leave?userId=...`).

- [ ] **Step 5: TimesheetTab**

Current week timesheet summary + last 4 weeks. Link to `/timesheets?userId=...` for full view.

- [ ] **Step 6: ComplianceTab**

List of StaffQualification + ComplianceCertificate records. Each row: cert type + `<CertStatusBadge>` + download button + (admin) upload/renew actions. Commit 5 adds the upload/renew UI.

- [ ] **Step 7: DocumentsTab**

List user's documents (filter existing documents by `userId`). Reuse existing Documents component or inline a simpler list.

### Task 5.3: Tests

- [ ] **Step 1: Access control tests**

For each role × (own profile, other profile, admin-needs), verify:
- Own → full access
- Other → 403-style message (for staff/member/marketing)
- Admin → full access
- Coordinator → access iff same service

Sample:
```ts
describe("StaffProfilePage access control", () => {
  it("staff viewing another staff profile shows access denied", async () => {
    mockSession({ id: "u2", role: "staff" });
    prisma.user.findUnique.mockResolvedValue({ id: "u1", name: "Other", serviceId: "s1" });
    // render page
    // expect "Access denied"
  });
  // etc.
});
```

- [ ] **Step 2: Tab rendering tests**

Each tab test: given mock user + session, verify fields render + edit button present (or not) per role.

### Task 5.4: Verify + commit

- [ ] **Step 1: Full gate**

```bash
npm test -- --run 2>&1 | tail -10
npx tsc --noEmit 2>&1 | grep -c "error TS"
npm run lint 2>&1 | tail -3
```

- [ ] **Step 2: Manual smoke**

Start dev server. As admin, visit `/staff/<someone>?tab=compliance` — verify page loads. As staff user viewing own `/staff/<self>` — verify Personal tab editable. As staff user viewing other → verify Access denied.

- [ ] **Step 3: Commit**

```bash
git add src/app/\(dashboard\)/staff/ src/components/staff/ src/__tests__/components/staff/ src/lib/role-permissions.ts
git commit -m "feat(staff): individual profile page /staff/[id] with 7 tabs + access control

New unified employee-file style page covering Overview, Personal,
Employment, Leave, Timesheet, Compliance, Documents tabs. URL-synced
active tab via ?tab=X. Access rules per spec:
- Self: all tabs, edit Personal + submit on Leave/Timesheet
- Admin/head_office/owner: full access to all profiles
- Coordinator: read-only access to staff at own service
- Staff/member/marketing viewing another profile: 403 with inline
  access-denied page

Route added to role-permissions.ts allPages + per-role access lists
per MEMORY.md checklist.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Chunk 6: Commit 5 — Cert upload/renew/download flow

### Task 6.1: Extend POST /api/compliance to accept multipart + file

- [ ] **Step 1: Read current POST handler**

`cat src/app/api/compliance/route.ts` — note the existing Zod schema and Prisma call.

- [ ] **Step 2: Add multipart handling**

Modify the POST handler to detect `Content-Type: multipart/form-data`. If multipart, parse with `formData()`, extract file + JSON fields. Use `@/lib/storage`'s `uploadFile()` helper (matches existing avatar-upload pattern). If JSON, keep existing path.

Pseudocode:
```ts
const contentType = req.headers.get("content-type") ?? "";
let data: CreateCertInput;
let fileUrl: string | undefined;
let fileName: string | undefined;

if (contentType.includes("multipart/form-data")) {
  const form = await req.formData();
  data = createCertSchema.parse(JSON.parse(form.get("data") as string));
  const file = form.get("file") as File | null;
  if (file) {
    const uploaded = await uploadFile(file, `compliance/${data.userId ?? "service"}`);
    fileUrl = uploaded.url;
    fileName = file.name;
  }
} else {
  data = createCertSchema.parse(await parseJsonBody(req));
}

const cert = await prisma.complianceCertificate.create({
  data: { ...data, fileUrl, fileName },
});
```

### Task 6.2: Extend PATCH /api/compliance/[id] similarly

- [ ] **Step 1: Same multipart handling**

PATCH handler accepts either JSON (partial update) or multipart (updates + optional new file). If new file uploaded, replace `fileUrl` + `fileName` (call `deleteFile()` on old URL first to avoid orphan blobs).

### Task 6.3: New download route with access check

**Files:**
- Create: `src/app/api/compliance/[id]/download/route.ts`

- [ ] **Step 1: Implement**

```ts
import { NextResponse } from "next/server";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-error";
import { isAdminRole } from "@/lib/role-permissions";

export const GET = withApiAuth(async (_req, session, context) => {
  const { id } = await context!.params!;
  const cert = await prisma.complianceCertificate.findUnique({
    where: { id },
    select: { id: true, userId: true, serviceId: true, fileUrl: true },
  });
  if (!cert) throw ApiError.notFound("Certificate not found");
  if (!cert.fileUrl) throw ApiError.notFound("No file attached");

  const viewerId = session!.user.id;
  const viewerRole = session!.user.role ?? "";
  const isOwn = cert.userId === viewerId;
  const isAdmin = isAdminRole(viewerRole);

  let canAccess = isOwn || isAdmin;
  if (!canAccess && viewerRole === "coordinator") {
    const viewer = await prisma.user.findUnique({ where: { id: viewerId }, select: { serviceId: true } });
    canAccess = viewer?.serviceId === cert.serviceId;
  }

  if (!canAccess) throw ApiError.forbidden();

  return NextResponse.redirect(cert.fileUrl);
});
```

- [ ] **Step 2: Tests**

Test each role's access path: own cert 302, admin 302, coordinator same-service 302, coordinator other-service 403, staff other cert 403.

### Task 6.4: Widen avatar route auth

- [ ] **Step 1: Edit `src/app/api/users/[id]/avatar/route.ts`**

Current: allows `["owner", "admin"]` + self. Widen to `[...ADMIN_ROLES, "coordinator"]` + self, with coordinator scoped to same-service users.

### Task 6.5: UI action bar component

**Files:**
- Create: `src/components/compliance/CertActionBar.tsx`

- [ ] **Step 1: Build the action bar**

Renders on each cert card (profile Compliance tab + heat map cell detail panel):
- Download button (always, if fileUrl exists)
- Upload button (if admin OR self) — file input + modal with radio: "Replace current" vs "New version"
- Delete button (admin only)

### Task 6.6: Verify + commit

- [ ] All gates green. Manual smoke: upload cert as admin, download as staff (own), verify 403 for staff downloading other's cert.

- [ ] Commit per spec subject line.

---

## Chunk 7: Commit 6 — Heat map on /compliance

### Task 7.1: Build ComplianceMatrix component

**Files:**
- Create: `src/components/compliance/ComplianceMatrix.tsx`
- Create: `src/components/compliance/ComplianceMatrixCell.tsx`

- [ ] **Step 1: Fetch matrix data**

Use existing `GET /api/compliance/matrix` (no changes to that route needed). React Query hook `useComplianceMatrix()`.

- [ ] **Step 2: Render grid**

Rows = staff, columns = 11 cert types. Cell shows `<CertStatusBadge>` style color (green/amber/red/gray). Click cell → opens slide-over with `CertActionBar`.

- [ ] **Step 3: Tests**

Render test: given mock matrix data, verify correct cell count + colors.

### Task 7.2: Add view toggle to /compliance page

- [ ] **Step 1: Modify `/compliance/page.tsx`**

Read the 1111-line file. Add a state `view: "list" | "matrix"` at top of component. Add a toggle button in the header row. Conditionally render list view (existing) or matrix view (new).

**Rule**: do NOT refactor the existing list view. Only add the toggle + matrix branch.

### Task 7.3: Verify + commit

---

## Chunk 8: Commit 7 — Cron consolidation + compliance in-app notifications

### Task 8.1: Refactor compliance-alerts cron

**Files:**
- Modify: `src/app/api/cron/compliance-alerts/route.ts`
- Modify: `src/lib/cert-expiry.ts` (if the logic lives there; otherwise inline)

- [ ] **Step 1: Rewrite the alert logic with dedup**

Pseudocode (full implementation in the chunk):

```ts
const THRESHOLDS = [30, 14, 7, 0] as const;

async function sendAlerts() {
  const now = new Date();
  const lookahead = new Date();
  lookahead.setDate(now.getDate() + 30);

  const certs = await prisma.complianceCertificate.findMany({
    where: { expiryDate: { lte: lookahead } },
    include: { user: true, service: true, alerts: true },
  });

  let emailsSent = 0;
  let notificationsCreated = 0;

  for (const cert of certs) {
    const daysUntil = Math.floor((cert.expiryDate.getTime() - now.getTime()) / 86400000);
    const threshold = pickThreshold(daysUntil);
    if (threshold === null) continue;
    if (cert.alerts.some(a => a.threshold === threshold)) continue; // dedup

    // Send email to staff
    if (cert.userId) {
      const user = cert.user!;
      await sendEmail({
        to: user.email,
        cc: await getCoordinatorEmails(cert.serviceId),
        template: complianceAlertEmail({ user, cert, threshold }),
      });
      emailsSent++;

      // Create in-app notification
      await prisma.userNotification.create({
        data: {
          userId: cert.userId,
          type: NOTIFICATION_TYPES[`CERT_EXPIRING_${threshold}D` as keyof typeof NOTIFICATION_TYPES] ?? NOTIFICATION_TYPES.CERT_EXPIRED,
          title: `Certificate expiring ${threshold === 0 ? "today" : `in ${threshold} days`}`,
          body: `Your ${cert.type} certificate expires ${cert.expiryDate.toDateString()}`,
          link: `/staff/${cert.userId}?tab=compliance`,
        },
      });
      notificationsCreated++;
    }

    // Record dedup marker
    await prisma.complianceCertificateAlert.create({
      data: { certificateId: cert.id, threshold, channels: ["email", "in_app"] },
    });
  }

  return { emailsSent, notificationsCreated };
}

function pickThreshold(daysUntil: number): 30 | 14 | 7 | 0 | null {
  if (daysUntil <= 0) return 0;
  if (daysUntil <= 7) return 7;
  if (daysUntil <= 14) return 14;
  if (daysUntil <= 30) return 30;
  return null;
}
```

### Task 8.2: Repurpose cert-expiry-alert to admin weekly digest

- [ ] **Step 1: Rewrite the weekly cron to send a single summary email**

Query all expiring certs org-wide. Build a summary: counts per service × status. Send single email to admins. No UserNotification creation here (per-staff alerts already handled by compliance-alerts daily).

### Task 8.3: Tests

- [ ] Dedup test: run cron twice on same day — second run creates 0 new alerts.
- [ ] Threshold crossing test: set cert to expire in 29 days, run cron → 30-day alert sent. Advance mock clock to 13 days out, run → 14-day alert sent. Each produces one `ComplianceCertificateAlert` row.

### Task 8.4: Verify + commit

---

## Chunk 9: Commit 8 — Bell UI + non-compliance notification triggers

### Task 9.1: NotificationBell + NotificationPopover components

**Files:**
- Create: `src/components/layout/NotificationBell.tsx`
- Create: `src/components/layout/NotificationPopover.tsx`

- [ ] **Step 1: Build the bell**

Uses `useQuery({ queryKey: ["notifications", "unread-count"], refetchInterval: 60_000 })` for badge. Popover on click shows recent list (fetched on open).

- [ ] **Step 2: Wire into top nav**

Find the existing top-nav component. Insert `<NotificationBell />` before the user menu.

### Task 9.2: Non-compliance trigger points

**Files to modify:**
- `src/app/api/leave/[id]/approve/route.ts` (or wherever approve happens) — on approve, create UserNotification for requesting staff (type `LEAVE_APPROVED`)
- `src/app/api/leave/[id]/deny/route.ts` — type `LEAVE_DENIED`
- `src/app/api/leave/route.ts` POST — on submit, create UserNotification for each coordinator at the user's service (type `LEAVE_SUBMITTED`)
- `src/app/api/timesheets/route.ts` POST — type `TIMESHEET_SUBMITTED` → coordinator
- `src/app/api/timesheets/[id]/approve/route.ts` — type `TIMESHEET_APPROVED` → submitting user

Each insertion is 5-10 lines. Pattern:

```ts
await prisma.userNotification.create({
  data: {
    userId: recipientId,
    type: NOTIFICATION_TYPES.LEAVE_SUBMITTED,
    title: `${submitter.name} submitted a leave request`,
    body: `${leaveType} for ${daysBetween(startDate, endDate)} days, starting ${startDate.toDateString()}`,
    link: `/leave?id=${leaveRequest.id}`,
  },
});
```

### Task 9.3: Verify + commit

---

## Chunk 10: Commit 9 — /team Action Required widget

### Task 10.1: API route for counts

**Files:**
- Create: `src/app/api/team/action-counts/route.ts`

- [ ] **Step 1: Return scoped counts**

```ts
export const GET = withApiAuth(async (_req, session) => {
  const role = session!.user.role;
  const isAdmin = isAdminRole(role);
  const serviceFilter = isAdmin ? {} : { serviceId: session!.user.serviceId };

  const [certsExpiring, leavePending, timesheetsPending] = await Promise.all([
    prisma.complianceCertificate.count({
      where: {
        ...serviceFilter,
        expiryDate: { lte: daysFromNow(30) },
      },
    }),
    prisma.leaveRequest.count({
      where: { status: "leave_pending", ...(isAdmin ? {} : { user: { serviceId: session!.user.serviceId } }) },
    }),
    prisma.timesheet.count({
      where: { status: "ts_submitted", ...(isAdmin ? {} : { serviceId: session!.user.serviceId }) },
    }),
  ]);

  return NextResponse.json({ certsExpiring, leavePending, timesheetsPending });
});
```

### Task 10.2: Widget component

**Files:**
- Create: `src/components/team/ActionRequiredWidget.tsx`

- [ ] **Step 1: Build the 3-stat widget**

Uses `useQuery({ queryKey: ["team", "action-counts"], refetchInterval: 60_000 })`. Three cards side-by-side. Hidden if `session.user.role === "staff"` OR `role === "member"` OR `role === "marketing"`.

### Task 10.3: Integrate on /team page

- [ ] **Step 1: Modify `src/app/(dashboard)/team/page.tsx`**

Add `<ActionRequiredWidget />` above the existing chart/list toggle.

### Task 10.4: Verify + commit

---

## Chunk 11: Commit 10 — /directory rebuild

### Task 11.1: New components

**Files:**
- Create: `src/components/directory/StaffCard.tsx`
- Create: `src/components/directory/StaffGrid.tsx`
- Create: `src/components/directory/DirectoryFilters.tsx`

- [ ] **Step 1: StaffCard** — avatar, name, role badge (if admin view), service. Click → navigate to `/staff/[id]`.

- [ ] **Step 2: StaffGrid** — responsive grid, renders list of StaffCards.

- [ ] **Step 3: DirectoryFilters** — search box (name), service dropdown, role dropdown (admin only).

### Task 11.2: Rewrite DirectoryContent

**Files:**
- Modify: `src/app/(dashboard)/directory/DirectoryContent.tsx` (rewrite)
- Modify: `src/app/api/team/route.ts` (add filters — service, role, name search)

- [ ] **Step 1: New DirectoryContent using grid + filters**

Replace contents. Keep existing `useTeam()` hook but extend to accept filters.

### Task 11.3: Verify + commit

---

## Chunk 12: Commit 11 — My Portal additions

### Task 12.1: Add My Certs + My Leave Balance cards

**Files:**
- Modify: `src/app/(dashboard)/my-portal/page.tsx`

- [ ] **Step 1: Read the existing page**

1172 lines — large. Don't refactor. Add a new section "My Compliance" with `<CertStatusBadge>` list + downloads. Add "My Leave Balance" with `<LeaveBalanceCard>`.

- [ ] **Step 2: Add link to full profile**

`<Link href={`/staff/${session.user.id}`}>View my full profile →</Link>`

### Task 12.2: Verify + commit

---

## Chunk 13: Commit 12 — Polish /leave + /timesheets

### Task 13.1: /leave header + mobile polish

**Files:**
- Modify: `src/app/(dashboard)/leave/page.tsx` (1379 lines — surgical)

- [ ] **Step 1: Wrap with consistent `<PageHeader>` if not already**
- [ ] **Step 2: Add sticky filter row (status, user, date range)**
- [ ] **Step 3: Mobile: ensure the table has `overflow-x-auto` fallback OR collapses to cards via `sm:hidden` / `hidden sm:block` pattern**

**Rule per spec**: if a >200-line contiguous JSX block needs to change, skip that page and note in PR body (defer to 3b).

### Task 13.2: /timesheets same polish

Same pattern on the 1650-line timesheets page.

### Task 13.3: Verify + commit

---

## Chunk 14: Pull request

### Task 14.1: Final verification sweep

- [ ] **Step 1: Confirm all 12 commits landed**

`git log origin/main..HEAD --oneline` → 12 commits + 2 docs commits (14 total).

- [ ] **Step 2: Run all gates fresh**

```bash
npm run build 2>&1 | tail -10      # optional: may fail on prisma migrate deploy locally — acceptable
npm test -- --run 2>&1 | tail -10  # expect 1050+ tests (1004 baseline + ~50 new)
npx tsc --noEmit 2>&1 | grep -c "error TS"   # 0
npm run lint 2>&1 | tail -3
```

- [ ] **Step 3: Manual smoke**

- Navigate to `/staff/<someone>` as admin → all 7 tabs load
- Navigate as staff to another user's profile → access denied
- Navigate to `/compliance`, switch to matrix view → heat map renders
- Navigate to `/directory` → cards render
- `/team` → Action Required widget visible to admin
- Upload a cert via profile Compliance tab → file appears + download works
- Check bell icon: create a test notification via DB, verify bell badge + popover render

### Task 14.2: Push and open PR

- [ ] **Step 1: Push**

`git push -u origin feat/staff-people-3a-2026-04-21`

- [ ] **Step 2: Open PR**

Use `gh pr create` with title `feat: staff module rebuild part 1 — profile page, compliance alerts, EH UX polish` and a body that includes: before/after table per metric, 12-commit summary, deferred rostering note.

### Task 14.3: Post-merge cleanup

After merge:
```bash
git worktree remove .worktrees/staff-people-3a
git branch -D feat/staff-people-3a-2026-04-21
git fetch && git reset --hard origin/main
```

---

## Acceptance criteria (sub-project done when)

- [ ] All 12 commits landed on `feat/staff-people-3a-2026-04-21` in prescribed order
- [ ] Each commit's individual Acceptance section met
- [ ] `npm test`, `tsc --noEmit` (=0), `npm run lint` all clean
- [ ] Prisma migration applied + runs cleanly in CI
- [ ] `/staff/[id]` added to `src/lib/role-permissions.ts`
- [ ] CI green on PR (unit + integration)
- [ ] Manual smoke passes (profile access matrix, heat map, directory grid, cert upload/download, bell icon)
- [ ] PR opened with before/after table + per-commit summary
- [ ] User reviews and merges PR

## Risk mitigations

- **Schema migration in prod**: additive-only (new models, no column drops) — safe to deploy ahead of code
- **Compliance cron refactor (commit 7)**: consolidates two crons into one + adds dedup. If it over-alerts: dedup is the safety net. If it under-alerts: the weekly admin digest in `cert-expiry-alert` catches anything missed.
- **Big existing pages** (`/leave` 1379, `/timesheets` 1650, `/compliance` 1111, `/my-portal` 1172): commits 6, 11, 12 apply targeted surgical additions — explicitly NOT rewrites.
- **Access control regressions** on `/staff/[id]`: per-role test case + manual smoke as 3 distinct roles before merge.
- **Commit 8 trigger-point scope creep**: if leave/timesheet approve/deny routes don't exist in the exact shapes expected, the task lists 5 probable files but may surface 6-8. Flag in PR body if scope expands.

## Rollback

Each commit is `git revert`-safe standalone. Schema migration (commit 1) additive-only — safe to keep even if features are rolled back. Worst-case: whole-PR revert via merge-commit revert.
