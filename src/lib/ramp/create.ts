/**
 * createStaffRamp — the ONE way a 90-day ramp comes into existence.
 *
 * Called by every new-starter creation path (onboarding request, candidate
 * conversion, Add staff with the new-starter flag) and by the daily ramp
 * cron's sweep (any active user whose start date is within the last 90
 * days and has no ramp). Idempotent on userId; swallow-and-log so a ramp
 * hiccup never blocks account creation.
 */
import type { Prisma, PrismaClient } from "@prisma/client";
import { logger } from "@/lib/logger";
import {
  RAMP_CHECKPOINT_DAYS,
  RAMP_SKIP_PAST_DAYS,
} from "./constants";
import { addDays, checkpointDueDate, rampEndDate, weeklyCheckInDates } from "./dates";

type Db = PrismaClient | Prisma.TransactionClient;

export interface CreateRampResult {
  created: boolean;
  rampId: string | null;
}

export async function createStaffRamp(
  db: Db,
  userId: string,
  startDate: Date,
  now: Date = new Date(),
): Promise<CreateRampResult> {
  try {
    const existing = await db.staffRamp.findUnique({ where: { userId }, select: { id: true } });
    if (existing) return { created: false, rampId: existing.id };

    const start = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), startDate.getUTCDate()));
    const skipBefore = addDays(now, -RAMP_SKIP_PAST_DAYS);

    const ramp = await db.staffRamp.create({
      data: {
        userId,
        startDate: start,
        endDate: rampEndDate(start),
        checkIns: {
          create: weeklyCheckInDates(start).map((dueAt, i) => ({
            weekNumber: i + 1,
            dueAt,
            skipped: dueAt < skipBefore,
            // A skipped week is "handled" — the cron must never send it.
            sentAt: dueAt < skipBefore ? now : null,
          })),
        },
        checkpoints: {
          create: RAMP_CHECKPOINT_DAYS.map((day) => ({
            day,
            dueAt: checkpointDueDate(start, day),
          })),
        },
      },
      select: { id: true, endDate: true },
    });

    // Keep the legacy probation field in step so /my-portal + cowork HR
    // reads that still use it agree with the ramp.
    await db.user.updateMany({
      where: { id: userId, probationEndDate: null },
      data: { probationEndDate: ramp.endDate },
    });

    return { created: true, rampId: ramp.id };
  } catch (err) {
    logger.error("createStaffRamp failed", { err, userId });
    return { created: false, rampId: null };
  }
}
