import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
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

  return NextResponse.json(updated);
}, { roles: ["owner", "head_office", "admin"] });
