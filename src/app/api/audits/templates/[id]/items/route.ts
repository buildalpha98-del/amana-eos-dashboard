import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";
import type { AuditResponseFormat } from "@prisma/client";

/**
 * GET /api/audits/templates/[id]/items — list items for a template
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAuth();
  if (error) return error;

  const { id } = await params;

  const items = await prisma.auditTemplateItem.findMany({
    where: { templateId: id },
    orderBy: { sortOrder: "asc" },
  });

  return NextResponse.json(items);
}

/**
 * POST /api/audits/templates/[id]/items — bulk add items (admin/owner)
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireAuth(["owner", "admin"]);
  if (error) return error;

  const { id } = await params;
  const { items } = await req.json();

  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: "items array is required" }, { status: 400 });
  }

  // Verify template exists
  const template = await prisma.auditTemplate.findUnique({ where: { id } });
  if (!template) {
    return NextResponse.json({ error: "Template not found" }, { status: 404 });
  }

  // Get current max sortOrder
  const maxItem = await prisma.auditTemplateItem.findFirst({
    where: { templateId: id },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });
  const startOrder = (maxItem?.sortOrder ?? -1) + 1;

  const created = await prisma.auditTemplateItem.createMany({
    data: items.map(
      (item: { section?: string; question: string; guidance?: string; responseFormat?: string; isRequired?: boolean }, idx: number) => ({
        templateId: id,
        section: item.section || null,
        question: item.question,
        guidance: item.guidance || null,
        responseFormat: (item.responseFormat as AuditResponseFormat) || null,
        isRequired: item.isRequired ?? true,
        sortOrder: startOrder + idx,
      })
    ),
  });

  await prisma.activityLog.create({
    data: {
      userId: session!.user.id,
      action: "create",
      entityType: "AuditTemplateItem",
      entityId: id,
      details: { count: created.count, templateName: template.name },
    },
  });

  return NextResponse.json({ created: created.count, templateId: id }, { status: 201 });
}
