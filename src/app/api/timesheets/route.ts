import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { parseJsonBody } from "@/lib/api-error";
import { getServiceScope, getStateScope } from "@/lib/service-scope";
import { withApiAuth } from "@/lib/server-auth";

const createTimesheetSchema = z.object({
  serviceId: z.string().min(1, "Service ID is required"),
  weekEnding: z.string().min(1, "Week ending date is required"),
  notes: z.string().optional(),
});

// GET /api/timesheets — list timesheets (scoped to service for staff/member)
export const GET = withApiAuth(async (req, session) => {
  const scope = getServiceScope(session);
  const stateScope = getStateScope(session);
  const { searchParams } = new URL(req.url);
  const serviceId = searchParams.get("serviceId");
  const status = searchParams.get("status");
  const weekEndingAfter = searchParams.get("weekEndingAfter");
  const weekEndingBefore = searchParams.get("weekEndingBefore");

  const where: Prisma.TimesheetWhereInput = { deleted: false };

  // Staff/member: only see their service's timesheets
  if (scope) where.serviceId = scope;
  else if (serviceId) where.serviceId = serviceId;
  if (status) where.status = status as Prisma.TimesheetWhereInput["status"];
  // State Manager: only see timesheets for services in their assigned state
  if (stateScope) where.service = { state: stateScope };

  if (weekEndingAfter || weekEndingBefore) {
    const range: Prisma.DateTimeFilter = {};
    if (weekEndingAfter) range.gte = new Date(weekEndingAfter);
    if (weekEndingBefore) range.lte = new Date(weekEndingBefore);
    where.weekEnding = range;
  }

  const timesheets = await prisma.timesheet.findMany({
    where,
    include: {
      service: { select: { id: true, name: true, code: true } },
      _count: { select: { entries: true } },
    },
    orderBy: { weekEnding: "desc" },
  });

  return NextResponse.json(timesheets);
});

// POST /api/timesheets — create empty timesheet
export const POST = withApiAuth(async (req, session) => {
  const scope = getServiceScope(session);
  const body = await parseJsonBody(req);
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
});
