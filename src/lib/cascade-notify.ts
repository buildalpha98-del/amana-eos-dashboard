/**
 * Cascade fan-out (execution layer, 2026-08-31).
 *
 * Before this, publishing a cascade message wrote a row to a board nobody
 * was told about. Now every publish batch lands ONE in-app notification
 * per active user (not one per message line). createFor pattern from
 * creative-request/notify.ts: swallow-and-log, never throws.
 */

import type { Prisma, PrismaClient } from "@prisma/client";
import { logger } from "@/lib/logger";
import { NOTIFICATION_TYPES } from "@/lib/notification-types";
import { notifyUsers } from "@/lib/notify-user";

type Db = PrismaClient | Prisma.TransactionClient;

export async function notifyCascadePublished(
  db: Db,
  {
    meetingTitle,
    count,
    excludeUserId,
  }: { meetingTitle: string; count: number; excludeUserId?: string },
): Promise<void> {
  try {
    const users = await db.user.findMany({
      where: { active: true, ...(excludeUserId ? { id: { not: excludeUserId } } : {}) },
      select: { id: true },
    });
    if (users.length === 0) return;

    await notifyUsers(db, users.map((u) => u.id), {
      type: NOTIFICATION_TYPES.CASCADE_PUBLISHED,
      title: `New cascade message${count === 1 ? "" : "s"} from ${meetingTitle}`,
      body:
        count === 1
          ? "A message from the leadership meeting needs your acknowledgement."
          : `${count} messages from the leadership meeting need your acknowledgement.`,
      link: "/communication?tab=cascade",
    });
  } catch (err) {
    logger.error("cascade-notify: publish fan-out failed", { err });
  }
}
