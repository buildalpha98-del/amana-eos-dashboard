import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyCronSecret, acquireCronLock } from "@/lib/cron-guard";

function getWeekOf(date: Date): Date {
  const d = new Date(date);
  d.setDate(d.getDate() - d.getDay());
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Weekly Monday 7am cron
 * Reads IncidentRecords from prior week
 * Groups by centre, type, severity, location, time of day
 * Compares to 4-week rolling average
 * Creates alert Todos for flagged centres
 */
export async function GET(req: NextRequest) {
  const auth = verifyCronSecret(req);
  if (auth) return auth.error;

  const lock = await acquireCronLock("incident-trends", "weekly");
  if (!lock.acquired) {
    return NextResponse.json({ skipped: true, reason: lock.reason });
  }

  try {
    const now = new Date();

    // Prior week range: last Monday to last Sunday
    const lastSunday = new Date(now);
    lastSunday.setDate(now.getDate() - now.getDay());
    lastSunday.setHours(23, 59, 59, 999);

    const lastMonday = new Date(lastSunday);
    lastMonday.setDate(lastSunday.getDate() - 6);
    lastMonday.setHours(0, 0, 0, 0);

    // 4-week lookback for rolling average (4 weeks before lastMonday)
    const fourWeeksAgo = new Date(lastMonday);
    fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28);

    // Get last week's incidents
    const lastWeekIncidents = await prisma.incidentRecord.findMany({
      where: {
        deleted: false,
        incidentDate: { gte: lastMonday, lte: lastSunday },
      },
      include: { service: { select: { id: true, name: true } } },
    });

    // Get 4-week rolling incidents (preceding 4 weeks, not including last week)
    const rollingIncidents = await prisma.incidentRecord.findMany({
      where: {
        deleted: false,
        incidentDate: { gte: fourWeeksAgo, lt: lastMonday },
      },
      include: { service: { select: { id: true, name: true } } },
    });

    // Group last week by centre
    const byCentre: Record<string, { count: number; types: Record<string, number>; severities: Record<string, number> }> = {};
    for (const inc of lastWeekIncidents) {
      const name = inc.service.name;
      if (!byCentre[name]) byCentre[name] = { count: 0, types: {}, severities: {} };
      byCentre[name].count++;
      byCentre[name].types[inc.incidentType] = (byCentre[name].types[inc.incidentType] || 0) + 1;
      byCentre[name].severities[inc.severity] = (byCentre[name].severities[inc.severity] || 0) + 1;
    }

    // Rolling average by centre (per week)
    const rollingByCentre: Record<string, number> = {};
    for (const inc of rollingIncidents) {
      const name = inc.service.name;
      rollingByCentre[name] = (rollingByCentre[name] || 0) + 1;
    }
    // Divide by 4 to get weekly average
    for (const name of Object.keys(rollingByCentre)) {
      rollingByCentre[name] = rollingByCentre[name] / 4;
    }

    // Find head_office user (Daniel) for Todo assignment
    const headOfficeUser = await prisma.user.findFirst({
      where: { role: "head_office", active: true },
      select: { id: true },
    });

    // Find owner (Jayden) for escalations
    const ownerUser = await prisma.user.findFirst({
      where: { role: "owner", active: true },
      select: { id: true },
    });

    const assigneeId = headOfficeUser?.id || ownerUser?.id;
    const alerts: string[] = [];
    let todosCreated = 0;

    if (assigneeId) {
      const weekOf = getWeekOf(now);
      const dueDate = new Date(now);
      dueDate.setDate(dueDate.getDate() + 3); // Due Wed

      for (const [centre, data] of Object.entries(byCentre)) {
        const avg = rollingByCentre[centre] || 0;
        const reasons: string[] = [];

        // Flag: 3+ incidents
        if (data.count >= 3) {
          reasons.push(`${data.count} incidents (threshold: 3)`);
        }

        // Flag: rising trend (50%+ above rolling avg, min 2 incidents)
        if (data.count >= 2 && avg > 0 && data.count > avg * 1.5) {
          reasons.push(`rising trend (${data.count} vs ${avg.toFixed(1)} avg)`);
        }

        // Flag: any reportable or serious severity
        const serious = (data.severities.reportable || 0) + (data.severities.serious || 0);
        if (serious > 0) {
          reasons.push(`${serious} reportable/serious incident(s)`);
        }

        if (reasons.length > 0) {
          const topType = Object.entries(data.types).sort((a, b) => b[1] - a[1])[0];
          const title = `⚠️ Incident Alert: ${centre} — ${data.count} incidents last week`;
          const description = [
            `Flags: ${reasons.join("; ")}`,
            topType ? `Most common type: ${topType[0]} (${topType[1]})` : "",
            `4-week avg: ${avg.toFixed(1)} per week`,
          ].filter(Boolean).join("\n");

          // Check for duplicate
          const existing = await prisma.todo.findFirst({
            where: {
              title: { contains: `Incident Alert: ${centre}` },
              weekOf,
              completedAt: null,
            },
          });

          if (!existing) {
            await prisma.todo.create({
              data: {
                title,
                description,
                assigneeId,
                dueDate,
                weekOf,
              },
            });
            todosCreated++;
          }

          alerts.push(`${centre}: ${reasons.join("; ")}`);
        }
      }
    }

    // Network-level summary
    const totalLastWeek = lastWeekIncidents.length;
    const totalRollingAvg = rollingIncidents.length / 4;

    return NextResponse.json({
      success: true,
      period: {
        from: lastMonday.toISOString(),
        to: lastSunday.toISOString(),
      },
      totalLastWeek,
      totalRollingAvg: Math.round(totalRollingAvg * 10) / 10,
      centreBreakdown: byCentre,
      alerts,
      todosCreated,
    });
  } catch (err) {
    console.error("[Incident Trends Cron]", err);
    return NextResponse.json({ error: "Failed to run incident trends analysis" }, { status: 500 });
  }
}
