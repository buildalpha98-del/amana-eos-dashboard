import { NextRequest, NextResponse } from "next/server";
import { acquireCronLock } from "@/lib/cron-guard";
import { prisma } from "@/lib/prisma";

/**
 * Weekly cron — analyses financial + attendance trends across all services.
 * Schedule: Every Monday at 6:30 AM UTC
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const guard = await acquireCronLock("trend-detection", "weekly");
  if (!guard.acquired) {
    return NextResponse.json({ message: guard.reason, skipped: true });
  }

  try {
    const services = await prisma.service.findMany({
      where: { status: "active" },
      select: { id: true, name: true, code: true },
    });

    const fourWeeksAgo = new Date(Date.now() - 28 * 86400000);
    const eightWeeksAgo = new Date(Date.now() - 56 * 86400000);
    let totalInsights = 0;

    for (const service of services) {
      const insights: Array<{
        category: string;
        metric: string;
        direction: string;
        severity: string;
        summary: string;
        changePercent: number | null;
        dataPoints: number[];
      }> = [];

      // --- Attendance Trends ---
      const attendance = await prisma.dailyAttendance.findMany({
        where: {
          serviceId: service.id,
          date: { gte: eightWeeksAgo },
        },
        select: { date: true, sessionType: true, attended: true, enrolled: true },
        orderBy: { date: "asc" },
      });

      // Group attendance by week and session type
      for (const sessionType of ["bsc", "asc", "vc"]) {
        const sessionData = attendance.filter((a) => a.sessionType === sessionType);
        if (sessionData.length < 10) continue; // need enough data

        const weeklyAvgs = groupByWeek(sessionData.map((a) => ({
          date: a.date,
          value: a.attended,
        })));

        if (weeklyAvgs.length < 4) continue;

        const recentAvg = avg(weeklyAvgs.slice(-2));
        const olderAvg = avg(weeklyAvgs.slice(-4, -2));

        if (olderAvg === 0) continue;
        const change = ((recentAvg - olderAvg) / olderAvg) * 100;

        if (Math.abs(change) >= 10) {
          const direction = change > 0 ? "increasing" : "decreasing";
          const severity = Math.abs(change) >= 25 ? "warning" : "info";
          insights.push({
            category: "attendance",
            metric: `${sessionType}_attendance`,
            direction,
            severity,
            summary: `${sessionType.toUpperCase()} attendance at ${service.name} has ${direction === "increasing" ? "increased" : "decreased"} by ${Math.abs(change).toFixed(1)}% over the past 4 weeks (avg ${olderAvg.toFixed(0)} → ${recentAvg.toFixed(0)}).`,
            changePercent: Math.round(change * 10) / 10,
            dataPoints: weeklyAvgs,
          });
        }

        // Utilisation trend (attended/enrolled)
        const weeklyUtil = groupByWeek(sessionData.map((a) => ({
          date: a.date,
          value: a.enrolled > 0 ? (a.attended / a.enrolled) * 100 : 0,
        })));

        if (weeklyUtil.length >= 4) {
          const recentUtil = avg(weeklyUtil.slice(-2));
          const olderUtil = avg(weeklyUtil.slice(-4, -2));
          const utilChange = recentUtil - olderUtil;

          if (Math.abs(utilChange) >= 8) {
            insights.push({
              category: "enrolment",
              metric: `${sessionType}_utilisation`,
              direction: utilChange > 0 ? "increasing" : "decreasing",
              severity: recentUtil < 60 ? "warning" : "info",
              summary: `${sessionType.toUpperCase()} utilisation at ${service.name} moved from ${olderUtil.toFixed(0)}% to ${recentUtil.toFixed(0)}% (${utilChange > 0 ? "+" : ""}${utilChange.toFixed(1)}pp).`,
              changePercent: Math.round(utilChange * 10) / 10,
              dataPoints: weeklyUtil,
            });
          }
        }
      }

      // --- Financial Trends ---
      const financials = await prisma.financialPeriod.findMany({
        where: {
          serviceId: service.id,
          periodType: "weekly",
          periodStart: { gte: eightWeeksAgo },
        },
        select: {
          periodStart: true,
          totalRevenue: true,
          staffCosts: true,
          grossProfit: true,
          margin: true,
        },
        orderBy: { periodStart: "asc" },
      });

      if (financials.length >= 4) {
        // Revenue trend
        const revenues = financials.map((f) => Number(f.totalRevenue) || 0);
        const recentRev = avg(revenues.slice(-2));
        const olderRev = avg(revenues.slice(-4, -2));

        if (olderRev > 0) {
          const revChange = ((recentRev - olderRev) / olderRev) * 100;
          if (Math.abs(revChange) >= 10) {
            insights.push({
              category: "financial",
              metric: "totalRevenue",
              direction: revChange > 0 ? "increasing" : "decreasing",
              severity: revChange < -15 ? "warning" : "info",
              summary: `Revenue at ${service.name} has ${revChange > 0 ? "grown" : "declined"} by ${Math.abs(revChange).toFixed(1)}% over 4 weeks ($${olderRev.toFixed(0)} → $${recentRev.toFixed(0)} weekly avg).`,
              changePercent: Math.round(revChange * 10) / 10,
              dataPoints: revenues,
            });
          }
        }

        // Margin trend
        const margins = financials.map((f) => Number(f.margin) || 0);
        const recentMargin = avg(margins.slice(-2));
        const olderMargin = avg(margins.slice(-4, -2));
        const marginChange = recentMargin - olderMargin;

        if (Math.abs(marginChange) >= 5) {
          insights.push({
            category: "financial",
            metric: "margin",
            direction: marginChange > 0 ? "increasing" : "decreasing",
            severity: recentMargin < 10 ? "critical" : marginChange < -10 ? "warning" : "info",
            summary: `Margin at ${service.name} moved from ${olderMargin.toFixed(1)}% to ${recentMargin.toFixed(1)}% (${marginChange > 0 ? "+" : ""}${marginChange.toFixed(1)}pp).`,
            changePercent: Math.round(marginChange * 10) / 10,
            dataPoints: margins,
          });
        }
      }

      // Save insights
      for (const insight of insights) {
        await prisma.trendInsight.create({
          data: {
            serviceId: service.id,
            category: insight.category,
            metric: insight.metric,
            direction: insight.direction,
            severity: insight.severity,
            summary: insight.summary,
            changePercent: insight.changePercent,
            dataPoints: insight.dataPoints,
            periodWeeks: 4,
          },
        });
        totalInsights++;
      }
    }

    // Create a queue report if insights found
    if (totalInsights > 0) {
      const allNew = await prisma.trendInsight.findMany({
        where: { createdAt: { gte: new Date(Date.now() - 60000) } },
        include: { service: { select: { name: true } } },
        orderBy: { severity: "asc" },
      });

      const reportLines = allNew.map(
        (t) => `- **[${t.severity.toUpperCase()}]** ${t.summary}`
      );

      await prisma.coworkReport.create({
        data: {
          seat: "operations",
          reportType: "trend_analysis",
          title: `Weekly Trend Analysis — ${totalInsights} insight${totalInsights === 1 ? "" : "s"} detected`,
          content: `# Weekly Trend Analysis\n\n${reportLines.join("\n")}\n\n*Auto-generated ${new Date().toLocaleDateString("en-AU")}*`,
          status: "pending",
          assignedTo: undefined,
        },
      });
    }

    await guard.complete({ totalInsights, servicesAnalysed: services.length });
    return NextResponse.json({ totalInsights, servicesAnalysed: services.length });
  } catch (err) {
    await guard.fail(err instanceof Error ? err.message : "Unknown error");
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}

// --- Helpers ---

function groupByWeek(data: Array<{ date: Date; value: number }>): number[] {
  const weekMap: Record<string, number[]> = {};
  for (const d of data) {
    const weekStart = getWeekStart(d.date);
    const key = weekStart.toISOString().slice(0, 10);
    if (!weekMap[key]) weekMap[key] = [];
    weekMap[key].push(d.value);
  }
  return Object.keys(weekMap)
    .sort()
    .map((key) => avg(weekMap[key]));
}

function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function avg(nums: number[]): number {
  if (nums.length === 0) return 0;
  return nums.reduce((sum, n) => sum + n, 0) / nums.length;
}
