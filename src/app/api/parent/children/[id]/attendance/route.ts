import { NextRequest, NextResponse } from "next/server";
import { withParentAuth } from "@/lib/parent-auth";
import { ApiError } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";

export const GET = withParentAuth(
  async (req: NextRequest, { parent, params }) => {
    const { id: childId } = await (params as Promise<{ id: string }>);

    if (!childId) {
      throw ApiError.badRequest("Child ID is required");
    }

    // Resolve child — verify the parent has access via their enrolment IDs
    const child = await prisma.child.findUnique({
      where: { id: childId },
      select: {
        id: true,
        firstName: true,
        surname: true,
        serviceId: true,
        enrolmentId: true,
        service: { select: { id: true, name: true } },
      },
    });

    if (!child || !child.enrolmentId || !parent.enrolmentIds.includes(child.enrolmentId)) {
      throw ApiError.notFound("Child not found");
    }

    // Date range (default: last 30 days)
    const fromParam = req.nextUrl.searchParams.get("from");
    const toParam = req.nextUrl.searchParams.get("to");

    const now = new Date();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(now.getDate() - 30);
    thirtyDaysAgo.setHours(0, 0, 0, 0);

    const from = fromParam ? new Date(fromParam) : thirtyDaysAgo;
    const to = toParam ? new Date(toParam) : now;

    if (isNaN(from.getTime()) || isNaN(to.getTime())) {
      throw ApiError.badRequest("Invalid date format. Use ISO 8601 dates.");
    }

    if (!child.serviceId) {
      return NextResponse.json([]);
    }

    // Get service-level attendance records
    const records = await prisma.dailyAttendance.findMany({
      where: {
        serviceId: child.serviceId,
        date: { gte: from, lte: to },
      },
      select: {
        date: true,
        sessionType: true,
        attended: true,
        absent: true,
        enrolled: true,
      },
      orderBy: { date: "desc" },
    });

    // Convert service-level data to per-day AttendanceDay format
    // Group by date (a service may have BSC + ASC on the same day)
    const dayMap = new Map<string, { date: string; status: "present" | "absent" | "no_session"; signInTime: string | null; signOutTime: string | null }>();

    for (const rec of records) {
      const dateKey = rec.date.toISOString().split("T")[0];
      const existing = dayMap.get(dateKey);

      // If any session on this day has attendees, mark as present
      // (service-level approximation — we don't have per-child data)
      const hasActivity = rec.attended > 0 || rec.enrolled > 0;
      const status: "present" | "absent" | "no_session" = hasActivity
        ? "present"
        : "no_session";

      if (!existing) {
        dayMap.set(dateKey, {
          date: rec.date.toISOString(),
          status,
          signInTime: null,
          signOutTime: null,
        });
      } else if (status === "present" && existing.status !== "present") {
        // Upgrade to present if any session was active
        existing.status = "present";
      }
    }

    // Fill in missing weekdays as "no_session"
    const cursor = new Date(from);
    while (cursor <= to) {
      const dow = cursor.getDay();
      if (dow !== 0 && dow !== 6) {
        const dateKey = cursor.toISOString().split("T")[0];
        if (!dayMap.has(dateKey)) {
          dayMap.set(dateKey, {
            date: new Date(dateKey + "T00:00:00.000Z").toISOString(),
            status: "no_session",
            signInTime: null,
            signOutTime: null,
          });
        }
      }
      cursor.setDate(cursor.getDate() + 1);
    }

    // Sort descending by date and return as flat array
    const days = Array.from(dayMap.values()).sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
    );

    return NextResponse.json(days);
  },
);
