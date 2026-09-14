import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { acquireCronLock, verifyCronSecret } from "@/lib/cron-guard";
import { withApiHandler } from "@/lib/api-handler";
import { logger } from "@/lib/logger";
import { sendRampCheckInEmail } from "@/lib/ramp/emails";

/**
 * GET /api/cron/ramp-weekly-checkin
 *
 * Friday 05:00 UTC (3pm AEST) — sends every due, unsent, unskipped weekly
 * ramp check-in on an open ramp. `sentAt` is the idempotency guard; a
 * departed starter's row is stamped sent without an email.
 *
 * Auth: Bearer CRON_SECRET
 */
export const GET = withApiHandler(async (req) => {
  const auth = verifyCronSecret(req);
  if (auth) return auth.error;

  const guard = await acquireCronLock("ramp-weekly-checkin", "daily");
  if (!guard.acquired) {
    return NextResponse.json({ message: guard.reason, skipped: true });
  }

  try {
    const due = await prisma.rampCheckIn.findMany({
      where: {
        dueAt: { lte: new Date() },
        sentAt: null,
        skipped: false,
        ramp: { status: { in: ["active", "extended"] } },
      },
      include: { ramp: { include: { user: { select: { id: true, name: true, email: true, active: true } } } } },
      take: 200,
    });

    let sent = 0;
    let skippedInactive = 0;
    const errors: string[] = [];
    for (const checkIn of due) {
      const user = checkIn.ramp.user;
      if (!user.active) {
        await prisma.rampCheckIn.update({ where: { id: checkIn.id }, data: { sentAt: new Date(), skipped: true } });
        skippedInactive++;
        continue;
      }
      try {
        await sendRampCheckInEmail({
          email: user.email,
          name: user.name,
          weekNumber: checkIn.weekNumber,
          token: checkIn.token,
        });
        await prisma.rampCheckIn.update({ where: { id: checkIn.id }, data: { sentAt: new Date() } });
        sent++;
      } catch (err) {
        errors.push(`${user.email}: ${err instanceof Error ? err.message : String(err)}`);
        logger.error("ramp-weekly-checkin: send failed", { err, checkInId: checkIn.id });
      }
    }

    await guard.complete({ sent, skippedInactive, errors: errors.length });
    return NextResponse.json({ message: "Ramp weekly check-ins sent", sent, skippedInactive, errors });
  } catch (err) {
    await guard.fail(err);
    throw err;
  }
});
