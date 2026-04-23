import { NextResponse } from "next/server";
import { withParentAuth } from "@/lib/parent-auth";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-error";
import { canParentAccessPost } from "@/lib/parent-post-visibility";
import { resolveParentContactForService } from "@/lib/parent-contact";

async function resolveContactOrThrow(
  parent: Parameters<typeof canParentAccessPost>[0],
  postId: string,
) {
  const access = await canParentAccessPost(parent, postId);
  if (!access.post) throw ApiError.notFound("Post not found");
  if (!access.allowed) throw ApiError.forbidden("No access to this post");
  const contact = await resolveParentContactForService(parent, access.post.serviceId);
  if (!contact) throw ApiError.forbidden("No contact record for this service");
  return { post: access.post, contact };
}

// ---------------------------------------------------------------------------
// POST — idempotent upsert (create if not exists)
// ---------------------------------------------------------------------------

export const POST = withParentAuth(async (_req, { parent, params }) => {
  const { postId } = (await params) as { postId: string };
  const { contact } = await resolveContactOrThrow(parent, postId);

  await prisma.parentPostLike.upsert({
    where: { postId_likerId: { postId, likerId: contact.id } },
    create: { postId, likerId: contact.id },
    update: {},
  });
  const likeCount = await prisma.parentPostLike.count({ where: { postId } });
  return NextResponse.json({ liked: true, likeCount });
});

// ---------------------------------------------------------------------------
// DELETE — idempotent
// ---------------------------------------------------------------------------

export const DELETE = withParentAuth(async (_req, { parent, params }) => {
  const { postId } = (await params) as { postId: string };
  const { contact } = await resolveContactOrThrow(parent, postId);

  await prisma.parentPostLike.deleteMany({
    where: { postId, likerId: contact.id },
  });
  const likeCount = await prisma.parentPostLike.count({ where: { postId } });
  return NextResponse.json({ liked: false, likeCount });
});
