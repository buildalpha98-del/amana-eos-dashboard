import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";

// GET /api/marketing/overview — aggregated marketing stats
export async function GET(req: NextRequest) {
  const { error } = await requireAuth(["owner", "admin"]);
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const serviceId = searchParams.get("serviceId");

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

  const serviceFilter = serviceId
    ? { services: { some: { serviceId } } }
    : {};

  const [
    totalPosts,
    totalCampaigns,
    publishedThisMonth,
    activeCampaigns,
    upcomingPosts,
    activeCampaignsList,
  ] = await Promise.all([
    // Total non-deleted posts
    prisma.marketingPost.count({
      where: { deleted: false, ...serviceFilter },
    }),

    // Total non-deleted campaigns
    prisma.marketingCampaign.count({
      where: { deleted: false, ...serviceFilter },
    }),

    // Posts published this month
    prisma.marketingPost.count({
      where: {
        deleted: false,
        status: "published",
        scheduledDate: {
          gte: startOfMonth,
          lte: endOfMonth,
        },
        ...serviceFilter,
      },
    }),

    // Active campaigns count
    prisma.marketingCampaign.count({
      where: {
        deleted: false,
        status: "active",
        ...serviceFilter,
      },
    }),

    // Next 5 upcoming posts
    prisma.marketingPost.findMany({
      where: {
        deleted: false,
        status: { not: "published" },
        scheduledDate: { gte: now },
        ...serviceFilter,
      },
      include: {
        assignee: { select: { id: true, name: true, avatar: true } },
        campaign: { select: { id: true, name: true } },
      },
      orderBy: { scheduledDate: "asc" },
      take: 5,
    }),

    // Top 5 active campaigns with post counts
    prisma.marketingCampaign.findMany({
      where: {
        deleted: false,
        status: "active",
        ...serviceFilter,
      },
      include: {
        _count: {
          select: {
            posts: { where: { deleted: false } },
          },
        },
      },
      orderBy: { startDate: "desc" },
      take: 5,
    }),
  ]);

  const response: Record<string, unknown> = {
    totalPosts,
    totalCampaigns,
    publishedThisMonth,
    activeCampaigns,
    upcomingPosts,
    activeCampaignsList,
  };

  // When NOT filtered by service, add centre content stats
  if (!serviceId) {
    const [centresWithContent, totalActiveServices] = await Promise.all([
      // Count distinct services linked to at least one non-deleted post
      prisma.marketingPostService.findMany({
        where: {
          post: { deleted: false },
        },
        select: { serviceId: true },
        distinct: ["serviceId"],
      }),
      // Total active services
      prisma.service.count({
        where: { status: "active" },
      }),
    ]);

    response.centresWithContent = centresWithContent.length;
    response.centresWithoutContent = totalActiveServices - centresWithContent.length;
  }

  return NextResponse.json(response);
}
