/**
 * Applying scheduled fee changes.
 *
 * A centre decides in July that the rate changes in August. Without
 * this they write it in a calendar and do it by hand on the day, which
 * is how a fee rise gets missed, or applied a fortnight early to
 * families who were quoted the old price.
 *
 * Design notes worth keeping:
 *
 *  - The query is `effectiveDate <= today`, not `= today`. A cron that
 *    fails on the 10th must still apply the 10th's change on the 11th.
 *    Matching only today would silently drop it forever.
 *  - Applying is idempotent: the row flips to `applied` in the same
 *    transaction as the price write, so a re-run finds nothing to do.
 *  - The fee is matched by `feeTierId`. A tier deleted before its change
 *    lands is skipped and marked cancelled rather than re-created — the
 *    centre removed that fee on purpose.
 */

import type { PrismaClient } from "@prisma/client";
import { sessionTimesSchema, type SessionTimes } from "@/lib/service-settings";

export interface ApplyResult {
  applied: number;
  cancelled: number;
  services: number;
}

/** UTC midnight today, matching how `@db.Date` columns are stored. */
export function todayUtc(now = new Date()): Date {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

/**
 * Apply every due fee change across all services (or one, when given).
 * Returns counts rather than rows — the caller is a cron and a log line.
 */
export async function applyDueFeeChanges(
  prisma: PrismaClient,
  opts: { serviceId?: string; now?: Date } = {},
): Promise<ApplyResult> {
  const today = todayUtc(opts.now);

  const due = await prisma.serviceFeeChange.findMany({
    where: {
      status: "scheduled",
      effectiveDate: { lte: today },
      ...(opts.serviceId ? { serviceId: opts.serviceId } : {}),
    },
    orderBy: { effectiveDate: "asc" },
  });
  if (due.length === 0) return { applied: 0, cancelled: 0, services: 0 };

  // Group by service: one read-modify-write of sessionTimes per service
  // rather than per change, so two changes to the same room on the same
  // day can't overwrite each other.
  const byService = new Map<string, typeof due>();
  for (const c of due) {
    if (!byService.has(c.serviceId)) byService.set(c.serviceId, []);
    byService.get(c.serviceId)!.push(c);
  }

  let applied = 0;
  let cancelled = 0;

  for (const [serviceId, changes] of byService) {
    await prisma.$transaction(async (tx) => {
      const service = await tx.service.findUnique({
        where: { id: serviceId },
        select: { sessionTimes: true },
      });
      if (!service) return;

      const parsed = sessionTimesSchema.safeParse(service.sessionTimes ?? {});
      const times: SessionTimes = parsed.success ? parsed.data : {};

      const appliedIds: string[] = [];
      const cancelledIds: string[] = [];

      for (const c of changes) {
        const room = times[c.sessionType as keyof SessionTimes];
        const tier = room?.fees?.find((f) => f.id === c.feeTierId);
        if (!room || !tier) {
          // The fee was deleted between scheduling and today. The centre
          // meant to remove it; re-creating it would be us overruling them.
          cancelledIds.push(c.id);
          continue;
        }
        tier.amountCents = c.toAmountCents;
        if (c.toCasualCents !== null) tier.casualAmountCents = c.toCasualCents;
        if (c.toStaffCents !== null) tier.staffAmountCents = c.toStaffCents;
        appliedIds.push(c.id);
      }

      if (appliedIds.length > 0) {
        await tx.service.update({
          where: { id: serviceId },
          data: { sessionTimes: times as object },
        });
        await tx.serviceFeeChange.updateMany({
          where: { id: { in: appliedIds } },
          data: { status: "applied", appliedAt: new Date() },
        });
      }
      if (cancelledIds.length > 0) {
        await tx.serviceFeeChange.updateMany({
          where: { id: { in: cancelledIds } },
          data: { status: "cancelled" },
        });
      }

      applied += appliedIds.length;
      cancelled += cancelledIds.length;
    });
  }

  return { applied, cancelled, services: byService.size };
}
