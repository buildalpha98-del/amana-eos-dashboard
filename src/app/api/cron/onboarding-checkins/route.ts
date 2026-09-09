import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { acquireCronLock, verifyCronSecret } from "@/lib/cron-guard";
import { withApiHandler } from "@/lib/api-handler";
import { sendCheckInEmail } from "@/lib/new-starter-request/checkin-email";
import { logger } from "@/lib/logger";

/**
 * GET /api/cron/onboarding-checkins
 *
 * Daily cron — sends the day-1/week-1/month-1 "how's it going" onboarding
 * touchpoint email for every NewStarterCheckIn that's now due and hasn't
 * been sent yet. `sentAt` (not `dueAt` alone) is the idempotency guard —
 * dueAt doesn't move, so a lock/skip just means it goes out next run.
 *
 * Auth: Bearer CRON_SECRET
 */
export const GET = withApiHandler(async (req) => {
  const auth = verifyCronSecret(req);
  if (auth) return auth.error;

  const guard = await acquireCronLock("onboarding-checkins", "daily");
  if (!guard.acquired) {
    return NextResponse.json({ message: guard.reason, skipped: true });
  }

  try {
    const due = await prisma.newStarterCheckIn.findMany({
      where: { dueAt: { lte: new Date() }, sentAt: null },
      include: { user: { select: { id: true, name: true, email: true, active: true } } },
      take: 200,
    });

    let sent = 0;
    const errors: string[] = [];
    for (const checkIn of due) {
      // A departed starter doesn't need "how's your first month going".
      if (!checkIn.user.active) {
        await prisma.newStarterCheckIn.update({
          where: { id: checkIn.id },
          data: { sentAt: new Date() },
        });
        continue;
      }
      try {
        await sendCheckInEmail({
          email: checkIn.user.email,
          name: checkIn.user.name,
          milestone: checkIn.milestone,
          token: checkIn.token,
        });
        await prisma.newStarterCheckIn.update({
          where: { id: checkIn.id },
          data: { sentAt: new Date() },
        });
        sent += 1;
      } catch (err) {
        errors.push(`${checkIn.user.email}: ${err instanceof Error ? err.message : String(err)}`);
        logger.error("onboarding-checkins: send failed", { err, checkInId: checkIn.id });
      }
    }

    await guard.complete({ sent, errors: errors.length });

    return NextResponse.json({ message: "Onboarding check-ins sweep complete", sent, errors });
  } catch (err) {
    await guard.fail(err);
    throw err;
  }
});
