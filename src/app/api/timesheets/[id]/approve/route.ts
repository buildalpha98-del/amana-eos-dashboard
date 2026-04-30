import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { NOTIFICATION_TYPES } from "@/lib/notification-types";
import { logger } from "@/lib/logger";
// POST /api/timesheets/[id]/approve — approve a submitted timesheet
export const POST = withApiAuth(async (req, session, context) => {
const { id } = await context!.params!;

  const timesheet = await prisma.timesheet.findUnique({ where: { id } });
  if (!timesheet || timesheet.deleted) {
    return NextResponse.json({ error: "Timesheet not found" }, { status: 404 });
  }

  if (timesheet.status !== "submitted") {
    return NextResponse.json(
      { error: "Can only approve submitted timesheets" },
      { status: 400 }
    );
  }

  const updated = await prisma.timesheet.update({
    where: { id },
    data: {
      status: "approved",
      approvedAt: new Date(),
      approvedById: session!.user.id,
    },
    include: {
      service: { select: { id: true, name: true, code: true } },
      _count: { select: { entries: true } },
    },
  });

  await prisma.activityLog.create({
    data: {
      userId: session!.user.id,
      action: "approve_timesheet",
      entityType: "Timesheet",
      entityId: id,
      details: { weekEnding: timesheet.weekEnding },
    },
  });

  // Notify the submitting user. Observational — log failures but keep the response
  // successful. Timesheets have no `userId`; the submitter is tracked via
  // `submittedById`, so we notify that user.
  try {
    if (timesheet.submittedById) {
      const weekEndingStr = new Date(timesheet.weekEnding).toISOString().slice(0, 10);
      await prisma.userNotification.create({
        data: {
          userId: timesheet.submittedById,
          type: NOTIFICATION_TYPES.TIMESHEET_APPROVED,
          title: "Timesheet approved",
          body: `Your timesheet for week ending ${weekEndingStr} was approved`,
          link: `/timesheets?id=${id}`,
        },
      });
    }
  } catch (err) {
    logger.error("Failed to create timesheet-approved notification", {
      err,
      timesheetId: id,
    });
  }

  return NextResponse.json(updated);
}, { roles: ["owner", "head_office", "admin"] });
