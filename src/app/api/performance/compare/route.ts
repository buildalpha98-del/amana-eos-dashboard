import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
export const GET = withApiAuth(async (req, session) => {
  const url = new URL(req.url);
  const serviceIdsParam = url.searchParams.get("serviceIds");
  const period = url.searchParams.get("period") || "monthly";

  if (!serviceIdsParam) {
    return NextResponse.json(
      { error: "serviceIds query parameter is required" },
      { status: 400 }
    );
  }

  const serviceIds = serviceIdsParam.split(",").map((id) => id.trim()).filter(Boolean);

  if (serviceIds.length < 2 || serviceIds.length > 5) {
    return NextResponse.json(
      { error: "Please provide between 2 and 5 service IDs" },
      { status: 400 }
    );
  }

  // Fetch services
  const services = await prisma.service.findMany({
    where: { id: { in: serviceIds } },
    select: {
      id: true,
      name: true,
      code: true,
      state: true,
    },
  });

  if (services.length < 2) {
    return NextResponse.json(
      { error: "Could not find enough matching services" },
      { status: 404 }
    );
  }

  // Fetch the two most recent HealthScores per service for trend delta
  const healthScores = await prisma.healthScore.findMany({
    where: {
      serviceId: { in: serviceIds },
      periodType: period,
    },
    orderBy: { periodStart: "desc" },
    take: serviceIds.length * 2, // Up to 2 per service
  });

  // Group scores by serviceId: [latest, previous]
  const scoresByService = new Map<string, typeof healthScores>();
  for (const hs of healthScores) {
    const existing = scoresByService.get(hs.serviceId) || [];
    if (existing.length < 2) {
      existing.push(hs);
      scoresByService.set(hs.serviceId, existing);
    }
  }

  // Build centres comparison data
  const centres = services.map((s) => {
    const scores = scoresByService.get(s.id) || [];
    const current = scores[0] || null;
    const previous = scores[1] || null;

    return {
      id: s.id,
      name: s.name,
      code: s.code,
      state: s.state || "",
      current: current
        ? {
            overall: Math.round(current.overallScore),
            financial: Math.round(current.financialScore),
            operational: Math.round(current.operationalScore),
            compliance: Math.round(current.complianceScore),
            satisfaction: Math.round(current.satisfactionScore),
            teamCulture: Math.round(current.teamCultureScore),
          }
        : {
            overall: 0,
            financial: 0,
            operational: 0,
            compliance: 0,
            satisfaction: 0,
            teamCulture: 0,
          },
      previous: previous
        ? {
            overall: Math.round(previous.overallScore),
            financial: Math.round(previous.financialScore),
            operational: Math.round(previous.operationalScore),
            compliance: Math.round(previous.complianceScore),
            satisfaction: Math.round(previous.satisfactionScore),
            teamCulture: Math.round(previous.teamCultureScore),
          }
        : null,
      trend: current?.trend || "stable",
    };
  });

  // Build regional rollup from ALL active services (not just the compared ones)
  const allServices = await prisma.service.findMany({
    where: { status: { in: ["active", "onboarding"] } },
    select: { id: true, name: true, state: true },
  });

  const allLatestScores = await prisma.healthScore.findMany({
    where: { periodType: period },
    orderBy: { periodStart: "desc" },
    distinct: ["serviceId"],
  });

  const scoreMap = new Map(
    allLatestScores.map((hs) => [hs.serviceId, hs])
  );

  // Group by state
  const stateMap = new Map<
    string,
    { scores: number[]; names: string[]; topScore: number; topName: string }
  >();

  for (const svc of allServices) {
    const state = svc.state || "Unknown";
    const hs = scoreMap.get(svc.id);
    const score = hs ? Math.round(hs.overallScore) : 0;

    if (!stateMap.has(state)) {
      stateMap.set(state, {
        scores: [],
        names: [],
        topScore: 0,
        topName: "",
      });
    }

    const entry = stateMap.get(state)!;
    entry.scores.push(score);
    entry.names.push(svc.name);
    if (score > entry.topScore) {
      entry.topScore = score;
      entry.topName = svc.name;
    }
  }

  const regional = Array.from(stateMap.entries())
    .map(([state, data]) => ({
      state,
      centreCount: data.scores.length,
      avgScore: Math.round(
        data.scores.reduce((sum, s) => sum + s, 0) / data.scores.length
      ),
      topPerformer: data.topName,
    }))
    .sort((a, b) => b.avgScore - a.avgScore);

  return NextResponse.json({ centres, regional });
}, { roles: ["owner", "head_office", "admin"] });
