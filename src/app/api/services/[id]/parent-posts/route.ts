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
    },
  });

  const hasMore = posts.length > limit;
  const items = hasMore ? posts.slice(0, limit) : posts;
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

    const { childIds, ...data } = parsed.data;

    // If not a community post, at least one child must be tagged
    if (!data.isCommunity && childIds.length === 0) {
      return NextResponse.json(
        { error: "Non-community posts must tag at least one child" },
        { status: 400 },
      );
    }

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

    return NextResponse.json(post, { status: 201 });
  },
  { roles: ["owner", "head_office", "admin", "coordinator", "member"] },
);
