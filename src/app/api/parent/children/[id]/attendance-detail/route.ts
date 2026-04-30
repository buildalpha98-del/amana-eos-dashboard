import { NextResponse } from "next/server";
import { withParentAuth } from "@/lib/parent-auth";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-error";

/**
 * GET /api/parent/children/[id]/attendance-detail?date=2026-04-04
 *
 * Returns per-session AttendanceRecord data for a specific child on a specific date.
 * Includes sign-in/out times, staff names, status, and absence reasons.
 * Falls back to DailyAttendance aggregates for dates without individual records.
 */
export const GET = withParentAuth(async (req, ctx) => {
  const params = await ctx.params;
  const childId = params?.id;
  if (!childId) throw ApiError.badRequest("Child ID is required");

  const { searchParams } = new URL(req.url);
  const dateStr = searchParams.get("date");

  if (dateStr && !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    throw ApiError.badRequest("date must be YYYY-MM-DD");
  }

  // Default to today
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  let date: Date;
  if (dateStr) {
    const [y, m, d] = dateStr.split("-").map(Number);
    date = new Date(Date.UTC(y, m - 1, d));
  } else {
    date = today;
  }

  // Verify this child belongs to the parent
  const child = await prisma.child.findUnique({
    where: { id: childId },
    select: { id: true, enrolmentId: true, serviceId: true },
  });

  if (!child) throw ApiError.notFound("Child not found");

  if (!child.enrolmentId || !ctx.parent.enrolmentIds.includes(child.enrolmentId)) {
    throw ApiError.forbidden("You do not have access to this child");
  }

  // Fetch individual attendance records for this date
  const records = await prisma.attendanceRecord.findMany({
    where: { childId, date },
    include: {
      signedInBy: { select: { id: true, name: true } },
      signedOutBy: { select: { id: true, name: true } },
    },
    orderBy: { sessionType: "asc" },
  });

  if (records.length > 0) {
    return NextResponse.json({
      source: "individual",
      date: date.toISOString(),
      sessions: records.map((r) => ({
        sessionType: r.sessionType,
        status: r.status,
        signInTime: r.signInTime,
        signOutTime: r.signOutTime,
        signedInBy: r.signedInBy?.name ?? null,
        signedOutBy: r.signedOutBy?.name ?? null,
        absenceReason: r.absenceReason,
        notes: r.notes,
      })),
    });
  }

  // Fallback: check DailyAttendance for aggregate data (pre-migration dates)
  if (child.serviceId) {
    const aggregates = await prisma.dailyAttendance.findMany({
      where: { serviceId: child.serviceId, date },
      select: { sessionType: true, attended: true, absent: true, enrolled: true },
    });

    if (aggregates.length > 0) {
      return NextResponse.json({
        source: "aggregate",
        date: date.toISOString(),
        sessions: aggregates.map((a) => ({
          sessionType: a.sessionType,
          enrolled: a.enrolled,
          attended: a.attended,
          absent: a.absent,
        })),
      });
    }
  }

  // No data for this date
  return NextResponse.json({
    source: "none",
    date: date.toISOString(),
    sessions: [],
  });
});
