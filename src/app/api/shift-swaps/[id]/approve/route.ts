import { NextResponse } from "next/server";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-error";
import { NOTIFICATION_TYPES } from "@/lib/notification-types";
import { isAdminRole } from "@/lib/role-permissions";

// ---------------------------------------------------------------------------
// POST /api/shift-swaps/[id]/approve
// Admin/coordinator for the shift's service. Transitions accepted → approved,
// and atomically swaps the RosterShift ownership. Notifies both proposer and
// target. All writes happen in a single transaction.
// ---------------------------------------------------------------------------

export const POST = withApiAuth(async (_req, session, context) => {
  const params = await context?.params;
  const id = params?.id;
  if (!id) throw ApiError.badRequest("Missing swap id");

  const swap = await prisma.shiftSwapRequest.findUnique({
    where: { id },
    include: {
      shift: { select: { id: true, serviceId: true, userId: true } },
    },
  });
  if (!swap) throw ApiError.notFound("Swap request not found");
  if (swap.status !== "accepted") {
    throw ApiError.conflict(`Cannot approve a ${swap.status} swap`);
  }

  const role = session.user.role ?? "";
  const isAdmin = isAdminRole(role);
  const isCoord =
    role === "member" &&
    session.user.serviceId === swap.shift.serviceId;
  if (!isAdmin && !isCoord) throw ApiError.forbidden();

  const target = await prisma.user.findUnique({
    where: { id: swap.targetId },
    select: { name: true },
  });
  if (!target) throw ApiError.notFound("Target user not found");

  const result = await prisma.$transaction(async (tx) => {
    const updatedSwap = await tx.shiftSwapRequest.update({
      where: { id },
      data: {
        status: "approved",
        approvedAt: new Date(),
        approvedById: session.user.id,
      },
    });
    await tx.rosterShift.update({
      where: { id: swap.shiftId },
      data: { userId: swap.targetId, staffName: target.name },
    });
    await tx.userNotification.createMany({
      data: [
        {
          userId: swap.proposerId,
          type: NOTIFICATION_TYPES.SHIFT_SWAP_APPROVED,
          title: "Your shift swap was approved",
          body: "",
          link: `/roster/me?swap=${id}`,
        },
        {
          userId: swap.targetId,
          type: NOTIFICATION_TYPES.SHIFT_SWAP_APPROVED,
          title: "You accepted a shift swap (approved)",
          body: "",
          link: `/roster/me?swap=${id}`,
        },
      ],
    });
    return updatedSwap;
  });
  return NextResponse.json({ swap: result });
});
