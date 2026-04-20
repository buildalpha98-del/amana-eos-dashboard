import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { AuditResponseFormat } from "@prisma/client";
import { withApiAuth } from "@/lib/server-auth";
import { z } from "zod";

import { parseJsonBody } from "@/lib/api-error";
const postSchema = z.object({
  items: z.array(z.object({
    section: z.string().optional(),
    question: z.string().min(1),
    guidance: z.string().optional(),
    responseFormat: z.enum(["yes_no", "rating_1_5", "compliant", "reverse_yes_no", "review_date", "inventory"]).optional(),
    isRequired: z.boolean().optional(),
  })).min(1, "items array is required"),
});

/**
 * GET /api/audits/templates/[id]/items — list items for a template
 */
export const GET = withApiAuth(async (req, session, context) => {
  const { id } = await context!.params!;

  const items = await prisma.auditTemplateItem.findMany({
    where: { templateId: id },
    orderBy: { sortOrder: "asc" },
  });

  return NextResponse.json(items);
});

/**
 * POST /api/audits/templates/[id]/items — bulk add items (admin/owner)
 */
export const POST = withApiAuth(async (req, session, context) => {
const { id } = await context!.params!;
  const body = await parseJsonBody(req);
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }
  const { items } = parsed.data;

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
}, { roles: ["owner", "head_office", "admin"] });
