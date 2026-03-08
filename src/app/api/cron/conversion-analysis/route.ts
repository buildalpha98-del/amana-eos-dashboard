import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { acquireCronLock, verifyCronSecret } from "@/lib/cron-guard";

/**
 * GET /api/cron/conversion-analysis
 *
 * Weekly cron (Monday 6 AM AEST / Sunday 20:00 UTC) — identifies families
 * who booked casual 3+ times in the last 14 days as conversion opportunities.
 *
 * Uses BookingForecast casual counts to detect repeat casual families.
 * When OWNA API family-level data becomes available, this will be enhanced
 * to identify specific families rather than service-level aggregates.
 */
export async function GET(req: NextRequest) {
  const auth = verifyCronSecret(req);
  if (auth) return auth.error;

  const guard = await acquireCronLock("conversion-analysis", "weekly");
  if (!guard.acquired) {
    return NextResponse.json({ message: guard.reason, skipped: true });
  }

  try {
    const now = new Date();
    const periodEnd = new Date(now.toISOString().split("T")[0] + "T00:00:00Z");
    const periodStart = new Date(periodEnd);
    periodStart.setDate(periodStart.getDate() - 14);

    // Get all active services
    const services = await prisma.service.findMany({
      where: { status: "active" },
      select: {
        id: true,
        name: true,
        code: true,
        bscDailyRate: true,
        ascDailyRate: true,
        bscCasualRate: true,
        ascCasualRate: true,
      },
    });

    let created = 0;
    let updated = 0;

    for (const service of services) {
      // Get casual booking data for the last 14 days
      const forecasts = await prisma.bookingForecast.findMany({
        where: {
          serviceId: service.id,
          date: { gte: periodStart, lt: periodEnd },
          casual: { gt: 0 },
        },
        orderBy: { date: "asc" },
      });

      if (forecasts.length === 0) continue;

      // Group by session type and count total casual days
      for (const sessionType of ["bsc", "asc"] as const) {
        const sessionForecasts = forecasts.filter(
          (f) => f.sessionType === sessionType
        );

        if (sessionForecasts.length === 0) continue;

        // Total casual bookings across all days for this session type
        const totalCasual = sessionForecasts.reduce(
          (sum, f) => sum + f.casual,
          0
        );
        const daysWithCasual = sessionForecasts.length;

        // Only create opportunity if there are 3+ casual booking days
        // (indicates repeat casual usage worth converting)
        if (daysWithCasual < 3) continue;

        // Use service+session+period as the "family ref" for now.
        // When OWNA family-level API is available, this will use actual family IDs.
        const familyRef = `${service.code}-casual-cohort`;

        // Upsert: create or update
        const existing = await prisma.conversionOpportunity.findUnique({
          where: {
            serviceId_familyRef_sessionType_periodStart: {
              serviceId: service.id,
              familyRef,
              sessionType,
              periodStart,
            },
          },
        });

        if (existing) {
          await prisma.conversionOpportunity.update({
            where: { id: existing.id },
            data: { casualCount: totalCasual },
          });
          updated++;
        } else {
          await prisma.conversionOpportunity.create({
            data: {
              serviceId: service.id,
              familyRef,
              sessionType,
              casualCount: totalCasual,
              periodStart,
              periodEnd,
              status: "identified",
            },
          });
          created++;
        }
      }
    }

    await guard.complete({ created, updated, services: services.length });

    return NextResponse.json({
      message: "Conversion analysis complete",
      created,
      updated,
      servicesAnalysed: services.length,
    });
  } catch (err) {
    await guard.fail(err);
    console.error("Conversion analysis cron failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Cron failed" },
      { status: 500 }
    );
  }
}
