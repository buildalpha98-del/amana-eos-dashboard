import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { logger } from "@/lib/logger";
/**
 * POST /api/scorecard/seed
 *
 * Seeds service-level scorecard measurables for each active service.
 * These are the key weekly KPIs that centre coordinators should track.
 * Owner-only, idempotent (skips measurables that already exist by title+serviceId).
 */

const SERVICE_MEASURABLES = [
  {
    title: "ASC Attendance",
    description: "Number of children attending After School Care this week",
    goalValue: 40,
    goalDirection: "above" as const,
    unit: "children",
  },
  {
    title: "BSC Attendance",
    description: "Number of children attending Before School Care this week",
    goalValue: 15,
    goalDirection: "above" as const,
    unit: "children",
  },
  {
    title: "Permanent Booking Rate",
    description: "Percentage of attendance from permanent (regular) bookings vs casual",
    goalValue: 70,
    goalDirection: "above" as const,
    unit: "%",
  },
  {
    title: "Staff Ratio Compliance",
    description: "Percentage of sessions meeting required educator-to-child ratios",
    goalValue: 100,
    goalDirection: "above" as const,
    unit: "%",
  },
  {
    title: "Incident Count",
    description: "Total incidents (injury, illness, behaviour) reported this week — lower is better",
    goalValue: 2,
    goalDirection: "below" as const,
    unit: "count",
  },
  {
    title: "Parent Communication",
    description: "Number of parent touchpoints (emails, calls, face-to-face) this week",
    goalValue: 5,
    goalDirection: "above" as const,
    unit: "count",
  },
  {
    title: "Program Completion",
    description: "Percentage of planned program activities delivered this week",
    goalValue: 90,
    goalDirection: "above" as const,
    unit: "%",
  },
  {
    title: "Family Satisfaction",
    description: "Average parent satisfaction score from feedback (1-5 scale)",
    goalValue: 4.2,
    goalDirection: "above" as const,
    unit: "score",
  },
];

export const POST = withApiAuth(async (req, session) => {
  try {
    // Get or create the default scorecard
    let scorecard = await prisma.scorecard.findFirst({
      orderBy: { createdAt: "asc" },
    });

    if (!scorecard) {
      scorecard = await prisma.scorecard.create({
        data: { title: "Weekly Leadership Scorecard" },
      });
    }

    // Get all active services
    const services = await prisma.service.findMany({
      where: { status: "active" },
      select: { id: true, name: true },
    });

    const created: string[] = [];
    const skipped: string[] = [];

    for (const service of services) {
      for (const m of SERVICE_MEASURABLES) {
        // Check if this measurable already exists for this service
        const existing = await prisma.measurable.findFirst({
          where: {
            title: m.title,
            serviceId: service.id,
            scorecardId: scorecard.id,
          },
        });

        if (existing) {
          skipped.push(`${service.name}: ${m.title}`);
          continue;
        }

        await prisma.measurable.create({
          data: {
            title: m.title,
            description: m.description,
            goalValue: m.goalValue,
            goalDirection: m.goalDirection,
            unit: m.unit,
            frequency: "weekly",
            scorecardId: scorecard.id,
            serviceId: service.id,
          },
        });

        created.push(`${service.name}: ${m.title}`);
      }
    }

    return NextResponse.json({
      message: `Seeded ${created.length} measurables across ${services.length} services`,
      created,
      skipped: skipped.length,
      total: created.length,
    });
  } catch (err) {
    logger.error("Scorecard seed error", { err });
    return NextResponse.json(
      { error: "Failed to seed scorecard measurables" },
      { status: 500 }
    );
  }
}, { roles: ["owner"] });
