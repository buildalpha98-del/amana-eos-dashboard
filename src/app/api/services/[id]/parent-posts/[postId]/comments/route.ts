import { NextResponse } from "next/server";
import { z } from "zod";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import { ApiError, parseJsonBody } from "@/lib/api-error";

const ORG_WIDE_ROLES = new Set(["owner", "head_office"]);

const createBodySchema = z.object({
  body: z.string().trim().min(1).max(2000),
});

// ---------------------------------------------------------------------------
// POST — staff replies to a comment thread on one of their service's posts
// ---------------------------------------------------------------------------

export const POST = withApiAuth(
  async (req, session, context) => {
    const { id: serviceId, postId } = (await context!.params!) as {
      id: string;
      postId: string;
    };

    if (
      !ORG_WIDE_ROLES.has(session.user.role) &&
      session.user.serviceId !== serviceId
    ) {
      throw ApiError.forbidden("You do not have access to this service");
    }

    const post = await prisma.parentPost.findUnique({
      where: { id: postId },
      select: { id: true, serviceId: true },
    });
    if (!post) throw ApiError.notFound("Post not found");
    if (post.serviceId !== serviceId) {
      throw ApiError.notFound("Post does not belong to this service");
    }

    const parsed = createBodySchema.safeParse(await parseJsonBody(req));
    if (!parsed.success) {
      throw ApiError.badRequest("Invalid body", parsed.error.flatten());
    }

    const row = await prisma.parentPostComment.create({
      data: {
        postId,
        staffAuthorId: session.user.id,
        body: parsed.data.body,
      },
      include: {
        staffAuthor: { select: { name: true } },
      },
    });

    const name = row.staffAuthor?.name ?? "Centre";
    const [first, ...rest] = name.split(" ");
    const last = rest.join(" ");
    return NextResponse.json(
      {
        id: row.id,
        body: row.body,
        createdAt: row.createdAt.toISOString(),
        authorName: last ? `${first} ${last.charAt(0)}.` : first || "Centre",
        authorType: "staff" as const,
      },
      { status: 201 },
    );
  },
  { roles: ["owner", "head_office", "admin", "coordinator"] },
);
