import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { parseJsonBody, ApiError } from "@/lib/api-error";
import { createParentPostSchema } from "@/lib/schemas/parent-post";
import { safeLimit } from "@/lib/pagination";
import { notifyParentNewPost } from "@/lib/parent-notifications";
import { logger } from "@/lib/logger";

/** Org-wide roles that can access any service. */
const ORG_WIDE_ROLES = new Set(["owner", "head_office"]);

// GET /api/services/[id]/parent-posts?cursor=...&limit=...
export const GET = withApiAuth(async (req, session, context) => {
  const { id } = await context!.params!;

  // Service-membership check: org-wide roles bypass, others must match serviceId
  if (
    !ORG_WIDE_ROLES.has(session.user.role) &&
    session.user.serviceId !== id
  ) {
    throw ApiError.forbidden("You do not have access to this service");
  }

  const url = new URL(req.url);
  const cursor = url.searchParams.get("cursor") ?? undefined;
  const limit = safeLimit(url.searchParams.get("limit"), 20, 50);

  const posts = await prisma.parentPost.findMany({
    where: { serviceId: id },
    orderBy: { createdAt: "desc" },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    include: {
      author: { select: { id: true, name: true, avatar: true } },
      tags: {
        include: {
          child: { select: { id: true, firstName: true, surname: true } },
        },
      },
      _count: { select: { likes: true, comments: true } },
    },
  });

  const hasMore = posts.length > limit;
  const items = (hasMore ? posts.slice(0, limit) : posts).map((p) => {
    const { _count, ...rest } = p;
    return { ...rest, likeCount: _count.likes, commentCount: _count.comments };
  });
  const nextCursor = hasMore ? items[items.length - 1]?.id : undefined;

  return NextResponse.json({ items, nextCursor });
});

// POST /api/services/[id]/parent-posts
export const POST = withApiAuth(
  async (req, session, context) => {
    const { id } = await context!.params!;

    // Service-membership check
    if (
      !ORG_WIDE_ROLES.has(session.user.role) &&
      session.user.serviceId !== id
    ) {
      throw ApiError.forbidden("You do not have access to this service");
    }

    const body = await parseJsonBody(req);

    const parsed = createParentPostSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const { childIds, publishAt, ...rest } = parsed.data;

    /**
     * Educators can WRITE a post but not publish one.
     *
     * They're the ones in the room when something worth photographing
     * happens, and routing every post through the Director is how a feed
     * goes quiet. But a post is a photo of somebody's child going out to
     * every family at the centre, and that deserves a second pair of
     * eyes. Their posts land as drafts for the Director to release.
     */
    const educatorOnly = session.user.role === "staff";
    const status = educatorOnly ? "draft" : rest.status;

    // A post scheduled for a time already past is just a published post —
    // treat it as one rather than leaving it in a state that looks
    // pending forever.
    const at = publishAt ? new Date(publishAt) : null;
    const effectiveStatus =
      status === "scheduled" && (!at || at.getTime() <= Date.now())
        ? "published"
        : status;

    const data = {
      ...rest,
      status: effectiveStatus,
      publishAt: effectiveStatus === "scheduled" ? at : null,
    };

    // 2026-08-04: the "non-community posts must tag a child" check is
    // gone. Tagging no longer decides who can SEE a post — every family
    // at the centre sees every published post, and tags decide which
    // child's page it also appears on. An untagged post is an ordinary
    // centre-wide update, not an error.

    // Atomic: verify service + verify children + create post + log activity
    const post = await prisma.$transaction(async (tx) => {
      // 1. Verify service exists
      const service = await tx.service.findUnique({
        where: { id },
        select: { id: true },
      });
      if (!service) {
        throw ApiError.notFound("Service not found");
      }

      // 2. Verify all tagged children belong to this service
      if (childIds.length > 0) {
        const validChildren = await tx.child.findMany({
          where: { id: { in: childIds }, serviceId: id },
          select: { id: true },
        });
        const validIds = new Set(validChildren.map((c) => c.id));
        const invalid = childIds.filter((cid) => !validIds.has(cid));
        if (invalid.length > 0) {
          throw ApiError.badRequest(
            `${invalid.length} child ID(s) do not belong to this service`,
          );
        }
      }

      // 3. Create post + tags atomically
      const created = await tx.parentPost.create({
        data: {
          ...data,
          serviceId: id,
          authorId: session.user.id,
          tags: childIds.length > 0
            ? { create: childIds.map((childId) => ({ childId })) }
            : undefined,
        },
        include: {
          author: { select: { id: true, name: true, avatar: true } },
          tags: {
            include: {
              child: { select: { id: true, firstName: true, surname: true } },
            },
          },
        },
      });

      // 4. Activity log
      await tx.activityLog.create({
        data: {
          userId: session.user.id,
          action: "created_parent_post",
          entityType: "ParentPost",
          entityId: created.id,
          details: {
            title: data.title,
            type: data.type,
            isCommunity: data.isCommunity,
            taggedChildren: childIds.length,
            serviceId: id,
          },
        },
      });

      return created;
    });

    // Fire-and-forget: notify parents of tagged children
    if (childIds.length > 0) {
      notifyParentNewPost(post.id, data.title, data.type, childIds).catch((err) =>
        logger.error("Post notification failed", { postId: post.id, err }),
      );
    }

    // ── NOTIFICATION HOOK (next phase) ───────────────────────────────
    // When a post becomes visible — effectiveStatus === "published" — fan
    // out to the centre's families: a ParentNotification row each (see
    // createInAppNotification in src/lib/parent-notifications.ts), a web
    // push where subscribed, and an optional daily digest email.
    //
    // Deliberately NOT built here. A post reaching every family at a
    // centre is the highest-volume notification we'd have, so it needs
    // batching and a per-family frequency preference first — sending one
    // push per post would train families to turn them off.

    return NextResponse.json(post, { status: 201 });
  },
  { roles: ["owner", "head_office", "admin", "member"] },
);
