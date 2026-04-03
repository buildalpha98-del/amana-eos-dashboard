import { NextResponse } from "next/server";
import { withParentAuth } from "@/lib/parent-auth";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-error";

/**
 * GET /api/parent/children/[id]/gallery
 *
 * Returns all ParentPosts tagged to this child that have media (photos).
 */
export const GET = withParentAuth(async (_req, ctx) => {
  const params = await ctx.params;
  const childId = params?.id;
  if (!childId) throw ApiError.badRequest("Child ID is required");

  // Verify this child belongs to the parent
  const child = await prisma.child.findUnique({
    where: { id: childId },
    select: { id: true, enrolmentId: true, serviceId: true },
  });

  if (!child) throw ApiError.notFound("Child not found");
  if (!child.enrolmentId || !ctx.parent.enrolmentIds.includes(child.enrolmentId)) {
    throw ApiError.forbidden("You do not have access to this child");
  }

  // Get parent's service IDs for scoping
  const enrolments = await prisma.enrolmentSubmission.findMany({
    where: { id: { in: ctx.parent.enrolmentIds }, status: { not: "draft" } },
    select: { serviceId: true },
  });
  const serviceIds = [...new Set(enrolments.map((e) => e.serviceId).filter((s): s is string => !!s))];

  // Fetch posts tagged to this child that have media AND belong to parent's services
  const posts = await prisma.parentPost.findMany({
    where: {
      serviceId: { in: serviceIds },
      tags: { some: { childId } },
      mediaUrls: { isEmpty: false },
    },
    select: {
      id: true,
      title: true,
      type: true,
      mediaUrls: true,
      createdAt: true,
      author: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  // Flatten into a gallery-friendly format
  const gallery = posts.flatMap((post) =>
    post.mediaUrls.map((url, i) => ({
      id: `${post.id}-${i}`,
      url,
      postTitle: post.title,
      postType: post.type,
      authorName: post.author?.name ?? "Centre",
      createdAt: post.createdAt,
    })),
  );

  return NextResponse.json(gallery);
});
