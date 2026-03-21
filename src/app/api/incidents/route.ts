import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";
import { getStateScope } from "@/lib/service-scope";
import { getCentreScope, applyCentreFilter } from "@/lib/centre-scope";

/**
 * GET /api/incidents
 * List incidents with filters + optional summary mode
 */
export async function GET(req: NextRequest) {
  const { session, error } = await requireAuth();
  if (error) return error;

  const { serviceIds } = await getCentreScope(session);
  const stateScope = getStateScope(session);
  const { searchParams } = new URL(req.url);
  const serviceId = searchParams.get("serviceId");
  const type = searchParams.get("type");
  const severity = searchParams.get("severity");
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const summary = searchParams.get("summary") === "true";

  try {
    const where: Record<string, unknown> = { deleted: false };
    // Centre scoping: apply centre filter for scoped roles
    if (serviceIds !== null) {
      applyCentreFilter(where, serviceIds);
    } else if (serviceId) {
      where.serviceId = serviceId;
    }
    if (stateScope) where.service = { state: stateScope };
    if (type) where.incidentType = type;
    if (severity) where.severity = severity;
    if (from || to) {
      where.incidentDate = {};
      if (from) (where.incidentDate as Record<string, Date>).gte = new Date(from);
      if (to) (where.incidentDate as Record<string, Date>).lte = new Date(to);
    }

    if (summary) {
      const records = await prisma.incidentRecord.findMany({
        where,
        include: { service: { select: { id: true, name: true } } },
      });

      const byType: Record<string, number> = {};
      const bySeverity: Record<string, number> = {};
      const byCentre: Record<string, number> = {};
      const byLocation: Record<string, number> = {};

      for (const r of records) {
        byType[r.incidentType] = (byType[r.incidentType] || 0) + 1;
        bySeverity[r.severity] = (bySeverity[r.severity] || 0) + 1;
        byCentre[r.service.name] = (byCentre[r.service.name] || 0) + 1;
        if (r.location) byLocation[r.location] = (byLocation[r.location] || 0) + 1;
      }

      return NextResponse.json({
        total: records.length,
        reportable: records.filter((r) => r.reportableToAuthority).length,
        followUpPending: records.filter((r) => r.followUpRequired && !r.followUpCompleted).length,
        byType,
        bySeverity,
        byCentre,
        byLocation,
      });
    }

    const records = await prisma.incidentRecord.findMany({
      where,
      include: {
        service: { select: { id: true, name: true, code: true } },
        createdBy: { select: { id: true, name: true } },
      },
      orderBy: { incidentDate: "desc" },
    });

    return NextResponse.json({ incidents: records, count: records.length });
  } catch (err) {
    console.error("[Incidents GET]", err);
    return NextResponse.json({ error: "Failed to fetch incidents" }, { status: 500 });
  }
}

/**
 * POST /api/incidents — Manual entry
 */
export async function POST(req: NextRequest) {
  const { session, error } = await requireAuth(["owner", "head_office", "admin", "member"]);
  if (error) return error;

  try {
    const body = await req.json();
    const {
      serviceId, incidentDate, childName, incidentType, severity,
      location, timeOfDay, description, actionTaken,
      parentNotified, reportableToAuthority, followUpRequired,
    } = body;

    if (!serviceId || !incidentDate || !incidentType || !severity || !description) {
      return NextResponse.json(
        { error: "serviceId, incidentDate, incidentType, severity, and description are required" },
        { status: 400 },
      );
    }

    const record = await prisma.incidentRecord.create({
      data: {
        serviceId,
        incidentDate: new Date(incidentDate),
        childName,
        incidentType,
        severity,
        location,
        timeOfDay,
        description,
        actionTaken,
        parentNotified: parentNotified || false,
        reportableToAuthority: reportableToAuthority || false,
        followUpRequired: followUpRequired || false,
        createdById: session!.user.id,
      },
      include: {
        service: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json(record, { status: 201 });
  } catch (err) {
    console.error("[Incidents POST]", err);
    return NextResponse.json({ error: "Failed to create incident" }, { status: 500 });
  }
}
