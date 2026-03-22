import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
export const GET = withApiAuth(async (req, session) => {
  const { searchParams } = new URL(req.url);
  const serviceId = searchParams.get("serviceId");

  const where = serviceId ? { serviceId } : {};

  const [total, byStatus, rewardsIssued, byCentre] = await Promise.all([
    prisma.referral.count({ where }),

    prisma.referral.groupBy({
      by: ["status"],
      where,
      _count: true,
    }),

    prisma.referral.aggregate({
      where: { ...where, status: "rewarded" },
      _sum: { rewardAmount: true },
      _count: true,
    }),

    prisma.referral.groupBy({
      by: ["serviceId"],
      where,
      _count: true,
    }),
  ]);

  const statusMap: Record<string, number> = {};
  for (const s of byStatus) {
    statusMap[s.status] = s._count;
  }

  const enrolled = statusMap["enrolled"] ?? 0;
  const rewarded = statusMap["rewarded"] ?? 0;
  const conversionRate = total > 0 ? Math.round(((enrolled + rewarded) / total) * 100) : 0;

  // Get centre names for breakdown
  const serviceIds = byCentre.map((c) => c.serviceId);
  const services = await prisma.service.findMany({
    where: { id: { in: serviceIds } },
    select: { id: true, name: true, code: true },
  });
  const serviceMap = new Map(services.map((s) => [s.id, s]));

  const centreBreakdown = byCentre.map((c) => ({
    serviceId: c.serviceId,
    serviceName: serviceMap.get(c.serviceId)?.name ?? "Unknown",
    serviceCode: serviceMap.get(c.serviceId)?.code ?? "",
    count: c._count,
  }));

  // Rewards issued this month
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const rewardsThisMonth = await prisma.referral.aggregate({
    where: {
      ...where,
      status: "rewarded",
      rewardIssuedAt: { gte: startOfMonth },
    },
    _sum: { rewardAmount: true },
    _count: true,
  });

  return NextResponse.json({
    totalReferrals: total,
    conversionRate,
    statusBreakdown: statusMap,
    totalRewardsIssued: rewardsIssued._sum.rewardAmount ?? 0,
    totalRewardsCount: rewardsIssued._count,
    rewardsPending: (statusMap["enrolled"] ?? 0),
    rewardsThisMonth: {
      amount: rewardsThisMonth._sum.rewardAmount ?? 0,
      count: rewardsThisMonth._count,
    },
    centreBreakdown,
  });
}, { roles: ["owner", "head_office", "admin"] });
