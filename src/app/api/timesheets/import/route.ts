import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
const importEntrySchema = z.object({
  email: z.string().email(),
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
});

const importSchema = z.object({
  serviceId: z.string().min(1, "Service ID is required"),
  weekEnding: z.string().min(1, "Week ending date is required"),
  entries: z.array(importEntrySchema).min(1, "At least one entry is required"),
});

// POST /api/timesheets/import — bulk import entries from parsed data
export const POST = withApiAuth(async (req, session) => {
const body = await req.json();
  const parsed = importSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const { serviceId, weekEnding, entries } = parsed.data;
  const weekEndingDate = new Date(weekEnding);

  // Find or create timesheet for this service + weekEnding
  let timesheet = await prisma.timesheet.findUnique({
    where: {
      serviceId_weekEnding: {
        serviceId,
        weekEnding: weekEndingDate,
      },
    },
  });

  if (timesheet && timesheet.deleted) {
    // Reactivate deleted timesheet
    timesheet = await prisma.timesheet.update({
      where: { id: timesheet.id },
      data: { deleted: false, status: "ts_draft" },
    });
  }

  if (!timesheet) {
    timesheet = await prisma.timesheet.create({
      data: {
        serviceId,
        weekEnding: weekEndingDate,
        importSource: "xlsx_import",
      },
    });
  }

  // Match emails to User records
  const uniqueEmails = [...new Set(entries.map((e) => e.email.toLowerCase()))];
  const users = await prisma.user.findMany({
    where: { email: { in: uniqueEmails } },
    select: { id: true, email: true },
  });

  const emailToUser = new Map(users.map((u) => [u.email.toLowerCase(), u]));

  const matched: string[] = [];
  const unmatched: string[] = [];
  const entriesToCreate: Array<{
    timesheetId: string;
    userId: string;
    date: Date;
    shiftStart: Date;
    shiftEnd: Date;
    breakMinutes: number;
    totalHours: number;
    shiftType: string;
  }> = [];

  for (const entry of entries) {
    const user = emailToUser.get(entry.email.toLowerCase());
    if (!user) {
      if (!unmatched.includes(entry.email)) unmatched.push(entry.email);
      continue;
    }
    if (!matched.includes(entry.email)) matched.push(entry.email);

    const shiftStart = new Date(entry.shiftStart);
    const shiftEnd = new Date(entry.shiftEnd);
    const breakMins = entry.breakMinutes ?? 0;

    // Calculate totalHours
    const diffMs = shiftEnd.getTime() - shiftStart.getTime();
    const totalHours =
      Math.round((diffMs / (1000 * 60 * 60) - breakMins / 60) * 100) / 100;

    entriesToCreate.push({
      timesheetId: timesheet.id,
      userId: user.id,
      date: new Date(entry.date),
      shiftStart,
      shiftEnd,
      breakMinutes: breakMins,
      totalHours: Math.max(0, totalHours),
      shiftType: entry.shiftType,
    });
  }

  // Bulk create entries
  const created = await prisma.timesheetEntry.createMany({
    data: entriesToCreate as any,
  });

  await prisma.activityLog.create({
    data: {
      userId: session!.user.id,
      action: "import_timesheet",
      entityType: "Timesheet",
      entityId: timesheet.id,
      details: {
        serviceId,
        weekEnding,
        entriesCreated: created.count,
        matched: matched.length,
        unmatched,
      },
    },
  });

  return NextResponse.json({
    timesheetId: timesheet.id,
    matched,
    unmatched,
    entriesCreated: created.count,
  });
}, { roles: ["owner", "head_office", "admin"] });
