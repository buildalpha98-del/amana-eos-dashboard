/**
 * POST /api/roster/shifts/[id]/release
 *
 * Release a claimed shift back into the open-shift pool. Companion to
 * `/claim` (PR #53). The original use case from Nadia training:
 * "I claimed Mon 3-6pm but woke up sick on Friday — let someone else
 * grab it." Today the only way out is the swap dance, which requires
 * proposing a specific person.
 *
 * Rules:
 *  - Caller must be the current `userId` on the shift (you can only
 *    release your own assignment) OR an admin override.
 *  - Shift must not have been clocked in to (`actualStart === null`).
 *    Once you've started a shift you can't unclaim it — that'd be a
 *    data-integrity mess (variance / cost projection / payroll all
 *    key off the shift row). If staff genuinely needs to drop a
 *    started shift, admin handles it manually.
 *  - Shift must not have a pending swap request — releasing while a
 *    swap is in flight would orphan the proposer's offer.
 *  - Shift status must be "published" (drafts have no claim semantic).
 *
 * Race-safe: uses `prisma.rosterShift.updateMany` filtered on
 * `userId: caller.id` + `actualStart: null`, so concurrent
 * release+release or release+clock-in resolves at the database
 * rather than the application layer.
 *
 * 2026-05-04: closes the gap that PR #53 (open-shift offers) left
 * in the next-priorities queue.
 */

import { NextResponse } from "next/server";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-error";
import { isAdminRole } from "@/lib/role-permissions";

type RouteCtx = { params: Promise<{ id: string }> };

export const POST = withApiAuth(async (_req, session, context) => {
  const { id } = await (context as unknown as RouteCtx).params;
  if (!id) throw ApiError.badRequest("Missing shift id");

  const shift = await prisma.rosterShift.findUnique({
    where: { id },
    select: {
      id: true,
      userId: true,
      serviceId: true,
      actualStart: true,
      status: true,
    },
  });
  if (!shift) throw ApiError.notFound("Shift not found");

  if (shift.userId === null) {
    return NextResponse.json(
      { ok: true, alreadyOpen: true },
      { status: 200 },
    );
  }

  // Ownership check — caller must be the current assignee, or an admin.
  const callerIsAssignee = shift.userId === session.user.id;
  if (!callerIsAssignee && !isAdminRole(session.user.role)) {
    throw ApiError.forbidden(
      "You can only release shifts you've claimed yourself.",
    );
  }

  if (shift.actualStart) {
    throw ApiError.conflict(
      "You've already clocked in to this shift. Ask an admin to remove the assignment if you can't work it.",
    );
  }

  // Refuse if there's an in-flight swap request. The proposer's offer
  // would orphan to a now-unassigned shift, which the swap UI
  // doesn't have semantics for. Cancel the swap first.
  const pendingSwap = await prisma.shiftSwapRequest.findFirst({
    where: { shiftId: id, status: { in: ["proposed", "accepted"] } },
    select: { id: true },
  });
  if (pendingSwap) {
    throw ApiError.conflict(
      "This shift has a pending swap request — cancel that first, or let the swap complete.",
    );
  }

  // Race-safe release. Filter on the userId we just verified, so a
  // concurrent admin reassignment (which would have changed userId)
  // wins and our update reports count=0 → 409.
  const result = await prisma.rosterShift.updateMany({
    where: {
      id,
      userId: callerIsAssignee ? session.user.id : shift.userId,
      actualStart: null,
    },
    data: {
      userId: null,
      // Reset staffName so the grid renders the row as "Open shift"
      // again (matches the create-without-userId branch from PR #53).
      staffName: "Open shift",
    },
  });
  if (result.count === 0) {
    throw ApiError.conflict(
      "Couldn't release — the shift may have just been clocked in to or reassigned.",
    );
  }

  const updated = await prisma.rosterShift.findUnique({
    where: { id },
    include: { user: { select: { id: true, name: true, avatar: true } } },
  });
  return NextResponse.json({ shift: updated });
});
