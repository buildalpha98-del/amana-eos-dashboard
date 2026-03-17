import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateCowork } from "@/app/api/_lib/auth";
import { z } from "zod";

const createIncidentSchema = z.object({
  serviceCode: z.string(),
  date: z.string().datetime(),
  incidentType: z.enum(["minor_injury", "serious_injury", "illness", "behaviour", "medication_error", "near_miss", "complaint", "other"]),
  severity: z.enum(["low", "medium", "high", "critical"]),
  childName: z.string().optional(),
  description: z.string().min(10),
  actionTaken: z.string().optional(),
  location: z.string().optional(),
  timeOfDay: z.string().optional(),
  witnesses: z.string().optional(),
  parentNotified: z.boolean().default(false),
  regulatoryReport: z.boolean().default(false),
  followUpRequired: z.boolean().default(false),
  followUpNotes: z.string().optional(),
  reportedBy: z.string(),
  status: z.enum(["open", "investigating", "resolved", "closed"]).default("open"),
});

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

/**
 * POST /api/cowork/operations/incidents
 * Creates a new incident record for a service
 */
export async function POST(req: NextRequest) {
  const authError = authenticateCowork(req);
  if (authError) return authError;

  try {
    const body = await req.json();
    const parsed = createIncidentSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request body", issues: parsed.error.issues }, { status: 400 });
    }

    const {
      serviceCode,
      date,
      incidentType,
      severity,
      childName,
      description,
      actionTaken,
      location,
      timeOfDay,
      witnesses,
      parentNotified,
      regulatoryReport,
      followUpRequired,
      followUpNotes,
      reportedBy,
      status,
    } = parsed.data;

    // Resolve serviceCode to serviceId
    const service = await prisma.service.findUnique({ where: { code: serviceCode } });
    if (!service) {
      return NextResponse.json({ error: `Service not found: ${serviceCode}` }, { status: 404 });
    }

    // Map severity values to model's severity names
    const severityMap: Record<string, string> = {
      low: "minor",
      medium: "moderate",
      high: "reportable",
      critical: "serious",
    };
    const mappedSeverity = severityMap[severity];

    // Compose actionTaken — append witnesses and followUpNotes if provided
    const actionParts: string[] = [];
    if (actionTaken) actionParts.push(actionTaken);
    if (witnesses) actionParts.push(`Witnesses: ${witnesses}`);
    if (followUpNotes) actionParts.push(`Follow-up notes: ${followUpNotes}`);
    const composedActionTaken = actionParts.length > 0 ? actionParts.join("\n") : undefined;

    // Prefix description with reportedBy
    const composedDescription = `Reported by: ${reportedBy}\n${description}`;

    const incident = await prisma.incidentRecord.create({
      data: {
        serviceId: service.id,
        incidentDate: new Date(date),
        incidentType,
        severity: mappedSeverity,
        childName: childName ?? null,
        description: composedDescription,
        actionTaken: composedActionTaken ?? null,
        location: location ?? null,
        timeOfDay: timeOfDay ?? null,
        parentNotified,
        reportableToAuthority: regulatoryReport,
        followUpRequired,
        deleted: false,
      },
    });

    return NextResponse.json(
      {
        success: true,
        incident: {
          id: incident.id,
          serviceCode,
          date: incident.incidentDate.toISOString(),
          incidentType: incident.incidentType,
          severity,
          status,
        },
      },
      { status: 201 }
    );
  } catch (err) {
    console.error("[Cowork Incidents POST]", err);
    return NextResponse.json({ error: "Failed to create incident" }, { status: 500 });
  }
}
