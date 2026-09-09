/**
 * Seeds the three onboarding touchpoint check-ins (day 1 / week 1 /
 * month 1) for a brand-new starter. Called once, right when the account
 * is created — `dueAt` is computed here and never recomputed, so a later
 * change to the user's startDate doesn't retroactively move a check-in
 * that may already be sent or answered.
 */
import type { Prisma, PrismaClient } from "@prisma/client";
import { logger } from "@/lib/logger";

type Db = PrismaClient | Prisma.TransactionClient;

const MILESTONE_OFFSET_DAYS: Record<"day_1" | "week_1" | "month_1", number> = {
  day_1: 1,
  week_1: 7,
  month_1: 30,
};

export async function seedNewStarterCheckIns(
  db: Db,
  userId: string,
  startDate: Date,
): Promise<void> {
  try {
    await db.newStarterCheckIn.createMany({
      data: (Object.keys(MILESTONE_OFFSET_DAYS) as Array<keyof typeof MILESTONE_OFFSET_DAYS>).map(
        (milestone) => {
          const dueAt = new Date(startDate);
          dueAt.setDate(dueAt.getDate() + MILESTONE_OFFSET_DAYS[milestone]);
          return { userId, milestone, dueAt };
        },
      ),
      skipDuplicates: true,
    });
  } catch (err) {
    logger.error("seedNewStarterCheckIns failed", { err, userId });
  }
}
