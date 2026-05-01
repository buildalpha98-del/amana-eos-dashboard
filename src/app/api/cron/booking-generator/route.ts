/**
 * Daily booking-generator cron.
 *
 * Background: per the 2026-04-30 training feedback, Roll Call wasn't
 * auto-populating from active children's permanent enrolment patterns.
 * Children with bookingPrefs like `{ days: { asc: ["monday","wednesday"] },
 * bookingType: "permanent" }` only appeared on the Roll Call when a
 * Booking row existed for that exact (childId, serviceId, date,
 * sessionType). Up until now Bookings were only generated when an
 * enrolment was approved (one batch, 4 weeks ahead) — so by week five
 * the Roll Call started showing empty days.
 *
 * This cron walks every active child with a permanent bookingPrefs and
 * generates the next N days of Booking rows, skipping any that already
 * exist. Idempotent on every dimension:
 *   - Same-day re-runs no-op via acquireCronLock.
 *   - Per-row dedup via the (childId, serviceId, date, sessionType)
 *     unique constraint + skipDuplicates.
 *
 * Schedule: vercel.json → daily at 16:00 UTC (≈ 02:00 AEST midnight),
 * which means the day's Roll Call is fully populated before any
 * educator opens it.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { acquireCronLock, verifyCronSecret } from "@/lib/cron-guard";
import { withApiHandler } from "@/lib/api-handler";
import { generateBookings } from "@/lib/booking-generator";
import { logger } from "@/lib/logger";

// How far ahead to materialise. 14 days is enough to cover a full school
// week + a buffer for parents to view next week's roll, while keeping the
// Booking table from ballooning. Re-running the cron daily moves the
// horizon forward by 24h.
const HORIZON_DAYS = 14;
// Translate to weeks for generateBookings — it accepts weeksAhead.
const WEEKS_AHEAD = Math.ceil(HORIZON_DAYS / 7);

interface RunSummary {
  childrenProcessed: number;
  childrenWithPrefs: number;
  bookingsCreated: number;
  errors: { childId: string; message: string }[];
}

export const GET = withApiHandler(async (req) => {
  // 1. Auth
  const authCheck = verifyCronSecret(req);
  if (authCheck) return authCheck.error;

  // 2. Idempotency lock — daily key is enough; the cron runs once per day.
  const today = new Date().toISOString().split("T")[0];
  const guard = await acquireCronLock(`booking-generator-${today}`, "daily");
  if (!guard.acquired) {
    return NextResponse.json({ message: guard.reason, skipped: true });
  }

  // 3. Pull every active child that has a serviceId AND a permanent prefs
  //    blob. Filtering at the DB layer keeps the Node side lean — large
  //    services have hundreds of active children.
  const children = await prisma.child.findMany({
    where: {
      status: "active",
      serviceId: { not: null },
      bookingPrefs: { not: undefined },
    },
    select: {
      id: true,
      serviceId: true,
      bookingPrefs: true,
    },
  });

  const summary: RunSummary = {
    childrenProcessed: children.length,
    childrenWithPrefs: 0,
    bookingsCreated: 0,
    errors: [],
  };

  // 4. Per-child generate + insert. Ideally we'd batch all bookings and
  //    do one createMany at the end, but with skipDuplicates the cost of
  //    inserting in chunks is negligible and the per-child error-isolation
  //    is worth it (one bad bookingPrefs blob shouldn't kill the run).
  for (const child of children) {
    try {
      if (!child.serviceId) continue;
      const inputs = generateBookings(
        child.id,
        child.serviceId,
        child.bookingPrefs,
        { weeksAhead: WEEKS_AHEAD },
      );
      if (inputs.length === 0) continue;
      summary.childrenWithPrefs += 1;

      const result = await prisma.booking.createMany({
        data: inputs,
        skipDuplicates: true,
      });
      summary.bookingsCreated += result.count;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      summary.errors.push({ childId: child.id, message: msg });
      logger.warn("Booking generator: per-child failure", { childId: child.id, msg });
    }
  }

  await guard.complete({
    childrenProcessed: summary.childrenProcessed,
    childrenWithPrefs: summary.childrenWithPrefs,
    bookingsCreated: summary.bookingsCreated,
    errorCount: summary.errors.length,
  });

  logger.info("Booking generator cron complete", {
    childrenProcessed: summary.childrenProcessed,
    childrenWithPrefs: summary.childrenWithPrefs,
    bookingsCreated: summary.bookingsCreated,
    errorCount: summary.errors.length,
  });

  return NextResponse.json({
    ok: true,
    ...summary,
  });
});
