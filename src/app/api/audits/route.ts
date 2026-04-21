import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { z } from "zod";
import { parseJsonBody } from "@/lib/api-error";
/**
 * GET /api/audits — list audit instances with filters + pagination
 */
export const GET = withApiAuth(async (req, session) => {
  const { searchParams } = new URL(req.url);
  const serviceId = searchParams.get("serviceId");
  const templateId = searchParams.get("templateId");
  const status = searchParams.get("status");
  const qualityArea = searchParams.get("qualityArea");
  const month = searchParams.get("month");
  const year = searchParams.get("year");
  const page = parseInt(searchParams.get("page") || "1");
  const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 100);

  const where: Record<string, unknown> = {};
  if (serviceId) where.serviceId = serviceId;
  if (templateId) where.templateId = templateId;
  if (status) where.status = status;
  if (month) where.scheduledMonth = parseInt(month);
  if (year) where.scheduledYear = parseInt(year);
  if (qualityArea) where.template = { qualityArea: parseInt(qualityArea) };

  const [instances, total] = await Promise.all([
    prisma.auditInstance.findMany({
      where,
      include: {
        template: {
          select: {
            id: true,
            name: true,
            qualityArea: true,
            nqsReference: true,
            frequency: true,
            responseFormat: true,
          },
        },
        service: { select: { id: true, name: true, code: true } },
        auditor: { select: { id: true, name: true } },
      },
      orderBy: [{ dueDate: "asc" }, { template: { sortOrder: "asc" } }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.auditInstance.count({ where }),
  ]);

  // Summary stats
  const allForStats = await prisma.auditInstance.groupBy({
    by: ["status"],
    where: {
      ...(serviceId ? { serviceId } : {}),
      ...(year ? { scheduledYear: parseInt(year) } : {}),
      ...(month ? { scheduledMonth: parseInt(month) } : {}),
    },
    _count: true,
  });

  const stats = {
    scheduled: 0,
    in_progress: 0,
    completed: 0,
    overdue: 0,
    skipped: 0,
    total: 0,
  };
  for (const s of allForStats) {
    stats[s.status as keyof typeof stats] = s._count;
    stats.total += s._count;
  }

  // Average compliance score for completed
  const avgScore = await prisma.auditInstance.aggregate({
    where: {
      status: "completed",
      complianceScore: { not: null },
      ...(serviceId ? { serviceId } : {}),
      ...(year ? { scheduledYear: parseInt(year) } : {}),
    },
    _avg: { complianceScore: true },
  });

  return NextResponse.json({
    instances,
    stats: { ...stats, avgScore: avgScore._avg.complianceScore },
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
});

/**
 * POST /api/audits — manually create an audit instance
 *
 * Pre-seeds a `not_answered` AuditItemResponse row for every template item
 * inside a `$transaction`, so a failed insert never leaves a headless
 * AuditInstance without its answer rows.
 */
const createAuditSchema = z.object({
  templateId: z.string().min(1),
  serviceId: z.string().min(1),
  scheduledMonth: z.number().int().min(1).max(12),
  scheduledYear: z.number().int().min(2020).max(2100),
  dueDate: z.string().datetime().optional(),
  auditorId: z.string().optional(),
});

export const POST = withApiAuth(
  async (req, session) => {
    const body = await parseJsonBody(req);
    const parsed = createAuditSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }
    const { templateId, serviceId, scheduledMonth, scheduledYear, dueDate, auditorId } = parsed.data;

    // Verify template exists and pre-seed response rows
    const template = await prisma.auditTemplate.findUnique({
      where: { id: templateId },
      include: { items: { select: { id: true } } },
    });
    if (!template) {
      return NextResponse.json({ error: "Audit template not found" }, { status: 404 });
    }

    // Create instance + pre-seed responses atomically so a failed insert
    // doesn't leave a headless AuditInstance without answer rows.
    const instance = await prisma.$transaction(async (tx) => {
      const created = await tx.auditInstance.create({
        data: {
          templateId,
          serviceId,
          scheduledMonth,
          scheduledYear,
          dueDate: dueDate ? new Date(dueDate) : new Date(scheduledYear, scheduledMonth - 1, 15),
          status: "scheduled",
          auditorId: auditorId ?? null,
        },
        include: {
          template: { select: { id: true, name: true, qualityArea: true, nqsReference: true, responseFormat: true } },
          service: { select: { id: true, name: true, code: true } },
          auditor: { select: { id: true, name: true } },
        },
      });

      if (template.items.length > 0) {
        await tx.auditItemResponse.createMany({
          data: template.items.map((item) => ({
            instanceId: created.id,
            templateItemId: item.id,
            result: "not_answered" as const,
          })),
        });
      }

      return created;
    });

    await prisma.activityLog.create({
      data: {
        userId: session!.user.id,
        action: "create",
        entityType: "AuditInstance",
        entityId: instance.id,
        details: { templateId, serviceId, scheduledMonth, scheduledYear },
      },
    });

    return NextResponse.json(instance, { status: 201 });
  },
  { roles: ["owner", "admin", "member"] },
);
