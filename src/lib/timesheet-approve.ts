import { prisma } from "@/lib/prisma";
import { NOTIFICATION_TYPES } from "@/lib/notification-types";
import { logger } from "@/lib/logger";

/**
 * Shared approval action for a timesheet — used by BOTH the single
 * `POST /api/timesheets/[id]/approve` route and the bulk
 * `POST /api/timesheets/bulk-approve` route so that status transition,
 * activity logging, and submitter notification stay byte-identical.
 *
 * Callers are responsible for the guards (exists / not deleted /
 * status === "submitted" / not self-submitted) — the single route
 * turns violations into 404/400/403, the bulk route into per-sheet skips.
 */
export async function approveTimesheet(
  timesheet: { id: string; weekEnding: Date; submittedById: string | null },
  approverId: string,
) {
  const updated = await prisma.timesheet.update({
    where: { id: timesheet.id },
    data: {
      status: "approved",
      approvedAt: new Date(),
      approvedById: approverId,
    },
    include: {
      service: { select: { id: true, name: true, code: true } },
      _count: { select: { entries: true } },
    },
  });

  await prisma.activityLog.create({
    data: {
      userId: approverId,
      action: "approve_timesheet",
      entityType: "Timesheet",
      entityId: timesheet.id,
      details: { weekEnding: timesheet.weekEnding },
    },
  });

  // Notify the submitting user. Observational — log failures but keep the
  // approval successful. Timesheets have no `userId`; the submitter is
  // tracked via `submittedById`, so we notify that user.
  try {
    if (timesheet.submittedById) {
      const weekEndingStr = new Date(timesheet.weekEnding).toISOString().slice(0, 10);
      await prisma.userNotification.create({
        data: {
          userId: timesheet.submittedById,
          type: NOTIFICATION_TYPES.TIMESHEET_APPROVED,
          title: "Timesheet approved",
          body: `Your timesheet for week ending ${weekEndingStr} was approved`,
          link: `/timesheets?id=${timesheet.id}`,
        },
      });
    }
  } catch (err) {
    logger.error("Failed to create timesheet-approved notification", {
      err,
      timesheetId: timesheet.id,
    });
  }

  return updated;
}
