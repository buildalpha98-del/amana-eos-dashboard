import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateCowork } from "@/app/api/_lib/auth";

/**
 * POST /api/cowork/hr/timesheets
 * Import timesheet data for a centre's week.
 * Used by: hr-timesheet-variance-scan, hr-overtime-alert
 */
export async function POST(req: NextRequest) {
  const authError = authenticateCowork(req);
  if (authError) return authError;

  const body = await req.json();
  const { serviceCode, weekEnding, entries, notes, importSource } = body;

  if (!serviceCode || !weekEnding || !entries || !Array.isArray(entries)) {
    return NextResponse.json(
      {
        error: "Bad Request",
        message:
          "serviceCode, weekEnding (YYYY-MM-DD), and entries[] required",
      },
      { status: 400 }
    );
  }

  const service = await prisma.service.findUnique({
    where: { code: serviceCode },
    select: { id: true, name: true },
  });

  if (!service) {
    return NextResponse.json(
      { error: "Not Found", message: `Service ${serviceCode} not found` },
      { status: 404 }
    );
  }

  const weekDate = new Date(weekEnding + "T00:00:00Z");

  const result = await prisma.$transaction(async (tx) => {
    const timesheet = await tx.timesheet.upsert({
      where: {
        serviceId_weekEnding: {
          serviceId: service.id,
          weekEnding: weekDate,
        },
      },
      update: {
        notes: notes || null,
        importSource: importSource || "cowork_automation",
        status: "ts_draft",
      },
      create: {
        serviceId: service.id,
        weekEnding: weekDate,
        notes: notes || null,
        importSource: importSource || "cowork_automation",
        status: "ts_draft",
      },
    });

    await tx.timesheetEntry.deleteMany({
      where: { timesheetId: timesheet.id },
    });

    const entryData = [];
    for (const entry of entries) {
      const user = await tx.user.findFirst({
        where: { email: entry.userEmail },
        select: { id: true },
      });
      if (!user) continue;

      entryData.push({
        timesheetId: timesheet.id,
        userId: user.id,
        date: new Date(entry.date + "T00:00:00Z"),
        shiftStart: new Date(entry.date + "T" + entry.shiftStart + ":00Z"),
        shiftEnd: new Date(entry.date + "T" + entry.shiftEnd + ":00Z"),
        breakMinutes: entry.breakMinutes || 0,
        totalHours: entry.totalHours,
        shiftType: entry.shiftType || "shift_asc",
        notes: entry.notes || null,
        isOvertime: entry.isOvertime || false,
        payRate: entry.payRate || null,
      });
    }

    if (entryData.length > 0) {
      await tx.timesheetEntry.createMany({ data: entryData });
    }

    return { timesheet, entryCount: entryData.length };
  });

  return NextResponse.json(
    {
      message: "Timesheet imported",
      timesheetId: result.timesheet.id,
      serviceCode,
      weekEnding,
      entryCount: result.entryCount,
      status: "ts_draft",
    },
    { status: 201 }
  );
}
