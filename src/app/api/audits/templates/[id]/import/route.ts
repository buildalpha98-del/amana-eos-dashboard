import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";
import type { AuditResponseFormat } from "@prisma/client";

/**
 * POST /api/audits/templates/[id]/import — import parsed items into a template
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireAuth(["owner", "admin"]);
  if (error) return error;

  const { id } = await params;
  const body = await req.json();
  const { items, mode = "replace", sourceFileName } = body;

  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: "items array is required" }, { status: 400 });
  }

  if (mode !== "replace" && mode !== "append") {
    return NextResponse.json({ error: "mode must be 'replace' or 'append'" }, { status: 400 });
  }

  // Verify template exists
  const template = await prisma.auditTemplate.findUnique({ where: { id } });
  if (!template) {
    return NextResponse.json({ error: "Template not found" }, { status: 404 });
  }

  let startOrder = 0;

  if (mode === "replace") {
    // Delete existing items
    await prisma.auditTemplateItem.deleteMany({ where: { templateId: id } });
  } else {
    // Append: start after existing max sortOrder
    const maxItem = await prisma.auditTemplateItem.findFirst({
      where: { templateId: id },
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    });
    startOrder = (maxItem?.sortOrder ?? -1) + 1;
  }

  // Create items
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

  // Update source file name on template
  if (sourceFileName) {
    await prisma.auditTemplate.update({
      where: { id },
      data: { sourceFileName },
    });
  }

  await prisma.activityLog.create({
    data: {
      userId: session!.user.id,
      action: "import",
      entityType: "AuditTemplateItem",
      entityId: id,
      details: {
        mode,
        count: created.count,
        templateName: template.name,
        sourceFileName,
      },
    },
  });

  return NextResponse.json({
    imported: created.count,
    templateId: id,
    mode,
  });
}
