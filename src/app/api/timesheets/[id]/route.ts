import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getServiceScope, getStateScope } from "@/lib/service-scope";
import { withApiAuth } from "@/lib/server-auth";

const updateTimesheetSchema = z.object({
  notes: z.string().optional().nullable(),
  importSource: z.string().optional(),
  importFileName: z.string().optional(),
});

// GET /api/timesheets/[id] — timesheet detail with entries
export const GET = withApiAuth(async (req, session, context) => {
  const { id } = await context!.params!;

  const timesheet = await prisma.timesheet.findUnique({
    where: { id },
    include: {
      service: { select: { id: true, name: true, code: true } },
      entries: {
        include: {
          user: { select: { id: true, name: true, email: true } },
        },
        orderBy: [{ date: "asc" }, { shiftStart: "asc" }],
      },
    },
  });

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

  return NextResponse.json(timesheet);
});

// PATCH /api/timesheets/[id] — update timesheet fields
export const PATCH = withApiAuth(async (req, session, context) => {
  const { id } = await context!.params!;
  const body = await req.json();
  const parsed = updateTimesheetSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const existing = await prisma.timesheet.findUnique({ where: { id } });
  if (!existing || existing.deleted) {
    return NextResponse.json({ error: "Timesheet not found" }, { status: 404 });
  }

  const scope = getServiceScope(session);
  if (scope && existing.serviceId !== scope) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // State Manager: verify timesheet's service is in their assigned state
  const stateScopePatch = getStateScope(session);
  if (stateScopePatch) {
    const svc = await prisma.service.findUnique({ where: { id: existing.serviceId }, select: { state: true } });
    if (!svc || svc.state !== stateScopePatch) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  if (existing.status !== "ts_draft" && existing.status !== "submitted") {
    return NextResponse.json(
      { error: "Can only edit draft or submitted timesheets" },
      { status: 400 }
    );
  }

  const timesheet = await prisma.timesheet.update({
    where: { id },
    data: parsed.data,
    include: {
      service: { select: { id: true, name: true, code: true } },
      _count: { select: { entries: true } },
    },
  });

  return NextResponse.json(timesheet);
});

// DELETE /api/timesheets/[id] — soft delete (draft only)
export const DELETE = withApiAuth(async (req, session, context) => {
  const { id } = await context!.params!;

  const existing = await prisma.timesheet.findUnique({ where: { id } });
  if (!existing || existing.deleted) {
    return NextResponse.json({ error: "Timesheet not found" }, { status: 404 });
  }

  if (existing.status !== "ts_draft") {
    return NextResponse.json(
      { error: "Can only delete draft timesheets" },
      { status: 400 }
    );
  }

  await prisma.timesheet.update({
    where: { id },
    data: { deleted: true },
  });

  await prisma.activityLog.create({
    data: {
      userId: session!.user.id,
      action: "delete_timesheet",
      entityType: "Timesheet",
      entityId: id,
      details: { weekEnding: existing.weekEnding },
    },
  });

  return NextResponse.json({ success: true });
}, { roles: ["owner", "head_office", "admin"] });
