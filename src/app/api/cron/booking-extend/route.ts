import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyCronSecret, acquireCronLock } from "@/lib/cron-guard";
import { withApiHandler } from "@/lib/api-handler";
import { generateBookings } from "@/lib/booking-generator";
import { logger } from "@/lib/logger";

/**
 * Weekly cron — extends permanent bookings to maintain a 4-week rolling horizon.
 *
 * Also serves as a backfill: children approved before the booking generator was
 * added will get their first bookings created on the first run.
 *
 * Schedule: Sunday 7pm AEST (09:00 UTC) — vercel.json
 */
export const GET = withApiHandler(async (req) => {
  const auth = verifyCronSecret(req);
  if (auth) return auth.error;

  const lock = await acquireCronLock("booking-extend", "weekly");
  if (!lock.acquired) {
    return NextResponse.json({ skipped: true, reason: lock.reason });
  }

  // Find all active children with permanent booking preferences
  const children = await prisma.child.findMany({
    where: { status: "active" },
    select: { id: true, serviceId: true, bookingPrefs: true },
  });

  let totalCreated = 0;
  let childrenProcessed = 0;

  for (const child of children) {
    if (!child.serviceId || !child.bookingPrefs) continue;

    const bp = child.bookingPrefs as Record<string, unknown>;
    if (bp.bookingType !== "permanent") continue;

    // Find the latest existing booking for this child to avoid re-generating
    const latestBooking = await prisma.booking.findFirst({
      where: { childId: child.id, serviceId: child.serviceId, type: "permanent" },
      orderBy: { date: "desc" },
      select: { date: true },
    });

    // Generate from day after latest booking, or from today if no bookings exist
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    let fromDate = today;
    if (latestBooking) {
      const nextDay = new Date(latestBooking.date);
      nextDay.setUTCDate(nextDay.getUTCDate() + 1);
      if (nextDay > today) fromDate = nextDay;
    }

    const bookings = generateBookings(child.id, child.serviceId, child.bookingPrefs, {
      fromDate,
      weeksAhead: 4,
    });

    if (bookings.length > 0) {
      const result = await prisma.booking.createMany({
        data: bookings,
        skipDuplicates: true,
      });
      totalCreated += result.count;
      childrenProcessed++;
    }
  }

  logger.info("Booking extend cron completed", {
    childrenEvaluated: children.length,
    childrenProcessed,
    bookingsCreated: totalCreated,
  });

  return NextResponse.json({
    success: true,
    childrenProcessed,
    bookingsCreated: totalCreated,
  });
});
