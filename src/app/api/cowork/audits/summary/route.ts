import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateApiKey } from "@/lib/api-key-auth";

/**
 * GET /api/cowork/audits/summary — network-wide audit summary
 */
export async function GET(req: NextRequest) {
  const { error } = await authenticateApiKey(req, "audits:read");
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const year = parseInt(searchParams.get("year") || String(new Date().getFullYear()));
  const month = searchParams.get("month") ? parseInt(searchParams.get("month")!) : undefined;

  const where: Record<string, unknown> = { scheduledYear: year };
  if (month) where.scheduledMonth = month;

  // Status breakdown
  const statusCounts = await prisma.auditInstance.groupBy({
    by: ["status"],
    where,
    _count: true,
  });

  // Average scores by quality area
  const byQA = await prisma.auditInstance.groupBy({
    by: ["templateId"],
    where: { ...where, status: "completed", complianceScore: { not: null } },
    _avg: { complianceScore: true },
    _count: true,
  });

  // Get template details for QA mapping
  const templateIds = byQA.map((b) => b.templateId);
  const templates = await prisma.auditTemplate.findMany({
    where: { id: { in: templateIds } },
    select: { id: true, name: true, qualityArea: true },
  });

  const qaMap = new Map(templates.map((t) => [t.id, t]));
  const qaScores: Record<number, { avg: number; count: number; audits: string[] }> = {};

  for (const b of byQA) {
    const template = qaMap.get(b.templateId);
    if (!template) continue;
    const qa = template.qualityArea;
    if (!qaScores[qa]) qaScores[qa] = { avg: 0, count: 0, audits: [] };
    qaScores[qa].avg += (b._avg.complianceScore || 0) * b._count;
    qaScores[qa].count += b._count;
    qaScores[qa].audits.push(template.name);
  }

  // Calculate weighted averages
  for (const qa of Object.keys(qaScores)) {
    const entry = qaScores[parseInt(qa)];
    entry.avg = entry.count > 0 ? Math.round((entry.avg / entry.count) * 10) / 10 : 0;
  }

  // Overdue count
  const overdueCount = await prisma.auditInstance.count({
    where: { ...where, status: "overdue" },
  });

  // Unreviewed count
  const unreviewedCount = await prisma.auditInstance.count({
    where: { ...where, status: "completed", reviewedAt: null },
  });

  return NextResponse.json({
    year,
    month,
    statusBreakdown: Object.fromEntries(statusCounts.map((s) => [s.status, s._count])),
    qualityAreaScores: qaScores,
    overdueCount,
    unreviewedCount,
    totalInstances: statusCounts.reduce((s, c) => s + c._count, 0),
  });
}
