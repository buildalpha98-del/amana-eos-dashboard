import { NextResponse } from "next/server";
import { withParentAuth } from "@/lib/parent-auth";
import { prisma } from "@/lib/prisma";
import { safeLimit } from "@/lib/pagination";

export const GET = withParentAuth(async (req, { parent }) => {
  if (parent.enrolmentIds.length === 0) {
    return NextResponse.json({ items: [] });
  }

  // Get the parent's serviceIds and childIds from their enrolments
  const enrolments = await prisma.enrolmentSubmission.findMany({
    where: { id: { in: parent.enrolmentIds }, status: { not: "draft" } },
    select: {
      serviceId: true,
      childRecords: { select: { id: true } },
    },
  });

  const serviceIds = [...new Set(enrolments.map((e) => e.serviceId).filter((s): s is string => !!s))];
  const childIds = enrolments.flatMap((e) => e.childRecords.map((c) => c.id));

  if (serviceIds.length === 0) {
    return NextResponse.json({ items: [] });
  }

  const url = new URL(req.url);
  const cursor = url.searchParams.get("cursor") ?? undefined;
  const limit = safeLimit(url.searchParams.get("limit"), 20, 50);

  // Fetch posts where:
  // a) isCommunity=true AND serviceId matches, OR
  // b) Post has a tag linking to one of the parent's children AND the post
  //    belongs to one of the parent's services (prevents cross-service leak)
  const posts = await prisma.parentPost.findMany({
    where: {
      serviceId: { in: serviceIds }, // Always scope to parent's services
      OR: [
        { isCommunity: true },
        ...(childIds.length > 0
          ? [{ tags: { some: { childId: { in: childIds } } } }]
          : []),
      ],
    },
    orderBy: { createdAt: "desc" },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    include: {
      author: { select: { id: true, name: true, avatar: true } },
      tags: {
        // Only show tags for the parent's own children (don't leak other children's names)
        where: childIds.length > 0 ? { childId: { in: childIds } } : { childId: "__none__" },
        include: {
          child: { select: { id: true, firstName: true, surname: true } },
        },
      },
    },
  });

  const hasMore = posts.length > limit;
  const items = hasMore ? posts.slice(0, limit) : posts;
  const nextCursor = hasMore ? items[items.length - 1]?.id : undefined;

  return NextResponse.json({ items, nextCursor });
});
