/**
 * PATCH  /api/services/[id]/purchase-approvals/[approvalId]
 *   Body: { status: "approved" | "rejected" | "cancelled", decisionNote? }
 *   - "approved" / "rejected" → admin (or service manager) decision
 *   - "cancelled" → requester withdrawing their own pending request
 *
 * Notifies the requester on every status change so they don't need
 * to refresh the page. On approval the body of the notification tells
 * them to submit an expense claim via My Portal.
 *
 * 2026-06-02.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { logger } from "@/lib/logger";

const patchSchema = z.object({
  status: z.enum(["approved", "rejected", "cancelled"]),
  decisionNote: z.string().max(2000).optional().nullable(),
});

const ADMIN_ROLES = new Set(["owner", "head_office", "admin"]);

interface RouteContext {
  params: Promise<{ id: string; approvalId: string }>;
}

export const PATCH = withApiAuth(async (req, session, context) => {
  const { id: serviceId, approvalId } = await (
    context as unknown as RouteContext
  ).params;
  const userId = session!.user.id;
  const role = session!.user.role;
  const isAdmin = ADMIN_ROLES.has(role);

  const existing = await prisma.purchaseApproval.findUnique({
    where: { id: approvalId },
    include: {
      service: { select: { id: true, name: true, managerId: true } },
      requestedBy: { select: { id: true, name: true } },
    },
  });
  if (!existing || existing.serviceId !== serviceId) {
    throw ApiError.notFound("Approval request not found");
  }

  if (existing.status !== "pending") {
    throw ApiError.badRequest(
      `This request is already ${existing.status} — can't change.`,
    );
  }

  const raw = await parseJsonBody(req);
  const parsed = patchSchema.safeParse(raw);
  if (!parsed.success) {
    throw ApiError.badRequest(
      parsed.error.issues[0]?.message ?? "Validation failed",
    );
  }
  const { status: nextStatus, decisionNote } = parsed.data;

  // Authorisation:
  //   - "cancelled" only the requester themselves
  //   - "approved" / "rejected" admin OR the service manager
  if (nextStatus === "cancelled") {
    if (existing.requestedById !== userId) {
      throw ApiError.forbidden("Only the requester can cancel a request.");
    }
  } else {
    const isManager = existing.service.managerId === userId;
    if (!isAdmin && !isManager) {
      throw ApiError.forbidden(
        "Only an admin or the service manager can approve or reject.",
      );
    }
  }

  const decisionFields =
    nextStatus === "cancelled"
      ? { decidedAt: new Date(), decidedById: null }
      : {
          decidedAt: new Date(),
          decidedById: userId,
          decisionNote: decisionNote ?? null,
        };

  const updated = await prisma.purchaseApproval.update({
    where: { id: approvalId },
    data: { status: nextStatus, ...decisionFields },
    include: {
      requestedBy: { select: { id: true, name: true } },
      decidedBy: { select: { id: true, name: true } },
    },
  });

  // Notify the requester (skip when they cancelled themselves — they
  // already know).
  if (nextStatus !== "cancelled") {
    const dollars = (existing.costCents / 100).toFixed(2);
    const title =
      nextStatus === "approved"
        ? `Approved: ${existing.product}`
        : `Rejected: ${existing.product}`;
    const body =
      nextStatus === "approved"
        ? `Your purchase of "${existing.product}" from ${existing.vendor} ($${dollars}) was approved. Please go ahead and purchase using your own funds, then submit an expense claim from My Portal → My Expenses.${decisionNote ? `\n\nNote: ${decisionNote}` : ""}`
        : `Your purchase request for "${existing.product}" from ${existing.vendor} ($${dollars}) was not approved.${decisionNote ? `\n\nReason: ${decisionNote}` : ""}`;
    await prisma.userNotification.create({
      data: {
        userId: existing.requestedById,
        type:
          nextStatus === "approved"
            ? "purchase_approval_approved"
            : "purchase_approval_rejected",
        title,
        body,
        link: `/services/${serviceId}?tab=finance&sub=approvals`,
      },
    });
  }

  await prisma.activityLog.create({
    data: {
      userId,
      action: `purchase_approval_${nextStatus}`,
      entityType: "PurchaseApproval",
      entityId: approvalId,
      details: {
        serviceId,
        previousStatus: existing.status,
        nextStatus,
        decisionNote: decisionNote ?? null,
      },
    },
  });

  logger.info("Purchase approval decided", {
    id: approvalId,
    serviceId,
    actorId: userId,
    nextStatus,
  });

  return NextResponse.json(updated);
});
