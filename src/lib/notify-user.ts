/**
 * Shared user-notification creation path (Staff Portal v2, Task 3.3b).
 *
 * Every staff notification writer used to call `db.userNotification.createMany`
 * directly, which meant staff who enabled web push never received anything —
 * there was no fan-out hook. `notifyUsers` is that hook: it creates the in-app
 * rows exactly as before, then best-effort pushes the same title/body to every
 * subscription of the notified users.
 *
 * Contract:
 * - The `createMany` error behaviour is unchanged: creation failures propagate
 *   to the caller, so each writer's existing try/catch semantics still apply.
 * - The push fan-out NEVER throws into callers — it is swallow-and-log
 *   (`sendPushToUsers` already swallows per-endpoint failures and prunes dead
 *   endpoints; this wrapper additionally guards its DB lookups).
 * - `db` may be a TransactionClient. The push fires immediately (before the
 *   surrounding transaction commits) — acceptable for notification pings: a
 *   rolled-back transaction sends at worst one spurious push, never a wrong
 *   in-app row.
 */

import type { Prisma, PrismaClient } from "@prisma/client";
import { logger } from "@/lib/logger";
import { sendPushToUsers } from "@/lib/push/webPush";

type Db = PrismaClient | Prisma.TransactionClient;

export interface NotifyUsersContent {
  type: string;
  title: string;
  body: string;
  link?: string | null;
}

/**
 * Create one `UserNotification` per user (deduped, falsy ids dropped) and
 * fan the same payload out via web push. Returns the number of in-app rows
 * created.
 */
export async function notifyUsers(
  db: Db,
  userIds: string[],
  content: NotifyUsersContent,
): Promise<number> {
  const unique = [...new Set(userIds)].filter(Boolean);
  if (unique.length === 0) return 0;

  const created = await db.userNotification.createMany({
    data: unique.map((userId) => ({
      userId,
      type: content.type,
      title: content.title,
      body: content.body,
      link: content.link ?? null,
    })),
  });

  try {
    await sendPushToUsers(unique, {
      title: content.title,
      body: content.body,
      url: content.link ?? undefined,
    });
  } catch (err) {
    logger.error("notifyUsers: push fan-out failed", {
      type: content.type,
      userCount: unique.length,
      err: err instanceof Error ? err.message : String(err),
    });
  }

  return created.count;
}

/** Single-recipient convenience over `notifyUsers`. */
export async function notifyUser(
  db: Db,
  userId: string,
  content: NotifyUsersContent,
): Promise<number> {
  return notifyUsers(db, [userId], content);
}
