import { NextResponse } from "next/server";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { NOTIFICATION_TYPES } from "@/lib/notification-types";
import { z } from "zod";

// ---------------------------------------------------------------------------
// POST /api/shift-swaps/[id]/reject
// Target-only. Transitions proposed → rejected. Notifies the proposer with
// the reason (if provided).
// ---------------------------------------------------------------------------

const rejectSchema = z.object({ reason: z.string().optional() });

export const POST = withApiAuth(async (req, session, context) => {
  const params = await context?.params;
  const id = params?.id;
  if (!id) throw ApiError.badRequest("Missing swap id");

  const body = await parseJsonBody(req).catch(() => ({}));
  const parsed = rejectSchema.safeParse(body ?? {});
  if (!parsed.success) {
    throw ApiError.badRequest("Invalid input", parsed.error.flatten());
  }
  const { reason } = parsed.data;

  const swap = await prisma.shiftSwapRequest.findUnique({
    where: { id },
    select: { id: true, status: true, targetId: true, proposerId: true },
  });
  if (!swap) throw ApiError.notFound("Swap request not found");
  if (swap.targetId !== session.user.id) {
    throw ApiError.forbidden("Only the target can reject");
  }
  if (swap.status !== "proposed") {
    throw ApiError.conflict(`Cannot reject a ${swap.status} swap`);
  }

  const updated = await prisma.$transaction(async (tx) => {
    const s = await tx.shiftSwapRequest.update({
      where: { id },
      data: {
        status: "rejected",
        rejectedAt: new Date(),
        rejectedReason: reason ?? null,
      },
    });
    await tx.userNotification.create({
      data: {
        userId: swap.proposerId,
        type: NOTIFICATION_TYPES.SHIFT_SWAP_REJECTED,
        title: "Your shift swap was rejected",
        body: reason
          ? `${session.user.name ?? "Target"} rejected: ${reason}`
          : `${session.user.name ?? "Target"} rejected your swap request`,
        link: `/roster/me?swap=${id}`,
      },
    });
    return s;
  });

  return NextResponse.json({ swap: updated });
});
