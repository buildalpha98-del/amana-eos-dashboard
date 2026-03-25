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

    // Date filters
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
      return NextResponse.json({
        child: {
          id: child.id,
          firstName: child.firstName,
          surname: child.surname,
          serviceName: child.service?.name ?? null,
        },
        attendance: [],
        from: from.toISOString(),
        to: to.toISOString(),
      });
    }

    // Get attendance records for the child's service in the date range
    const attendance = await prisma.dailyAttendance.findMany({
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
        capacity: true,
      },
      orderBy: { date: "desc" },
    });

    return NextResponse.json({
      child: {
        id: child.id,
        firstName: child.firstName,
        surname: child.surname,
        serviceName: child.service?.name ?? null,
      },
      attendance: attendance.map((a) => ({
        date: a.date.toISOString(),
        sessionType: a.sessionType,
        attended: a.attended,
        absent: a.absent,
        enrolled: a.enrolled,
        capacity: a.capacity,
      })),
      from: from.toISOString(),
      to: to.toISOString(),
    });
  },
);
