import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authenticateCowork } from "@/app/api/_lib/auth";
import { withApiHandler } from "@/lib/api-handler";

import { parseJsonBody } from "@/lib/api-error";
const auditResponseSchema = z.object({
  templateItemId: z.string().optional(),
  sortOrder: z.number().optional(),
  result: z.enum(["yes", "no", "na", "not_answered"]).optional(),
  ratingValue: z.number().nullable().optional(),
  actionRequired: z.string().nullable().optional(),
  evidenceSighted: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

const postBodySchema = z.object({
  templateName: z.string().min(1),
  scheduledMonth: z.number().min(1).max(12),
  scheduledYear: z.number().min(2000).max(2100),
  dueDate: z.string().optional(),
  status: z.enum(["scheduled", "in_progress", "completed", "overdue", "skipped"]).optional(),
  auditorName: z.string().nullable().optional(),
  strengths: z.string().nullable().optional(),
  areasForImprovement: z.string().nullable().optional(),
  actionPlan: z.string().nullable().optional(),
  comments: z.string().nullable().optional(),
  responses: z.array(auditResponseSchema).optional(),
});

/**
 * POST /api/cowork/services/[serviceCode]/audits
 * Create or update an audit instance from automation output.
 * Called after a centre audit is completed by automation tasks.
 */
export const POST = withApiHandler(async (req, context) => {
  const authError = await authenticateCowork(req);
  if (authError) return authError;

  const { serviceCode } = await context!.params!;

  const service = await prisma.service.findUnique({
    where: { code: serviceCode },
    select: { id: true },
  });

  if (!service) {
    return NextResponse.json(
      { error: `Service ${serviceCode} not found` },
      { status: 404 }
    );
  }

  const body = await parseJsonBody(req);
  const parsed = postBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }
  const {
    templateName,
    scheduledMonth,
    scheduledYear,
    dueDate,
    status,
    auditorName,
    strengths,
    areasForImprovement,
    actionPlan,
    comments,
    responses,
  } = parsed.data;

  // Find the audit template by name (case-insensitive to prevent sync mismatches)
  const template = await prisma.auditTemplate.findFirst({
    where: { name: { equals: templateName, mode: "insensitive" } },
    include: { items: { orderBy: { sortOrder: "asc" } } },
  });

  if (!template) {
    return NextResponse.json(
      {
        error: "Not Found",
        message: `Audit template "${templateName}" not found`,
      },
      { status: 404 }
    );
  }

  // Calculate compliance scores from responses
  let totalItems = 0;
  let yesCount = 0;
  let noCount = 0;
  let naCount = 0;

  if (responses && Array.isArray(responses)) {
    totalItems = responses.length;
    for (const r of responses) {
      if (r.result === "yes") yesCount++;
      else if (r.result === "no") noCount++;
      else if (r.result === "na") naCount++;
    }
  }

  const answeredItems = totalItems - naCount;
  const complianceScore =
    answeredItems > 0 ? Math.round((yesCount / answeredItems) * 100) : null;

  // Upsert the audit instance
  const instance = await prisma.auditInstance.upsert({
    where: {
      templateId_serviceId_scheduledMonth_scheduledYear: {
        templateId: template.id,
        serviceId: service.id,
        scheduledMonth,
        scheduledYear,
      },
    },
    create: {
      templateId: template.id,
      serviceId: service.id,
      scheduledMonth,
      scheduledYear,
      dueDate: dueDate ? new Date(dueDate) : new Date(),
      status: status || "completed",
      auditorName: auditorName || null,
      totalItems,
      yesCount,
      noCount,
      naCount,
      complianceScore,
      strengths: strengths || null,
      areasForImprovement: areasForImprovement || null,
      actionPlan: actionPlan || null,
      comments: comments || null,
      completedAt: status === "completed" ? new Date() : null,
    },
    update: {
      status: status || "completed",
      auditorName: auditorName || undefined,
      totalItems,
      yesCount,
      noCount,
      naCount,
      complianceScore,
      strengths: strengths || undefined,
      areasForImprovement: areasForImprovement || undefined,
      actionPlan: actionPlan || undefined,
      comments: comments || undefined,
      completedAt: status === "completed" ? new Date() : undefined,
    },
  });

  // Create item responses if provided
  if (responses && Array.isArray(responses) && responses.length > 0) {
    // Build a map of template items by question text or sortOrder
    const templateItemMap = new Map(
      template.items.map((item) => [item.sortOrder, item.id])
    );

    for (const r of responses) {
      const templateItemId =
        r.templateItemId || (r.sortOrder != null ? templateItemMap.get(r.sortOrder) : undefined);

      if (!templateItemId) continue;

      await prisma.auditItemResponse.upsert({
        where: {
          instanceId_templateItemId: {
            instanceId: instance.id,
            templateItemId,
          },
        },
        create: {
          instanceId: instance.id,
          templateItemId,
          result: r.result || "not_answered",
          ratingValue: r.ratingValue || null,
          actionRequired: r.actionRequired || null,
          evidenceSighted: r.evidenceSighted || null,
          notes: r.notes || null,
        },
        update: {
          result: r.result || "not_answered",
          ratingValue: r.ratingValue || undefined,
          actionRequired: r.actionRequired || undefined,
          evidenceSighted: r.evidenceSighted || undefined,
          notes: r.notes || undefined,
        },
      });
    }
  }

  return NextResponse.json(
    {
      message: "Audit instance created/updated",
      auditInstanceId: instance.id,
      serviceCode,
      templateName,
      complianceScore,
      status: instance.status,
    },
    { status: 201 }
  );
});

/**
 * GET /api/cowork/services/[serviceCode]/audits?year=2026&month=3
 * Fetch audit instances for a centre.
 */
export const GET = withApiHandler(async (req, context) => {
  const authError = await authenticateCowork(req);
  if (authError) return authError;

  const { serviceCode } = await context!.params!;

  const service = await prisma.service.findUnique({
    where: { code: serviceCode },
    select: { id: true },
  });

  if (!service) {
    return NextResponse.json(
      { error: `Service ${serviceCode} not found` },
      { status: 404 }
    );
  }

  const { searchParams } = new URL(req.url);
  const year = searchParams.get("year")
    ? parseInt(searchParams.get("year")!)
    : undefined;
  const month = searchParams.get("month")
    ? parseInt(searchParams.get("month")!)
    : undefined;

  const where: Record<string, unknown> = { serviceId: service.id };
  if (year) where.scheduledYear = year;
  if (month) where.scheduledMonth = month;

  const audits = await prisma.auditInstance.findMany({
    where,
    include: {
      template: { select: { name: true, qualityArea: true, nqsReference: true } },
      responses: {
        include: {
          templateItem: { select: { question: true, section: true, sortOrder: true } },
        },
        orderBy: { templateItem: { sortOrder: "asc" } },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ audits });
});
