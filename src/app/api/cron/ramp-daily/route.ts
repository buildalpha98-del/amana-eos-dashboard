import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { acquireCronLock, verifyCronSecret } from "@/lib/cron-guard";
import { withApiHandler } from "@/lib/api-handler";
import { logger } from "@/lib/logger";
import { notifyUsers } from "@/lib/notify-user";
import { NOTIFICATION_TYPES } from "@/lib/notification-types";
import { RAMP_CHECKPOINT_REMIND_DAYS, RAMP_LENGTH_DAYS } from "@/lib/ramp/constants";
import { addDays } from "@/lib/ramp/dates";
import { createStaffRamp } from "@/lib/ramp/create";
import { sendRampCheckpointEmail } from "@/lib/ramp/emails";
import { resolveRampWatchers } from "@/lib/ramp/recipients";

/**
 * GET /api/cron/ramp-daily
 *
 * Daily 20:30 UTC (6:30am AEST):
 *   1. Sweep — any active user whose start date is within the last 90 days
 *      and has no ramp gets one (catches starters created outside the three
 *      hooked creation paths, and the day the feature ships).
 *   2. Checkpoints — send due 30/60/90 requests to the service manager +
 *      State Managers (email + in-app), and remind every 7 days while a
 *      checkpoint stays unsubmitted. Overdue day-90s keep reminding until
 *      the probation call is made.
 *
 * Auth: Bearer CRON_SECRET
 */
export const GET = withApiHandler(async (req) => {
  const auth = verifyCronSecret(req);
  if (auth) return auth.error;

  const guard = await acquireCronLock("ramp-daily", "daily");
  if (!guard.acquired) {
    return NextResponse.json({ message: guard.reason, skipped: true });
  }

  try {
    const now = new Date();

    // ── 1. Sweep ───────────────────────────────────────────────
    const recentStarters = await prisma.user.findMany({
      where: {
        active: true,
        startDate: { gte: addDays(now, -RAMP_LENGTH_DAYS), lte: now },
        ramp: null,
      },
      select: { id: true, startDate: true },
    });
    let rampsCreated = 0;
    for (const u of recentStarters) {
      if (!u.startDate) continue;
      const res = await createStaffRamp(prisma, u.id, u.startDate, now);
      if (res.created) rampsCreated++;
    }

    // ── 2. Checkpoint requests + reminders ─────────────────────
    const remindBefore = addDays(now, -RAMP_CHECKPOINT_REMIND_DAYS);
    const due = await prisma.rampCheckpoint.findMany({
      where: {
        dueAt: { lte: now },
        submittedAt: null,
        ramp: { status: { in: ["active", "extended"] }, user: { active: true } },
        OR: [{ sentAt: null }, { lastRemindedAt: null, sentAt: { lte: remindBefore } }, { lastRemindedAt: { lte: remindBefore } }],
      },
      include: { ramp: { include: { user: { select: { id: true, name: true } } } } },
      take: 200,
    });

    let requestsSent = 0;
    let remindersSent = 0;
    const errors: string[] = [];
    for (const cp of due) {
      const starter = cp.ramp.user;
      const reminder = !!cp.sentAt;
      try {
        const watchers = await resolveRampWatchers(prisma, starter.id);
        await notifyUsers(prisma, watchers.map((w) => w.id), {
          type: NOTIFICATION_TYPES.RAMP_CHECKPOINT_DUE,
          title: `${reminder ? "Reminder: " : ""}Day ${cp.day} checkpoint due — ${starter.name}`,
          body: cp.day >= RAMP_LENGTH_DAYS
            ? "Rate their competencies and make the probation call."
            : "Rate their competencies and flag whether they're on track.",
          link: `/staff/${starter.id}#section-ramp`,
        });
        for (const w of watchers) {
          await sendRampCheckpointEmail({ to: w, starterName: starter.name, starterUserId: starter.id, day: cp.day, reminder });
        }
        await prisma.rampCheckpoint.update({
          where: { id: cp.id },
          data: reminder ? { lastRemindedAt: now } : { sentAt: now },
        });
        if (reminder) remindersSent++;
        else requestsSent++;
      } catch (err) {
        errors.push(`${starter.name} day ${cp.day}: ${err instanceof Error ? err.message : String(err)}`);
        logger.error("ramp-daily: checkpoint notify failed", { err, checkpointId: cp.id });
      }
    }

    await guard.complete({ rampsCreated, requestsSent, remindersSent, errors: errors.length });
    return NextResponse.json({ message: "Ramp daily sweep complete", rampsCreated, requestsSent, remindersSent, errors });
  } catch (err) {
    await guard.fail(err);
    throw err;
  }
});
