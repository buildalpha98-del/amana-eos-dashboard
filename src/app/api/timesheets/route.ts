import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";

const createTimesheetSchema = z.object({
  serviceId: z.string().min(1, "Service ID is required"),
  weekEnding: z.string().min(1, "Week ending date is required"),
  notes: z.string().optional(),
});

// GET /api/timesheets — list timesheets (owner/admin only)
export async function GET(req: NextRequest) {
  const { error } = await requireAuth(["owner", "admin"]);
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const serviceId = searchParams.get("serviceId");
  const status = searchParams.get("status");
  const weekEndingAfter = searchParams.get("weekEndingAfter");
  const weekEndingBefore = searchParams.get("weekEndingBefore");

  const where: Record<string, unknown> = { deleted: false };

  if (serviceId) where.serviceId = serviceId;
  if (status) where.status = status;

  if (weekEndingAfter || weekEndingBefore) {
    where.weekEnding = {};
    if (weekEndingAfter)
      (where.weekEnding as Record<string, unknown>).gte = new Date(weekEndingAfter);
    if (weekEndingBefore)
      (where.weekEnding as Record<string, unknown>).lte = new Date(weekEndingBefore);
  }

  const timesheets = await prisma.timesheet.findMany({
    where: where as any,
    include: {
      service: { select: { id: true, name: true, code: true } },
      _count: { select: { entries: true } },
    },
    orderBy: { weekEnding: "desc" },
  });

  return NextResponse.json(timesheets);
}

// POST /api/timesheets — create empty timesheet (owner/admin only)
export async function POST(req: NextRequest) {
  const { session, error } = await requireAuth(["owner", "admin"]);
  if (error) return error;

  const body = await req.json();
  const parsed = createTimesheetSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const weekEndingDate = new Date(parsed.data.weekEnding);

  // Check unique constraint
  const existing = await prisma.timesheet.findUnique({
    where: {
      serviceId_weekEnding: {
        serviceId: parsed.data.serviceId,
        weekEnding: weekEndingDate,
      },
    },
  });

  if (existing && !existing.deleted) {
    return NextResponse.json(
      { error: "A timesheet already exists for this service and week ending" },
      { status: 409 }
    );
  }

  const timesheet = await prisma.timesheet.create({
    data: {
      serviceId: parsed.data.serviceId,
      weekEnding: weekEndingDate,
      notes: parsed.data.notes,
    },
    include: {
      service: { select: { id: true, name: true, code: true } },
      _count: { select: { entries: true } },
    },
  });

  await prisma.activityLog.create({
    data: {
      userId: session!.user.id,
      action: "create_timesheet",
      entityType: "Timesheet",
      entityId: timesheet.id,
      details: {
        serviceId: parsed.data.serviceId,
        weekEnding: parsed.data.weekEnding,
      },
    },
  });

  return NextResponse.json(timesheet, { status: 201 });
}
