import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";

export async function GET(req: NextRequest) {
  const { error } = await requireAuth();
  if (error) return error;

  // Get all active services with their latest metrics and financials
  const services = await prisma.service.findMany({
    where: { status: { in: ["active", "onboarding"] } },
    include: {
      manager: { select: { id: true, name: true } },
      metrics: {
        orderBy: { recordedAt: "desc" },
        take: 1,
      },
      financials: {
        where: { periodType: "monthly" },
        orderBy: { periodStart: "desc" },
        take: 1,
      },
      _count: {
        select: {
          todos: { where: { deleted: false, status: { not: "complete" } } },
          issues: { where: { deleted: false, status: { in: ["open", "in_discussion"] } } },
          projects: { where: { deleted: false, status: "in_progress" } },
        },
      },
    },
    orderBy: { name: "asc" },
  });

  // Build performance data for each centre
  const performance = services.map((s) => {
    const metric = s.metrics[0] || null;
    const financial = s.financials[0] || null;

    // Calculate a composite score (0-100)
    let score = 50; // base
    if (metric) {
      score += (metric.ascOccupancy > 70 ? 10 : metric.ascOccupancy > 50 ? 5 : 0);
      score += (metric.ratioCompliance >= 100 ? 10 : 0);
      score += (metric.overallCompliance >= 95 ? 10 : metric.overallCompliance >= 80 ? 5 : 0);
      score += (metric.parentNps && metric.parentNps > 60 ? 10 : metric.parentNps && metric.parentNps > 40 ? 5 : 0);
      score += (metric.incidentCount === 0 ? 5 : 0);
      score -= (metric.educatorsTurnover > 20 ? 10 : metric.educatorsTurnover > 10 ? 5 : 0);
    }
    if (financial) {
      score += (financial.margin > 20 ? 10 : financial.margin > 10 ? 5 : financial.margin > 0 ? 2 : -5);
    }
    score = Math.max(0, Math.min(100, score));

    return {
      id: s.id,
      name: s.name,
      code: s.code,
      state: s.state,
      status: s.status,
      capacity: s.capacity,
      manager: s.manager,
      score,
      metrics: metric
        ? {
            bscOccupancy: metric.bscOccupancy,
            ascOccupancy: metric.ascOccupancy,
            totalEducators: metric.totalEducators,
            educatorsTurnover: metric.educatorsTurnover,
            ratioCompliance: metric.ratioCompliance,
            parentNps: metric.parentNps,
            incidentCount: metric.incidentCount,
            complaintCount: metric.complaintCount,
            overallCompliance: metric.overallCompliance,
            nqsRating: metric.nqsRating,
          }
        : null,
      financials: financial
        ? {
            totalRevenue: financial.totalRevenue,
            totalCosts: financial.totalCosts,
            grossProfit: financial.grossProfit,
            margin: financial.margin,
          }
        : null,
      openIssues: s._count.issues,
      activeTodos: s._count.todos,
      activeProjects: s._count.projects,
    };
  });

  // Sort by score descending
  performance.sort((a, b) => b.score - a.score);

  return NextResponse.json(performance);
}
