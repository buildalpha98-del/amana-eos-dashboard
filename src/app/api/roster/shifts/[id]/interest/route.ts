/**
 * POST / DELETE /api/roster/shifts/[id]/interest — "I'm interested" on an
 * open shift, and taking it back (2026-10-09, OWNA's shift bidding).
 *
 * The Coordinator then gives the shift to one of the people who asked
 * (PATCH /api/roster/shifts/[id] with userId), which clears the list and
 * tells everyone. Certificates and induction are checked at that point,
 * the same as any assignment.
 */
import { NextResponse } from "next/server";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-error";
import { notifyUsers } from "@/lib/notify-user";
import { logger } from "@/lib/logger";
import { centreCoordinatorIds, shiftLabel } from "@/lib/roster-staff";
import { serviceDateOnly } from "@/lib/timezone";

type Ctx = { params: Promise<{ id: string }> };

async function openShiftAtMyCentre(id: string, session: { user: { serviceId?: string | null } }) {
  const shift = await prisma.rosterShift.findUnique({
    where: { id },
    select: { id: true, serviceId: true, userId: true, date: true, shiftStart: true, shiftEnd: true, status: true },
  });
  if (!shift) throw ApiError.notFound("Shift not found");
  if (shift.serviceId !== session.user.serviceId) {
    throw ApiError.forbidden("You can only ask for open shifts at your own centre.");
  }
  return shift;
}

export const POST = withApiAuth(async (_req, session, context) => {
  const { id } = await (context as unknown as Ctx).params;
  const shift = await openShiftAtMyCentre(id, session);
  if (shift.userId) throw ApiError.conflict("This shift has already been given to someone.");
  if (shift.date < serviceDateOnly()) throw ApiError.badRequest("That shift has already passed.");

  await prisma.shiftInterest.upsert({
    where: { shiftId_userId: { shiftId: id, userId: session.user.id } },
    update: {},
    create: { shiftId: id, userId: session.user.id },
  });

  // Tell the people who choose — swallow-and-log, like every notifier.
  centreCoordinatorIds(shift.serviceId)
    .then((ids) =>
      notifyUsers(prisma, ids.filter((x) => x !== session.user.id), {
        type: "roster",
        title: `${session.user.name ?? "An educator"} wants an open shift`,
        body: shiftLabel(shift.date, shift.shiftStart, shift.shiftEnd),
        link: "/roster",
      }),
    )
    .catch((err) => logger.error("Open-shift interest notification failed", { err, shiftId: id }));

  return NextResponse.json({ interested: true });
});

export const DELETE = withApiAuth(async (_req, session, context) => {
  const { id } = await (context as unknown as Ctx).params;
  await openShiftAtMyCentre(id, session);
  await prisma.shiftInterest.deleteMany({ where: { shiftId: id, userId: session.user.id } });
  return NextResponse.json({ interested: false });
});
