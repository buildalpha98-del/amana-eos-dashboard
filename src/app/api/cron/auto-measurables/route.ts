import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiHandler } from "@/lib/api-handler";
import { logger } from "@/lib/logger";

/**
 * GET /api/cron/auto-measurables
 *
 * Weekly cron (Monday 6:30 AM AEST) — auto-populates scorecard measurables
 * from last week's attendance data.
 *
 * Matches measurables by title pattern:
 * - "bsc occupancy" → avg BSC attended/capacity
 * - "asc occupancy" → avg ASC attended/capacity
 * - "total enrolled" → sum enrolled
 * - "total attended" → sum attended
 *
 * Auth: Bearer CRON_SECRET
 */
export const GET = withApiHandler(async (req) => {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const now = new Date();

    // Calculate last week's Monday and this Monday
    const dayOfWeek = now.getDay();
    const thisMonday = new Date(now);
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    thisMonday.setDate(now.getDate() + mondayOffset);
    thisMonday.setHours(0, 0, 0, 0);

    const lastMonday = new Date(thisMonday);
    lastMonday.setDate(thisMonday.getDate() - 7);

    const lastFriday = new Date(lastMonday);
    lastFriday.setDate(lastMonday.getDate() + 4);
    lastFriday.setHours(23, 59, 59, 999);

    // Get all measurables with attendance-related titles
    const measurables = await prisma.measurable.findMany({
      where: {
        OR: [
          { title: { contains: "occupancy", mode: "insensitive" } },
          { title: { contains: "attendance", mode: "insensitive" } },
          { title: { contains: "enrolled", mode: "insensitive" } },
          { title: { contains: "attended", mode: "insensitive" } },
        ],
      },
      select: {
        id: true,
        title: true,
        serviceId: true,
        ownerId: true,
        goalValue: true,
        goalDirection: true,
      },
    });

    if (measurables.length === 0) {
      return NextResponse.json({
        message: "No attendance-related measurables found",
        populated: 0,
      });
    }

    // Get last week's attendance data grouped by service
    const attendance = await prisma.dailyAttendance.findMany({
      where: {
        date: { gte: lastMonday, lte: lastFriday },
      },
    });

    // Build per-service aggregates
    const serviceData = new Map<
      string,
      {
        bscAttended: number;
        bscCapacity: number;
        ascAttended: number;
        ascCapacity: number;
        totalEnrolled: number;
        totalAttended: number;
        bscDays: number;
        ascDays: number;
      }
    >();

    for (const rec of attendance) {
      if (!serviceData.has(rec.serviceId)) {
        serviceData.set(rec.serviceId, {
          bscAttended: 0,
          bscCapacity: 0,
          ascAttended: 0,
          ascCapacity: 0,
          totalEnrolled: 0,
          totalAttended: 0,
          bscDays: 0,
          ascDays: 0,
        });
      }
      const data = serviceData.get(rec.serviceId)!;

      if (rec.sessionType === "bsc") {
        data.bscAttended += rec.attended;
        data.bscCapacity += rec.capacity;
        data.bscDays++;
      } else if (rec.sessionType === "asc") {
        data.ascAttended += rec.attended;
        data.ascCapacity += rec.capacity;
        data.ascDays++;
      }
      data.totalEnrolled += rec.enrolled;
      data.totalAttended += rec.attended;
    }

    let populated = 0;
    const errors: string[] = [];

    for (const measurable of measurables) {
      try {
        const data = measurable.serviceId ? serviceData.get(measurable.serviceId) : null;
        if (!data && measurable.serviceId) continue; // No attendance data for this service

        const titleLower = measurable.title.toLowerCase();
        let value: number | null = null;

        if (titleLower.includes("bsc") && titleLower.includes("occupancy")) {
          const d = data || aggregateAll(serviceData);
          value = d.bscCapacity > 0 ? Math.round((d.bscAttended / d.bscCapacity) * 100) : 0;
        } else if (titleLower.includes("asc") && titleLower.includes("occupancy")) {
          const d = data || aggregateAll(serviceData);
          value = d.ascCapacity > 0 ? Math.round((d.ascAttended / d.ascCapacity) * 100) : 0;
        } else if (titleLower.includes("occupancy")) {
          // Overall occupancy (both sessions)
          const d = data || aggregateAll(serviceData);
          const totalCap = d.bscCapacity + d.ascCapacity;
          const totalAtt = d.bscAttended + d.ascAttended;
          value = totalCap > 0 ? Math.round((totalAtt / totalCap) * 100) : 0;
        } else if (titleLower.includes("enrolled")) {
          const d = data || aggregateAll(serviceData);
          value = d.totalEnrolled;
        } else if (titleLower.includes("attended") || titleLower.includes("attendance")) {
          const d = data || aggregateAll(serviceData);
          value = d.totalAttended;
        }

        if (value === null) continue;

        // Determine if on track
        const onTrack = evaluateOnTrack(value, measurable.goalValue, measurable.goalDirection);

        // Upsert entry for this week
        await prisma.measurableEntry.upsert({
          where: {
            measurableId_weekOf: {
              measurableId: measurable.id,
              weekOf: lastMonday,
            },
          },
          update: { value, onTrack, notes: "Auto-populated from attendance data" },
          create: {
            measurableId: measurable.id,
            weekOf: lastMonday,
            value,
            onTrack,
            enteredById: measurable.ownerId,
            notes: "Auto-populated from attendance data",
          },
        });

        populated++;
      } catch (err) {
        errors.push(`Measurable ${measurable.id}: ${err instanceof Error ? err.message : "Unknown"}`);
      }
    }

    return NextResponse.json({
      message: "Auto-measurables complete",
      measurablesFound: measurables.length,
      populated,
      weekOf: lastMonday.toISOString().split("T")[0],
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (err) {
    logger.error("Auto-measurables cron failed", { err });
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Cron failed" },
      { status: 500 }
    );
  }
});

// Helper: aggregate all services
function aggregateAll(
  serviceData: Map<string, { bscAttended: number; bscCapacity: number; ascAttended: number; ascCapacity: number; totalEnrolled: number; totalAttended: number; bscDays: number; ascDays: number }>
) {
  const result = { bscAttended: 0, bscCapacity: 0, ascAttended: 0, ascCapacity: 0, totalEnrolled: 0, totalAttended: 0, bscDays: 0, ascDays: 0 };
  for (const d of serviceData.values()) {
    result.bscAttended += d.bscAttended;
    result.bscCapacity += d.bscCapacity;
    result.ascAttended += d.ascAttended;
    result.ascCapacity += d.ascCapacity;
    result.totalEnrolled += d.totalEnrolled;
    result.totalAttended += d.totalAttended;
  }
  return result;
}

function evaluateOnTrack(value: number, goalValue: number, goalDirection: string): boolean {
  switch (goalDirection) {
    case "above":
      return value >= goalValue;
    case "below":
      return value <= goalValue;
    case "exact":
      return Math.abs(value - goalValue) <= goalValue * 0.05; // 5% tolerance
    default:
      return value >= goalValue;
  }
}
