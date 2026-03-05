import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";
import { getServiceScope } from "@/lib/service-scope";

const createTimesheetSchema = z.object({
  serviceId: z.string().min(1, "Service ID is required"),
  weekEnding: z.string().min(1, "Week ending date is required"),
  notes: z.string().optional(),
});

// GET /api/timesheets — list timesheets (scoped to service for staff/member)
export async function GET(req: NextRequest) {
  const { session, error } = await requireAuth();
  if (error || !session) return error ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const scope = getServiceScope(session);
  const { searchParams } = new URL(req.url);
  const serviceId = searchParams.get("serviceId");
  const status = searchParams.get("status");
  const weekEndingAfter = searchParams.get("weekEndingAfter");
  const weekEndingBefore = searchParams.get("weekEndingBefore");

  const where: Record<string, unknown> = { deleted: false };

  // Staff/member: only see their service's timesheets
  if (scope) where.serviceId = scope;
  else if (serviceId) where.serviceId = serviceId;
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

// POST /api/timesheets — create empty timesheet
export async function POST(req: NextRequest) {
  const { session, error } = await requireAuth();
  if (error || !session) return error ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const scope = getServiceScope(session);
  const body = await req.json();
  const parsed = createTimesheetSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  // Staff/member can only create timesheets for their own service
  if (scope && parsed.data.serviceId !== scope) {
    return NextResponse.json(
      { error: "You can only create timesheets for your own service" },
      { status: 403 }
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
      userId: session.user.id,
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
