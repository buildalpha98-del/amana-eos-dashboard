import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authenticateCowork } from "@/app/api/_lib/auth";
import { withApiHandler } from "@/lib/api-handler";
import { logger } from "@/lib/logger";

const timesheetEntrySchema = z.object({
  userEmail: z.string().email(),
  date: z.string().min(1),
  shiftStart: z.string().min(1),
  shiftEnd: z.string().min(1),
  breakMinutes: z.number().optional(),
  totalHours: z.number(),
  shiftType: z.enum(["shift_bsc", "shift_asc", "shift_vac", "pd", "shift_admin", "shift_other"]).optional(),
  notes: z.string().nullable().optional(),
  isOvertime: z.boolean().optional(),
  payRate: z.number().nullable().optional(),
});

const bodySchema = z.object({
  serviceCode: z.string().min(1),
  weekEnding: z.string().min(1),
  entries: z.array(timesheetEntrySchema).min(1),
  notes: z.string().nullable().optional(),
  importSource: z.string().optional(),
});

/**
 * POST /api/cowork/hr/timesheets
 * Import timesheet data for a centre's week.
 * Used by: hr-timesheet-variance-scan, hr-overtime-alert
 */
export const POST = withApiHandler(async (req) => {
  const authError = await authenticateCowork(req);
  if (authError) return authError;

  try {
    const body = await req.json();
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }
    const { serviceCode, weekEnding, entries, notes, importSource } = parsed.data;

    const service = await prisma.service.findUnique({
      where: { code: serviceCode },
      select: { id: true, name: true },
    });

    if (!service) {
      return NextResponse.json(
        { error: `Service ${serviceCode} not found` },
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
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error("POST /cowork/hr/timesheets", { err });
    return NextResponse.json(
      { error: "Internal Server Error", message },
      { status: 500 }
    );
  }
});
