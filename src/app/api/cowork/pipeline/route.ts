import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateCowork } from "@/app/api/_lib/auth";

const STAGES = [
  "new_enquiry",
  "info_sent",
  "nurturing",
  "form_started",
  "enrolled",
  "first_session",
  "day3",
  "week2",
  "month1",
  "retained",
  "cold",
] as const;

/**
 * GET /api/cowork/pipeline
 *
 * Returns aggregated enquiry pipeline stats for Cowork integration.
 * Requires API key with pipeline:read scope.
 *
 * Query params:
 *   - serviceId (optional — filter to a single centre)
 */
export async function GET(req: NextRequest) {
  const authError = authenticateCowork(req);
  if (authError) return authError;

  const { searchParams } = new URL(req.url);
  const serviceId = searchParams.get("serviceId");

  const baseWhere: Record<string, unknown> = { deleted: false };
  if (serviceId) baseWhere.serviceId = serviceId;

  try {
    const now = new Date();
    const fortyEightHoursAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000);

    // Count per stage
    const stageCounts = await prisma.parentEnquiry.groupBy({
      by: ["stage"],
      where: baseWhere,
      _count: { id: true },
    });

    const countByStage: Record<string, number> = {};
    for (const s of STAGES) countByStage[s] = 0;
    for (const sc of stageCounts) {
      countByStage[sc.stage] = sc._count.id;
    }

    // Count by centre
    const centreCounts = await prisma.parentEnquiry.groupBy({
      by: ["serviceId"],
      where: baseWhere,
      _count: { id: true },
    });

    const serviceIds = centreCounts.map((c) => c.serviceId);
    const services = await prisma.service.findMany({
      where: { id: { in: serviceIds } },
      select: { id: true, name: true, code: true },
    });
    const serviceMap = new Map(services.map((s) => [s.id, s]));

    const countByCentre = centreCounts.map((c) => ({
      serviceId: c.serviceId,
      serviceName: serviceMap.get(c.serviceId)?.name || "Unknown",
      serviceCode: serviceMap.get(c.serviceId)?.code || "",
      count: c._count.id,
    }));

    // Average days in each stage
    const allEnquiries = await prisma.parentEnquiry.findMany({
      where: baseWhere,
      select: { stage: true, stageChangedAt: true },
    });

    const avgDaysByStage: Record<string, number> = {};
    const stageDaysAccum: Record<string, { total: number; count: number }> = {};
    for (const e of allEnquiries) {
      const days =
        (now.getTime() - e.stageChangedAt.getTime()) / (1000 * 60 * 60 * 24);
      if (!stageDaysAccum[e.stage]) {
        stageDaysAccum[e.stage] = { total: 0, count: 0 };
      }
      stageDaysAccum[e.stage].total += days;
      stageDaysAccum[e.stage].count += 1;
    }
    for (const [stage, data] of Object.entries(stageDaysAccum)) {
      avgDaysByStage[stage] =
        Math.round((data.total / data.count) * 10) / 10;
    }

    // Stuck count (>48hrs in same stage, excluding cold/retained)
    const stuckCount = await prisma.parentEnquiry.count({
      where: {
        ...baseWhere,
        stage: { notIn: ["cold", "retained"] },
        stageChangedAt: { lt: fortyEightHoursAgo },
      },
    });

    // Total active (not cold, not retained, not deleted)
    const totalActive = await prisma.parentEnquiry.count({
      where: {
        ...baseWhere,
        stage: { notIn: ["cold", "retained"] },
      },
    });

    // Conversion rates
    const totalEnquiries = Object.values(countByStage).reduce(
      (s, c) => s + c,
      0,
    );
    const totalEnrolled =
      (countByStage.enrolled || 0) +
      (countByStage.first_session || 0) +
      (countByStage.day3 || 0) +
      (countByStage.week2 || 0) +
      (countByStage.month1 || 0) +
      (countByStage.retained || 0);
    const conversionRate =
      totalEnquiries > 0
        ? Math.round((totalEnrolled / totalEnquiries) * 1000) / 10
        : 0;

    const res = NextResponse.json({
      countByStage,
      countByCentre,
      avgDaysByStage,
      stuckCount,
      totalActive,
      totalEnquiries,
      totalEnrolled,
      conversionRate,
    });
    res.headers.set("Cache-Control", "public, s-maxage=60, stale-while-revalidate=120");
    return res;
  } catch (err) {
    console.error("[Cowork Pipeline]", err);
    return NextResponse.json(
      { error: "Failed to fetch pipeline stats" },
      { status: 500 },
    );
  }
}
