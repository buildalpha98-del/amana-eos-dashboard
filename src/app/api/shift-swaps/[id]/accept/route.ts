import { NextResponse } from "next/server";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-error";
import { NOTIFICATION_TYPES } from "@/lib/notification-types";

// ---------------------------------------------------------------------------
// POST /api/shift-swaps/[id]/accept
// Target-only. Transitions proposed → accepted. Notifies the proposer and any
// admins/coordinators at the shift's service that approval is required.
// ---------------------------------------------------------------------------

export const POST = withApiAuth(async (_req, session, context) => {
  const params = await context?.params;
  const id = params?.id;
  if (!id) throw ApiError.badRequest("Missing swap id");

  const swap = await prisma.shiftSwapRequest.findUnique({
    where: { id },
    include: {
      shift: {
        select: {
          serviceId: true,
          date: true,
          shiftStart: true,
          shiftEnd: true,
        },
      },
    },
  });
  if (!swap) throw ApiError.notFound("Swap request not found");
  if (swap.targetId !== session.user.id) {
    throw ApiError.forbidden("Only the target can accept");
  }
  if (swap.status !== "proposed") {
    throw ApiError.conflict(`Cannot accept a ${swap.status} swap`);
  }

  const updated = await prisma.$transaction(async (tx) => {
    const s = await tx.shiftSwapRequest.update({
      where: { id },
      data: { status: "accepted", acceptedAt: new Date() },
    });
    await tx.userNotification.create({
      data: {
        userId: swap.proposerId,
        type: NOTIFICATION_TYPES.SHIFT_SWAP_ACCEPTED,
        title: "Your shift swap was accepted",
        body: `${session.user.name ?? "Target"} accepted — awaiting admin approval`,
        link: `/roster/me?swap=${id}`,
      },
    });
    const admins = await tx.user.findMany({
      where: {
        active: true,
        OR: [
          { role: "admin" },
          { role: "owner" },
          { role: "head_office" },
          { role: "coordinator", serviceId: swap.shift.serviceId },
        ],
      },
      select: { id: true },
    });
    if (admins.length > 0) {
      await tx.userNotification.createMany({
        data: admins.map((a: { id: string }) => ({
          userId: a.id,
          type: NOTIFICATION_TYPES.SHIFT_SWAP_ACCEPTED,
          title: "Shift swap needs approval",
          body: `${swap.shift.date.toISOString().split("T")[0]} ${swap.shift.shiftStart}`,
          link: `/roster/swaps?id=${id}`,
        })),
      });
    }
    return s;
  });

  return NextResponse.json({ swap: updated });
});
