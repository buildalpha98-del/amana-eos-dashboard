import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";

// GET /api/marketing/coverage — centre content coverage report
export async function GET(req: NextRequest) {
  const { error } = await requireAuth(["owner", "head_office", "admin"]);
  if (error) return error;

  const now = new Date();
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const sixtyDaysAgo = new Date(now);
  sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);

  // Fetch all active services
  const activeServices = await prisma.service.findMany({
    where: { status: "active" },
    select: { id: true, name: true, code: true },
  });

  // For each service, gather stats
  const centres = await Promise.all(
    activeServices.map(async (svc) => {
      const [totalPosts, postsThisMonth, postsLastMonth, activeCampaigns, lastPost] =
        await Promise.all([
          // Total posts linked to this service
          prisma.marketingPostService.count({
            where: {
              serviceId: svc.id,
              post: { deleted: false },
            },
          }),

          // Posts this month
          prisma.marketingPostService.count({
            where: {
              serviceId: svc.id,
              post: {
                deleted: false,
                createdAt: { gte: startOfMonth },
              },
            },
          }),

          // Posts last month
          prisma.marketingPostService.count({
            where: {
              serviceId: svc.id,
              post: {
                deleted: false,
                createdAt: {
                  gte: startOfLastMonth,
                  lte: endOfLastMonth,
                },
              },
            },
          }),

          // Active campaigns linked to this service
          prisma.marketingCampaignService.count({
            where: {
              serviceId: svc.id,
              campaign: {
                deleted: false,
                status: "active",
              },
            },
          }),

          // Last post date
          prisma.marketingPostService.findFirst({
            where: {
              serviceId: svc.id,
              post: { deleted: false },
            },
            select: {
              post: { select: { createdAt: true } },
            },
            orderBy: {
              post: { createdAt: "desc" },
            },
          }),
        ]);

      const lastPostDate = lastPost?.post?.createdAt || null;

      // Derive status
      let status: "active" | "moderate" | "neglected";
      if (lastPostDate && lastPostDate >= thirtyDaysAgo) {
        status = "active";
      } else if (lastPostDate && lastPostDate >= sixtyDaysAgo) {
        status = "moderate";
      } else {
        status = "neglected";
      }

      return {
        serviceId: svc.id,
        serviceName: svc.name,
        serviceCode: svc.code,
        totalPosts,
        postsThisMonth,
        postsLastMonth,
        activeCampaigns,
        lastPostDate,
        status,
      };
    })
  );

  // Count global posts (posts with zero MarketingPostService entries)
  const globalPosts = await prisma.marketingPost.count({
    where: {
      deleted: false,
      services: { none: {} },
    },
  });

  const activeCentres = centres.filter((c) => c.status === "active").length;
  const moderateCentres = centres.filter((c) => c.status === "moderate").length;
  const neglectedCentres = centres.filter((c) => c.status === "neglected").length;

  return NextResponse.json({
    centres,
    summary: {
      totalCentres: centres.length,
      activeCentres,
      moderateCentres,
      neglectedCentres,
      globalPosts,
    },
  });
}
