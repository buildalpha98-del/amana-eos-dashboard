import { NextResponse } from "next/server";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-error";

const ORG_WIDE_ROLES = new Set(["owner", "head_office"]);

// ---------------------------------------------------------------------------
// DELETE — staff moderates (deletes any comment on their service's posts)
// ---------------------------------------------------------------------------

export const DELETE = withApiAuth(
  async (_req, session, context) => {
    const { id: serviceId, postId, commentId } = (await context!.params!) as {
      id: string;
      postId: string;
      commentId: string;
    };

    if (
      !ORG_WIDE_ROLES.has(session.user.role) &&
      session.user.serviceId !== serviceId
    ) {
      throw ApiError.forbidden("You do not have access to this service");
    }

    const comment = await prisma.parentPostComment.findUnique({
      where: { id: commentId },
      select: {
        id: true,
        postId: true,
        post: { select: { serviceId: true } },
      },
    });
    if (!comment) throw ApiError.notFound("Comment not found");
    if (comment.postId !== postId) {
      throw ApiError.notFound("Comment does not belong to this post");
    }
    if (comment.post.serviceId !== serviceId) {
      throw ApiError.notFound("Comment does not belong to this service");
    }

    await prisma.parentPostComment.delete({ where: { id: commentId } });
    return NextResponse.json({ deleted: true });
  },
  { roles: ["owner", "head_office", "admin", "member"] },
);
