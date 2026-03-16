import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateApiKey } from "@/lib/api-key-auth";
import { checkApiKeyRateLimit } from "@/lib/rate-limit";

/**
 * GET /api/cowork/partnerships/summary
 *
 * Cowork API endpoint for the weekly partnerships report automation.
 * Returns pipeline summary, school health scores, and cross-sell opportunities.
 *
 * Auth: API key with partnerships:read scope
 */
export async function GET(req: NextRequest) {
  const { apiKey, error: authError } = await authenticateApiKey(req, "partnerships:read");
  if (authError) return authError;

  const { limited } = await checkApiKeyRateLimit(apiKey!.id);
  if (limited) {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  }

  const now = new Date();

  // ── Pipeline Summary ──────────────────────────────────────
  const leads = await prisma.lead.findMany({
    where: { deleted: false },
    select: {
      id: true,
      schoolName: true,
      pipelineStage: true,
      source: true,
      nextTouchpointAt: true,
      tenderCloseDate: true,
      buildAlphaKidsStatus: true,
      communityConnections: true,
      stageChangedAt: true,
    },
  });

  // Count per stage
  const stageCounts: Record<string, number> = {};
  let overdueLeads = 0;
  const tendersClosingThisWeek: Array<{ schoolName: string; tenderCloseDate: string }> = [];

  const endOfWeek = new Date(now);
  endOfWeek.setDate(endOfWeek.getDate() + (7 - endOfWeek.getDay()));

  for (const lead of leads) {
    stageCounts[lead.pipelineStage] = (stageCounts[lead.pipelineStage] || 0) + 1;

    if (lead.nextTouchpointAt && lead.nextTouchpointAt < now) {
      overdueLeads++;
    }

    if (
      lead.tenderCloseDate &&
      lead.tenderCloseDate >= now &&
      lead.tenderCloseDate <= endOfWeek
    ) {
      tendersClosingThisWeek.push({
        schoolName: lead.schoolName,
        tenderCloseDate: lead.tenderCloseDate.toISOString(),
      });
    }
  }

  // ── School Health Scores ──────────────────────────────────
  const services = await prisma.service.findMany({
    where: { status: "active" },
    select: {
      id: true,
      name: true,
      code: true,
      contractEndDate: true,
      lastPrincipalVisit: true,
      buildAlphaKidsActive: true,
      schoolPrincipalName: true,
    },
  });

  const schoolHealth: Array<{
    serviceName: string;
    serviceCode: string;
    healthScore: number;
    contractEndDate: string | null;
    lastPrincipalVisit: string | null;
    buildAlphaKidsActive: boolean;
  }> = [];

  for (const service of services) {
    const hs = await prisma.healthScore.findFirst({
      where: { serviceId: service.id },
      orderBy: { periodStart: "desc" },
      select: { satisfactionScore: true, operationalScore: true },
    });

    const cm = await prisma.centreMetrics.findFirst({
      where: { serviceId: service.id },
      orderBy: { recordedAt: "desc" },
      select: { incidentCount: true, complaintCount: true },
    });

    const satisfaction = hs?.satisfactionScore ?? 50;
    const operational = hs?.operationalScore ?? 50;
    const incidentTotal = (cm?.incidentCount ?? 0) + (cm?.complaintCount ?? 0);
    const incidentSafety = Math.max(0, Math.min(100, 100 - incidentTotal * 10));

    let principalEngagement = 50;
    if (service.lastPrincipalVisit) {
      const daysSince = Math.floor(
        (now.getTime() - service.lastPrincipalVisit.getTime()) / (1000 * 60 * 60 * 24)
      );
      principalEngagement = Math.max(0, Math.min(100, 100 - (daysSince / 180) * 100));
    }

    let contractUrgency = 80;
    if (service.contractEndDate) {
      const monthsUntil =
        (service.contractEndDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24 * 30);
      contractUrgency = monthsUntil <= 0 ? 0 : monthsUntil <= 6 ? Math.min(100, (monthsUntil / 6) * 100) : 100;
    }

    const score = Math.round(
      satisfaction * 0.3 + operational * 0.25 + incidentSafety * 0.2 + principalEngagement * 0.15 + contractUrgency * 0.1
    );

    schoolHealth.push({
      serviceName: service.name,
      serviceCode: service.code,
      healthScore: score,
      contractEndDate: service.contractEndDate?.toISOString() ?? null,
      lastPrincipalVisit: service.lastPrincipalVisit?.toISOString() ?? null,
      buildAlphaKidsActive: service.buildAlphaKidsActive,
    });
  }

  schoolHealth.sort((a, b) => a.healthScore - b.healthScore);

  // ── Cross-sell Opportunities ──────────────────────────────
  const crossSellOpportunities = services
    .filter((s) => !s.buildAlphaKidsActive)
    .map((s) => ({
      serviceName: s.name,
      serviceCode: s.code,
      schoolPrincipalName: s.schoolPrincipalName,
    }));

  const res = NextResponse.json({
    pipeline: {
      totalLeads: leads.length,
      stageCounts,
      overdueLeads,
      tendersClosingThisWeek,
    },
    schoolHealth,
    crossSell: {
      oshcWithoutBuildAlphaKids: crossSellOpportunities,
      count: crossSellOpportunities.length,
    },
  });
  res.headers.set("Cache-Control", "public, s-maxage=60, stale-while-revalidate=120");
  return res;
}
