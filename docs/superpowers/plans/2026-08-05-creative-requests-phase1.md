# Creative Requests — Phase 1 (Ticketing Core) Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Centre staff submit structured design-request briefs (table cover, poster, flyer…) that land in a marketing queue with a status pipeline, threaded comments (with internal-only notes), file attachments, and notifications — replacing WhatsApp briefs.

**Architecture:** New `CreativeRequest` + `CreativeRequestMessage` + `CreativeRequestAttachment` Prisma models cloned from the proven `VendorBrief` (numbered, staged, per-stage timestamps) and `SupportTicket`/`TicketMessage` (thread) patterns. Three API route files under `/api/creative-requests` wrapped in `withApiAuth`. One role-adaptive page at `/requests`: fulfiller roles (marketing/admin/head_office/owner) see a kanban queue; centre roles (member/staff) see "My requests" + a New Request form. Files upload through the existing `/api/upload` (Vercel Blob) and their URLs are passed into create/message payloads. Notifications reuse `UserNotification` + `NOTIFICATION_TYPES`.

**Tech Stack:** Next.js 16 App Router, Prisma 5.22 (PostgreSQL/Neon), Zod, TanStack Query, Tailwind (design tokens), Vitest.

---

## ⚠️ Critical context — read before starting

1. **`.env.local` `DATABASE_URL` points at the PRODUCTION Neon DB.** NEVER run `prisma migrate dev`, `prisma db push`, or `prisma db execute` locally. Migration SQL is generated offline with `prisma migrate diff` (schema-to-schema) and applied only by the Vercel deploy (`prisma migrate deploy`). See Task 1 for the exact procedure.
2. **New-page checklist** (from project memory): a new page must be added to (a) `allPages` in `src/lib/role-permissions.ts`, (b) every role's `rolePageAccess` list that should see it (member/staff/marketing need explicit entries; owner/head_office/admin inherit `allPages`), and (c) `src/lib/nav-config.ts` with a deliberate `core` tier. Task 10 does all three — skipping (b) makes the page invisible for centre roles.
3. **New-API-route checklist**: `withApiAuth` wrapper, Zod on every write body with `z.nativeEnum(PrismaEnum)`, `parseJsonBody(req)` (never raw `req.json()`), role gating via the `roles` option, no `as Role` casts.
4. **Client standards**: every `useQuery` gets `retry: 2` + `staleTime: 30_000`; every `useMutation` gets an `onError` destructive toast; query keys use primitive values only; all fetches through `fetchApi`/`mutateApi` from `@/lib/fetch-api`.
5. **Design tokens only** in UI: `text-foreground`/`text-muted`/`bg-card`/`bg-surface`/`bg-brand`/`border-border` etc. Action buttons use `Button` from `@/components/ui/Button`; icon-only buttons need `aria-label`; page headers use `PageHeader` from `@/components/layout/PageHeader`; toasts are `toast({ description: "..." })` (description required).
6. **Reference implementations to imitate** (open these when in doubt):
   - `src/app/api/marketing/vendor-briefs/route.ts` — list/create route shape, Zod schemas, cursor pagination
   - `src/app/api/marketing/vendor-briefs/[id]/transition/route.ts` — `RouteCtx` params pattern, transition validation
   - `src/lib/vendor-brief/brief-number.ts` — numbered-ID generator + unique-retry (we generalise this pattern, we do NOT import it)
   - `prisma/schema.prisma:3047` (`SupportTicket`) and `:3101` (`TicketMessage`) — thread modelling
   - `src/__tests__/api/vendor-briefs.test.ts` — route-test structure, mocks
   - `src/hooks/useVendorBriefs.ts` — hook + response-type mirroring

## File structure

| File | Responsibility |
|---|---|
| `prisma/schema.prisma` (modify) | 2 new enums + 3 new models + back-relations on `User`/`Service` |
| `prisma/migrations/<ts>_creative_requests/migration.sql` (create) | Generated SQL, applied by deploy only |
| `src/lib/creative-request/request-number.ts` (create) | `REQ-YYYY-NNNN` generator + unique-conflict retry |
| `src/lib/creative-request/constants.ts` (create) | Status pipeline + allowed transitions, per-type default turnaround, business-day maths, fulfiller-role list |
| `src/lib/creative-request/notify.ts` (create) | All notification fan-out (submit / assign / status / message), swallow-on-error |
| `src/lib/notification-types.ts` (modify) | 4 new notification type constants |
| `src/app/api/creative-requests/route.ts` (create) | GET list (role-scoped) + POST create |
| `src/app/api/creative-requests/[id]/route.ts` (create) | GET detail + PATCH (transition / assign / cancel) |
| `src/app/api/creative-requests/[id]/messages/route.ts` (create) | GET thread (internal filtered) + POST message |
| `src/hooks/useCreativeRequests.ts` (create) | Queries + mutations, mirrors route response types |
| `src/app/(dashboard)/requests/page.tsx` (create) | Role-adaptive page shell |
| `src/components/requests/RequestBoard.tsx` (create) | Kanban queue (fulfiller view) |
| `src/components/requests/RequestCard.tsx` (create) | Board card |
| `src/components/requests/RequestDetailPanel.tsx` (create) | Slide-over: brief, thread, actions |
| `src/components/requests/NewRequestModal.tsx` (create) | Type picker + brief form |
| `src/components/requests/MyRequestsList.tsx` (create) | Requester table view |
| `src/lib/nav-config.ts` (modify) | Nav item in Growth |
| `src/lib/role-permissions.ts` (modify) | `allPages` + member/staff/marketing entries |
| `src/__tests__/lib/creative-request-number.test.ts` (create) | Number generator tests |
| `src/__tests__/lib/creative-request-constants.test.ts` (create) | Transition + business-day tests |
| `src/__tests__/lib/creative-request-notify.test.ts` (create) | Notification fan-out tests |
| `src/__tests__/api/creative-requests.test.ts` (create) | Route tests (auth/validation/scoping/happy) |

Out of scope for Phase 1 (later phases): proof versioning + 3-state decisions, SLA pause clock, request templates, `/marketing` hub tab embedding, AI brief pre-fill, asset-library deflection.

---

## Chunk 1: Backend — schema, libs, API routes

### Task 1: Prisma schema + migration

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260805000000_creative_requests/migration.sql`

- [ ] **Step 1: Add enums and models to `prisma/schema.prisma`**

Add near the other marketing models (after `VendorContact`, ~line 1786):

```prisma
// ============================================================
// Creative Requests — centre staff request design work from the
// marketing team (Phase 1 of the Marketing Hub rebuild).
// Modelled on VendorBrief (numbered, staged, timestamped) +
// SupportTicket/TicketMessage (thread).
// ============================================================

enum CreativeRequestType {
  flyer
  poster
  social_tile
  table_cover
  banner_signage
  email_header
  merch
  other
}

enum CreativeRequestStatus {
  new
  briefed
  in_progress
  in_review
  changes_requested
  approved
  delivered
  cancelled
}

model CreativeRequest {
  id            String                @id @default(cuid())
  /// Human-readable number — e.g. "REQ-2026-0042". Generated via
  /// generateRequestNumber(); unique. Primary identifier in the UI.
  requestNumber String                @unique
  title         String
  type          CreativeRequestType
  status        CreativeRequestStatus @default(new)
  /// Reuses the existing TicketPriority enum (urgent/high/normal/low).
  priority      TicketPriority        @default(normal)

  serviceId String?
  service   Service? @relation("ServiceCreativeRequests", fields: [serviceId], references: [id], onDelete: SetNull)

  requestedById String
  requestedBy   User   @relation("CreativeRequestsRequested", fields: [requestedById], references: [id], onDelete: Cascade)
  assigneeId    String?
  assignee      User?   @relation("CreativeRequestsAssigned", fields: [assigneeId], references: [id], onDelete: SetNull)

  /// The free-text brief: what it's for, audience, context.
  purpose      String  @db.Text
  /// Verbatim copy the designer pastes without edits (Design Pickle rule).
  exactCopy    String? @db.Text
  /// e.g. "6ft trestle 1800×750mm", "A3", "1080×1350"
  sizeSpec     String?
  /// e.g. "Print-ready PDF, CMYK, 3mm bleed", "PNG"
  outputFormat String?

  /// Server-computed from type default turnaround when omitted at create.
  dueDate DateTime

  briefedAt          DateTime?
  inProgressAt       DateTime?
  inReviewAt         DateTime?
  changesRequestedAt DateTime?
  approvedAt         DateTime?
  deliveredAt        DateTime?
  cancelledAt        DateTime?
  cancellationReason String?   @db.Text

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  messages    CreativeRequestMessage[]
  attachments CreativeRequestAttachment[]

  @@index([status])
  @@index([assigneeId])
  @@index([requestedById])
  @@index([serviceId])
  @@index([dueDate])
  @@index([createdAt])
}

model CreativeRequestMessage {
  id        String          @id @default(cuid())
  requestId String
  request   CreativeRequest @relation(fields: [requestId], references: [id], onDelete: Cascade)
  authorId  String
  author    User            @relation("CreativeRequestMessages", fields: [authorId], references: [id], onDelete: Cascade)
  body      String          @db.Text
  /// Team-only note — never returned to the requester (JSM pattern).
  internal  Boolean         @default(false)
  createdAt DateTime        @default(now())

  attachments CreativeRequestAttachment[]

  @@index([requestId])
}

model CreativeRequestAttachment {
  id           String                  @id @default(cuid())
  requestId    String
  request      CreativeRequest         @relation(fields: [requestId], references: [id], onDelete: Cascade)
  /// Null = attached to the request brief itself; set = attached to a message.
  messageId    String?
  message      CreativeRequestMessage? @relation(fields: [messageId], references: [id], onDelete: SetNull)
  fileName     String
  /// Vercel Blob URL from POST /api/upload.
  fileUrl      String
  fileSize     Int?
  mimeType     String?
  uploadedById String?
  uploadedBy   User?                   @relation("CreativeRequestUploads", fields: [uploadedById], references: [id], onDelete: SetNull)
  createdAt    DateTime                @default(now())

  @@index([requestId])
}
```

- [ ] **Step 2: Add back-relations to `User` and `Service` models**

In `model User` add (near the other relation lists):

```prisma
  creativeRequestsRequested CreativeRequest[]           @relation("CreativeRequestsRequested")
  creativeRequestsAssigned  CreativeRequest[]           @relation("CreativeRequestsAssigned")
  creativeRequestMessages   CreativeRequestMessage[]    @relation("CreativeRequestMessages")
  creativeRequestUploads    CreativeRequestAttachment[] @relation("CreativeRequestUploads")
```

In `model Service` add:

```prisma
  creativeRequests CreativeRequest[] @relation("ServiceCreativeRequests")
```

- [ ] **Step 3: Validate the schema**

Run: `npx prisma validate`
Expected: `The schema at prisma/schema.prisma is valid 🚀`

- [ ] **Step 4: Generate the migration SQL WITHOUT touching the database**

`.env.local` points at PROD — do not use `migrate dev`/`db push`/`db execute`. Generate SQL by diffing the pre-change schema against the new one:

```bash
git show HEAD:prisma/schema.prisma > /tmp/schema-before.prisma
mkdir -p prisma/migrations/20260805000000_creative_requests
npx prisma migrate diff \
  --from-schema-datamodel /tmp/schema-before.prisma \
  --to-schema-datamodel prisma/schema.prisma \
  --script > prisma/migrations/20260805000000_creative_requests/migration.sql
rm /tmp/schema-before.prisma
```

Expected: `migration.sql` containing `CREATE TYPE "CreativeRequestType"`, `CREATE TYPE "CreativeRequestStatus"`, three `CREATE TABLE` statements, FK constraints, and the indexes. Inspect it — it must contain ONLY additive statements (no `DROP`/`ALTER` of existing tables). If anything non-additive appears, STOP and investigate before committing.

- [ ] **Step 5: Regenerate the Prisma client (local types only — no DB contact)**

Run: `npx prisma generate`
Expected: `Generated Prisma Client` — `CreativeRequest` etc. now exist in `@prisma/client` types.

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260805000000_creative_requests/migration.sql
git commit -m "feat(creative-requests): CreativeRequest/Message/Attachment models + migration"
```

### Task 2: Request-number generator

**Files:**
- Create: `src/lib/creative-request/request-number.ts`
- Test: `src/__tests__/lib/creative-request-number.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect, vi } from "vitest";
import {
  formatRequestNumber,
  generateRequestNumber,
  createWithNumberRetry,
} from "@/lib/creative-request/request-number";

describe("formatRequestNumber", () => {
  it("zero-pads to 4 digits", () => {
    expect(formatRequestNumber(2026, 7)).toBe("REQ-2026-0007");
    expect(formatRequestNumber(2026, 1234)).toBe("REQ-2026-1234");
  });
});

describe("generateRequestNumber", () => {
  it("counts existing requests for the year and adds 1", async () => {
    const tx = {
      creativeRequest: { count: vi.fn().mockResolvedValue(41) },
    };
    const n = await generateRequestNumber(tx as never, 2026);
    expect(n).toBe("REQ-2026-0042");
    expect(tx.creativeRequest.count).toHaveBeenCalledWith({
      where: { requestNumber: { startsWith: "REQ-2026-" } },
    });
  });
});

describe("createWithNumberRetry", () => {
  it("retries on P2002 unique conflict then succeeds", async () => {
    let calls = 0;
    const attempt = vi.fn(async (num: string) => {
      calls++;
      if (calls === 1) throw Object.assign(new Error("dup"), { code: "P2002" });
      return { requestNumber: num };
    });
    const generate = vi
      .fn()
      .mockResolvedValueOnce("REQ-2026-0001")
      .mockResolvedValueOnce("REQ-2026-0002");
    const result = await createWithNumberRetry(attempt, generate);
    expect(result).toEqual({ requestNumber: "REQ-2026-0002" });
  });

  it("rethrows non-P2002 errors immediately", async () => {
    const attempt = vi.fn(async () => {
      throw new Error("boom");
    });
    const generate = vi.fn().mockResolvedValue("REQ-2026-0001");
    await expect(createWithNumberRetry(attempt, generate)).rejects.toThrow("boom");
    expect(attempt).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/__tests__/lib/creative-request-number.test.ts`
Expected: FAIL — `Cannot find module '@/lib/creative-request/request-number'`

- [ ] **Step 3: Implement**

```ts
import type { Prisma, PrismaClient } from "@prisma/client";

/**
 * REQ-YYYY-NNNN generator. Same pattern as vendor-brief numbers:
 * count-per-year + unique constraint + bounded retry at the call site.
 */
export async function generateRequestNumber(
  tx: Pick<PrismaClient | Prisma.TransactionClient, "creativeRequest">,
  year: number,
): Promise<string> {
  const count = await tx.creativeRequest.count({
    where: { requestNumber: { startsWith: `REQ-${year}-` } },
  });
  return formatRequestNumber(year, count + 1);
}

export function formatRequestNumber(year: number, sequence: number): string {
  return `REQ-${year}-${String(sequence).padStart(4, "0")}`;
}

export async function createWithNumberRetry<T>(
  attempt: (requestNumber: string) => Promise<T>,
  generate: () => Promise<string>,
  maxAttempts = 3,
): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < maxAttempts; i++) {
    const requestNumber = await generate();
    try {
      return await attempt(requestNumber);
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code !== "P2002") throw err;
      lastErr = err;
    }
  }
  throw lastErr;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/lib/creative-request-number.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/creative-request/request-number.ts src/__tests__/lib/creative-request-number.test.ts
git commit -m "feat(creative-requests): REQ-YYYY-NNNN number generator"
```

### Task 3: Pipeline constants, transitions, business-day due dates

**Files:**
- Create: `src/lib/creative-request/constants.ts`
- Test: `src/__tests__/lib/creative-request-constants.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect } from "vitest";
import {
  isValidTransition,
  addBusinessDays,
  defaultDueDate,
  STATUS_TIMESTAMP_FIELD,
  TURNAROUND_BUSINESS_DAYS,
  FULFILLER_ROLES,
} from "@/lib/creative-request/constants";

describe("isValidTransition", () => {
  it("allows the happy path", () => {
    expect(isValidTransition("new", "briefed")).toBe(true);
    expect(isValidTransition("briefed", "in_progress")).toBe(true);
    expect(isValidTransition("in_progress", "in_review")).toBe(true);
    expect(isValidTransition("in_review", "changes_requested")).toBe(true);
    expect(isValidTransition("changes_requested", "in_review")).toBe(true);
    expect(isValidTransition("in_review", "approved")).toBe(true);
    expect(isValidTransition("approved", "delivered")).toBe(true);
  });
  it("rejects skips and moves out of terminal states", () => {
    expect(isValidTransition("new", "approved")).toBe(false);
    expect(isValidTransition("delivered", "new")).toBe(false);
    expect(isValidTransition("cancelled", "briefed")).toBe(false);
  });
  it("allows cancel from every non-terminal state except approved", () => {
    for (const from of ["new", "briefed", "in_progress", "in_review", "changes_requested"] as const) {
      expect(isValidTransition(from, "cancelled")).toBe(true);
    }
    expect(isValidTransition("approved", "cancelled")).toBe(false);
  });
});

describe("addBusinessDays", () => {
  it("skips weekends", () => {
    // Wed 2026-08-05 + 3 business days = Mon 2026-08-10
    const wed = new Date("2026-08-05T00:00:00Z");
    expect(addBusinessDays(wed, 3).toISOString().slice(0, 10)).toBe("2026-08-10");
  });
  it("Friday + 1 = Monday", () => {
    const fri = new Date("2026-08-07T00:00:00Z");
    expect(addBusinessDays(fri, 1).toISOString().slice(0, 10)).toBe("2026-08-10");
  });
});

describe("defaultDueDate", () => {
  it("uses the type's turnaround", () => {
    const wed = new Date("2026-08-05T00:00:00Z");
    // social_tile = 2 business days → Fri 2026-08-07
    expect(defaultDueDate("social_tile", wed).toISOString().slice(0, 10)).toBe("2026-08-07");
  });
});

describe("maps", () => {
  it("covers every type and status", () => {
    expect(Object.keys(TURNAROUND_BUSINESS_DAYS)).toHaveLength(8);
    expect(STATUS_TIMESTAMP_FIELD.delivered).toBe("deliveredAt");
    expect(STATUS_TIMESTAMP_FIELD.new).toBeNull();
    expect(FULFILLER_ROLES).toContain("marketing");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/__tests__/lib/creative-request-constants.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement**

```ts
import type { CreativeRequestStatus, CreativeRequestType } from "@prisma/client";

/** Roles that work the queue (vs centre roles who submit). */
export const FULFILLER_ROLES = ["marketing", "owner", "head_office", "admin"] as const;
export type FulfillerRole = (typeof FULFILLER_ROLES)[number];

export function isFulfillerRole(role: string): boolean {
  return (FULFILLER_ROLES as readonly string[]).includes(role);
}

/** Allowed status moves. Cancel is allowed from any pre-approval state. */
export const TRANSITIONS: Record<CreativeRequestStatus, CreativeRequestStatus[]> = {
  new: ["briefed", "cancelled"],
  briefed: ["in_progress", "cancelled"],
  in_progress: ["in_review", "cancelled"],
  in_review: ["changes_requested", "approved", "cancelled"],
  changes_requested: ["in_review", "cancelled"],
  approved: ["delivered"],
  delivered: [],
  cancelled: [],
};

export function isValidTransition(
  from: CreativeRequestStatus,
  to: CreativeRequestStatus,
): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

/** Which timestamp column each status entry stamps (null = createdAt covers it). */
export const STATUS_TIMESTAMP_FIELD: Record<
  CreativeRequestStatus,
  | "briefedAt"
  | "inProgressAt"
  | "inReviewAt"
  | "changesRequestedAt"
  | "approvedAt"
  | "deliveredAt"
  | "cancelledAt"
  | null
> = {
  new: null,
  briefed: "briefedAt",
  in_progress: "inProgressAt",
  in_review: "inReviewAt",
  changes_requested: "changesRequestedAt",
  approved: "approvedAt",
  delivered: "deliveredAt",
  cancelled: "cancelledAt",
};

/** Default turnaround per request type, in business days (Asana pattern:
 *  type sets the due date, not negotiation). */
export const TURNAROUND_BUSINESS_DAYS: Record<CreativeRequestType, number> = {
  flyer: 3,
  poster: 5,
  social_tile: 2,
  table_cover: 5,
  banner_signage: 7,
  email_header: 2,
  merch: 10,
  other: 5,
};

/** Add N business days (Mon–Fri), UTC-date based. */
export function addBusinessDays(from: Date, days: number): Date {
  const d = new Date(from);
  let remaining = days;
  while (remaining > 0) {
    d.setUTCDate(d.getUTCDate() + 1);
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6) remaining--;
  }
  return d;
}

export function defaultDueDate(type: CreativeRequestType, from = new Date()): Date {
  return addBusinessDays(from, TURNAROUND_BUSINESS_DAYS[type]);
}

/** UI labels — single source for board columns and chips. */
export const STATUS_LABELS: Record<CreativeRequestStatus, string> = {
  new: "New",
  briefed: "Briefed",
  in_progress: "In progress",
  in_review: "In review",
  changes_requested: "Changes requested",
  approved: "Approved",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

export const TYPE_LABELS: Record<CreativeRequestType, string> = {
  flyer: "Flyer",
  poster: "Poster",
  social_tile: "Social tile",
  table_cover: "Table cover",
  banner_signage: "Banner / signage",
  email_header: "Email header",
  merch: "Merch / uniform",
  other: "Something else",
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/lib/creative-request-constants.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/creative-request/constants.ts src/__tests__/lib/creative-request-constants.test.ts
git commit -m "feat(creative-requests): pipeline transitions + turnaround defaults"
```

### Task 4: Notification types + fan-out helper

**Files:**
- Modify: `src/lib/notification-types.ts` (append inside `NOTIFICATION_TYPES`, before `} as const;`)
- Create: `src/lib/creative-request/notify.ts`
- Test: `src/__tests__/lib/creative-request-notify.test.ts`

- [ ] **Step 1: Add the four notification type constants**

In `src/lib/notification-types.ts`, add before the closing `} as const;`:

```ts
  // 2026-08-05: creative-request ticketing (Marketing Hub Phase 1).
  CREATIVE_REQUEST_SUBMITTED: "creative_request_submitted",
  CREATIVE_REQUEST_ASSIGNED: "creative_request_assigned",
  CREATIVE_REQUEST_STATUS: "creative_request_status",
  CREATIVE_REQUEST_MESSAGE: "creative_request_message",
```

- [ ] **Step 2: Write the failing tests**

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";

vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import {
  notifyRequestSubmitted,
  notifyRequestAssigned,
  notifyRequestStatusChanged,
  notifyRequestMessage,
} from "@/lib/creative-request/notify";

const request = {
  id: "cr1",
  requestNumber: "REQ-2026-0001",
  title: "Table cover",
  requestedById: "req-user",
  assigneeId: "mkt-user",
};

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.userNotification.createMany.mockResolvedValue({ count: 1 });
});

describe("notifyRequestSubmitted", () => {
  it("notifies all active marketing users except the requester", async () => {
    prismaMock.user.findMany.mockResolvedValue([
      { id: "mkt-user" },
      { id: "req-user" }, // requester also has marketing role — must be excluded
    ] as never);
    await notifyRequestSubmitted(prismaMock as never, request);
    expect(prismaMock.user.findMany).toHaveBeenCalledWith({
      where: { role: "marketing", active: true },
      select: { id: true },
    });
    const arg = prismaMock.userNotification.createMany.mock.calls[0][0];
    expect(arg.data).toHaveLength(1);
    expect(arg.data[0]).toMatchObject({
      userId: "mkt-user",
      type: "creative_request_submitted",
      link: "/requests?open=cr1",
    });
  });

  it("swallows errors", async () => {
    prismaMock.user.findMany.mockRejectedValue(new Error("db down"));
    await expect(notifyRequestSubmitted(prismaMock as never, request)).resolves.toBeUndefined();
  });
});

describe("notifyRequestAssigned", () => {
  it("notifies the assignee, not the actor", async () => {
    await notifyRequestAssigned(prismaMock as never, request, "actor-1");
    const arg = prismaMock.userNotification.createMany.mock.calls[0][0];
    expect(arg.data[0].userId).toBe("mkt-user");
  });
  it("no-ops when assignee is the actor", async () => {
    await notifyRequestAssigned(prismaMock as never, request, "mkt-user");
    expect(prismaMock.userNotification.createMany).not.toHaveBeenCalled();
  });
});

describe("notifyRequestStatusChanged", () => {
  it("notifies the requester when someone else moves the status", async () => {
    await notifyRequestStatusChanged(prismaMock as never, request, "in_review", "mkt-user");
    const arg = prismaMock.userNotification.createMany.mock.calls[0][0];
    expect(arg.data[0]).toMatchObject({ userId: "req-user", type: "creative_request_status" });
  });
  it("no-ops when the requester moved it themselves", async () => {
    await notifyRequestStatusChanged(prismaMock as never, request, "cancelled", "req-user");
    expect(prismaMock.userNotification.createMany).not.toHaveBeenCalled();
  });
});

describe("notifyRequestMessage", () => {
  it("requester message → notifies assignee", async () => {
    await notifyRequestMessage(prismaMock as never, request, "req-user", false);
    const arg = prismaMock.userNotification.createMany.mock.calls[0][0];
    expect(arg.data[0].userId).toBe("mkt-user");
  });
  it("fulfiller non-internal message → notifies requester", async () => {
    await notifyRequestMessage(prismaMock as never, request, "mkt-user", false);
    const arg = prismaMock.userNotification.createMany.mock.calls[0][0];
    expect(arg.data[0].userId).toBe("req-user");
  });
  it("internal message → notifies nobody outside the team (no requester ping)", async () => {
    await notifyRequestMessage(prismaMock as never, request, "mkt-user", true);
    expect(prismaMock.userNotification.createMany).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run src/__tests__/lib/creative-request-notify.test.ts`
Expected: FAIL — module not found

- [ ] **Step 4: Implement `src/lib/creative-request/notify.ts`**

```ts
/**
 * Notification fan-out for creative requests. In-app UserNotification only
 * in Phase 1 (assignment emails are a Phase 2 follow-up).
 *
 * Design (mirrors open-shift-notify): side-effect-free on failure — callers
 * have already committed; every helper try/catches and logs but never throws.
 */
import type { Prisma, PrismaClient } from "@prisma/client";
import type { CreativeRequestStatus } from "@prisma/client";
import { NOTIFICATION_TYPES } from "@/lib/notification-types";
import { STATUS_LABELS } from "@/lib/creative-request/constants";
import { logger } from "@/lib/logger";

type Db = PrismaClient | Prisma.TransactionClient;

export interface RequestSummary {
  id: string;
  requestNumber: string;
  title: string;
  requestedById: string;
  assigneeId: string | null;
}

function link(request: RequestSummary): string {
  return `/requests?open=${request.id}`;
}

async function createFor(
  db: Db,
  userIds: string[],
  type: string,
  title: string,
  body: string,
  requestLink: string,
): Promise<void> {
  const unique = [...new Set(userIds)].filter(Boolean);
  if (unique.length === 0) return;
  await db.userNotification.createMany({
    data: unique.map((userId) => ({ userId, type, title, body, link: requestLink })),
  });
}

/**
 * New request → every active marketing-role user (except the requester).
 * Deliberately narrower than FULFILLER_ROLES: admins/head_office/owner can
 * work the queue but shouldn't be pinged for every submission.
 */
export async function notifyRequestSubmitted(db: Db, request: RequestSummary): Promise<void> {
  try {
    const marketers = await db.user.findMany({
      where: { role: "marketing", active: true },
      select: { id: true },
    });
    await createFor(
      db,
      marketers.map((u) => u.id).filter((id) => id !== request.requestedById),
      NOTIFICATION_TYPES.CREATIVE_REQUEST_SUBMITTED,
      `New request ${request.requestNumber}`,
      request.title,
      link(request),
    );
  } catch (err) {
    logger.error("creative-request notify (submitted) failed", { err, requestId: request.id });
  }
}

/** Assignment → the assignee (unless they assigned themselves). */
export async function notifyRequestAssigned(
  db: Db,
  request: RequestSummary,
  actorId: string,
): Promise<void> {
  try {
    if (!request.assigneeId || request.assigneeId === actorId) return;
    await createFor(
      db,
      [request.assigneeId],
      NOTIFICATION_TYPES.CREATIVE_REQUEST_ASSIGNED,
      `${request.requestNumber} assigned to you`,
      request.title,
      link(request),
    );
  } catch (err) {
    logger.error("creative-request notify (assigned) failed", { err, requestId: request.id });
  }
}

/** Status move → the requester (unless they made the move themselves). */
export async function notifyRequestStatusChanged(
  db: Db,
  request: RequestSummary,
  toStatus: CreativeRequestStatus,
  actorId: string,
): Promise<void> {
  try {
    if (request.requestedById === actorId) return;
    await createFor(
      db,
      [request.requestedById],
      NOTIFICATION_TYPES.CREATIVE_REQUEST_STATUS,
      `${request.requestNumber}: ${STATUS_LABELS[toStatus]}`,
      request.title,
      link(request),
    );
  } catch (err) {
    logger.error("creative-request notify (status) failed", { err, requestId: request.id });
  }
}

/**
 * New message → the "other side". Requester wrote → assignee (if any);
 * fulfiller wrote non-internal → requester. Internal notes ping nobody
 * (team members are already in the queue).
 */
export async function notifyRequestMessage(
  db: Db,
  request: RequestSummary,
  authorId: string,
  internal: boolean,
): Promise<void> {
  try {
    if (internal) return;
    const target =
      authorId === request.requestedById ? request.assigneeId : request.requestedById;
    if (!target || target === authorId) return;
    await createFor(
      db,
      [target],
      NOTIFICATION_TYPES.CREATIVE_REQUEST_MESSAGE,
      `New comment on ${request.requestNumber}`,
      request.title,
      link(request),
    );
  } catch (err) {
    logger.error("creative-request notify (message) failed", { err, requestId: request.id });
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/lib/creative-request-notify.test.ts`
Expected: PASS (9 tests)

- [ ] **Step 6: Commit**

```bash
git add src/lib/notification-types.ts src/lib/creative-request/notify.ts src/__tests__/lib/creative-request-notify.test.ts
git commit -m "feat(creative-requests): notification types + fan-out helper"
```

### Task 5: List + create API route

**Files:**
- Create: `src/app/api/creative-requests/route.ts`
- Test: `src/__tests__/api/creative-requests.test.ts` (first describe blocks)

- [ ] **Step 1: Write the failing tests**

Create `src/__tests__/api/creative-requests.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession, mockNoSession } from "../helpers/auth-mock";
import { createRequest } from "../helpers/request";

vi.mock("@/lib/logger", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    withRequestId: () => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
  },
  generateRequestId: () => "test-req-id",
}));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() =>
    Promise.resolve({ limited: false, remaining: 59, resetIn: 60000 }),
  ),
}));

import { GET as GET_LIST, POST as POST_CREATE } from "@/app/api/creative-requests/route";
import { _clearUserActiveCache } from "@/lib/server-auth";

const baseRequest = {
  id: "cr1",
  requestNumber: "REQ-2026-0001",
  title: "Table cover — Punchbowl",
  type: "table_cover",
  status: "new",
  priority: "normal",
  serviceId: "svc1",
  service: { id: "svc1", name: "Punchbowl" },
  requestedById: "member-1",
  requestedBy: { id: "member-1", name: "Mirna" },
  assigneeId: null,
  assignee: null,
  purpose: "School expo stall",
  exactCopy: null,
  sizeSpec: "6ft trestle",
  outputFormat: null,
  dueDate: new Date("2026-08-12"),
  briefedAt: null,
  inProgressAt: null,
  inReviewAt: null,
  changesRequestedAt: null,
  approvedAt: null,
  deliveredAt: null,
  cancelledAt: null,
  cancellationReason: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  attachments: [],
};

function mockActiveUsers() {
  prismaMock.user.findUnique.mockImplementation(
    async (args: { where?: { id?: string } } | undefined) => {
      const id = args?.where?.id;
      if (id === "mkt-1") return { id, role: "marketing", active: true } as never;
      if (id === "member-1") return { id, role: "member", active: true } as never;
      if (id === "member-2") return { id, role: "member", active: true } as never;
      return null;
    },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  _clearUserActiveCache();
  mockActiveUsers();
});

describe("GET /api/creative-requests", () => {
  it("returns 401 with no session", async () => {
    mockNoSession();
    const res = await GET_LIST(createRequest("GET", "/api/creative-requests"));
    expect(res.status).toBe(401);
  });

  it("marketing sees all requests", async () => {
    mockSession({ id: "mkt-1", name: "Tracie", role: "marketing" });
    prismaMock.creativeRequest.findMany.mockResolvedValue([baseRequest] as never);
    const res = await GET_LIST(createRequest("GET", "/api/creative-requests"));
    expect(res.status).toBe(200);
    const findArgs = prismaMock.creativeRequest.findMany.mock.calls[0][0];
    expect(findArgs.where.requestedById).toBeUndefined();
  });

  it("member list is force-scoped to their own requests", async () => {
    mockSession({ id: "member-1", name: "Mirna", role: "member" });
    prismaMock.creativeRequest.findMany.mockResolvedValue([baseRequest] as never);
    const res = await GET_LIST(createRequest("GET", "/api/creative-requests"));
    expect(res.status).toBe(200);
    const findArgs = prismaMock.creativeRequest.findMany.mock.calls[0][0];
    expect(findArgs.where.requestedById).toBe("member-1");
  });

  it("rejects an invalid status filter", async () => {
    mockSession({ id: "mkt-1", name: "Tracie", role: "marketing" });
    const res = await GET_LIST(
      createRequest("GET", "/api/creative-requests?status=bogus"),
    );
    expect(res.status).toBe(400);
  });
});

describe("POST /api/creative-requests", () => {
  it("returns 400 on missing purpose", async () => {
    mockSession({ id: "member-1", name: "Mirna", role: "member" });
    const res = await POST_CREATE(
      createRequest("POST", "/api/creative-requests", {
        body: { title: "Poster", type: "poster" },
      }),
    );
    expect(res.status).toBe(400);
  });

  it("creates with generated number, default due date, and notifies marketing", async () => {
    mockSession({ id: "member-1", name: "Mirna", role: "member" });
    prismaMock.creativeRequest.count.mockResolvedValue(0);
    prismaMock.creativeRequest.create.mockResolvedValue(baseRequest as never);
    prismaMock.user.findMany.mockResolvedValue([{ id: "mkt-1" }] as never);
    prismaMock.userNotification.createMany.mockResolvedValue({ count: 1 } as never);

    const res = await POST_CREATE(
      createRequest("POST", "/api/creative-requests", {
        body: {
          title: "Table cover — Punchbowl",
          type: "table_cover",
          purpose: "School expo stall",
          serviceId: "svc1",
          sizeSpec: "6ft trestle",
          attachments: [
            { fileName: "old-cover.jpg", fileUrl: "https://blob/x.jpg", fileSize: 1000, mimeType: "image/jpeg" },
          ],
        },
      }),
    );
    expect(res.status).toBe(201);
    const createArgs = prismaMock.creativeRequest.create.mock.calls[0][0];
    expect(createArgs.data.requestNumber).toMatch(/^REQ-\d{4}-0001$/);
    expect(createArgs.data.requestedById).toBe("member-1");
    expect(createArgs.data.dueDate).toBeInstanceOf(Date);
    expect(createArgs.data.attachments.create).toHaveLength(1);
    expect(prismaMock.userNotification.createMany).toHaveBeenCalled();
  });

  it("rejects a dueDate in the past", async () => {
    mockSession({ id: "member-1", name: "Mirna", role: "member" });
    const res = await POST_CREATE(
      createRequest("POST", "/api/creative-requests", {
        body: {
          title: "Poster",
          type: "poster",
          purpose: "Open day",
          dueDate: "2020-01-01",
        },
      }),
    );
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/__tests__/api/creative-requests.test.ts`
Expected: FAIL — `Cannot find module '@/app/api/creative-requests/route'`

- [ ] **Step 3: Implement `src/app/api/creative-requests/route.ts`**

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import {
  CreativeRequestStatus,
  CreativeRequestType,
  TicketPriority,
} from "@prisma/client";
import {
  createWithNumberRetry,
  generateRequestNumber,
} from "@/lib/creative-request/request-number";
import { defaultDueDate, isFulfillerRole } from "@/lib/creative-request/constants";
import { notifyRequestSubmitted } from "@/lib/creative-request/notify";

export const requestInclude = {
  service: { select: { id: true, name: true } },
  requestedBy: { select: { id: true, name: true } },
  assignee: { select: { id: true, name: true } },
  attachments: true,
} as const;

// ---------------------------------------------------------------------------
// GET — list. Fulfiller roles see everything (queue); centre roles are
// force-scoped to their own submissions ("My requests").
// ---------------------------------------------------------------------------

const listQuerySchema = z.object({
  status: z.nativeEnum(CreativeRequestStatus).optional(),
  serviceId: z.string().optional(),
  assigneeId: z.string().optional(),
  search: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});

export const GET = withApiAuth(async (req, session) => {
  const { searchParams } = new URL(req.url);
  const parsed = listQuerySchema.safeParse(Object.fromEntries(searchParams));
  if (!parsed.success) {
    throw ApiError.badRequest("Invalid query", parsed.error.flatten());
  }
  const q = parsed.data;

  const where: Record<string, unknown> = {};
  if (q.status) where.status = q.status;
  if (q.serviceId) where.serviceId = q.serviceId;
  if (q.assigneeId) where.assigneeId = q.assigneeId;
  if (q.search) {
    where.OR = [
      { requestNumber: { contains: q.search, mode: "insensitive" } },
      { title: { contains: q.search, mode: "insensitive" } },
    ];
  }
  if (!isFulfillerRole(session.user.role)) {
    where.requestedById = session.user.id;
  }

  const requests = await prisma.creativeRequest.findMany({
    where,
    include: requestInclude,
    orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
    take: q.limit,
  });

  return NextResponse.json({ requests });
});

// ---------------------------------------------------------------------------
// POST — create. Any authenticated dashboard role can submit.
// ---------------------------------------------------------------------------

const attachmentSchema = z.object({
  fileName: z.string().min(1).max(300),
  fileUrl: z.string().url().max(2000),
  fileSize: z.number().int().min(0).optional(),
  mimeType: z.string().max(200).optional(),
});

const createBodySchema = z.object({
  title: z.string().min(1).max(300),
  type: z.nativeEnum(CreativeRequestType),
  purpose: z.string().min(1).max(10000),
  exactCopy: z.string().max(10000).optional(),
  sizeSpec: z.string().max(500).optional(),
  outputFormat: z.string().max(500).optional(),
  serviceId: z.string().optional().nullable(),
  priority: z.nativeEnum(TicketPriority).optional(),
  dueDate: z.coerce.date().optional(),
  attachments: z.array(attachmentSchema).max(10).default([]),
});

export const POST = withApiAuth(async (req, session) => {
  const raw = await parseJsonBody(req);
  const parsed = createBodySchema.safeParse(raw);
  if (!parsed.success) {
    throw ApiError.badRequest("Invalid request payload", parsed.error.flatten());
  }
  const data = parsed.data;

  const now = new Date();
  if (data.dueDate && data.dueDate < now) {
    throw ApiError.badRequest("Due date cannot be in the past");
  }
  const dueDate = data.dueDate ?? defaultDueDate(data.type, now);

  const created = await createWithNumberRetry(
    (requestNumber) =>
      prisma.creativeRequest.create({
        data: {
          requestNumber,
          title: data.title,
          type: data.type,
          purpose: data.purpose,
          exactCopy: data.exactCopy ?? null,
          sizeSpec: data.sizeSpec ?? null,
          outputFormat: data.outputFormat ?? null,
          serviceId: data.serviceId ?? null,
          priority: data.priority ?? "normal",
          dueDate,
          requestedById: session.user.id,
          attachments: {
            create: data.attachments.map((a) => ({
              fileName: a.fileName,
              fileUrl: a.fileUrl,
              fileSize: a.fileSize ?? null,
              mimeType: a.mimeType ?? null,
              uploadedById: session.user.id,
            })),
          },
        },
        include: requestInclude,
      }),
    () => generateRequestNumber(prisma, now.getFullYear()),
  );

  await notifyRequestSubmitted(prisma, created);

  return NextResponse.json({ request: created }, { status: 201 });
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/api/creative-requests.test.ts`
Expected: PASS (7 tests so far)

- [ ] **Step 5: Commit**

```bash
git add src/app/api/creative-requests/route.ts src/__tests__/api/creative-requests.test.ts
git commit -m "feat(creative-requests): list + create API"
```

### Task 6: Detail + transition/assign/cancel API route

**Files:**
- Create: `src/app/api/creative-requests/[id]/route.ts`
- Test: append to `src/__tests__/api/creative-requests.test.ts`

- [ ] **Step 1: Write the failing tests (append to the test file)**

Add to imports: `import { GET as GET_DETAIL, PATCH as PATCH_REQUEST } from "@/app/api/creative-requests/[id]/route";` and the ctx helper below the existing consts:

```ts
const ctx = (id: string) => ({ params: Promise.resolve({ id }) }) as never;
```

Append:

```ts
describe("GET /api/creative-requests/[id]", () => {
  it("404s for a member who doesn't own the request", async () => {
    mockSession({ id: "member-2", name: "Other", role: "member" });
    prismaMock.creativeRequest.findUnique.mockResolvedValue(baseRequest as never);
    const res = await GET_DETAIL(
      createRequest("GET", "/api/creative-requests/cr1"),
      ctx("cr1"),
    );
    expect(res.status).toBe(404);
  });

  it("returns the request for its owner", async () => {
    mockSession({ id: "member-1", name: "Mirna", role: "member" });
    prismaMock.creativeRequest.findUnique.mockResolvedValue(baseRequest as never);
    const res = await GET_DETAIL(
      createRequest("GET", "/api/creative-requests/cr1"),
      ctx("cr1"),
    );
    expect(res.status).toBe(200);
  });
});

describe("PATCH /api/creative-requests/[id]", () => {
  it("403s a member trying to transition someone's request", async () => {
    mockSession({ id: "member-2", name: "Other", role: "member" });
    prismaMock.creativeRequest.findUnique.mockResolvedValue(baseRequest as never);
    const res = await PATCH_REQUEST(
      createRequest("PATCH", "/api/creative-requests/cr1", {
        body: { status: "briefed" },
      }),
      ctx("cr1"),
    );
    expect(res.status).toBe(403);
  });

  it("owner can cancel while status is new (with reason)", async () => {
    mockSession({ id: "member-1", name: "Mirna", role: "member" });
    prismaMock.creativeRequest.findUnique.mockResolvedValue(baseRequest as never);
    prismaMock.creativeRequest.update.mockResolvedValue({
      ...baseRequest,
      status: "cancelled",
    } as never);
    prismaMock.userNotification.createMany.mockResolvedValue({ count: 0 } as never);
    const res = await PATCH_REQUEST(
      createRequest("PATCH", "/api/creative-requests/cr1", {
        body: { status: "cancelled", cancellationReason: "No longer needed" },
      }),
      ctx("cr1"),
    );
    expect(res.status).toBe(200);
    const updateArgs = prismaMock.creativeRequest.update.mock.calls[0][0];
    expect(updateArgs.data.status).toBe("cancelled");
    expect(updateArgs.data.cancelledAt).toBeInstanceOf(Date);
  });

  it("owner cannot make a non-cancel transition", async () => {
    mockSession({ id: "member-1", name: "Mirna", role: "member" });
    prismaMock.creativeRequest.findUnique.mockResolvedValue(baseRequest as never);
    const res = await PATCH_REQUEST(
      createRequest("PATCH", "/api/creative-requests/cr1", {
        body: { status: "briefed" },
      }),
      ctx("cr1"),
    );
    expect(res.status).toBe(403);
  });

  it("rejects an invalid transition (new → approved)", async () => {
    mockSession({ id: "mkt-1", name: "Tracie", role: "marketing" });
    prismaMock.creativeRequest.findUnique.mockResolvedValue(baseRequest as never);
    const res = await PATCH_REQUEST(
      createRequest("PATCH", "/api/creative-requests/cr1", {
        body: { status: "approved" },
      }),
      ctx("cr1"),
    );
    expect(res.status).toBe(409);
  });

  it("marketing transition stamps the stage timestamp and notifies requester", async () => {
    mockSession({ id: "mkt-1", name: "Tracie", role: "marketing" });
    prismaMock.creativeRequest.findUnique.mockResolvedValue(baseRequest as never);
    prismaMock.creativeRequest.update.mockResolvedValue({
      ...baseRequest,
      status: "briefed",
    } as never);
    prismaMock.userNotification.createMany.mockResolvedValue({ count: 1 } as never);
    const res = await PATCH_REQUEST(
      createRequest("PATCH", "/api/creative-requests/cr1", {
        body: { status: "briefed" },
      }),
      ctx("cr1"),
    );
    expect(res.status).toBe(200);
    const updateArgs = prismaMock.creativeRequest.update.mock.calls[0][0];
    expect(updateArgs.data.briefedAt).toBeInstanceOf(Date);
    expect(prismaMock.userNotification.createMany).toHaveBeenCalled();
  });

  it("marketing can assign, which notifies the assignee", async () => {
    mockSession({ id: "mkt-1", name: "Tracie", role: "marketing" });
    prismaMock.creativeRequest.findUnique.mockResolvedValue(baseRequest as never);
    prismaMock.creativeRequest.update.mockResolvedValue({
      ...baseRequest,
      assigneeId: "mkt-2",
      assignee: { id: "mkt-2", name: "Akram" },
    } as never);
    prismaMock.userNotification.createMany.mockResolvedValue({ count: 1 } as never);
    const res = await PATCH_REQUEST(
      createRequest("PATCH", "/api/creative-requests/cr1", {
        body: { assigneeId: "mkt-2" },
      }),
      ctx("cr1"),
    );
    expect(res.status).toBe(200);
    expect(prismaMock.userNotification.createMany).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `npx vitest run src/__tests__/api/creative-requests.test.ts`
Expected: FAIL — `Cannot find module '@/app/api/creative-requests/[id]/route'`

- [ ] **Step 3: Implement `src/app/api/creative-requests/[id]/route.ts`**

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { CreativeRequestStatus, TicketPriority } from "@prisma/client";
import {
  STATUS_TIMESTAMP_FIELD,
  isFulfillerRole,
  isValidTransition,
} from "@/lib/creative-request/constants";
import {
  notifyRequestAssigned,
  notifyRequestStatusChanged,
} from "@/lib/creative-request/notify";
import { requestInclude } from "../route";

type RouteCtx = { params: Promise<{ id: string }> };

/** Statuses a requester may cancel from (before real work is sunk). */
const REQUESTER_CANCELLABLE: CreativeRequestStatus[] = ["new", "briefed"];

// ---------------------------------------------------------------------------
// GET — detail. Fulfiller roles or the requester only; others get 404
// (not 403 — don't leak existence).
// ---------------------------------------------------------------------------

export const GET = withApiAuth(async (_req, session, context) => {
  const { id } = await (context as unknown as RouteCtx).params;
  const request = await prisma.creativeRequest.findUnique({
    where: { id },
    include: requestInclude,
  });
  if (
    !request ||
    (!isFulfillerRole(session.user.role) && request.requestedById !== session.user.id)
  ) {
    throw ApiError.notFound("Request not found");
  }
  return NextResponse.json({ request });
});

// ---------------------------------------------------------------------------
// PATCH — transition / assign / reprioritise / redate (fulfiller roles),
// or cancel-own (requester, while new/briefed).
// ---------------------------------------------------------------------------

const patchBodySchema = z
  .object({
    status: z.nativeEnum(CreativeRequestStatus).optional(),
    assigneeId: z.string().nullable().optional(),
    priority: z.nativeEnum(TicketPriority).optional(),
    dueDate: z.coerce.date().optional(),
    cancellationReason: z.string().max(2000).optional(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: "Empty patch" });

export const PATCH = withApiAuth(async (req, session, context) => {
  const { id } = await (context as unknown as RouteCtx).params;
  const raw = await parseJsonBody(req);
  const parsed = patchBodySchema.safeParse(raw);
  if (!parsed.success) {
    throw ApiError.badRequest("Invalid patch payload", parsed.error.flatten());
  }
  const patch = parsed.data;

  const existing = await prisma.creativeRequest.findUnique({
    where: { id },
    select: { id: true, requestNumber: true, title: true, status: true, requestedById: true, assigneeId: true },
  });
  if (!existing) throw ApiError.notFound("Request not found");

  const fulfiller = isFulfillerRole(session.user.role);
  const isOwner = existing.requestedById === session.user.id;

  if (!fulfiller) {
    // Requesters may ONLY cancel their own early-stage request.
    const isCancelOnly =
      isOwner &&
      patch.status === "cancelled" &&
      patch.assigneeId === undefined &&
      patch.priority === undefined &&
      patch.dueDate === undefined;
    if (!isCancelOnly) {
      throw ApiError.forbidden("Only the marketing team can update requests");
    }
    if (!REQUESTER_CANCELLABLE.includes(existing.status)) {
      throw ApiError.conflict("This request is already in progress — message the team instead");
    }
  }

  const data: Record<string, unknown> = {};

  if (patch.status) {
    if (!isValidTransition(existing.status, patch.status)) {
      throw ApiError.conflict(
        `Cannot move from ${existing.status} to ${patch.status}`,
      );
    }
    data.status = patch.status;
    const tsField = STATUS_TIMESTAMP_FIELD[patch.status];
    if (tsField) data[tsField] = new Date();
    if (patch.status === "cancelled") {
      data.cancellationReason = patch.cancellationReason ?? null;
    }
  }
  if (patch.assigneeId !== undefined) data.assigneeId = patch.assigneeId;
  if (patch.priority) data.priority = patch.priority;
  if (patch.dueDate) data.dueDate = patch.dueDate;

  const updated = await prisma.creativeRequest.update({
    where: { id },
    data,
    include: requestInclude,
  });

  if (patch.status) {
    await notifyRequestStatusChanged(prisma, updated, patch.status, session.user.id);
  }
  if (patch.assigneeId !== undefined && patch.assigneeId !== existing.assigneeId) {
    await notifyRequestAssigned(prisma, updated, session.user.id);
  }

  return NextResponse.json({ request: updated });
});
```

Note: `ApiError.conflict(msg)` verified to exist in `src/lib/api-error.ts` (custom message supported).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/api/creative-requests.test.ts`
Expected: PASS (all so far)

- [ ] **Step 5: Commit**

```bash
git add "src/app/api/creative-requests/[id]/route.ts" src/__tests__/api/creative-requests.test.ts
git commit -m "feat(creative-requests): detail + transition/assign/cancel API"
```

### Task 7: Messages API route (thread with internal notes)

**Files:**
- Create: `src/app/api/creative-requests/[id]/messages/route.ts`
- Test: append to `src/__tests__/api/creative-requests.test.ts`

- [ ] **Step 1: Write the failing tests (append)**

Add import: `import { GET as GET_MESSAGES, POST as POST_MESSAGE } from "@/app/api/creative-requests/[id]/messages/route";`

```ts
describe("GET /api/creative-requests/[id]/messages", () => {
  const messages = [
    { id: "m1", requestId: "cr1", authorId: "member-1", author: { id: "member-1", name: "Mirna" }, body: "Logo bigger please", internal: false, createdAt: new Date(), attachments: [] },
    { id: "m2", requestId: "cr1", authorId: "mkt-1", author: { id: "mkt-1", name: "Tracie" }, body: "QR was regenerated", internal: true, createdAt: new Date(), attachments: [] },
  ];

  it("requester never receives internal messages", async () => {
    mockSession({ id: "member-1", name: "Mirna", role: "member" });
    prismaMock.creativeRequest.findUnique.mockResolvedValue(baseRequest as never);
    prismaMock.creativeRequestMessage.findMany.mockResolvedValue(
      messages.filter((m) => !m.internal) as never,
    );
    const res = await GET_MESSAGES(
      createRequest("GET", "/api/creative-requests/cr1/messages"),
      ctx("cr1"),
    );
    expect(res.status).toBe(200);
    const findArgs = prismaMock.creativeRequestMessage.findMany.mock.calls[0][0];
    expect(findArgs.where.internal).toBe(false);
  });

  it("marketing receives the full thread", async () => {
    mockSession({ id: "mkt-1", name: "Tracie", role: "marketing" });
    prismaMock.creativeRequest.findUnique.mockResolvedValue(baseRequest as never);
    prismaMock.creativeRequestMessage.findMany.mockResolvedValue(messages as never);
    const res = await GET_MESSAGES(
      createRequest("GET", "/api/creative-requests/cr1/messages"),
      ctx("cr1"),
    );
    const findArgs = prismaMock.creativeRequestMessage.findMany.mock.calls[0][0];
    expect(findArgs.where.internal).toBeUndefined();
  });
});

describe("POST /api/creative-requests/[id]/messages", () => {
  it("404s a non-participant member (existence not leaked)", async () => {
    mockSession({ id: "member-2", name: "Other", role: "member" });
    prismaMock.creativeRequest.findUnique.mockResolvedValue(baseRequest as never);
    const res = await POST_MESSAGE(
      createRequest("POST", "/api/creative-requests/cr1/messages", {
        body: { body: "hi" },
      }),
      ctx("cr1"),
    );
    expect(res.status).toBe(404);
  });

  it("forces internal=false for the requester", async () => {
    mockSession({ id: "member-1", name: "Mirna", role: "member" });
    prismaMock.creativeRequest.findUnique.mockResolvedValue(baseRequest as never);
    prismaMock.creativeRequestMessage.create.mockResolvedValue({
      id: "m3", requestId: "cr1", authorId: "member-1", body: "hi", internal: false, createdAt: new Date(), author: { id: "member-1", name: "Mirna" }, attachments: [],
    } as never);
    prismaMock.userNotification.createMany.mockResolvedValue({ count: 0 } as never);
    const res = await POST_MESSAGE(
      createRequest("POST", "/api/creative-requests/cr1/messages", {
        body: { body: "hi", internal: true }, // requester tries to flag internal
      }),
      ctx("cr1"),
    );
    expect(res.status).toBe(201);
    const createArgs = prismaMock.creativeRequestMessage.create.mock.calls[0][0];
    expect(createArgs.data.internal).toBe(false);
  });

  it("marketing internal note is stored internal and creates no requester notification", async () => {
    mockSession({ id: "mkt-1", name: "Tracie", role: "marketing" });
    prismaMock.creativeRequest.findUnique.mockResolvedValue(baseRequest as never);
    prismaMock.creativeRequestMessage.create.mockResolvedValue({
      id: "m4", requestId: "cr1", authorId: "mkt-1", body: "note", internal: true, createdAt: new Date(), author: { id: "mkt-1", name: "Tracie" }, attachments: [],
    } as never);
    const res = await POST_MESSAGE(
      createRequest("POST", "/api/creative-requests/cr1/messages", {
        body: { body: "note", internal: true },
      }),
      ctx("cr1"),
    );
    expect(res.status).toBe(201);
    const createArgs = prismaMock.creativeRequestMessage.create.mock.calls[0][0];
    expect(createArgs.data.internal).toBe(true);
    expect(prismaMock.userNotification.createMany).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `npx vitest run src/__tests__/api/creative-requests.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement `src/app/api/creative-requests/[id]/messages/route.ts`**

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { isFulfillerRole } from "@/lib/creative-request/constants";
import { notifyRequestMessage } from "@/lib/creative-request/notify";

type RouteCtx = { params: Promise<{ id: string }> };

const messageInclude = {
  author: { select: { id: true, name: true } },
  attachments: true,
} as const;

/** Load the request and 404 unless the caller is a fulfiller or the requester. */
async function loadForParticipant(id: string, userId: string, role: string) {
  const request = await prisma.creativeRequest.findUnique({
    where: { id },
    select: { id: true, requestNumber: true, title: true, requestedById: true, assigneeId: true },
  });
  if (!request || (!isFulfillerRole(role) && request.requestedById !== userId)) {
    throw ApiError.notFound("Request not found");
  }
  return request;
}

// ---------------------------------------------------------------------------
// GET — thread. Internal notes are stripped for non-fulfillers at the QUERY
// level (never fetched, not just hidden).
// ---------------------------------------------------------------------------

export const GET = withApiAuth(async (_req, session, context) => {
  const { id } = await (context as unknown as RouteCtx).params;
  await loadForParticipant(id, session.user.id, session.user.role);

  const fulfiller = isFulfillerRole(session.user.role);
  const messages = await prisma.creativeRequestMessage.findMany({
    where: { requestId: id, ...(fulfiller ? {} : { internal: false }) },
    include: messageInclude,
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json({ messages });
});

// ---------------------------------------------------------------------------
// POST — add a message. `internal` is only honoured for fulfiller roles.
// ---------------------------------------------------------------------------

const postBodySchema = z.object({
  body: z.string().min(1).max(10000),
  internal: z.boolean().default(false),
  attachments: z
    .array(
      z.object({
        fileName: z.string().min(1).max(300),
        fileUrl: z.string().url().max(2000),
        fileSize: z.number().int().min(0).optional(),
        mimeType: z.string().max(200).optional(),
      }),
    )
    .max(10)
    .default([]),
});

export const POST = withApiAuth(async (req, session, context) => {
  const { id } = await (context as unknown as RouteCtx).params;
  const request = await loadForParticipant(id, session.user.id, session.user.role);

  const raw = await parseJsonBody(req);
  const parsed = postBodySchema.safeParse(raw);
  if (!parsed.success) {
    throw ApiError.badRequest("Invalid message payload", parsed.error.flatten());
  }
  const fulfiller = isFulfillerRole(session.user.role);
  const internal = fulfiller && parsed.data.internal;

  const message = await prisma.creativeRequestMessage.create({
    data: {
      requestId: id,
      authorId: session.user.id,
      body: parsed.data.body,
      internal,
      attachments: {
        create: parsed.data.attachments.map((a) => ({
          requestId: id,
          fileName: a.fileName,
          fileUrl: a.fileUrl,
          fileSize: a.fileSize ?? null,
          mimeType: a.mimeType ?? null,
          uploadedById: session.user.id,
        })),
      },
    },
    include: messageInclude,
  });

  await notifyRequestMessage(prisma, request, session.user.id, internal);

  return NextResponse.json({ message }, { status: 201 });
});
```

- [ ] **Step 4: Run the full test file**

Run: `npx vitest run src/__tests__/api/creative-requests.test.ts`
Expected: PASS (all tests)

- [ ] **Step 5: Run the whole unit suite to catch regressions**

Run: `npm test`
Expected: 0 failures (4,240+ passing)

- [ ] **Step 6: Commit**

```bash
git add "src/app/api/creative-requests/[id]/messages/route.ts" src/__tests__/api/creative-requests.test.ts
git commit -m "feat(creative-requests): thread API with internal-note filtering"
```

---

## Chunk 2: Frontend — hook, page, components, nav/role wiring

### Task 8: Data hook

**Files:**
- Create: `src/hooks/useCreativeRequests.ts`

No unit tests for hooks (project convention — hooks are exercised via route tests + E2E). Follow `useVendorBriefs.ts` structure exactly.

- [ ] **Step 1: Implement `src/hooks/useCreativeRequests.ts`**

```ts
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchApi, mutateApi } from "@/lib/fetch-api";
import { toast } from "@/hooks/useToast";
import type {
  CreativeRequestStatus,
  CreativeRequestType,
  TicketPriority,
} from "@prisma/client";

// ---------------------------------------------------------------------------
// Types — mirror the route response shapes
// ---------------------------------------------------------------------------

export interface RequestAttachment {
  id: string;
  fileName: string;
  fileUrl: string;
  fileSize: number | null;
  mimeType: string | null;
  messageId: string | null;
}

export interface CreativeRequestItem {
  id: string;
  requestNumber: string;
  title: string;
  type: CreativeRequestType;
  status: CreativeRequestStatus;
  priority: TicketPriority;
  serviceId: string | null;
  service: { id: string; name: string } | null;
  requestedById: string;
  requestedBy: { id: string; name: string | null } | null;
  assigneeId: string | null;
  assignee: { id: string; name: string | null } | null;
  purpose: string;
  exactCopy: string | null;
  sizeSpec: string | null;
  outputFormat: string | null;
  dueDate: string;
  briefedAt: string | null;
  inProgressAt: string | null;
  inReviewAt: string | null;
  changesRequestedAt: string | null;
  approvedAt: string | null;
  deliveredAt: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
  createdAt: string;
  updatedAt: string;
  attachments: RequestAttachment[];
}

export interface RequestMessage {
  id: string;
  authorId: string;
  author: { id: string; name: string | null } | null;
  body: string;
  internal: boolean;
  createdAt: string;
  attachments: RequestAttachment[];
}

export interface AttachmentInput {
  fileName: string;
  fileUrl: string;
  fileSize?: number;
  mimeType?: string;
}

export interface CreateRequestInput {
  title: string;
  type: CreativeRequestType;
  purpose: string;
  exactCopy?: string;
  sizeSpec?: string;
  outputFormat?: string;
  serviceId?: string | null;
  priority?: TicketPriority;
  dueDate?: string;
  attachments?: AttachmentInput[];
}

export interface PatchRequestInput {
  status?: CreativeRequestStatus;
  assigneeId?: string | null;
  priority?: TicketPriority;
  dueDate?: string;
  cancellationReason?: string;
}

const onError = (err: Error) => {
  toast({ variant: "destructive", description: err.message || "Something went wrong" });
};

// ---------------------------------------------------------------------------
// Queries — primitive-only query keys
// ---------------------------------------------------------------------------

export function useCreativeRequests(filters?: {
  status?: CreativeRequestStatus;
  serviceId?: string;
  assigneeId?: string;
  search?: string;
}) {
  const params = new URLSearchParams();
  if (filters?.status) params.set("status", filters.status);
  if (filters?.serviceId) params.set("serviceId", filters.serviceId);
  if (filters?.assigneeId) params.set("assigneeId", filters.assigneeId);
  if (filters?.search) params.set("search", filters.search);
  const qs = params.toString();

  return useQuery({
    queryKey: [
      "creative-requests",
      filters?.status ?? null,
      filters?.serviceId ?? null,
      filters?.assigneeId ?? null,
      filters?.search ?? null,
    ],
    queryFn: () =>
      fetchApi<{ requests: CreativeRequestItem[] }>(
        `/api/creative-requests${qs ? `?${qs}` : ""}`,
      ),
    retry: 2,
    staleTime: 30_000,
  });
}

export function useCreativeRequest(id: string | null) {
  return useQuery({
    queryKey: ["creative-request", id],
    queryFn: () =>
      fetchApi<{ request: CreativeRequestItem }>(`/api/creative-requests/${id}`),
    enabled: !!id,
    retry: 2,
    staleTime: 30_000,
  });
}

export function useRequestMessages(id: string | null) {
  return useQuery({
    queryKey: ["creative-request-messages", id],
    queryFn: () =>
      fetchApi<{ messages: RequestMessage[] }>(
        `/api/creative-requests/${id}/messages`,
      ),
    enabled: !!id,
    retry: 2,
    staleTime: 15_000,
  });
}

// ---------------------------------------------------------------------------
// Mutations — all with destructive-toast onError
// ---------------------------------------------------------------------------

export function useCreateRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateRequestInput) =>
      mutateApi<{ request: CreativeRequestItem }>("/api/creative-requests", {
        method: "POST",
        body: input,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["creative-requests"] });
      toast({ description: "Request submitted — the marketing team has been notified" });
    },
    onError,
  });
}

export function usePatchRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: PatchRequestInput & { id: string }) =>
      mutateApi<{ request: CreativeRequestItem }>(`/api/creative-requests/${id}`, {
        method: "PATCH",
        body: input,
      }),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["creative-requests"] });
      qc.invalidateQueries({ queryKey: ["creative-request", vars.id] });
    },
    onError,
  });
}

export function usePostRequestMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...input
    }: {
      id: string;
      body: string;
      internal?: boolean;
      attachments?: AttachmentInput[];
    }) =>
      mutateApi<{ message: RequestMessage }>(`/api/creative-requests/${id}/messages`, {
        method: "POST",
        body: input,
      }),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["creative-request-messages", vars.id] });
    },
    onError,
  });
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit; echo "exit: $?"` then re-run piped through `grep -i creative` if the exit code is non-zero.
Expected: pre-existing errors unrelated to `creative` are acceptable; there must be ZERO errors mentioning creative-request files. (`fetchApi`/`mutateApi`/`toast` signatures were verified against the repo during plan review.)

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useCreativeRequests.ts
git commit -m "feat(creative-requests): useCreativeRequests hook"
```

### Task 9: Page + components

**Files:**
- Create: `src/app/(dashboard)/requests/page.tsx`
- Create: `src/components/requests/RequestBoard.tsx`
- Create: `src/components/requests/RequestCard.tsx`
- Create: `src/components/requests/RequestDetailPanel.tsx`
- Create: `src/components/requests/NewRequestModal.tsx`
- Create: `src/components/requests/MyRequestsList.tsx`

UI conventions: design tokens only, `Button` from `@/components/ui/Button`, `PageHeader` from `@/components/layout/PageHeader`, mobile breakpoint `sm:`. Before writing, skim `src/components/marketing/TasksTab.tsx` and `src/components/tickets/TicketDetailPanel.tsx` for the house slide-over/board idioms and reuse their class patterns. The code below is the complete intended structure; adjust class strings to match what those files use if they differ.

- [ ] **Step 1: Implement `src/app/(dashboard)/requests/page.tsx`**

```tsx
"use client";

import { Suspense, useCallback, useState } from "react";
import { useSession } from "next-auth/react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { isFulfillerRole } from "@/lib/creative-request/constants";
import { RequestBoard } from "@/components/requests/RequestBoard";
import { MyRequestsList } from "@/components/requests/MyRequestsList";
import { NewRequestModal } from "@/components/requests/NewRequestModal";
import { RequestDetailPanel } from "@/components/requests/RequestDetailPanel";

function RequestsContent() {
  const { data: session } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const role = session?.user?.role ?? "staff";
  const fulfiller = isFulfillerRole(role);

  const [showNew, setShowNew] = useState(false);
  // Deep-linkable detail: /requests?open=<id> (notifications link here)
  const openId = searchParams.get("open");

  const setOpenId = useCallback(
    (id: string | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (id) params.set("open", id);
      else params.delete("open");
      router.replace(`${pathname}${params.size ? `?${params}` : ""}`, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  return (
    <div>
      <PageHeader
        title="Design Requests"
        description={
          fulfiller
            ? "The creative queue — triage, produce, deliver"
            : "Request design work from the marketing team and track progress"
        }
        primaryAction={{
          label: "New request",
          icon: Plus,
          onClick: () => setShowNew(true),
        }}
      />

      {fulfiller ? (
        <RequestBoard onOpen={setOpenId} />
      ) : (
        <MyRequestsList onOpen={setOpenId} />
      )}

      {showNew && <NewRequestModal onClose={() => setShowNew(false)} />}
      {openId && (
        <RequestDetailPanel
          requestId={openId}
          fulfiller={fulfiller}
          currentUserId={session?.user?.id ?? ""}
          onClose={() => setOpenId(null)}
        />
      )}
    </div>
  );
}

export default function RequestsPage() {
  return (
    <Suspense fallback={null}>
      <RequestsContent />
    </Suspense>
  );
}
```

`PageHeader` verified: `primaryAction?: PageHeaderAction` where `PageHeaderAction = { label, icon: LucideIcon (required), onClick, loading?, hidden? }` — on mobile only the icon shows.

- [ ] **Step 2: Implement `src/components/requests/RequestCard.tsx`**

```tsx
"use client";

import type { CreativeRequestItem } from "@/hooks/useCreativeRequests";
import { TYPE_LABELS } from "@/lib/creative-request/constants";

function dueChip(dueDate: string, status: string) {
  if (["delivered", "cancelled"].includes(status)) return null;
  const days = Math.ceil((new Date(dueDate).getTime() - Date.now()) / 86_400_000);
  if (days < 0)
    return (
      <span className="text-2xs font-semibold rounded px-1.5 py-0.5 bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300">
        {Math.abs(days)}d overdue
      </span>
    );
  if (days <= 2)
    return (
      <span className="text-2xs font-semibold rounded px-1.5 py-0.5 bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
        Due in {days}d
      </span>
    );
  return (
    <span className="text-2xs font-semibold rounded px-1.5 py-0.5 bg-surface text-muted">
      Due in {days}d
    </span>
  );
}

export function RequestCard({
  request,
  onOpen,
}: {
  request: CreativeRequestItem;
  onOpen: (id: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen(request.id)}
      className="w-full text-left bg-card border border-border rounded-lg p-3 hover:shadow-sm transition-shadow"
    >
      <div className="text-2xs font-mono text-muted">{request.requestNumber}</div>
      <div className="text-sm font-medium text-foreground mt-0.5 line-clamp-2">
        {request.title}
      </div>
      <div className="flex items-center gap-1.5 mt-2 flex-wrap">
        <span className="text-2xs font-semibold rounded px-1.5 py-0.5 bg-surface text-muted">
          {TYPE_LABELS[request.type]}
        </span>
        {dueChip(request.dueDate, request.status)}
        {request.service && (
          <span className="text-2xs text-muted">{request.service.name}</span>
        )}
        {request.assignee?.name && (
          <span
            className="ml-auto w-5 h-5 rounded-full bg-brand text-white text-2xs font-bold flex items-center justify-center"
            title={request.assignee.name}
          >
            {request.assignee.name.slice(0, 1).toUpperCase()}
          </span>
        )}
      </div>
    </button>
  );
}
```

- [ ] **Step 3: Implement `src/components/requests/RequestBoard.tsx`**

```tsx
"use client";

import { useCreativeRequests } from "@/hooks/useCreativeRequests";
import { STATUS_LABELS } from "@/lib/creative-request/constants";
import type { CreativeRequestStatus } from "@prisma/client";
import { RequestCard } from "./RequestCard";
import { Skeleton } from "@/components/ui/Skeleton";

const BOARD_COLUMNS: CreativeRequestStatus[] = [
  "new",
  "briefed",
  "in_progress",
  "in_review",
  "changes_requested",
  "approved",
  "delivered",
];

export function RequestBoard({ onOpen }: { onOpen: (id: string) => void }) {
  const { data, isLoading } = useCreativeRequests();

  if (isLoading) {
    return (
      <div className="flex gap-3 overflow-x-auto pb-2">
        {BOARD_COLUMNS.slice(0, 5).map((c) => (
          <Skeleton key={c} className="h-64 min-w-[220px] flex-1 rounded-lg" />
        ))}
      </div>
    );
  }

  const requests = data?.requests ?? [];

  return (
    <div className="flex gap-3 overflow-x-auto pb-2" aria-label="Request pipeline">
      {BOARD_COLUMNS.map((status) => {
        const items = requests.filter((r) => r.status === status);
        return (
          <div
            key={status}
            className="min-w-[220px] flex-1 bg-surface rounded-lg p-2.5"
          >
            <div className="flex items-center gap-2 px-1 pb-2">
              <h3 className="text-2xs font-semibold uppercase tracking-wide text-muted">
                {STATUS_LABELS[status]}
              </h3>
              <span className="text-2xs bg-card border border-border rounded-full px-1.5 text-foreground">
                {items.length}
              </span>
            </div>
            <div className="space-y-2">
              {items.map((r) => (
                <RequestCard key={r.id} request={r} onOpen={onOpen} />
              ))}
              {items.length === 0 && (
                <p className="text-2xs text-muted px-1 py-3">Nothing here</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: Implement `src/components/requests/MyRequestsList.tsx`**

```tsx
"use client";

import { useCreativeRequests } from "@/hooks/useCreativeRequests";
import { STATUS_LABELS, TYPE_LABELS } from "@/lib/creative-request/constants";
import { Skeleton } from "@/components/ui/Skeleton";

const STATUS_BADGE: Record<string, string> = {
  new: "bg-surface text-muted",
  briefed: "bg-status-confirmed-bg text-status-confirmed-fg",
  in_progress: "bg-status-confirmed-bg text-status-confirmed-fg",
  in_review: "bg-status-pending-bg text-status-pending-fg",
  changes_requested: "bg-status-pending-bg text-status-pending-fg",
  approved: "bg-status-in-care-bg text-status-in-care-fg",
  delivered: "bg-status-in-care-bg text-status-in-care-fg",
  cancelled: "bg-surface text-muted",
};

/** Plain-language status for requesters (JSM portal pattern). */
const REQUESTER_STATUS: Record<string, string> = {
  new: "Submitted — awaiting triage",
  briefed: "Brief confirmed",
  in_progress: "Being designed",
  in_review: "Ready for your review",
  changes_requested: "Changes underway",
  approved: "Approved",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

export function MyRequestsList({ onOpen }: { onOpen: (id: string) => void }) {
  const { data, isLoading } = useCreativeRequests();

  if (isLoading) return <Skeleton className="h-48 rounded-lg" />;
  const requests = data?.requests ?? [];

  if (requests.length === 0) {
    return (
      <div className="bg-card border border-border rounded-lg p-8 text-center">
        <p className="text-sm text-muted">
          No requests yet. Need a poster, flyer or table cover? Hit “New request”.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-lg overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left">
            <th className="px-4 py-2.5 text-2xs font-semibold uppercase tracking-wide text-muted">Request</th>
            <th className="px-4 py-2.5 text-2xs font-semibold uppercase tracking-wide text-muted">Type</th>
            <th className="px-4 py-2.5 text-2xs font-semibold uppercase tracking-wide text-muted">Status</th>
            <th className="px-4 py-2.5 text-2xs font-semibold uppercase tracking-wide text-muted">Due</th>
          </tr>
        </thead>
        <tbody>
          {requests.map((r) => (
            <tr
              key={r.id}
              onClick={() => onOpen(r.id)}
              className="border-b border-border last:border-0 cursor-pointer hover:bg-surface"
            >
              <td className="px-4 py-3">
                <span className="font-mono text-2xs text-muted mr-2">{r.requestNumber}</span>
                <span className="text-foreground font-medium">{r.title}</span>
              </td>
              <td className="px-4 py-3 text-muted">{TYPE_LABELS[r.type]}</td>
              <td className="px-4 py-3">
                <span className={`text-2xs font-semibold rounded px-2 py-0.5 ${STATUS_BADGE[r.status] ?? ""}`}>
                  {REQUESTER_STATUS[r.status] ?? STATUS_LABELS[r.status]}
                </span>
              </td>
              <td className="px-4 py-3 text-muted whitespace-nowrap">
                {new Date(r.dueDate).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

Note: verify the `bg-status-*` token utility names against `src/app/globals.css` (`--color-status-*`) — if utilities aren't generated for them, use the amber/emerald `dark:`-paired classes as in `RequestCard`.

- [ ] **Step 5: Implement `src/components/requests/NewRequestModal.tsx`**

Type picker grid + brief fields + attachment upload via `/api/upload` (multipart POST, response `{ fileName, fileUrl, fileSize, mimeType }`).

```tsx
"use client";

import { useRef, useState } from "react";
import type { CreativeRequestType } from "@prisma/client";
import { Button } from "@/components/ui/Button";
import { toast } from "@/hooks/useToast";
import {
  TURNAROUND_BUSINESS_DAYS,
  TYPE_LABELS,
  defaultDueDate,
} from "@/lib/creative-request/constants";
import {
  useCreateRequest,
  type AttachmentInput,
} from "@/hooks/useCreativeRequests";
import { useServices } from "@/hooks/useServices";

const TYPE_ICONS: Record<CreativeRequestType, string> = {
  flyer: "📄",
  poster: "🖼️",
  social_tile: "📱",
  table_cover: "🪑",
  banner_signage: "🚩",
  email_header: "✉️",
  merch: "👕",
  other: "✨",
};

const TYPES = Object.keys(TYPE_LABELS) as CreativeRequestType[];

export function NewRequestModal({ onClose }: { onClose: () => void }) {
  const createRequest = useCreateRequest();
  const { data: servicesData } = useServices();
  const fileInput = useRef<HTMLInputElement>(null);

  const [type, setType] = useState<CreativeRequestType | null>(null);
  const [title, setTitle] = useState("");
  const [purpose, setPurpose] = useState("");
  const [exactCopy, setExactCopy] = useState("");
  const [sizeSpec, setSizeSpec] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [attachments, setAttachments] = useState<AttachmentInput[]>([]);
  const [uploading, setUploading] = useState(false);

  const minDue = type
    ? defaultDueDate(type).toISOString().slice(0, 10)
    : new Date().toISOString().slice(0, 10);

  async function handleUpload(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch("/api/upload", { method: "POST", body: fd });
        if (!res.ok) {
          const err = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(err?.error || "Upload failed");
        }
        const json = (await res.json()) as {
          fileName: string;
          fileUrl: string;
          fileSize: number;
          mimeType: string;
        };
        setAttachments((prev) => [...prev, json]);
      }
    } catch (err) {
      toast({
        variant: "destructive",
        description: err instanceof Error && err.message !== "Upload failed"
          ? err.message
          : "File upload failed — try again",
      });
    } finally {
      setUploading(false);
    }
  }

  function submit() {
    if (!type || !title.trim() || !purpose.trim()) {
      toast({ variant: "destructive", description: "Pick a type and fill in the title and purpose" });
      return;
    }
    createRequest.mutate(
      {
        type,
        title: title.trim(),
        purpose: purpose.trim(),
        exactCopy: exactCopy.trim() || undefined,
        sizeSpec: sizeSpec.trim() || undefined,
        serviceId: serviceId || undefined,
        dueDate: dueDate || undefined,
        attachments,
      },
      { onSuccess: onClose },
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-6" role="dialog" aria-modal="true" aria-label="New creative request">
      <div className="bg-card w-full sm:max-w-2xl max-h-[92vh] overflow-y-auto rounded-t-xl sm:rounded-xl border border-border p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-heading font-semibold tracking-tight text-foreground">
              New request
            </h2>
            <p className="text-sm text-muted mt-1">
              Pick what you need — the turnaround and brief fields follow.
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="text-muted hover:text-foreground">
            ✕
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-5">
          {TYPES.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setType(t)}
              className={`rounded-lg border p-3 text-center transition-colors ${
                type === t
                  ? "border-brand bg-brand/5 ring-1 ring-brand"
                  : "border-border bg-card hover:border-brand-light"
              }`}
            >
              <span className="text-xl block">{TYPE_ICONS[t]}</span>
              <span className="text-xs font-semibold text-foreground block mt-1">
                {TYPE_LABELS[t]}
              </span>
              <span className="text-2xs text-muted block mt-0.5">
                {TURNAROUND_BUSINESS_DAYS[t]} business days
              </span>
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-5">
          <label className="text-xs font-semibold text-foreground sm:col-span-2">
            Title *
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Table cover for school expo stall"
              className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground"
            />
          </label>
          <label className="text-xs font-semibold text-foreground">
            Your centre
            <select
              value={serviceId}
              onChange={(e) => setServiceId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground"
            >
              <option value="">— Head office / all —</option>
              {(servicesData ?? []).map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </label>
          <label className="text-xs font-semibold text-foreground">
            Needed by
            <input
              type="date"
              value={dueDate}
              min={minDue}
              onChange={(e) => setDueDate(e.target.value)}
              className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground"
            />
            <span className="text-2xs text-muted font-normal">
              Leave blank for the standard turnaround
            </span>
          </label>
          <label className="text-xs font-semibold text-foreground sm:col-span-2">
            What's it for? *
            <textarea
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              rows={3}
              placeholder="Where will it be used, who's the audience, any context…"
              className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground"
            />
          </label>
          <label className="text-xs font-semibold text-foreground sm:col-span-2">
            Exact copy <span className="text-muted font-normal">— we'll paste this verbatim</span>
            <textarea
              value={exactCopy}
              onChange={(e) => setExactCopy(e.target.value)}
              rows={2}
              placeholder="The exact wording that should appear on the design"
              className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground"
            />
          </label>
          <label className="text-xs font-semibold text-foreground">
            Size / dimensions
            <input
              value={sizeSpec}
              onChange={(e) => setSizeSpec(e.target.value)}
              placeholder="e.g. A3, 6ft trestle, 1080×1350"
              className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground"
            />
          </label>
          <div className="text-xs font-semibold text-foreground">
            Reference files
            <input
              ref={fileInput}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => handleUpload(e.target.files)}
            />
            <div className="mt-1">
              <Button
                variant="outline"
                onClick={() => fileInput.current?.click()}
                disabled={uploading}
              >
                {uploading ? "Uploading…" : "Add files"}
              </Button>
            </div>
            {attachments.map((a) => (
              <div key={a.fileUrl} className="text-2xs text-muted mt-1 truncate">
                📎 {a.fileName}
              </div>
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={createRequest.isPending}>
            {createRequest.isPending ? "Submitting…" : "Submit request"}
          </Button>
        </div>
      </div>
    </div>
  );
}
```

Verified: `useServices()` returns a plain `ServiceSummary[]` (so `(servicesData ?? []).map` is correct) and `Button` variants are `primary | secondary | outline | ghost | destructive`.

Intent note: the modal deliberately does NOT collect `outputFormat` — requesters rarely know print specs; the marketing team sets it at triage via a Phase 2 edit surface. The API and detail panel already support it.

- [ ] **Step 6: Implement `src/components/requests/RequestDetailPanel.tsx`**

Slide-over with brief, status actions (fulfiller), thread with internal toggle (fulfiller), cancel (owner while new/briefed).

```tsx
"use client";

import { useState } from "react";
import type { CreativeRequestStatus } from "@prisma/client";
import { Button } from "@/components/ui/Button";
import {
  STATUS_LABELS,
  TRANSITIONS,
  TYPE_LABELS,
} from "@/lib/creative-request/constants";
import {
  useCreativeRequest,
  usePatchRequest,
  usePostRequestMessage,
  useRequestMessages,
} from "@/hooks/useCreativeRequests";
import { Skeleton } from "@/components/ui/Skeleton";

export function RequestDetailPanel({
  requestId,
  fulfiller,
  currentUserId,
  onClose,
}: {
  requestId: string;
  fulfiller: boolean;
  currentUserId: string;
  onClose: () => void;
}) {
  const { data, isLoading } = useCreativeRequest(requestId);
  const { data: messagesData } = useRequestMessages(requestId);
  const patch = usePatchRequest();
  const postMessage = usePostRequestMessage();

  const [draft, setDraft] = useState("");
  const [internal, setInternal] = useState(false);

  const request = data?.request;
  const messages = messagesData?.messages ?? [];
  const isOwner = request?.requestedById === currentUserId;
  const canCancel =
    isOwner && !fulfiller && request && ["new", "briefed"].includes(request.status);
  const nextStatuses: CreativeRequestStatus[] = request
    ? TRANSITIONS[request.status] ?? []
    : [];

  function send() {
    if (!draft.trim()) return;
    postMessage.mutate(
      { id: requestId, body: draft.trim(), internal: fulfiller && internal },
      { onSuccess: () => setDraft("") },
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={onClose}>
      <div
        className="bg-card w-full sm:max-w-xl h-full overflow-y-auto border-l border-border p-5 sm:p-6"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Request detail"
      >
        {isLoading || !request ? (
          <Skeleton className="h-64 rounded-lg" />
        ) : (
          <>
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-2xs font-mono text-muted">
                  {request.requestNumber} · {TYPE_LABELS[request.type]}
                  {request.service ? ` · ${request.service.name}` : ""}
                </div>
                <h2 className="text-xl font-heading font-semibold tracking-tight text-foreground mt-1">
                  {request.title}
                </h2>
                <div className="text-sm text-muted mt-1">
                  {STATUS_LABELS[request.status]} · due{" "}
                  {new Date(request.dueDate).toLocaleDateString("en-AU", {
                    day: "numeric",
                    month: "short",
                  })}
                  {request.requestedBy?.name ? ` · requested by ${request.requestedBy.name}` : ""}
                </div>
              </div>
              <button type="button" onClick={onClose} aria-label="Close" className="text-muted hover:text-foreground">
                ✕
              </button>
            </div>

            {fulfiller && nextStatuses.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-4">
                {nextStatuses.map((s) => (
                  <Button
                    key={s}
                    variant={s === "cancelled" ? "destructive" : "secondary"}
                    onClick={() => patch.mutate({ id: requestId, status: s })}
                    disabled={patch.isPending}
                  >
                    → {STATUS_LABELS[s]}
                  </Button>
                ))}
              </div>
            )}
            {canCancel && (
              <div className="mt-4">
                <Button
                  variant="destructive"
                  onClick={() =>
                    patch.mutate({
                      id: requestId,
                      status: "cancelled",
                      cancellationReason: "Cancelled by requester",
                    })
                  }
                  disabled={patch.isPending}
                >
                  Cancel request
                </Button>
              </div>
            )}

            <div className="mt-5 space-y-3">
              <section>
                <h3 className="text-2xs font-semibold uppercase tracking-wide text-muted">Purpose</h3>
                <p className="text-sm text-foreground mt-1 whitespace-pre-wrap">{request.purpose}</p>
              </section>
              {request.exactCopy && (
                <section>
                  <h3 className="text-2xs font-semibold uppercase tracking-wide text-muted">
                    Exact copy — paste verbatim
                  </h3>
                  <p className="text-sm text-foreground mt-1 whitespace-pre-wrap bg-surface rounded-lg p-3 border-l-2 border-accent">
                    {request.exactCopy}
                  </p>
                </section>
              )}
              {(request.sizeSpec || request.outputFormat) && (
                <section className="text-sm text-foreground">
                  <h3 className="text-2xs font-semibold uppercase tracking-wide text-muted">Specs</h3>
                  <p className="mt-1">
                    {[request.sizeSpec, request.outputFormat].filter(Boolean).join(" · ")}
                  </p>
                </section>
              )}
              {request.attachments.filter((a) => !a.messageId).length > 0 && (
                <section>
                  <h3 className="text-2xs font-semibold uppercase tracking-wide text-muted">Files</h3>
                  {request.attachments
                    .filter((a) => !a.messageId)
                    .map((a) => (
                      <a
                        key={a.id}
                        href={a.fileUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="block text-sm text-brand-light hover:underline mt-1 truncate"
                      >
                        📎 {a.fileName}
                      </a>
                    ))}
                </section>
              )}
            </div>

            <section className="mt-6">
              <h3 className="text-2xs font-semibold uppercase tracking-wide text-muted">Thread</h3>
              <div className="space-y-3 mt-2">
                {messages.map((m) => (
                  <div
                    key={m.id}
                    className={`rounded-lg p-3 text-sm ${
                      m.internal
                        ? "bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900"
                        : "bg-surface"
                    }`}
                  >
                    <div className="text-2xs text-muted">
                      <span className="font-semibold text-foreground">{m.author?.name ?? "—"}</span>{" "}
                      · {new Date(m.createdAt).toLocaleString("en-AU", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}
                      {m.internal && (
                        <span className="ml-2 font-bold uppercase text-amber-700 dark:text-amber-400">Internal</span>
                      )}
                    </div>
                    <p className="text-foreground mt-1 whitespace-pre-wrap">{m.body}</p>
                    {m.attachments.map((a) => (
                      <a key={a.id} href={a.fileUrl} target="_blank" rel="noreferrer" className="block text-2xs text-brand-light hover:underline mt-1 truncate">
                        📎 {a.fileName}
                      </a>
                    ))}
                  </div>
                ))}
                {messages.length === 0 && (
                  <p className="text-sm text-muted">No comments yet.</p>
                )}
              </div>

              <div className="mt-3">
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  rows={2}
                  placeholder="Write a reply…"
                  className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground"
                />
                <div className="flex items-center justify-between mt-2">
                  {fulfiller ? (
                    <label className="flex items-center gap-2 text-xs text-muted cursor-pointer">
                      <input
                        type="checkbox"
                        checked={internal}
                        onChange={(e) => setInternal(e.target.checked)}
                      />
                      Internal note (team only)
                    </label>
                  ) : (
                    <span />
                  )}
                  <Button onClick={send} disabled={postMessage.isPending || !draft.trim()}>
                    Send
                  </Button>
                </div>
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Build check**

Run: `npm run build`
Expected: compiles; the pre-existing prerender bailouts on `/settings/seed`, `/admin/ai-drafts`, `/roster/swaps` are known and acceptable — no NEW failures.

- [ ] **Step 8: Commit**

```bash
git add "src/app/(dashboard)/requests" src/components/requests
git commit -m "feat(creative-requests): /requests page — queue board + my-requests + intake + detail panel"
```

### Task 10: Nav + role-permissions wiring

**Files:**
- Modify: `src/lib/nav-config.ts` (Growth section, after the `/marketing` entry ~line 208)
- Modify: `src/lib/role-permissions.ts` (`allPages` array + `member`, `staff`, `marketing` entries in `rolePageAccess`)

- [ ] **Step 1: Add the nav item**

In `src/lib/nav-config.ts`, directly after the `/marketing` line:

```ts
  { href: "/requests", label: "Design Requests", icon: Palette, section: "Growth", tooltip: "Request design work from the marketing team — posters, flyers, table covers", core: true },
```

Add `Palette` to the existing `lucide-react` import. `core: true` is deliberate: every role either submits or works these.

- [ ] **Step 2: Add the route to role permissions**

In `src/lib/role-permissions.ts`:
1. Add `"/requests"` to the `allPages` array (keeps owner/head_office/admin access).
2. Add `"/requests"` to the `member` array in `rolePageAccess`.
3. Add `"/requests"` to the `staff` array.
4. Add `"/requests"` to the `marketing` array.
5. Leave `eos_viewer`/`eos_implementer` untouched (both are hardcoded arrays; neither gains `/requests`). Note: the separate `eos` role's list is derived as `allPages.filter(p => !ADMIN_EXCLUDED.has(p))` (~line 456), so adding `/requests` to `allPages` gives the `eos` role access automatically — this is ACCEPTED for Phase 1 (they can submit requests like anyone); do not add an exclusion. (Corrected 2026-08-05: an earlier revision of this note conflated `eos` with `eos_implementer`.)

- [ ] **Step 3: Verify the wiring**

Run: `npm run dev`, then confirm:
- Sign in as an admin/owner account → "Design Requests" appears under Growth; page renders the board.
- Sign in as a **member or staff** account → the item appears AND the page renders `MyRequestsList` (this is the whole point of the rolePageAccess gotcha — do not skip the centre-role check).
- `canAccessPage` check: `npx vitest run src/__tests__/` — if a role-permissions guard test exists it must still pass.

- [ ] **Step 4: Run lint + full tests + build**

```bash
npm run lint
npm test
npm run build
```

Expected: lint clean for new files, 0 test failures, build passes.

- [ ] **Step 5: Commit**

```bash
git add src/lib/nav-config.ts src/lib/role-permissions.ts
git commit -m "feat(creative-requests): nav item + role page access"
```

### Task 11: Final verification & PR

- [ ] **Step 1: Full pre-done checklist** (from CLAUDE.md)

```bash
npm run build && npm test && npm run lint
```

Expected: all pass. Also verify by eye:
- No `console.log` in the new files
- All new mutations have `onError` toasts (Task 8)
- All new queries have `retry: 2` + `staleTime` (Task 8)
- All new routes wrapped in `withApiAuth` + Zod on writes (Tasks 5–7)
- Migration SQL is additive-only (Task 1)

- [ ] **Step 2: Update CLAUDE.md**

Add to the project CLAUDE.md "Important Paths" a line:

```
- `src/lib/creative-request/` — creative-request ticketing: number generator, pipeline transitions, notification fan-out. Routes at `/api/creative-requests`, UI at `/requests` (role-adaptive: marketing queue vs my-requests)
```

- [ ] **Step 3: Manual smoke test in dev**

With `npm run dev`:
1. As a member: submit a request with a file → success toast.
2. As marketing: see it in "New", move it to Briefed → member gets a bell notification; add an internal note → member's thread doesn't show it.
3. As the member: reply on the thread → marketing gets a bell notification.
4. As the member: cancel is only offered while New/Briefed.

- [ ] **Step 4: Commit any fixes, then open the PR**

```bash
git push -u origin HEAD
gh pr create --title "feat: creative-request ticketing (Marketing Hub Phase 1)" --body "$(cat <<'EOF'
## Summary
- New CreativeRequest/Message/Attachment models (REQ-YYYY-NNNN, staged pipeline, per-stage timestamps)
- /api/creative-requests: list/create, detail/transition/assign/cancel, thread with internal-note filtering
- /requests page: kanban queue for marketing/admin, My Requests + intake form for centre roles
- In-app notifications on submit/assign/status/message
- Migration is additive-only; applied by deploy (never locally — prod DB)

## Test plan
- [ ] npm test — new lib + route tests green, no regressions
- [ ] npm run build
- [ ] Manual smoke: submit as member → triage as marketing → thread + internal notes → cancel rules

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```
