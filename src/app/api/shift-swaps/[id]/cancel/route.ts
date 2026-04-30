import { NextResponse } from "next/server";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-error";

// ---------------------------------------------------------------------------
// POST /api/shift-swaps/[id]/cancel
// Proposer-only. Transitions proposed → cancelled. No notifications: the
// target's original "proposed" notification remains in their bell but the
// swap itself is inert from this point forward.
// ---------------------------------------------------------------------------

export const POST = withApiAuth(async (_req, session, context) => {
  const params = await context?.params;
  const id = params?.id;
  if (!id) throw ApiError.badRequest("Missing swap id");

  const swap = await prisma.shiftSwapRequest.findUnique({
    where: { id },
    select: { id: true, status: true, proposerId: true },
  });
  if (!swap) throw ApiError.notFound("Swap request not found");
  if (swap.proposerId !== session.user.id) {
    throw ApiError.forbidden("Only the proposer can cancel");
  }
  if (swap.status !== "proposed") {
    throw ApiError.conflict(`Cannot cancel a ${swap.status} swap`);
  }

  const updated = await prisma.shiftSwapRequest.update({
    where: { id },
    data: { status: "cancelled" },
  });
  return NextResponse.json({ swap: updated });
});
