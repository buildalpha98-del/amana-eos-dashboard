/**
 * Notification fan-out for pay-discrepancy reports. Mirrors
 * src/lib/creative-request/notify.ts's contract: side-effect-free on
 * failure — every helper try/catches and logs but never throws.
 */
import type { Prisma, PrismaClient } from "@prisma/client";
import { NOTIFICATION_TYPES } from "@/lib/notification-types";
import { logger } from "@/lib/logger";

type Db = PrismaClient | Prisma.TransactionClient;

export interface PayDiscrepancySummary {
  id: string;
  reporterId: string;
  reporterName: string;
}

function link(): string {
  return `/leave-payroll?tab=discrepancies`;
}

/** New report → every active admin-tier user (owner/head_office/admin). */
export async function notifyPayDiscrepancySubmitted(
  db: Db,
  report: PayDiscrepancySummary,
): Promise<void> {
  try {
    const admins = await db.user.findMany({
      where: { role: { in: ["owner", "head_office", "admin"] }, active: true },
      select: { id: true },
    });
    const targets = admins.map((u) => u.id);
    if (targets.length === 0) return;
    await db.userNotification.createMany({
      data: targets.map((userId) => ({
        userId,
        type: NOTIFICATION_TYPES.PAY_DISCREPANCY_SUBMITTED,
        title: "Pay discrepancy reported",
        body: `${report.reporterName} flagged a pay/hours mismatch`,
        link: link(),
      })),
    });
  } catch (err) {
    logger.error("pay-discrepancy notify (submitted) failed", { err, reportId: report.id });
  }
}

/** Resolved/dismissed → the reporter (unless they resolved their own — admins can report too). */
export async function notifyPayDiscrepancyResolved(
  db: Db,
  report: PayDiscrepancySummary,
  actorId: string,
  outcome: "resolved" | "dismissed",
): Promise<void> {
  try {
    if (report.reporterId === actorId) return;
    await db.userNotification.create({
      data: {
        userId: report.reporterId,
        type: NOTIFICATION_TYPES.PAY_DISCREPANCY_RESOLVED,
        title: outcome === "resolved" ? "Pay discrepancy resolved" : "Pay discrepancy dismissed",
        body: "Your pay discrepancy report has an update.",
        link: `/my-portal`,
      },
    });
  } catch (err) {
    logger.error("pay-discrepancy notify (resolved) failed", { err, reportId: report.id });
  }
}
