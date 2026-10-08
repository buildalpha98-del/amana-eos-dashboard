import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { parseJsonBody, ApiError } from "@/lib/api-error";
import { updateParentPostSchema } from "@/lib/schemas/parent-post";
import { notifyPostPublished } from "@/lib/notifications/posts";
import { notifyParentNewPost } from "@/lib/parent-notifications";
import { canAccessService } from "@/lib/authz-scope";
import { canPublishAtService } from "@/lib/post-publish";
import { logger } from "@/lib/logger";

/**
 * Who may touch a post (2026-10-08):
 *  - a PUBLISHER (Director, the office, or anyone with the `posts.publish`
 *    tick — see canPublishAtService) may edit,
 *    release and delete any post at the centre. That is what makes them
 *    the approver: an educator's draft is theirs to release.
 *  - an author who can't publish (educators) may edit and delete their
 *    OWN post while it is still a draft. Once families can see it,
 *    changing it is the Director's call.
 * A non-publisher asking for "published" keeps the post a draft, the same
 * as on create — re-saving a draft must never be a way round approval.
 */

// PATCH /api/services/[id]/parent-posts/[postId]
export const PATCH = withApiAuth(
  async (req, session, context) => {
    const params = await context!.params!;
    const serviceId = params.id;
    const postId = params.postId;

    if (!canAccessService(session, serviceId)) {
      throw ApiError.forbidden("You do not have access to this service");
    }
    const canPublish = await canPublishAtService(session, serviceId);

    const body = await parseJsonBody(req);
    const parsed = updateParentPostSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const { childIds, ...data } = parsed.data;
    if (!canPublish && data.status && data.status !== "draft") {
      data.status = "draft";
      delete (data as { publishAt?: unknown }).publishAt;
    }

    const post = await prisma.$transaction(async (tx) => {
      // Verify post exists and belongs to this service
      const existing = await tx.parentPost.findUnique({
        where: { id: postId },
        select: { id: true, serviceId: true, authorId: true, status: true },
      });

      if (!existing || existing.serviceId !== serviceId) {
        throw ApiError.notFound("Post not found");
      }

      if (!canPublish) {
        if (existing.authorId !== session.user.id) {
          throw ApiError.forbidden("Only the author or the Coordinator can edit this post");
        }
        if (existing.status !== "draft") {
          throw ApiError.forbidden(
            "This post is already out to families — ask your Coordinator to change it.",
          );
        }
      }

      // If childIds provided, verify they belong to this service
      if (childIds && childIds.length > 0) {
        const validChildren = await tx.child.findMany({
          where: { id: { in: childIds }, serviceId },
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

      // If childIds provided, replace all tags
      if (childIds !== undefined) {
        await tx.parentPostChildTag.deleteMany({ where: { postId } });
        if (childIds.length > 0) {
          await tx.parentPostChildTag.createMany({
            data: childIds.map((childId) => ({ postId, childId })),
          });
        }
      }

      const updated = await tx.parentPost.update({
        where: { id: postId },
        data,
        include: {
          author: { select: { id: true, name: true, avatar: true } },
          tags: {
            include: {
              child: { select: { id: true, firstName: true, surname: true } },
            },
          },
        },
      });

      await tx.activityLog.create({
        data: {
          userId: session.user.id,
          action: "updated_parent_post",
          entityType: "ParentPost",
          entityId: postId,
          details: { serviceId, changes: Object.keys(data) },
        },
      });

      return { ...updated, _wasDraft: existing.status !== "published" };
    });

    // Publishing an existing draft is the same moment as creating a
    // published post — the families haven't seen it either way. Only on
    // the TRANSITION: re-saving an already-published post must not
    // notify the whole centre a second time.
    if (post.status === "published" && post._wasDraft) {
      notifyPostPublished(post.id).catch(() => {});
      // Tagged children's families get their personal nudge now — it was
      // held back while the post was a draft.
      const taggedIds = post.tags.map((t) => t.child.id);
      if (taggedIds.length > 0) {
        notifyParentNewPost(post.id, post.title, post.type, taggedIds).catch((err) =>
          logger.error("Post notification failed", { postId: post.id, err }),
        );
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { _wasDraft, ...responsePost } = post;

    return NextResponse.json(responsePost);
  },
  { roles: ["owner", "head_office", "admin", "member", "staff"] },
);

// DELETE /api/services/[id]/parent-posts/[postId]
export const DELETE = withApiAuth(
  async (_req, session, context) => {
    const params = await context!.params!;
    const serviceId = params.id;
    const postId = params.postId;

    if (!canAccessService(session, serviceId)) {
      throw ApiError.forbidden("You do not have access to this service");
    }
    const canPublish = await canPublishAtService(session, serviceId);

    // Verify post exists, belongs to service, and user has permission
    const existing = await prisma.parentPost.findUnique({
      where: { id: postId },
      select: { id: true, serviceId: true, authorId: true, title: true, status: true },
    });

    if (!existing || existing.serviceId !== serviceId) {
      throw ApiError.notFound("Post not found");
    }

    // Publishers may delete any post here; others only their own draft.
    if (!canPublish && (existing.authorId !== session.user.id || existing.status !== "draft")) {
      throw ApiError.forbidden("Only the author or the Coordinator can delete this post");
    }

    // Cascade deletes tags via onDelete: Cascade in schema
    await prisma.parentPost.delete({ where: { id: postId } });

    await prisma.activityLog.create({
      data: {
        userId: session.user.id,
        action: "deleted_parent_post",
        entityType: "ParentPost",
        entityId: postId,
        details: { serviceId, title: existing.title },
      },
    });

    return NextResponse.json({ success: true });
  },
  { roles: ["owner", "head_office", "admin", "member", "staff"] },
);
