import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServiceScope, getStateScope } from "@/lib/service-scope";
import { withApiAuth } from "@/lib/server-auth";
import { NOTIFICATION_TYPES } from "@/lib/notification-types";
import { logger } from "@/lib/logger";

// POST /api/timesheets/[id]/submit — submit timesheet for approval
export const POST = withApiAuth(async (req, session, context) => {
  const { id } = await context!.params!;

  const timesheet = await prisma.timesheet.findUnique({ where: { id } });
  if (!timesheet || timesheet.deleted) {
    return NextResponse.json({ error: "Timesheet not found" }, { status: 404 });
  }

  const scope = getServiceScope(session);
  if (scope && timesheet.serviceId !== scope) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // State Manager: verify timesheet's service is in their assigned state
  const stateScope = getStateScope(session);
  if (stateScope) {
    const svc = await prisma.service.findUnique({ where: { id: timesheet.serviceId }, select: { state: true } });
    if (!svc || svc.state !== stateScope) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  if (timesheet.status !== "ts_draft") {
    return NextResponse.json(
      { error: "Can only submit draft timesheets" },
      { status: 400 }
    );
  }

  const updated = await prisma.timesheet.update({
    where: { id },
    data: {
      status: "submitted",
      submittedAt: new Date(),
      submittedById: session.user.id,
    },
    include: {
      service: { select: { id: true, name: true, code: true } },
      _count: { select: { entries: true } },
    },
  });

  await prisma.activityLog.create({
    data: {
      userId: session.user.id,
      action: "submit_timesheet",
      entityType: "Timesheet",
      entityId: id,
      details: { weekEnding: timesheet.weekEnding },
    },
  });

  // Notify coordinators at the timesheet's service. Observational — log failures but
  // do not fail the request.
  try {
    const coordinators = await prisma.user.findMany({
      where: { role: "member", serviceId: timesheet.serviceId, active: true },
      select: { id: true },
    });

    if (coordinators.length > 0) {
      const submitterName = session.user.name || "A team member";
      const weekEndingStr = new Date(timesheet.weekEnding).toISOString().slice(0, 10);
      await Promise.all(
        coordinators.map((c) =>
          prisma.userNotification.create({
            data: {
              userId: c.id,
              type: NOTIFICATION_TYPES.TIMESHEET_SUBMITTED,
              title: `${submitterName} submitted a timesheet`,
              body: `Week ending ${weekEndingStr}`,
              link: `/timesheets?id=${id}`,
            },
          }),
        ),
      );
    }
  } catch (err) {
    logger.error("Failed to create timesheet-submitted notifications", {
      err,
      timesheetId: id,
    });
  }

  return NextResponse.json(updated);
});
