import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";

/**
 * GET /api/partnerships/school-health
 *
 * Computes a relationship health score (0-100) for each active service.
 * Weights:
 *   - Parent satisfaction score (30%)
 *   - Operational score (25%)
 *   - Incidents/complaints inverse (20%)
 *   - Days since last principal visit (15%)
 *   - Contract urgency (10%)
 *
 * Sorted ascending (weakest first).
 */
export async function GET() {
  const { error } = await requireAuth();
  if (error) return error;

  const services = await prisma.service.findMany({
    where: { status: "active" },
    select: {
      id: true,
      name: true,
      code: true,
      contractStartDate: true,
      contractEndDate: true,
      lastPrincipalVisit: true,
      buildAlphaKidsActive: true,
      schoolPrincipalName: true,
      licenceFeeAnnual: true,
    },
  });

  const now = new Date();
  const results: Array<{
    serviceId: string;
    serviceName: string;
    serviceCode: string;
    healthScore: number;
    breakdown: {
      satisfaction: number;
      operational: number;
      incidentSafety: number;
      principalEngagement: number;
      contractUrgency: number;
    };
    contractEndDate: string | null;
    lastPrincipalVisit: string | null;
    buildAlphaKidsActive: boolean;
    schoolPrincipalName: string | null;
  }> = [];

  for (const service of services) {
    // Get latest HealthScore
    const healthScore = await prisma.healthScore.findFirst({
      where: { serviceId: service.id },
      orderBy: { periodStart: "desc" },
      select: { satisfactionScore: true, operationalScore: true },
    });

    // Get latest CentreMetrics
    const metrics = await prisma.centreMetrics.findFirst({
      where: { serviceId: service.id },
      orderBy: { recordedAt: "desc" },
      select: { incidentCount: true, complaintCount: true },
    });

    // Satisfaction (30%) — HealthScore.satisfactionScore is 0-100
    const satisfaction = healthScore?.satisfactionScore ?? 50;

    // Operational (25%) — HealthScore.operationalScore is 0-100
    const operational = healthScore?.operationalScore ?? 50;

    // Incident safety (20%) — inverse: fewer incidents = higher score
    const incidentTotal = (metrics?.incidentCount ?? 0) + (metrics?.complaintCount ?? 0);
    // 0 incidents = 100, 10+ incidents = 0
    const incidentSafety = Math.max(0, Math.min(100, 100 - incidentTotal * 10));

    // Principal engagement (15%) — days since last visit
    let principalEngagement = 50; // default if no visit
    if (service.lastPrincipalVisit) {
      const daysSince = Math.floor(
        (now.getTime() - service.lastPrincipalVisit.getTime()) / (1000 * 60 * 60 * 24)
      );
      // 0 days = 100, 180+ days = 0
      principalEngagement = Math.max(0, Math.min(100, 100 - (daysSince / 180) * 100));
    }

    // Contract urgency (10%) — months until end
    let contractUrgency = 80; // default if no contract end
    if (service.contractEndDate) {
      const monthsUntil =
        (service.contractEndDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24 * 30);
      if (monthsUntil <= 0) {
        contractUrgency = 0; // expired
      } else if (monthsUntil <= 6) {
        contractUrgency = Math.min(100, (monthsUntil / 6) * 100);
      } else {
        contractUrgency = 100;
      }
    }

    const score = Math.round(
      satisfaction * 0.3 +
        operational * 0.25 +
        incidentSafety * 0.2 +
        principalEngagement * 0.15 +
        contractUrgency * 0.1
    );

    results.push({
      serviceId: service.id,
      serviceName: service.name,
      serviceCode: service.code,
      healthScore: score,
      breakdown: {
        satisfaction: Math.round(satisfaction),
        operational: Math.round(operational),
        incidentSafety: Math.round(incidentSafety),
        principalEngagement: Math.round(principalEngagement),
        contractUrgency: Math.round(contractUrgency),
      },
      contractEndDate: service.contractEndDate?.toISOString() ?? null,
      lastPrincipalVisit: service.lastPrincipalVisit?.toISOString() ?? null,
      buildAlphaKidsActive: service.buildAlphaKidsActive,
      schoolPrincipalName: service.schoolPrincipalName,
    });
  }

  // Sort ascending — weakest relationships first
  results.sort((a, b) => a.healthScore - b.healthScore);

  return NextResponse.json({ schools: results });
}
