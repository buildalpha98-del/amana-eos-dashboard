import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
// GET /api/services/[id]/interests/summary
export const GET = withApiAuth(async (req, session, context) => {
  const { id } = await context!.params!;

  const now = new Date();
  const weekAgo = new Date(now);
  weekAgo.setDate(weekAgo.getDate() - 7);
  const monthAgo = new Date(now);
  monthAgo.setDate(monthAgo.getDate() - 30);

  const [thisWeek, thisMonth, totalActioned, totalUnactioned] = await Promise.all([
    prisma.childInterest.count({
      where: { serviceId: id, capturedDate: { gte: weekAgo } },
    }),
    prisma.childInterest.count({
      where: { serviceId: id, capturedDate: { gte: monthAgo } },
    }),
    prisma.childInterest.count({
      where: { serviceId: id, actioned: true },
    }),
    prisma.childInterest.count({
      where: { serviceId: id, actioned: false },
    }),
  ]);

  const total = totalActioned + totalUnactioned;
  const actionedPercentage = total > 0 ? Math.round((totalActioned / total) * 100) : 0;

  // Top categories
  const categoryGroups = await prisma.childInterest.groupBy({
    by: ["interestCategory"],
    where: { serviceId: id, capturedDate: { gte: monthAgo } },
    _count: { id: true },
    orderBy: { _count: { id: "desc" } },
    take: 5,
  });

  // Top topics (last 30 days)
  const recentInterests = await prisma.childInterest.findMany({
    where: { serviceId: id, capturedDate: { gte: monthAgo } },
    select: { interestTopic: true },
  });

  const topicCounts: Record<string, number> = {};
  for (const i of recentInterests) {
    const topic = i.interestTopic.toLowerCase().trim();
    topicCounts[topic] = (topicCounts[topic] || 0) + 1;
  }
  const topTopics = Object.entries(topicCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([topic, count]) => ({ topic, count }));

  return NextResponse.json({
    capturedThisWeek: thisWeek,
    capturedThisMonth: thisMonth,
    totalActioned,
    totalUnactioned,
    actionedPercentage,
    topCategories: categoryGroups.map((g) => ({
      category: g.interestCategory || "uncategorised",
      count: g._count.id,
    })),
    topTopics,
  });
});
