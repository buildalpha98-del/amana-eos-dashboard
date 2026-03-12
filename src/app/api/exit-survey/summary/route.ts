import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";
import { getServiceScope } from "@/lib/service-scope";

// GET /api/exit-survey/summary — aggregated exit data per service
export async function GET(req: NextRequest) {
  const { session, error } = await requireAuth();
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const serviceId = searchParams.get("serviceId");
  const months = parseInt(searchParams.get("months") || "6");

  const serviceScope = getServiceScope(session!);
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - months);

  const where: any = {
    completedAt: { not: null },
    createdAt: { gte: cutoff },
  };

  if (serviceId) {
    where.serviceId = serviceId;
  } else if (serviceScope) {
    where.serviceId = serviceScope;
  }

  try {
    const surveys = await prisma.exitSurvey.findMany({
      where,
      include: {
        service: { select: { id: true, name: true, code: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    // Aggregate per service
    const byService: Record<string, typeof surveys> = {};
    for (const s of surveys) {
      if (!byService[s.serviceId]) byService[s.serviceId] = [];
      byService[s.serviceId].push(s);
    }

    const services = Object.entries(byService).map(([sId, list]) => {
      const svc = list[0].service;
      const reasonDist: Record<string, number> = {};
      let satTotal = 0;
      let wouldReturnYes = 0;
      let wouldReturnMaybe = 0;

      for (const s of list) {
        reasonDist[s.reason] = (reasonDist[s.reason] || 0) + 1;
        satTotal += s.satisfactionScore;
        if (s.wouldReturn === "yes") wouldReturnYes++;
        if (s.wouldReturn === "maybe") wouldReturnMaybe++;
      }

      return {
        serviceId: sId,
        serviceName: svc.name,
        serviceCode: svc.code,
        totalExits: list.length,
        averageSatisfaction: Math.round((satTotal / list.length) * 10) / 10,
        wouldReturnRate: Math.round(((wouldReturnYes + wouldReturnMaybe) / list.length) * 100),
        reasonDistribution: Object.entries(reasonDist)
          .map(([reason, count]) => ({ reason, count, percentage: Math.round((count / list.length) * 100) }))
          .sort((a, b) => b.count - a.count),
        recentComments: list
          .filter((s) => s.couldImprove)
          .slice(0, 5)
          .map((s) => ({ comment: s.couldImprove, date: s.completedAt, reason: s.reason })),
      };
    });

    // Churn metrics
    const churnWhere: any = {
      status: "withdrawn",
      withdrawalDate: { gte: cutoff },
    };
    if (serviceId) churnWhere.serviceId = serviceId;
    else if (serviceScope) churnWhere.serviceId = serviceScope;

    const withdrawnCount = await prisma.centreContact.count({ where: churnWhere });

    const activeWhere: any = { status: "active" };
    if (serviceId) activeWhere.serviceId = serviceId;
    else if (serviceScope) activeWhere.serviceId = serviceScope;

    const activeCount = await prisma.centreContact.count({ where: activeWhere });
    const churnRate = activeCount + withdrawnCount > 0
      ? Math.round((withdrawnCount / (activeCount + withdrawnCount)) * 1000) / 10
      : 0;

    return NextResponse.json({
      services,
      churn: {
        withdrawnCount,
        activeCount,
        churnRate,
        period: `${months} months`,
      },
    });
  } catch (err) {
    console.error("[ExitSurvey Summary]", err);
    return NextResponse.json({ error: "Failed to fetch summary" }, { status: 500 });
  }
}
