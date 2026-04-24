import { NextResponse } from "next/server";
import { withParentAuth } from "@/lib/parent-auth";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-error";

/**
 * GET /api/parent/children/[id]/observations
 *
 * Returns observations for this child that are marked `visibleToParent=true`.
 * Parent must be enrolled-linked to the child (same check used by the gallery
 * endpoint).
 */
export const GET = withParentAuth(async (_req, ctx) => {
  const params = await ctx.params;
  const childId = params?.id;
  if (!childId) throw ApiError.badRequest("Child ID is required");

  const child = await prisma.child.findUnique({
    where: { id: childId },
    select: { id: true, enrolmentId: true, serviceId: true },
  });
  if (!child) throw ApiError.notFound("Child not found");
  if (!child.enrolmentId || !ctx.parent.enrolmentIds.includes(child.enrolmentId)) {
    throw ApiError.forbidden("You do not have access to this child");
  }

  const observations = await prisma.learningObservation.findMany({
    where: { childId, visibleToParent: true },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      title: true,
      narrative: true,
      mtopOutcomes: true,
      interests: true,
      mediaUrls: true,
      createdAt: true,
      author: { select: { name: true } },
    },
  });

  return NextResponse.json({ items: observations });
});
