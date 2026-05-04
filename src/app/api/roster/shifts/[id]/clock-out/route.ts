/**
 * POST /api/roster/shifts/[id]/clock-out
 *
 * Sets `actualEnd = now()` on a shift the caller previously clocked
 * in to. Idempotent — second call after the shift is closed returns
 * the existing row.
 *
 * 2026-05-04: timeclock v1, sub-PR 2.
 */

import { NextResponse } from "next/server";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-error";

type RouteCtx = { params: Promise<{ id: string }> };

export const POST = withApiAuth(async (_req, session, context) => {
  const { id } = await (context as unknown as RouteCtx).params;
  if (!id) throw ApiError.badRequest("Missing shift id");

  const shift = await prisma.rosterShift.findUnique({
    where: { id },
    select: {
      id: true,
      userId: true,
      actualStart: true,
      actualEnd: true,
    },
  });
  if (!shift) throw ApiError.notFound("Shift not found");

  if (shift.userId !== session.user.id) {
    throw ApiError.forbidden(
      "You can only clock out of a shift assigned to you.",
    );
  }

  // Can't clock out before clocking in — the variance badge would be
  // meaningless and admin reconciliation gets harder.
  if (!shift.actualStart) {
    throw ApiError.badRequest(
      "You haven't clocked in to this shift yet.",
    );
  }

  // Idempotent: already closed → return as-is.
  if (shift.actualEnd) {
    const existing = await prisma.rosterShift.findUnique({ where: { id } });
    return NextResponse.json({ shift: existing });
  }

  const updated = await prisma.rosterShift.update({
    where: { id },
    data: { actualEnd: new Date() },
  });
  return NextResponse.json({ shift: updated });
});
