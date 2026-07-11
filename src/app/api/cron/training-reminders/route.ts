import { NextResponse } from "next/server";
import { acquireCronLock, verifyCronSecret } from "@/lib/cron-guard";
import { withApiHandler } from "@/lib/api-handler";
import { logger } from "@/lib/logger";
import { sendTrainingReminders } from "@/lib/training-compliance";

/**
 * GET /api/cron/training-reminders
 *
 * Weekly cron (Monday morning AEST) — emails each staff member their
 * outstanding required training (essential + monthly tracks), with overdue
 * courses flagged, and sends admins a compliance summary.
 *
 * Closes the gap where monthly-track refreshers had no gate and no nudge.
 * Suppressed addresses are skipped automatically by `sendEmail`.
 *
 * Auth: Bearer CRON_SECRET.
 */
export const GET = withApiHandler(async (req) => {
  const auth = verifyCronSecret(req);
  if (auth) return auth.error;

  const guard = await acquireCronLock("training-reminders", "weekly");
  if (!guard.acquired) {
    return NextResponse.json({ message: guard.reason, skipped: true });
  }

  try {
    const result = await sendTrainingReminders();
    await guard.complete({
      staffReminded: result.staffReminded,
      overdueCourses: result.overdueCourses,
      emailsSent: result.emailsSent,
      emailsSuppressed: result.emailsSuppressed,
    });
    return NextResponse.json({
      message:
        result.staffReminded === 0
          ? "All staff up to date on required training"
          : "Training reminders sent",
      ...result,
    });
  } catch (err) {
    await guard.fail(err);
    logger.error("Cron: training-reminders", { err });
    return NextResponse.json(
      {
        error: "Training reminders cron failed",
        message: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }
});
