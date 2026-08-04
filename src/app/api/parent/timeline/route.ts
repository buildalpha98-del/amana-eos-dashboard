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
  /**
   * Narrow the feed to one child's tagged posts — "Abdul's moments".
   *
   * Validated against the parent's own children below rather than
   * trusted: an arbitrary childId here would otherwise read another
   * family's tagged posts.
   */
  const requestedChildId = url.searchParams.get("childId");
  const onlyChildId =
    requestedChildId && childIds.includes(requestedChildId)
      ? requestedChildId
      : null;
  if (requestedChildId && !onlyChildId) {
    // Asked for a child that isn't theirs — empty, not someone else's.
    return NextResponse.json({ items: [], nextCursor: undefined });
  }

  // Every published post for the family's centre(s).
  //
  // 2026-08-04: the old query also required `isCommunity` OR a tag
  // matching one of this family's children, which meant an untagged
  // observation reached nobody and a tagged one quietly became private.
  // Tagging now decides which child's page a post appears on, NOT who
  // can see it — everyone at a centre sees that centre's posts, and the
  // per-child view is a filter on top rather than a permission.
  //
  // Cross-service leaks are prevented by serviceId scoping alone, which
  // is the check that was actually doing that work all along.
  const posts = await prisma.parentPost.findMany({
    where: {
      serviceId: { in: serviceIds }, // Always scope to parent's services
      // Drafts are never visible, and a scheduled post only becomes
      // visible once publishAt has passed. Evaluated here rather than by
      // a cron flipping a flag — a cron that fails means a scheduled post
      // silently never appears, whereas this comparison can't drift.
      status: { not: "draft" },
      AND: [
        {
          OR: [{ publishAt: null }, { publishAt: { lte: new Date() } }],
        },
      ],
      ...(onlyChildId ? { tags: { some: { childId: onlyChildId } } } : {}),
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
      _count: { select: { likes: true, comments: true } },
    },
  });

  const hasMore = posts.length > limit;
  const raw = hasMore ? posts.slice(0, limit) : posts;
  const nextCursor = hasMore ? raw[raw.length - 1]?.id : undefined;

  // Determine which of these posts this parent has already liked. A parent has
  // one CentreContact per service — resolve all of them up-front, then check
  // ParentPostLike membership per post.
  const contacts = serviceIds.length
    ? await prisma.centreContact.findMany({
        where: { email: parent.email.toLowerCase(), serviceId: { in: serviceIds } },
        select: { id: true, serviceId: true },
      })
    : [];
  const contactIds = contacts.map((c) => c.id);
  const likes = contactIds.length
    ? await prisma.parentPostLike.findMany({
        where: {
          likerId: { in: contactIds },
          postId: { in: raw.map((p) => p.id) },
        },
        select: { postId: true },
      })
    : [];
  const likedPostIds = new Set(likes.map((l) => l.postId));

  const items = raw.map((p) => {
    const { _count, ...rest } = p;
    return {
      ...rest,
      likeCount: _count.likes,
      commentCount: _count.comments,
      likedByMe: likedPostIds.has(p.id),
    };
  });

  return NextResponse.json({ items, nextCursor });
});
