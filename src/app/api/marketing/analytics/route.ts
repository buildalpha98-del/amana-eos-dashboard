import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";

// GET /api/marketing/analytics — aggregated analytics data
export async function GET(req: NextRequest) {
  const { error } = await requireAuth(["owner", "admin"]);
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const period = parseInt(searchParams.get("period") || "30", 10);

  const now = new Date();
  const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 6, 1);

  const [
    pillarBreakdown,
    platformBreakdown,
    statusBreakdown,
    topPosts,
    recentPosts,
  ] = await Promise.all([
    // Group non-deleted posts by pillar
    prisma.marketingPost.groupBy({
      by: ["pillar"],
      where: { deleted: false, pillar: { not: null } },
      _count: { id: true },
    }),

    // Group posts by platform
    prisma.marketingPost.groupBy({
      by: ["platform"],
      where: { deleted: false },
      _count: { id: true },
    }),

    // Group posts by status
    prisma.marketingPost.groupBy({
      by: ["status"],
      where: { deleted: false },
      _count: { id: true },
    }),

    // Top 5 posts by engagement (order by likes desc, compute total in JS)
    prisma.marketingPost.findMany({
      where: { deleted: false },
      include: {
        assignee: { select: { id: true, name: true, avatar: true } },
        campaign: { select: { id: true, name: true } },
      },
      orderBy: { likes: "desc" },
      take: 5,
    }),

    // All posts from last 6 months for monthly trend
    prisma.marketingPost.findMany({
      where: {
        deleted: false,
        createdAt: { gte: sixMonthsAgo },
      },
      select: {
        createdAt: true,
        likes: true,
        comments: true,
        shares: true,
        reach: true,
      },
    }),
  ]);

  // Add computed totalEngagement to leaderboard posts and re-sort
  const leaderboard = topPosts
    .map((post) => ({
      ...post,
      totalEngagement: post.likes + post.comments + post.shares + post.reach,
    }))
    .sort((a, b) => b.totalEngagement - a.totalEngagement);

  // Build monthly trend for last 6 months
  const monthlyTrend: {
    month: string;
    postsCreated: number;
    totalEngagement: number;
  }[] = [];

  for (let i = 5; i >= 0; i--) {
    const monthDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const year = monthDate.getFullYear();
    const month = monthDate.getMonth();
    const label = `${year}-${String(month + 1).padStart(2, "0")}`;

    const monthPosts = recentPosts.filter((p) => {
      const d = new Date(p.createdAt);
      return d.getFullYear() === year && d.getMonth() === month;
    });

    const postsCreated = monthPosts.length;
    const totalEngagement = monthPosts.reduce(
      (sum, p) => sum + p.likes + p.comments + p.shares + p.reach,
      0
    );

    monthlyTrend.push({ month: label, postsCreated, totalEngagement });
  }

  return NextResponse.json({
    pillarBreakdown,
    platformBreakdown,
    statusBreakdown,
    leaderboard,
    monthlyTrend,
  });
}
