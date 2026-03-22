import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { AuditResponseFormat } from "@prisma/client";
import { withApiAuth } from "@/lib/server-auth";
import { z } from "zod";

const postSchema = z.object({
  items: z.array(z.object({
    section: z.string().optional(),
    question: z.string().min(1),
    guidance: z.string().optional(),
    responseFormat: z.enum(["yes_no", "rating_1_5", "compliant", "reverse_yes_no", "review_date", "inventory"]).optional(),
    isRequired: z.boolean().optional(),
  })).min(1, "items array is required"),
  mode: z.enum(["replace", "append"]).default("replace"),
  sourceFileName: z.string().optional(),
});

/**
 * POST /api/audits/templates/[id]/import — import parsed items into a template
 */
export const POST = withApiAuth(async (req, session, context) => {
const { id } = await context!.params!;
  const body = await req.json();
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }
  const { items, mode, sourceFileName } = parsed.data;

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
}, { roles: ["owner", "head_office", "admin"] });
