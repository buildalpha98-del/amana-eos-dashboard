import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
// GET /api/marketing/analytics — aggregated analytics data
export const GET = withApiAuth(async (req, session) => {
  const { searchParams } = new URL(req.url);
  const period = parseInt(searchParams.get("period") || "30", 10);
  const serviceId = searchParams.get("serviceId");

  const now = new Date();
  const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 6, 1);

  const serviceFilter = serviceId
    ? { services: { some: { serviceId } } }
    : {};

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
      where: { deleted: false, pillar: { not: null }, ...serviceFilter },
      _count: { id: true },
    }),

    // Group posts by platform
    prisma.marketingPost.groupBy({
      by: ["platform"],
      where: { deleted: false, ...serviceFilter },
      _count: { id: true },
    }),

    // Group posts by status
    prisma.marketingPost.groupBy({
      by: ["status"],
      where: { deleted: false, ...serviceFilter },
      _count: { id: true },
    }),

    // Top 5 posts by engagement (order by likes desc, compute total in JS)
    prisma.marketingPost.findMany({
      where: { deleted: false, ...serviceFilter },
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
        ...serviceFilter,
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

  const response: Record<string, unknown> = {
    pillarBreakdown,
    platformBreakdown,
    statusBreakdown,
    leaderboard,
    monthlyTrend,
  };

  // When NOT filtered by serviceId, add multi-centre analytics
  if (!serviceId) {
    const activeServices = await prisma.service.findMany({
      where: { status: "active" },
      select: { id: true, name: true, code: true },
    });

    // Centre breakdown: for each active service, count posts, sum engagement, find top platform
    const centreBreakdown = await Promise.all(
      activeServices.map(async (svc) => {
        const posts = await prisma.marketingPost.findMany({
          where: {
            deleted: false,
            services: { some: { serviceId: svc.id } },
          },
          select: {
            likes: true,
            comments: true,
            shares: true,
            platform: true,
          },
        });

        const postCount = posts.length;
        const totalEngagement = posts.reduce(
          (sum, p) => sum + p.likes + p.comments + p.shares,
          0
        );

        // Find top platform by count
        const platformCounts: Record<string, number> = {};
        for (const p of posts) {
          platformCounts[p.platform] = (platformCounts[p.platform] || 0) + 1;
        }
        const topPlatform =
          Object.entries(platformCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || null;

        return {
          serviceId: svc.id,
          serviceName: svc.name,
          serviceCode: svc.code,
          postCount,
          totalEngagement,
          topPlatform,
        };
      })
    );

    // Sort by postCount desc
    centreBreakdown.sort((a, b) => b.postCount - a.postCount);

    // Weekly heatmap: last 8 weeks, for each active service, count posts per week
    const eightWeeksAgo = new Date(now);
    eightWeeksAgo.setDate(eightWeeksAgo.getDate() - 56);

    // Build week boundaries
    const weeks: { weekStart: Date; weekEnd: Date; label: string }[] = [];
    for (let i = 7; i >= 0; i--) {
      const weekStart = new Date(now);
      weekStart.setDate(weekStart.getDate() - i * 7);
      weekStart.setHours(0, 0, 0, 0);
      // Adjust to Monday
      const dayOfWeek = weekStart.getDay();
      const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      weekStart.setDate(weekStart.getDate() + diff);

      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 6);
      weekEnd.setHours(23, 59, 59, 999);

      weeks.push({
        weekStart: new Date(weekStart),
        weekEnd: new Date(weekEnd),
        label: weekStart.toISOString().slice(0, 10),
      });
    }

    // Deduplicate weeks by label
    const uniqueWeeks = weeks.filter(
      (w, i, arr) => arr.findIndex((x) => x.label === w.label) === i
    );

    // Fetch all posts linked to services in last 8 weeks
    const heatmapPosts = await prisma.marketingPostService.findMany({
      where: {
        post: {
          deleted: false,
          createdAt: { gte: eightWeeksAgo },
        },
        service: { status: "active" },
      },
      select: {
        serviceId: true,
        post: {
          select: { createdAt: true },
        },
      },
    });

    const weeklyHeatmap = activeServices.map((svc) => {
      const svcPosts = heatmapPosts.filter((hp) => hp.serviceId === svc.id);

      const weekData = uniqueWeeks.map((w) => {
        const count = svcPosts.filter((hp) => {
          const created = new Date(hp.post.createdAt);
          return created >= w.weekStart && created <= w.weekEnd;
        }).length;

        return { weekStart: w.label, postCount: count };
      });

      return {
        serviceId: svc.id,
        serviceName: svc.name,
        serviceCode: svc.code,
        weeks: weekData,
      };
    });

    response.centreBreakdown = centreBreakdown;
    response.weeklyHeatmap = weeklyHeatmap;
  }

  return NextResponse.json(response);
}, { roles: ["owner", "head_office", "admin", "marketing"] });
