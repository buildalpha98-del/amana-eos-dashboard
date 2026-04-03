import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { parseJsonBody, ApiError } from "@/lib/api-error";
import { updateParentPostSchema } from "@/lib/schemas/parent-post";

/** Org-wide roles that can access any service. */
const ORG_WIDE_ROLES = new Set(["owner", "head_office"]);

// PATCH /api/services/[id]/parent-posts/[postId]
export const PATCH = withApiAuth(
  async (req, session, context) => {
    const params = await context!.params!;
    const serviceId = params.id;
    const postId = params.postId;

    // Service-membership check
    if (
      !ORG_WIDE_ROLES.has(session.user.role) &&
      session.user.serviceId !== serviceId
    ) {
      throw ApiError.forbidden("You do not have access to this service");
    }

    const body = await parseJsonBody(req);
    const parsed = updateParentPostSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const { childIds, ...data } = parsed.data;

    const post = await prisma.$transaction(async (tx) => {
      // Verify post exists and belongs to this service
      const existing = await tx.parentPost.findUnique({
        where: { id: postId },
        select: { id: true, serviceId: true, authorId: true },
      });

      if (!existing || existing.serviceId !== serviceId) {
        throw ApiError.notFound("Post not found");
      }

      // Only the author or org-wide roles can edit
      if (
        !ORG_WIDE_ROLES.has(session.user.role) &&
        existing.authorId !== session.user.id
      ) {
        throw ApiError.forbidden("Only the author or admin can edit this post");
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

      return updated;
    });

    return NextResponse.json(post);
  },
  { roles: ["owner", "head_office", "admin", "coordinator", "member"] },
);

// DELETE /api/services/[id]/parent-posts/[postId]
export const DELETE = withApiAuth(
  async (_req, session, context) => {
    const params = await context!.params!;
    const serviceId = params.id;
    const postId = params.postId;

    // Service-membership check
    if (
      !ORG_WIDE_ROLES.has(session.user.role) &&
      session.user.serviceId !== serviceId
    ) {
      throw ApiError.forbidden("You do not have access to this service");
    }

    // Verify post exists, belongs to service, and user has permission
    const existing = await prisma.parentPost.findUnique({
      where: { id: postId },
      select: { id: true, serviceId: true, authorId: true, title: true },
    });

    if (!existing || existing.serviceId !== serviceId) {
      throw ApiError.notFound("Post not found");
    }

    // Only the author or org-wide roles can delete
    if (
      !ORG_WIDE_ROLES.has(session.user.role) &&
      existing.authorId !== session.user.id
    ) {
      throw ApiError.forbidden("Only the author or admin can delete this post");
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
  { roles: ["owner", "head_office", "admin", "coordinator", "member"] },
);
