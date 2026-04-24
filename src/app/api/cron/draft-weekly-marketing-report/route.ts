import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { acquireCronLock } from "@/lib/cron-guard";
import { withApiHandler } from "@/lib/api-handler";
import { logger } from "@/lib/logger";
import { computeCockpitSummary } from "@/lib/cockpit/summary";
import { renderWeeklyReportMarkdown } from "@/lib/cockpit/render-report";
import { getWeekWindow } from "@/lib/cockpit/week";
import { getCurrentTerm } from "@/lib/school-terms";

/**
 * GET /api/cron/draft-weekly-marketing-report
 *
 * Weekly cron (Sunday 7pm AEST = 9am UTC) — freezes a snapshot of the
 * cockpit summary for the *current* week (just about to end) and upserts
 * a draft WeeklyMarketingReport for Akram to review Monday morning.
 *
 * Auth: Bearer CRON_SECRET
 */
export const GET = withApiHandler(async (req) => {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const guard = await acquireCronLock("draft-weekly-marketing-report", "weekly");
  if (!guard.acquired) {
    return NextResponse.json({ message: guard.reason, skipped: true });
  }

  try {
    const now = new Date();
    // Sunday 7pm AEST — we're at the end of the current week window.
    // Snapshot the week we're in now so Akram's Monday review is "last week".
    const week = getWeekWindow(now);
    const term = getCurrentTerm(now);

    const snapshot = await computeCockpitSummary({ week, term, now });
    const draftBody = renderWeeklyReportMarkdown(snapshot);

    const marketingUser = await prisma.user.findFirst({
      where: { role: "marketing", active: true },
      select: { id: true },
    });

    const existing = await prisma.weeklyMarketingReport.findUnique({
      where: { weekStart: week.start },
    });

    if (existing && existing.status === "sent") {
      await guard.complete({ skipped: true, reason: "already sent" });
      return NextResponse.json({
        message: "Report already sent for this week, not overwriting",
        skipped: true,
      });
    }

    const report = existing
      ? await prisma.weeklyMarketingReport.update({
          where: { id: existing.id },
          data: {
            kpiSnapshot: JSON.parse(JSON.stringify(snapshot)),
            draftBody,
            draftedAt: new Date(),
            draftedById: marketingUser?.id ?? existing.draftedById,
            status: existing.status === "reviewed" ? "reviewed" : "draft",
          },
        })
      : await prisma.weeklyMarketingReport.create({
          data: {
            weekStart: week.start,
            weekEnd: week.end,
            status: "draft",
            kpiSnapshot: JSON.parse(JSON.stringify(snapshot)),
            draftBody,
            draftedAt: new Date(),
            draftedById: marketingUser?.id,
          },
        });

    await guard.complete({
      reportId: report.id,
      weekStart: week.start.toISOString().split("T")[0],
      status: report.status,
    });

    return NextResponse.json({
      message: "Weekly marketing report drafted",
      reportId: report.id,
      weekStart: week.start.toISOString().split("T")[0],
      weekEnd: week.end.toISOString().split("T")[0],
      term: `${term.year}-T${term.term}`,
      status: report.status,
    });
  } catch (err) {
    logger.error("draft-weekly-marketing-report failed", { err });
    await guard.fail(err);
    throw err;
  }
});
