import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";

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
  const { session, error } = await requireAuth(["owner", "admin"]);
  if (error) return error;

  const { id } = await params;

  const timesheet = await prisma.timesheet.findUnique({ where: { id } });
  if (!timesheet || timesheet.deleted) {
    return NextResponse.json({ error: "Timesheet not found" }, { status: 404 });
  }

  const body = await req.json();
  const parsed = createEntriesSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
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
