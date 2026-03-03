import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";

// GET /api/marketing/overview — aggregated marketing stats
export async function GET(req: NextRequest) {
  const { error } = await requireAuth(["owner", "admin"]);
  if (error) return error;

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

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
      where: { deleted: false },
    }),

    // Total non-deleted campaigns
    prisma.marketingCampaign.count({
      where: { deleted: false },
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
      },
    }),

    // Active campaigns count
    prisma.marketingCampaign.count({
      where: {
        deleted: false,
        status: "active",
      },
    }),

    // Next 5 upcoming posts
    prisma.marketingPost.findMany({
      where: {
        deleted: false,
        status: { not: "published" },
        scheduledDate: { gte: now },
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

  return NextResponse.json({
    totalPosts,
    totalCampaigns,
    publishedThisMonth,
    activeCampaigns,
    upcomingPosts,
    activeCampaignsList,
  });
}
