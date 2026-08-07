import { NextResponse } from "next/server";
import { z } from "zod";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { CreativeRequestStatus, TicketPriority } from "@prisma/client";
import {
  isBeforeToday,
  isFulfillerRole,
  isValidTransition,
} from "@/lib/creative-request/constants";
import {
  notifyRequestAssigned,
  notifyRequestStatusChanged,
} from "@/lib/creative-request/notify";
import { requestInclude } from "@/lib/creative-request/include";
import { applyStatusChange } from "@/lib/creative-request/status-change";
import { sendAssignmentEmail } from "@/lib/send-assignment-email";

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
    /** Marketing-campaign link — fulfiller-only; null unlinks. */
    campaignId: z.string().nullable().optional(),
    cancellationReason: z.string().max(2000).optional(),
    checklist: z
      .array(z.object({ label: z.string().min(1).max(300), done: z.boolean() }))
      .max(30)
      .optional(),
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
  if (patch.dueDate && isBeforeToday(patch.dueDate)) {
    throw ApiError.badRequest("Due date cannot be in the past");
  }

  const existing = await prisma.creativeRequest.findUnique({
    where: { id },
    select: {
      id: true,
      requestNumber: true,
      title: true,
      status: true,
      requestedById: true,
      assigneeId: true,
      pausedAt: true,
      pausedMs: true,
    },
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
      patch.dueDate === undefined &&
      patch.campaignId === undefined &&
      patch.checklist === undefined;
    if (!isCancelOnly) {
      throw ApiError.forbidden("Only the marketing team can update requests");
    }
    if (!REQUESTER_CANCELLABLE.includes(existing.status)) {
      throw ApiError.conflict("This request is already in progress — message the team instead");
    }
  }

  if (!patch.status && (existing.status === "delivered" || existing.status === "cancelled")) {
    throw ApiError.conflict("This request is closed");
  }

  if (patch.campaignId) {
    const campaign = await prisma.marketingCampaign.findUnique({
      where: { id: patch.campaignId },
      select: { id: true, deleted: true },
    });
    if (!campaign || campaign.deleted) {
      throw ApiError.badRequest("Campaign not found");
    }
  }

  const data: Record<string, unknown> = {};

  if (patch.status) {
    if (!isValidTransition(existing.status, patch.status)) {
      throw ApiError.conflict(
        `Cannot move from ${existing.status} to ${patch.status}`,
      );
    }
    // in_review is proof-driven only — it's entered by uploading a proof
    // (POST .../proofs), never by a manual status PATCH. Pulling BACK out
    // of in_review via PATCH stays allowed (that's the pull-back path).
    if (patch.status === "in_review") {
      throw ApiError.conflict("Send a proof to move a request into review");
    }
    Object.assign(data, applyStatusChange(existing, patch.status, new Date()));
    if (patch.status === "cancelled") {
      data.cancellationReason = patch.cancellationReason ?? null;
    }
  }
  if (patch.assigneeId !== undefined) data.assigneeId = patch.assigneeId;
  if (patch.campaignId !== undefined) data.campaignId = patch.campaignId;
  if (patch.priority) data.priority = patch.priority;
  if (patch.dueDate) data.dueDate = patch.dueDate;
  if (patch.checklist !== undefined) data.checklist = patch.checklist;

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
    // Only fires on an actual (re-)assignment to someone else — never on
    // unassign (assigneeId: null, no one to email) and never on a
    // self-assign (matches notifyRequestAssigned's own self-skip and
    // every other assignment-email call site: todos/rocks/issues).
    if (patch.assigneeId && patch.assigneeId !== session.user.id) {
      sendAssignmentEmail({
        type: "creative_request",
        assigneeId: patch.assigneeId,
        assignerId: session.user.id,
        entityTitle: updated.title,
        entityId: updated.id,
        entityNumber: updated.requestNumber,
      });
    }
  }

  return NextResponse.json({ request: updated });
});
