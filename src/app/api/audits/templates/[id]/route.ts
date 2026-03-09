import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";

/**
 * GET /api/audits/templates/[id] — template detail with items
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAuth();
  if (error) return error;

  const { id } = await params;

  const template = await prisma.auditTemplate.findUnique({
    where: { id },
    include: {
      items: { orderBy: { sortOrder: "asc" } },
      _count: { select: { instances: true } },
    },
  });

  if (!template) {
    return NextResponse.json({ error: "Template not found" }, { status: 404 });
  }

  return NextResponse.json(template);
}

/**
 * PATCH /api/audits/templates/[id] — update template (admin/owner)
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireAuth(["owner", "head_office", "admin"]);
  if (error) return error;

  const { id } = await params;
  const body = await req.json();

  const allowedFields = [
    "name",
    "description",
    "qualityArea",
    "nqsReference",
    "frequency",
    "scheduledMonths",
    "responseFormat",
    "estimatedMinutes",
    "isActive",
    "sortOrder",
    "sourceFileName",
  ];

  const data: Record<string, unknown> = {};
  for (const key of allowedFields) {
    if (key in body) data[key] = body[key];
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const template = await prisma.auditTemplate.update({
    where: { id },
    data,
    include: {
      items: { orderBy: { sortOrder: "asc" } },
      _count: { select: { instances: true } },
    },
  });

  await prisma.activityLog.create({
    data: {
      userId: session!.user.id,
      action: "update",
      entityType: "AuditTemplate",
      entityId: id,
      details: { updated: Object.keys(data) },
    },
  });

  return NextResponse.json(template);
}
