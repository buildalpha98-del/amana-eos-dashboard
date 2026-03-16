import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateCowork } from "@/app/api/_lib/auth";

/**
 * POST /api/cowork/services/[serviceCode]/audits
 * Create or update an audit instance from automation output.
 * Called after a centre audit is completed by automation tasks.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ serviceCode: string }> }
) {
  const authError = authenticateCowork(req);
  if (authError) return authError;

  const { serviceCode } = await params;

  const service = await prisma.service.findUnique({
    where: { code: serviceCode },
    select: { id: true },
  });

  if (!service) {
    return NextResponse.json(
      { error: "Not Found", message: `Service ${serviceCode} not found` },
      { status: 404 }
    );
  }

  const body = await req.json();
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
  } = body;

  if (!templateName || !scheduledMonth || !scheduledYear) {
    return NextResponse.json(
      {
        error: "Bad Request",
        message: "templateName, scheduledMonth, and scheduledYear are required",
      },
      { status: 400 }
    );
  }

  // Find the audit template by name
  const template = await prisma.auditTemplate.findUnique({
    where: { name: templateName },
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
        r.templateItemId || templateItemMap.get(r.sortOrder);

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
}

/**
 * GET /api/cowork/services/[serviceCode]/audits?year=2026&month=3
 * Fetch audit instances for a centre.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ serviceCode: string }> }
) {
  const authError = authenticateCowork(req);
  if (authError) return authError;

  const { serviceCode } = await params;

  const service = await prisma.service.findUnique({
    where: { code: serviceCode },
    select: { id: true },
  });

  if (!service) {
    return NextResponse.json(
      { error: "Not Found", message: `Service ${serviceCode} not found` },
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
}
