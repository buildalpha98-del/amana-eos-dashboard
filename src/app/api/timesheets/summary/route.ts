import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";

// GET /api/timesheets/summary — aggregate hours by staff member
export async function GET(req: NextRequest) {
  const { error } = await requireAuth(["owner", "admin"]);
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const serviceId = searchParams.get("serviceId");
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");

  if (!startDate || !endDate) {
    return NextResponse.json(
      { error: "startDate and endDate are required" },
      { status: 400 }
    );
  }

  const where: Record<string, unknown> = {
    date: {
      gte: new Date(startDate),
      lte: new Date(endDate),
    },
  };

  if (serviceId) {
    where.timesheet = { serviceId, deleted: false };
  } else {
    where.timesheet = { deleted: false };
  }

  const entries = await prisma.timesheetEntry.findMany({
    where: where as any,
    include: {
      user: { select: { id: true, name: true } },
    },
  });

  // Aggregate by user
  const userMap = new Map<
    string,
    {
      userId: string;
      userName: string;
      totalHours: number;
      shiftBreakdown: Record<string, number>;
    }
  >();

  for (const entry of entries) {
    let agg = userMap.get(entry.userId);
    if (!agg) {
      agg = {
        userId: entry.userId,
        userName: entry.user.name,
        totalHours: 0,
        shiftBreakdown: {
          bsc: 0,
          asc: 0,
          vac: 0,
          pd: 0,
          admin: 0,
          other: 0,
        },
      };
      userMap.set(entry.userId, agg);
    }

    agg.totalHours += entry.totalHours;

    // Map shift type to breakdown key
    const shiftKeyMap: Record<string, string> = {
      shift_bsc: "bsc",
      shift_asc: "asc",
      shift_vac: "vac",
      pd: "pd",
      shift_admin: "admin",
      shift_other: "other",
    };
    const key = shiftKeyMap[entry.shiftType] || "other";
    agg.shiftBreakdown[key] += entry.totalHours;
  }

  // Round totals
  const summary = Array.from(userMap.values()).map((agg) => ({
    ...agg,
    totalHours: Math.round(agg.totalHours * 100) / 100,
    shiftBreakdown: Object.fromEntries(
      Object.entries(agg.shiftBreakdown).map(([k, v]) => [
        k,
        Math.round(v * 100) / 100,
      ])
    ),
  }));

  return NextResponse.json(summary);
}
