import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

/**
 * Fire-and-forget activity log for cowork API routes.
 *
 * The cowork API authenticates via API key and has no real User row, so we
 * cannot use userId: "cowork" as a literal string — ActivityLog.userId is a
 * required FK to User and Prisma will throw a constraint violation.
 *
 * This helper resolves the owner user at runtime and writes the log
 * asynchronously. If no owner user is found, or the write fails for any
 * reason, it logs a warning and continues — it must never crash the caller.
 */
export function logCoworkActivity(opts: {
  action: string;
  entityType: string;
  entityId: string;
  details?: Record<string, unknown>;
}): void {
  prisma.user
    .findFirst({ where: { role: "owner" }, select: { id: true } })
    .then((owner) => {
      if (!owner) return;
      return prisma.activityLog.create({
        data: {
          userId: owner.id,
          action: opts.action,
          entityType: opts.entityType,
          entityId: opts.entityId,
          details: opts.details,
        },
      });
    })
    .catch((err) => {
      logger.warn("cowork-activity-log: write skipped", {
        action: opts.action,
        entityType: opts.entityType,
        err,
      });
    });
}
