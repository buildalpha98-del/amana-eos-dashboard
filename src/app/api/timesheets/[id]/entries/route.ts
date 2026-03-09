import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";
import { getServiceScope, getStateScope } from "@/lib/service-scope";

const entrySchema = z.object({
  userId: z.string().min(1),
  date: z.string().min(1),
  shiftStart: z.string().min(1),
  shiftEnd: z.string().min(1),
  breakMinutes: z.number().min(0).optional(),
  shiftType: z.enum([
    "shift_bsc",
    "shift_asc",
    "shift_vac",
    "pd",
    "shift_admin",
    "shift_other",
  ]),
  notes: z.string().optional(),
  payRate: z.number().optional(),
});

const createEntriesSchema = z.array(entrySchema).min(1, "At least one entry is required");

// POST /api/timesheets/[id]/entries — add individual entries
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

  // Staff/member can only add entries to their own service's timesheets
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

  const body = await req.json();
  const parsed = createEntriesSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  // Staff/member can only add entries for themselves
  if (scope) {
    const otherUserEntries = parsed.data.filter((e) => e.userId !== session.user.id);
    if (otherUserEntries.length > 0) {
      return NextResponse.json(
        { error: "You can only add timesheet entries for yourself" },
        { status: 403 }
      );
    }
  }

  const entriesToCreate = parsed.data.map((entry) => {
    const shiftStart = new Date(entry.shiftStart);
    const shiftEnd = new Date(entry.shiftEnd);
    const breakMins = entry.breakMinutes ?? 0;

    const diffMs = shiftEnd.getTime() - shiftStart.getTime();
    const totalHours =
      Math.round((diffMs / (1000 * 60 * 60) - breakMins / 60) * 100) / 100;

    return {
      timesheetId: id,
      userId: entry.userId,
      date: new Date(entry.date),
      shiftStart,
      shiftEnd,
      breakMinutes: breakMins,
      totalHours: Math.max(0, totalHours),
      shiftType: entry.shiftType,
      notes: entry.notes,
      payRate: entry.payRate,
    };
  });

  const created = await prisma.timesheetEntry.createMany({
    data: entriesToCreate as any,
  });

  await prisma.activityLog.create({
    data: {
      userId: session!.user.id,
      action: "add_timesheet_entries",
      entityType: "Timesheet",
      entityId: id,
      details: { entriesCreated: created.count },
    },
  });

  return NextResponse.json({ entriesCreated: created.count }, { status: 201 });
}
