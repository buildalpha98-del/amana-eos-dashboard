import { NextRequest, NextResponse } from "next/server";
import { withParentAuth } from "@/lib/parent-auth";
import { ApiError } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";

/**
 * GET — THIS child's attendance, from their own sign-in records.
 *
 * REWRITTEN 2026-08-05. The previous version read service-level
 * DailyAttendance aggregates and marked the child "present" whenever the
 * CENTRE had any attendee that day — which is how the old attendance tab
 * reported present-present-present and "98 of 98" for a child with no
 * bookings at all. A service total cannot answer a per-child question.
 *
 * This reads AttendanceRecord rows: actual sign-ins and sign-outs for
 * this child, with who did each — the same rows the roll call writes.
 */
export const GET = withParentAuth(
  async (req: NextRequest, { parent, params }) => {
    const { id: childId } = await (params as Promise<{ id: string }>);
    if (!childId) throw ApiError.badRequest("Child ID is required");

    const child = await prisma.child.findUnique({
      where: { id: childId },
      select: { id: true, enrolmentId: true },
    });
    if (
      !child ||
      !child.enrolmentId ||
      !parent.enrolmentIds.includes(child.enrolmentId)
    ) {
      throw ApiError.notFound("Child not found");
    }

    const limitParam = Number(req.nextUrl.searchParams.get("limit"));
    const limit =
      Number.isFinite(limitParam) && limitParam > 0
        ? Math.min(limitParam, 90)
        : 30;

    const records = await prisma.attendanceRecord.findMany({
      where: {
        childId,
        // Only sessions that actually happened. A row created for an
        // absence has no sign-in and would read as a mystery blank line.
        signInTime: { not: null },
      },
      orderBy: { date: "desc" },
      take: limit,
      select: {
        id: true,
        date: true,
        sessionType: true,
        signInTime: true,
        signOutTime: true,
        signedInByName: true,
        signedOutByName: true,
      },
    });

    return NextResponse.json({ records });
  },
);
