import { NextRequest, NextResponse } from "next/server";
import { verifyCronSecret, acquireCronLock } from "@/lib/cron-guard";
import { generateBoardReport } from "@/lib/board-report-generator";
import { prisma } from "@/lib/prisma";
import { getResend, FROM_EMAIL } from "@/lib/email";
import { boardReportDraftNotificationEmail } from "@/lib/email-templates";
import { withApiHandler } from "@/lib/api-handler";
import { logger } from "@/lib/logger";

/**
 * GET /api/cron/board-report
 *
 * Monthly cron (2nd of each month, 2 AM AEST) — generates a draft board
 * report for the previous month and notifies owner/admin users.
 *
 * Auth: Bearer CRON_SECRET
 */
export const GET = withApiHandler(async (req) => {
  const authResult = verifyCronSecret(req);
  if (authResult) return authResult.error;

  const guard = await acquireCronLock("board-report", "monthly");
  if (!guard.acquired) {
    return NextResponse.json({ message: guard.reason, skipped: true });
  }

  try {
    const now = new Date();
    // Generate for previous month (cron runs on the 2nd)
    const targetMonth = now.getMonth() === 0 ? 12 : now.getMonth(); // getMonth() is 0-based
    const targetYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();

    const report = await generateBoardReport({ month: targetMonth, year: targetYear });

    // Notify admin users that draft is ready
    const admins = await prisma.user.findMany({
      where: { role: { in: ["owner", "admin"] }, active: true },
      select: { name: true, email: true },
    });

    const resend = getResend();
    const baseUrl = process.env.NEXTAUTH_URL || "https://dashboard.amanaoshc.com.au";
    let notificationsSent = 0;

    if (resend) {
      for (const admin of admins) {
        try {
          const { subject, html } = boardReportDraftNotificationEmail(
            admin.name,
            targetMonth,
            targetYear,
            `${baseUrl}/reports/board`,
          );
          await resend.emails.send({ from: FROM_EMAIL, to: admin.email, subject, html });
          notificationsSent++;
        } catch (err) {
          logger.error("Board report notification failed", { recipient: admin.email, err });
        }
      }
    }

    await guard.complete({
      month: targetMonth,
      year: targetYear,
      reportId: report.id,
      notificationsSent,
    });

    return NextResponse.json({
      success: true,
      reportId: report.id,
      month: targetMonth,
      year: targetYear,
      notificationsSent,
    });
  } catch (err) {
    await guard.fail(err);
    logger.error("Board report cron failed", { err });
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Cron failed" },
      { status: 500 },
    );
  }
});
