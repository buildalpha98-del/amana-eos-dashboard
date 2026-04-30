import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyCronSecret, acquireCronLock } from "@/lib/cron-guard";
import { computeLiveRatios } from "@/lib/ratio-compute";
import { logger } from "@/lib/logger";

/**
 * Hourly ratio-capture cron.
 *
 * For every active service, computes the live ratio across bsc/asc/vc and
 * writes three `RatioSnapshot` rows (one per session type). Idempotent
 * within a given "YYYY-MM-DDTHH" period thanks to acquireCronLock.
 *
 * Trigger: `vercel.json` schedule entry (caller: add hourly)
 */
export async function GET(req: Request) {
  const authError = verifyCronSecret(req);
  if (authError) return authError.error;

  const guard = await acquireCronLock("ratio-capture", "hourly");
  if (!guard.acquired) {
    return NextResponse.json({ skipped: true, reason: guard.reason });
  }

  try {
    const services = await prisma.service.findMany({
      where: { status: "active" },
      select: { id: true },
    });

    const now = new Date();
    let written = 0;
    let belowRatioCount = 0;

    for (const svc of services) {
      const rows = await computeLiveRatios(svc.id, now);
      for (const r of rows) {
        // Even when educatorCount AND childCount are both zero we still store
        // a snapshot — useful signal for "service closed / no activity" and
        // keeps the time series continuous.
        await prisma.ratioSnapshot.create({
          data: {
            serviceId: r.serviceId,
            date: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
            sessionType: r.sessionType,
            capturedAt: r.capturedAt,
            educatorCount: r.educatorCount,
            childCount: r.childCount,
            ratioText: r.ratioText,
            belowRatio: r.belowRatio,
            educatorIds: r.educatorIds,
            notes: r.notes,
          },
        });
        written += 1;
        if (r.belowRatio) belowRatioCount += 1;
      }
    }

    await guard.complete({
      servicesProcessed: services.length,
      snapshotsWritten: written,
      belowRatioCount,
    });

    return NextResponse.json({
      ok: true,
      servicesProcessed: services.length,
      snapshotsWritten: written,
      belowRatioCount,
    });
  } catch (err) {
    await guard.fail(err);
    logger.error("ratio-capture cron failed", { err });
    return NextResponse.json(
      { error: "ratio-capture failed" },
      { status: 500 },
    );
  }
}
