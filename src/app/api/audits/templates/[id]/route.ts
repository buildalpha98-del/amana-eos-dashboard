import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { z } from "zod";

import { parseJsonBody } from "@/lib/api-error";
const patchSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  qualityArea: z.number().optional(),
  nqsReference: z.string().optional(),
  frequency: z.enum(["monthly", "half_yearly", "yearly"]).optional(),
  scheduledMonths: z.array(z.number()).optional(),
  responseFormat: z.enum(["yes_no", "rating_1_5", "compliant", "reverse_yes_no", "review_date", "inventory"]).optional(),
  estimatedMinutes: z.number().optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().optional(),
  sourceFileName: z.string().optional(),
});
/**
 * GET /api/audits/templates/[id] — template detail with items
 */
export const GET = withApiAuth(async (req, session, context) => {
  const { id } = await context!.params!;

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
});

/**
 * PATCH /api/audits/templates/[id] — update template (admin/owner)
 */
export const PATCH = withApiAuth(async (req, session, context) => {
const { id } = await context!.params!;
  const body = await parseJsonBody(req);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const data: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(parsed.data)) {
    if (value !== undefined) data[key] = value;
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
}, { roles: ["owner", "head_office", "admin"] });
