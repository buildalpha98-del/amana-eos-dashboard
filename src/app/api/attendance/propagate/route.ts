import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { withApiAuth } from "@/lib/server-auth";

const schema = z.object({
  serviceId: z.string().min(1),
  weeksAhead: z.number().min(1).max(52).default(8),
});

/**
 * Propagate enrolled (permanent) counts from the current week to future weeks.
 * Only sets the `enrolled` field — attended, casual, absent are left at 0.
 * Skips dates where a record already exists with a different enrolled count
 * (i.e. the user manually changed it).
 */
export async function propagateEnrolledCounts(
  serviceId: string,
  weeksAhead: number
) {
  // Determine current week (Mon–Fri)
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0=Sun
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(now);
  monday.setDate(now.getDate() + mondayOffset);
  monday.setHours(0, 0, 0, 0);

  const friday = new Date(monday);
  friday.setDate(monday.getDate() + 4);

  // Get current week's records with enrolled > 0
  const currentRecords = await prisma.dailyAttendance.findMany({
    where: {
      serviceId,
      date: { gte: monday, lte: friday },
      enrolled: { gt: 0 },
    },
  });

  if (currentRecords.length === 0) return { propagated: 0 };

  let propagated = 0;

  for (let weekNum = 1; weekNum <= weeksAhead; weekNum++) {
    for (const record of currentRecords) {
      // Calculate the target date (same day-of-week, N weeks ahead)
      const targetDate = new Date(record.date);
      targetDate.setDate(targetDate.getDate() + weekNum * 7);

      // Check if a record already exists for this date+session
      const existing = await prisma.dailyAttendance.findUnique({
        where: {
          serviceId_date_sessionType: {
            serviceId,
            date: targetDate,
            sessionType: record.sessionType,
          },
        },
      });

      // Skip if a record exists with a DIFFERENT enrolled count (manually changed)
      if (existing && existing.enrolled !== record.enrolled) {
        continue;
      }

      // Upsert — only set enrolled, leave daily fields at defaults for new records
      await prisma.dailyAttendance.upsert({
        where: {
          serviceId_date_sessionType: {
            serviceId,
            date: targetDate,
            sessionType: record.sessionType,
          },
        },
        update: {
          enrolled: record.enrolled,
        },
        create: {
          serviceId,
          date: targetDate,
          sessionType: record.sessionType,
          enrolled: record.enrolled,
          attended: 0,
          capacity: record.capacity,
          casual: 0,
          absent: 0,
        },
      });

      propagated++;
    }
  }

  return { propagated };
}

// ── POST /api/attendance/propagate ──────────────────────────

export const POST = withApiAuth(async (req, session) => {
const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { serviceId, weeksAhead } = parsed.data;

  const result = await propagateEnrolledCounts(serviceId, weeksAhead);

  return NextResponse.json({
    success: true,
    propagated: result.propagated,
    weeksAhead,
  });
});
