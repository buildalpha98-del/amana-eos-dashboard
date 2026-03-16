import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateCowork } from "@/app/api/_lib/auth";

/**
 * GET /api/cowork/operations/incidents
 * Returns incident summary and trends for Cowork automation
 */
export async function GET(req: NextRequest) {
  const authError = authenticateCowork(req);
  if (authError) return authError;

  const { searchParams } = new URL(req.url);
  const serviceId = searchParams.get("serviceId");
  const weeksParam = searchParams.get("weeks");
  const weeks = weeksParam ? parseInt(weeksParam) : 8;

  try {
    const where: Record<string, unknown> = { deleted: false };
    if (serviceId) where.serviceId = serviceId;

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - weeks * 7);
    where.incidentDate = { gte: cutoff };

    const incidents = await prisma.incidentRecord.findMany({
      where,
      include: { service: { select: { id: true, name: true } } },
      orderBy: { incidentDate: "desc" },
    });

    // Aggregate summaries
    const byType: Record<string, number> = {};
    const bySeverity: Record<string, number> = {};
    const byCentre: Record<string, number> = {};
    const byLocation: Record<string, number> = {};
    const byTimeOfDay: Record<string, number> = {};

    // Weekly grouping
    function getWeekKey(d: Date): string {
      const date = new Date(d);
      const dayOfWeek = date.getDay();
      const sunday = new Date(date);
      sunday.setDate(date.getDate() - dayOfWeek);
      return sunday.toISOString().split("T")[0];
    }

    const weeklyTotals: Record<string, number> = {};
    const byCentreWeek: Record<string, Record<string, number>> = {};

    for (const inc of incidents) {
      byType[inc.incidentType] = (byType[inc.incidentType] || 0) + 1;
      bySeverity[inc.severity] = (bySeverity[inc.severity] || 0) + 1;
      byCentre[inc.service.name] = (byCentre[inc.service.name] || 0) + 1;
      if (inc.location) byLocation[inc.location] = (byLocation[inc.location] || 0) + 1;
      if (inc.timeOfDay) byTimeOfDay[inc.timeOfDay] = (byTimeOfDay[inc.timeOfDay] || 0) + 1;

      const weekKey = getWeekKey(inc.incidentDate);
      weeklyTotals[weekKey] = (weeklyTotals[weekKey] || 0) + 1;

      const centreName = inc.service.name;
      if (!byCentreWeek[centreName]) byCentreWeek[centreName] = {};
      byCentreWeek[centreName][weekKey] = (byCentreWeek[centreName][weekKey] || 0) + 1;
    }

    // Flagged centres
    const sortedWeeks = Object.keys(weeklyTotals).sort();
    const lastWeek = sortedWeeks[sortedWeeks.length - 1];
    const last4Weeks = sortedWeeks.slice(-4);

    const flaggedCentres: { centre: string; reason: string; lastWeekCount: number; average: number }[] = [];
    for (const [centre, weekCounts] of Object.entries(byCentreWeek)) {
      const lastWeekCount = lastWeek ? (weekCounts[lastWeek] || 0) : 0;
      const total4 = last4Weeks.reduce((sum, w) => sum + (weekCounts[w] || 0), 0);
      const avg = last4Weeks.length > 0 ? total4 / last4Weeks.length : 0;

      if (lastWeekCount >= 3) {
        flaggedCentres.push({
          centre,
          reason: `${lastWeekCount} incidents in latest week`,
          lastWeekCount,
          average: Math.round(avg * 10) / 10,
        });
      } else if (lastWeekCount >= 2 && avg > 0 && lastWeekCount > avg * 1.5) {
        flaggedCentres.push({
          centre,
          reason: `Rising trend: ${lastWeekCount} vs ${avg.toFixed(1)} avg`,
          lastWeekCount,
          average: Math.round(avg * 10) / 10,
        });
      }
    }

    // Week-on-week
    const prevWeek = sortedWeeks[sortedWeeks.length - 2];
    const weekOnWeek = {
      currentWeek: lastWeek || null,
      currentCount: lastWeek ? weeklyTotals[lastWeek] : 0,
      previousWeek: prevWeek || null,
      previousCount: prevWeek ? weeklyTotals[prevWeek] : 0,
    };

    return NextResponse.json({
      total: incidents.length,
      period: { from: cutoff.toISOString(), weeks },
      reportable: incidents.filter((i) => i.reportableToAuthority).length,
      followUpPending: incidents.filter((i) => i.followUpRequired && !i.followUpCompleted).length,
      weekOnWeek,
      flaggedCentres,
      byType,
      bySeverity,
      byCentre,
      byLocation,
      byTimeOfDay,
    });
  } catch (err) {
    console.error("[Cowork Incidents GET]", err);
    return NextResponse.json({ error: "Failed to fetch incident data" }, { status: 500 });
  }
}
