import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getStateScope } from "@/lib/service-scope";
import { getCentreScope, applyCentreFilter } from "@/lib/centre-scope";
import { withApiAuth } from "@/lib/server-auth";
import { logger } from "@/lib/logger";
import { z } from "zod";

import { parseJsonBody } from "@/lib/api-error";
const postSchema = z.object({
  serviceId: z.string().min(1),
  incidentDate: z.string().min(1),
  childName: z.string().optional(),
  incidentType: z.string().min(1),
  severity: z.string().min(1),
  location: z.string().optional(),
  timeOfDay: z.string().optional(),
  description: z.string().min(1),
  actionTaken: z.string().optional(),
  parentNotified: z.boolean().optional(),
  reportableToAuthority: z.boolean().optional(),
  followUpRequired: z.boolean().optional(),
});

/**
 * GET /api/incidents
 * List incidents with filters + optional summary mode
 */
export const GET = withApiAuth(async (req, session) => {
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
    logger.error("Incidents GET", { err });
    return NextResponse.json({ error: "Failed to fetch incidents" }, { status: 500 });
  }
});

/**
 * POST /api/incidents — Manual entry
 */
export const POST = withApiAuth(async (req, session) => {
try {
    const body = await parseJsonBody(req);
    const parsed = postSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }
    const {
      serviceId, incidentDate, childName, incidentType, severity,
      location, timeOfDay, description, actionTaken,
      parentNotified, reportableToAuthority, followUpRequired,
    } = parsed.data;

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
    logger.error("Incidents POST", { err });
    return NextResponse.json({ error: "Failed to create incident" }, { status: 500 });
  }
}, { roles: ["owner", "head_office", "admin", "member"] });
