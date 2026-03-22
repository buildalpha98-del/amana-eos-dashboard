import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServiceScope, getStateScope } from "@/lib/service-scope";
import { withApiAuth } from "@/lib/server-auth";
import { logger } from "@/lib/logger";

/**
 * GET /api/incidents/trends
 * Returns trend analysis:
 * - Week-on-week comparison
 * - 4-week rolling average per centre
 * - Flagged centres (3+ incidents or rising trend)
 */
export const GET = withApiAuth(async (req, session) => {
const scope = getServiceScope(session);
  const stateScope = getStateScope(session);
  const { searchParams } = new URL(req.url);
  const weeks = parseInt(searchParams.get("weeks") || "8");

  try {
    const where: Record<string, unknown> = { deleted: false };
    if (scope) where.serviceId = scope;
    if (stateScope) where.service = { state: stateScope };

    // Get incidents from past N weeks
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - weeks * 7);
    where.incidentDate = { gte: cutoff };

    const incidents = await prisma.incidentRecord.findMany({
      where,
      include: { service: { select: { id: true, name: true } } },
      orderBy: { incidentDate: "asc" },
    });

    // Group by ISO week
    function getWeekKey(d: Date): string {
      const date = new Date(d);
      const dayOfWeek = date.getDay();
      const sunday = new Date(date);
      sunday.setDate(date.getDate() - dayOfWeek);
      return sunday.toISOString().split("T")[0];
    }

    // Build weekly counts per centre
    const byCentreWeek: Record<string, Record<string, number>> = {};
    const weeklyTotals: Record<string, number> = {};
    const byType: Record<string, number> = {};
    const bySeverity: Record<string, number> = {};
    const byLocation: Record<string, number> = {};
    const byTimeOfDay: Record<string, number> = {};

    for (const inc of incidents) {
      const weekKey = getWeekKey(inc.incidentDate);
      const centreName = inc.service.name;

      if (!byCentreWeek[centreName]) byCentreWeek[centreName] = {};
      byCentreWeek[centreName][weekKey] = (byCentreWeek[centreName][weekKey] || 0) + 1;
      weeklyTotals[weekKey] = (weeklyTotals[weekKey] || 0) + 1;

      byType[inc.incidentType] = (byType[inc.incidentType] || 0) + 1;
      bySeverity[inc.severity] = (bySeverity[inc.severity] || 0) + 1;
      if (inc.location) byLocation[inc.location] = (byLocation[inc.location] || 0) + 1;
      if (inc.timeOfDay) byTimeOfDay[inc.timeOfDay] = (byTimeOfDay[inc.timeOfDay] || 0) + 1;
    }

    // Sort weeks chronologically
    const sortedWeeks = Object.keys(weeklyTotals).sort();

    // Week-on-week comparison (last 2 weeks)
    const lastWeek = sortedWeeks[sortedWeeks.length - 1];
    const prevWeek = sortedWeeks[sortedWeeks.length - 2];
    const weekOnWeek = {
      currentWeek: lastWeek || null,
      currentCount: lastWeek ? weeklyTotals[lastWeek] : 0,
      previousWeek: prevWeek || null,
      previousCount: prevWeek ? weeklyTotals[prevWeek] : 0,
      change: lastWeek && prevWeek
        ? weeklyTotals[lastWeek] - weeklyTotals[prevWeek]
        : 0,
      trend: lastWeek && prevWeek
        ? weeklyTotals[lastWeek] > weeklyTotals[prevWeek]
          ? "rising"
          : weeklyTotals[lastWeek] < weeklyTotals[prevWeek]
          ? "falling"
          : "stable"
        : "insufficient_data",
    };

    // 4-week rolling average per centre
    const last4Weeks = sortedWeeks.slice(-4);
    const rollingAverages: Record<string, { total: number; weeks: number; average: number }> = {};
    for (const [centre, weekCounts] of Object.entries(byCentreWeek)) {
      const total = last4Weeks.reduce((sum, w) => sum + (weekCounts[w] || 0), 0);
      const weeksWithData = last4Weeks.filter((w) => weekCounts[w]).length;
      rollingAverages[centre] = {
        total,
        weeks: weeksWithData,
        average: last4Weeks.length > 0 ? total / last4Weeks.length : 0,
      };
    }

    // Flagged centres: 3+ incidents in last week OR rising trend
    const flaggedCentres: { centre: string; reason: string; count: number; average: number }[] = [];
    for (const [centre, weekCounts] of Object.entries(byCentreWeek)) {
      const lastWeekCount = lastWeek ? (weekCounts[lastWeek] || 0) : 0;
      const avg = rollingAverages[centre]?.average || 0;

      if (lastWeekCount >= 3) {
        flaggedCentres.push({
          centre,
          reason: `${lastWeekCount} incidents in current week (threshold: 3)`,
          count: lastWeekCount,
          average: Math.round(avg * 10) / 10,
        });
      } else if (lastWeekCount > avg * 1.5 && avg > 0 && lastWeekCount >= 2) {
        flaggedCentres.push({
          centre,
          reason: `Rising trend: ${lastWeekCount} this week vs ${Math.round(avg * 10) / 10} avg`,
          count: lastWeekCount,
          average: Math.round(avg * 10) / 10,
        });
      }
    }

    // Weekly trend data for charting
    const weeklyTrend = sortedWeeks.map((week) => ({
      week,
      total: weeklyTotals[week],
    }));

    return NextResponse.json({
      totalIncidents: incidents.length,
      period: { from: cutoff.toISOString(), weeks },
      weekOnWeek,
      weeklyTrend,
      rollingAverages,
      flaggedCentres,
      byType,
      bySeverity,
      byLocation,
      byTimeOfDay,
    });
  } catch (err) {
    logger.error("Incidents Trends GET", { err });
    return NextResponse.json({ error: "Failed to compute incident trends" }, { status: 500 });
  }
});
