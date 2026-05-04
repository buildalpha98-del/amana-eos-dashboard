/**
 * POST /api/roster/shifts/[id]/clock-in
 *
 * Per-shift clock-in. Used when:
 *  - the staff explicitly picked a shift from the ambiguous-candidates
 *    response of /auto, or
 *  - the kiosk/UI knows the exact shiftId in advance.
 *
 * Idempotent: a second call after `actualStart` is set returns the
 * same row unchanged (no error). This is intentional — handles
 * double-tap on the kiosk and prevents race-y "did my tap register?"
 * frustration. If the caller wants to fail hard on double-clock,
 * they can compare `actualStart` to the response.
 *
 * Service-scoping: the shift's user must equal the caller. Admin
 * doesn't bypass — admin clocking someone else in is a kiosk-only
 * pattern (sub-PR 3); from the self-service surface, you can only
 * clock yourself.
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

  // Self-service only owns its own clock action. Kiosk clocks land on
  // /api/kiosk/clock with a separate auth path (sub-PR 3).
  if (shift.userId !== session.user.id) {
    throw ApiError.forbidden(
      "You can only clock in to a shift assigned to you.",
    );
  }

  // Idempotent: already clocked in → return as-is.
  if (shift.actualStart) {
    const existing = await prisma.rosterShift.findUnique({ where: { id } });
    return NextResponse.json({ shift: existing });
  }

  // Already clocked OUT? That'd mean the row was closed earlier.
  // Re-opening would silently overwrite history — refuse.
  if (shift.actualEnd) {
    throw ApiError.conflict(
      "This shift is already closed. Ask an admin to reopen it if this was a mistake.",
    );
  }

  const updated = await prisma.rosterShift.update({
    where: { id },
    data: { actualStart: new Date() },
  });
  return NextResponse.json({ shift: updated });
});
