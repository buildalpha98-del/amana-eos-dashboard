import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";

/**
 * GET /api/audits/templates — list audit templates
 */
export async function GET(req: NextRequest) {
  const { error } = await requireAuth();
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const qualityArea = searchParams.get("qualityArea");
  const frequency = searchParams.get("frequency");
  const activeOnly = searchParams.get("activeOnly") !== "false";

  const where: Record<string, unknown> = {};
  if (activeOnly) where.isActive = true;
  if (qualityArea) where.qualityArea = parseInt(qualityArea);
  if (frequency) where.frequency = frequency;

  const templates = await prisma.auditTemplate.findMany({
    where,
    include: {
      _count: { select: { items: true, instances: true } },
    },
    orderBy: { sortOrder: "asc" },
  });

  return NextResponse.json(templates);
}

/**
 * POST /api/audits/templates — create a new template (admin only)
 */
export async function POST(req: NextRequest) {
  const { session, error } = await requireAuth(["owner", "admin"]);
  if (error) return error;

  const body = await req.json();
  const {
    name,
    description,
    qualityArea,
    nqsReference,
    frequency,
    scheduledMonths,
    responseFormat,
    estimatedMinutes,
  } = body;

  if (!name || !qualityArea || !nqsReference || !frequency || !scheduledMonths) {
    return NextResponse.json(
      { error: "name, qualityArea, nqsReference, frequency, and scheduledMonths are required" },
      { status: 400 }
    );
  }

  const template = await prisma.auditTemplate.create({
    data: {
      name,
      description,
      qualityArea,
      nqsReference,
      frequency,
      scheduledMonths,
      responseFormat: responseFormat || "yes_no",
      estimatedMinutes,
    },
  });

  await prisma.activityLog.create({
    data: {
      userId: session!.user.id,
      action: "create",
      entityType: "AuditTemplate",
      entityId: template.id,
      details: { name },
    },
  });

  return NextResponse.json(template, { status: 201 });
}
