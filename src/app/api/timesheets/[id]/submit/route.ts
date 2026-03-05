import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";
import { getServiceScope } from "@/lib/service-scope";

// POST /api/timesheets/[id]/submit — submit timesheet for approval
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireAuth();
  if (error || !session) return error ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const timesheet = await prisma.timesheet.findUnique({ where: { id } });
  if (!timesheet || timesheet.deleted) {
    return NextResponse.json({ error: "Timesheet not found" }, { status: 404 });
  }

  const scope = getServiceScope(session);
  if (scope && timesheet.serviceId !== scope) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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
      submittedById: session!.user.id,
    },
    include: {
      service: { select: { id: true, name: true, code: true } },
      _count: { select: { entries: true } },
    },
  });

  await prisma.activityLog.create({
    data: {
      userId: session!.user.id,
      action: "submit_timesheet",
      entityType: "Timesheet",
      entityId: id,
      details: { weekEnding: timesheet.weekEnding },
    },
  });

  return NextResponse.json(updated);
}
