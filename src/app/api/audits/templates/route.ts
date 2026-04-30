import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { z } from "zod";

import { parseJsonBody } from "@/lib/api-error";
const postSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  qualityArea: z.number(),
  nqsReference: z.string().min(1),
  frequency: z.enum(["monthly", "half_yearly", "yearly"]),
  scheduledMonths: z.array(z.number()),
  responseFormat: z.enum(["yes_no", "rating_1_5", "compliant", "reverse_yes_no", "review_date", "inventory"]).optional(),
  estimatedMinutes: z.number().optional(),
});
/**
 * GET /api/audits/templates — list audit templates
 */
export const GET = withApiAuth(async (req, session) => {
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
});

/**
 * POST /api/audits/templates — create a new template (admin only)
 */
export const POST = withApiAuth(async (req, session) => {
const body = await parseJsonBody(req);
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }
  const {
    name,
    description,
    qualityArea,
    nqsReference,
    frequency,
    scheduledMonths,
    responseFormat,
    estimatedMinutes,
  } = parsed.data;

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
}, { roles: ["owner", "head_office", "admin"] });
