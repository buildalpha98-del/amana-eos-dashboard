# Creative Requests — Phase 2 (Proofing Loop) Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the review loop on creative requests: versioned proofs with three-state decisions (Approve / Approve with changes / Request changes), a turnaround clock that pauses while waiting on the requester, per-type fulfiller checklists, plus three Phase 1 polish items (requester-cancel confirmation, board archive filter, assignment email).

**Architecture:** New `CreativeRequestProof` model (versioned per request, one pending decision at a time). Status side-effects: proof upload auto-transitions the request to `in_review`; decisions transition to `approved` or `changes_requested`. Pause accounting lives on `CreativeRequest` (`pausedAt`, `pausedMs`) and is keyed to the `in_review` status — entered → clock stops; exited → elapsed time accumulates. A shared `applyStatusChange()` helper becomes the single place status transitions stamp timestamps + pause fields (the PATCH route refactors onto it). All new write paths validate file URLs with the existing Blob allowlist.

**Tech Stack:** unchanged — Next.js 16 App Router, Prisma 5.22, Zod, TanStack Query, Vitest.

---

## ⚠️ Critical context (same as Phase 1 — re-read if new to this)

1. **`.env.local` DATABASE_URL is PRODUCTION.** Migration SQL is generated offline via schema-to-schema `prisma migrate diff` and applied only by deploy. Only `prisma validate` / `prisma generate` / datamodel-to-datamodel `migrate diff` are permitted locally. Prisma CLI needs env vars: `set -a; source .env.local; set +a` first (validate/generate open no DB connection).
2. **Build verification** = `npx prisma generate && npx next build` (never `npm run build` locally — its migrate-deploy step is the deploy pipeline's job).
3. **Phase 1 reference implementations** (all merged via PR #207): routes under `src/app/api/creative-requests/`, lib under `src/lib/creative-request/`, UI under `src/components/requests/`, tests in `src/__tests__/api/creative-requests.test.ts` (26 tests) + `src/__tests__/lib/creative-request-*.test.ts`. Follow their patterns exactly.
4. **Security invariants to preserve**: `safeAttachmentUrl` (via `attachmentInputSchema` or directly) on every file-URL write path; internal-message content never reaches requesters; non-participants get 404s; requester-side write powers stay minimal.
5. Known pre-existing test failures (11, listed in project memory) are unrelated — the gate is NO NEW failures.

## File structure

| File | Responsibility |
|---|---|
| `prisma/schema.prisma` (modify) | `ProofDecision` enum, `CreativeRequestProof` model, `pausedAt`/`pausedMs`/`checklist` on `CreativeRequest`, `User` back-relations |
| `prisma/migrations/<ts>_creative_request_proofs/migration.sql` (create) | Offline-generated, additive-only |
| `src/lib/creative-request/proof-rules.ts` (create) | Decision→status map, upload/decide eligibility, next version |
| `src/lib/creative-request/status-change.ts` (create) | `applyStatusChange()` — timestamps + pause accounting, shared by PATCH + proof routes |
| `src/lib/creative-request/constants.ts` (modify) | `DEFAULT_CHECKLISTS` per type, `effectiveDueDate()` |
| `src/lib/creative-request/notify.ts` (modify) | `notifyProofReady`, `notifyProofDecision` |
| `src/lib/notification-types.ts` (modify) | 2 new constants |
| `src/app/api/creative-requests/[id]/proofs/route.ts` (create) | GET versions + POST upload (fulfiller) |
| `src/app/api/creative-requests/[id]/proofs/[proofId]/decision/route.ts` (create) | POST decision (requester or fulfiller) |
| `src/app/api/creative-requests/[id]/route.ts` (modify) | Refactor onto `applyStatusChange`; accept `checklist` patches (fulfiller) |
| `src/app/api/creative-requests/route.ts` (modify) | Seed checklist from type default on create |
| `src/hooks/useCreativeRequests.ts` (modify) | proofs query, upload/decide mutations, checklist patch, types |
| `src/components/requests/ProofsSection.tsx` (create) | Version list, upload, three-state decision UI |
| `src/components/requests/RequestDetailPanel.tsx` (modify) | Mount ProofsSection + checklist ticks; requester-cancel ConfirmDialog |
| `src/components/requests/RequestCard.tsx` (modify) | "⏸ Waiting on centre" chip; effective-due maths |
| `src/components/requests/RequestBoard.tsx` (modify) | Archive filter for old delivered cards |
| Tests | extend `creative-requests.test.ts`; new `creative-request-proof-rules.test.ts`, `creative-request-status-change.test.ts` |

Out of scope (Phase 3+): SLA analytics, request templates beyond checklists, email-marketing fixes, campaign umbrella.

---

## Chunk 1: Backend

### Task 1: Schema + migration

**Files:** Modify `prisma/schema.prisma`; Create `prisma/migrations/20260805200000_creative_request_proofs/migration.sql`

- [ ] **Step 1: Schema additions**

After the `CreativeRequestAttachment` model add:

```prisma
enum ProofDecision {
  approved
  approved_with_changes
  changes_requested
}

/// A versioned proof (draft deliverable) sent to the requester for review.
/// One undecided proof at a time per request; decisions drive request status.
model CreativeRequestProof {
  id        String          @id @default(cuid())
  requestId String
  request   CreativeRequest @relation(fields: [requestId], references: [id], onDelete: Cascade)
  /// 1-based, unique per request; assigned server-side (max + 1).
  version   Int
  fileName  String
  /// Vercel Blob URL — validated by safeAttachmentUrl at the API boundary.
  fileUrl   String
  fileSize  Int?
  mimeType  String?
  /// Optional note from the designer accompanying the proof.
  note      String?         @db.Text

  uploadedById String?
  uploadedBy   User?   @relation("CreativeRequestProofsUploaded", fields: [uploadedById], references: [id], onDelete: SetNull)

  decision     ProofDecision?
  /// Required for approved_with_changes and changes_requested (Ziflow rule).
  decisionNote String?        @db.Text
  decidedById  String?
  decidedBy    User?          @relation("CreativeRequestProofsDecided", fields: [decidedById], references: [id], onDelete: SetNull)
  decidedAt    DateTime?

  createdAt DateTime @default(now())

  @@unique([requestId, version])
  @@index([requestId])
}
```

On `model CreativeRequest` add (near the other fields, before `createdAt`):

```prisma
  /// Turnaround-pause accounting. pausedAt is set while status is in_review
  /// (waiting on the requester); on exit the elapsed ms accumulate into
  /// pausedMs. Effective due date = dueDate + pausedMs (+ live pause).
  pausedAt DateTime?
  pausedMs Int       @default(0)

  /// Fulfiller checklist [{ label, done }], seeded from the type's default
  /// at create. Null for requests created before Phase 2.
  checklist Json?
```

and to its relation list: `proofs CreativeRequestProof[]`.

On `model User` add:

```prisma
  creativeRequestProofsUploaded CreativeRequestProof[] @relation("CreativeRequestProofsUploaded")
  creativeRequestProofsDecided  CreativeRequestProof[] @relation("CreativeRequestProofsDecided")
```

- [ ] **Step 2: Validate + generate migration offline** (exact Phase 1 procedure; folder `20260805200000_creative_request_proofs`; `git show HEAD:prisma/schema.prisma` as the before-schema; temp file in the scratchpad dir). Inspect: additive-only (1 CREATE TYPE, 1 CREATE TABLE, ALTER TABLE "CreativeRequest" ADD COLUMN ×3, indexes, FKs).

- [ ] **Step 3:** `npx prisma generate` → client has `CreativeRequestProof`.

- [ ] **Step 4: Commit** `prisma/schema.prisma` + migration: `feat(creative-requests): proof model + pause/checklist fields`

### Task 2: Lib — proof rules, status-change helper, checklist defaults (TDD)

**Files:** Create `src/lib/creative-request/proof-rules.ts`, `src/lib/creative-request/status-change.ts`; Modify `src/lib/creative-request/constants.ts`; Tests: `src/__tests__/lib/creative-request-proof-rules.test.ts`, `src/__tests__/lib/creative-request-status-change.test.ts`

- [ ] **Step 1: Failing tests — proof-rules**

```ts
import { describe, it, expect } from "vitest";
import {
  DECISION_TO_STATUS,
  canUploadProof,
  decisionNoteRequired,
} from "@/lib/creative-request/proof-rules";

describe("DECISION_TO_STATUS", () => {
  it("maps the three decisions", () => {
    expect(DECISION_TO_STATUS.approved).toBe("approved");
    expect(DECISION_TO_STATUS.approved_with_changes).toBe("approved");
    expect(DECISION_TO_STATUS.changes_requested).toBe("changes_requested");
  });
});

describe("canUploadProof", () => {
  it("allows upload from in_progress and changes_requested only", () => {
    expect(canUploadProof("in_progress")).toBe(true);
    expect(canUploadProof("changes_requested")).toBe(true);
    for (const s of ["new", "briefed", "in_review", "approved", "delivered", "cancelled"] as const) {
      expect(canUploadProof(s)).toBe(false);
    }
  });
});

describe("decisionNoteRequired", () => {
  it("requires a note except for plain approval", () => {
    expect(decisionNoteRequired("approved")).toBe(false);
    expect(decisionNoteRequired("approved_with_changes")).toBe(true);
    expect(decisionNoteRequired("changes_requested")).toBe(true);
  });
});
```

- [ ] **Step 2: Failing tests — status-change**

```ts
import { describe, it, expect } from "vitest";
import { applyStatusChange } from "@/lib/creative-request/status-change";

const base = { status: "in_progress", pausedAt: null, pausedMs: 0 } as const;

describe("applyStatusChange", () => {
  it("stamps the stage timestamp", () => {
    const now = new Date("2026-08-05T00:00:00Z");
    const data = applyStatusChange({ ...base }, "in_review", now);
    expect(data.status).toBe("in_review");
    expect(data.inReviewAt).toEqual(now);
  });

  it("starts the pause clock on entering in_review", () => {
    const now = new Date("2026-08-05T00:00:00Z");
    const data = applyStatusChange({ ...base }, "in_review", now);
    expect(data.pausedAt).toEqual(now);
  });

  it("accumulates pausedMs on leaving in_review", () => {
    const enteredAt = new Date("2026-08-05T00:00:00Z");
    const now = new Date("2026-08-05T02:00:00Z"); // 2h later
    const data = applyStatusChange(
      { status: "in_review", pausedAt: enteredAt, pausedMs: 60_000 },
      "changes_requested",
      now,
    );
    expect(data.pausedAt).toBeNull();
    expect(data.pausedMs).toBe(60_000 + 2 * 3_600_000);
    expect(data.changesRequestedAt).toEqual(now);
  });

  it("clamps pausedMs below Int32 max (month-long pause must not overflow)", () => {
    const enteredAt = new Date("2026-07-01T00:00:00Z");
    const now = new Date("2026-08-05T00:00:00Z"); // 35 days later
    const data = applyStatusChange(
      { status: "in_review", pausedAt: enteredAt, pausedMs: 0 },
      "approved",
      now,
    );
    expect(data.pausedMs).toBe(2_000_000_000);
  });

  it("does not touch pause fields on unrelated transitions", () => {
    const now = new Date();
    const data = applyStatusChange({ ...base, status: "briefed" }, "in_progress", now);
    expect(data.pausedAt).toBeUndefined();
    expect(data.pausedMs).toBeUndefined();
  });
});
```

- [ ] **Step 3: Run both — module-not-found failures.**

- [ ] **Step 4: Implement `proof-rules.ts`**

```ts
import type { CreativeRequestStatus, ProofDecision } from "@prisma/client";

/** What each proof decision does to the request status (Ziflow three-state:
 *  "approved with changes" closes the loop WITHOUT another proof round). */
export const DECISION_TO_STATUS: Record<ProofDecision, CreativeRequestStatus> = {
  approved: "approved",
  approved_with_changes: "approved",
  changes_requested: "changes_requested",
};

/** Proofs may only be sent while work is active. Upload auto-transitions
 *  the request to in_review. */
export function canUploadProof(status: CreativeRequestStatus): boolean {
  return status === "in_progress" || status === "changes_requested";
}

/** A bare "approved" needs no explanation; the other two must say what
 *  changes are expected. */
export function decisionNoteRequired(decision: ProofDecision): boolean {
  return decision !== "approved";
}
```

- [ ] **Step 5: Implement `status-change.ts`**

```ts
import type { CreativeRequestStatus } from "@prisma/client";
import { STATUS_TIMESTAMP_FIELD } from "@/lib/creative-request/constants";

interface PauseState {
  status: CreativeRequestStatus;
  pausedAt: Date | null;
  pausedMs: number;
}

/**
 * Build the Prisma update `data` for a status transition: stage timestamp
 * plus turnaround-pause accounting. The pause clock runs while the request
 * sits in in_review (waiting on the requester's decision) — entering starts
 * it, leaving banks the elapsed time. THE single place transitions mutate
 * these fields; used by the PATCH route and both proof routes.
 *
 * Caller remains responsible for transition VALIDITY (isValidTransition)
 * and for cancellationReason.
 */
export function applyStatusChange(
  existing: PauseState,
  toStatus: CreativeRequestStatus,
  now = new Date(),
): Record<string, unknown> {
  const data: Record<string, unknown> = { status: toStatus };
  const tsField = STATUS_TIMESTAMP_FIELD[toStatus];
  if (tsField) data[tsField] = now;

  const wasPaused = existing.status === "in_review";
  const willPause = toStatus === "in_review";
  if (!wasPaused && willPause) {
    data.pausedAt = now;
  } else if (wasPaused && !willPause) {
    data.pausedAt = null;
    // Clamp: pausedMs is a signed Int32 column (max ~24.8 days of ms). A
    // proof ignored for a month must not 500 the transition that leaves
    // in_review — cap the banked total instead.
    data.pausedMs = Math.min(
      2_000_000_000,
      existing.pausedMs +
        (existing.pausedAt ? Math.max(0, now.getTime() - existing.pausedAt.getTime()) : 0),
    );
  }
  return data;
}
```

- [ ] **Step 6: constants.ts additions** (append; keep the module pure/client-safe)

```ts
/** Effective due date once requester-wait time is credited back. */
export function effectiveDueDate(
  dueDate: Date,
  pausedMs: number,
  pausedAt: Date | null,
  now = new Date(),
): Date {
  const live = pausedAt ? Math.max(0, now.getTime() - pausedAt.getTime()) : 0;
  return new Date(dueDate.getTime() + pausedMs + live);
}

/** Fulfiller checklist seeded onto new requests, per type. */
export const DEFAULT_CHECKLISTS: Record<CreativeRequestType, string[]> = {
  flyer: ["Confirm brief & copy", "Draft design", "Proof to requester", "Final files delivered"],
  poster: ["Confirm brief & copy", "Draft design", "Proof to requester", "Print-ready PDF delivered"],
  social_tile: ["Confirm brief & copy", "Draft tiles", "Proof to requester", "Exports delivered"],
  table_cover: ["Confirm brief & dimensions", "Draft design", "Proof to requester", "Vendor brief raised"],
  banner_signage: ["Confirm brief & dimensions", "Draft design", "Proof to requester", "Vendor brief raised"],
  email_header: ["Confirm brief & copy", "Draft design", "Proof to requester", "Assets delivered"],
  merch: ["Confirm brief, sizes & quantity", "Draft artwork", "Proof to requester", "Vendor brief raised"],
  other: ["Confirm brief", "Draft", "Proof to requester", "Delivered"],
};
```

Add matching quick assertions to the existing `creative-request-constants.test.ts`: `effectiveDueDate` with live pause and banked ms; `DEFAULT_CHECKLISTS` covers all 8 types.

- [ ] **Step 7: All lib tests green; commit** `feat(creative-requests): proof rules + pause accounting + checklist defaults`

### Task 3: Proof routes + notifications (TDD)

**Files:** Create `src/app/api/creative-requests/[id]/proofs/route.ts`, `src/app/api/creative-requests/[id]/proofs/[proofId]/decision/route.ts`; Modify `src/lib/notification-types.ts` (+2), `src/lib/creative-request/notify.ts` (+2 fns); Tests appended to `src/__tests__/api/creative-requests.test.ts`

- [ ] **Step 1: notification types** — append `CREATIVE_REQUEST_PROOF_READY: "creative_request_proof_ready"` and `CREATIVE_REQUEST_PROOF_DECISION: "creative_request_proof_decision"` with a dated comment.

- [ ] **Step 2: notify.ts additions**

```ts
/** Proof uploaded → the requester ("proof ready for your review").
 *  Skips when the uploader IS the requester (marketing self-request). */
export async function notifyProofReady(
  db: Db,
  request: RequestSummary,
  version: number,
  actorId: string,
): Promise<void> {
  try {
    if (request.requestedById === actorId) return;
    await createFor(
      db,
      [request.requestedById],
      NOTIFICATION_TYPES.CREATIVE_REQUEST_PROOF_READY,
      `${request.requestNumber}: proof v${version} ready for review`,
      request.title,
      link(request),
    );
  } catch (err) {
    logger.error("creative-request notify (proof ready) failed", { err, requestId: request.id });
  }
}

/** Decision made → the assignee, or every marketing user if unassigned. */
export async function notifyProofDecision(
  db: Db,
  request: RequestSummary,
  version: number,
  decision: ProofDecision,
  actorId: string,
): Promise<void> {
  try {
    const label: Record<ProofDecision, string> = {
      approved: "approved",
      approved_with_changes: "approved with changes",
      changes_requested: "changes requested",
    };
    let targets: string[];
    if (request.assigneeId) {
      targets = [request.assigneeId];
    } else {
      const marketers = await db.user.findMany({
        where: { role: "marketing", active: true },
        select: { id: true },
      });
      targets = marketers.map((u) => u.id);
    }
    await createFor(
      db,
      targets.filter((id) => id !== actorId),
      NOTIFICATION_TYPES.CREATIVE_REQUEST_PROOF_DECISION,
      `${request.requestNumber}: proof v${version} ${label[decision]}`,
      request.title,
      link(request),
    );
  } catch (err) {
    logger.error("creative-request notify (proof decision) failed", { err, requestId: request.id });
  }
}
```

(`import type { ProofDecision } from "@prisma/client";` joins the existing type imports.)

- [ ] **Step 3: Failing route tests** (append; follow the file's existing fixture/mock style)

Cover:
- `POST /proofs`: 403 for the requester (member) — proof upload is fulfiller-only; 409 when status is `new` (canUploadProof false); happy path from `in_progress` — asserts `creativeRequestProof.create` with `version: 1` (mock `creativeRequestProof.findFirst` → null), `creativeRequest.update` with `status: "in_review"`, `inReviewAt` Date, `pausedAt` Date, and `userNotification.createMany` called (requester notified); version increments (mock `findFirst` → `{ version: 2 }` → creates v3); fileUrl `javascript:` → 400.
- `GET /proofs`: member owner sees them; non-participant 404.
- `POST /proofs/[proofId]/decision`: requester approves → proof claimed via `updateMany({ where: { id, decision: null }})` (assert the where clause) with decision/decidedById/decidedAt AND request status → `approved` with `pausedMs` accumulated + `pausedAt` null; `approved_with_changes` WITHOUT note → 400; `changes_requested` with note → status `changes_requested`; already-decided proof (mock `decision` set) → 409; race-lost claim (mock `updateMany` → `{count: 0}`) → 409 and `creativeRequest.update` NOT called; superseded proof (mock latest `findFirst` returning a different id) → 409; non-participant → 404; fulfiller may also decide (on-behalf) → 200.

- [ ] **Step 4: Implement `proofs/route.ts`**

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { attachmentInputSchema } from "@/lib/creative-request/attachment-schema";
import { isFulfillerRole } from "@/lib/creative-request/constants";
import { canUploadProof } from "@/lib/creative-request/proof-rules";
import { applyStatusChange } from "@/lib/creative-request/status-change";
import { notifyProofReady } from "@/lib/creative-request/notify";

type RouteCtx = { params: Promise<{ id: string }> };

const proofInclude = {
  uploadedBy: { select: { id: true, name: true } },
  decidedBy: { select: { id: true, name: true } },
} as const;

async function loadForParticipant(id: string, userId: string, role: string) {
  const request = await prisma.creativeRequest.findUnique({
    where: { id },
    select: {
      id: true, requestNumber: true, title: true, status: true,
      requestedById: true, assigneeId: true, pausedAt: true, pausedMs: true,
    },
  });
  if (!request || (!isFulfillerRole(role) && request.requestedById !== userId)) {
    throw ApiError.notFound("Request not found");
  }
  return request;
}

// GET — proof versions, newest first. Participants only.
export const GET = withApiAuth(async (_req, session, context) => {
  const { id } = await (context as unknown as RouteCtx).params;
  await loadForParticipant(id, session.user.id, session.user.role);
  const proofs = await prisma.creativeRequestProof.findMany({
    where: { requestId: id },
    include: proofInclude,
    orderBy: { version: "desc" },
  });
  return NextResponse.json({ proofs });
});

// POST — upload a proof (fulfiller only). Auto-transitions to in_review.
// Single-source Blob validation: extend the shared attachment schema.
const uploadSchema = attachmentInputSchema.extend({
  note: z.string().max(5000).optional(),
});

export const POST = withApiAuth(async (req, session, context) => {
  const { id } = await (context as unknown as RouteCtx).params;
  if (!isFulfillerRole(session.user.role)) {
    throw ApiError.forbidden("Only the marketing team can upload proofs");
  }
  const request = await loadForParticipant(id, session.user.id, session.user.role);
  if (!canUploadProof(request.status)) {
    throw ApiError.conflict(`Cannot send a proof while the request is ${request.status}`);
  }

  const raw = await parseJsonBody(req);
  const parsed = uploadSchema.safeParse(raw);
  if (!parsed.success) {
    throw ApiError.badRequest("Invalid proof payload", parsed.error.flatten());
  }

  const latest = await prisma.creativeRequestProof.findFirst({
    where: { requestId: id },
    orderBy: { version: "desc" },
    select: { version: true },
  });
  const version = (latest?.version ?? 0) + 1;

  const now = new Date();
  let proof;
  try {
    [proof] = await prisma.$transaction([
      prisma.creativeRequestProof.create({
        data: {
          requestId: id,
          version,
          fileName: parsed.data.fileName,
          fileUrl: parsed.data.fileUrl,
          fileSize: parsed.data.fileSize ?? null,
          mimeType: parsed.data.mimeType ?? null,
          note: parsed.data.note ?? null,
          uploadedById: session.user.id,
        },
        include: proofInclude,
      }),
      prisma.creativeRequest.update({
        where: { id },
        data: applyStatusChange(request, "in_review", now),
      }),
    ]);
  } catch (err) {
    // findFirst+1 outside the transaction is deliberately simple — the
    // marketing team is effectively single-writer per request. If two
    // uploads do race, @@unique([requestId, version]) turns the loser
    // into a clean retryable conflict instead of a 500.
    if ((err as { code?: string }).code === "P2002") {
      throw ApiError.conflict("A proof was just uploaded — refresh and try again");
    }
    throw err;
  }

  await notifyProofReady(prisma, request, version, session.user.id);
  return NextResponse.json({ proof }, { status: 201 });
});
```

- [ ] **Step 5: Implement `proofs/[proofId]/decision/route.ts`**

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { ProofDecision } from "@prisma/client";
import { isFulfillerRole } from "@/lib/creative-request/constants";
import { DECISION_TO_STATUS, decisionNoteRequired } from "@/lib/creative-request/proof-rules";
import { applyStatusChange } from "@/lib/creative-request/status-change";
import { notifyProofDecision } from "@/lib/creative-request/notify";

type RouteCtx = { params: Promise<{ id: string; proofId: string }> };

const decisionSchema = z.object({
  decision: z.nativeEnum(ProofDecision),
  note: z.string().max(5000).optional(),
});

/**
 * POST — record the requester's (or a fulfiller-on-behalf) decision on a
 * proof. Drives the request status via DECISION_TO_STATUS and banks the
 * in_review pause time.
 */
export const POST = withApiAuth(async (req, session, context) => {
  const { id, proofId } = await (context as unknown as RouteCtx).params;

  const request = await prisma.creativeRequest.findUnique({
    where: { id },
    select: {
      id: true, requestNumber: true, title: true, status: true,
      requestedById: true, assigneeId: true, pausedAt: true, pausedMs: true,
    },
  });
  const fulfiller = isFulfillerRole(session.user.role);
  if (!request || (!fulfiller && request.requestedById !== session.user.id)) {
    throw ApiError.notFound("Request not found");
  }

  const proof = await prisma.creativeRequestProof.findUnique({ where: { id: proofId } });
  if (!proof || proof.requestId !== id) throw ApiError.notFound("Proof not found");
  if (proof.decision) throw ApiError.conflict("This proof has already been decided");
  if (request.status !== "in_review") {
    throw ApiError.conflict("This request is not awaiting a proof decision");
  }
  // Only the LATEST version is decidable. A superseded-but-undecided proof
  // (fulfiller pulled a proof back via manual PATCH, then sent a new one)
  // must not drive the request status. Orphaned undecided proofs are
  // deliberately left as history — no backfill decision is recorded.
  const latest = await prisma.creativeRequestProof.findFirst({
    where: { requestId: id },
    orderBy: { version: "desc" },
    select: { id: true },
  });
  if (latest && latest.id !== proofId) {
    throw ApiError.conflict("A newer proof supersedes this one — review the latest version");
  }

  const raw = await parseJsonBody(req);
  const parsed = decisionSchema.safeParse(raw);
  if (!parsed.success) {
    throw ApiError.badRequest("Invalid decision payload", parsed.error.flatten());
  }
  const { decision, note } = parsed.data;
  if (decisionNoteRequired(decision) && !note?.trim()) {
    throw ApiError.badRequest("Please say what changes are needed");
  }

  const now = new Date();
  // Race-proof claim: the conditional updateMany means two simultaneous
  // decisions can't both land — the loser matches zero rows and 409s
  // before the request status is touched.
  const claimed = await prisma.creativeRequestProof.updateMany({
    where: { id: proofId, decision: null },
    data: { decision, decisionNote: note?.trim() || null, decidedById: session.user.id, decidedAt: now },
  });
  if (claimed.count === 0) {
    throw ApiError.conflict("This proof has already been decided");
  }
  const updatedRequest = await prisma.creativeRequest.update({
    where: { id },
    data: applyStatusChange(request, DECISION_TO_STATUS[decision], now),
  });
  const updatedProof = await prisma.creativeRequestProof.findUnique({ where: { id: proofId } });

  await notifyProofDecision(prisma, request, proof.version, decision, session.user.id);
  return NextResponse.json({ proof: updatedProof, request: updatedRequest });
});
```

- [ ] **Step 6: Green; commit** `feat(creative-requests): proof upload + three-state decision APIs`

### Task 4: PATCH refactor + checklist (TDD)

**Files:** Modify `src/app/api/creative-requests/[id]/route.ts`, `src/app/api/creative-requests/route.ts`; tests appended

- [ ] **Step 1: Failing tests**
- PATCH `in_review → changes_requested` by a fulfiller accumulates `pausedMs` and nulls `pausedAt` (mock existing with `status: "in_review"`, `pausedAt` 2h ago, `pausedMs: 0`; assert update data).
- PATCH `{ checklist: [{label: "Draft design", done: true}] }` by fulfiller → 200, update called with the checklist; by requester → 403.
- PATCH checklist with a malformed item (missing label) → 400.
- POST create seeds `checklist` from `DEFAULT_CHECKLISTS[type]` (assert `create` data.checklist is the mapped `[{label, done:false}...]`).

- [ ] **Step 2: Implement**
- `[id]/route.ts`: extend the `existing` select with `pausedAt: true, pausedMs: true`; replace the inline status/timestamp block with `Object.assign(data, applyStatusChange(existing, patch.status, new Date()))` (keep `isValidTransition` + cancellationReason handling exactly as-is). Add to `patchBodySchema`: `checklist: z.array(z.object({ label: z.string().min(1).max(300), done: z.boolean() })).max(30).optional()`; add the write: `if (patch.checklist !== undefined) data.checklist = patch.checklist;`. Checklist is fulfiller-only — extend the `isCancelOnly` check to also require `patch.checklist === undefined`.
- `route.ts` POST: `checklist: DEFAULT_CHECKLISTS[data.type].map((label) => ({ label, done: false }))` in the create data.

- [ ] **Step 3: Full API test file green; commit** `feat(creative-requests): pause-aware PATCH + fulfiller checklists`

---

## Chunk 2: Frontend + polish

### Task 5: Hook + ProofsSection + detail panel integration

**Files:** Modify `src/hooks/useCreativeRequests.ts`; Create `src/components/requests/ProofsSection.tsx`; Modify `src/components/requests/RequestDetailPanel.tsx`

- [ ] **Step 1: Hook additions** — types `RequestProof { id, version, fileName, fileUrl, fileSize, mimeType, note, decision, decisionNote, decidedAt, uploadedBy, decidedBy, createdAt }`, `ChecklistItem { label, done }`; add `checklist: ChecklistItem[] | null`, `pausedAt: string | null`, `pausedMs: number` to `CreativeRequestItem`. New hooks following the existing patterns (retry 2, staleTime 15–30s, destructive onError):
  - `useRequestProofs(id)` → GET `/api/creative-requests/${id}/proofs`
  - `useUploadProof()` → POST `.../proofs`; invalidates proofs + detail + list
  - `useDecideProof()` → POST `.../proofs/${proofId}/decision`; invalidates proofs + detail + list
  - extend `PatchRequestInput` with `checklist?: ChecklistItem[]`

- [ ] **Step 2: ProofsSection.tsx** — new component, props `{ requestId, request, fulfiller, isOwner }`:
  - Lists proofs newest-first: version badge, fileName link (target_blank), uploader + date, uploader note, decision chip (green approved / amber approved-with-changes / red changes-requested) with decisionNote and decider.
  - Fulfiller + `canUploadProof(request.status)`: "Send proof for review" — file input uploading via `/api/upload` (same multipart pattern + error surfacing as NewRequestModal) then `useUploadProof` with optional note textarea. Disable while uploading/pending.
  - The latest undecided proof, when `status === "in_review"` and (isOwner or fulfiller): three decision buttons — `Approve` (Button primary), `Approve with changes` (outline) and `Request changes` (outline, danger-ish) — the latter two open a small inline note textarea (required) before confirming via `useDecideProof`. Note under the buttons: "Approve with changes = minor fixes, no new proof needed."
  - Empty state: "No proofs yet."
  - House styles: tokens only, text-2xs meta, aria-labels on icon-only controls, `useEscapeClose` not needed (inline section).

- [ ] **Step 3: RequestDetailPanel integration**
  - Mount `<ProofsSection …/>` between the specs section and the Thread.
  - Checklist (fulfiller only): render `request.checklist` as tickable checkboxes → `usePatchRequest` with the toggled array; show "n/m done" count.
  - Requester cancel: wrap in the house `ConfirmDialog` (variant "danger", reason fixed "Cancelled by requester") — closes the Phase 1 review's LOW inconsistency.
  - Header status line: when `request.pausedAt`, append "⏸ waiting on centre review".

- [ ] **Step 4: eslint on touched files + `npx next build`; commit** `feat(creative-requests): proofing UI + checklist + cancel confirm`

### Task 6: Board chips + archive filter + assignment email

**Files:** Modify `src/components/requests/RequestCard.tsx`, `src/components/requests/RequestBoard.tsx`, `src/components/requests/MyRequestsList.tsx`, `src/app/api/creative-requests/[id]/route.ts`

- [ ] **Step 1: RequestCard** — when `request.pausedAt`, render a `⏸ Waiting on centre` chip (surface/muted, italic) INSTEAD of the due chip; otherwise compute the due chip from `effectiveDueDate(new Date(request.dueDate), request.pausedMs, request.pausedAt ? new Date(request.pausedAt) : null)`.

- [ ] **Step 2: RequestBoard archive filter** — hide `delivered` cards older than 14 days (by `deliveredAt`), with a `text-2xs` muted footer under the Delivered column: "n archived · Show" toggle (client-side state) revealing them. Cancelled stays off the board (unchanged).

- [ ] **Step 3: MyRequestsList** — when `pausedAt` and status `in_review`, the plain-language status becomes "Ready for your review" (already is) — additionally bold the row title (visual cue). Skip if noisy; optional.

- [ ] **Step 4: Assignment email — DROPPED from Phase 2.** Investigation during plan review found `send-assignment-email.ts` supports only `todo|rock|issue`, has no creative-request template, and its `shouldReceiveNudge` gate excludes marketing-role assignees entirely — the primary audience would get no email. In-app + push notifications (Phase 1) already cover assignment. Deferred to Phase 3 with a proper template + a deliberate decision on the nudge gate.

- [ ] **Step 5: eslint + tests + build; commit** `feat(creative-requests): pause chips + board archive`

### Task 7: Final verification + PR

- [ ] Full gates: all 6 creative-request test files green (`creative-requests.test.ts` + the 5 lib files incl. new proof-rules and status-change; expect ~70 tests total), `npm test` no NEW failures vs the 11 known, feature-file eslint clean, `npx prisma generate && npx next build` passes.
- [ ] CLAUDE.md: extend the Creative Requests section with two lines — proofs/decisions model + pause semantics; checklist Json.
- [ ] Final holistic reviewer over the phase 2 diff (cross-cutting: decision routes vs UI buttons, pause maths server vs `effectiveDueDate` UI, migration matches schema).
- [ ] Push branch, `gh pr create` (base main) with summary, safety (additive migration), test plan, and the deferred-to-human smoke test items.
