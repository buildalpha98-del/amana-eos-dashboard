import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";

/**
 * GET /api/audits — list audit instances with filters + pagination
 */
export async function GET(req: NextRequest) {
  const { error } = await requireAuth();
  if (error) return error;

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
}
