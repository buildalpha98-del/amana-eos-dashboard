import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";

/**
 * GET /api/cron/health
 *
 * Returns health status of all cron jobs.
 * Shows last run time, status, and whether each cron is overdue.
 *
 * Only accessible to owner/admin roles.
 */
export const GET = withApiAuth(
  async (req: NextRequest) => {
    // Get the most recent CronRun per cronName
    const latestRuns = await prisma.cronRun.findMany({
      orderBy: { startedAt: "desc" },
      distinct: ["cronName"],
      select: {
        cronName: true,
        period: true,
        status: true,
        startedAt: true,
        completedAt: true,
        details: true,
      },
    });

    // Define expected schedules (cron name → max hours between runs)
    const EXPECTED_INTERVALS: Record<string, number> = {
      "daily-digest": 25,
      "weekly-digest": 169, // 7 days + 1 hour buffer
      "weekly-report": 169,
      "compliance-alerts": 25,
      "cert-expiry-alert": 25,
      "attendance-alerts": 25,
      "auto-measurables": 169,
      "auto-carry-forward": 169,
      "staffing-alerts": 25,
      "retention-checkins": 169,
      "nurture-send": 25,
      "owna-sync": 25,
      "policy-compliance": 169,
      "incident-digest": 169,
      "marketing-digest": 169,
      "attendance-to-financials": 169,
      "board-report": 730, // monthly
      "financials-monthly-rollup": 730,
    };

    const now = Date.now();

    const cronHealth = latestRuns.map((run) => {
      const expectedIntervalHours = EXPECTED_INTERVALS[run.cronName];
      const hoursSinceRun = (now - run.startedAt.getTime()) / (1000 * 60 * 60);
      const isOverdue =
        expectedIntervalHours != null && hoursSinceRun > expectedIntervalHours;
      const isStale =
        run.status === "running" &&
        now - run.startedAt.getTime() > 10 * 60 * 1000; // 10 min

      return {
        cronName: run.cronName,
        lastPeriod: run.period,
        status: isStale ? "stale" : run.status,
        lastRunAt: run.startedAt.toISOString(),
        completedAt: run.completedAt?.toISOString() ?? null,
        hoursSinceRun: Math.round(hoursSinceRun * 10) / 10,
        isOverdue,
        details: run.details,
      };
    });

    // Sort: overdue first, then stale, then by name
    cronHealth.sort((a, b) => {
      if (a.isOverdue && !b.isOverdue) return -1;
      if (!a.isOverdue && b.isOverdue) return 1;
      if (a.status === "stale" && b.status !== "stale") return -1;
      if (a.status !== "stale" && b.status === "stale") return 1;
      if (a.status === "failed" && b.status !== "failed") return -1;
      if (a.status !== "failed" && b.status === "failed") return 1;
      return a.cronName.localeCompare(b.cronName);
    });

    const overdueCount = cronHealth.filter((c) => c.isOverdue).length;
    const failedCount = cronHealth.filter((c) => c.status === "failed").length;
    const staleCount = cronHealth.filter((c) => c.status === "stale").length;

    return NextResponse.json({
      healthy: overdueCount === 0 && failedCount === 0 && staleCount === 0,
      summary: {
        total: cronHealth.length,
        overdue: overdueCount,
        failed: failedCount,
        stale: staleCount,
      },
      crons: cronHealth,
    });
  },
  { roles: ["owner", "admin"] },
);
