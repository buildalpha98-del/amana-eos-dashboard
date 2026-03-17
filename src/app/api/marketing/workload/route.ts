import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";

// GET /api/marketing/workload — per-centre workload stats
export async function GET(req: NextRequest) {
  const { error } = await requireAuth(["owner", "head_office", "admin", "marketing"]);
  if (error) return error;

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

  // Get all active services
  const services = await prisma.service.findMany({
    where: { status: "active" },
    select: { id: true, name: true, code: true, state: true },
    orderBy: { name: "asc" },
  });

  // Get posts-per-service this month (published)
  const publishedThisMonth = await prisma.marketingPostService.groupBy({
    by: ["serviceId"],
    where: {
      post: {
        deleted: false,
        status: "published",
        scheduledDate: { gte: startOfMonth, lte: endOfMonth },
      },
    },
    _count: { postId: true },
  });

  // Pending posts per service (in_review status)
  const pendingPosts = await prisma.marketingPostService.groupBy({
    by: ["serviceId"],
    where: {
      post: { deleted: false, status: "in_review" },
    },
    _count: { postId: true },
  });

  // Overdue tasks per service
  const overdueTasks = await prisma.marketingTask.groupBy({
    by: ["serviceId"],
    where: {
      deleted: false,
      status: { not: "done" },
      dueDate: { lt: now },
      serviceId: { not: null },
    },
    _count: { id: true },
  });

  // Open tasks per service
  const openTasks = await prisma.marketingTask.groupBy({
    by: ["serviceId"],
    where: {
      deleted: false,
      status: { not: "done" },
      serviceId: { not: null },
    },
    _count: { id: true },
  });

  // Draft posts per service
  const draftPosts = await prisma.marketingPostService.groupBy({
    by: ["serviceId"],
    where: {
      post: { deleted: false, status: "draft" },
    },
    _count: { postId: true },
  });

  // Build lookup maps
  const pubMap = new Map(publishedThisMonth.map((r) => [r.serviceId, r._count.postId]));
  const pendMap = new Map(pendingPosts.map((r) => [r.serviceId, r._count.postId]));
  const overdueMap = new Map(overdueTasks.map((r) => [r.serviceId as string, r._count.id]));
  const openMap = new Map(openTasks.map((r) => [r.serviceId as string, r._count.id]));
  const draftMap = new Map(draftPosts.map((r) => [r.serviceId, r._count.postId]));

  const centres = services.map((s) => ({
    id: s.id,
    name: s.name,
    code: s.code,
    state: s.state,
    publishedThisMonth: pubMap.get(s.id) || 0,
    pendingReview: pendMap.get(s.id) || 0,
    overdueTasks: overdueMap.get(s.id) || 0,
    openTasks: openMap.get(s.id) || 0,
    drafts: draftMap.get(s.id) || 0,
  }));

  return NextResponse.json({ centres });
}
