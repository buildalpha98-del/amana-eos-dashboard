import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";

// GET /api/leave/calendar — approved + pending leave for a service in a month
export async function GET(req: NextRequest) {
  const { error } = await requireAuth();
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const serviceId = searchParams.get("serviceId");
  const year = searchParams.get("year");
  const month = searchParams.get("month");

  if (!year || !month) {
    return NextResponse.json(
      { error: "year and month are required" },
      { status: 400 }
    );
  }

  const yearNum = parseInt(year);
  const monthNum = parseInt(month);

  // Build date range for the entire month
  const monthStart = new Date(yearNum, monthNum - 1, 1);
  const monthEnd = new Date(yearNum, monthNum, 0); // last day of month

  const where: Record<string, unknown> = {
    status: { in: ["leave_approved", "leave_pending"] },
    // Leave overlaps with the month if startDate <= monthEnd AND endDate >= monthStart
    startDate: { lte: monthEnd },
    endDate: { gte: monthStart },
  };

  if (serviceId) where.serviceId = serviceId;

  const requests = await prisma.leaveRequest.findMany({
    where: where as any,
    include: {
      user: { select: { id: true, name: true } },
    },
    orderBy: { startDate: "asc" },
  });

  const calendar = requests.map((r) => ({
    userId: r.userId,
    userName: r.user.name,
    leaveType: r.leaveType,
    startDate: r.startDate,
    endDate: r.endDate,
    status: r.status,
    totalDays: r.totalDays,
  }));

  return NextResponse.json(calendar);
}
