import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireAuth } from "@/lib/server-auth";
import { getServiceScope } from "@/lib/service-scope";
import {
  analyseStaffingForWeek,
  SHIFT_COST,
} from "@/lib/staffing-analysis";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const { session, error } = await requireAuth();
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const serviceId = searchParams.get("serviceId");
  if (!serviceId) {
    return NextResponse.json(
      { error: "serviceId is required" },
      { status: 400 },
    );
  }

  // Service scope check
  const scope = getServiceScope(session);
  if (scope && scope !== serviceId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Default to current week (Monday)
  const weekStartParam = searchParams.get("weekStart");
  let weekStart: Date;
  if (weekStartParam) {
    weekStart = new Date(weekStartParam + "T00:00:00Z");
  } else {
    const now = new Date();
    const day = now.getUTCDay();
    const diff = day === 0 ? -6 : 1 - day; // Adjust to Monday
    weekStart = new Date(now);
    weekStart.setUTCDate(now.getUTCDate() + diff);
    weekStart.setUTCHours(0, 0, 0, 0);
  }

  const weekAnalysis = await analyseStaffingForWeek(serviceId, weekStart);

  // Monthly overstaffing cost (current month)
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);

  const monthlyRoster = await prisma.rosterShift.groupBy({
    by: ["sessionType"],
    where: {
      serviceId,
      date: { gte: monthStart },
    },
    _count: { id: true },
  });

  const monthlyBookings = await prisma.bookingForecast.findMany({
    where: {
      serviceId,
      date: { gte: monthStart },
    },
  });

  let monthlyOverstaffCost = 0;
  for (const sessionType of ["bsc", "asc"] as const) {
    const rosterCount =
      monthlyRoster.find((r) => r.sessionType === sessionType)?._count.id ?? 0;
    const totalBooked = monthlyBookings
      .filter((b) => b.sessionType === sessionType)
      .reduce((s, b) => s + b.total, 0);
    const uniqueDays = new Set(
      monthlyBookings
        .filter((b) => b.sessionType === sessionType)
        .map((b) => b.date.toISOString().split("T")[0]),
    ).size;
    const avgBooked = uniqueDays > 0 ? totalBooked / uniqueDays : 0;
    const avgRequired = avgBooked > 0 ? Math.ceil(avgBooked / 15) : 0;
    const avgRostered = uniqueDays > 0 ? rosterCount / uniqueDays : 0;
    const avgOverstaff = Math.max(0, avgRostered - avgRequired);
    monthlyOverstaffCost += avgOverstaff * (SHIFT_COST[sessionType] ?? 0) * uniqueDays;
  }

  return NextResponse.json({
    week: weekAnalysis,
    monthlyOverstaffCost: Math.round(monthlyOverstaffCost * 100) / 100,
  });
}
