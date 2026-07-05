/**
 * POST /api/timesheets/generate-from-timeclock
 *
 * The bridge between timeclock v1 and payroll. Takes a service + week
 * and materialises TimesheetEntry rows from RosterShift rows the staff
 * actually clocked (actualStart AND actualEnd set), pricing each entry
 * from the EmploymentContract in force on the shift date — the same
 * "most recently issued contract whose window contains the date" rule
 * the roster cost projection uses.
 *
 * Idempotent: re-running skips shifts that already have an entry for
 * the same user + date + shiftStart, so approved manual corrections
 * are never clobbered. Blocked once the timesheet has left draft —
 * submitted/approved/exported timesheets are payroll records.
 *
 * Before this route existed, timeclock actuals were display-only
 * (variance chips on the roster grid) and timesheets could only be
 * populated by OWNA xlsx import or manual entry.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { parseJsonBody, ApiError } from "@/lib/api-error";
import { withApiAuth } from "@/lib/server-auth";
import { payRateForShift, type ContractWindow } from "@/lib/roster-cost";

const generateSchema = z.object({
  serviceId: z.string().min(1, "Service ID is required"),
  weekEnding: z.string().min(1, "Week ending date is required"),
});

const DAY_MS = 24 * 60 * 60 * 1000;

/** RosterShift.sessionType → TimesheetEntry.shiftType */
const SESSION_TO_SHIFT_TYPE = {
  bsc: "shift_bsc",
  asc: "shift_asc",
  vc: "shift_vac",
} as const;

export const POST = withApiAuth(
  async (req, session) => {
    const role = session.user.role ?? "";
    if (!["owner", "admin", "head_office"].includes(role)) {
      throw ApiError.forbidden("Generating timesheets is admin-tier only.");
    }

    const body = await parseJsonBody(req);
    const parsed = generateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 },
      );
    }

    const { serviceId } = parsed.data;
    const weekEnding = new Date(parsed.data.weekEnding);
    if (Number.isNaN(weekEnding.getTime())) {
      throw ApiError.badRequest("Invalid weekEnding date");
    }
    const weekStart = new Date(weekEnding.getTime() - 6 * DAY_MS);

    // Completed clocked shifts only — a missing actualEnd means the
    // person is still clocked in (or forgot to clock out); those need
    // human review, not a silent payroll row.
    const shifts = await prisma.rosterShift.findMany({
      where: {
        serviceId,
        date: { gte: weekStart, lte: weekEnding },
        userId: { not: null },
        actualStart: { not: null },
        actualEnd: { not: null },
      },
      select: {
        id: true,
        userId: true,
        date: true,
        sessionType: true,
        actualStart: true,
        actualEnd: true,
      },
      orderBy: { date: "asc" },
    });

    const incompleteCount = await prisma.rosterShift.count({
      where: {
        serviceId,
        date: { gte: weekStart, lte: weekEnding },
        userId: { not: null },
        actualStart: { not: null },
        actualEnd: null,
      },
    });

    if (shifts.length === 0) {
      return NextResponse.json({
        created: 0,
        skipped: 0,
        unpriced: 0,
        incomplete: incompleteCount,
        message:
          incompleteCount > 0
            ? `No completed clocked shifts for that week — ${incompleteCount} shift(s) are missing a clock-out.`
            : "No clocked shifts found for that week.",
      });
    }

    // Find-or-create the timesheet, same shape as the OWNA import.
    let timesheet = await prisma.timesheet.findUnique({
      where: { serviceId_weekEnding: { serviceId, weekEnding } },
    });

    if (timesheet && timesheet.deleted) {
      timesheet = await prisma.timesheet.update({
        where: { id: timesheet.id },
        data: { deleted: false, status: "ts_draft" },
      });
    }

    if (timesheet && !["ts_draft", "rejected"].includes(timesheet.status)) {
      throw ApiError.conflict(
        `Timesheet for this week is ${timesheet.status.replace("ts_", "")} — reopen it before regenerating from timeclock.`,
      );
    }

    if (!timesheet) {
      timesheet = await prisma.timesheet.create({
        data: { serviceId, weekEnding, importSource: "timeclock" },
      });
    }

    // Price each shift from the contract in force on its date.
    const userIds = [...new Set(shifts.map((s) => s.userId!))];
    const contracts: ContractWindow[] = (
      await prisma.employmentContract.findMany({
        where: {
          userId: { in: userIds },
          status: { in: ["active", "superseded"] },
          startDate: { lte: weekEnding },
          OR: [{ endDate: null }, { endDate: { gte: weekStart } }],
        },
        select: { userId: true, payRate: true, startDate: true, endDate: true },
      })
    ).map((c) => ({
      userId: c.userId,
      payRate: c.payRate,
      startDate: c.startDate,
      endDate: c.endDate,
    }));

    // Idempotency: skip shifts whose entry already exists (same user +
    // date + clocked start). Manual edits to those entries survive.
    const existing = await prisma.timesheetEntry.findMany({
      where: { timesheetId: timesheet.id },
      select: { userId: true, date: true, shiftStart: true },
    });
    const existingKeys = new Set(
      existing.map(
        (e) => `${e.userId}|${e.date.toISOString().slice(0, 10)}|${e.shiftStart.getTime()}`,
      ),
    );

    let created = 0;
    let skipped = 0;
    let unpriced = 0;

    const rows = [];
    for (const shift of shifts) {
      const key = `${shift.userId}|${shift.date.toISOString().slice(0, 10)}|${shift.actualStart!.getTime()}`;
      if (existingKeys.has(key)) {
        skipped += 1;
        continue;
      }

      const totalHours =
        Math.round(
          ((shift.actualEnd!.getTime() - shift.actualStart!.getTime()) /
            (60 * 60 * 1000)) *
            100,
        ) / 100;
      // Zero/negative duration means corrupted clock data — skip it
      // rather than writing a nonsense payroll row.
      if (totalHours <= 0) {
        skipped += 1;
        continue;
      }

      const payRate = payRateForShift(contracts, shift.userId!, shift.date);
      if (payRate === null) unpriced += 1;

      rows.push({
        timesheetId: timesheet.id,
        userId: shift.userId!,
        date: shift.date,
        shiftStart: shift.actualStart!,
        shiftEnd: shift.actualEnd!,
        breakMinutes: 0,
        totalHours,
        shiftType: SESSION_TO_SHIFT_TYPE[shift.sessionType],
        payRate,
        notes: "Generated from timeclock",
      });
      created += 1;
    }

    if (rows.length > 0) {
      await prisma.timesheetEntry.createMany({ data: rows });
    }

    await prisma.activityLog.create({
      data: {
        userId: session.user.id,
        action: "timesheet_generated_from_timeclock",
        entityType: "timesheet",
        entityId: timesheet.id,
        details: {
          serviceId,
          weekEnding: parsed.data.weekEnding,
          created,
          skipped,
          unpriced,
          incomplete: incompleteCount,
        },
      },
    });

    return NextResponse.json(
      {
        timesheetId: timesheet.id,
        created,
        skipped,
        unpriced,
        incomplete: incompleteCount,
      },
      { status: 201 },
    );
  },
);
